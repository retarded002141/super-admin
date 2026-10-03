import os
import hashlib
import secrets
import random
from datetime import datetime, timedelta
from utils.pre_admission.pdf_generator import generate_application_form_pdf
from fastapi import APIRouter, Depends, HTTPException, Response, Body, Request, UploadFile, File
from bson import ObjectId
import bcrypt
from schemas.pre_admission_payloads import (
    UpdateAdminPayload, CreateLogPayload,
    CoursePayload, InstitutePayload, EncodeScorePayload, UpdateInterviewStatusPayload,
    BulkUpdateStatusPayload, SendBulkEmailsPayload, ReassignProgramPayload,
    UpdateStatusPayload, UpdateEmailTemplatePayload, GenericDictPayload
)

from utils.file_upload import save_upload

class SimpleCryptContext:
    def _prepare_secret(self, secret: str) -> bytes:
        return secret.encode('utf-8')[:72]

    def hash(self, secret: str) -> str:
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(self._prepare_secret(secret), salt)
        return hashed.decode('utf-8')

    def verify(self, secret: str, hash_str: str) -> bool:
        try:
            return bcrypt.checkpw(self._prepare_secret(secret), hash_str.encode('utf-8'))
        except (ValueError, TypeError):
            return False

pwd_context = SimpleCryptContext()

from pymongo import ReplaceOne
# Import database collections
from database import (
    user_collection, applicant_collection, archived_applicant_collection, settings_collection, 
    audit_collection, rubric_collection, notification_collection, student_collection,
    archived_settings_collection
)
from middlewares.auth import get_current_user, admin_only
from utils.pre_admission.program_capacity import with_capacity_status

# Set up the router
router = APIRouter(prefix="/api/admin", tags=["Admin"])

def get_next_student_number(current_year: int) -> str:
    # Find all confirmed applicants who already have a student number for this year
    all_apps = applicant_collection.find({
        "applicantId": {"$regex": f"^{current_year}"}
    })
    
    used_numbers = []
    for app in all_apps:
        app_id = app.get("applicantId", "")
        # Only consider IDs that are strictly numeric and start with the year
        if app_id.isdigit() and app_id.startswith(str(current_year)):
            num_str = app_id.replace(str(current_year), "")
            if num_str.isdigit():
                used_numbers.append(int(num_str))
                
    used_numbers.sort()
    sequence = 1
    for num in used_numbers:
        if num == sequence:
            sequence += 1
        elif num > sequence:
            break
            
    return f"{current_year}{str(sequence).zfill(5)}"

def get_auto_section(course: str, school_year: str) -> str:
    """Automatically calculates the section based on 45 students per section."""
    if not course or not school_year:
        return "A"
        
    # Count how many students are already in this course and year with a section
    student_count = applicant_collection.count_documents({
        "firstChoice": course,
        "schoolYear": school_year,
        "status": "Passed",
        "admissionRemarks": "Passed",
        "slotStatus": "Admitted",
        "section": {"$exists": True}
    })
    
    # 0-44 = A, 45-89 = B, etc.
    section_index = student_count // 45
    section_letter = chr(65 + (section_index % 26)) 
    
    return section_letter

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
# SYSTEM SETTINGS & LOGS
# ==========================================

from utils.pre_admission.admission_status import evaluate_admission_status

@router.get("/settings")
async def get_system_settings(request: Request, user: dict = Depends(admin_only)):
    archive_year = request.headers.get("archiveviewyear")
    if archive_year:
        settings = archived_settings_collection.find_one({"institute": "Admission", "schoolYear": archive_year})
        if settings:
            settings["_id"] = str(settings["_id"])
            return settings
            
    settings = settings_collection.find_one({"institute": "Admission"})
    if not settings:
        default_settings = {"institute": "Admission", "systemName": "Pre-Admission", "admissionStatus": "Open"}
        settings_collection.insert_one(default_settings)
        settings = default_settings
    settings, needs_save = evaluate_admission_status(settings)
    if needs_save:
        settings_collection.update_one({"institute": "Admission"}, {"$set": {
            "admissionStatus": settings.get("admissionStatus"),
            "admissionOpen": settings.get("admissionOpen"),
            "autoState": settings.get("autoState")
        }})
        
    settings["_id"] = str(settings["_id"])
    return settings

@router.put("/settings")
async def update_settings(payload: GenericDictPayload = Body(...), user: dict = Depends(admin_only)):
    payload = payload.model_dump()
    payload.pop("_id", None)
    payload["institute"] = "Admission"
    

    payload, needs_save = evaluate_admission_status(payload)
    
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
async def create_log(payload: CreateLogPayload = Body(...), user: dict = Depends(admin_only)):
    payload = payload.model_dump()
    payload["institute"] = "Admission"
    payload["timestamp"] = datetime.utcnow()
    
    if "user" not in payload or not payload.get("user") or payload.get("user") == "System":
        try:
            admin_doc = user_collection.find_one({"_id": ObjectId(user["id"])})
            if admin_doc and "username" in admin_doc:
                payload["user"] = admin_doc["username"]
        except Exception:
            pass

    audit_collection.insert_one(payload)
    return {"msg": "Activity logged"}

