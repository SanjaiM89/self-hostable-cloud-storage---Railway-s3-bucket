from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
import uuid
import os
import io
import zipfile
import datetime
import jwt as pyjwt

try:
    from ..database import get_db
    from ..models import File as FileModel, User, FileShare
    from ..auth.utils import decode_access_token
    from ..storage import generate_presigned_url, s3_client, BUCKET_NAME
except ImportError:
    from database import get_db
    from models import File as FileModel, User, FileShare
    from auth.utils import decode_access_token
    from storage import generate_presigned_url, s3_client, BUCKET_NAME
from fastapi.security import OAuth2PasswordBearer

router = APIRouter(prefix="/shares", tags=["shares"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = decode_access_token(token)
        username = payload.get("sub")
        user = db.query(User).filter(User.username == username).first()
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


# ─── Pydantic models ───

class ShareCreate(BaseModel):
    share_type: str          # "public" | "user"
    permission: str          # "view" | "download" | "edit"
    username: Optional[str] = None  # required when share_type == "user"


# ─── Create a share ───

@router.post("/{file_id}")
def create_share(
    file_id: int,
    data: ShareCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    file = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id,
    ).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    if data.share_type == "user":
        if not data.username:
            raise HTTPException(status_code=400, detail="Username required for user share")
        target_user = db.query(User).filter(User.username == data.username).first()
        if not target_user:
            raise HTTPException(status_code=404, detail="User not found")
        if target_user.id == current_user.id:
            raise HTTPException(status_code=400, detail="Cannot share with yourself")
        # Check for existing share with this user
        existing = db.query(FileShare).filter(
            FileShare.file_id == file_id,
            FileShare.shared_with_id == target_user.id,
        ).first()
        if existing:
            existing.permission = data.permission
            db.commit()
            db.refresh(existing)
            return {
                "id": existing.id,
                "share_token": existing.share_token,
                "share_type": existing.share_type,
                "permission": existing.permission,
                "shared_with": target_user.username,
                "created_at": str(existing.created_at),
            }
        share = FileShare(
            file_id=file_id,
            share_token=str(uuid.uuid4()),
            share_type="user",
            permission=data.permission,
            shared_with_id=target_user.id,
            created_by=current_user.id,
        )
    else:
        # Public share — reuse existing or create new
        existing = db.query(FileShare).filter(
            FileShare.file_id == file_id,
            FileShare.share_type == "public",
            FileShare.created_by == current_user.id,
        ).first()
        if existing:
            existing.permission = data.permission
            db.commit()
            db.refresh(existing)
            return {
                "id": existing.id,
                "share_token": existing.share_token,
                "share_type": existing.share_type,
                "permission": existing.permission,
                "shared_with": None,
                "created_at": str(existing.created_at),
            }
        share = FileShare(
            file_id=file_id,
            share_token=str(uuid.uuid4()),
            share_type="public",
            permission=data.permission,
            shared_with_id=None,
            created_by=current_user.id,
        )

    db.add(share)
    db.commit()
    db.refresh(share)

    return {
        "id": share.id,
        "share_token": share.share_token,
        "share_type": share.share_type,
        "permission": share.permission,
        "shared_with": data.username if data.share_type == "user" else None,
        "created_at": str(share.created_at),
    }


# ─── List shares for a file ───

@router.get("/{file_id}")
def list_shares(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    file = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id,
    ).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    shares = db.query(FileShare).filter(FileShare.file_id == file_id).all()
    result = []
    for s in shares:
        shared_with_name = None
        if s.shared_with_id:
            u = db.query(User).filter(User.id == s.shared_with_id).first()
            shared_with_name = u.username if u else None
        result.append({
            "id": s.id,
            "share_token": s.share_token,
            "share_type": s.share_type,
            "permission": s.permission,
            "shared_with": shared_with_name,
            "created_at": str(s.created_at),
        })
    return result


# ─── Revoke (delete) a share ───

@router.delete("/{share_id}")
def revoke_share(
    share_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    share = db.query(FileShare).filter(
        FileShare.id == share_id,
        FileShare.created_by == current_user.id,
    ).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    db.delete(share)
    db.commit()
    return {"ok": True}


# ─── Public endpoints (no auth required) ───

@router.get("/public/{token}")
def get_shared_file(token: str, db: Session = Depends(get_db)):
    share = db.query(FileShare).filter(FileShare.share_token == token).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share link not found or expired")

    file = db.query(FileModel).filter(FileModel.id == share.file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="File no longer exists")

    # Look up sharer username
    shared_by_user = db.query(User).filter(User.id == share.created_by).first()
    shared_by_name = shared_by_user.username if shared_by_user else "Unknown"

    return {
        "file_id": file.id,
        "name": file.name,
        "size": file.size,
        "mime_type": file.mime_type,
        "is_folder": file.is_folder,
        "permission": share.permission,
        "share_type": share.share_type,
        "shared_by": shared_by_name,
        "created_at": str(file.created_at),
    }


@router.get("/public/{token}/download")
def download_shared_file(token: str, db: Session = Depends(get_db)):
    share = db.query(FileShare).filter(FileShare.share_token == token).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share link not found")
    if share.permission == "view":
        raise HTTPException(status_code=403, detail="Download not allowed for this share")

    file = db.query(FileModel).filter(FileModel.id == share.file_id).first()
    if not file or not file.s3_key:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        # Stream from S3
        s3_response = s3_client.get_object(Bucket=BUCKET_NAME, Key=file.s3_key)
        
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


@router.get("/public/{token}/editor-config")
def get_shared_editor_config(token: str, db: Session = Depends(get_db)):
    """OnlyOffice config for viewing shared documents (read-only)."""
    share = db.query(FileShare).filter(FileShare.share_token == token).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share link not found")

    file = db.query(FileModel).filter(FileModel.id == share.file_id).first()
    if not file or not file.s3_key:
        raise HTTPException(status_code=404, detail="File not found")

    ext = file.name.rsplit(".", 1)[-1].lower() if "." in file.name else ""
    editable_exts = {"docx", "doc", "xlsx", "xls", "pptx", "ppt", "odt", "ods", "odp", "csv", "txt", "rtf", "pdf"}
    if ext not in editable_exts:
        raise HTTPException(status_code=400, detail="File type not supported by editor")

    file_url = generate_presigned_url(file.s3_key)
    if ext in ("xlsx", "xls", "ods", "csv"):
        doc_type = "cell"
    elif ext in ("pptx", "ppt", "odp"):
        doc_type = "slide"
    else:
        doc_type = "word"

    can_edit = share.permission == "edit"

    onlyoffice_secret = os.getenv("ONLYOFFICE_JWT_SECRET", "supersecretjwtkeysupersecretjwtkey")

    config = {
        "document": {
            "fileType": ext,
            "key": f"share-{share.id}-{int(file.created_at.timestamp()) if file.created_at else 0}",
            "title": file.name,
            "url": file_url,
            "permissions": {
                "comment": False,
                "download": share.permission in ("download", "edit"),
                "edit": can_edit,
                "print": True,
                "review": False,
            },
        },
        "documentType": doc_type,
        "editorConfig": {
            "mode": "edit" if can_edit else "view",
            "lang": "en",
            "customization": {
                "autosave": can_edit,
                "compactHeader": True,
                "toolbarNoTabs": not can_edit,
            },
        },
        "height": "100%",
        "width": "100%",
        "type": "desktop",
    }

    # Add callback only if editing is allowed
    # Add callback only if editing is allowed
    if can_edit:
        backend_url = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
        config["editorConfig"]["callbackUrl"] = f"{backend_url}/files/onlyoffice/callback"

    token_jwt = pyjwt.encode(config, onlyoffice_secret, algorithm="HS256")
    config["token"] = token_jwt

    # Add sharer info (outside JWT, just for frontend display)
    shared_by_user = db.query(User).filter(User.id == share.created_by).first()
    config["shared_by"] = shared_by_user.username if shared_by_user else "Unknown"

    return config


@router.get("/public/{token}/content")
def get_shared_content(token: str, db: Session = Depends(get_db)):
    """Fetch raw content for shared files (e.g. .md)."""
    share = db.query(FileShare).filter(FileShare.share_token == token).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share link not found")

    file = db.query(FileModel).filter(FileModel.id == share.file_id).first()
    if not file or not file.s3_key:
        raise HTTPException(status_code=404, detail="File not found")

    # Fetch from S3
    try:
        obj = s3_client.get_object(Bucket=BUCKET_NAME, Key=file.s3_key)
        content = obj['Body'].read().decode('utf-8')
        return {"content": content}
    except Exception as e:
        print(f"Error reading file content: {e}")
        raise HTTPException(status_code=500, detail="Could not read file content")


# ─── Shared folder: list contents ───

def _collect_children(db, folder_id, user_id):
    """Recursively collect all non-trashed children of a folder."""
    results = []
    children = db.query(FileModel).filter(
        FileModel.parent_id == folder_id,
        FileModel.user_id == user_id,
        FileModel.is_trashed == False,
    ).order_by(FileModel.is_folder.desc(), FileModel.name).all()
    for child in children:
        item = {
            "id": child.id,
            "name": child.name,
            "size": child.size or 0,
            "mime_type": child.mime_type,
            "is_folder": child.is_folder,
            "parent_id": child.parent_id,
            "created_at": str(child.created_at),
        }
        if child.is_folder:
            item["children"] = _collect_children(db, child.id, user_id)
        results.append(item)
    return results


@router.get("/public/{token}/contents")
def get_shared_folder_contents(token: str, db: Session = Depends(get_db)):
    """List all files inside a shared folder (recursive)."""
    share = db.query(FileShare).filter(FileShare.share_token == token).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share link not found")

    file = db.query(FileModel).filter(FileModel.id == share.file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="File no longer exists")
    if not file.is_folder:
        raise HTTPException(status_code=400, detail="Shared item is not a folder")

    contents = _collect_children(db, file.id, file.user_id)
    return {"folder_name": file.name, "contents": contents}


# ─── Shared folder: presigned URL for viewing a file (PDF etc.) ───

@router.get("/public/{token}/preview/{file_id}")
def preview_shared_folder_file(token: str, file_id: int, db: Session = Depends(get_db)):
    """Return a presigned URL for viewing a file inside a shared folder (or directly shared file)."""
    share = db.query(FileShare).filter(FileShare.share_token == token).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share link not found")

    shared_root = db.query(FileModel).filter(FileModel.id == share.file_id).first()
    if not shared_root:
        raise HTTPException(status_code=404, detail="Shared item not found")

    # If the shared item IS the file itself (not a folder), allow preview of that file
    if shared_root.id == file_id:
        target = shared_root
    elif shared_root.is_folder and _is_descendant(db, file_id, shared_root.id, shared_root.user_id):
        target = db.query(FileModel).filter(FileModel.id == file_id).first()
    else:
        raise HTTPException(status_code=403, detail="File is not part of this shared item")

    if not target or not target.s3_key:
        raise HTTPException(status_code=404, detail="File not found or has no data")

    url = generate_presigned_url(target.s3_key)
    if not url:
        raise HTTPException(status_code=500, detail="Could not generate preview URL")

    return {"url": url, "name": target.name, "mime_type": target.mime_type}


# ─── Shared folder: fetch raw content of a file (for markdown etc.) ───

@router.get("/public/{token}/content/{file_id}")
def get_shared_folder_file_content(token: str, file_id: int, db: Session = Depends(get_db)):
    """Fetch raw text content of a file inside a shared folder (e.g. markdown)."""
    share = db.query(FileShare).filter(FileShare.share_token == token).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share link not found")

    shared_root = db.query(FileModel).filter(FileModel.id == share.file_id).first()
    if not shared_root:
        raise HTTPException(status_code=404, detail="Shared item not found")

    # Validate file belongs to the shared item
    if shared_root.id == file_id:
        target = shared_root
    elif shared_root.is_folder and _is_descendant(db, file_id, shared_root.id, shared_root.user_id):
        target = db.query(FileModel).filter(FileModel.id == file_id).first()
    else:
        raise HTTPException(status_code=403, detail="File is not part of this shared item")

    if not target or not target.s3_key:
        raise HTTPException(status_code=404, detail="File not found or has no data")

    try:
        obj = s3_client.get_object(Bucket=BUCKET_NAME, Key=target.s3_key)
        content = obj['Body'].read().decode('utf-8')
        return {"content": content, "name": target.name}
    except Exception as e:
        print(f"Error reading file content: {e}")
        raise HTTPException(status_code=500, detail="Could not read file content")


# ─── Shared folder: download individual file ───

def _is_descendant(db, file_id, ancestor_folder_id, user_id):
    """Check if file_id is a descendant of ancestor_folder_id."""
    current = db.query(FileModel).filter(
        FileModel.id == file_id, FileModel.user_id == user_id
    ).first()
    while current:
        if current.parent_id == ancestor_folder_id:
            return True
        if current.parent_id is None:
            return False
        current = db.query(FileModel).filter(
            FileModel.id == current.parent_id, FileModel.user_id == user_id
        ).first()
    return False


@router.get("/public/{token}/download/{file_id}")
def download_shared_folder_file(token: str, file_id: int, db: Session = Depends(get_db)):
    """Download a single file from inside a shared folder."""
    share = db.query(FileShare).filter(FileShare.share_token == token).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share link not found")
    if share.permission == "view":
        raise HTTPException(status_code=403, detail="Download not allowed for this share")

    shared_root = db.query(FileModel).filter(FileModel.id == share.file_id).first()
    if not shared_root:
        raise HTTPException(status_code=404, detail="Shared item not found")

    # Verify the requested file is inside the shared folder
    if file_id != shared_root.id and not _is_descendant(db, file_id, shared_root.id, shared_root.user_id):
        raise HTTPException(status_code=403, detail="File is not part of this shared folder")

    target = db.query(FileModel).filter(FileModel.id == file_id).first()
    if not target or not target.s3_key:
        raise HTTPException(status_code=404, detail="File not found or has no data")

    try:
        s3_response = s3_client.get_object(Bucket=BUCKET_NAME, Key=target.s3_key)
        headers = {
            "Content-Disposition": f'attachment; filename="{target.name}"',
            "Content-Length": str(target.size or 0),
        }
        return StreamingResponse(
            s3_response['Body'],
            media_type=target.mime_type or "application/octet-stream",
            headers=headers,
        )
    except Exception as e:
        print(f"Stream error: {e}")
        raise HTTPException(status_code=500, detail="Could not stream file")


# ─── Shared folder: download as ZIP ───

def _collect_files_flat(db, folder_id, user_id, prefix=""):
    """Collect all files in a folder tree as (s3_key, archive_path) pairs."""
    result = []
    children = db.query(FileModel).filter(
        FileModel.parent_id == folder_id,
        FileModel.user_id == user_id,
        FileModel.is_trashed == False,
    ).all()
    for child in children:
        path = f"{prefix}{child.name}" if prefix else child.name
        if child.is_folder:
            result.extend(_collect_files_flat(db, child.id, user_id, f"{path}/"))
        elif child.s3_key:
            result.append((child.s3_key, path))
    return result


@router.get("/public/{token}/zip")
def download_shared_folder_zip(token: str, db: Session = Depends(get_db)):
    """Download entire shared folder as a ZIP archive."""
    share = db.query(FileShare).filter(FileShare.share_token == token).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share link not found")
    if share.permission == "view":
        raise HTTPException(status_code=403, detail="Download not allowed for this share")

    folder = db.query(FileModel).filter(FileModel.id == share.file_id).first()
    if not folder or not folder.is_folder:
        raise HTTPException(status_code=400, detail="Shared item is not a folder")

    file_entries = _collect_files_flat(db, folder.id, folder.user_id)
    if not file_entries:
        raise HTTPException(status_code=404, detail="Folder is empty")

    # Build ZIP in memory (suitable for reasonable folder sizes)
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for s3_key, archive_path in file_entries:
            try:
                obj = s3_client.get_object(Bucket=BUCKET_NAME, Key=s3_key)
                data = obj['Body'].read()
                zf.writestr(archive_path, data)
            except Exception as e:
                print(f"Skipping {s3_key}: {e}")
                continue

    zip_buffer.seek(0)
    zip_name = f"{folder.name}.zip"

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_name}"'},
    )
