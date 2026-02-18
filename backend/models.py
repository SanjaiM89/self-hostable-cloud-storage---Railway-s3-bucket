from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, BigInteger, JSON
from sqlalchemy.orm import relationship
try:
    from .database import Base
except ImportError:
    from database import Base
import datetime

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_admin = Column(Boolean, default=False)
    storage_limit = Column(BigInteger, default=2 * 1024 * 1024 * 1024)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    ai_config = Column(JSON, default={})
    
    plan_id = Column(Integer, ForeignKey("plans.id"), nullable=True)
    subscription_expiry = Column(DateTime, nullable=True)
    
    files = relationship("File", back_populates="owner")
    plan = relationship("Plan")
    payments = relationship("Payment", back_populates="user")
    playlists = relationship("Playlist", back_populates="owner")

class Plan(Base):
    __tablename__ = "plans"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    description = Column(String, nullable=True)
    price = Column(Integer, default=0) # In smallest currency unit (e.g., paise for INR)
    currency = Column(String, default="INR")
    storage_limit = Column(BigInteger, default=2 * 1024 * 1024 * 1024) # Default 2GB
    max_file_size = Column(BigInteger, default=2 * 1024 * 1024 * 1024) # Default 2GB
    duration_days = Column(Integer, default=30)
    is_active = Column(Boolean, default=True)

class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    plan_id = Column(Integer, ForeignKey("plans.id"))
    razorpay_order_id = Column(String, index=True)
    razorpay_payment_id = Column(String, nullable=True)
    amount = Column(Integer)
    status = Column(String, default="created") # created, paid, failed
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="payments")
    plan = relationship("Plan")

class File(Base):
    __tablename__ = "files"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    s3_key = Column(String, nullable=True, index=True)
    size = Column(Integer, default=0)
    mime_type = Column(String, nullable=True)
    docspace_id = Column(String, nullable=True, index=True) # Map to OnlyOffice DocSpace File ID
    is_folder = Column(Boolean, default=False)
    parent_id = Column(Integer, ForeignKey("files.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    is_trashed = Column(Boolean, default=False, index=True)
    trashed_at = Column(DateTime, nullable=True)
    original_parent_id = Column(Integer, nullable=True)
    
    owner = relationship("User", back_populates="files")
    children = relationship("File", backref="parent", remote_side=[id], foreign_keys=[parent_id])
    music_metadata = relationship("MusicMetadata", back_populates="file", uselist=False, cascade="all, delete-orphan")


class FileShare(Base):
    __tablename__ = "file_shares"

    id = Column(Integer, primary_key=True, index=True)
    file_id = Column(Integer, ForeignKey("files.id", ondelete="CASCADE"), nullable=False)
    share_token = Column(String, unique=True, index=True, nullable=False)
    share_type = Column(String, nullable=False)        # "public" | "user"
    permission = Column(String, nullable=False)         # "view" | "download" | "edit"
    shared_with_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # null for public
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    file = relationship("File")
    shared_with = relationship("User", foreign_keys=[shared_with_id])
    creator = relationship("User", foreign_keys=[created_by])
