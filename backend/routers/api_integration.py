from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
import uuid
import datetime
import os
import time

try:
    from ..database import get_db
    from ..models import User, File as FileModel
    from ..s3.client import upload_file_to_s3, s3_client, BUCKET_NAME
    from ..utils.encryption import encrypt_id
except ImportError:
    from database import get_db
    from models import User, File as FileModel
    from s3.client import upload_file_to_s3, s3_client, BUCKET_NAME
    from utils.encryption import encrypt_id

router = APIRouter(prefix="/external", tags=["external_api"])

def verify_api_key(request: Request, db: Session = Depends(get_db)):
    api_key = request.headers.get("X-API-Key")
    if not api_key:
        raise HTTPException(status_code=401, detail="API Key is missing")
    
    user = db.query(User).filter(User.api_key == api_key).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid API Key")
    return user

@router.post("/upload")
async def upload_file_api(
    file: UploadFile = File(...),
    parent_id: int = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_api_key)
):
    start_time = time.time()
    
    file_id = str(uuid.uuid4())
    s3_key = f"{current_user.username}/{file_id}-{file.filename}"
    
    content = await file.read()
    file_size = len(content)
    await file.seek(0)
    
    # Check limit
    total_used = db.query(func.sum(FileModel.size)).filter(
        FileModel.user_id == current_user.id,
        FileModel.is_trashed == False
    ).scalar() or 0
    if total_used + file_size > current_user.storage_limit:
        raise HTTPException(status_code=400, detail="Storage limit exceeded")
    
    success = upload_file_to_s3(file.file, s3_key)
    end_time = time.time()
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to upload to S3")
        
    duration = end_time - start_time
    speed_bps = file_size / duration if duration > 0 else 0
    
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
        "status": "success",
        "file": {
            "id": new_file.id,
            "name": new_file.name,
            "size": new_file.size
        },
        "stats": {
            "time_taken_seconds": round(duration, 2),
            "speed_bytes_per_second": round(speed_bps, 2),
            "percentage_uploaded": 100
        }
    }

@router.get("/download/{file_id}")
def download_file_api(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_api_key)
):
    file = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id,
        FileModel.is_trashed == False
    ).first()
    
    if not file or file.is_folder:
        raise HTTPException(status_code=404, detail="File not found")
        
    return {
        "download_url": s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': BUCKET_NAME, 'Key': file.s3_key},
            ExpiresIn=3600
        ),
        "filename": file.name,
        "size": file.size
    }

from pydantic import BaseModel
class ContentSave(BaseModel):
    content: str
class RenameRequest(BaseModel):
    name: str

@router.put("/edit/{file_id}")
def edit_file_api(
    file_id: int,
    data: ContentSave,
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_api_key)
):
    file = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id
    ).first()
    if not file or file.is_folder:
        raise HTTPException(status_code=404, detail="File not found")
        
    try:
        content_bytes = data.content.encode('utf-8')
        s3_client.put_object(
            Bucket=BUCKET_NAME,
            Key=file.s3_key,
            Body=content_bytes,
            ContentType='text/plain',
        )
        file.size = len(content_bytes)
        db.commit()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/update/{file_id}")
def update_file_metadata_api(
    file_id: int,
    data: RenameRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_api_key)
):
    file = db.query(FileModel).filter(
        FileModel.id == file_id,
        FileModel.user_id == current_user.id
    ).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
        
    file.name = data.name
    db.commit()
    return {"status": "success", "new_name": file.name}

@router.post("/folder")
def create_folder_api(
    name: str = Form(...),
    parent_id: int = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_api_key)
):
    new_folder = FileModel(
        name=name,
        parent_id=parent_id,
        user_id=current_user.id,
        is_folder=True,
    )
    db.add(new_folder)
    db.commit()
    db.refresh(new_folder)
    return {"id": new_folder.id, "name": new_folder.name}

@router.delete("/folder/{folder_id}")
def remove_folder_api(
    folder_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_api_key)
):
    folder = db.query(FileModel).filter(
        FileModel.id == folder_id,
        FileModel.user_id == current_user.id,
        FileModel.is_folder == True
    ).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
        
    # We just move to trash here
    folder.is_trashed = True
    folder.trashed_at = datetime.datetime.utcnow()
    db.commit()
    return {"status": "success"}

@router.put("/folder/{folder_id}/rename")
def rename_folder_api(
    folder_id: int,
    data: RenameRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_api_key)
):
    folder = db.query(FileModel).filter(
        FileModel.id == folder_id,
        FileModel.user_id == current_user.id,
        FileModel.is_folder == True
    ).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
        
    folder.name = data.name
    db.commit()
    return {"status": "success", "new_name": folder.name}

@router.get("/storage")
def get_storage_stats_api(
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_api_key)
):
    total_used = db.query(func.sum(FileModel.size)).filter(
        FileModel.user_id == current_user.id,
        FileModel.is_trashed == False
    ).scalar() or 0
    
    return {
        "storage_limit_bytes": current_user.storage_limit,
        "used_bytes": total_used,
        "free_bytes": current_user.storage_limit - total_used
    }
