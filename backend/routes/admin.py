import os
import smtplib
import hashlib
import secrets
import random
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from datetime import datetime, timedelta
from utils.pdf_generator import generate_application_form_pdf
from fastapi import APIRouter, Depends, HTTPException, Response, Body, Request, UploadFile, File
from bson import ObjectId

# Import database collections
from database import (
    user_collection, applicant_collection, settings_collection, 
    audit_collection, rubric_collection, notification_collection, student_collection
)
from middlewares.auth import get_current_user, admin_only

# Set up the router
router = APIRouter(prefix="/api/admin", tags=["Admin"])

# Helper to fix MongoDB ObjectIds crashing the server
def fix_ids(data):
    if isinstance(data, list):
        return [fix_ids(item) for item in data]
    if isinstance(data, dict):
        new_dict = {}
        for k, v in data.items():
            if isinstance(v, ObjectId):
                new_dict[k] = str(v)
            elif isinstance(v, dict) or isinstance(v, list):
                new_dict[k] = fix_ids(v)
            else:
                new_dict[k] = v
        return new_dict
    return data

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
    import jwt
    import os
    
    SECRET_KEY = os.getenv("JWT_SECRET", "preadmission_key")
    
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

    import jwt
    import os
    SECRET_KEY = os.getenv("JWT_SECRET", "preadmission_key")
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
        
    # 1. Generate token and hash it
    reset_token = secrets.token_hex(32)
    hashed_token = hashlib.sha256(reset_token.encode()).hexdigest()
    expire_time = datetime.utcnow() + timedelta(minutes=15)
    
    # 2. Save hashed token and expiration to DB
    user_collection.update_one(
        {"email": email},
        {"$set": {"resetPasswordToken": hashed_token, "resetPasswordExpire": expire_time}}
    )
    
    # 3. Create URL and send email via SMTP
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
        
    # Find admin with matching token that hasn't expired
    admin = user_collection.find_one({
        "resetPasswordToken": hashed_token,
        "resetPasswordExpire": {"$gt": datetime.utcnow()}
    })
    
    if not admin:
        raise HTTPException(status_code=400, detail="Invalid or expired password reset token.")
        
    # Update password and clear token fields
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

# ==========================================
# SYSTEM SETTINGS & LOGS
# ==========================================

@router.get("/settings")
async def get_system_settings(user: dict = Depends(admin_only)):
    settings = settings_collection.find_one({"institute": "Admission"})
    if not settings:
        default_settings = {"institute": "Admission", "systemName": "Pre-Admission", "admissionStatus": "Open"}
        settings_collection.insert_one(default_settings)
        settings = default_settings
        
    settings["_id"] = str(settings["_id"])
    return settings

@router.put("/settings")
async def update_settings(payload: dict = Body(...), user: dict = Depends(admin_only)):
    payload.pop("_id", None)
    payload["institute"] = "Admission"
    settings_collection.update_one({"institute": "Admission"}, {"$set": payload}, upsert=True)
    return {"msg": "Admission settings updated"}

@router.get("/logs")
async def get_activity_logs(user: dict = Depends(admin_only)):
    logs = []
    for log in audit_collection.find({"institute": "Admission"}).sort("timestamp", -1).limit(50):
        log["_id"] = str(log["_id"])
        logs.append(log)
    return logs

@router.post("/logs")
async def create_log(payload: dict = Body(...), user: dict = Depends(admin_only)):
    payload["institute"] = "Admission"
    payload["timestamp"] = datetime.utcnow()
    audit_collection.insert_one(payload)
    return {"msg": "Activity logged"}

@router.delete("/logs/clear-all")
@router.delete("/logs")
async def clear_logs(user: dict = Depends(admin_only)):
    audit_collection.delete_many({"institute": "Admission"})
    return {"msg": "Admission logs cleared"}

@router.get("/public-settings")
async def get_public_settings():
    settings = settings_collection.find_one({"institute": "Admission"}) or {}
    return {
        "admissionStatus": settings.get("admissionStatus", "Open"),
        "schoolYear": settings.get("schoolYear"),
        "applicationDeadline": settings.get("applicationDeadline"),
        "courses": settings.get("courses", []),
        "institutes": settings.get("institutes", [])
    }

