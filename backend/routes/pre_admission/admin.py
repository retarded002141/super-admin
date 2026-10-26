import os
import hashlib
import secrets
import uuid
import random
from datetime import datetime, timedelta, timezone
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

import re

def get_next_student_number(current_year: int) -> str:
    # Find all confirmed applicants who already have a student number for this year
    all_apps = applicant_collection.find({
        "applicantId": {"$regex": f"^A?-?{current_year}"}
    })
    
    used_numbers = []
    for app in all_apps:
        app_id = str(app.get("applicantId", "")).strip()
        clean_id = app_id.replace("A-", "").replace("A", "")
        if clean_id.isdigit() and clean_id.startswith(str(current_year)):
            num_str = clean_id[len(str(current_year)):]
            if num_str.isdigit():
                used_numbers.append(int(num_str))
                
    used_numbers.sort()
    sequence = 1
    for num in used_numbers:
        if num == sequence:
            sequence += 1
        elif num > sequence:
            break
            
    return f"A-{current_year}{str(sequence).zfill(5)}"

def get_applicant_course(applicant: dict) -> str:
    """Resolves the applicant's current active course (handles activeProgram, reconsideration, reassignments, 2nd choice if 1st rejected, and profile)."""
    if not applicant or not isinstance(applicant, dict):
        return ""
    if applicant.get("activeProgram"):
        return str(applicant.get("activeProgram")).strip()
    if applicant.get("reassignedProgram"):
        return str(applicant.get("reassignedProgram")).strip()
    if applicant.get("reconsiderationProgram"):
        return str(applicant.get("reconsiderationProgram")).strip()
        
    profile = applicant.get("profile") or {}
    app_details = profile.get("appDetails") or {} if isinstance(profile, dict) else {}

    if applicant.get("isRejectedFirstChoice"):
        course = (
            applicant.get("secondChoice") or 
            app_details.get("secondChoice", "")
        )
        if course:
            return str(course).strip()
    course = (
        applicant.get("firstChoice") or 
        app_details.get("firstChoice", "") or 
        applicant.get("course", "")
    )
    return str(course).strip() if course else ""

def get_applicant_school_year(applicant: dict) -> str:
    """Resolves the applicant's school year, falling back to active settings."""
    if not applicant:
        return ""
    sy = applicant.get("schoolYear")
    if not sy:
        settings = settings_collection.find_one({"institute": "Admission"}) or {}
        sy = settings.get("schoolYear", "")
    return str(sy).strip() if sy else ""

