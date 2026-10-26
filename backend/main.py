import os
import sys
from pathlib import Path
from typing import List

# Ensure backend directory is in sys.path for robust module resolution
backend_dir = str(Path(__file__).resolve().parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from dotenv import load_dotenv
import dns.resolver

load_dotenv()
dns.resolver.default_resolver = dns.resolver.Resolver(configure=False)
dns.resolver.default_resolver.nameservers = ['8.8.8.8', '8.8.4.4']

from routes import record_admin, admin_auth, notification
from routes.grading import router as grading_router
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from bson import ObjectId
from database import ping_db, db, sync_client, settings_collection
from schemas.global_schemas import AnnouncementSchema, AnnouncementUpdateSchema
from routes.pre_admission import admin, applicant, pdf, rubric
from utils.cleanup_cron import start_cron


# Safely import optional routers
try:
    from routes import auth_routes
except ImportError:
    auth_routes = None

try:
    from routes import student_routes
except ImportError:
    student_routes = None

from pymongo.errors import DuplicateKeyError
from routes.enrollment.database import Store
from routes.enrollment.core import respond
from routes.enrollment import students as enrollment_students
from routes.enrollment import sections as enrollment_sections
from routes.enrollment import curriculum as enrollment_curriculum
from routes.enrollment import schedules as enrollment_schedules

from routes.pre_advising.router import router as pre_advising_router

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from starlette import status
from fastapi import Request
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from slowapi.middleware import SlowAPIMiddleware
from utils.pre_admission.limiter import limiter

app = FastAPI(title="Central Admin System API")

# Rate limiting state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

store = Store(db, sync_client)
app.state.store = store
app.state.settings = {
    'MONGO_URI': os.getenv('MONGO_URI', ''),
    'MONGO_DB': os.getenv('DB_NAME', 'iiti_db'),
    'JWT_SECRET': os.getenv('JWT_SECRET', 'my_super_secret_key_2026'),
    'REQUIRE_ADMIN_AUTH': False,
    'RATE_LIMIT_ENABLED': False,
}

origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://btech-admission.vercel.app",
]

MAX_UPLOAD_SIZE = 10_485_760  # 10MB limit

class LimitUploadSize(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method in ["POST", "PUT"]:
            if 'content-length' in request.headers:
                try:
                    content_length = int(request.headers.get('content-length', 0))
                except (ValueError, TypeError):
                    content_length = 0
                if content_length > MAX_UPLOAD_SIZE:
                    return JSONResponse(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        content={"detail": "File size exceeds the 10MB limit. Please upload a smaller file."}
                    )
        return await call_next(request)

app.add_middleware(SlowAPIMiddleware)
app.add_middleware(LimitUploadSize)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

@app.exception_handler(DuplicateKeyError)
async def duplicate_key_handler(request, error):
    return respond({'message': 'A record with this unique identifier already exists', 'blockReason': 'duplicate_key'}, 409)

@app.on_event("startup")
async def startup_event():
    await ping_db()
    start_cron()
    try:
        store['students'].create_index('studentNumber', unique=True, name='studentNumber_1')
        store['sections'].create_index([('year', 1), ('section', 1), ('semester', 1)], unique=True, name='year_1_section_1_semester_1')
    except Exception as e:
        print(f"[INFO] Enrollment index notice: {e}")
    print("[SUCCESS] Database Pinged and Automated Cron Jobs Initialized")

@app.on_event("shutdown")
async def shutdown_event():
    try:
        sync_client.close()
    except Exception:
        pass

@app.get("/")
async def root():
    return {"message": "Central Admin System API is Live"}

def announcement_helper(doc) -> dict:
    return {
        "id": str(doc["_id"]),
        "category": doc.get("category", "iiti"),
        "title": doc.get("title", ""),
        "description": doc.get("description", ""),
        "image": doc.get("image", ""),
        "date": doc.get("date", ""),
        "dateValue": doc.get("dateValue", ""),
        "published": doc.get("published", True),
    }

# ==========================================
# ANNOUNCEMENTS ROUTES
# ==========================================
@app.get("/api/announcements", response_model=List[dict])
async def get_announcements(category: str = "iiti"):
    cursor = db["announcements"].find({
        "$or": [
            {"category": category},
            {"category": {"$exists": False}}
        ]
    })
    announcements = []
    for doc in cursor:
        announcements.append(announcement_helper(doc))
    return announcements

@app.post("/api/announcements", response_model=dict)
async def create_announcement(data: AnnouncementSchema):
    doc = data.dict()
    result = db["announcements"].insert_one(doc)
    created_doc = db["announcements"].find_one({"_id": result.inserted_id})
    return announcement_helper(created_doc)

@app.put("/api/announcements/{id}", response_model=dict)
async def update_announcement(id: str, data: AnnouncementUpdateSchema):
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid ID format")

    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields provided for update")

    result = db["announcements"].update_one(
        {"_id": ObjectId(id)}, {"$set": update_data}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Announcement not found")

    updated_doc = db["announcements"].find_one({"_id": ObjectId(id)})
    return announcement_helper(updated_doc)

@app.delete("/api/announcements/{id}")
async def delete_announcement(id: str):
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid ID format")

    result = db["announcements"].delete_one({"_id": ObjectId(id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Announcement not found")

    return {"message": "Announcement deleted successfully", "id": id}

# ==========================================
# PRE-ENROLLMENT ROUTES (V9.4)
# ==========================================
app.include_router(enrollment_students.router)
app.include_router(enrollment_sections.router)
app.include_router(enrollment_curriculum.router)
app.include_router(enrollment_schedules.router)

# ==========================================
# PRE-ADMISSION PUBLIC ROUTES
# ==========================================
@app.get("/api/public/settings")
async def get_public_settings():
    settings = settings_collection.find_one({"institute": "Admission"})
    if not settings:
        settings = settings_collection.find_one({})
    if not settings:
        return {"systemName": "Pre-Admission", "admissionStatus": "Open"}
    
    from utils.pre_admission.admission_status import evaluate_admission_status
    settings, needs_save = evaluate_admission_status(settings)

    if settings.get("applicationDeadline") and not settings.get("slotAcceptanceDeadline"):
        try:
            import calendar
            from datetime import datetime
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

@app.get("/api/public/courses")
async def get_public_courses():
    settings = settings_collection.find_one({"institute": "Admission"})
    if not settings:
        settings = settings_collection.find_one({})
    if settings and "courses" in settings:
        courses = settings["courses"]
        school_year = settings.get("schoolYear")
        from utils.pre_admission.program_capacity import with_capacity_status
        return [with_capacity_status(c, db["applicants"], school_year) for c in courses]
    return []

# ==========================================
# ATTACH MODULAR ROUTERS
# ==========================================
if auth_routes:
    app.include_router(auth_routes.router, prefix="/api/auth", tags=["Auth"])
if student_routes:
    app.include_router(student_routes.router, prefix="/api/student", tags=["Student"])

app.include_router(admin_auth.router)  
try:
    from routes import evaluation_sso
    app.include_router(evaluation_sso.router)
except Exception as e:
    print(f"[WARN] Evaluation SSO not loaded: {e}")
app.include_router(rubric.router)
app.include_router(admin.router)       
app.include_router(applicant.router)
app.include_router(notification.router)
app.include_router(pdf.router)
app.include_router(record_admin.router)
app.include_router(grading_router)
app.include_router(pre_advising_router)