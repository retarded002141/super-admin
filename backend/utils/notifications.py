from datetime import datetime
from database import notification_collection, settings_collection

async def create_notification(title: str, message: str, type: str = 'info', category: str = None):
    try:
        if category:
            settings = settings_collection.find_one({"institute": "Admission"})
            if settings and settings.get("notifications", {}).get(category) is False:
                print(f"🚫 Notification Blocked by Settings: {category}")
                return
        
        notification_collection.insert_one({
            "institute": "Admission",
            "title": title,
            "message": message,
            "type": type,
            "isUnread": True,
            "createdAt": datetime.utcnow()
        })
        print(f"🔔 Notification Created: {title}")
    except Exception as e:
        print(f"Failed to create notification: {e}")