@router.delete("/logs/clear-all")
@router.delete("/logs")
async def clear_logs(user: dict = Depends(admin_only)):
    audit_collection.delete_many({"institute": "Admission"})
    return {"msg": "Admission logs cleared"}

# ==========================================
# DATABASE BACKUP
# ==========================================

@router.get("/backup")
async def download_backup(user: dict = Depends(admin_only)):
    """Export all key collections to a JSON file and stream it as a download."""
    import json
    from fastapi.responses import StreamingResponse
    import io

    def serialize(doc):
        """Recursively convert ObjectId and datetime to string."""
        if isinstance(doc, dict):
            return {k: serialize(v) for k, v in doc.items()}
        if isinstance(doc, list):
            return [serialize(i) for i in doc]
        try:
            from bson import ObjectId as ObjId
            if isinstance(doc, ObjId):
                return str(doc)
        except Exception:
            pass
        if isinstance(doc, datetime):
            return doc.isoformat()
        return doc

    backup = {
        "exported_at": datetime.utcnow().isoformat(),
        "applicants": [serialize(d) for d in applicant_collection.find({})],
        "archived_applicants": [serialize(d) for d in archived_applicant_collection.find({})],
        "system_settings": [serialize(d) for d in settings_collection.find({})],
        "audit_logs": [serialize(d) for d in audit_collection.find({}).limit(500)],
        "users": [serialize({k: v for k, v in d.items() if k != "password"}) for d in user_collection.find({})],
    }

    json_bytes = json.dumps(backup, indent=2, default=str).encode("utf-8")
    filename = f"preadmission_backup_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"

    return StreamingResponse(
        io.BytesIO(json_bytes),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )



@router.get("/public-settings")
async def get_public_settings():
    settings = settings_collection.find_one({"institute": "Admission"}) or {}
    
    # Default portal settings if not explicitly saved yet
    default_portal = {
        "portalName": "Baliwag Polytechnic College\nADMISSION",
        "backgroundUrl": "",
        "documentaryRequirements": '<p>Before you begin, please prepare photos or scans of your required documents. Make sure they are saved as JPEG, JPG, or PNG files and are smaller than 200 KB.</p><h3>NEW STUDENTS (FRESHMEN)</h3><ul><li>2pcs 2X2 picture with white background</li><li>Original Grade 12 Report Card (Form 138)</li><li>Original Good Moral Certificate</li><li>Photocopy of SHS Diploma</li><li>Photocopy of Grade 11 Report Card with Certified True Copy</li><li>Photocopy of PSA Birth Certificate</li></ul><h3>TRANSFEREE</h3><ul><li>Original Transcript of Records</li><li>Honorable Dismissal</li><li>Original Good Moral Certificate</li><li>Photocopy of PSA Birth Certificate</li></ul><h3>ALS GRADUATE</h3><ul><li>Original Certificate of Rating</li><li>Original ALS Certification Test Result Document</li><li>Photocopy of PSA Birth Certificate</li></ul><h3>RETURNING STUDENTS</h3><ul><li>Clearance for enrollment from the Registrar</li></ul>',
        "gradeRequirements": '<ul><li><strong>Board / Licensure Programs:</strong> You must obtain a GWA of 87 or above.</li><li><strong>Non-Board / Non-Licensure Programs:</strong> You must obtain a GWA of 85 or above.</li></ul>',
        "applicationGuidelines": "<p>If you're a new student and wish to register for admission, please follow the instructions below:</p><ol><li>Click on the <strong>Register</strong> tab to start your registration or <strong>Login</strong> if you already have an account.</li><li>Enter your email address and a secure password to create an account. Ensure that the email address is valid and active.</li><li>A 6-digit verification code (OTP) will be sent to your email. Enter the verification code in the prompt to verify your email address.</li><li>Once verified, you will be automatically logged into the portal (or you can log in using your newly created credentials).</li><li>Navigate to the portal and fill out your application with all necessary information such as application details, personal information, educational background, upload requirements and schedule an interview.</li><li>Ensure all necessary data has been filled in correctly.</li><li>Once you've reviewed all your data, agree to the declaration and submit your application.</li><li>After submission, you'll be redirected back to your dashboard.</li><li>A confirmation email will be sent to your registered email address confirming your submission and interview schedule.</li></ol>",
        "applicantRequirements": []
    }
    portalSettings = settings.get("portalSettings", default_portal)
    for k, v in default_portal.items():
        if k not in portalSettings:
            portalSettings[k] = v

    from datetime import timedelta, timezone
    PH_TZ = timezone(timedelta(hours=8))
    now = datetime.now(PH_TZ)
    
    start_date = settings.get("applicationStartDate") or settings.get("applicationStart")
    end_date = settings.get("applicationDeadline")
    
    computed_status = "Closed"
    if start_date and end_date:
        try:
            if isinstance(start_date, str):
                start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                if start_dt.tzinfo is None:
                    start_dt = start_dt.replace(tzinfo=PH_TZ)
            else:
                start_dt = start_date.replace(tzinfo=PH_TZ) if start_date.tzinfo is None else start_date
                
            if isinstance(end_date, str):
                end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                if end_dt.tzinfo is None:
                    end_dt = end_dt.replace(tzinfo=PH_TZ)
            else:
                end_dt = end_date.replace(tzinfo=PH_TZ) if end_date.tzinfo is None else end_date
                
            if start_dt <= now <= end_dt:
                computed_status = "Open"
            elif now < start_dt:
                computed_status = "Scheduled"
        except Exception:
            computed_status = settings.get("admissionStatus", "Closed")
    else:
        computed_status = settings.get("admissionStatus", "Closed")

    return {
        "admissionStatus": computed_status,
        "schoolYear": settings.get("schoolYear"),
        "applicationDeadline": settings.get("applicationDeadline"),
        "allowedApplicantTypes": settings.get("allowedApplicantTypes", ["SHS Graduate", "Transferee", "ALS"]),
        "courses": settings.get("courses", []),
        "institutes": settings.get("institutes", []),
        "portalSettings": portalSettings
    }

