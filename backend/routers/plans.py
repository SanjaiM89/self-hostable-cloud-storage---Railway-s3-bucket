from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
import datetime

from database import get_db
from models import Plan, User
from routers.auth import get_current_user

router = APIRouter()

class PlanCreate(BaseModel):
    name: str
    description: Optional[str] = None
    price: int # In paise or smallest unit
    currency: str = "INR"
    storage_limit: int # In bytes
    max_file_size: int # In bytes
    duration_days: int = 30
    is_active: bool = True

class PlanResponse(PlanCreate):
    id: int
    
    class Config:
        from_attributes = True

@router.get("/", response_model=List[PlanResponse])
def get_plans(db: Session = Depends(get_db)):
    return db.query(Plan).filter(Plan.is_active == True).all()

@router.get("/all", response_model=List[PlanResponse])
def get_all_plans(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    return db.query(Plan).all()

@router.post("/", response_model=PlanResponse)
def create_plan(
    plan: PlanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    db_plan = Plan(**plan.dict())
    db.add(db_plan)
    db.commit()
    db.refresh(db_plan)
    return db_plan

@router.put("/{plan_id}", response_model=PlanResponse)
def update_plan(
    plan_id: int,
    plan: PlanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    db_plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not db_plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    for key, value in plan.dict().items():
        setattr(db_plan, key, value)
    
    db.commit()
    db.refresh(db_plan)
    return db_plan

@router.delete("/{plan_id}")
def delete_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    db_plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not db_plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    # Soft delete
    db_plan.is_active = False
    db.commit()
    return {"message": "Plan deactivated"}
