from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

try:
    from ..database import get_db
    from ..models import User, File as FileModel
    from .files import get_current_user
    from ..auth.utils import verify_password, get_password_hash
except ImportError:
    from database import get_db
    from models import User, File as FileModel
    from routers.files import get_current_user
    from auth.utils import verify_password, get_password_hash

router = APIRouter(prefix="/admin", tags=["admin"])


class StorageUpdate(BaseModel):
    storage_limit: int


class AdminProfileUpdate(BaseModel):
    username: str
    email: str
    current_password: str


class AdminPasswordUpdate(BaseModel):
    current_password: str
    new_password: str


def require_admin(current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@router.get('/users')
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    from sqlalchemy import func

    users = db.query(User).order_by(User.created_at.asc()).all()
    response = []
    for user in users:
        used = db.query(func.sum(FileModel.size)).filter(
            FileModel.user_id == user.id,
            FileModel.is_trashed == False,
        ).scalar() or 0
        response.append({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'is_admin': user.is_admin,
            'storage_limit': user.storage_limit,
            'storage_used': used,
            'created_at': user.created_at.isoformat() if user.created_at else None,
        })
    return response


@router.patch('/users/{user_id}/storage')
def update_storage(
    user_id: int,
    payload: StorageUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if payload.storage_limit < 100 * 1024 * 1024:
        raise HTTPException(status_code=400, detail='Storage limit must be at least 100 MB')

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='User not found')

    user.storage_limit = payload.storage_limit
    db.commit()
    db.refresh(user)
    return {'id': user.id, 'storage_limit': user.storage_limit}


@router.patch('/settings/profile')
def update_admin_profile(
    payload: AdminProfileUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    if not verify_password(payload.current_password, current_admin.hashed_password):
        raise HTTPException(status_code=400, detail='Current password is incorrect')

    if '@' not in payload.email or '.' not in payload.email.split('@')[-1]:
        raise HTTPException(status_code=400, detail='Invalid email format')

    username_taken = db.query(User).filter(
        User.username == payload.username,
        User.id != current_admin.id,
    ).first()
    if username_taken:
        raise HTTPException(status_code=400, detail='Username already in use')

    email_taken = db.query(User).filter(
        User.email == payload.email,
        User.id != current_admin.id,
    ).first()
    if email_taken:
        raise HTTPException(status_code=400, detail='Email already in use')

    current_admin.username = payload.username
    current_admin.email = payload.email
    db.commit()
    db.refresh(current_admin)

    return {
        'username': current_admin.username,
        'email': current_admin.email,
        'is_admin': current_admin.is_admin,
    }


@router.patch('/settings/password')
def update_admin_password(
    payload: AdminPasswordUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    if not verify_password(payload.current_password, current_admin.hashed_password):
        raise HTTPException(status_code=400, detail='Current password is incorrect')

    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail='New password must be at least 6 characters')

    current_admin.hashed_password = get_password_hash(payload.new_password)
    db.commit()

    return {'message': 'Password updated successfully'}
