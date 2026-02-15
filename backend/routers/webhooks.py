from fastapi import APIRouter, Header, HTTPException, Depends, Request
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import File as FileModel
from ..services.docspace import docspace_client
from ..storage import upload_file_to_s3, BUCKET_NAME, s3_client
import os

router = APIRouter(prefix="/docspace", tags=["docspace"])

@router.post("/webhook")
async def docspace_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Handle DocSpace webhooks.
    When a file is updated in DocSpace, sync it back to S3.
    """
    try:
        payload = await request.json()
        print(f"DocSpace Webhook Payload: {payload}")
        
        # Payload structure depends on the event.
        # usually: { "action": "update", "id": "...", "file": { ... } }
        # We need to find the File ID.
        
        docspace_id = None
        
        # Attempt to find ID in different places
        if "id" in payload:
            docspace_id = payload["id"]
        elif "file" in payload and "id" in payload["file"]:
            docspace_id = payload["file"]["id"]
            
        if not docspace_id:
            print("No DocSpace ID found in webhook")
            return {"status": "ignored", "reason": "no_id"}

        # Find file in DB
        # Note: docspace_id is String in DB
        db_file = db.query(FileModel).filter(FileModel.docspace_id == str(docspace_id)).first()
        
        if not db_file:
            print(f"File with DocSpace ID {docspace_id} not found in DB")
            return {"status": "ignored", "reason": "file_not_found_in_db"}
            
        # Sync: Download from DocSpace -> Upload to S3
        print(f"Syncing file {db_file.name} (ID: {db_file.id}) from DocSpace...")
        
        try:
            file_content = docspace_client.download_file(docspace_id)
            
            # Update S3
            if db_file.s3_key:
                s3_client.put_object(
                    Bucket=BUCKET_NAME,
                    Key=db_file.s3_key,
                    Body=file_content,
                    ContentType=db_file.mime_type
                )
                
                # Update DB size/time
                db_file.size = len(file_content)
                db.commit()
                print("Sync Successful")
                return {"status": "synced"}
                
        except Exception as e:
            print(f"Sync Failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    except Exception as e:
        print(f"Webhook implementation error: {e}")
        return {"status": "error", "detail": str(e)}
