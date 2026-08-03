from database import audit_collection
from datetime import datetime

async def log_audit(actor_id, actor_role, action, target_id=None, from_val=None, to_val=None):
    audit_collection.insert_one({
        "institute": "Admission",
        "actorId": actor_id,
        "actorRole": actor_role,
        "action": action,
        "targetId": target_id,
        "from": from_val,
        "to": to_val,
        "timestamp": datetime.utcnow()
    })
    