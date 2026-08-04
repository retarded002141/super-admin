from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from bson.errors import InvalidId
from database import notification_collection, settings_collection
from middlewares.auth import admin_only

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])

def time_ago(date_obj):
    if not date_obj: return "Just now"
    seconds = (datetime.utcnow() - date_obj).total_seconds()
    if seconds >= 31536000: return f"{int(seconds/31536000)}y ago"
    if seconds >= 2592000: return f"{int(seconds/2592000)}mo ago"
    if seconds >= 86400: return f"{int(seconds/86400)}d ago"
    if seconds >= 3600: return f"{int(seconds/3600)}h ago"
    if seconds >= 60: return f"{int(seconds/60)}m ago"
    return f"{int(seconds)}s ago"

@router.get("", include_in_schema=False)
@router.get("/")
async def get_notifications(user: dict = Depends(admin_only)):
    notifications = []
    # Filter by institute
    for n in notification_collection.find({"institute": "Admission"}).sort("createdAt", -1).limit(50):
        notifications.append({
            "id": str(n["_id"]),
            "title": n.get("title"),
            "message": n.get("message"),
            "type": n.get("type", "info"),
            "isUnread": n.get("isUnread", True),
            "time": time_ago(n.get("createdAt"))
        })
    return notifications

@router.put("/{id}/read")
async def mark_as_read(id: str, user: dict = Depends(admin_only)):
    try:
        notification_collection.update_one({"_id": ObjectId(id)}, {"$set": {"isUnread": False}})
        return {"msg": "Marked as read"}
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid notification ID format")

@router.put("/read-all")
async def mark_all_as_read(user: dict = Depends(admin_only)):
    notification_collection.update_many(
        {"institute": "Admission", "isUnread": True}, 
        {"$set": {"isUnread": False}}
    )
    return {"msg": "All marked as read"}

@router.delete("/clear-all")
async def clear_all_notifications(user: dict = Depends(admin_only)):
    notification_collection.delete_many({"institute": "Admission"})
    return {"msg": "All notifications permanently cleared"}