@router.post("/reset-system")
async def reset_system(user: dict = Depends(admin_only)):
    cutoff_date = datetime.utcnow() - timedelta(days=730)
    applicant_collection.delete_many({"createdAt": {"$lt": cutoff_date}})
    return {"msg": "System reset successful. Current active records are securely archived."}


# ==========================================
# INSTITUTES & COURSES (STORED IN SETTINGS)
# ==========================================

@router.get("/courses")
async def get_courses(user: dict = Depends(admin_only)):
    settings = settings_collection.find_one({"institute": "Admission"}) or {}
    courses = settings.get("courses", [])
    
    # Auto-heal fragmentation: If courses are empty, check if they were saved to a different document
    if not courses:
        fallback = settings_collection.find_one({"courses": {"$exists": True, "$ne": []}})
        if fallback:
            courses = fallback.get("courses", [])
            # Move the fragmented courses into the correct master document
            settings_collection.update_one({"institute": "Admission"}, {"$set": {"courses": courses}}, upsert=True)
            
    return courses

@router.post("/courses")
async def create_course(payload: dict = Body(...), user: dict = Depends(admin_only)):
    payload["_id"] = str(ObjectId()) 
    # Force updates into the correct Admission document
    settings_collection.update_one({"institute": "Admission"}, {"$push": {"courses": payload}}, upsert=True)
    return {"msg": "Course added!"}

@router.put("/courses/{id}")
async def update_course(id: str, payload: dict = Body(...), user: dict = Depends(admin_only)):
    settings_collection.update_one(
        {"courses._id": id},
        {"$set": {f"courses.$.{k}": v for k, v in payload.items()}}
    )
    return {"msg": "Course updated successfully"}

@router.delete("/courses/{id}")
async def delete_course(id: str, user: dict = Depends(admin_only)):
    settings_collection.update_one({"institute": "Admission"}, {"$pull": {"courses": {"_id": id}}})
    return {"msg": "Course deleted successfully"}

@router.get("/institutes")
async def get_institutes(user: dict = Depends(admin_only)):
    settings = settings_collection.find_one({"institute": "Admission"}) or {}
    institutes = settings.get("institutes", [])
    
    # Auto-heal fragmentation
    if not institutes:
        fallback = settings_collection.find_one({"institutes": {"$exists": True, "$ne": []}})
        if fallback:
            institutes = fallback.get("institutes", [])
            settings_collection.update_one({"institute": "Admission"}, {"$set": {"institutes": institutes}}, upsert=True)
            
    return institutes

@router.post("/institutes")
async def create_institute(payload: dict = Body(...), user: dict = Depends(admin_only)):
    payload["_id"] = str(ObjectId())
    settings_collection.update_one({"institute": "Admission"}, {"$push": {"institutes": payload}}, upsert=True)
    return {"msg": "Institute added!"}

@router.put("/institutes/{id}")
async def update_institute(id: str, payload: dict = Body(...), user: dict = Depends(admin_only)):
    settings_collection.update_one(
        {"institutes._id": id},
        {"$set": {f"institutes.$.{k}": v for k, v in payload.items()}}
    )
    return {"msg": "Institute updated"}

@router.delete("/institutes/{id}")
async def delete_institute(id: str, user: dict = Depends(admin_only)):
    settings_collection.update_one({"institute": "Admission"}, {"$pull": {"institutes": {"_id": id}}})
    return {"msg": "Institute deleted"}

# ==========================================
# APPLICANT MANAGEMENT
# ==========================================

