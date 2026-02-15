from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
import uuid
import os
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

    url = generate_presigned_url(file.s3_key)
    return {"url": url, "name": file.name}


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
