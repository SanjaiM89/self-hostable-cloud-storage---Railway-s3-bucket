from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
import razorpay
import os
import hmac
import hashlib
import datetime

from database import get_db
from models import Payment, Plan, User
from routers.auth import get_current_user
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")

client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))

class CreateOrderRequest(BaseModel):
    plan_id: int

class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str

@router.post("/create-order")
def create_order(
    req: CreateOrderRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    plan = db.query(Plan).filter(Plan.id == req.plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    amount = plan.price
    currency = plan.currency
    
    # Create Razorpay Order
    data = {"amount": amount, "currency": currency, "receipt": f"order_rcptid_{current_user.id}_{plan.id}"}
    try:
        order = client.order.create(data=data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Details: {str(e)}")
    
    # Save partial payment record
    db_payment = Payment(
        user_id=current_user.id,
        plan_id=plan.id,
        razorpay_order_id=order['id'],
        amount=amount,
        status="created"
    )
    db.add(db_payment)
    db.commit()
    
    return {
        "id": order['id'],
        "amount": order['amount'],
        "currency": order['currency'],
        "key_id": RAZORPAY_KEY_ID,
        "product_name": plan.name,
        "description": plan.description,
        "prefill": {
            "name": current_user.username,
            "email": current_user.email
        }
    }

@router.post("/verify")
def verify_payment(
    req: VerifyPaymentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verify Signature
    msg = f"{req.razorpay_order_id}|{req.razorpay_payment_id}"
    
    generated_signature = hmac.new(
        bytes(RAZORPAY_KEY_SECRET, 'utf-8'),
        bytes(msg, 'utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    if generated_signature != req.razorpay_signature:
        raise HTTPException(status_code=400, detail="Invalid signature")
    
    # Update Payment Status
    payment = db.query(Payment).filter(Payment.razorpay_order_id == req.razorpay_order_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Order not found")
    
    payment.razorpay_payment_id = req.razorpay_payment_id
    payment.status = "paid"
    
    # Upgrade User
    plan = payment.plan
    current_user.plan_id = plan.id
    current_user.storage_limit = plan.storage_limit
    # current_user.max_file_size = plan.max_file_size # If we add this to User model
    
    # Calculate expiry
    current_user.subscription_expiry = datetime.datetime.utcnow() + datetime.timedelta(days=plan.duration_days)
    
    db.commit()
    
    return {"status": "success", "message": "Payment verified and plan upgraded"}