@router.post("/upload-background")
async def upload_background(file: UploadFile = File(...), user: dict = Depends(admin_only)):
    secure_url = await save_upload(file, "background")
    return {"url": secure_url}

@router.post("/dismiss-reset-prompt")
async def dismiss_reset_prompt(user: dict = Depends(admin_only)):
    settings_collection.update_one(
        {"institute": "Admission"},
        {"$set": {"resetPromptDismissed": True}}
    )
    return {"msg": "Reset prompt dismissed."}

@router.post("/reset-system")
async def reset_system(user: dict = Depends(admin_only)):
    active_applicants = list(applicant_collection.find({}))
    
    if active_applicants:
        requests = [ReplaceOne({"_id": app["_id"]}, app, upsert=True) for app in active_applicants]
        archived_applicant_collection.bulk_write(requests)
        
        applicant_collection.delete_many({})
        
    # Archive/Delete System Activity Logs
    audit_collection.delete_many({})
    
    # Reset Program Capacities and Limits, and dismiss flag
    settings = settings_collection.find_one({"institute": "Admission"})
    if settings:
        archive_doc = dict(settings)
        archive_doc.pop("_id", None)
        archive_doc["archivedAt"] = datetime.utcnow()
        archived_settings_collection.insert_one(archive_doc)
        
        updated_courses = []
        if "courses" in settings:
            for course in settings["courses"]:
                course["limit"] = 0
                course["applicationLimit"] = 0
                course["enrolledCount"] = 0
                updated_courses.append(course)
        
        settings_collection.update_one(
            {"institute": "Admission"}, 
            {"$set": {
                "courses": updated_courses,
                "resetPromptDismissed": False,
                "schoolYear": "",
                "applicationStart": "",
                "applicationDeadline": "",
                "admissionStatus": "Closed",
                "admissionOpen": False
            }}
        )
        
    return {"msg": "System reset successful. All active records and limits have been securely archived."}


# ==========================================
# INSTITUTES & COURSES (STORED IN SETTINGS)
# ==========================================

@router.get("/courses")
async def get_courses(request: Request, user: dict = Depends(admin_only)):
    archive_year = request.headers.get("archiveviewyear")
    
    if archive_year:
        settings = archived_settings_collection.find_one({"institute": "Admission", "schoolYear": archive_year}) or {}
        target_col = archived_applicant_collection
    else:
        settings = settings_collection.find_one({"institute": "Admission"}) or {}
        target_col = applicant_collection
        
    courses = settings.get("courses", [])
    school_year = settings.get("schoolYear")
    
    return [with_capacity_status(c, target_col, school_year) for c in courses]

@router.post("/courses")
async def create_course(payload: CoursePayload = Body(...), user: dict = Depends(admin_only)):
    payload = payload.model_dump()
    # Generate a string ID so the frontend React keys don't break
    payload["_id"] = str(ObjectId()) 
    settings_collection.update_one({}, {"$push": {"courses": payload}}, upsert=True)
    return {"msg": "Course added!"}

