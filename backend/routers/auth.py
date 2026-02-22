from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
try:
    from ..database import get_db
    from ..models import User
    from ..auth.utils import verify_password, get_password_hash, create_access_token, decode_access_token
except ImportError:
    from database import get_db
    from models import User
    from auth.utils import verify_password, get_password_hash, create_access_token, decode_access_token
from pydantic import BaseModel
from datetime import timedelta

router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

class UserCreate(BaseModel):
    username: str
    email: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict

@router.post("/register", response_model=Token)
def register(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    hashed_password = get_password_hash(user.password)
    new_user = User(username=user.username, email=user.email, hashed_password=hashed_password, is_admin=False)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    access_token = create_access_token(data={"sub": new_user.username})
    return {"access_token": access_token, "token_type": "bearer", "user": {"username": new_user.username, "email": new_user.email, "is_admin": new_user.is_admin, "storage_limit": new_user.storage_limit}}

@router.post("/login", response_model=Token)
def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if not db_user:
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    if not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    access_token = create_access_token(data={"sub": db_user.username})
    return {"access_token": access_token, "token_type": "bearer", "user": {"username": db_user.username, "email": db_user.email, "is_admin": db_user.is_admin, "storage_limit": db_user.storage_limit}}


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except Exception:
        raise credentials_exception
    
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    return user


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {
        "username": current_user.username, 
        "email": current_user.email, 
        "is_admin": current_user.is_admin, 
        "storage_limit": current_user.storage_limit,
        "ai_config": current_user.ai_config
    }

# ─── API Key Endpoints ───
@router.post("/api-key/generate")
def generate_api_key(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Generate a new API key for the current user."""
    import secrets
    new_api_key = secrets.token_urlsafe(32)
    current_user.api_key = new_api_key
    db.commit()
    return {"api_key": new_api_key}

@router.get("/api-key/my-key")
def get_my_api_key(current_user: User = Depends(get_current_user)):
    """Get the current user's API key."""
    return {"api_key": current_user.api_key}