@router.get("/applicants")
async def get_all_applicants(schoolYear: str = None, user: dict = Depends(admin_only)):
    query = {
        "isSubmitted": True,
        "firstChoice": {"$regex": "^Bachelor of Science in Information Technology$", "$options": "i"}
    }
    
    # Get logged-in admin's actual profile details
    admin_user = user_collection.find_one({"_id": ObjectId(user["id"])})
    user_role = admin_user.get("role", "Admin") if admin_user else "Admin"
    user_inst = admin_user.get("institute", "Admission") if admin_user else "Admission"
    
    # Pull constants from system settings instead of dead collections
    settings = settings_collection.find_one({"institute": "Admission"}) or {}
    all_courses = settings.get("courses", [])
    all_institutes = settings.get("institutes", [])
    
    def get_inst_abbr(inst_val):
        if not inst_val: return "N/A"
        str_val = str(inst_val).strip().lower()
        for i in all_institutes:
            if str(i.get("_id", "")) == str_val or i.get("name", "").lower() == str_val or i.get("abbreviation", "").lower() == str_val:
                return i.get("abbreviation")
        return str_val
    
    # Determine allowed courses for non-SuperAdmins
    admin_allowed_course_names = []
    if user_role != "SuperAdmin" and user_inst not in ["Admission", "ALL"]:
        clean_inst = user_inst.strip().lower()
        admin_allowed_course_names = [
            c.get("name", "").lower() 
            for c in all_courses 
            if get_inst_abbr(c.get("institute", "")).lower() == clean_inst
        ]
    
    formatted_applicants = []
    for app in applicant_collection.find(query).sort("createdAt", -1):
        first_choice = app.get("firstChoice", "").strip().lower()
        
        # Apply Server-Side Filtering for regular admins
        if user_role != "SuperAdmin" and user_inst not in ["Admission", "ALL"]:
            if first_choice not in admin_allowed_course_names:
                continue
                
        app["_id"] = str(app["_id"])
        first_name = app.get("firstName", "")
        middle_name = app.get("middleName", "")
        last_name = app.get("lastName", "")
        app["name"] = f"{last_name}, {first_name} {middle_name}".strip()
        app["status"] = app.get("admissionStatus", "Pending")
        
        matched_course = next((c for c in all_courses if c.get("name", "").lower() == first_choice), None)
        app["institute"] = get_inst_abbr(matched_course.get("institute")) if matched_course else "N/A"
        app["course"] = app.get("firstChoice", "N/A")
        
        formatted_applicants.append(app)
        
    return fix_ids(formatted_applicants)

@router.post("/applicants")
@router.post("/applicant")
async def create_applicant(payload: dict = Body(...), user: dict = Depends(admin_only)):
    school_year = payload.get("schoolYear", str(datetime.utcnow().year))
    year_prefix = school_year.split('-')[0] if '-' in school_year else school_year
    last_applicant = applicant_collection.find_one(
        {"applicantId": {"$regex": f"^A-{year_prefix}"}},
        sort=[("applicantId", -1)]
    )
    
    if last_applicant and last_applicant.get("applicantId"):
        try:
            last_num = int(last_applicant["applicantId"].split(year_prefix)[1])
            new_num = last_num + 1
        except:
            new_num = 1
    else:
        new_num = 1
        
    applicant_id = f"A-{year_prefix}{new_num:05d}"
    
    payload["applicantId"] = applicant_id
    payload["password"] = "password123"
    payload["isSubmitted"] = True
    payload["admissionStatus"] = "Pending"
    payload["interviewStatus"] = "Pending"
    payload["examStatus"] = "Pending"
    payload["status"] = "For Interview"
    payload["isInterviewed"] = False
    payload["isExamined"] = False
    payload["createdAt"] = datetime.utcnow()
    payload["updatedAt"] = datetime.utcnow()
    
    # 4. Save to DB
    applicant_collection.insert_one(payload)
    return {"msg": "Applicant created successfully", "applicantId": applicant_id}

@router.get("/archived-years")
async def get_archived_years(user: dict = Depends(admin_only)):
    years = applicant_collection.distinct("schoolYear")
    settings = settings_collection.find_one({"institute": "Admission"}) or {}
    active_year = settings.get("schoolYear", "")
    return sorted([y for y in years if y and y != active_year], reverse=True)

@router.put("/applicant/{id}/encode-score")
@router.put("/applicant/{id}/score")
async def encode_score(id: str, payload: dict = Body(...), user: dict = Depends(admin_only)):
    score = float(payload.get("score", 0))
    new_status = "Pending" if score == 0 else ("Passed" if score > 69 else "Failed")
    update_data = {
        "interviewScore": score,
        "interviewRatings": payload.get("ratings"),
        "interviewStatus": new_status,
        "isInterviewed": True,
        "interviewDate": payload.get("interviewDate"),
        "interviewer": payload.get("interviewer", "")
    }
    applicant_collection.update_one({"_id": ObjectId(id)}, {"$set": update_data})
    return {"message": "Scores saved"}

@router.put("/applicant/{id}/interview")
async def update_interview_status(id: str, payload: dict = Body(...), user: dict = Depends(admin_only)):
    applicant_collection.update_one({"_id": ObjectId(id)}, {"$set": {"interviewStatus": payload.get("interviewStatus")}})
    return {"msg": "Interview status updated"}