@router.put("/courses/{id}")
async def update_course(id: str, payload: CoursePayload = Body(...), user: dict = Depends(admin_only)):
    payload = payload.model_dump()
    settings_collection.update_one(
        {"courses._id": id},
        {"$set": {f"courses.$.{k}": v for k, v in payload.items()}}
    )
    return {"msg": "Course updated successfully"}

@router.delete("/courses/{id}")
async def delete_course(id: str, user: dict = Depends(admin_only)):
    settings_collection.update_one({}, {"$pull": {"courses": {"_id": id}}})
    return {"msg": "Course deleted successfully"}

@router.get("/institutes")
async def get_institutes(request: Request, user: dict = Depends(admin_only)):
    archive_year = request.headers.get("archiveviewyear")
    
    if archive_year:
        settings = archived_settings_collection.find_one({"institute": "Admission", "schoolYear": archive_year}) or {}
    else:
        settings = settings_collection.find_one({"institute": "Admission"}) or {}
    return settings.get("institutes", [])

@router.post("/institutes")
async def create_institute(payload: InstitutePayload = Body(...), user: dict = Depends(admin_only)):
    payload = payload.model_dump()
    payload["_id"] = str(ObjectId())
    settings_collection.update_one({}, {"$push": {"institutes": payload}}, upsert=True)
    return {"msg": "Institute added!"}

@router.put("/institutes/{id}")
async def update_institute(id: str, payload: InstitutePayload = Body(...), user: dict = Depends(admin_only)):
    payload = payload.model_dump()
    settings_collection.update_one(
        {"institutes._id": id},
        {"$set": {f"institutes.$.{k}": v for k, v in payload.items()}}
    )
    return {"msg": "Institute updated"}

@router.delete("/institutes/{id}")
async def delete_institute(id: str, user: dict = Depends(admin_only)):
    settings_collection.update_one({}, {"$pull": {"institutes": {"_id": id}}})
    return {"msg": "Institute deleted"}

# ==========================================
# APPLICANT MANAGEMENT
# ==========================================

@router.get("/applicants")
async def get_all_applicants(request: Request, schoolYear: str = None, archive: str = "false", user: dict = Depends(admin_only)):
    archive_year = request.headers.get("archiveviewyear")
    
    if archive_year:
        target_collection = archived_applicant_collection
        schoolYear = archive_year
        settings = archived_settings_collection.find_one({"institute": "Admission", "schoolYear": archive_year}) or {}
    else:
        target_collection = archived_applicant_collection if archive.lower() == "true" else applicant_collection
        settings = settings_collection.find_one({"institute": "Admission"}) or {}
        
    query = {"$or": [{"isSubmitted": True}, {"isUnlocked": True}]}
    
    if schoolYear:
        query["schoolYear"] = schoolYear
    
    all_courses = settings.get("courses", [])
    all_institutes = settings.get("institutes", [])
    
    def get_inst_abbr(inst_val):
        if not inst_val: return "N/A"
        str_val = str(inst_val).strip().lower()
        for i in all_institutes:
            if str(i.get("_id", "")) == str_val or i.get("name", "").lower() == str_val or i.get("abbreviation", "").lower() == str_val:
                return i.get("abbreviation")
        return str_val
        
    admin_user = user_collection.find_one({"_id": ObjectId(user["id"])})
    user_role = admin_user.get("role", "Admin") if admin_user else "Admin"
    raw_user_inst = admin_user.get("institute", "Admission") if admin_user else "Admission"
    user_inst = get_inst_abbr(raw_user_inst)
    
    # Determine allowed courses for non-SuperAdmins
    admin_allowed_courses = []
    if user_role.replace(" ", "").lower() != "superadmin" and user_inst.upper() not in ["ADMISSION", "ALL"]:
        clean_inst = user_inst.strip().lower()
        for c in all_courses:
            if get_inst_abbr(c.get("institute", "")).lower() == clean_inst:
                admin_allowed_courses.append({
                    "name": c.get("name", "").lower(),
                    "abbr": c.get("abbreviation", "").lower()
                })
    
    formatted_applicants = []
    for app in target_collection.find(query).sort("createdAt", -1):
        raw_first = app.get("firstChoice", "").strip().lower()
        raw_second = app.get("secondChoice", "").strip().lower()
        is_rejected_first_choice = app.get("isRejectedFirstChoice", False)
        
        active_choice = raw_second if is_rejected_first_choice else raw_first
        
        # Apply Server-Side Filtering for regular admins
        if user_role.replace(" ", "").lower() != "superadmin" and user_inst.upper() not in ["ADMISSION", "ALL"]:
            matched = False
            for ac in admin_allowed_courses:
                c_name = ac["name"]
                c_abbr = ac["abbr"]
                if c_name and (c_name in active_choice or active_choice in c_name):
                    matched = True
                    break
                if c_abbr and (c_abbr == active_choice or f"- {c_abbr}" in active_choice or f"{c_abbr} -" in active_choice):
                    matched = True
                    break
            if not matched:
                continue
                
        app["_id"] = str(app["_id"])
        first_name = app.get("firstName", "")
        middle_name = app.get("middleName", "")
        last_name = app.get("lastName", "")
        app["name"] = f"{last_name}, {first_name} {middle_name}".strip()
        app["status"] = app.get("admissionStatus", "Pending")
        if app["status"] == "For Re-Evaluation":
            app["status"] = "For Interview"
        
        matched_course = next((c for c in all_courses if c.get("name", "").lower() == active_choice), None)
        app["institute"] = get_inst_abbr(matched_course.get("institute")) if matched_course else "N/A"
        app["course"] = app.get("secondChoice", "N/A") if is_rejected_first_choice else app.get("firstChoice", "N/A")
        
        formatted_applicants.append(app)
        
    return fix_ids(formatted_applicants)

