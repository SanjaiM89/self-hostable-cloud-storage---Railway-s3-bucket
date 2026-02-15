from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Body
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
def get_editor_config(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Generate OnlyOffice editor config with JWT token"""
    import jwt as pyjwt
    import os
    import socket
    
    file = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id
    ).first()
    
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Get presigned URL for the file
    file_url = generate_presigned_url(file.s3_key, expiration=7200)
    if not file_url:
        raise HTTPException(status_code=500, detail="Could not generate file URL")
    
    # Determine document type and file type
    ext = file.name.rsplit('.', 1)[-1].lower() if '.' in file.name else ''
    
    word_exts = ['doc', 'docx', 'odt', 'rtf', 'txt']
    cell_exts = ['xls', 'xlsx', 'ods', 'csv']
    slide_exts = ['ppt', 'pptx', 'odp']
    
    if ext in word_exts:
        doc_type = 'word'
    elif ext in cell_exts:
        doc_type = 'cell'
    elif ext in slide_exts:
        doc_type = 'slide'
    elif ext == 'pdf':
        doc_type = 'word'
    else:
        doc_type = 'word'
    
    # host.docker.internal resolves to the host machine from Docker bridge
    callback_url = "http://host.docker.internal:8000/files/onlyoffice/callback"
    
    onlyoffice_secret = os.getenv("ONLYOFFICE_JWT_SECRET", "supersecretjwtkeysupersecretjwtkey")
    
    # Build the config
    config = {
        "document": {
            "fileType": ext,
            "key": f"{file_id}-{int(file.created_at.timestamp()) if file.created_at else 0}",
            "title": file.name,
            "url": file_url,
            "permissions": {
                "comment": True,
                "download": True,
                "edit": True,
                "print": True,
                "review": True,
            },
        },
        "documentType": doc_type,
        "editorConfig": {
            "callbackUrl": callback_url,
            "mode": "edit",
            "user": {
                "id": str(current_user.id),
                "name": current_user.username,
            },
            "lang": "en",
            "customization": {
                "autosave": True,
                "compactHeader": False,
            },
        },
        "height": "100%",
        "width": "100%",
        "type": "desktop",
    }
    
    # Sign the entire config with the OnlyOffice JWT secret
    token = pyjwt.encode(config, onlyoffice_secret, algorithm="HS256")
    config["token"] = token
    
    return config


@router.post("/onlyoffice/callback")
async def onlyoffice_callback(body: dict = Body(...)):
    """Handle OnlyOffice save callbacks"""
    import requests as req
    from io import BytesIO
    
    status = body.get("status")
    
    # Status 2 = document is ready for saving
    # Status 6 = document is saved (force save)
    if status in [2, 6]:
        download_url = body.get("url")
        key = body.get("key")
        if download_url and key:
            try:
                # Extract file_id from the key (format: "file_id-timestamp")
                file_id = int(key.split("-")[0])
                
                # Download the edited file from OnlyOffice
                response = req.get(download_url)
                if response.status_code == 200:
                    from ..database import SessionLocal
                    from ..models import File as FileModel
                    
                    db = SessionLocal()
                    try:
                        file_record = db.query(FileModel).filter(FileModel.id == file_id).first()
                        if file_record and file_record.s3_key:
                            # Re-upload to S3
                            file_obj = BytesIO(response.content)
                            upload_file_to_s3(file_obj, file_record.s3_key)
                            file_record.size = len(response.content)
                            file_record.updated_at = datetime.datetime.utcnow()
                            db.commit()
                    finally:
                        db.close()
            except Exception as e:
                print(f"OnlyOffice callback error: {e}")
    
    # Must always return {"error": 0} to acknowledge
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