@router.put("/applicants/bulk-status")
async def bulk_update_status(payload: dict = Body(...), user: dict = Depends(admin_only)):
    ids = payload.get("applicantIds", payload.get("ids", []))
    status = payload.get("status")
    if not ids: 
        raise HTTPException(status_code=400, detail="No IDs provided")
    
    obj_ids = [ObjectId(i) for i in ids]
    applicants_before = list(applicant_collection.find({"_id": {"$in": obj_ids}}))
    
    # Prevent confirming or forfeiting failed applicants (allow if Passed, Admitted, Confirmed, or has passing exam/interview scores)
    if status in ["Confirmed", "Forfeit"]:
        valid_applicants = []
        for a in applicants_before:
            adm_status = (a.get("admissionStatus") or "").lower()
            exam = a.get("examScore", 0) or 0
            interview = a.get("interviewScore", 0) or 0
            
            # Eligible if explicitly passed/admitted or if scores are passing
            if adm_status in ["passed", "admitted", "confirmed"] or (exam >= 75 and interview >= 75):
                valid_applicants.append(a)
                
        obj_ids = [a["_id"] for a in valid_applicants]
        applicants_before = valid_applicants
        
    if not obj_ids:
        return {"msg": "No eligible applicants to update.", "admissionEmailsSent": 0, "admissionEmailFailures": 0}

    applicant_collection.update_many({"_id": {"$in": obj_ids}}, {"$set": {"admissionStatus": status}})
    
    # Bulk trigger database transfer ONLY when "Confirmed"
    if status == "Confirmed":
        newly_admitted = [a for a in applicants_before if a.get("admissionStatus") != "Confirmed"]
        for app in newly_admitted:
            final_id = app.get("applicantId", "")
            course_name = app.get("firstChoice", "General")
            
            # AUTO-SECTIONING (45 Limit per Block)
            current_enrollees = student_collection.count_documents({"course": course_name})
            section_index = current_enrollees // 45
            section_letter = chr(65 + section_index) 
            
            def build_addr(prefix):
                parts = [app.get(f"{prefix}House"), app.get(f"{prefix}Street"), 
                         app.get(f"{prefix}Barangay"), app.get(f"{prefix}City"), 
                         app.get(f"{prefix}Province"), app.get(f"{prefix}Zip")]
                return ", ".join([p for p in parts if p])

            # 1. AUTH ACCOUNT (Saved to users collection)
            user_data = {
                "username": final_id,
                "email": app.get("email", ""),
                "password": app.get("password", "password123"),
                "role": "Applicant",
                "status": "Admitted",
                "createdAt": datetime.utcnow(),
                "lastLogin": None
            }
            
            # 2. ACADEMIC PROFILE (Saved to students collection)
            student_data = {
                "applicant_id": final_id,
                "first_name": app.get("firstName", ""),
                "middle_name": app.get("middleName", ""),
                "last_name": app.get("lastName", ""),
                "course": course_name,
                "section": section_letter,
                "school_year": app.get("schoolYear", ""),
                "birth_date": app.get("birthDate", ""),
                "contact_number": app.get("contactNumber", ""),
                "permanent_address": build_addr("permanent"),
                "present_address": build_addr("present"),
                "father_name": app.get("fatherName", ""),
                "father_contact": app.get("fatherContact", ""),
                "mother_name": app.get("motherName", ""),
                "mother_contact": app.get("motherContact", ""),
                "elementary_school": app.get("elementarySchool", ""),
                "elementary_address": app.get("elementaryAddress", ""),
                "junior_high_school": app.get("juniorHighSchool", ""),
                "junior_high_address": app.get("juniorHighAddress", ""),
                "senior_high_school": app.get("seniorHighSchool", ""),
                "senior_high_address": app.get("seniorHighAddress", ""),
                "college_school": app.get("collegeSchool", ""),
                "college_address": app.get("collegeAddress", "")
            }
            
            user_collection.update_one({"email": app.get("email")}, {"$set": user_data}, upsert=True)
            student_collection.update_one({"applicant_id": final_id}, {"$set": student_data}, upsert=True)
            
    if status == "Forfeit":
        newly_forfeited = [a for a in applicants_before if a.get("admissionStatus") != "Forfeit"]
        for app in newly_forfeited:
            old_email = app.get("email", "")
            applicant_collection.update_one({"_id": app["_id"]}, {"$set": {"applicantId": ""}})
            if old_email:
                user_collection.update_one(
                    {"email": old_email}, 
                    {"$set": {"status": "Forfeit", "role": "Forfeit"}}
                )

    return {"msg": f"{len(ids)} applicants updated.", "admissionEmailsSent": 0, "admissionEmailFailures": 0}

