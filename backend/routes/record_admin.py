# routes/record_admin.py
from fastapi import APIRouter, HTTPException, Body
from datetime import datetime
import uuid
from database import db, student_collection

router = APIRouter(prefix="/api/student/records", tags=["Admin Student Records"])

studentsnotif_col = db["studentsnotif"]
archived_requests_col = db["archived_requests"]

@router.get("/all")
def get_all_active_records():
    """Gathers all active student requests from students collection."""
    all_requests = []
    
    cursor = student_collection.find({"record_requests": {"$exists": True, "$ne": []}})

    for student in cursor:
        student_num = str(student.get("studentNumber") or student.get("student_number") or "")
        first_name = student.get("firstName") or student.get("first_name") or ""
        last_name = student.get("lastName") or student.get("last_name") or ""
        student_name = f"{first_name} {last_name}".strip() or f"Student {student_num}"

        req_list = student.get("record_requests", [])
        for idx, req in enumerate(req_list):
            req_copy = dict(req)
            req_copy["requestIndex"] = idx
            req_copy["studentNumber"] = student_num
            req_copy["studentName"] = req.get("studentName") or student_name
            if "id" not in req_copy or not req_copy["id"]:
                req_copy["id"] = str(req.get("_id", f"{student_num}_{idx}"))
            all_requests.append(req_copy)

    # Sort newest first
    all_requests.sort(
        key=lambda x: str(x.get("createdAt", "") or x.get("dateRequested", "")),
        reverse=True
    )

    return {"requests": all_requests}


@router.post("/status-update")
def update_record_status(payload: dict = Body(...)):
    """
    Updates request status inside student's record_requests array and 
    sends an in-app notification to studentsnotif collection when marked 'Ready for Pickup'.
    """
    s_num = str(payload.get("studentNumber", ""))
    req_id = payload.get("requestId")
    req_idx = payload.get("requestIndex")
    new_status = payload.get("newStatus", "Pending")

    student = student_collection.find_one({
        "$or": [
            {"studentNumber": s_num},
            {"student_number": s_num},
            {"studentNumber": int(s_num) if s_num.isdigit() else s_num}
        ]
    })

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    requests = student.get("record_requests", [])
    target_idx = -1

    for idx, r in enumerate(requests):
        r_id = str(r.get("id") or r.get("_id") or "")
        if (req_id and r_id == str(req_id)) or (req_idx is not None and idx == req_idx):
            target_idx = idx
            break

    if target_idx == -1:
        raise HTTPException(status_code=404, detail="Record request not found")

    doc_type = requests[target_idx].get("documentType", "Document")
    requests[target_idx]["status"] = new_status
    requests[target_idx]["updatedAt"] = datetime.utcnow().isoformat()

    # Update student record_requests
    student_collection.update_one(
        {"_id": student["_id"]},
        {"$set": {"record_requests": requests}}
    )

    # Insert into dedicated studentsnotif collection when status is 'Ready for Pickup'
    if new_status.lower() == "ready for pickup":
        new_notification = {
            "id": f"notif_{uuid.uuid4().hex[:8]}",
            "studentNumber": s_num,
            "title": "Document Request Ready for Pickup",
            "message": f"Your requested {doc_type} is now ready for pickup at the Registrar's Office.",
            "meta": "System | Records Request",
            "read": False,
            "link": "/Records_request",
            "createdAt": datetime.utcnow().isoformat() + "Z"
        }

        studentsnotif_col.insert_one(new_notification)

    return {"message": f"Status updated to {new_status} and student notified."}


@router.post("/admin-delete")
def delete_record_admin(payload: dict = Body(...)):
    s_num = str(payload.get("studentNumber", ""))
    req_id = payload.get("requestId")
    req_idx = payload.get("requestIndex")

    student = student_collection.find_one({
        "$or": [
            {"studentNumber": s_num},
            {"student_number": s_num},
            {"studentNumber": int(s_num) if s_num.isdigit() else s_num}
        ]
    })

    if student:
        requests = student.get("record_requests", [])
        target_idx = -1
        for idx, r in enumerate(requests):
            r_id = str(r.get("id") or r.get("_id") or "")
            if (req_id and r_id == str(req_id)) or (req_idx is not None and idx == req_idx):
                target_idx = idx
                break

        if target_idx != -1:
            requests.pop(target_idx)
            student_collection.update_one(
                {"_id": student["_id"]},
                {"$set": {"record_requests": requests}}
            )
            return {"message": "Request deleted"}

    return {"message": "Request could not be deleted"}