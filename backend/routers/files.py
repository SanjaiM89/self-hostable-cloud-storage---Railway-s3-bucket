from fastapi.responses import JSONResponse, StreamingResponse
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Body, Request, BackgroundTasks
try:
    from ..utils.encryption import encrypt_id, decrypt_id
except ImportError:
    from utils.encryption import encrypt_id, decrypt_id
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_
from typing import List, Optional
try:
    from ..database import get_db
    from ..models import File as FileModel, User
    from ..auth.utils import decode_access_token
    from ..s3.client import upload_file_to_s3, generate_presigned_url, s3_client, BUCKET_NAME, TEMP_BUCKET_NAME
    from ..ws_manager import manager
except ImportError:
    from database import get_db
    from models import File as FileModel, User
    from auth.utils import decode_access_token
    from s3.client import upload_file_to_s3, generate_presigned_url, s3_client, BUCKET_NAME, TEMP_BUCKET_NAME
    from ws_manager import manager

from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
import uuid
import datetime
import os

TRASH_RETENTION_DAYS = 30

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


class BatchRequest(BaseModel):
    file_ids: List[int]
    target_parent_id: Optional[int] = None

@router.post("/batch/delete")
async def batch_delete(
    req: BatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Batch move to trash.
    """
    files = db.query(FileModel).filter(
        FileModel.id.in_(req.file_ids),
        FileModel.user_id == current_user.id,
        FileModel.is_trashed == False
    ).all()

    trashed_at = datetime.datetime.utcnow()
    affected_parents = set()

    for file in files:
        affected_parents.add(file.parent_id)
        _trash_item(file, current_user.username, trashed_at, db)
    
    db.commit()

    # Broadcast updates
    for pid in affected_parents:
        await manager.broadcast({"type": "refresh", "folder_id": pid})
    await manager.broadcast({"type": "refresh_trash"})

    return {"message": f"Moved {len(files)} items to trash"}

@router.post("/batch/move")
async def batch_move(
    req: BatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Batch move files/folders to a new parent.
    """
    files = db.query(FileModel).filter(
        FileModel.id.in_(req.file_ids),
        FileModel.user_id == current_user.id,
        FileModel.is_trashed == False
    ).all()

    source_parents = set()
    for file in files:
        # Prevent moving a folder into itself or its children
        if file.is_folder and req.target_parent_id:
             # This check is expensive if we do full tree traversal, 
             # but simple check: if target_parent_id is same as file.id, fail.
             if file.id == req.target_parent_id:
                 continue # Skip invalid move

        source_parents.add(file.parent_id)
        file.parent_id = req.target_parent_id
    
    db.commit()

    # Broadcast updates
    for pid in source_parents:
        await manager.broadcast({"type": "refresh", "folder_id": pid})
    await manager.broadcast({"type": "refresh", "folder_id": req.target_parent_id})

    return {"message": f"Moved {len(files)} items"}

@router.post("/batch/copy")
async def batch_copy(
    req: BatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Batch copy files/folders to a new parent.
    """
    files = db.query(FileModel).filter(
        FileModel.id.in_(req.file_ids),
        FileModel.user_id == current_user.id,
        FileModel.is_trashed == False
    ).all()

    count = 0
    for file in files:
        if file.id == req.target_parent_id:
            continue
        _copy_recursive(file, req.target_parent_id, current_user, db)
        count += 1
    
    db.commit()
    await manager.broadcast({"type": "refresh", "folder_id": req.target_parent_id})

    return {"message": f"Copied {count} items"}

def _copy_recursive(file: FileModel, target_parent_id: Optional[int], user: User, db: Session):
    # Create new file entry
    new_s3_key = None
    if not file.is_folder and file.s3_key:
        # Copy in S3
        file_ext = os.path.splitext(file.name)[1]
        new_key = f"{user.username}/{uuid.uuid4()}{file_ext}"
        try:
            s3_client.copy_object(
                Bucket=BUCKET_NAME,
                CopySource={"Bucket": BUCKET_NAME, "Key": file.s3_key},
                Key=new_key
            )
            new_s3_key = new_key
        except Exception as e:
            print(f"S3 Copy failed: {e}")
            return # Skip this file if S3 fails
            
    new_file = FileModel(
        name=file.name, # Should we handle name collision? "Copy of..."? For now, allow duplicate names
        s3_key=new_s3_key,
        size=file.size,
        mime_type=file.mime_type,
        is_folder=file.is_folder,
        parent_id=target_parent_id,
        user_id=user.id
    )
    db.add(new_file)
    db.flush() # Get ID

    if file.is_folder:
        children = db.query(FileModel).filter(
            FileModel.parent_id == file.id, 
            FileModel.is_trashed == False
        ).all()
        for child in children:
            _copy_recursive(child, new_file.id, user, db)


@router.get("/")
def list_files(
    parent_id: Optional[int] = Query(default=None),
    limit: Optional[int] = Query(default=None, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(FileModel).filter(
        FileModel.user_id == current_user.id,
        FileModel.is_trashed == False,
    )
    if parent_id is not None:
        query = query.filter(FileModel.parent_id == parent_id)
    else:
        query = query.filter(FileModel.parent_id == None)

    query = query.order_by(FileModel.is_folder.desc(), FileModel.created_at.desc())

    if limit is None:
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

    total = query.count()
    files = query.offset(offset).limit(limit).all()
    items = [
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
    return {
        "items": items,
        "total": total,
        "offset": offset,
        "limit": limit,
        "has_more": offset + len(items) < total,
    }


@router.get("/search")
def search_files(
    q: str = Query(default=""),
    parent_id: Optional[int] = Query(default=None),
    include_trashed: bool = Query(default=False),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(FileModel).filter(FileModel.user_id == current_user.id)
    query = query.filter(FileModel.is_trashed == include_trashed)

    if parent_id is not None:
        query = query.filter(FileModel.parent_id == parent_id)

    if q.strip():
        query = query.filter(FileModel.name.ilike(f"%{q.strip()}%"))

    query = query.order_by(FileModel.is_folder.desc(), FileModel.created_at.desc())
    total = query.count()
    rows = query.offset(offset).limit(limit).all()

    items = [
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
        for f in rows
    ]

    return {
        "items": items,
        "total": total,
        "offset": offset,
        "limit": limit,
        "has_more": offset + len(items) < total,
    }


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    parent_id: Optional[int] = Form(default=None),
    background_tasks: BackgroundTasks = BackgroundTasks(),
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
    
    # Broadcast update
    await manager.broadcast({"type": "refresh", "folder_id": parent_id})

    # Trigger Music/Video Analysis
    try:
        try:
            from backend.music.extraction import handle_video_upload
        except ImportError:
            from music.extraction import handle_video_upload
            
        background_tasks.add_task(handle_video_upload, new_file.id, db) 
    except Exception as e:
        print(f"Extraction trigger failed: {e}")

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
async def register_uploaded_file(
    data: FileRegister,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Register a file in the DB after it was uploaded directly to S3."""
    
    # Enforce Storage Limits
    if current_user.storage_limit and data.size > current_user.storage_limit:
         raise HTTPException(status_code=400, detail="File too large for your storage limit")

    # Calculate current usage
    total_used = db.query(func.sum(FileModel.size)).filter(
        FileModel.user_id == current_user.id,
        FileModel.is_trashed == False
    ).scalar() or 0
    
    if total_used + data.size > current_user.storage_limit:
        gb_limit = current_user.storage_limit / (1024 * 1024 * 1024)
        raise HTTPException(status_code=400, detail=f"Storage limit exceeded ({gb_limit:.2f} GB). Please upgrade your plan.")

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
    
    # Broadcast update
    await manager.broadcast({"type": "refresh", "folder_id": data.parent_id})

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


@router.get("/{file_id}/stream")
def stream_file(
    file_id: str,
    request: Request,
    redirect: bool = True,
    db: Session = Depends(get_db),
):
    """Stream file content (support for audio/video). Accepts int ID or encrypted string ID."""
    
    # Try to decrypt if it looks like an encrypted string
    actual_file_id = None
    if file_id.isdigit():
        actual_file_id = int(file_id)
    else:
        try:
            actual_file_id = decrypt_id(file_id)
        except:
             pass
    
    if actual_file_id is None:
         raise HTTPException(status_code=404, detail="File not found (Invalid ID)")

    # Auth Check: Try cookie or query param
    # Note: proper Auth dependency is hard for <audio> src without cookies.
    # We assume 'access_token' cookie is set, or we allow a query param 'token'.
    
    auth_header = request.headers.get("Authorization")
    token = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    elif request.query_params.get("token"):
        token = request.query_params.get("token")
    elif request.cookies.get("access_token"):
         token = request.cookies.get("access_token")
         # Remove 'Bearer ' prefix if present
         if token.startswith("Bearer "): token = token.split(" ")[1]
    
    if not token and redirect:
        # Fallback: Check if file is shared publicly? For now, strict.
        # ALLOW if it's a browser request relying on cookies (handled above)
        # If no token found at all:
        raise HTTPException(status_code=401, detail="Not authenticated")
        
    # Verify Token (Manual decode to avoid Dependency issues in stream)
    try:
        from ..auth.utils import decode_access_token
        payload = decode_access_token(token)
        username = payload.get("sub")
        user = db.query(User).filter(User.username == username).first()
        if not user: raise Exception()
    except:
         # Check import path if relative fails
        try:
            from auth.utils import decode_access_token
            payload = decode_access_token(token)
            username = payload.get("sub")
            user = db.query(User).filter(User.username == username).first()
        except:
            raise HTTPException(status_code=401, detail="Invalid token")

    file = db.query(FileModel).filter(
        FileModel.id == actual_file_id,
        FileModel.user_id == user.id,
    ).first()
    
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    # Generate Presigned URL and Redirect? 
    # Redirecting to S3 presigned URL is MUCH better for streaming/seeking support
    # than proxying through FastAPI.
    
    try:
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': BUCKET_NAME, 'Key': file.s3_key},
            ExpiresIn=3600
        )
        if redirect:
            from fastapi.responses import RedirectResponse
            return RedirectResponse(url=url)
        else:
            return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate stream URL: {e}")



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
async def create_folder(
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
    
    # Broadcast update
    await manager.broadcast({"type": "refresh", "folder_id": folder.parent_id})

    return {
        "id": new_folder.id,
        "name": new_folder.name,
        "is_folder": True,
        "parent_id": new_folder.parent_id,
    }


@router.get("/stream/{token}")
def stream_file(token: str, db: Session = Depends(get_db)):
    """Stream file from S3 through backend to hide bucket URL."""
    file_id = decrypt_id(token)
    if not file_id:
        # Prevent enumeration
        raise HTTPException(status_code=400, detail="Invalid link")

    file = db.query(FileModel).filter(FileModel.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        # Stream from S3
        s3_response = s3_client.get_object(Bucket=BUCKET_NAME, Key=file.s3_key)
        
        # Safe headers
        headers = {
            "Content-Disposition": f'attachment; filename="{file.name}"',
            "Content-Length": str(file.size),
        }
        
        return StreamingResponse(
            s3_response['Body'],
            media_type=file.mime_type or "application/octet-stream",
            headers=headers
        )
    except Exception as e:
        print(f"Stream error: {e}")
        raise HTTPException(status_code=500, detail="Could not stream file")


@router.get("/download/{file_id}")
def download_file(
    file_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a secure, encrypted download URL that proxies the file."""
    file = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id
    ).first()
    
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Encrypt the ID to hide it
    token = encrypt_id(file.id)
    
    # Construct absolute URL to the stream endpoint
    # base_url usually ends with /
    # Route is /api/files/{id}/stream
    proxy_url = f"{str(request.base_url).rstrip('/')}/api/files/{token}/stream"
    
    # Append auth token if available (for PDF viewer which might not send headers)
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        access_token = auth_header.split(" ")[1]
        proxy_url += f"?token={access_token}"
    
    return {
        "url": proxy_url,
        "filename": file.name,
        "mime_type": file.mime_type,
    }


@router.delete("/{file_id}")
async def delete_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    file = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id,
        FileModel.is_trashed == False,
    ).first()

    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    trashed_at = datetime.datetime.utcnow()
    _trash_item(file, current_user.username, trashed_at, db)
    db.commit()
    
    # Broadcast update (refresh current folder and trash)
    await manager.broadcast({"type": "refresh", "folder_id": file.parent_id})
    await manager.broadcast({"type": "refresh_trash"})

    return {"message": "Moved to trash"}


def _move_to_temp_bucket(s3_key: str, username: str):
    trash_key = f"trash/{username}/{uuid.uuid4()}-{os.path.basename(s3_key)}"
    try:
        s3_client.copy_object(
            Bucket=TEMP_BUCKET_NAME,
            CopySource={"Bucket": BUCKET_NAME, "Key": s3_key},
            Key=trash_key,
        )
    except Exception:
        # fallback to same bucket namespace
        trash_key = f"trash-temp/{username}/{uuid.uuid4()}-{os.path.basename(s3_key)}"
        s3_client.copy_object(
            Bucket=BUCKET_NAME,
            CopySource={"Bucket": BUCKET_NAME, "Key": s3_key},
            Key=trash_key,
        )
    try:
        s3_client.delete_object(Bucket=BUCKET_NAME, Key=s3_key)
    except Exception:
        pass
    return trash_key


def _trash_item(file: FileModel, username: str, trashed_at: datetime.datetime, db: Session):
    if file.is_folder:
        children = db.query(FileModel).filter(
            FileModel.parent_id == file.id,
            FileModel.user_id == file.user_id,
            FileModel.is_trashed == False,
        ).all()
        for child in children:
            _trash_item(child, username, trashed_at, db)

    if (not file.is_folder) and file.s3_key:
        try:
            file.s3_key = _move_to_temp_bucket(file.s3_key, username)
        except Exception:
            pass

    file.original_parent_id = file.parent_id
    file.parent_id = None
    file.is_trashed = True
    file.trashed_at = trashed_at


@router.get('/trash')
def list_trash(
    limit: Optional[int] = Query(default=None, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(FileModel).filter(
        FileModel.user_id == current_user.id,
        FileModel.is_trashed == True,
    ).order_by(FileModel.trashed_at.desc())

    if limit is None:
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
                "trashed_at": f.trashed_at.isoformat() if f.trashed_at else None,
            }
            for f in files
        ]

    total = query.count()
    files = query.offset(offset).limit(limit).all()
    items = [
        {
            "id": f.id,
            "name": f.name,
            "size": f.size,
            "mime_type": f.mime_type,
            "s3_key": f.s3_key,
            "is_folder": f.is_folder,
            "parent_id": f.parent_id,
            "created_at": f.created_at.isoformat() if f.created_at else None,
            "trashed_at": f.trashed_at.isoformat() if f.trashed_at else None,
        }
        for f in files
    ]
    return {"items": items, "total": total, "offset": offset, "limit": limit, "has_more": offset + len(items) < total}


@router.post('/trash/restore/{file_id}')
async def restore_from_trash(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    file = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id,
        FileModel.is_trashed == True,
    ).first()
    if not file:
        raise HTTPException(status_code=404, detail='File not found in trash')

    file.is_trashed = False
    file.parent_id = file.original_parent_id
    file.original_parent_id = None
    file.trashed_at = None
    db.commit()
    
    # Broadcast
    await manager.broadcast({"type": "refresh", "folder_id": file.parent_id})
    await manager.broadcast({"type": "refresh_trash"})

    return {'message': 'Restored'}


@router.delete('/trash/empty')
async def empty_trash(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = db.query(FileModel).filter(
        FileModel.user_id == current_user.id,
        FileModel.is_trashed == True,
    ).all()
    deleted = 0
    for item in items:
        if (not item.is_folder) and item.s3_key:
            try:
                s3_client.delete_object(Bucket=TEMP_BUCKET_NAME, Key=item.s3_key)
            except Exception:
                try:
                    s3_client.delete_object(Bucket=BUCKET_NAME, Key=item.s3_key)
                except Exception:
                    pass
        db.delete(item)
        deleted += 1
    db.commit()
    
    # Broadcast
    await manager.broadcast({"type": "refresh_trash"})

    return {"message": "Trash emptied", "deleted": deleted}


@router.patch("/{file_id}")
async def rename_file(
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
    
    # Broadcast
    await manager.broadcast({"type": "refresh", "folder_id": file.parent_id})

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
                                 from ..s3.client import upload_file_to_s3
                             except ImportError:
                                 from s3.client import upload_file_to_s3

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
    elif data.doc_type == "markdown":
        buf.write(f"# {data.name}\n\nStart writing here...\n".encode('utf-8'))
        ext = "md"
        mime = "text/markdown"
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
    total_size = db.query(func.sum(FileModel.size)).filter(
        FileModel.user_id == current_user.id,
        FileModel.is_trashed == False,
    ).scalar() or 0
    return {
        "used": total_size,
        "total": current_user.storage_limit or (2 * 1024 * 1024 * 1024)
    }