def get_auto_section(course: str, school_year: str) -> str:
    """Automatically calculates the section based on configurable section capacity (default 45)."""
    if not course or not school_year:
        return "A"
        
    settings = settings_collection.find_one({"institute": "Admission"}) or {}
    capacity = int(settings.get("sectionCapacity", 45))
    if capacity <= 0:
        capacity = 45

    course_clean = str(course).strip()
    sy_clean = str(school_year).strip()
    sy_condition = {"$in": [sy_clean, int(sy_clean)]} if sy_clean.isdigit() else sy_clean

    course_candidates = [course_clean]
    if " - " in course_clean:
        course_candidates.extend([p.strip() for p in course_clean.split(" - ") if p.strip()])
    
    # Also resolve against configured courses in settings
    configured_courses = settings.get("courses", [])
    for c in configured_courses:
        if isinstance(c, dict):
            c_name = c.get("name", "").strip()
            c_code = c.get("abbreviation", "") or c.get("code", "")
            c_code = c_code.strip()
            combined = f"{c_code} - {c_name}".strip() if (c_code and c_name) else ""
            if course_clean.lower() in [c_name.lower(), c_code.lower(), combined.lower()]:
                if c_name: course_candidates.append(c_name)
                if c_code: course_candidates.append(c_code)
                if combined: course_candidates.append(combined)

    escaped_candidates = "|".join(re.escape(c) for c in set(course_candidates) if c)
    course_pattern = re.compile(f"^({escaped_candidates})$", re.IGNORECASE)

    # Count how many students are already in this course and year with an assigned section
    student_count = applicant_collection.count_documents({
        "$or": [
            {"activeProgram": course_pattern},
            {"reassignedProgram": course_pattern},
            {"reconsiderationProgram": course_pattern},
            {"firstChoice": course_pattern, "isRejectedFirstChoice": {"$ne": True}, "reconsiderationProgram": {"$in": [None, ""]}},
            {"secondChoice": course_pattern, "isRejectedFirstChoice": True, "reconsiderationProgram": {"$in": [None, ""]}},
            {"profile.appDetails.firstChoice": course_pattern, "isRejectedFirstChoice": {"$ne": True}, "reconsiderationProgram": {"$in": [None, ""]}},
            {"profile.appDetails.secondChoice": course_pattern, "isRejectedFirstChoice": True, "reconsiderationProgram": {"$in": [None, ""]}},
            {"course": course_pattern}
        ],
        "schoolYear": sy_condition,
        "slotStatus": {"$in": ["Admitted", "admitted"]},
        "section": {"$exists": True, "$nin": [None, ""]}
    })
    
    # 0-(capacity-1) = A, capacity-(2*capacity-1) = B, etc.
    section_index = student_count // capacity
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

    if settings.get("applicationDeadline") and not settings.get("slotAcceptanceDeadline"):
        try:
            import calendar
            app_deadline_str = str(settings["applicationDeadline"])
            base_dt = datetime.fromisoformat(app_deadline_str.replace("Z", "+00:00"))
            year = base_dt.year + (base_dt.month + 2 - 1) // 12
            month = (base_dt.month + 2 - 1) % 12 + 1
            max_days = calendar.monthrange(year, month)[1]
            day = min(base_dt.day, max_days)
            slot_dt = base_dt.replace(year=year, month=month, day=day)
            settings["slotAcceptanceDeadline"] = slot_dt.isoformat()
            needs_save = True
        except Exception:
            pass

    if needs_save:
        settings_collection.update_one({"institute": "Admission"}, {"$set": {
            "admissionStatus": settings.get("admissionStatus"),
            "admissionOpen": settings.get("admissionOpen"),
            "autoState": settings.get("autoState"),
            "slotAcceptanceDeadline": settings.get("slotAcceptanceDeadline")
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
    settings_collection.update_one({"institute": "Admission"}, {"$push": {"courses": payload}}, upsert=True)
    return {"msg": "Course added!"}

@router.put("/courses/{id}")
async def update_course(id: str, payload: CoursePayload = Body(...), user: dict = Depends(admin_only)):
    payload = payload.model_dump()
    res = settings_collection.update_one(
        {"institute": "Admission", "courses._id": id},
        {"$set": {f"courses.$.{k}": v for k, v in payload.items()}}
    )
    if res.matched_count == 0:
        res = settings_collection.update_one(
            {"courses._id": id},
            {"$set": {f"courses.$.{k}": v for k, v in payload.items()}}
        )
    if res.matched_count == 0 and ObjectId.is_valid(id):
        res = settings_collection.update_one(
            {"institute": "Admission", "courses._id": ObjectId(id)},
            {"$set": {f"courses.$.{k}": v for k, v in payload.items()}}
        )
        if res.matched_count == 0:
            settings_collection.update_one(
                {"courses._id": ObjectId(id)},
                {"$set": {f"courses.$.{k}": v for k, v in payload.items()}}
            )
    return {"msg": "Course updated successfully"}

@router.delete("/courses/{id}")
async def delete_course(id: str, user: dict = Depends(admin_only)):
    pull_ids = [id]
    if ObjectId.is_valid(id):
        pull_ids.append(ObjectId(id))
    settings_collection.update_one({"institute": "Admission"}, {"$pull": {"courses": {"_id": {"$in": pull_ids}}}})
    settings_collection.update_one({}, {"$pull": {"courses": {"_id": {"$in": pull_ids}}}})
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
    settings_collection.update_one({"institute": "Admission"}, {"$push": {"institutes": payload}}, upsert=True)
    return {"msg": "Institute added!"}

@router.put("/institutes/{id}")
async def update_institute(id: str, payload: InstitutePayload = Body(...), user: dict = Depends(admin_only)):
    payload = payload.model_dump()
    res = settings_collection.update_one(
        {"institute": "Admission", "institutes._id": id},
        {"$set": {f"institutes.$.{k}": v for k, v in payload.items()}}
    )
    if res.matched_count == 0:
        res = settings_collection.update_one(
            {"institutes._id": id},
            {"$set": {f"institutes.$.{k}": v for k, v in payload.items()}}
        )
    if res.matched_count == 0 and ObjectId.is_valid(id):
        res = settings_collection.update_one(
            {"institute": "Admission", "institutes._id": ObjectId(id)},
            {"$set": {f"institutes.$.{k}": v for k, v in payload.items()}}
        )
        if res.matched_count == 0:
            settings_collection.update_one(
                {"institutes._id": ObjectId(id)},
                {"$set": {f"institutes.$.{k}": v for k, v in payload.items()}}
            )
    return {"msg": "Institute updated"}

@router.delete("/institutes/{id}")
async def delete_institute(id: str, user: dict = Depends(admin_only)):
    pull_ids = [id]
    if ObjectId.is_valid(id):
        pull_ids.append(ObjectId(id))
    settings_collection.update_one({"institute": "Admission"}, {"$pull": {"institutes": {"_id": {"$in": pull_ids}}}})
    settings_collection.update_one({}, {"$pull": {"institutes": {"_id": {"$in": pull_ids}}}})
    return {"msg": "Institute deleted"}

# ==========================================
# DASHBOARD METRICS & APPLICANT MANAGEMENT
# ==========================================

@router.get("/dashboard/stats")
@router.get("/dashboard")
async def get_dashboard_stats(request: Request, schoolYear: str = None, archive: str = "false", user: dict = Depends(admin_only)):
    archive_year = request.headers.get("archiveviewyear")
    if archive_year:
        target_collection = archived_applicant_collection
        schoolYear = archive_year
        settings = archived_settings_collection.find_one({"institute": "Admission", "schoolYear": archive_year}) or {}
    else:
        target_collection = archived_applicant_collection if archive.lower() == "true" else applicant_collection
        settings = settings_collection.find_one({"institute": "Admission"}) or {}

    query = {
        "$or": [
            {"isSubmitted": True},
            {"isUnlocked": True},
            {"status": "For Interview"},
            {"admissionStatus": "For Interview"}
        ]
    }
    if schoolYear:
        query["schoolYear"] = schoolYear

    all_applicants = list(target_collection.find(query).sort("createdAt", -1))
    
    admin_user = user_collection.find_one({"_id": ObjectId(user["id"])})
    user_role = (admin_user.get("role", "Admin") if admin_user else "Admin").replace(" ", "").lower()
    raw_user_inst = admin_user.get("institute", "Admission") if admin_user else "Admission"
    
    all_courses = settings.get("courses", [])
    all_institutes = settings.get("institutes", [])
    
    def get_inst_abbr(inst_val):
        if not inst_val: return "N/A"
        str_val = str(inst_val).strip().lower()
        for i in all_institutes:
            if str(i.get("_id", "")) == str_val or i.get("name", "").lower() == str_val or i.get("abbreviation", "").lower() == str_val:
                return i.get("abbreviation")
        return str_val

    user_inst = get_inst_abbr(raw_user_inst)
    admin_allowed_courses = []
    # Pre-Admission module is strictly scoped to IITI institute (BSIT and any future IITI programs)
    for c in all_courses:
        inst = get_inst_abbr(c.get("institute", "")).upper()
        abbr = c.get("abbreviation", "").upper()
        name = c.get("name", "").lower()
        if inst == "IITI" or abbr == "BSIT" or "information technology" in name:
            admin_allowed_courses.append({
                "name": name,
                "abbr": abbr.lower()
            })
    if not any(ac["abbr"] == "bsit" for ac in admin_allowed_courses):
        admin_allowed_courses.append({
            "name": "bachelor of science in information technology",
            "abbr": "bsit"
        })

    filtered_applicants = []
    for app in all_applicants:
        effective_course = get_applicant_course(app).strip().lower()
        if not effective_course:
            continue
        matched = False
        for ac in admin_allowed_courses:
            c_name = ac["name"]
            c_abbr = ac["abbr"]
            if (c_name and (c_name in effective_course or effective_course in c_name)) or (c_abbr and (c_abbr == effective_course or f"- {c_abbr}" in effective_course or f"{c_abbr} -" in effective_course or f"({c_abbr})" in effective_course)):
                matched = True
                break
        if not matched:
            continue
        filtered_applicants.append(app)

    total_count = len(filtered_applicants)
    
    # Admitted students: slotStatus in Admitted/Accepted, or status == Enrolled, or admissionStatus in Admitted/Confirmed/Advising Completed
    admitted_list = [
        app for app in filtered_applicants
        if str(app.get("slotStatus", "")).strip().capitalize() in ["Admitted", "Accepted"]
        or str(app.get("status", "")).strip().capitalize() in ["Enrolled", "Admitted"]
        or str(app.get("admissionStatus", "")).strip().capitalize() in ["Admitted", "Confirmed", "Advising completed"]
    ]
    admitted_count = len(admitted_list)

    # For Interview applicants
    for_interview_list = []
    for app in filtered_applicants:
        app_status = str(app.get("status", "")).strip()
        app_adm_status = str(app.get("admissionStatus", "")).strip()
        app_is_interviewed = bool(
            app.get("isInterviewed") or
            app.get("interviewStatus") in ["Passed", "Failed"] or
            (app.get("interviewScore") is not None and float(app.get("interviewScore", 0)) > 0)
        )
        if app_status == "For Interview" or app_adm_status == "For Interview":
            for_interview_list.append(app)
        elif not app_is_interviewed and app_status not in ["Passed", "Failed", "Enrolled", "Admitted"] and app_adm_status not in ["Passed", "Failed", "Admitted", "Confirmed", "Advising Completed"]:
            for_interview_list.append(app)
            
    for_interview_count = len(for_interview_list)

    return fix_ids({
        "totalApplicants": total_count,
        "admittedCount": admitted_count,
        "forInterviewCount": for_interview_count,
        "recentApplicants": for_interview_list[:50],
        "admittedApplicants": admitted_list
    })

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
        
    query = {
        "$or": [
            {"isSubmitted": True},
            {"isUnlocked": True},
            {"status": "For Interview"},
            {"admissionStatus": "For Interview"}
        ]
    }
    
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
    
    # Pre-Admission module is strictly scoped to IITI institute (BSIT and any future IITI programs)
    admin_allowed_courses = []
    for c in all_courses:
        inst = get_inst_abbr(c.get("institute", "")).upper()
        abbr = c.get("abbreviation", "").upper()
        name = c.get("name", "").lower()
        if inst == "IITI" or abbr == "BSIT" or "information technology" in name:
            admin_allowed_courses.append({
                "name": name,
                "abbr": abbr.lower()
            })
    if not any(ac["abbr"] == "bsit" for ac in admin_allowed_courses):
        admin_allowed_courses.append({
            "name": "bachelor of science in information technology",
            "abbr": "bsit"
        })
    
    deadline_str = settings.get("applicationDeadline")
    is_deadline_passed = False
    if deadline_str:
        try:
            PH_TZ = timezone(timedelta(hours=8))
            end_dt = datetime.fromisoformat(str(deadline_str).replace("Z", "+00:00"))
            if end_dt.tzinfo is None:
                end_dt = end_dt.replace(tzinfo=PH_TZ)
            is_deadline_passed = (datetime.now(PH_TZ) >= (end_dt + timedelta(days=1)))
        except Exception as e:
            print(f"Error checking applicationDeadline: {e}")

    formatted_applicants = []
    for app in target_collection.find(query).sort("createdAt", -1):
        effective_course = get_applicant_course(app).strip().lower()
        if not effective_course:
            continue
        
        # Apply Server-Side Filtering for IITI programs
        matched = False
        for ac in admin_allowed_courses:
            c_name = ac["name"]
            c_abbr = ac["abbr"]
            if c_name and (c_name in effective_course or effective_course in c_name):
                matched = True
                break
            if c_abbr and (c_abbr == effective_course or f"- {c_abbr}" in effective_course or f"{c_abbr} -" in effective_course or f"({c_abbr})" in effective_course):
                matched = True
                break
        if not matched:
            continue
                
        app["_id"] = str(app["_id"])
        first_name = app.get("firstName", "")
        middle_name = app.get("middleName", "")
        last_name = app.get("lastName", "")
        app["name"] = f"{last_name}, {first_name} {middle_name}".strip()
        
        matched_course = next((c for c in all_courses if (c.get("name", "").lower() == effective_course or c.get("abbreviation", "").lower() == effective_course)), None)
        if not matched_course and " - " in effective_course:
            parts = [p.strip().lower() for p in effective_course.split(" - ") if p.strip()]
            matched_course = next((c for c in all_courses if c.get("name", "").lower() in parts or c.get("abbreviation", "").lower() in parts), None)

        c_inst = str(matched_course.get("institute", "")).strip().lower() if matched_course else ""
        active_inst = next((i for i in all_institutes if str(i.get("_id", "")).lower() == c_inst or i.get("name", "").lower() == c_inst or i.get("abbreviation", "").lower() == c_inst or i.get("code", "").lower() == c_inst), None)
        requires_interview = bool(active_inst.get("requiresInterview", True) and active_inst.get("hasInterview", True)) if active_inst else True

        is_waived = bool(app.get("isInterviewWaived") or not requires_interview)

        raw_status = str(app.get("status", "")).strip()
        raw_adm_status = str(app.get("admissionStatus", "")).strip()

        if is_waived:
            app["isInterviewWaived"] = True
            if app.get("isApplicationAccepted") or app.get("isInterviewed"):
                is_interviewed = True
                if target_collection == applicant_collection and not app.get("isInterviewed"):
                    applicant_collection.update_one(
                        {"_id": ObjectId(app["_id"])},
                        {"$set": {
                            "isInterviewWaived": True,
                            "isInterviewed": True,
                            "interviewScore": 50,
                            "interviewStatus": "Passed",
                            "interviewRemarks": "Auto-credited (No Interview)"
                        }}
                    )
                if not app.get("interviewStatus") or app.get("interviewStatus") == "Pending":
                    app["interviewStatus"] = "Passed"
                if not app.get("interviewRemarks"):
                    app["interviewRemarks"] = "Auto-credited (No Interview)"
                if app.get("interviewScore") is None or float(app.get("interviewScore", 0)) == 0:
                    app["interviewScore"] = 50
                is_interviewed = True
                app["status"] = app.get("admissionStatus", "Pending")
            elif is_deadline_passed:
                # Exactly 1 day after deadline: Auto-route to Pre-Admission ranking
                app["isInterviewed"] = True
                if app.get("interviewScore") is None or float(app.get("interviewScore", 0)) == 0:
                    app["interviewScore"] = 50
                if not app.get("interviewStatus") or app.get("interviewStatus") == "Pending":
                    app["interviewStatus"] = "Passed"
                if not app.get("interviewRemarks"):
                    app["interviewRemarks"] = "Auto-credited (No Interview)"
                is_interviewed = True
                app["status"] = app.get("admissionStatus", "Pending")
            else:
                # Prior to acceptance: Keep in Applications queue as For Docs Submission
                app["isInterviewed"] = False
                app["interviewScore"] = 0
                app["interviewStatus"] = "For Docs Submission"
                app["interviewRemarks"] = "For Document Submission"
                app["status"] = "For Docs Submission"
                is_interviewed = False
        elif raw_status == "For Interview" or raw_adm_status == "For Interview":
            is_interviewed = False
            app["isInterviewed"] = False
            app["interviewStatus"] = "Pending"
            app["status"] = "For Interview"
            app["examScore"] = None
            app["bcetRawScore"] = None
            app["bcetHighestScore"] = None
            app["isExamined"] = False
            app["gwaScore"] = None
            app["finalScore"] = None
            app["rank"] = None
            app["examStatus"] = "Pending"
            app["admissionStatus"] = "Pending"
            app["admissionRemarks"] = ""
        else:
            is_interviewed = bool(
                app.get("isInterviewed") or
                app.get("interviewStatus") in ["Passed", "Failed"] or
                (app.get("interviewScore") is not None and float(app.get("interviewScore", 0)) > 0)
            )

            if not is_interviewed:
                # Un-interviewed applicants must not carry exam fields or qualification results
                app["examScore"] = None
                app["bcetRawScore"] = None
                app["bcetHighestScore"] = None
                app["isExamined"] = False
                app["gwaScore"] = None
                app["finalScore"] = None
                app["rank"] = None
                app["examStatus"] = "Pending"
                app["admissionStatus"] = "Pending"
                app["admissionRemarks"] = ""
                app["status"] = "For Interview"
            else:
                app["status"] = app.get("status") or app.get("admissionStatus", "Pending")
                if app["status"] in ["For Re-Evaluation", "Pending"]:
                    app["status"] = "For Interview"
                    app["isInterviewed"] = False

        # Ensure slotStatus is preserved and properly formatted
        slot_status = app.get("slotStatus")
        if not slot_status and app.get("status") == "Enrolled":
            slot_status = "Admitted"
        app["slotStatus"] = slot_status
        
        app["institute"] = get_inst_abbr(matched_course.get("institute")) if matched_course else "N/A"
        app["course"] = effective_course or "N/A"
        if not app.get("activeProgram"):
            app["activeProgram"] = effective_course
        
        formatted_applicants.append(app)
        
    return fix_ids(formatted_applicants)

@router.post("/applicants")
@router.post("/applicant")
async def create_applicant(payload: GenericDictPayload = Body(...), user: dict = Depends(admin_only)):
    payload = payload.model_dump()

    # Validate phone numbers if supplied
    for c_field in ["contactNumber", "fatherContact", "motherContact"]:
        if c_field in payload and payload[c_field]:
            c_val = str(payload[c_field]).strip()
            if not re.match(r"^09\d{9}$", c_val):
                raise HTTPException(status_code=400, detail=f"{c_field} must start with '09' and be exactly 11 digits.")

    school_year = payload.get("schoolYear", str(datetime.utcnow().year))
    year_prefix = school_year.split('-')[0] if '-' in school_year else school_year
    last_applicant = applicant_collection.find_one(
        {"applicantId": {"$regex": f"^A-{re.escape(str(year_prefix))}"}},
        sort=[("applicantId", -1)]
    )
    
    if last_applicant and last_applicant.get("applicantId"):
        try:
            last_num = int(last_applicant["applicantId"].split(year_prefix)[1])
            new_num = last_num + 1
        except (ValueError, IndexError):
            new_num = 1
    else:
        new_num = 1
        
    applicant_id = f"A-{year_prefix}{new_num:05d}"
    shared_id = ObjectId()
    email = payload.get("email", "").strip().lower()
    
    # Use a cryptographically random temporary password instead of a static default password
    temp_password = secrets.token_urlsafe(9)
    new_user = {
        "_id": shared_id,
        "email": email,
        "password": pwd_context.hash(temp_password), 
        "username": applicant_id,
        "role": "Applicant",
        "status": "For Interview",
        "createdAt": datetime.utcnow()
    }
    user_collection.insert_one(new_user)
    
    # 2. Save to applicants collection (Ensure password is NOT included)
    payload["_id"] = shared_id
    payload["tracking_slug"] = str(uuid.uuid4())
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
    return {
        "msg": "Applicant created successfully", 
        "applicantId": applicant_id,
        "tracking_slug": payload["tracking_slug"],
        "tempPassword": temp_password
    }

@router.put("/applicant/{id}")
async def update_applicant(id: str, payload: GenericDictPayload = Body(...), user: dict = Depends(admin_only)):
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid applicant ID format")

    payload = payload.model_dump()

    # Mass Assignment Defense: strip fields that must only be set by dedicated endpoints
    PROTECTED_FIELDS = {
        "_id", "password",
        "role", "status",
        "admissionStatus", "slotStatus",
        "examScore", "bcetRawScore", "bcetHighestScore", "totalPerc",
        "interviewScore", "isInterviewed", "isExamined",
        "isApplicationAccepted",
        "applicantId", "section"
    }
    update_data = {
        k: v for k, v in payload.items() 
        if k not in PROTECTED_FIELDS and not str(k).startswith("$") and "." not in str(k)
    }

    # Validate phone numbers if supplied
    for c_field in ["contactNumber", "fatherContact", "motherContact"]:
        if c_field in update_data and update_data[c_field]:
            c_val = str(update_data[c_field]).strip()
            if not re.match(r"^09\d{9}$", c_val):
                raise HTTPException(status_code=400, detail=f"{c_field} must start with '09' and be exactly 11 digits.")

    update_data["updatedAt"] = datetime.utcnow()
    
    # Sync root-level firstChoice and secondChoice if they are updated in profile
    if "profile" in update_data and "appDetails" in update_data["profile"]:
        if "firstChoice" in update_data["profile"]["appDetails"]:
            fc = update_data["profile"]["appDetails"]["firstChoice"]
            update_data["firstChoice"] = fc.split(" - ")[0].strip() if fc else ""
        if "secondChoice" in update_data["profile"]["appDetails"]:
            sc = update_data["profile"]["appDetails"]["secondChoice"]
            update_data["secondChoice"] = sc.split(" - ")[0].strip() if sc else ""

    if update_data.get("reconsiderationProgram"):
        update_data["activeProgram"] = update_data["reconsiderationProgram"]
        update_data["activeChoiceType"] = "reconsideration"
            
    applicant_collection.update_one({"_id": ObjectId(id)}, {"$set": update_data})
    
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
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid applicant ID format")
    payload = payload.model_dump()
    score = float(payload.get("score", 0))
    new_status = "Pending" if score == 0 else ("Passed" if score > 69 else "Failed")
    update_data = {
        "interviewScore": score,
        "interviewRatings": payload.get("ratings"),
        "interviewStatus": new_status,
        "isInterviewed": True,
        "isApplicationAccepted": True,
        "interviewDate": payload.get("interviewDate"),
        "interviewer": payload.get("interviewer", "")
    }
    applicant_collection.update_one({"_id": ObjectId(id)}, {"$set": update_data})
    return {"message": "Scores saved"}

@router.put("/applicant/{id}/interview")
async def update_interview_status(id: str, payload: UpdateInterviewStatusPayload = Body(...), user: dict = Depends(admin_only)):
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid applicant ID format")
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
    
    obj_ids = [ObjectId(i) for i in ids if ObjectId.is_valid(i)]
    if not obj_ids:
        raise HTTPException(status_code=400, detail="No valid applicant IDs provided")
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

    brevo_active = bool(os.getenv("BREVO_API_KEY"))
    live_dispatched = False

    for email_data in emails:
        to_email = email_data.get("email")
        subject = email_data.get("subject", "Admission Notice")
        message_body = email_data.get("message", "")
        app_id = email_data.get("applicantId")
        html_message = email_data.get("htmlMessage")
        email_type = email_data.get("type", "Admission Qualification Notice")

        try:
            # 1. Attempt real email via Brevo HTTP API
            if to_email:
                from utils.pre_admission.email_service import send_mail
                try:
                    res = send_mail(to_email, subject, message_body, html=html_message)
                    if res:
                        live_dispatched = True
                except Exception as mail_err:
                    print(f"[EMAIL WARNING] Live dispatch failed for {to_email}: {mail_err}")

            # 2. Safely update database flag and save sent email content
            if app_id:
                query = {"_id": ObjectId(app_id)} if ObjectId.is_valid(app_id) else {"applicantId": app_id}
                set_fields = {"isEmailSent": True}
                hardcopy_deadline = email_data.get("hardcopySubmissionDeadline") or payload.get("hardcopySubmissionDeadline")
                if hardcopy_deadline:
                    set_fields["hardcopySubmissionDeadline"] = str(hardcopy_deadline).strip()
                applicant_collection.update_one(
                    query,
                    {
                        "$set": set_fields,
                        "$push": {"sentEmails": {
                            "type": email_type,
                            "subject": subject,
                            "message": message_body,
                            "body": message_body,
                            "htmlMessage": html_message,
                            "sentAt": datetime.utcnow()
                        }}
                    }
                )
            sent_count += 1
        except Exception as e:
            print(f"Failed to record email for {to_email}: {e}")
            failed_count += 1

    feedback_msg = f"Message sent successfully to {sent_count} applicant(s)." if sent_count > 1 else "Message sent successfully!"

    return {
        "message": feedback_msg,
        "sent": sent_count,
        "failed": failed_count,
        "liveDispatched": live_dispatched
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
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid applicant ID format")
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
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid applicant ID format")
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
        second_choice = (
            existing.get("secondChoice") or 
            (existing.get("profile") or {}).get("appDetails", {}).get("secondChoice", "")
        )
        applicant_collection.update_one(
            {"_id": ObjectId(id)}, 
            {"$set": {
                "isRejectedFirstChoice": True,
                "activeProgram": second_choice,
                "activeChoiceType": "secondChoice"
            }}
        )
        return {"message": "Applicant rejected for 1st choice. Moved to 2nd choice program."}
    else:
        # Already rejected 1st choice, now rejected 2nd choice
        applicant_collection.update_one(
            {"_id": ObjectId(id)}, 
            {"$set": {
                "isRejectedSecondChoice": True,
                "admissionStatus": "For Interview",
                "admissionRemarks": "Failed",
                "activeChoiceType": "rejected"
            }}
        )
        return {"message": "Applicant rejected for 2nd choice. Marked for interview (re-evaluation)."}

@router.put("/applicant/{id}/reassign-program")
async def reassign_applicant_program(id: str, payload: ReassignProgramPayload = Body(...), user: dict = Depends(admin_only)):
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid applicant ID format")
    payload = payload.model_dump()
    new_program = payload.get("newProgram")
    if not new_program:
        raise HTTPException(status_code=400, detail="New program is required")
        
    existing = applicant_collection.find_one({"_id": ObjectId(id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Applicant not found")
        
    orig_fc = existing.get("originalFirstChoice") or existing.get("firstChoice") or (existing.get("profile") or {}).get("appDetails", {}).get("firstChoice", "")

    # Set the new program as activeProgram and reassignedProgram
    applicant_collection.update_one(
        {"_id": ObjectId(id)}, 
        {"$set": {
            "profile.appDetails.firstChoice": new_program,
            "firstChoice": new_program,
            "originalFirstChoice": orig_fc,
            "reassignedProgram": new_program,
            "activeProgram": new_program,
            "activeChoiceType": "reassigned",
            "isRejectedFirstChoice": False,
            "isRejectedSecondChoice": False,
            "isReassigned": True,
            "admissionStatus": "Pending",
            "admissionRemarks": ""
        }}
    )
    return {"message": f"Applicant reassigned to {new_program} successfully."}

@router.put("/applicant/{id}/accept-application")
async def accept_applicant_application(id: str, user: dict = Depends(admin_only)):
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid applicant ID")
    existing = applicant_collection.find_one({"_id": ObjectId(id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Applicant not found")
        
    admin_id = user.get("email") or user.get("username") or "Admin"
    now = datetime.utcnow()
    update_data = {
        "isApplicationAccepted": True,
        "applicationAcceptedAt": now,
        "applicationAcceptedBy": admin_id
    }

    # Check if interview is waived for applicant's course/institute
    course_name = get_applicant_course(existing)
    settings = settings_collection.find_one({"institute": "Admission"}) or {}
    all_courses = settings.get("courses", [])
    all_institutes = settings.get("institutes", [])
    matched_course = next((c for c in all_courses if c.get("name", "").lower() == course_name.lower() or c.get("abbreviation", "").lower() == course_name.lower()), None)
    c_inst = str(matched_course.get("institute", "")).strip().lower() if matched_course else ""
    active_inst = next((i for i in all_institutes if str(i.get("_id", "")).lower() == c_inst or i.get("name", "").lower() == c_inst or i.get("abbreviation", "").lower() == c_inst), None)
    requires_interview = bool(active_inst.get("requiresInterview", True) and active_inst.get("hasInterview", True)) if active_inst else True
    is_waived = bool(existing.get("isInterviewWaived") or not requires_interview)

    if is_waived:
        update_data["isInterviewWaived"] = True
        update_data["isInterviewed"] = True
        update_data["interviewScore"] = 50
        update_data["interviewStatus"] = "Passed"
        update_data["interviewRemarks"] = "Auto-credited (No Interview)"
        update_data["status"] = existing.get("admissionStatus", "Pending")

    applicant_collection.update_one(
        {"_id": ObjectId(id)},
        {"$set": update_data}
    )
    return {
        "message": "Applicant application accepted successfully.", 
        "isApplicationAccepted": True,
        "isInterviewWaived": is_waived
    }

@router.put("/applicant/{id}/status")
async def update_status(id: str, payload: UpdateStatusPayload = Body(...), user: dict = Depends(admin_only)):
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid applicant ID format")
    payload = payload.model_dump()
    status = payload.get("status")
    slot_status = payload.get("slotStatus")
    exam_score = payload.get("examScore")
    interview_score = payload.get("interviewScore")
    gwa = payload.get("gwa")
    total_perc = payload.get("totalPerc")
    bcet_raw = payload.get("bcetRawScore")
    bcet_highest = payload.get("bcetHighestScore")
    
    existing_applicant = applicant_collection.find_one({"_id": ObjectId(id)})
    if not existing_applicant:
        raise HTTPException(status_code=404, detail="Applicant not found")

    is_interviewed = bool(
        existing_applicant.get("isInterviewed") or
        existing_applicant.get("interviewStatus") in ["Passed", "Failed"] or
        (existing_applicant.get("interviewScore") is not None and float(existing_applicant.get("interviewScore", 0)) > 0) or
        (interview_score is not None and float(interview_score) > 0)
    )

    update_fields = {}
    if status:
        if status in ["Confirmed", "Forfeit"]:
            update_fields["slotStatus"] = "Pending" if status == "Confirmed" else "Forfeited"
            update_fields["admissionStatus"] = "Confirmed" if status == "Confirmed" else "Forfeit"
            if status == "Confirmed":
                update_fields["admissionRemarks"] = "Passed"
        elif status in ["Passed", "Waitlisted", "Failed"]:
            if is_interviewed:
                update_fields["admissionRemarks"] = status
                update_fields["admissionStatus"] = status
            else:
                update_fields["admissionStatus"] = "Pending"
                update_fields["admissionRemarks"] = ""
                update_fields["status"] = "For Interview"
        elif status in ["For Interview", "Pending"]:
            update_fields["admissionStatus"] = "Pending"
            update_fields["admissionRemarks"] = ""
            update_fields["status"] = "For Interview"
            update_fields["isInterviewed"] = False
            update_fields["interviewStatus"] = "Pending"
            update_fields["interviewScore"] = None
            update_fields["interviewRatings"] = {}
        else:
            update_fields["admissionStatus"] = status
        db_status = update_fields.get("status", update_fields.get("admissionStatus", status))

    if slot_status:
        update_fields["slotStatus"] = slot_status
    if exam_score is not None and is_interviewed:
        update_fields["examScore"] = float(exam_score)
        update_fields["isExamined"] = True
        update_fields["examStatus"] = "Passed" if float(exam_score) >= 37.5 else "Failed"
        if bcet_raw is not None:
            update_fields["bcetRawScore"] = float(bcet_raw)
        if bcet_highest is not None:
            update_fields["bcetHighestScore"] = float(bcet_highest)
    if interview_score is not None:
        update_fields["interviewScore"] = float(interview_score)
    if gwa is not None:
        update_fields["gwa"] = str(gwa)
    if total_perc is not None:
        update_fields["totalPerc"] = float(total_perc)
    
    if is_interviewed:
        if bcet_raw is not None and "bcetRawScore" not in update_fields:
            update_fields["bcetRawScore"] = float(bcet_raw)
        if bcet_highest is not None and "bcetHighestScore" not in update_fields:
            update_fields["bcetHighestScore"] = float(bcet_highest)

    # If slot status or admission status is Admitted, auto-assign section if missing
    target_slot = update_fields.get("slotStatus", "").lower()
    target_adm = update_fields.get("admissionStatus", "").lower()
    if target_slot == "admitted" or target_adm == "admitted":
        # Strictly enforce slot acceptance deadline
        submission_deadline = existing_applicant.get("hardcopySubmissionDeadline") or existing_applicant.get("slotAcceptanceDeadline")
        if not submission_deadline:
            sys_settings = settings_collection.find_one({})
            if sys_settings:
                submission_deadline = sys_settings.get("slotAcceptanceDeadline")
        if submission_deadline:
            try:
                PH_TZ = timezone(timedelta(hours=8))
                deadline_str = str(submission_deadline).strip()
                if len(deadline_str) == 10:
                    deadline_dt = datetime.strptime(deadline_str, "%Y-%m-%d").replace(tzinfo=PH_TZ) + timedelta(days=1, seconds=-1)
                else:
                    deadline_dt = datetime.fromisoformat(deadline_str.replace("Z", "+00:00"))
                    if deadline_dt.tzinfo is None:
                        deadline_dt = deadline_dt.replace(tzinfo=PH_TZ)

                if datetime.now(PH_TZ) > deadline_dt:
                    raise HTTPException(
                        status_code=400,
                        detail="The deadline to submit physical requirements and secure this slot has expired."
                    )
            except HTTPException:
                raise
            except Exception as e:
                print(f"Error checking submission deadline: {e}")

        if not existing_applicant.get("section"):
            course = get_applicant_course(existing_applicant)
            sy = get_applicant_school_year(existing_applicant)
            update_fields["section"] = get_auto_section(course, sy)

    # Strictly preserve A- prefix on applicantId
    curr_id = existing_applicant.get("applicantId")
    if curr_id and not str(curr_id).startswith("A-") and curr_id != "Forfeit":
        update_fields["applicantId"] = f"A-{curr_id}"

    current_status = (existing_applicant.get("admissionStatus") or "pending").lower()
    check_exam = update_fields.get("examScore", existing_applicant.get("examScore", 0)) or 0
    check_interview = update_fields.get("interviewScore", existing_applicant.get("interviewScore", 0)) or 0

    is_passing_scores = (check_exam >= 37.5 and check_interview >= 70)
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

@router.post("/applicants/import-scores")
async def import_scores(file: UploadFile = File(...), user: dict = Depends(admin_only)):
    if not (file.filename and file.filename.lower().endswith(".csv")):
        raise HTTPException(status_code=400, detail="Invalid file format. Only CSV files (.csv) are allowed.")
    valid_csv_mimes = ["text/csv", "application/vnd.ms-excel", "application/csv", "text/plain", "application/octet-stream"]
    if file.content_type and file.content_type.lower() not in valid_csv_mimes:
        raise HTTPException(status_code=400, detail="Invalid file type. File must be a valid CSV.")

    content = await file.read()
    try:
        decoded_content = content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Invalid file encoding. File must be UTF-8 encoded.")

    rows = decoded_content.split("\n")
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
                target_interviewed = bool(
                    target.get("isInterviewed") or
                    target.get("interviewStatus") in ["Passed", "Failed"] or
                    (target.get("interviewScore") is not None and float(target.get("interviewScore") or 0) > 0)
                )
                if not target_interviewed:
                    continue
                update_data = {
                    "examScore": score,
                    "isExamined": True
                }
                if remarks: update_data["examStatus"] = remarks
                if exam_date: update_data["examDate"] = exam_date
                
                applicant_collection.update_one({"_id": target["_id"]}, {"$set": update_data})
                updated_count += 1
                
    return {"message": f"Successfully imported and updated {updated_count} applicants."}

@router.delete("/applicant/{id}")
@router.delete("/applicants/{id}")
async def delete_applicant(id: str, user: dict = Depends(admin_only)):
    query_conditions = [{"applicantId": id}, {"id": id}]
    if ObjectId.is_valid(id):
        query_conditions.append({"_id": ObjectId(id)})
    
    applicant = applicant_collection.find_one({"$or": query_conditions})
    if not applicant:
        raise HTTPException(status_code=404, detail="Applicant not found")
        
    app_oid = applicant["_id"]
    app_id_str = applicant.get("applicantId") or str(app_oid)
    app_email = applicant.get("email")
    
    try:
        # 1. Delete applicant record
        applicant_collection.delete_one({"_id": app_oid})
        
        # 2. Delete corresponding student login account
        if app_email:
            user_collection.delete_many({"$or": [{"email": app_email}, {"username": app_id_str}]})
        elif app_id_str:
            user_collection.delete_many({"username": app_id_str})
            
        # 3. Clean up associated notifications
        notification_collection.delete_many({"$or": [{"recipientId": str(app_oid)}, {"recipientId": app_id_str}]})
        
        # 4. Audit log
        user_name = user.get("username") or user.get("email") or "Admin"
        user_role = user.get("role") or "Admin"
        audit_collection.insert_one({
            "user": user_name,
            "role": user_role,
            "action": f"Deleted applicant {app_id_str} ({applicant.get('name') or applicant.get('firstName', '')})",
            "performedBy": user_name,
            "institute": user.get("institute") or "Admission",
            "status": "Success",
            "timestamp": datetime.utcnow()
        })
        
        return {"msg": "Applicant deleted successfully", "deletedId": str(app_oid)}
    except Exception as e:
        user_name = user.get("username") or user.get("email") or "Admin"
        user_role = user.get("role") or "Admin"
        audit_collection.insert_one({
            "user": user_name,
            "role": user_role,
            "action": f"Deleted applicant {app_id_str} ({applicant.get('name') or applicant.get('firstName', '')})",
            "performedBy": user_name,
            "institute": user.get("institute") or "Admission",
            "status": "Failed",
            "timestamp": datetime.utcnow()
        })
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/utilities/fix-missing-sections")
async def fix_missing_sections(user: dict = Depends(admin_only)):
    """Assigns sections to admitted applicants who are missing one."""
    query = {
        "slotStatus": {"$in": ["Admitted", "admitted"]},
        "$or": [
            {"section": {"$exists": False}},
            {"section": None},
            {"section": ""}
        ]
    }
    
    missing_applicants = list(applicant_collection.find(query))
    updated_count = 0
    
    for app in missing_applicants:
        course = get_applicant_course(app)
        sy = get_applicant_school_year(app)
        new_section = get_auto_section(course, sy)
        
        applicant_collection.update_one(
            {"_id": app["_id"]}, 
            {"$set": {"section": new_section}}
        )
        updated_count += 1
        
    return {"msg": f"Successfully auto-assigned sections to {updated_count} applicants!"}

@router.get("/utilities/backfill-active-programs")
async def backfill_active_programs(user: dict = Depends(admin_only)):
    """One-time utility to populate activeProgram and activeChoiceType for existing records."""
    all_applicants = list(applicant_collection.find({}))
    updated_count = 0
    for app in all_applicants:
        updates = {}
        if not app.get("activeProgram"):
            effective = get_applicant_course(app)
            if effective:
                updates["activeProgram"] = effective
                if app.get("reassignedProgram"):
                    updates["activeChoiceType"] = "reassigned"
                elif app.get("reconsiderationProgram"):
                    updates["activeChoiceType"] = "reconsideration"
                elif app.get("isRejectedFirstChoice"):
                    updates["activeChoiceType"] = "secondChoice"
                else:
                    updates["activeChoiceType"] = "firstChoice"
        if updates:
            applicant_collection.update_one({"_id": app["_id"]}, {"$set": updates})
            updated_count += 1
    return {"msg": f"Successfully backfilled activeProgram for {updated_count} applicants!"}

@router.post("/utilities/hash-legacy-passwords")
async def hash_legacy_passwords(user: dict = Depends(admin_only)):
    users = user_collection.find({})
    updated_count = 0
    
    for u in users:
        pw = u.get("password", "")
        if pw and not (pw.startswith("$2b$") or pw.startswith("$2a$")):
            hashed_pw = pwd_context.hash(pw)
            user_collection.update_one(
                {"_id": u["_id"]}, 
                {"$set": {"password": hashed_pw}}
            )
            updated_count += 1
            
    return {"message": f"Successfully secured {updated_count} plain-text accounts."}

@router.get("/utilities/clean-sections")
async def clean_sections(user: dict = Depends(admin_only)):
    """Removes the word 'Section ' from the database so it just leaves the letter."""
    apps_with_long_section = applicant_collection.find({"section": {"$regex": "^Section "}})
    count = 0
    for app in apps_with_long_section:
        just_the_letter = app["section"].replace("Section ", "")
        applicant_collection.update_one({"_id": app["_id"]}, {"$set": {"section": just_the_letter}})
        count += 1
    return {"msg": f"Cleaned up the word 'Section' from {count} applicants!"}

@router.put("/settings/email-template")
async def update_email_template(payload: UpdateEmailTemplatePayload = Body(...), user: dict = Depends(admin_only)):
    payload = payload.model_dump()
    try:
        settings_collection.update_one(
            {"institute": "Admission"}, 
            {"$set": {"emailTemplate": payload}},
            upsert=True 
        )
        return {"msg": "Email template saved successfully!"}
    except Exception as e:
        raise HTTPException(status_code=400, detail="Failed to save email template")

# ==========================================
# FALLBACKS & DYNAMIC ROUTES
# ==========================================

@router.put("/user/{user_id}")
async def update_admin_user(user_id: str, payload: UpdateAdminPayload = Body(...), user: dict = Depends(admin_only)):
    payload = payload.model_dump()
    try:
        payload.pop("_id", None)
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

@router.delete("/user/{user_id}")
async def delete_admin_user(user_id: str, user: dict = Depends(admin_only)):
    try:
        result = user_collection.delete_one({"_id": ObjectId(user_id)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Admin not found")
        return {"msg": "Admin deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid User ID format")

@router.put("/{id}")
async def update_admin_fallback(id: str, payload: UpdateAdminPayload = Body(...), user: dict = Depends(admin_only)):
    payload = payload.model_dump()
    user_collection.update_one({"_id": ObjectId(id)}, {"$set": payload})
    return {"msg": "Admin updated"}

@router.delete("/{id}")
async def delete_admin_fallback(id: str, user: dict = Depends(admin_only)):
    user_collection.delete_one({"_id": ObjectId(id)})
    return {"msg": "Admin deleted"}