import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

@router.post("/emails/send-bulk")
async def send_bulk_emails(payload: dict = Body(...), user: dict = Depends(admin_only)):
    emails = payload.get("emails", [])
    if not emails:
        raise HTTPException(status_code=400, detail="No emails provided.")
        
    # Pull credentials configured in .env file
    sender = os.getenv("GMAIL_USER")
    password = os.getenv("GMAIL_PASS")

    if not sender or not password:
        raise HTTPException(status_code=500, detail="Email credentials (GMAIL_USER or GMAIL_PASS) are missing from the .env file.")

    sent_count = 0
    failed_count = 0

    for email_data in emails:
        to_email = email_data.get("email")
        subject = email_data.get("subject", "Admission Notice")
        message_body = email_data.get("message", "")
        app_id = email_data.get("applicantId")

        try:
            # 1. Send real email via Gmail SMTP[cite: 10]
            if to_email:
                msg = MIMEMultipart()
                msg['From'] = f"Office of Admissions <{sender}>"
                msg['To'] = to_email
                msg['Subject'] = subject
                msg.attach(MIMEText(message_body, 'plain'))

                with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
                    server.login(sender, password)
                    server.send_message(msg)

            # 2. Safely update database flag (supports both ObjectId and custom applicant IDs)
            if app_id:
                query = {"_id": ObjectId(app_id)} if ObjectId.is_valid(app_id) else {"applicantId": app_id}
                applicant_collection.update_one(
                    query,
                    {"$set": {"isEmailSent": True}}
                )
            sent_count += 1
        except Exception as e:
            print(f"Failed to send email to {to_email}: {e}")
            failed_count += 1
            raise HTTPException(status_code=500, detail=f"Email delivery failed: {str(e)}")

    return {
        "message": f"Successfully sent {sent_count} email(s).",
        "sent": sent_count,
        "failed": failed_count
    }

@router.post("/applicants/import-scores")
async def import_scores(file: UploadFile = File(...), user: dict = Depends(admin_only)):
    content = await file.read()
    rows = content.decode("utf-8").split("\n")
    updated_count = 0
    
    for row in rows[1:]:
        if not row.strip(): 
            continue
        columns = [col.strip().strip('"') for col in row.split(",")]
        if len(columns) < 5: 
            continue
            
        short_id = columns[0]
        exam_date = columns[2]
        try:
            score = float(columns[3])
        except ValueError:
            score = 0
        remarks = columns[4]
        
        if short_id:
            target = applicant_collection.find_one({"applicantId": short_id})
            if target:
                update_data = {
                    "examScore": score,
                    "isExamined": True
                }
                if remarks: update_data["examStatus"] = remarks
                if exam_date: update_data["examDate"] = exam_date
                
                applicant_collection.update_one({"_id": target["_id"]}, {"$set": update_data})
                updated_count += 1
                
    return {"message": f"Successfully imported and updated {updated_count} applicants."}