@router.post("/applicants")
@router.post("/applicant")
async def create_applicant(payload: GenericDictPayload = Body(...), user: dict = Depends(admin_only)):
    payload = payload.model_dump()
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
    shared_id = ObjectId()
    email = payload.get("email", "").strip().lower()
    
    # 1. Save strictly to users collection WITH hashed default password and username
    new_user = {
        "_id": shared_id,
        "email": email,
        "password": pwd_context.hash("password123"), 
        "username": applicant_id,
        "role": "Applicant",
        "status": "For Interview",
        "createdAt": datetime.utcnow()
    }
    user_collection.insert_one(new_user)
    
    # 2. Save to applicants collection (Ensure password is NOT included)
    payload["_id"] = shared_id
    payload["applicantId"] = applicant_id
    payload["isSubmitted"] = True
    payload["admissionStatus"] = "Pending"
    payload["interviewStatus"] = "Pending"
    payload["examStatus"] = "Pending"
    payload["status"] = "For Interview"
    payload["isInterviewed"] = False
    payload["isExamined"] = False
    payload["createdAt"] = datetime.utcnow()
    payload["updatedAt"] = datetime.utcnow()
    
    payload.pop("password", None) 
    
    applicant_collection.insert_one(payload)
    return {"msg": "Applicant created successfully", "applicantId": applicant_id}

@router.put("/applicant/{id}")
async def update_applicant(id: str, payload: GenericDictPayload = Body(...), user: dict = Depends(admin_only)):
    payload = payload.model_dump()
    # Prevent overwriting critical fields like _id, password, or status flags
    update_data = {k: v for k, v in payload.items() if k not in ["_id", "password"]}
    update_data["updatedAt"] = datetime.utcnow()
    
    # Sync root-level firstChoice and secondChoice if they are updated in profile
    if "profile" in update_data and "appDetails" in update_data["profile"]:
        if "firstChoice" in update_data["profile"]["appDetails"]:
            # Extract just the course name without the abbreviation if it's formatted like "Course Name - ABBR"
            fc = update_data["profile"]["appDetails"]["firstChoice"]
            update_data["firstChoice"] = fc.split(" - ")[0].strip() if fc else ""
        if "secondChoice" in update_data["profile"]["appDetails"]:
            sc = update_data["profile"]["appDetails"]["secondChoice"]
            update_data["secondChoice"] = sc.split(" - ")[0].strip() if sc else ""
            
    applicant_collection.update_one({"_id": ObjectId(id)}, {"$set": update_data})
    
    # If email changed, we should probably update the user collection email too, but for simplicity we assume email might be in payload.
    if "email" in update_data:
        app = applicant_collection.find_one({"_id": ObjectId(id)})
        if app and "applicantId" in app:
            user_collection.update_one({"username": app["applicantId"]}, {"$set": {"email": update_data["email"]}})

    return {"msg": "Applicant updated successfully"}

@router.get("/archived-years")
async def get_archived_years(user: dict = Depends(admin_only)):
    # Fetch distinct years strictly from the archive collection
    years = archived_applicant_collection.distinct("schoolYear")
    settings = settings_collection.find_one({"institute": "Admission"}) or {}
    active_year = settings.get("schoolYear", "")
    return sorted([y for y in years if y and y != active_year], reverse=True)

@router.put("/applicant/{id}/encode-score")
@router.put("/applicant/{id}/score")
async def encode_score(id: str, payload: EncodeScorePayload = Body(...), user: dict = Depends(admin_only)):
    payload = payload.model_dump()
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
async def update_interview_status(id: str, payload: UpdateInterviewStatusPayload = Body(...), user: dict = Depends(admin_only)):
    payload = payload.model_dump()
    applicant_collection.update_one({"_id": ObjectId(id)}, {"$set": {"interviewStatus": payload.get("interviewStatus")}})
    return {"msg": "Interview status updated"}

