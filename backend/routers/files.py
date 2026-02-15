from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Body, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List, Optional
try:
    from ..database import get_db
    from ..models import File as FileModel, User
    from ..auth.utils import decode_access_token
    from ..storage import upload_file_to_s3, generate_presigned_url, s3_client, BUCKET_NAME
except ImportError:
    from database import get_db
    from models import File as FileModel, User
    from auth.utils import decode_access_token
    from storage import upload_file_to_s3, generate_presigned_url, s3_client, BUCKET_NAME
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
import uuid
import datetime
import os

router = APIRouter(prefix="/files", tags=["files"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = decode_access_token(token)
        username = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = db.query(User).filter(User.username == username).first()
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


class FolderCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None

class FileRename(BaseModel):
    name: str


@router.get("/")
def list_files(
    parent_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(FileModel).filter(FileModel.user_id == current_user.id)
    if parent_id is not None:
        query = query.filter(FileModel.parent_id == parent_id)
    else:
        query = query.filter(FileModel.parent_id == None)
    
    files = query.all()
    return [
        {
            "id": f.id,
            "name": f.name,
            "size": f.size,
            "mime_type": f.mime_type,
            "s3_key": f.s3_key,
            "is_folder": f.is_folder,
            "parent_id": f.parent_id,
            "created_at": f.created_at.isoformat() if f.created_at else None,
        }
        for f in files
    ]


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    parent_id: Optional[int] = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    file_id = str(uuid.uuid4())
    s3_key = f"{current_user.username}/{file_id}-{file.filename}"
    
    # Read the file content to calculate size
    content = await file.read()
    file_size = len(content)
    
    # Reset for upload
    await file.seek(0)
    
    success = upload_file_to_s3(file.file, s3_key)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to upload to S3")
    
    new_file = FileModel(
        name=file.filename,
        s3_key=s3_key,
        size=file_size,
        mime_type=file.content_type,
        parent_id=parent_id,
        user_id=current_user.id,
        is_folder=False,
    )
    db.add(new_file)
    db.commit()
    db.refresh(new_file)
    
    return {
        "id": new_file.id,
        "name": new_file.name,
        "s3_key": new_file.s3_key,
        "size": new_file.size,
        "mime_type": new_file.mime_type,
    }


# ─── Presigned Upload URL (bypasses Vercel body limit) ───

class PresignedUploadRequest(BaseModel):
    filename: str
    content_type: str = "application/octet-stream"
    parent_id: Optional[int] = None

@router.post("/upload-url")
def get_upload_url(
    data: PresignedUploadRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a presigned PUT URL for direct S3 upload from browser."""
    file_id = str(uuid.uuid4())
    s3_key = f"{current_user.username}/{file_id}-{data.filename}"
    
    try:
        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': BUCKET_NAME,
                'Key': s3_key,
                'ContentType': data.content_type,
            },
            ExpiresIn=600,  # 10 minutes
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate upload URL: {str(e)}")
    
    return {
        "upload_url": presigned_url,
        "s3_key": s3_key,
        "filename": data.filename,
        "content_type": data.content_type,
    }


class FileRegister(BaseModel):
    filename: str
    s3_key: str
    size: int
    content_type: str = "application/octet-stream"
    parent_id: Optional[int] = None

@router.post("/register")
def register_uploaded_file(
    data: FileRegister,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Register a file in the DB after it was uploaded directly to S3."""
    new_file = FileModel(
        name=data.filename,
        s3_key=data.s3_key,
        size=data.size,
        mime_type=data.content_type,
        parent_id=data.parent_id,
        user_id=current_user.id,
        is_folder=False,
    )
    db.add(new_file)
    db.commit()
    db.refresh(new_file)
    
    return {
        "id": new_file.id,
        "name": new_file.name,
        "s3_key": new_file.s3_key,
        "size": new_file.size,
        "mime_type": new_file.mime_type,
    }


# ─── Raw file content (for Markdown editor) ───

from fastapi.responses import PlainTextResponse
import io

@router.get("/content/{file_id}")
def get_file_content(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get raw text content of a file from S3 (for Markdown editor)."""
    file = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id,
    ).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        obj = s3_client.get_object(Bucket=BUCKET_NAME, Key=file.s3_key)
        content = obj['Body'].read().decode('utf-8')
        return {"content": content, "name": file.name, "id": file.id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {str(e)}")


class ContentSave(BaseModel):
    content: str

@router.put("/content/{file_id}")
def save_file_content(
    file_id: int,
    data: ContentSave,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save raw text content to S3 (for Markdown editor)."""
    file = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id,
    ).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        content_bytes = data.content.encode('utf-8')
        s3_client.put_object(
            Bucket=BUCKET_NAME,
            Key=file.s3_key,
            Body=content_bytes,
            ContentType='text/markdown',
        )
        # Update file size
        file.size = len(content_bytes)
        db.commit()
        return {"status": "saved", "size": len(content_bytes)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")


@router.post("/folder")
def create_folder(
    folder: FolderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    new_folder = FileModel(
        name=folder.name,
        s3_key=None,
        size=0,
        mime_type=None,
        parent_id=folder.parent_id,
        user_id=current_user.id,
        is_folder=True,
    )
    db.add(new_folder)
    db.commit()
    db.refresh(new_folder)
    
    return {
        "id": new_folder.id,
        "name": new_folder.name,
        "is_folder": True,
        "parent_id": new_folder.parent_id,
    }


@router.get("/download/{file_id}")
def download_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    file = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id
    ).first()
    
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    
    url = generate_presigned_url(file.s3_key)
    if not url:
        raise HTTPException(status_code=500, detail="Could not generate download URL")
    
    return {
        "url": url,
        "filename": file.name,
        "mime_type": file.mime_type,
    }


@router.delete("/{file_id}")
def delete_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    file = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id
    ).first()
    
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Delete from S3 if it's a file
    if not file.is_folder and file.s3_key:
        try:
            s3_client.delete_object(Bucket=BUCKET_NAME, Key=file.s3_key)
        except Exception:
            pass
    
    # If it's a folder, also delete children recursively
    if file.is_folder:
        _delete_folder_contents(file.id, current_user.id, db)
    
    db.delete(file)
    db.commit()
    return {"message": "Deleted successfully"}


def _delete_folder_contents(folder_id, user_id, db):
    children = db.query(FileModel).filter(
        FileModel.parent_id == folder_id,
        FileModel.user_id == user_id
    ).all()
    
    for child in children:
        if child.is_folder:
            _delete_folder_contents(child.id, user_id, db)
        elif child.s3_key:
            try:
                s3_client.delete_object(Bucket=BUCKET_NAME, Key=child.s3_key)
            except Exception:
                pass
        db.delete(child)


@router.patch("/{file_id}")
def rename_file(
    file_id: int,
    data: FileRename,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    file = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id
    ).first()
    
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    
    file.name = data.name
    db.commit()
    db.refresh(file)
    return {"id": file.id, "name": file.name}


@router.get("/editor-config/{file_id}")
def get_editor_config(file_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Generate configuration for Self-Hosted OnlyOffice Document Server (JWT)"""
    # Fix import inside function
    try:
        from ..services.onlyoffice import OnlyOfficeService
    except ImportError:
        from services.onlyoffice import OnlyOfficeService
    import os
    
    try:
        # 1. Fetch File
        file = db.query(FileModel).filter(FileModel.id == file_id).first()
        if not file:
            raise HTTPException(status_code=404, detail="File not found")
        
        # 2. Check Permissions
        if file.user_id != current_user.id:
            # TODO: Add shared file logic here
            pass

        # 3. Generate Download URL (Presigned S3) - 1 hour expiry
        download_url = generate_presigned_url(file.s3_key, expiration=3600)
        if not download_url:
            raise HTTPException(status_code=500, detail="Could not generate download URL")
            
        # 4. Callback URL (Where OnlyOffice sends changes)
        # Using BACKEND_URL env var or defaulting to localhost/vercel
        # BACKEND_URL should be the public URL of the backend service (e.g. Vercel)
        backend_url = os.getenv("BACKEND_URL", "https://your-backend.vercel.app").strip().rstrip("/")
        # We use the EXISTING endpoint defined below: /files/onlyoffice/callback (since router prefix is /files)
        # Pass file_id in query just in case, but OnlyOffice mainly uses body 'key' and 'url'.
        # But we encode file_id in the 'key' too.
        # We can also pass ?token=... for strict auth, but we use JWT body validation mostly.
        callback_url = f"{backend_url}/files/onlyoffice/callback?file_id={file.id}&user_id={current_user.id}" 
        
        # 5. Generate Config & Token
        config = OnlyOfficeService.get_editor_config(file, current_user, download_url, callback_url)
        
        # Add OnlyOffice URL for Frontend script loading
        config["onlyoffice_url"] = os.getenv("ONLYOFFICE_URL", "https://your-render-app.onrender.com")
        
        return config

    except Exception as e:
        print(f"Error generating editor config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/onlyoffice/callback")
async def onlyoffice_callback(
    request: Request, 
    body: dict = Body(...)
):
    """
    Handle OnlyOffice save callbacks.
    Validates JWT and updates S3.
    """
    try:
        from ..services.onlyoffice import OnlyOfficeService
    except ImportError:
        from services.onlyoffice import OnlyOfficeService
        
    import requests as req
    from io import BytesIO
    
    # 1. Validate JWT
    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header:
        # Expected: "Bearer <token>"
        parts = auth_header.split()
        if len(parts) == 2:
            token = parts[1]
        else:
            token = auth_header # Fallback
    elif "token" in body:
        token = body["token"]
    
    if token:
        payload = OnlyOfficeService.decode_jwt(token)
        if not payload:
             print("DEBUG: Callback JWT Invalid")
             raise HTTPException(status_code=403, detail="Invalid JWT")
        # JWT Valid
    else:
        # If no token, check configuration. OnlyOffice Force Save sometimes omits token in header 
        # but usually sends it if secret is set.
        pass

    status = body.get("status")
    
    # Status 2 = Ready for saving, 6 = Force Save
    # We want to save on BOTH to keep S3 updated.
    if status == 2 or status == 6:
        download_url = body.get("url")
        key = body.get("key", "")
        
        # Extract file_id from key
        file_id = None
        if "-" in key:
             try:
                 # Key format: share-ID-TIMESTAMP or just ID-TIMESTAMP
                 parts = key.split("-")
                 if parts[0] == "share":
                     # Shared file: share-SHARE_ID-TIMESTAMP -> We need to look up file_id from share_id
                     # But wait, we don't have DB session here easily to look up share.
                     # Actually, let's just rely on the 'file_id' query param we added to callbackUrl!
                     pass
                 else:
                     file_id = int(parts[0])
             except:
                 pass

        # Use the file_id from query param if available (passed in callbackUrl)
        if not file_id:
            try:
                # request.query_params is available in FastAPI
                q_file_id = request.query_params.get("file_id")
                if q_file_id:
                    file_id = int(q_file_id)
            except:
                pass

        if download_url and file_id:
             print(f"DEBUG: Downloading edited file {file_id} from {download_url} (Status: {status})")
             try:
                 # Download the edited file from OnlyOffice
                 # verify=False because Render internal SSL might be valid but let's be safe
                 r = req.get(download_url, verify=False, timeout=60)
                 
                 if r.status_code == 200:
                     content = r.content
                     
                     # Save to S3
                     try:
                         from ..database import get_db, SessionLocal
                     except ImportError:
                         from database import get_db, SessionLocal
                         
                     db = SessionLocal()
                     
                     try:
                         file_record = db.query(FileModel).filter(FileModel.id == file_id).first()
                         
                         if file_record and file_record.s3_key:
                             # Update S3
                             from io import BytesIO
                             file_obj = BytesIO(content)
                             
                             # We can use upload_file_to_s3 which expects file-like object
                             # Need to import it
                             try:
                                 from ..storage import upload_file_to_s3
                             except ImportError:
                                 from storage import upload_file_to_s3

                             # Reset pointer
                             file_obj.seek(0)
                             success = upload_file_to_s3(file_obj, file_record.s3_key)
                             
                             if success:
                                 # Update size/time
                                 file_record.size = len(content)
                                 # file_record.updated_at = ... (auto updated by SQLA usually)
                                 db.commit()
                                 print(f"SUCCESS: File {file_id} updated in S3")
                                 return {"error": 0}
                             else:
                                 print(f"ERROR: Failed to upload to S3")
                                 return {"error": 1}
                         else:
                             print(f"ERROR: File record {file_id} not found or no s3_key")
                             return {"error": 1}
                     finally:
                         db.close()
                 else:
                     print(f"ERROR: Failed to download from OnlyOffice: {r.status_code}")
                     return {"error": 1}
             except Exception as e:
                 print(f"ERROR: Exception in callback: {e}")
                 return {"error": 1}
    
    # Return 0 for other statuses to keep OnlyOffice happy
                 print(f"ERROR: Callback Processing Exception: {e}")
                 return {"error": 1}

    return {"error": 0}


# ─── Folder tree (recursive) ───

def _build_tree(user_id: int, parent_id, db: Session):
    folders = db.query(FileModel).filter(
        FileModel.user_id == user_id,
        FileModel.is_folder == True,
        FileModel.parent_id == parent_id,
    ).order_by(FileModel.name).all()

    result = []
    for f in folders:
        result.append({
            "id": f.id,
            "name": f.name,
            "children": _build_tree(user_id, f.id, db),
        })
    return result


@router.get("/tree")
def get_folder_tree(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return recursive folder tree for the sidebar."""
    return _build_tree(current_user.id, None, db)


# ─── Folder preview (last 3 files) ───

@router.get("/folder-preview/{folder_id}")
def folder_preview(
    folder_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the last 3 files inside a folder (for hover preview)."""
    files = (
        db.query(FileModel)
        .filter(
            FileModel.user_id == current_user.id,
            FileModel.parent_id == folder_id,
            FileModel.is_folder == False,
        )
        .order_by(FileModel.created_at.desc())
        .limit(3)
        .all()
    )
    return [
        {"id": f.id, "name": f.name, "mime_type": f.mime_type, "size": f.size}
        for f in files
    ]


# ─── Create blank Office document ───

class DocumentCreate(BaseModel):
    name: str
    doc_type: str  # "writer" | "spreadsheet" | "presentation"
    parent_id: Optional[int] = None


@router.post("/create-document")
def create_document(
    data: DocumentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a blank .docx / .xlsx / .pptx and upload it to S3."""
    from io import BytesIO

    buf = BytesIO()
    if data.doc_type == "writer":
        from docx import Document
        doc = Document()
        doc.add_paragraph("")
        doc.save(buf)
        ext = "docx"
        mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    elif data.doc_type == "spreadsheet":
        from openpyxl import Workbook
        wb = Workbook()
        wb.save(buf)
        ext = "xlsx"
        mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    elif data.doc_type == "presentation":
        from pptx import Presentation
        prs = Presentation()
        prs.save(buf)
        ext = "pptx"
        mime = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    else:
        raise HTTPException(status_code=400, detail="Invalid doc_type")

    filename = f"{data.name}.{ext}" if not data.name.endswith(f".{ext}") else data.name
    file_uuid = str(uuid.uuid4())
    s3_key = f"{current_user.username}/{file_uuid}-{filename}"

    buf.seek(0)
    file_bytes = buf.getvalue()
    file_size = len(file_bytes)

    from io import BytesIO as _BIO
    upload_buf = _BIO(file_bytes)
    success = upload_file_to_s3(upload_buf, s3_key)
    if not success:
        raise HTTPException(status_code=500, detail="S3 upload failed")

    new_file = FileModel(
        name=filename,
        s3_key=s3_key,
        size=file_size,
        mime_type=mime,
        parent_id=data.parent_id,
        user_id=current_user.id,
        is_folder=False,
    )
    db.add(new_file)
    db.commit()
    db.refresh(new_file)

    return {
        "id": new_file.id,
        "name": new_file.name,
        "s3_key": new_file.s3_key,
        "size": new_file.size,
        "mime_type": new_file.mime_type,
        "parent_id": new_file.parent_id,
    }


# ─── Extract ZIP ───

@router.post("/extract/{file_id}")
def extract_zip(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download a ZIP from S3, extract it, and re-upload each entry."""
    import zipfile
    from io import BytesIO
    import requests as req

    file = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id,
    ).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    if file.is_folder:
        raise HTTPException(status_code=400, detail="Cannot extract a folder")

    ext = file.name.rsplit(".", 1)[-1].lower() if "." in file.name else ""
    if ext not in ("zip",):
        raise HTTPException(status_code=400, detail="Not a ZIP file")

    # Download from S3
    url = generate_presigned_url(file.s3_key, expiration=600)
    if not url:
        raise HTTPException(status_code=500, detail="Could not get download URL")

    resp = req.get(url)
    if resp.status_code != 200:
        raise HTTPException(status_code=500, detail="Failed to download ZIP")

    # Create a folder with the ZIP name (minus extension) in the same parent
    folder_name = file.name.rsplit(".", 1)[0]
    extract_folder = FileModel(
        name=folder_name,
        s3_key=None,
        size=0,
        mime_type=None,
        parent_id=file.parent_id,
        user_id=current_user.id,
        is_folder=True,
    )
    db.add(extract_folder)
    db.commit()
    db.refresh(extract_folder)

    extracted = []
    try:
        with zipfile.ZipFile(BytesIO(resp.content)) as zf:
            for info in zf.infolist():
                if info.is_dir():
                    continue
                entry_name = info.filename.split("/")[-1]
                if not entry_name:
                    continue
                data = zf.read(info.filename)
                file_uuid = str(uuid.uuid4())
                s3_key = f"{current_user.username}/{file_uuid}-{entry_name}"

                buf = BytesIO(data)
                success = upload_file_to_s3(buf, s3_key)
                if success:
                    new_file = FileModel(
                        name=entry_name,
                        s3_key=s3_key,
                        size=len(data),
                        mime_type=None,
                        parent_id=extract_folder.id,
                        user_id=current_user.id,
                        is_folder=False,
                    )
                    db.add(new_file)
                    extracted.append(entry_name)
                    
        db.commit()
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid ZIP file")

    return {
        "folder_id": extract_folder.id,
        "folder_name": extract_folder.name,
        "extracted_count": len(extracted),
        "files": extracted,
    }


# ─── Storage Usage ───

@router.get("/storage")
def get_storage_usage(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from sqlalchemy import func
    total_size = db.query(func.sum(FileModel.size)).filter(FileModel.user_id == current_user.id).scalar() or 0
    return {
        "used": total_size,
        "total": 2 * 1024 * 1024 * 1024  # 2 GB limit for now
    }
