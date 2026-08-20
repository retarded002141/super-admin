import os
import smtplib
import hashlib
import secrets
import random
import jwt
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Response, Body, Request
from bson import ObjectId

# Import database collections
from database import user_collection, settings_collection
from middlewares.auth import get_current_user, admin_only

# Set up the global auth router
router = APIRouter(prefix="/api/admin", tags=["Global Admin Auth"])

# ==========================================
# ADMIN AUTHENTICATION & PROFILE
# ==========================================

@router.post("/login")
async def login(response: Response, payload: dict = Body(...)):
    email = payload.get("email", "").strip().lower()
    password = payload.get("password", "").strip()

    if user_collection.count_documents({}) == 0:
        user_collection.insert_one({
            "username": "System Admin", 
            "email": "admin@example.com", 
            "password": "password123",
            "institute": "Admission", 
            "role": "SuperAdmin"
        })

    admin = user_collection.find_one({"email": email, "role": {"$in": ["Admin", "SuperAdmin"]}})
    if not admin:
        raise HTTPException(status_code=400, detail="Invalid Credentials: Admin email not found")
        
    if admin.get("password") != password:
        raise HTTPException(status_code=400, detail="Invalid Credentials: Wrong password")

    # Check system settings to see if 2FA is enabled
    settings = settings_collection.find_one({"institute": "Admission"}) or {}
    security = settings.get("security", {})
    is_2fa_enabled = security.get("twoFactorAuth", False)

    if is_2fa_enabled:
        # Generate 6-digit OTP
        otp_code = str(random.randint(100000, 999999))
        expire_time = datetime.utcnow() + timedelta(minutes=10)
        
        user_collection.update_one(
            {"_id": admin["_id"]},
            {"$set": {"loginOtp": otp_code, "loginOtpExpire": expire_time}}
        )

        # Send Email
        sender = os.getenv("GMAIL_USER")
        mail_pass = os.getenv("GMAIL_PASS")
        
        if sender and mail_pass:
            try:
                msg = MIMEMultipart()
                msg['From'] = f"Office of Admissions <{sender}>"
                msg['To'] = email
                msg['Subject'] = "Admin Login Verification Code"
                body = f"Your admin login verification code is: {otp_code}\n\nThis code expires in 10 minutes."
                msg.attach(MIMEText(body, 'plain'))
                
                with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
                    server.login(sender, mail_pass)
                    server.send_message(msg)
            except Exception as e:
                print("Failed to send 2FA email:", e)
                raise HTTPException(status_code=500, detail="Failed to send verification email. Check SMTP settings.")

        return {"requires2FA": True, "msg": "Verification code sent to your email"}

    # If 2FA is disabled, log in directly without OTP
    SECRET_KEY = os.getenv("JWT_SECRET")
    
    token = jwt.encode(
        {
            "id": str(admin["_id"]), 
            "role": admin.get("role", "SuperAdmin"), 
            "institute": admin.get("institute", "Admission")
        },
        SECRET_KEY,
        algorithm="HS256"
    )
    
    response.set_cookie(key="token", value=token, httponly=True, max_age=28800)
    
    return {
        "token": token, 
        "msg": "Admin logged in",
        "admin": {
            "id": str(admin["_id"]),
            "email": admin["email"],
            "role": admin.get("role", "SuperAdmin"),
            "name": admin.get("username", "Super Admin")
        }
    }

@router.get("/profile")
async def get_admin_profile(user: dict = Depends(admin_only)):
    admin = user_collection.find_one({"_id": ObjectId(user["id"])}, {"password": 0})
    if not admin:
        return {"username": "Default", "name": "Default", "role": "SuperAdmin", "institute": "Admission", "image": None}
    
    return {
        "username": admin.get("username"),
        "name": admin.get("username"),
        "email": admin.get("email"),
        "role": admin.get("role"),
        "institute": admin.get("institute"),
        "image": admin.get("image")
    }

@router.put("/profile")
async def update_profile(request: Request, user: dict = Depends(admin_only)):
    content_type = request.headers.get("content-type", "")
    update_data = {}
    
    if "multipart/form-data" in content_type:
        form = await request.form()
        if "username" in form: update_data["username"] = form["username"]
        if "name" in form: update_data["name"] = form["name"]
        
        file = form.get("file") or form.get("image")
        if file and hasattr(file, "filename") and file.filename:
            os.makedirs("uploads", exist_ok=True)
            file_path = f"uploads/{file.filename}"
            with open(file_path, "wb") as buffer:
                buffer.write(await file.read())
            update_data["image"] = f"/{file_path}"
    else:
        update_data = await request.json()

    if update_data:
        user_collection.update_one({"_id": ObjectId(user["id"])}, {"$set": update_data})
        
    return {"msg": "Profile updated"}

@router.put("/change-password")
async def change_password(payload: dict = Body(...), user: dict = Depends(admin_only)):
    user_collection.update_one({"_id": ObjectId(user["id"])}, {"$set": {"password": payload.get("newPassword")}})
    return {"msg": "Password updated successfully"}

