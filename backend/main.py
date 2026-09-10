import os
from typing import List

from dotenv import load_dotenv
import dns.resolver

load_dotenv()
dns.resolver.default_resolver = dns.resolver.Resolver(configure=False)
dns.resolver.default_resolver.nameservers = ['8.8.8.8', '8.8.4.4']

from routes import record_admin
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from bson import ObjectId
from database import ping_db, db, settings_collection, student_collection
from schemas.global_schemas import AnnouncementSchema, AnnouncementUpdateSchema
from routes import admin_auth
from routes.pre_admission import admin, applicant, pdf, rubric
from routes import notification
from utils.cleanup_cron import start_cron

app = FastAPI(title="Central Admin System API")

# Configure CORS
origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the Static Uploads Folder
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

@app.on_event("startup")
async def startup_event():
    await ping_db()
    start_cron()
    print("[SUCCESS] Database Pinged and Automated Cron Jobs Initialized")

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
# ANNOUNCEMENTS ROUTES (SYNCHRONIZED WITH SHARED DB)
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
# PRE-ENROLLMENT ROUTES
# ==========================================
@app.get("/api/students")
async def get_enrollment_students(
    status: str = None, 
    year: str = None, 
    section: str = None, 
    semester: str = None
):
    query = {}
    if status and status != "All Registered":
        query["status"] = status
    if year:
        query["year"] = year
    if section:
        query["section"] = section
    if semester:
        query["semester"] = semester
        
    students = []
    for s in student_collection.find(query):
        s["_id"] = str(s["_id"])
        students.append(s)
    return students

@app.get("/api/curriculum/{year}")
async def get_curriculum_year(year: str):
    doc = db["curriculums"].find_one({"year": year})
    if not doc:
        return {"year": year, "semesters": [{"semester": 1, "subjects": []}, {"semester": 2, "subjects": []}]}
    doc["_id"] = str(doc["_id"])
    return doc

@app.post("/api/curriculum")
async def save_curriculum(payload: dict = Body(...)):
    year = payload.get("year")
    data = payload.get("data")
    db["curriculums"].update_one({"year": year}, {"$set": data}, upsert=True)
    return {"message": "Curriculum updated", "data": data}

@app.get("/api/curriculum/doc/{doc_id}")
async def get_irregular_curriculum(doc_id: str):
    doc = db["curriculums"].find_one({"student_number": doc_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Curriculum not found")
    doc["_id"] = str(doc["_id"])
    return doc

@app.post("/api/curriculum/doc/{doc_id}")
async def save_irregular_curriculum(doc_id: str, payload: dict = Body(...)):
    data = payload.get("data", {})
    data["student_number"] = doc_id
    db["curriculums"].update_one({"student_number": doc_id}, {"$set": data}, upsert=True)
    return {"message": "Irregular curriculum updated", "data": data}

@app.get("/api/sections")
async def get_sections():
    sections = []
    for sec in db["sections"].find({}):
        sec["_id"] = str(sec["_id"])
        sections.append(sec)
    return sections

# ==========================================
# PRE-ADMISSION PUBLIC ROUTES
# ==========================================
@app.get("/api/public/settings")
async def get_public_settings():
    settings = settings_collection.find_one({})
    if not settings:
        return {"systemName": "Pre-Admission", "admissionStatus": "Open"}
    settings["_id"] = str(settings["_id"])
    return settings

@app.get("/api/public/courses")
async def get_public_courses():
    settings = settings_collection.find_one({})
    if settings and "courses" in settings:
        return settings["courses"]
    return []

# ==========================================
# ATTACH MODULAR ROUTERS
# ==========================================
app.include_router(rubric.router)
app.include_router(admin.router)       
app.include_router(admin_auth.router)  
app.include_router(applicant.router)
app.include_router(notification.router)
app.include_router(pdf.router)
app.include_router(record_admin.router)