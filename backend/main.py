import os
from typing import Optional, List

from dotenv import load_dotenv
import dns.resolver
from routes.pre_admission import admin, applicant, pdf, rubric
from routes import notification

load_dotenv()
dns.resolver.default_resolver = dns.resolver.Resolver(configure=False)
dns.resolver.default_resolver.nameservers = ['8.8.8.8', '8.8.4.4']

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from bson import ObjectId
from database import ping_db, db_admin, settings_collection

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

# Mount the Static Uploads Folder (From Admission)
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Combined Startup Event
from utils.cleanup_cron import start_cron

@app.on_event("startup")
async def startup_event():
    await ping_db()
    start_cron()
    print("[SUCCESS] Database Pinged and Automated Cron Jobs Initialized")

@app.get("/")
async def root():
    return {"message": "Central Admin System API is Live"}

# ==========================================
# PYDANTIC SCHEMAS
# ==========================================
class AnnouncementSchema(BaseModel):
    category: str = "iiti"
    title: str
    description: str
    image: Optional[str] = ""
    date: str
    dateValue: Optional[str] = ""
    published: Optional[bool] = True

class AnnouncementUpdateSchema(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    date: Optional[str] = None
    dateValue: Optional[str] = None

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
# ANNOUNCEMENTS ROUTE
# ==========================================
@app.get("/api/announcements", response_model=List[dict])
async def get_announcements(category: str = "iiti"):
    cursor = db_admin["announcements"].find({
        "$or": [
            {"category": category},
            {"category": {"$exists": False}}
        ]
    })
    announcements = []
    async for doc in cursor:
        announcements.append(announcement_helper(doc))
    return announcements

@app.post("/api/announcements", response_model=dict)
async def create_announcement(data: AnnouncementSchema):
    doc = data.dict()
    result = await db_admin["announcements"].insert_one(doc)
    created_doc = await db_admin["announcements"].find_one({"_id": result.inserted_id})
    return announcement_helper(created_doc)

@app.put("/api/announcements/{id}", response_model=dict)
async def update_announcement(id: str, data: AnnouncementUpdateSchema):
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid ID format")

    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields provided for update")

    result = await db_admin["announcements"].update_one(
        {"_id": ObjectId(id)}, {"$set": update_data}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Announcement not found")

    updated_doc = await db_admin["announcements"].find_one({"_id": ObjectId(id)})
    return announcement_helper(updated_doc)

@app.delete("/api/announcements/{id}")
async def delete_announcement(id: str):
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid ID format")

    result = await db_admin["announcements"].delete_one({"_id": ObjectId(id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Announcement not found")

    return {"message": "Announcement deleted successfully", "id": id}

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
app.include_router(applicant.router)
app.include_router(notification.router)
app.include_router(pdf.router)