@router.put("/applicants/bulk-status")
async def bulk_update_status(payload: BulkUpdateStatusPayload = Body(...), user: dict = Depends(admin_only)):
    payload = payload.model_dump()
    ids = payload.get("applicantIds", payload.get("ids", []))
    status = payload.get("status")
    if not ids: 
        raise HTTPException(status_code=400, detail="No IDs provided")
    
    obj_ids = [ObjectId(i) for i in ids]
    applicants_before = list(applicant_collection.find({"_id": {"$in": obj_ids}}))
    
    # Prevent confirming or forfeiting failed applicants (allow if Passed or has passing exam/interview scores)
    if status in ["Confirmed", "Forfeit"]:
        valid_applicants = []
        for a in applicants_before:
            adm_remarks = (a.get("admissionRemarks") or "").lower()
            adm_status = (a.get("admissionStatus") or "").lower()
            exam = a.get("examScore", 0) or 0
            interview = a.get("interviewScore", 0) or 0
            
            # Eligible if explicitly passed or if scores are passing
            if adm_remarks == "passed" or adm_status in ["passed", "admitted"] or (exam >= 37.5 and interview >= 75):
                valid_applicants.append(a)
                
        obj_ids = [a["_id"] for a in valid_applicants]
        applicants_before = valid_applicants
        
    if not obj_ids:
        return {"msg": "No eligible applicants to update.", "admissionEmailsSent": 0, "admissionEmailFailures": 0}

    # Separate admission remarks from slot status
    update_set = {}
    if status in ["Confirmed", "Forfeit"]:
        # Admin slot decisions. Confirmed is an offered slot; applicant acceptance finalizes admission.
        update_set["slotStatus"] = "Pending" if status == "Confirmed" else "Forfeited"
        update_set["admissionStatus"] = "Confirmed" if status == "Confirmed" else "Forfeit"
        if status == "Confirmed":
            update_set["admissionRemarks"] = "Passed"
    elif status in ["Passed", "Waitlisted", "Failed"]:
        # Admission qualification results
        update_set["admissionRemarks"] = status
        update_set["admissionStatus"] = status
    else:
        update_set["admissionStatus"] = status
    applicant_collection.update_many({"_id": {"$in": obj_ids}}, {"$set": update_set})
    
    if status:
        for app in applicants_before:
            old_email = app.get("email", "")
            if old_email:
                if status == "Forfeit":
                    applicant_collection.update_one({"_id": app["_id"]}, {"$set": {"applicantId": "Forfeit"}})
                    user_collection.delete_one({"email": old_email})
                else:
                    user_collection.update_one({"email": old_email}, {"$set": {"status": update_set.get("admissionStatus", status)}})

    return {"msg": f"{len(ids)} applicants updated.", "admissionEmailsSent": 0, "admissionEmailFailures": 0}


@router.post("/emails/send-bulk")
async def send_bulk_emails(payload: SendBulkEmailsPayload = Body(...), user: dict = Depends(admin_only)):
    payload = payload.model_dump()
    emails = payload.get("emails", [])
    if not emails:
        raise HTTPException(status_code=400, detail="No emails provided.")
        
    sent_count = 0
    failed_count = 0

    for email_data in emails:
        to_email = email_data.get("email")
        subject = email_data.get("subject", "Admission Notice")
        message_body = email_data.get("message", "")
        app_id = email_data.get("applicantId")
        html_message = email_data.get("htmlMessage")
        email_type = email_data.get("type", "Admission Qualification Notice")

        try:
            # 1. Send real email via Brevo HTTP API
            if to_email:
                from utils.pre_admission.email_service import send_mail
                send_mail(to_email, subject, message_body, html=html_message)

            # 2. Safely update database flag and save sent email content
            if app_id:
                query = {"_id": ObjectId(app_id)} if ObjectId.is_valid(app_id) else {"applicantId": app_id}
                applicant_collection.update_one(
                    query,
                    {
                        "$set": {"isEmailSent": True},
                        "$push": {"sentEmails": {
                            "type": email_type,
                            "subject": subject,
                            "body": message_body,
                            "sentAt": datetime.utcnow()
                        }}
                    }
                )
            sent_count += 1
        except Exception as e:
            print(f"Failed to send email to {to_email}: {e}")
            print(f"SMTP Error: {str(e)}")
            failed_count += 1
            raise HTTPException(status_code=500, detail="Email delivery failed. Please try again later.")

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

