# routes/record_admin.py
from fastapi import APIRouter, HTTPException, Body
from datetime import datetime
from database import db, student_collection

router = APIRouter(prefix="/api/student/records", tags=["Admin Student Records"])

# Define the archive collection in iiti_db
archived_requests_col = db["archived_requests"]

@router.get("/all")
def get_all_active_records():
    """Gathers all active, unarchived student requests from students collection."""
    all_requests = []
    
    # Query students who have non-empty record_requests
    cursor = student_collection.find({"record_requests": {"$exists": True, "$ne": []}})

    for student in cursor:
        student_num = student.get("studentNumber") or student.get("student_number", "")
        first_name = student.get("firstName", "") or student.get("first_name", "")
        last_name = student.get("lastName", "") or student.get("last_name", "")
        student_name = f"{first_name} {last_name}".strip() or f"Student {student_num}"

        for idx, req in enumerate(student.get("record_requests", [])):
            req_copy = dict(req)
            req_copy["requestIndex"] = idx
            req_copy["studentNumber"] = student_num
            req_copy["studentName"] = student_name
            # Ensure an ID exists for React keys
            if "id" not in req_copy:
                req_copy["id"] = f"{student_num}_{idx}"
            all_requests.append(req_copy)

    return {"requests": all_requests}


@router.post("/status-update")
def update_record_status(payload: dict = Body(...)):
    """
    Updates status. If marked Ready for Pickup or Approved,
    automatically archives the item into 'archived_requests' and removes it from active list.
    """
    s_num = str(payload.get("studentNumber", ""))
    req_id = payload.get("requestId")
    req_idx = payload.get("requestIndex")
    new_status = payload.get("newStatus", "Pending")

    student = student_collection.find_one({
        "$or": [{"studentNumber": s_num}, {"student_number": s_num}]
    })

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    requests = student.get("record_requests", [])
    target_req = None
    target_idx = -1

    for idx, r in enumerate(requests):
        if (req_id and r.get("id") == req_id) or (req_idx is not None and idx == req_idx):
            target_req = r
            target_idx = idx
            break

    if not target_req or target_idx == -1:
        raise HTTPException(status_code=404, detail="Record request not found")

    # AUTO-ARCHIVE ON READY FOR PICKUP / APPROVED
    if new_status.lower() in ["ready for pickup", "approved", "completed"]:
        target_req["status"] = new_status
        target_req["archivedAt"] = datetime.utcnow()
        target_req["archivedBy"] = "SuperAdmin"

        # 1. Insert into archived_requests collection in iiti_db
        archived_requests_col.insert_one(target_req)

        # 2. Remove from student's active array
        requests.pop(target_idx)
        student_collection.update_one(
            {"_id": student["_id"]},
            {"$set": {"record_requests": requests}}
        )

        return {"message": f"Request marked as {new_status} and archived to 'archived_requests'."}
    else:
        # Standard status update
        requests[target_idx]["status"] = new_status
        student_collection.update_one(
            {"_id": student["_id"]},
            {"$set": {"record_requests": requests}}
        )
        return {"message": "Status updated successfully"}


@router.post("/admin-delete")
def delete_record_admin(payload: dict = Body(...)):
    s_num = str(payload.get("studentNumber", ""))
    req_idx = payload.get("requestIndex")

    student = student_collection.find_one({
        "$or": [{"studentNumber": s_num}, {"student_number": s_num}]
    })

    if student and req_idx is not None:
        requests = student.get("record_requests", [])
        if 0 <= req_idx < len(requests):
            requests.pop(req_idx)
            student_collection.update_one(
                {"_id": student["_id"]},
                {"$set": {"record_requests": requests}}
            )
            return {"message": "Request deleted"}

    return {"message": "Request could not be deleted"}