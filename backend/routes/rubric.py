from fastapi import APIRouter, Depends, HTTPException, Request
from database import rubric_collection
from middlewares.auth import admin_only
from routes.admin import fix_ids 
from datetime import datetime

router = APIRouter(prefix="/api/admin/rubric", tags=["Rubric"])

@router.get("")
@router.get("/")
async def get_rubric(user: dict = Depends(admin_only)):
    config = rubric_collection.find_one({"institute": "Admission"})
    if not config:
        config = {
            "institute": "Admission", 
            "sections": [],
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow()
        }
        rubric_collection.insert_one(config)
    
    return fix_ids(config.get("sections", []))

@router.put("")
@router.put("/")
async def save_rubric(request: Request, user: dict = Depends(admin_only)):
    body = await request.json()
    sections = body.get("sections", []) if isinstance(body, dict) else body
    
    config = rubric_collection.find_one({"institute": "Admission"})
    
    if not config:
        rubric_collection.insert_one({
            "institute": "Admission", 
            "sections": sections,
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow()
        })
    else:
        rubric_collection.update_one(
            {"_id": config["_id"]}, 
            {"$set": {
                "sections": sections,
                "updatedAt": datetime.utcnow()
            }}
        )
        
    return {"message": "Interview Rubric saved successfully!", "sections": fix_ids(sections)}