@router.put("/applicant/{id}/unlock")
async def unlock_applicant(id: str, user: dict = Depends(admin_only)):
    existing = applicant_collection.find_one({"_id": ObjectId(id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Applicant not found")
        
    applicant_collection.update_one(
        {"_id": ObjectId(id)}, 
        {"$set": {"isSubmitted": False, "admissionStatus": "Pending", "isUnlocked": True}}
    )
    return {"message": "Application unlocked successfully"}

@router.put("/applicant/{id}/reject-choice")
async def reject_applicant_choice(id: str, user: dict = Depends(admin_only)):
    existing = applicant_collection.find_one({"_id": ObjectId(id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Applicant not found")
        
    is_rejected_first = existing.get("isRejectedFirstChoice", False)
    is_reassigned = existing.get("isReassigned", False)
    
    if is_reassigned:
        # Final permanent rejection: completely delete applicant and their user account
        if "applicantId" in existing:
            user_collection.delete_one({"username": existing["applicantId"]})
        elif "email" in existing:
            user_collection.delete_one({"email": existing["email"]})
            
        applicant_collection.delete_one({"_id": ObjectId(id)})
        return {"message": "Applicant permanently rejected and completely removed from the system."}
    elif not is_rejected_first:
        # Reject 1st choice, fall to 2nd choice
        applicant_collection.update_one(
            {"_id": ObjectId(id)}, 
            {"$set": {"isRejectedFirstChoice": True}}
        )
        return {"message": "Applicant rejected for 1st choice. Moved to 2nd choice program."}
    else:
        # Already rejected 1st choice, now rejected 2nd choice
        applicant_collection.update_one(
            {"_id": ObjectId(id)}, 
            {"$set": {
                "isRejectedSecondChoice": True,
                "admissionStatus": "For Interview",
                "admissionRemarks": "Failed"
            }}
        )
        return {"message": "Applicant rejected for 2nd choice. Marked for interview (re-evaluation)."}

@router.put("/applicant/{id}/reassign-program")
async def reassign_applicant_program(id: str, payload: ReassignProgramPayload = Body(...), user: dict = Depends(admin_only)):
    payload = payload.model_dump()
    new_program = payload.get("newProgram")
    if not new_program:
        raise HTTPException(status_code=400, detail="New program is required")
        
    existing = applicant_collection.find_one({"_id": ObjectId(id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Applicant not found")
        
    # Set the new program as firstChoice, and reset rejections
    applicant_collection.update_one(
        {"_id": ObjectId(id)}, 
        {"$set": {
            "profile.appDetails.firstChoice": new_program,
            "firstChoice": new_program,
            "isRejectedFirstChoice": False,
            "isRejectedSecondChoice": False,
            "isReassigned": True,
            "admissionStatus": "Pending",
            "admissionRemarks": ""
        }}
    )
    return {"message": f"Applicant reassigned to {new_program} successfully."}

@router.put("/applicant/{id}/status")
async def update_status(id: str, payload: UpdateStatusPayload = Body(...), user: dict = Depends(admin_only)):
    payload = payload.model_dump()
    status = payload.get("status")
    slot_status = payload.get("slotStatus")
    exam_score = payload.get("examScore")
    interview_score = payload.get("interviewScore")
    gwa = payload.get("gwa")
    total_perc = payload.get("totalPerc")
    
    update_fields = {}
    if status:
        if status in ["Confirmed", "Forfeit"]:
            # Admin slot decisions. Confirmed is an offered slot; applicant acceptance finalizes admission.
            update_fields["slotStatus"] = "Pending" if status == "Confirmed" else "Forfeited"
            update_fields["admissionStatus"] = "Confirmed" if status == "Confirmed" else "Forfeit"
            if status == "Confirmed":
                update_fields["admissionRemarks"] = "Passed"
        elif status in ["Passed", "Waitlisted", "Failed"]:
            # Admission qualification results
            update_fields["admissionRemarks"] = status
            update_fields["admissionStatus"] = status
        else:
            update_fields["admissionStatus"] = status
        db_status = update_fields.get("admissionStatus", status)

    if slot_status:
        update_fields["slotStatus"] = slot_status
    if exam_score is not None:
        update_fields["examScore"] = float(exam_score)
        update_fields["isExamined"] = True
        update_fields["examStatus"] = "Passed" if float(exam_score) >= 37.5 else "Failed"
    if interview_score is not None:
        update_fields["interviewScore"] = float(interview_score)
    if gwa is not None:
        update_fields["gwa"] = str(gwa)
    if total_perc is not None:
        update_fields["totalPerc"] = float(total_perc)
    
    bcet_raw = payload.get("bcetRawScore")
    bcet_highest = payload.get("bcetHighestScore")
    if bcet_raw is not None:
        update_fields["bcetRawScore"] = float(bcet_raw)
    if bcet_highest is not None:
        update_fields["bcetHighestScore"] = float(bcet_highest)

    existing_applicant = applicant_collection.find_one({"_id": ObjectId(id)})
    if not existing_applicant:
        raise HTTPException(status_code=404, detail="Applicant not found")

    current_status = (existing_applicant.get("admissionStatus") or "pending").lower()
    # Use the incoming values if provided, otherwise fall back to existing DB values
    check_exam = update_fields.get("examScore", existing_applicant.get("examScore", 0)) or 0
    check_interview = update_fields.get("interviewScore", existing_applicant.get("interviewScore", 0)) or 0

    is_passing_scores = (check_exam >= 75 and check_interview >= 75)
    is_already_passed = current_status in ["passed", "admitted", "confirmed"] or (existing_applicant.get("admissionRemarks") or "").lower() == "passed"

    if status in ["Confirmed", "Forfeit"] and not (is_already_passed or is_passing_scores):
        raise HTTPException(status_code=400, detail="Cannot mark as Confirmed/Forfeit because the applicant has not met passing requirements.")

    applicant_collection.update_one({"_id": ObjectId(id)}, {"$set": update_fields})

    applicant = applicant_collection.find_one({"_id": ObjectId(id)})

    if status:
        old_email = applicant.get("email", "")
        if old_email:
            if status == "Forfeit":
                applicant_collection.update_one({"_id": ObjectId(id)}, {"$set": {"applicantId": "Forfeit"}})
                applicant["applicantId"] = "Forfeit"
                user_collection.delete_one({"email": old_email})
            else:
                user_collection.update_one({"email": old_email}, {"$set": {"status": db_status}})



    applicant["_id"] = str(applicant["_id"])
    for k, v in applicant.items():
        if isinstance(v, ObjectId): applicant[k] = str(v)
        
    return {"msg": "Status updated successfully", "applicant": applicant}

# ==========================================
# FALLBACKS & DYNAMIC ROUTES
# ==========================================

@router.put("/{id}")
async def update_admin(id: str, payload: UpdateAdminPayload = Body(...), user: dict = Depends(admin_only)):
    payload = payload.model_dump()
    user_collection.update_one({"_id": ObjectId(id)}, {"$set": payload})
    return {"msg": "Admin updated"}

@router.delete("/{id}")
async def delete_admin(id: str, user: dict = Depends(admin_only)):
    user_collection.delete_one({"_id": ObjectId(id)})
    return {"msg": "Admin deleted"}

from bson import ObjectId
from fastapi import HTTPException, Body, Depends

# -----------------------------------------
# FIX FOR ISSUE #4: DELETE ADMIN ACCOUNT
# -----------------------------------------
@router.delete("/user/{user_id}")
async def delete_admin(user_id: str, user: dict = Depends(admin_only)):
    try:
        result = user_collection.delete_one({"_id": ObjectId(user_id)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Admin not found")
        return {"msg": "Admin deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid User ID format")

# -----------------------------------------
# FIX FOR ISSUE #5: EDIT ADMIN ACCOUNT
# -----------------------------------------
@router.put("/user/{user_id}")
async def update_admin(user_id: str, payload: UpdateAdminPayload = Body(...), user: dict = Depends(admin_only)):
    payload = payload.model_dump()
    try:
        # Prevent the database ID from being updated
        payload.pop("_id", None)
        
        # Double check email is lowercase in backend just in case
        if "email" in payload:
            payload["email"] = payload.get("email", "").strip().lower()
            
        result = user_collection.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": payload}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Admin not found")
            
        return {"msg": "Admin updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid update request")

# -----------------------------------------
# SAVE EMAIL TEMPLATES
# -----------------------------------------
@router.put("/settings/email-template")
async def update_email_template(payload: UpdateEmailTemplatePayload = Body(...), user: dict = Depends(admin_only)):
    payload = payload.model_dump()
    try:
        # Save it under "emailTemplate" in your settings document
        settings_collection.update_one(
            {}, 
            {"$set": {"emailTemplate": payload}},
            upsert=True 
        )
        return {"msg": "Email template saved successfully!"}
    except Exception as e:
        raise HTTPException(status_code=400, detail="Failed to save email template")

@router.get("/utilities/clean-sections")
async def clean_sections():
    """Removes the word 'Section ' from the database so it just leaves the letter."""
    apps_with_long_section = applicant_collection.find({"section": {"$regex": "^Section "}})
    count = 0
    for app in apps_with_long_section:
        just_the_letter = app["section"].replace("Section ", "")
        applicant_collection.update_one({"_id": app["_id"]}, {"$set": {"section": just_the_letter}})
        count += 1
    return {"msg": f"Cleaned up the word 'Section' from {count} applicants!"}
