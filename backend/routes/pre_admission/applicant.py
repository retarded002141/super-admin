import os
import json
import random
import string
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from datetime import datetime, timedelta
from routes.pre_admission.admin import fix_ids
from utils.pre_admission.pdf_generator import generate_application_form_pdf
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Body
from bson import ObjectId
from passlib.context import CryptContext

from database import applicant_collection, settings_collection, notification_collection, db
from middlewares.auth import get_current_user, applicant_only
from utils.file_upload import save_upload

router = APIRouter(prefix="/api/applicant", tags=["Applicant"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = os.getenv("JWT_SECRET")

# ==========================================
# AUTHENTICATION
# ==========================================

@router.post("/send-signup-otp")
async def send_signup_otp(payload: dict = Body(...)):
    email = payload.get("email", "").strip().lower()
    if applicant_collection.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    otp_code = str(random.randint(100000, 999999))
    
    # Save temporary OTP for registration (expires in 10 minutes)
    db.otps.update_one(
        {"email": email},
        {"$set": {"otp": otp_code, "expire": datetime.utcnow() + timedelta(minutes=10)}},
        upsert=True
    )

    sender = os.getenv("GMAIL_USER")
    mail_pass = os.getenv("GMAIL_PASS")
    if sender and mail_pass:
        try:
            msg = MIMEMultipart()
            msg['From'] = f"Office of Admissions <{sender}>"
            msg['To'] = email
            msg['Subject'] = "Verify Your Email - BTECH Admission"
            body = f"Your email verification code is: {otp_code}\n\nThis code expires in 10 minutes."
            msg.attach(MIMEText(body, 'plain'))
            with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
                server.login(sender, mail_pass)
                server.send_message(msg)
        except Exception as e:
            print("Failed to send signup OTP email:", e)
            raise HTTPException(status_code=500, detail="Failed to send email.")
            
    return {"msg": "Verification code sent."}

@router.post("/register")
async def register(payload: dict = Body(...)):
    settings = settings_collection.find_one({"institute": "Admission"})
    
    # Auto School Year logic
    current_school_year = "2025-2026"
    if settings and settings.get("schoolYear"):
        current_school_year = settings["schoolYear"]
    else:
        today = datetime.now()
        year = today.year
        current_school_year = f"{year}-{year + 1}" if today.month >= 6 else f"{year - 1}-{year}"

    # Check deadlines and status
    if settings:
        if settings.get("admissionStatus") in ["Closed", False]:
            raise HTTPException(status_code=403, detail="Admission is currently CLOSED.")
        
        deadline = settings.get("applicationDeadline")
        
        # Safely convert the database string into a Python datetime object
        if deadline:
            if isinstance(deadline, str):
                try:
                    # Clean up JavaScript ISO strings (e.g., '2024-12-31T23:59:59.000Z')
                    clean_date = deadline.replace("Z", "").split("+")[0]
                    deadline = datetime.fromisoformat(clean_date)
                except ValueError:
                    deadline = None # Ignore deadline if it's an invalid format
                    
            if deadline and datetime.now() > deadline:
                raise HTTPException(status_code=403, detail="Application deadline has passed.")

    email = payload.get("email")
    password = payload.get("password")

    if not email or not password:
        raise HTTPException(status_code=400, detail="Missing required fields")

    if applicant_collection.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    # --- EMAIL VERIFICATION CHECK ---
    # NOTE: You can comment out this block later during testing if you want to bypass OTP
    provided_otp = payload.get("otp", "").strip()
    otp_record = db.otps.find_one({"email": email})
    
    if not otp_record or otp_record.get("otp") != provided_otp:
        raise HTTPException(status_code=400, detail="Invalid verification code.")
    if datetime.utcnow() > otp_record.get("expire", datetime.utcnow()):
        raise HTTPException(status_code=400, detail="Verification code expired. Please request a new one.")
        
    db.otps.delete_one({"email": email})
    # --------------------------------

    # Keep password as plain text
    new_applicant = {
        "email": email,
        "password": password, 
        "schoolYear": current_school_year,
        "isSubmitted": False,
        "admissionStatus": "Pending",
        "createdAt": datetime.utcnow()
    }
    
    applicant_collection.insert_one(new_applicant)
    return {"msg": "Registered successfully"}

@router.post("/login")
async def login(payload: dict = Body(...)):
    email = payload.get("email")
    password = payload.get("password")

    applicant = applicant_collection.find_one({"email": email})
    if not applicant or applicant.get("password") != password:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    import jwt
    import os
    
    SECRET_KEY = os.getenv("JWT_SECRET")
    
    token = jwt.encode(
        {"id": str(applicant["_id"]), "role": "Applicant"},
        SECRET_KEY,
        algorithm="HS256"
    )

    return {
        "token": token,
        "applicant": {"id": str(applicant["_id"]), "email": applicant["email"]}
    }

# ==========================================
# PROFILE MANAGEMENT
# ==========================================

@router.get("/profile")
async def get_profile(user: dict = Depends(applicant_only)):
    applicant = applicant_collection.find_one({"_id": ObjectId(user["id"])}, {"password": 0})
    if not applicant:
        raise HTTPException(status_code=404, detail="Applicant not found")
    
    return fix_ids(applicant)

@router.put("/profile")
async def update_profile(
    data: str = Form(...), 
    photo: UploadFile = File(None), 
    user: dict = Depends(applicant_only)
):
    settings = settings_collection.find_one({"institute": "Admission"})
    if settings and settings.get("admissionStatus") in ["Closed", False]:
        raise HTTPException(status_code=403, detail="The admission portal is currently closed. You are in read-only mode.")

    parsed_data = json.loads(data)
    applicant_id = user["id"]

    # Duplicate name check
    if not parsed_data.get("education") and parsed_data.get("firstName"):
        duplicate = applicant_collection.find_one({
            "_id": {"$ne": ObjectId(applicant_id)},
            "firstName": {"$regex": f"^{parsed_data['firstName'].strip()}$", "$options": "i"},
            "lastName": {"$regex": f"^{parsed_data['lastName'].strip()}$", "$options": "i"},
            "birthDate": parsed_data.get("birthDate")
        })
        if duplicate:
            applicant_collection.delete_one({"_id": ObjectId(applicant_id)})
            raise HTTPException(status_code=409, detail="Applicant name already exists! ACTION:LOGOUT")

    update_data = {}
    education_fields = ["elementarySchool", "elementaryAddress", "elementaryYear", "juniorHighSchool", "juniorHighAddress", "juniorHighYear", "seniorHighSchool", "seniorHighAddress", "seniorHighYear", "seniorHighGwa", "collegeSchool", "collegeAddress", "collegeYear"]
    
    education_data = parsed_data.get("education")
    if not education_data and any(k in parsed_data for k in education_fields):
        education_data = parsed_data

    if education_data:
        for field in education_fields:
            if field in education_data:
                update_data[field] = education_data[field]
    else:
        # Standard Info
        to_title = lambda s: s.title().strip() if s else ""
        
        update_data["applicantType"] = parsed_data.get("applicantType")
        update_data["schoolYear"] = settings.get("schoolYear") if settings else parsed_data.get("schoolYear")
        update_data["firstChoice"] = parsed_data.get("firstChoice")
        update_data["secondChoice"] = parsed_data.get("secondChoice")
        update_data["birthDate"] = parsed_data.get("birthDate")
        update_data["civilStatus"] = parsed_data.get("civilStatus")
        
        update_data["firstName"] = to_title(parsed_data.get("firstName"))
        update_data["middleName"] = to_title(parsed_data.get("middleName"))
        update_data["lastName"] = to_title(parsed_data.get("lastName"))
        update_data["spouseName"] = to_title(parsed_data.get("spouseName"))
        update_data["suffix"] = parsed_data.get("suffix")
        update_data["gender"] = parsed_data.get("gender")
        update_data["placeOfBirth"] = parsed_data.get("placeOfBirth")
        update_data["contactNumber"] = parsed_data.get("contactNumber")

        # Address & Family
        update_data["isSameAddress"] = parsed_data.get("isSameAddress", False)
        
        if "permanentAddress" in parsed_data:
            for k in ["house", "street", "province", "city", "barangay", "zip"]:
                update_data[f"permanent{k.title()}"] = parsed_data["permanentAddress"].get(k)
                
        if "presentAddress" in parsed_data:
            for k in ["house", "street", "province", "city", "barangay", "zip"]:
                update_data[f"present{k.title()}"] = parsed_data["presentAddress"].get(k)

        update_data["fatherName"] = to_title(parsed_data.get("fatherName"))
        update_data["fatherContact"] = parsed_data.get("fatherContact")
        update_data["motherName"] = to_title(parsed_data.get("motherName"))
        update_data["motherContact"] = parsed_data.get("motherContact")

        update_data["disability"] = parsed_data.get("disability", False)
        update_data["indigenous"] = parsed_data.get("indigenous", False)
        update_data["soloParent"] = parsed_data.get("soloParent", False)
        update_data["fourPs"] = parsed_data.get("fourPs", False)

    # Clean None values
    update_data = {k: v for k, v in update_data.items() if v is not None}

    # Handle file upload
    if photo:
        file_path = await save_upload(photo, "photo")
        update_data["photo"] = f"/{file_path}"

    applicant_collection.update_one({"_id": ObjectId(applicant_id)}, {"$set": update_data})
    updated_applicant = applicant_collection.find_one({"_id": ObjectId(applicant_id)}, {"password": 0})
    
    return fix_ids(updated_applicant)

@router.post("/upload")
async def upload_requirements(
    documents: list[UploadFile] = File(...), 
    user: dict = Depends(applicant_only)
):
    settings = settings_collection.find_one({"institute": "Admission"})
    if settings and settings.get("admissionStatus") in ["Closed", False]:
        raise HTTPException(status_code=403, detail="The admission portal is currently closed. You are in read-only mode.")

    applicant = applicant_collection.find_one({"_id": ObjectId(user["id"])})
    if not applicant:
        raise HTTPException(status_code=404, detail="Applicant not found")

    if applicant.get("isSubmitted"):
        raise HTTPException(status_code=403, detail="Application already submitted. Editing is disabled.")

    # Changed from files to documents
    if not documents or len(documents) == 0:
        raise HTTPException(status_code=400, detail="No documents uploaded")

    docs = []
    # Changed from files to documents
    for f in documents:
        file_path = await save_upload(f, "documents")
        docs.append({
            "filename": f.filename,
            "originalName": f.filename,
            "path": f"/{file_path}",
            "uploadedAt": datetime.utcnow()
        })

    applicant_collection.update_one(
        {"_id": ObjectId(user["id"])},
        {"$push": {"documents": {"$each": docs}}}
    )

    if settings and settings.get("notifications", {}).get("docUploads", True):
        try:
            notification_collection.insert_one({
                "institute": "Admission",
                "title": "Documents Uploaded",
                "message": f"{applicant.get('email')} has uploaded {len(documents)} new document(s).",
                "type": "info",
                "isRead": False,
                "createdAt": datetime.utcnow()
            })
        except Exception as e:
            print(f"Notification Error: {e}")

    updated_applicant = applicant_collection.find_one({"_id": ObjectId(user["id"])})
    
    return {
        "msg": "Requirements uploaded successfully",
        "documents": updated_applicant.get("documents", [])
    }

# ==========================================
# FINAL SUBMISSION & UPLOADS
# ==========================================

@router.post("/final-submit")
async def final_submit(
    applicationForm: UploadFile = File(None),
    interviewDate: str = Form(None),
    user: dict = Depends(applicant_only)
):
    settings = settings_collection.find_one({"institute": "Admission"})
    if settings and settings.get("admissionStatus") in ["Closed", False]:
        raise HTTPException(status_code=403, detail="The admission portal is currently closed.")

    applicant = applicant_collection.find_one({"_id": ObjectId(user["id"])})
    if not applicant:
        raise HTTPException(status_code=404, detail="Applicant not found")

    if applicant.get("isSubmitted"):
        raise HTTPException(status_code=403, detail="Application already submitted")

    # Gap Finder ID Generator (A-YYYYXXXX)
    applicant_id_str = applicant.get("applicantId")
    if not applicant_id_str:
        current_year = datetime.now().year
        all_apps = applicant_collection.find({"applicantId": {"$regex": f"{current_year}"}})
        
        used_numbers = []
        for app in all_apps:
            app_id = app.get("applicantId", "")
            if not app_id or "-VOID" in app_id: continue
            
            num_str = app_id.replace(f"A-{current_year}", "").replace(str(current_year), "")
            if num_str.isdigit():
                used_numbers.append(int(num_str))
                
        used_numbers.sort()
        sequence = 1
        for num in used_numbers:
            if num == sequence:
                sequence += 1
            elif num > sequence:
                break
                
        applicant_id_str = f"A-{current_year}{str(sequence).zfill(5)}"
        applicant_collection.update_one(
            {"_id": ObjectId(user["id"])}, 
            {"$set": {"applicantId": applicant_id_str}}
        )

    # Finalize Submission
    update_data = {
        "isSubmitted": True,
        "admissionStatus": "Pending",
        "interviewStatus": "Pending",
        "examStatus": "Pending"
    }
    if interviewDate:
        update_data["interviewDate"] = interviewDate

    applicant_collection.update_one({"_id": ObjectId(user["id"])}, {"$set": update_data})

    # Trigger New App Notification
    if settings and settings.get("notifications", {}).get("emailNewApp", True):
        try:
            first_name = applicant.get('firstName', '')
            last_name = applicant.get('lastName', '')
            notification_collection.insert_one({
                "institute": "Admission",
                "title": "New Application Received",
                "message": f"Applicant {first_name} {last_name} ({applicant_id_str}) has submitted their application.",
                "type": "info",
                "isRead": False,
                "createdAt": datetime.utcnow()
            })
        except Exception as e:
            print(f"Failed to create new app notification: {e}")

    # Send Submission Confirmation Email
    confirmation_sent = False
    sender = os.getenv("GMAIL_USER")
    mail_pass = os.getenv("GMAIL_PASS")
    
    if sender and mail_pass:
        try:
            msg = MIMEMultipart()
            msg['From'] = f"Office of Admissions <{sender}>"
            msg['To'] = applicant.get("email")
            msg['Subject'] = f"Application Received: BTECH - {applicant.get('firstName', '')} {applicant.get('lastName', '')}"
            
            body = (
                f"Dear {applicant.get('firstName', '')},\n\n"
                f"Thank you for applying to Baliwag Polytechnic College.\n"
                f"Your official Applicant ID is: {applicant_id_str}\n\n"
                f"Please monitor your dashboard for updates regarding your interview date.\n"
            )
            msg.attach(MIMEText(body, 'plain'))
            
            with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
                server.login(sender, mail_pass)
                server.send_message(msg)
            confirmation_sent = True
        except Exception as e:
            print("Failed to send confirmation email:", e)
    
    return {
        "msg": "Application successfully submitted",
        "applicantId": applicant_id_str,
        "confirmationEmailSent": confirmation_sent
    }

# ==========================================
# OTP & RECOVERY
# ==========================================

@router.post("/otp/send")
async def send_otp(payload: dict = Body(...)):
    email = payload.get("email")
    applicant = applicant_collection.find_one({"email": email})
    
    if not applicant:
        raise HTTPException(status_code=404, detail="Email not found.")

    otp_code = str(random.randint(100000, 999999))
    otp_hash = pwd_context.hash(otp_code)
    
    applicant_collection.update_one(
        {"email": email}, 
        {"$set": {
            "otpCodeHash": otp_hash, 
            "otpExpiresAt": datetime.utcnow() + timedelta(minutes=10)
        }}
    )

    # Send actual OTP Email
    sender = os.getenv("GMAIL_USER")
    password = os.getenv("GMAIL_PASS")
    
    if sender and password:
        try:
            msg = MIMEMultipart()
            msg['From'] = f"Office of Admissions <{sender}>"
            msg['To'] = email
            msg['Subject'] = "Your BTECH Verification OTP"
            body = f"Your OTP code is: {otp_code}\n\nThis code will expire in 10 minutes."
            msg.attach(MIMEText(body, 'plain'))
            
            with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
                server.login(sender, password)
                server.send_message(msg)
        except Exception as e:
            print("Failed to send OTP email:", e)
            
    return {"msg": "OTP has been sent to your email."}

@router.post("/otp/verify")
async def verify_otp(payload: dict = Body(...)):
    email = payload.get("email")
    otp = payload.get("otp")
    
    applicant = applicant_collection.find_one({"email": email})
    if not applicant or not applicant.get("otpCodeHash"):
        raise HTTPException(status_code=400, detail="No active OTP found. Please request a new code.")

    if datetime.utcnow() > applicant.get("otpExpiresAt", datetime.utcnow()):
        applicant_collection.update_one({"email": email}, {"$unset": {"otpCodeHash": "", "otpExpiresAt": ""}})
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new code.")

    if not pwd_context.verify(str(otp), applicant["otpCodeHash"]):
        raise HTTPException(status_code=400, detail="Invalid OTP.")

    # Clear OTP
    applicant_collection.update_one({"email": email}, {"$unset": {"otpCodeHash": "", "otpExpiresAt": ""}})

    # Generate Real JWT Token
    import jwt
    import os
    SECRET_KEY = os.getenv("JWT_SECRET")
    
    token = jwt.encode(
        {"id": str(applicant["_id"]), "role": "Applicant"},
        SECRET_KEY,
        algorithm="HS256"
    )

    return {
        "msg": "OTP verified successfully.",
        "token": token,
        "applicant": {"id": str(applicant["_id"]), "email": applicant["email"]}
    }

@router.post("/forgot-password")
async def forgot_password(payload: dict = Body(...)):
    email = payload.get("email")
    applicant = applicant_collection.find_one({"email": email})
    
    if not applicant:
        raise HTTPException(status_code=404, detail="Email not found.")

    temp_password = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    
    # Optional: If you want to hash it in the future, uncomment this:
    # temp_password = pwd_context.hash(temp_password)
    applicant_collection.update_one({"email": email}, {"$set": {"password": temp_password}})

    sender = os.getenv("GMAIL_USER")
    mail_pass = os.getenv("GMAIL_PASS")
    
    if sender and mail_pass:
        try:
            msg = MIMEMultipart()
            msg['From'] = f"Office of Admissions <{sender}>"
            msg['To'] = email
            msg['Subject'] = "Your Temporary Password"
            body = f"Your temporary password is: {temp_password}\n\nPlease log in and change this immediately."
            msg.attach(MIMEText(body, 'plain'))
            
            with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
                server.login(sender, mail_pass)
                server.send_message(msg)
        except Exception as e:
            print("Failed to send Temp Password email:", e)

    return {"msg": "A temporary password has been sent to your email."}

@router.post("/type")
async def set_applicant_type(payload: dict = Body(...), user: dict = Depends(applicant_only)):
    settings = settings_collection.find_one({"institute": "Admission"})
    if settings and settings.get("admissionStatus") in ["Closed", False]:
        raise HTTPException(status_code=403, detail="The admission portal is currently closed.")

    applicant_type = payload.get("applicantType", "").strip().lower()
    normalized = None

    if applicant_type in ["senior high school graduate", "shs graduate"]:
        normalized = "SHS Graduate"
    elif applicant_type == "als":
        normalized = "ALS Graduate"
    elif applicant_type == "returnee":
        normalized = "Returnee"
    elif applicant_type == "transferee":
        normalized = "Transferee"

    if not normalized:
        raise HTTPException(status_code=400, detail="Invalid applicant type")

    applicant_collection.update_one(
        {"_id": ObjectId(user["id"])}, 
        {"$set": {"applicantType": normalized}}
    )
    return {"msg": "Applicant type saved successfully", "applicantType": normalized}

# ==========================================
# INTERVIEW SCHEDULING (SLOTS)
# ==========================================

@router.get("/slots")
async def get_interview_slots(year: str = None, month: str = None, user: dict = Depends(applicant_only)):
    slots_collection = db["slots"]
    
    # Only fetch active slots
    query = {"isActive": True}
    
    # Filter by year and month if provided by the React calendar
    if year and month:
        # Ensures month is 2 digits (e.g., "7" becomes "07") to match "YYYY-MM-DD" format
        month_str = str(month).zfill(2) 
        query["date"] = {"$regex": f"^{year}-{month_str}"}
        
    slots = []
    for slot in slots_collection.find(query):
        slot["_id"] = str(slot["_id"])
        slots.append(slot)
        
    return slots