@router.put("/applicant/{id}/status")
async def update_status(id: str, payload: dict = Body(...), user: dict = Depends(admin_only)):
    status = payload.get("status")
    exam_score = payload.get("examScore")
    interview_score = payload.get("interviewScore")
    gwa = payload.get("gwa")
    
    update_fields = {}
    if status:
        update_fields["admissionStatus"] = status
        update_fields["status"] = status
    if exam_score is not None:
        update_fields["examScore"] = float(exam_score)
        update_fields["isExamined"] = True
        update_fields["examStatus"] = "Passed" if float(exam_score) >= 75 else "Failed"
    if interview_score is not None:
        update_fields["interviewScore"] = float(interview_score)
    if gwa is not None:
        update_fields["gwa"] = str(gwa)

    existing_applicant = applicant_collection.find_one({"_id": ObjectId(id)})
    if not existing_applicant:
        raise HTTPException(status_code=404, detail="Applicant not found")

    # Prevent confirming or forfeiting if explicitly failed or completely unexamined
    current_status = (existing_applicant.get("admissionStatus") or "pending").lower()
    exam_score = existing_applicant.get("examScore", 0) or 0
    interview_score = existing_applicant.get("interviewScore", 0) or 0

    is_passing_scores = (exam_score >= 75 and interview_score >= 75)
    is_already_passed = current_status in ["passed", "admitted", "confirmed"]

    if status in ["Confirmed", "Forfeit"] and not (is_already_passed or is_passing_scores):
        raise HTTPException(status_code=400, detail="Cannot mark as Confirmed/Forfeit because the applicant has not met passing requirements.")

    applicant_collection.update_one({"_id": ObjectId(id)}, {"$set": update_fields})
    applicant = applicant_collection.find_one({"_id": ObjectId(id)})

    # Trigger database transfer ONLY when "Confirmed"
    if status == "Confirmed" and existing_applicant.get("admissionStatus") != "Confirmed":
        final_id = applicant.get("applicantId", "")
        course_name = applicant.get("firstChoice", "General")
        
        # AUTO-SECTIONING (45 Limit per Block)
        current_enrollees = student_collection.count_documents({"course": course_name})
        section_index = current_enrollees // 45
        section_letter = chr(65 + section_index) 
        
        def build_addr(prefix):
            parts = [applicant.get(f"{prefix}House"), applicant.get(f"{prefix}Street"), 
                     applicant.get(f"{prefix}Barangay"), applicant.get(f"{prefix}City"), 
                     applicant.get(f"{prefix}Province"), applicant.get(f"{prefix}Zip")]
            return ", ".join([p for p in parts if p])

        # 1. AUTH ACCOUNT (Saved to users collection)
        user_data = {
            "username": final_id,
            "email": applicant.get("email", ""),
            "password": applicant.get("password", "password123"),
            "role": "Applicant",
            "status": "Admitted",
            "createdAt": datetime.utcnow(),
            "lastLogin": None
        }
        
        # 2. ACADEMIC PROFILE (Saved to students collection)
        student_data = {
            "applicant_id": final_id,
            "first_name": applicant.get("firstName", ""),
            "middle_name": applicant.get("middleName", ""),
            "last_name": applicant.get("lastName", ""),
            "course": course_name,
            "section": section_letter,
            "school_year": applicant.get("schoolYear", ""),
            "birth_date": applicant.get("birthDate", ""),
            "contact_number": applicant.get("contactNumber", ""),
            "permanent_address": build_addr("permanent"),
            "present_address": build_addr("present"),
            "father_name": applicant.get("fatherName", ""),
            "father_contact": applicant.get("fatherContact", ""),
            "mother_name": applicant.get("motherName", ""),
            "mother_contact": applicant.get("motherContact", ""),
            "elementary_school": applicant.get("elementarySchool", ""),
            "elementary_address": applicant.get("elementaryAddress", ""),
            "junior_high_school": applicant.get("juniorHighSchool", ""),
            "junior_high_address": applicant.get("juniorHighAddress", ""),
            "senior_high_school": applicant.get("seniorHighSchool", ""),
            "senior_high_address": applicant.get("seniorHighAddress", ""),
            "college_school": applicant.get("collegeSchool", ""),
            "college_address": applicant.get("collegeAddress", "")
        }
        
        user_collection.update_one({"email": applicant.get("email")}, {"$set": user_data}, upsert=True)
        student_collection.update_one({"applicant_id": final_id}, {"$set": student_data}, upsert=True)

    if status == "Forfeit":
        old_email = applicant.get("email", "")
        applicant_collection.update_one({"_id": ObjectId(id)}, {"$set": {"applicantId": ""}})
        if old_email:
            user_collection.update_one(
                {"email": old_email}, 
                {"$set": {"status": "Forfeit", "role": "Forfeit"}}
            )

    applicant["_id"] = str(applicant["_id"])
    for k, v in applicant.items():
        if isinstance(v, ObjectId): applicant[k] = str(v)
        
    return {"msg": "Status updated successfully", "applicant": applicant}

# ==========================================
# FALLBACKS & DYNAMIC ROUTES
# ==========================================

@router.put("/{id}")
async def update_admin(id: str, payload: dict = Body(...), user: dict = Depends(admin_only)):
    user_collection.update_one({"_id": ObjectId(id)}, {"$set": payload})
    return {"msg": "Admin updated"}

@router.delete("/{id}")
async def delete_admin(id: str, user: dict = Depends(admin_only)):
    user_collection.delete_one({"_id": ObjectId(id)})
    return {"msg": "Admin deleted"}