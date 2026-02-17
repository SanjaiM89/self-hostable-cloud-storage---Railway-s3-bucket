from fastapi import APIRouter, Depends, HTTPException, Header, status
from fastapi.security import OAuth2PasswordBearer
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

from database import get_db
from models import User

try:
    from ..auth.utils import decode_access_token
except ImportError:
    from auth.utils import decode_access_token

try:
    from ..ai.service import chat_stream
except ImportError:
    from ai.service import chat_stream

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

router = APIRouter(
    prefix="/ai",
    tags=["ai"]
)

class ContextFile(BaseModel):
    name: str
    content: str # Text content
    language: Optional[str] = None

class Attachment(BaseModel):
    name: str
    content_base64: str
    mime_type: str

class ChatRequest(BaseModel):
    messages: List[Dict[str, str]] # [{"role": "user", "content": "..."}]
    context_files: Optional[List[ContextFile]] = None
    attachments: Optional[List[Attachment]] = None

@router.post("/chat")
async def chat_endpoint(
    req: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Streaming chat endpoint.
    """
    if not current_user.ai_config:
        # Allow default if env var is set? Or force user config?
        # For now, pass empty and let service use env defaults if we implement them, 
        # or fail if specific keys are missing.
        pass

    return StreamingResponse(
        chat_stream(
            current_user.ai_config, 
            req.messages, 
            [f.dict() for f in req.context_files] if req.context_files else [],
            [a.dict() for a in req.attachments] if req.attachments else []
        ),
        media_type="text/plain"
    )

@router.get("/config")
async def get_ai_config(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return current_user.ai_config or {}

@router.post("/config")
async def update_ai_config(
    config: Dict[str, Any],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update user's AI configuration.
    """
    # Validate config structure minimally
    if "provider" not in config:
        raise HTTPException(status_code=400, detail="Provider is required")
    
    current_user.ai_config = config
    
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(current_user, "ai_config")
    
    db.commit()
    db.refresh(current_user)
    return {"status": "success", "config": current_user.ai_config}