@router.post("/verify-2fa")
async def verify_2fa(response: Response, payload: dict = Body(...)):
    email = payload.get("email", "").strip().lower()
    otp = payload.get("otp", "").strip()
    
    admin = user_collection.find_one({"email": email, "role": {"$in": ["Admin", "SuperAdmin"]}})
    if not admin or admin.get("loginOtp") != otp:
        raise HTTPException(status_code=400, detail="Invalid verification code")
        
    if datetime.utcnow() > admin.get("loginOtpExpire", datetime.utcnow()):
        raise HTTPException(status_code=400, detail="Verification code has expired")

    # Clear OTP
    user_collection.update_one({"_id": admin["_id"]}, {"$unset": {"loginOtp": "", "loginOtpExpire": ""}})

    SECRET_KEY = os.getenv("JWT_SECRET")
    token = jwt.encode(
        {"id": str(admin["_id"]), "role": admin.get("role", "SuperAdmin"), "institute": admin.get("institute", "Admission")},
        SECRET_KEY, algorithm="HS256"
    )
    
    response.set_cookie(key="token", value=token, httponly=True, max_age=28800)
    
    return {
        "token": token, 
        "msg": "Admin verified and logged in",
        "admin": {
            "id": str(admin["_id"]), "email": admin["email"],
            "role": admin.get("role", "SuperAdmin"), "name": admin.get("username", "Super Admin")
        }
    }

@router.post("/forgot-password")
async def forgot_password(payload: dict = Body(...)):
    email = payload.get("email")
    admin = user_collection.find_one({"email": email, "role": {"$in": ["Admin", "SuperAdmin"]}})
    
    if not admin:
        raise HTTPException(status_code=404, detail="Admin email not found.")
        
    reset_token = secrets.token_hex(32)
    hashed_token = hashlib.sha256(reset_token.encode()).hexdigest()
    expire_time = datetime.utcnow() + timedelta(minutes=15)
    
    user_collection.update_one(
        {"email": email},
        {"$set": {"resetPasswordToken": hashed_token, "resetPasswordExpire": expire_time}}
    )
    
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    reset_url = f"{frontend_url}/reset-password/{reset_token}"
    
    sender = os.getenv("GMAIL_USER")
    password = os.getenv("GMAIL_PASS")
    
    if sender and password:
        try:
            msg = MIMEMultipart()
            msg['From'] = f"Office of Admissions <{sender}>"
            msg['To'] = email
            msg['Subject'] = "Password Reset Request"
            body = f"Click the following link to reset your password: {reset_url}\n\nThis link expires in 15 minutes."
            msg.attach(MIMEText(body, 'plain'))
            
            with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
                server.login(sender, password)
                server.send_message(msg)
        except Exception as e:
            print("Failed to send reset email:", e)
            
    return {"msg": "A password reset link has been sent to your email."}

@router.post("/reset-password/{token}")
async def reset_password(token: str, payload: dict = Body(...)):
    hashed_token = hashlib.sha256(token.encode()).hexdigest()
    new_password = payload.get("password")
    
    if not new_password:
        raise HTTPException(status_code=400, detail="Please provide a new password.")
        
    admin = user_collection.find_one({
        "resetPasswordToken": hashed_token,
        "resetPasswordExpire": {"$gt": datetime.utcnow()}
    })
    
    if not admin:
        raise HTTPException(status_code=400, detail="Invalid or expired password reset token.")
        
    user_collection.update_one(
        {"_id": admin["_id"]},
        {
            "$set": {"password": new_password},
            "$unset": {"resetPasswordToken": "", "resetPasswordExpire": ""}
        }
    )
    return {"msg": "Password has been successfully reset. You can now log in."}

@router.get("/list")
async def get_all_admins(user: dict = Depends(admin_only)):
    admins = []
    for admin in user_collection.find({"role": {"$in": ["Admin", "SuperAdmin"]}}, {"password": 0}):
        admin["_id"] = str(admin["_id"]) 
        admins.append(admin)
    return admins

@router.post("/create-admin")
@router.post("")
@router.post("/")
async def create_admin(payload: dict = Body(...), user: dict = Depends(admin_only)):
    if user_collection.find_one({"email": payload.get("email")}):
        raise HTTPException(status_code=400, detail="Admin exists")
    payload["password"] = "password123"
    user_collection.insert_one(payload)
    return {"msg": "Admin created"}

@router.put("/{id}")
async def update_admin(id: str, payload: dict = Body(...), user: dict = Depends(admin_only)):
    user_collection.update_one({"_id": ObjectId(id)}, {"$set": payload})
    return {"msg": "Admin updated"}

@router.delete("/{id}")
async def delete_admin(id: str, user: dict = Depends(admin_only)):
    user_collection.delete_one({"_id": ObjectId(id)})
    return {"msg": "Admin deleted"}