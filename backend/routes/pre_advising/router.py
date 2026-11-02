import os
import asyncio
import json
import re
import math
import io
from datetime import datetime, timezone
from functools import cmp_to_key
from typing import Any, List, Optional
import pandas as pd
from fastapi import FastAPI, HTTPException, UploadFile, File, Body, Path, Form
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import UpdateOne, ReturnDocument
from bson import ObjectId
from dotenv import load_dotenv

# Import Pydantic schemas for data validation and defaults
from schemas.pre_advising_schemas import AdvisingRecord, ScheduleRequest, ExternalSchedule, SystemSettings, GradesSchema

# Initialize environment variables
load_dotenv()

from fastapi import APIRouter
router = APIRouter(prefix="/api/pre-advising", tags=["Pre-Advising"])


# Connect to MongoDB
client = AsyncIOMotorClient(os.getenv("MONGO_URI"))
db = client.get_database("iiti_db")  # Update this to your actual database name

def safe_float(val):
    if val is None or val == "": 
        return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0

# Aggressively sanitize MongoDB documents by converting ObjectId to string
# and ensuring the object is a standard, JSON-serializable Python dictionary.
def serialize_mongo_doc(data):
    if isinstance(data, list):
        return [serialize_mongo_doc(item) for item in data]
    elif isinstance(data, dict):
        sanitized = dict(data)
        if "_id" in sanitized:
            sanitized["_id"] = str(sanitized["_id"])
        return {k: serialize_mongo_doc(v) for k, v in sanitized.items()}
    elif isinstance(data, ObjectId):
        return str(data)
    return data

def parse_year_int(val):
    if val is None:
        return 1
    match = re.search(r"\d+", str(val))
    return int(match.group(0)) if match else 1

def format_section_name(program: str, year: Any, section: str) -> str:
    """
    Defensively formats section string as 'PROGRAM-YEARSECTION' (e.g. 'BSIT-1A').
    Prevents year stacking bugs like 'BSIT-11A'.
    """
    s = str(section or "A").strip()
    if "-" in s:
        return s
    y_str = str(parse_year_int(year))
    p_str = str(program or "BSIT").strip()
    if "-" in p_str:
        p_str = p_str.split("-")[0].strip() or "BSIT"
    
    clean_sec = s
    if clean_sec.startswith(y_str) and len(clean_sec) > len(y_str):
        clean_sec = clean_sec[len(y_str):]
    return f"{p_str}-{y_str}{clean_sec}"

def get_applicant_id_variants(applicant_id: Any) -> list:
    """
    Generates both 'A-2026-0001' and '2026-0001' variants to prevent prefix mismatch drops.
    """
    clean_id = str(applicant_id or "").strip()
    if not clean_id:
        return []
    if clean_id.startswith("A-"):
        return [clean_id, clean_id[2:]]
    return [f"A-{clean_id}", clean_id]

async def sanitize_advising_payload(payload: dict, settings_doc: Optional[dict] = None) -> dict:
    """
    Defensive guard ensuring all required downstream Enrollment fields
    (year, semester, section, targetSection) are populated before saving to db.advisingrecords.
    """
    if not payload:
        return payload

    payload = dict(payload)
    payload.pop("_id", None)

    current_time = datetime.now(timezone.utc)
    payload["updatedAt"] = current_time

    applicant_id = str(payload.get("applicantID") or payload.get("studentNumber") or "").strip()
    if not payload.get("advisingId"):
        payload["advisingId"] = f"adv_{applicant_id}_{int(current_time.timestamp())}"

    default_sem = "1st"
    if settings_doc:
        default_sem = str(settings_doc.get("semester", "1st Semester")).split(" ")[0]

    # Look up student/applicant if year, section, or program is missing
    student_doc = None
    if not payload.get("year") or not payload.get("section"):
        student_doc = await db.students.find_one({"$or": [{"studentNumber": applicant_id}, {"student_id": applicant_id}]})
        if not student_doc:
            variants = get_applicant_id_variants(applicant_id)
            student_doc = await db.applicants.find_one({"$or": [{"applicantId": v} for v in variants]})

    fallback_year = "1"
    fallback_section = "A"
    fallback_program = "BSIT"
    if student_doc:
        fallback_year = str(student_doc.get("year") or student_doc.get("yearLevel") or "1")
        fallback_section = str(student_doc.get("section") or "A")
        prog = str(student_doc.get("course") or student_doc.get("program") or student_doc.get("activeProgram") or "BSIT")
        fallback_program = prog.split("-")[0].strip() if "-" in prog else prog

    year_val = str(payload.get("year") or fallback_year).strip()
    sem_val = str(payload.get("semester") or default_sem).strip()
    sec_raw = str(payload.get("section") or fallback_section).strip()
    
    clean_sec = format_section_name(fallback_program, year_val, sec_raw)

    payload["year"] = year_val
    payload["semester"] = sem_val
    payload["section"] = clean_sec
    payload["enrollmentStatus"] = payload.get("enrollmentStatus") or "advised"

    # Sanitize advisedSubjects for irregular placements
    advised_subjects = payload.get("advisedSubjects", [])
    if isinstance(advised_subjects, list):
        sanitized_subjects = []
        for sub in advised_subjects:
            if isinstance(sub, dict):
                sub_dict = dict(sub)
                if not sub_dict.get("targetYear"):
                    sub_dict["targetYear"] = year_val
                if not sub_dict.get("targetSection"):
                    sub_dict["targetSection"] = clean_sec
                if not sub_dict.get("targetSemester"):
                    sub_dict["targetSemester"] = sem_val
                if not sub_dict.get("targetProgram"):
                    sub_dict["targetProgram"] = fallback_program
                sanitized_subjects.append(sub_dict)
            else:
                sanitized_subjects.append(sub)
        payload["advisedSubjects"] = sanitized_subjects

    return payload


# --- API ROUTES ---

@router.get("/schedules")
async def get_schedules():
    try:
        schedules = await db.schedules.find({}).to_list(None)
        formatted_schedules = []
        
        for s in schedules:
            safe_academic_year = s.get("academicYear", "").replace("-", " - ") if s.get("academicYear") else ""
            
            section_name = s.get("sectionName") or (
                format_section_name(s.get('program', 'BSIT'), s.get('year', 1), s.get('section', 'A'))
                if s.get("program") and s.get("year") and s.get("section") else ""
            )
            
            offered_semester = s.get("offeredSemester") or (
                f"{s.get('semester')} Semester {safe_academic_year}" 
                if s.get("semester") and safe_academic_year else ""
            )
            
            s["sectionName"] = section_name
            s["offeredSemester"] = offered_semester
            formatted_schedules.append(serialize_mongo_doc(s))
            
        return formatted_schedules
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/students")
async def get_students():
    try:
        students_cursor, applicants_cursor, advising_cursor, grades_cursor, curr_cursor, settings, sched_cursor = await asyncio.gather(
            db.students.find({}).to_list(None),
            # Defensive Admission ingestion query supporting both admissionStatus and slotStatus (case-insensitive)
            db.applicants.find({
                "$or": [
                    {"admissionStatus": {"$in": ["Admitted", "admitted", "Confirmed", "confirmed", "Advising Completed", "advising completed"]}},
                    {"slotStatus": {"$in": ["Admitted", "admitted"]}}
                ]
            }).to_list(None),
            db.advisingrecords.find({}).to_list(None),
            db.grades.find({}).to_list(None),
            db.curriculums.find({}).to_list(None),
            db.systemsettings.find_one({"systemName": "BTECH - IITI Pre-Admission System"}),
            db.schedules.find({}).to_list(None)
        )

        prereq_map = {}
        for curr in curr_cursor:
            for sem in curr.get("semesters", []):
                for sub in sem.get("subjects", []):
                    prereq_map[sub.get("subject_code")] = sub.get("prerequisites", [])

        raw_semester = (settings.get("semester") or "1st Semester") if settings else "1st Semester"
        active_sem_short = str(raw_semester).split(" ")[0]
        db_academic_year = (settings.get("schoolYear") or "2026-2027") if settings else "2026-2027"

        active_schedules = [
            s for s in sched_cursor
            if s.get("semester") == active_sem_short and s.get("academicYear") == db_academic_year
        ]

        unified_users = []

        for s in serialize_mongo_doc(students_cursor):
            s["isApplicant"] = False
            unified_users.append(s)

        for a in serialize_mongo_doc(applicants_cursor):
            app_id = a.get("applicantId")
            if not app_id:
                continue

            # Fix: extract course code using split("-")[0] instead of split("-")[-1]
            program_full = str(a.get("activeProgram") or a.get("firstChoice") or "BSIT").strip()
            course_code = program_full.split("-")[0].strip() if "-" in program_full else (program_full or "BSIT")

            applicant_type = str(a.get("applicantType") or "SHS Graduate")
            is_transferee = applicant_type.strip().lower() == "transferee"

            raw_sec = str(a.get("section") or "A").strip()
            a["studentNumber"] = str(app_id)
            a["course"] = course_code
            a["year"] = "1"
            a["yearLevel"] = 1
            a["section"] = format_section_name(course_code, 1, raw_sec)
            a["status"] = "Irregular" if is_transferee else "Regular"
            a["isApplicant"] = True
            unified_users.append(a)

        gatekeeper_updates = []
        students_with_grades = []

        for student in unified_users:
            student_num = str(student.get("studentNumber") or student.get("student_id") or student.get("studentId") or "")
            if not student_num:
                continue

            # Normalize applicant ID search across variants (with and without 'A-' prefix)
            id_variants = set(get_applicant_id_variants(student_num) + [student_num])

            advising_data = [
                r for r in advising_cursor
                if str(r.get("applicantID") or r.get("studentNumber") or "").strip() in id_variants
            ]
            academic_data = [
                r for r in grades_cursor
                if str(r.get("studentNumber") or r.get("student_id") or "").strip() in id_variants
            ]

            flat_grades = []

            for record in academic_data:
                if isinstance(record.get("academicRecords"), list):
                    for term in record["academicRecords"]:
                        if isinstance(term.get("grades"), list):
                            for g in term["grades"]:
                                flat_grades.append({
                                    **g,
                                    "semester": term.get("semester", g.get("semester")),
                                    "schoolYear": term.get("schoolYear", g.get("schoolYear"))
                                })

                if record.get("section_id") or record.get("section"):
                    parts = str(record.get("section_id") or "").split("-")
                    subject_code = str(
                        record.get("subjectCode") or record.get("subject_code") or (parts[-1] if parts else "")
                    ).upper()

                    computed = record.get("computedGrades") or {}
                    raw_snaps = record.get("rawSnapshots") or {}

                    prelim = safe_float(computed.get("prelim") or raw_snaps.get("prelim") or record.get("prelim"))
                    mid = safe_float(computed.get("raw_midterm") or computed.get("midterm") or raw_snaps.get("midterm") or record.get("rawMid"))
                    pre = safe_float(computed.get("raw_prefinal") or computed.get("prefinal") or raw_snaps.get("prefinal") or record.get("rawPre"))
                    fin = safe_float(computed.get("raw_final") or computed.get("final") or raw_snaps.get("final") or record.get("rawFinal"))

                    equiv_str = str(computed.get("equivalent") or "").strip().lower()
                    status_str = str(record.get("status") or "").strip().lower()
                    is_credited = status_str == "credited" or equiv_str == "credited"

                    average = (prelim + pre + mid + fin) / 4 if not is_credited else 100.0
                    status = "credited" if is_credited else ("passed" if average >= 75 else "failed")

                    flat_grades.append({
                        "subjectCode": subject_code,
                        "status": status,
                        "finalGrade": "Credited" if is_credited else round(average, 2),
                        "prelim": prelim,
                        "midterm": mid,
                        "preFinal": pre,
                        "final": fin,
                        "semester": record.get("semester") or "1st",
                        "schoolYear": record.get("academic_year") or record.get("schoolYear") or "2025-2026",
                        "originalSectionId": record.get("section_id") or record.get("section")
                    })

            current_advised_subjects = advising_data[0].get("advisedSubjects", []) if advising_data else []

            raw_status = str(student.get("status") or "Regular")
            current_status = "Regular" if raw_status.lower() in ["regular", "block"] else raw_status
            student["status"] = current_status

            demotion_reason = student.get("demotionReason")

            if current_status.lower() == "regular":
                is_demoted = False

                failed_grade = next(
                    (g for g in flat_grades if str(g.get("status") or "").lower() in ["failed", "inc"]),
                    None
                )
                if failed_grade:
                    is_demoted = True
                    demotion_reason = f"Failed: {failed_grade.get('subjectCode')}"

                if not is_demoted:
                    passed_subjects = [
                        g.get("subjectCode") for g in flat_grades
                        if str(g.get("status") or "").lower() in ["passed", "credited", "completed"]
                    ]

                    program_str = str(student.get("course") or student.get("program") or "BSIT")
                    formatted_year = parse_year_int(student.get("year") or student.get("yearLevel") or 1)
                    section_str = str(student.get("section") or "A")
                    target_section_str = format_section_name(program_str, formatted_year, section_str)

                    target_block = next(
                        (s for s in active_schedules if f"{s.get('program')}-{s.get('year')}{s.get('section')}" == target_section_str),
                        None
                    )

                    if target_block and target_block.get("classes"):
                        block_subjects = list(set(c.get("subjectCode") for c in target_block["classes"] if c.get("subjectCode")))
                        for subj_code in block_subjects:
                            reqs = prereq_map.get(subj_code, [])
                            missing_reqs = [req for req in reqs if req not in passed_subjects]
                            if missing_reqs:
                                is_demoted = True
                                demotion_reason = f"Missing Prereq: {missing_reqs[0]}"
                                break

                if is_demoted:
                    student["status"] = "Irregular"
                    student["demotionReason"] = demotion_reason
                    if not student.get("isApplicant"):
                        gatekeeper_updates.append(UpdateOne(
                            {"studentNumber": student_num},
                            {"$set": {"status": "Irregular", "demotionReason": demotion_reason}}
                        ))

            formatted_year = parse_year_int(student.get("year") or student.get("yearLevel") or 1)
            program_str = str(student.get("course") or student.get("program") or "BSIT")
            section_str = str(student.get("section") or "A")
            full_section_string = format_section_name(program_str, formatted_year, section_str)

            safe_student = {
                k: v for k, v in student.items()
                if k not in ["password", "record_requests", "notifications", "advisingData", "academicData", "otpCodeHash", "sentEmails"]
            }

            students_with_grades.append(serialize_mongo_doc({
                **safe_student,
                "studentNumber": student_num,
                "enrollmentStatus": student.get("enrollmentStatus") or student.get("enrollment_status") or "pending",
                "year": str(formatted_year),
                "yearLevel": formatted_year,
                "section": full_section_string,
                "grades": flat_grades,
                "advisedSubjects": current_advised_subjects,
                "demotionReason": demotion_reason
            }))

        if gatekeeper_updates:
            await db.students.bulk_write(gatekeeper_updates)

        return students_with_grades

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/curriculum/blueprint")
async def get_curriculum_blueprint(program: str, effectiveYear: str, yearLevel: str, semester: str):
    try:
        year_map = {"1": "1st", "2": "2nd", "3": "3rd", "4": "4th", "5": "5th"}
        formatted_year = year_map.get(yearLevel, yearLevel)
        
        curr = await db.curriculums.find_one({"year": formatted_year})
        if not curr:
            raise HTTPException(status_code=404, detail="Curriculum blueprint not found.")
            
        target_sem = next((s for s in curr.get("semesters", []) if s.get("semester") == int(semester)), None)
        subject_codes = [s.get("subject_code") for s in target_sem.get("subjects", [])] if target_sem else []
        
        if not subject_codes:
            return []
            
        targeted_subjects = await db.subjects.find({"subjectCode": {"$in": subject_codes}}).to_list(None)
        return [serialize_mongo_doc(s) for s in targeted_subjects]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error fetching blueprint.")

@router.get("/subjects")
async def get_subjects():
    try:
        curriculums = await db.curriculums.find({}).to_list(None)
        all_formatted_subjects = []

        for curr in curriculums:
            year_level = curr.get("year", "1st")
            
            for sem in curr.get("semesters", []):
                target_semester = "1st" if sem.get("semester") == 1 else "2nd"
                
                for sub in sem.get("subjects", []):
                    all_formatted_subjects.append({
                        "subjectCode": sub.get("subject_code"),
                        "subjectTitle": sub.get("title"),
                        "lecture": sub.get("lecture", 0),
                        "laboratory": sub.get("laboratory", 0),
                        "units": sub.get("units", 0),
                        "yearLevel": year_level,
                        "targetSemester": target_semester,
                        "prerequisites": sub.get("prerequisites", [])
                    })
                    
        return [serialize_mongo_doc(sub) for sub in all_formatted_subjects]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/schedules/save")
async def save_schedule(payload: dict = Body(...)):
    try:
        section_name = payload.get("sectionName")
        offered_semester = payload.get("offeredSemester")
        classes = payload.get("classes", [])

        if not section_name or not offered_semester:
            raise HTTPException(status_code=400, detail="Missing section name or semester.")
        if not isinstance(classes, list):
            raise HTTPException(status_code=400, detail="Invalid schedule data format.")

        # Clean preview and ghost flags upon explicit save to prevent permanent builder lockouts
        clean_classes = []
        for block in classes:
            if block.get("isGhostOriginal"):
                continue
            clean_block = {k: v for k, v in block.items() if k not in ["isRequestedChange", "isGhostOriginal"]}
            clean_classes.append(clean_block)
        classes = clean_classes

        parts = section_name.split("-")
        program = parts[0]
        year_section = parts[1] if len(parts) > 1 else ""
        year_num = year_section[0] if year_section else ""
        section = year_section[1] if len(year_section) > 1 else ""
        
        sem_parts = offered_semester.split(" Semester ")
        formatted_semester = sem_parts[0] if sem_parts else ""
        formatted_academic_year = sem_parts[1].replace(" ", "") if len(sem_parts) > 1 else ""

        filter_query = {
            "program": program,
            "year": year_num,
            "section": section,
            "academicYear": formatted_academic_year,
            "semester": formatted_semester
        }
        
        update_query = {
            "$set": {
                **filter_query,
                "classes": classes
            }
        }

        updated_schedule = await db.schedules.find_one_and_update(
            filter_query, update_query, upsert=True, return_document=ReturnDocument.AFTER
        )

        return {"message": "Schedule successfully saved.", "data": serialize_mongo_doc(updated_schedule)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/schedules/clear")
async def clear_schedule(payload: dict = Body(...)):
    try:
        section_name = payload.get("sectionName")
        offered_semester = payload.get("offeredSemester")

        if not section_name or not offered_semester:
            raise HTTPException(status_code=400, detail="Missing section name or semester.")

        parts = section_name.split("-")
        program = parts[0]
        year_section = parts[1] if len(parts) > 1 else ""
        year_num = year_section[0] if year_section else ""
        section = year_section[1] if len(year_section) > 1 else ""
        
        sem_parts = offered_semester.split(" Semester ")
        formatted_semester = sem_parts[0] if sem_parts else ""
        formatted_academic_year = sem_parts[1].replace(" ", "") if len(sem_parts) > 1 else ""

        await db.schedules.update_one(
            {
                "program": program,
                "year": year_num,
                "section": section,
                "academicYear": formatted_academic_year,
                "semester": formatted_semester
            },
            {"$set": {"classes": []}}
        )

        return {"message": "Schedule successfully cleared from database."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error while clearing the schedule.")

@router.get("/advising")
async def get_all_advising():
    try:
        records = await db.advisingrecords.find({}).to_list(None)
        return [serialize_mongo_doc(r) for r in records]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/transferee/credit")
async def credit_transferee_subject(payload: dict = Body(...)):
    try:
        student_number = str(payload.get("studentNumber", "")).strip()
        subject_code = str(payload.get("subjectCode", "")).strip().upper()
        
        if not student_number or not subject_code:
            raise HTTPException(status_code=400, detail="Missing student number or subject code.")

        credit_record = {
            "student_id": student_number,
            "subject_code": subject_code,
            "section": "TRANSFEREE",
            "academic_year": payload.get("schoolYear", "Previous"),
            "semester": payload.get("semester", "Transferred"),
            "rawSnapshots": {
                "prelim": None
            },
            "computedGrades": {
                "prelim": None,
                "raw_midterm": None,
                "midterm": None,
                "raw_prefinal": None,
                "prefinal": None,
                "raw_final": None,
                "final": None,
                "equivalent": "Credited"
            },
            "status": "credited",
            "updated_at": datetime.now(timezone.utc)
        }

        await db.grades.update_one(
            {"student_id": student_number, "subject_code": subject_code, "section": "TRANSFEREE"},
            {"$set": credit_record},
            upsert=True
        )
        return {"message": f"Subject {subject_code} credited for {student_number}."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/advising/save")
async def save_advising(payload: dict = Body(...)):
    try:
        print("\n--- INCOMING SAVE REQUEST ---")
        print("Target Applicant ID:", payload.get("applicantID"))
        print("Target Advising ID:", payload.get("advisingId"))

        if not payload.get("advisedSubjects"):
            raise HTTPException(status_code=400, detail="Cannot advise student: advisedSubjects array is missing or empty.")

        settings_doc = await db.systemsettings.find_one({"systemName": "BTECH - IITI Pre-Admission System"})
        payload = await sanitize_advising_payload(payload, settings_doc)

        current_time = datetime.now(timezone.utc)
        payload["updatedAt"] = current_time
        
        await db.advisingrecords.update_one(
            {"advisingId": payload.get("advisingId")},
            {
                "$set": payload,
                "$setOnInsert": {"createdAt": current_time}
            },
            upsert=True
        )

        applicant_id = payload.get("applicantID")
        enrollment_status = payload.get("enrollmentStatus") or "advised"
        is_applicant = payload.get("isApplicant", False)
        
        if is_applicant:
            variants = get_applicant_id_variants(applicant_id)
            await db.applicants.update_one(
                {"$or": [{"applicantId": v} for v in variants]},
                {"$set": {
                    "enrollmentStatus": enrollment_status, 
                    "admissionStatus": "Advising Completed"
                }}
            )
        else:
            await db.students.update_one(
                {"$or": [{"studentNumber": applicant_id}, {"student_id": applicant_id}]},
                {"$set": {
                    "enrollmentStatus": enrollment_status,
                    "enrollment_status": enrollment_status
                }}
            )

        return {"message": "Successfully advised and status updated!"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"\n[FATAL DB ERROR]: {e}")
        raise HTTPException(status_code=500, detail="Failed to process advising record.")

@router.post("/advising/batch-save")
async def batch_save_advising(payload: dict = Body(...)):
    try:
        students = payload.get("students", [])
        if not isinstance(students, list) or len(students) == 0:
            raise HTTPException(status_code=400, detail="No students provided for batch processing.")

        settings_doc = await db.systemsettings.find_one({"systemName": "BTECH - IITI Pre-Admission System"})
        
        advising_ops = []
        student_ops = []
        applicant_ops = []

        for raw_s in students:
            s = await sanitize_advising_payload(raw_s, settings_doc)
            advising_ops.append(UpdateOne({"advisingId": s.get("advisingId")}, {"$set": s}, upsert=True))
            
            app_id = s.get("applicantID")
            enroll_st = s.get("enrollmentStatus") or "advised"

            if s.get("isApplicant"):
                variants = get_applicant_id_variants(app_id)
                applicant_ops.append(UpdateOne(
                    {"$or": [{"applicantId": v} for v in variants]}, 
                    {"$set": {"enrollmentStatus": enroll_st, "admissionStatus": "Advising Completed"}}
                ))
            else:
                student_ops.append(UpdateOne(
                    {"$or": [{"studentNumber": app_id}, {"student_id": app_id}]}, 
                    {"$set": {"enrollmentStatus": enroll_st, "enrollment_status": enroll_st}}
                ))

        tasks = [db.advisingrecords.bulk_write(advising_ops)]
        if student_ops: 
            tasks.append(db.students.bulk_write(student_ops))
        if applicant_ops: 
            tasks.append(db.applicants.bulk_write(applicant_ops))

        await asyncio.gather(*tasks)

        return {"message": f"Successfully batch-advised {len(students)} students!"}
    except HTTPException:
        raise
    except Exception as e:
        print("Batch save failed:", e)
        raise HTTPException(status_code=500, detail="Failed to process batch advising.")
    
@router.get("/advising/draft-cart/{student_id}")
async def get_draft_cart(student_id: str):
    try:
        system_settings = await db.systemsettings.find_one({"systemName": "BTECH - IITI Pre-Admission System"})
        raw_semester = (system_settings.get("semester") or "1st Semester") if system_settings else "1st Semester"
        active_sem_short = str(raw_semester).split(" ")[0]
        db_academic_year = (system_settings.get("schoolYear") or "2026-2027") if system_settings else "2026-2027"

        student = await db.students.find_one(
            {"$or": [{"studentNumber": student_id}, {"student_id": student_id}, {"studentId": student_id}]}
        )
        if not student:
            variants = get_applicant_id_variants(student_id)
            student = await db.applicants.find_one({"$or": [{"applicantId": v} for v in variants]})
            if not student:
                raise HTTPException(status_code=404, detail="Student not found.")
            
            program_full = str(student.get("activeProgram") or student.get("firstChoice") or "BSIT").strip()
            s_program = program_full.split("-")[0].strip() if "-" in program_full else (program_full or "BSIT")
            s_year = "1"
            s_section = str(student.get("section") or "A").strip()
        else:
            s_year = str(parse_year_int(student.get("year") or student.get("yearLevel") or student.get("year_level") or "2"))
            prog = str(student.get("program") or student.get("course") or "BSIT").strip()
            s_program = prog.split("-")[0].strip() if "-" in prog else (prog or "BSIT")
            s_section = str(student.get("section") or "A").strip()

        id_variants = set(get_applicant_id_variants(student_id) + [student_id])
        student_records = await db.grades.find(
            {"$or": [{"studentNumber": {"$in": list(id_variants)}}, {"student_id": {"$in": list(id_variants)}}]}
        ).to_list(None)
        
        passed_subjects = set()
        failed_subjects = set()

        for record in student_records:
            # 1. Old Schema (academicRecords array)
            for term in record.get("academicRecords", []):
                for g in term.get("grades", []):
                    status = str(g.get("status", "")).lower()
                    if status in ["passed", "credited", "completed"]:
                        passed_subjects.add(g.get("subjectCode"))
                    elif status in ["failed", "inc"]:
                        failed_subjects.add(g.get("subjectCode"))
            
            # 2. New Schema, Real Schema & Transferee Flat Records
            if record.get("section_id") or record.get("section"):
                parts = str(record.get("section_id") or "").split("-")
                subj_code = str(record.get("subjectCode") or record.get("subject_code") or (parts[-1] if parts else "")).upper()
                
                computed = record.get("computedGrades") or {}
                raw_snaps = record.get("rawSnapshots") or {}

                prelim = safe_float(computed.get("prelim") or raw_snaps.get("prelim") or record.get("prelim"))
                mid = safe_float(computed.get("raw_midterm") or computed.get("midterm") or raw_snaps.get("midterm") or record.get("rawMid"))
                pre = safe_float(computed.get("raw_prefinal") or computed.get("prefinal") or raw_snaps.get("prefinal") or record.get("rawPre"))
                fin = safe_float(computed.get("raw_final") or computed.get("final") or raw_snaps.get("final") or record.get("rawFinal"))

                equiv_str = str(computed.get("equivalent") or "").strip().lower()
                status_str = str(record.get("status") or "").strip().lower()
                is_credited = status_str == "credited" or equiv_str == "credited"
                average = (prelim + pre + mid + fin) / 4 if not is_credited else 100.0
                
                if is_credited or average >= 75:
                    passed_subjects.add(subj_code)
                else:
                    failed_subjects.add(subj_code)

        # Fix: Retake rule - passing a retake clears the prior failure
        failed_subjects = failed_subjects - passed_subjects

        final_subjects = []
        added_codes = set()

        for code in passed_subjects:
            final_subjects.append({"subjectCode": code, "targetSection": None, "isPassed": True})
            added_codes.add(code)

        for code in failed_subjects:
            final_subjects.append({"subjectCode": code, "targetSection": None, "isRetake": True})
            added_codes.add(code)

        all_active_schedules = await db.schedules.find({"semester": active_sem_short, "academicYear": db_academic_year}).to_list(None)
        target_section_str = format_section_name(s_program, s_year, s_section)
        
        section_schedule = next((s for s in all_active_schedules if f"{s.get('program')}-{s.get('year')}{s.get('section')}" == target_section_str), None)

        block_subject_codes = []
        if section_schedule and section_schedule.get("classes"):
            block_subject_codes = list(set(sch.get("subjectCode") for sch in section_schedule["classes"]))
        else:
            year_map = {"1": "1st", "2": "2nd", "3": "3rd", "4": "4th", "5": "5th"}
            formatted_year = year_map.get(s_year, s_year)
            sem_num = 1 if active_sem_short == "1st" else 2
            
            curr = await db.curriculums.find_one({"year": formatted_year})
            if curr and curr.get("semesters"):
                target_sem = next((s for s in curr["semesters"] if s.get("semester") == sem_num), None)
                if target_sem and target_sem.get("subjects"):
                    block_subject_codes = [s.get("subject_code") for s in target_sem["subjects"]]

        for code in block_subject_codes:
            if code not in passed_subjects and code not in added_codes:
                final_subjects.append({
                    "subjectCode": code,
                    "targetSection": target_section_str,
                    "isRegularLoad": True
                })
                added_codes.add(code)

        return {"subjects": final_subjects}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error generating draft cart.")

@router.get("/settings")
async def get_settings():
    try:
        settings = await db.systemsettings.find_one({"systemName": "BTECH - IITI Pre-Admission System"})
        if not settings:
            return {"activeSemesterShort": "1st", "activeTermString": "1st Semester 2026 - 2027"}

        raw_semester = settings.get("semester", "1st Semester")
        active_semester_short = raw_semester.split(" ")[0]
        
        raw_year = settings.get("schoolYear", "2026-2027")
        spaced_year = raw_year.replace("-", " - ")
        active_term_string = f"{raw_semester} {spaced_year}"

        return {
            **serialize_mongo_doc(settings),
            "activeSemesterShort": active_semester_short,
            "activeTermString": active_term_string
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to fetch system settings.")

@router.post("/settings/update")
async def update_settings(payload: dict = Body(...)):
    try:
        active_sem_short = payload.get("activeSemesterShort")
        active_term_string = payload.get("activeTermString")
        
        updated_settings = await db.systemsettings.find_one_and_update(
            {"setting_id": "GLOBAL_CONFIG"},
            {"$set": {"activeSemesterShort": active_sem_short, "activeTermString": active_term_string}},
            upsert=True,
            return_document=ReturnDocument.AFTER
        )
        return {"message": "Settings saved to database!", "data": serialize_mongo_doc(updated_settings)}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to update settings.")

@router.get("/rooms")
async def get_rooms():
    try:
        rooms = await db.rooms.find({}).to_list(None)
        return [serialize_mongo_doc(r) for r in rooms]
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error fetching rooms.")

# THE MATCHMAKER ALGORITHM
@router.post("/availability/auto-slot")
async def auto_slot(payload: dict = Body(...)):
    try:
        section_name = payload.get("sectionName")
        semester = payload.get("semester")
        subject_code = payload.get("subjectCode")
        lec_hours = float(payload.get("lecHours") or 0)
        lab_hours = float(payload.get("labHours") or 0)
        duration_hours = float(payload.get("durationHours") or 0)
        draft_events = payload.get("draftEvents", [])

        if not section_name or not semester or (not lec_hours and not lab_hours and not duration_hours):
            raise HTTPException(status_code=400, detail="Missing required parameters for auto-slotting.")

        sem_parts = semester.split(" Semester ")
        db_semester = sem_parts[0] if sem_parts else ""
        db_academic_year = sem_parts[1].replace(" ", "") if len(sem_parts) > 1 else ""

        all_schedules = await db.schedules.find({"semester": db_semester, "academicYear": db_academic_year}).to_list(None)
        
        target_section = next((s for s in all_schedules if f"{s.get('program')}-{s.get('year')}{s.get('section')}" == section_name), None)
        if target_section:
            target_section["classes"] = list(draft_events)
        else:
            target_section = {"isGhost": True, "ghostSectionName": section_name, "classes": list(draft_events)}
            all_schedules.append(target_section)

        rooms = await db.rooms.find({}).to_list(None)
        if not rooms:
            raise HTTPException(status_code=400, detail="No rooms found.")

        instructor_candidates = [{"name": "TBA", "id": None}]
        print(f"\n======================================================")
        print(f"🔍 [AUTO-SLOT INIT] Attempting to slot: {subject_code}")

        if subject_code:
            prof_docs, inst_docs = await asyncio.gather(
                db.professors.find({}).to_list(None),
                db.instructors.find({}).to_list(None)
            )
            all_instructors = prof_docs + inst_docs
            eligible_instructors = []
            
            for inst in all_instructors:
                raw_specs_data = str(inst.get("specializations", "")).upper()
                if re.search(rf"\b{subject_code.strip().upper()}\b", raw_specs_data):
                    eligible_instructors.append(inst)

            if eligible_instructors:
                instructor_candidates = [{"name": inst["name"], "id": str(inst["_id"])} for inst in eligible_instructors]
                names = ", ".join(c["name"] for c in instructor_candidates)
                print(f"   -> Found {len(eligible_instructors)} eligible instructor(s). Candidates: {names}")
            else:
                print(f"   -> ⚠️ WARNING: No instructors found for '{subject_code}'. Defaulting to TBA.")

        if len(instructor_candidates) > 1:
            section_tally = {c["name"]: 0 for c in instructor_candidates}
            if target_section and target_section.get("classes"):
                for block in target_section["classes"]:
                    prof = block.get("profName")
                    if prof in section_tally:
                        section_tally[prof] += 1
            
            def sort_candidates(c):
                if c["name"] == "TBA": return math.inf
                return section_tally[c["name"]]
                
            instructor_candidates.sort(key=sort_candidates)

        start_day_hour = 7.0
        end_day_hour = 19.0
        MAX_DAILY_HOURS = 9.0
        MAX_F2F_HOURS = 6.0
        PE_COOLDOWN_HOURS = 1.0

        is_pe = subject_code and ("PFT" in subject_code.upper() or "PE" in subject_code.upper())
        is_nstp = subject_code and subject_code.upper().startswith("NST")

        effective_lec = lec_hours
        effective_lab = lab_hours
        effective_dur = duration_hours

        if is_nstp:
            effective_lec = 1.5
            effective_lab = 1.5
            effective_dur = 0

        # Defensive parser: accepts minutes (int/float) OR string timestamps like '07:00 AM' / '13:30'
        def time_to_decimal(minutes):
            if minutes is None:
                return 0.0
            if isinstance(minutes, (int, float)):
                return float(minutes) / 60.0
            
            s = str(minutes).strip().upper()
            try:
                return float(s) / 60.0
            except ValueError:
                pass
            
            time_match = re.match(r"^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$", s)
            if time_match:
                hours = int(time_match.group(1))
                mins = int(time_match.group(2))
                meridiem = time_match.group(3)
                if meridiem:
                    if meridiem == "PM" and hours < 12:
                        hours += 12
                    elif meridiem == "AM" and hours == 12:
                        hours = 0
                return hours + (mins / 60.0)
            
            return 0.0

        def check_overlap(startA, endA, startB, endB):
            return startA < endB and startB < endA

        def get_gravity_sorted_days(day_to_avoid=None, allow_consec=False):
            day_loads = {"Monday": 0, "Tuesday": 0, "Wednesday": 0, "Thursday": 0, "Friday": 0, "Saturday": 0}
            if target_section and target_section.get("classes"):
                for block in target_section["classes"]:
                    if block.get("day") in day_loads:
                        day_loads[block["day"]] += (time_to_decimal(block["endTime"]) - time_to_decimal(block["startTime"]))
            
            pairings = {"Monday": "Thursday", "Tuesday": "Friday", "Wednesday": "Saturday", "Thursday": "Monday", "Friday": "Tuesday", "Saturday": "Wednesday"}
            next_day = {"Monday": "Tuesday", "Tuesday": "Wednesday", "Wednesday": "Thursday", "Thursday": "Friday", "Friday": "Saturday", "Saturday": "Monday"}

            def day_cmp(a, b):
                if day_to_avoid:
                    if allow_consec:
                        if a == next_day.get(day_to_avoid): return -1
                        if b == next_day.get(day_to_avoid): return 1
                    else:
                        if a == pairings.get(day_to_avoid): return -1
                        if b == pairings.get(day_to_avoid): return 1
                if day_loads[a] == 0 and day_loads[b] > 0: return 1
                if day_loads[b] == 0 and day_loads[a] > 0: return -1
                return day_loads[b] - day_loads[a]

            days = list(day_loads.keys())
            days.sort(key=cmp_to_key(day_cmp))
            return days, day_loads

        def find_slot(hours_required, is_lab_or_second_block, candidate_obj, day_to_avoid=None, allow_consec=False, transit_buffer=2.0):
            days, day_loads = get_gravity_sorted_days(day_to_avoid, allow_consec)
            current_instructor = candidate_obj["name"]
            is_tba = current_instructor == "TBA"
            
            needs_physical_lab = is_lab_or_second_block and not is_nstp and not is_pe
            needs_physical_pe = is_pe
            is_proposed_virtual = not needs_physical_lab and not needs_physical_pe
            
            fail_log = {"failedDailyLimit": 0, "failedSectionOverlap": 0, "failedTransitBuffer": 0, "failedInstructorOverlap": 0, "failedRoomTypeMatch": 0, "failedRoomOccupied": 0, "failedInstructorFatigue": 0, "failedRoomLunchBan": 0}

            for day in days:
                if day == day_to_avoid: continue
                if day_loads[day] + hours_required > MAX_DAILY_HOURS: 
                    fail_log["failedDailyLimit"] += 1
                    continue

                instructor_f2f = 0
                instructor_total = 0

                if not is_tba:
                    for section in all_schedules:
                        for block in section.get("classes", []):
                            if block.get("day") == day and block.get("profName") == current_instructor:
                                block_dur = time_to_decimal(block["endTime"]) - time_to_decimal(block["startTime"])
                                instructor_total += block_dur
                                rn = str(block.get("roomName", "")).upper()
                                is_online = "ONLINE" in rn or "(VC)" in rn or rn.startswith("VR ")
                                if not is_online:
                                    instructor_f2f += block_dur

                if not is_tba and (instructor_total + hours_required > MAX_DAILY_HOURS):
                    fail_log["failedDailyLimit"] += 1
                    continue

                time = start_day_hour
                while time <= end_day_hour - hours_required:
                    proposed_start = time
                    proposed_end = time + hours_required
                    
                    is_section_free = True
                    is_instructor_free = True
                    failed_buffer = False

                    for section in all_schedules:
                        curr_sec_name = section.get("ghostSectionName") if section.get("isGhost") else f"{section.get('program')}-{section.get('year')}{section.get('section')}"
                        for block in section.get("classes", []):
                            if block.get("day") == day:
                                block_start = time_to_decimal(block["startTime"])
                                block_end = time_to_decimal(block["endTime"])
                                
                                is_block_pe = block.get("subjectCode") and ("PFT" in block["subjectCode"].upper() or "PE" in block["subjectCode"].upper())
                                if is_block_pe and curr_sec_name == section_name:
                                    block_end += PE_COOLDOWN_HOURS
                                
                                rn = str(block.get("roomName", "")).upper()
                                is_block_virtual = "ONLINE" in rn or "(VC)" in rn or rn.startswith("VR ")

                                if check_overlap(proposed_start, proposed_end, block_start, block_end):
                                    if curr_sec_name == section_name: is_section_free = False
                                    if not is_tba and block.get("profName") == current_instructor: is_instructor_free = False

                                if is_proposed_virtual != is_block_virtual:
                                    if curr_sec_name == section_name or (not is_tba and block.get("profName") == current_instructor):
                                        if check_overlap(proposed_start - transit_buffer, proposed_end + transit_buffer, block_start, block_end):
                                            failed_buffer = True
                    
                    if not is_section_free: 
                        fail_log["failedSectionOverlap"] += 1
                        time += 0.5; continue
                    if not is_instructor_free: 
                        fail_log["failedInstructorOverlap"] += 1
                        time += 0.5; continue
                    if failed_buffer: 
                        fail_log["failedTransitBuffer"] += 1
                        time += 0.5; continue

                    assigned_room = None
                    assigned_room_id = None
                    valid_room_found = False

                    if is_proposed_virtual:
                        valid_room_found = True
                        taken_vr_numbers = []
                        for section in all_schedules:
                            for block in section.get("classes", []):
                                if block.get("day") == day and block.get("roomName", "").startswith("VR "):
                                    b_start = time_to_decimal(block["startTime"])
                                    b_end = time_to_decimal(block["endTime"])
                                    if check_overlap(proposed_start, proposed_end, b_start, b_end):
                                        match = re.search(r'\d+$', block["roomName"])
                                        if match:
                                            taken_vr_numbers.append(int(match.group(0)))
                        
                        next_vr = 1
                        for num in sorted(taken_vr_numbers):
                            if num == next_vr:
                                next_vr += 1
                        
                        prefix = "VR IAS" if re.match(r'^(SCI|MAT|FIL|ENG|IAS|RIZ)', subject_code.upper()) else "VR IITI"
                        assigned_room = f"{prefix} {next_vr}"
                        assigned_room_id = f"virtual_auto_{next_vr}"
                    else:
                        for room_obj in rooms:
                            r_name = str(room_obj.get("roomName", "")).upper()
                            r_type = str(room_obj.get("type", ""))
                            is_lab_room = r_type == "Laboratory" or "LAB" in r_name
                            is_pe_room = r_type == "Physical Education" or "GYM" in r_name or r_name.startswith("P")

                            if is_lab_room:
                                is_sci_sub = subject_code.upper().startswith("SCI")
                                if not is_sci_sub and "PHYSICS" in r_name:
                                    is_lab_room = False

                            if needs_physical_pe and not is_pe_room: continue
                            if needs_physical_lab and not is_lab_room: continue

                            valid_room_found = True

                            if not is_tba and (instructor_f2f + hours_required > MAX_F2F_HOURS):
                                fail_log["failedInstructorFatigue"] += 1; continue
                            if check_overlap(proposed_start, proposed_end, 12.0, 13.0):
                                fail_log["failedRoomLunchBan"] += 1; continue

                            is_room_free = True
                            for section in all_schedules:
                                for block in section.get("classes", []):
                                    if block.get("day") == day and block.get("roomName") == room_obj.get("roomName"):
                                        if check_overlap(proposed_start, proposed_end, time_to_decimal(block["startTime"]), time_to_decimal(block["endTime"])):
                                            is_room_free = False
                                            break
                                if not is_room_free: break
                            
                            if is_room_free:
                                assigned_room = room_obj.get("roomName")
                                assigned_room_id = str(room_obj.get("_id", "tba"))
                                break
                            else:
                                fail_log["failedRoomOccupied"] += 1
                    
                    if not valid_room_found: fail_log["failedRoomTypeMatch"] += 1

                    if assigned_room:
                        block_title = ""
                        if not is_nstp and not is_pe:
                            block_title = "(Lab)" if is_lab_or_second_block else ("(Lec)" if effective_lec > 0 else "")
                        
                        return {
                            "sectionName": section_name,
                            "subjectCode": subject_code,
                            "day": day,
                            "startTime": round(proposed_start * 60),
                            "endTime": round(proposed_end * 60),
                            "roomId": assigned_room_id,
                            "roomName": assigned_room,
                            "profId": candidate_obj["id"],
                            "profName": candidate_obj["name"],
                            "title": f"{subject_code} {block_title}" if block_title else subject_code
                        }

                    time += 0.5
            return None

        valid_slots = []
        for candidate in instructor_candidates:
            valid_slots = []
            success = True
            first_block_day = None

            def execute_two_pass(req_hrs, is_lab, cand, block_day_avoid, allow_consec):
                slot = find_slot(req_hrs, is_lab, cand, block_day_avoid, allow_consec, 2.0)
                if not slot:
                    slot = find_slot(req_hrs, is_lab, cand, block_day_avoid, allow_consec, 1.0)
                return slot

            if effective_lec > 0:
                first_slot = execute_two_pass(effective_lec, False, candidate, None, False)
                if first_slot:
                    valid_slots.append(first_slot)
                    target_section["classes"].append(first_slot)
                    first_block_day = first_slot["day"]
                else:
                    success = False

            if success and effective_lab > 0:
                second_slot = execute_two_pass(effective_lab, True, candidate, first_block_day, is_nstp)
                if second_slot:
                    valid_slots.append(second_slot)
                else:
                    success = False

            if success and effective_lec == 0 and effective_lab == 0 and effective_dur > 0:
                standard_slot = execute_two_pass(effective_dur, False, candidate, None, False)
                if standard_slot:
                    valid_slots.append(standard_slot)
                else:
                    success = False

            if not success and effective_lec > 0 and len(valid_slots) > 0:
                target_section["classes"].pop()

            if success:
                return valid_slots

        raise HTTPException(status_code=400, detail=f"Matrix Full: Could not find a compliant schedule slot within constraints for {subject_code}.")

    except HTTPException:
        raise
    except Exception as e:
        print("Matchmaker calculation error:", e)
        raise HTTPException(status_code=500, detail="Failed to calculate available slots.")

@router.post("/external-schedules/import")
async def import_external_schedules(activeTerm: str = Form("1st Semester 2026-2027"), file: UploadFile = File(...)):
    try:
        content = await file.read()
        try:
            df = pd.read_excel(io.BytesIO(content))
        except Exception:
            try:
                df = pd.read_csv(io.BytesIO(content))
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid file format.")

        if df.empty:
            raise HTTPException(status_code=400, detail="The uploaded file is empty.")

        df = df.where(pd.notnull(df), None)
        raw_data = df.to_dict(orient="records")
        schedules_to_insert = []

        for row in raw_data:
            validated_row = ExternalSchedule(
                subjectCode=str(row.get("Subject Code") or row.get("subjectCode") or "UNKNOWN"),
                subjectTitle=str(row.get("Subject Title") or row.get("Descriptive Title") or row.get("title") or "Untitled"),
                units=safe_float(row.get("Unit") or row.get("Units") or row.get("units")) or 3.0,
                hours=safe_float(row.get("Hrs") or row.get("Hours") or row.get("hours")) or 3.0,
                externalSection=str(row.get("Section") or row.get("externalSection") or "TBA"),
                day=str(row.get("Day") or row.get("day") or "Monday").strip(),
                startTime=str(row.get("Start Time") or row.get("startTime") or "07:00 AM"),
                endTime=str(row.get("End Time") or row.get("endTime") or "08:30 AM"),
                roomName=str(row.get("Room") or row.get("roomName") or "TBA"),
                profName=str(row.get("Instructor") or row.get("profName") or "TBA"),
                activeTerm=activeTerm
            )
            schedules_to_insert.append(validated_row.model_dump())

        result = await db.externalschedules.insert_many(schedules_to_insert)
        return {"message": f"Successfully imported {len(result.inserted_ids)} external schedules!", "insertedCount": len(result.inserted_ids)}
    except HTTPException:
        raise
    except Exception as e:
        print("[IMPORT ERROR]:", e)
        raise HTTPException(status_code=500, detail="Failed to process the uploaded file.")

@router.get("/external-schedules")
async def get_external_schedules():
    try:
        schedules = await db.externalschedules.find({}).sort("subjectCode", 1).to_list(None)
        return [serialize_mongo_doc(s) for s in schedules]
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to fetch external schedules.")

@router.delete("/external-schedules/{id}")
async def delete_external_schedule(id: str):
    try:
        if not ObjectId.is_valid(id):
            raise HTTPException(status_code=400, detail="Invalid schedule ID format.")
        await db.externalschedules.delete_one({"_id": ObjectId(id)})
        return {"message": "Schedule removed successfully."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to delete schedule.")

@router.put("/external-schedules/{id}")
async def update_external_schedule(id: str, payload: ExternalSchedule):
    try:
        if not ObjectId.is_valid(id):
            raise HTTPException(status_code=400, detail="Invalid schedule ID format.")
        payload_data = payload.model_dump(exclude_none=True)
        updated = await db.externalschedules.find_one_and_update(
            {"_id": ObjectId(id)},
            {"$set": payload_data},
            return_document=ReturnDocument.AFTER
        )
        if not updated:
            raise HTTPException(status_code=404, detail="Schedule not found.")
        return {"message": "Schedule updated successfully.", "data": serialize_mongo_doc(updated)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to update schedule.")

@router.get("/schedule-requests")
async def get_schedule_requests():
    try:
        requests = await db.schedulerequests.find({}).sort("created_at", -1).to_list(None)
        return [
            {**serialize_mongo_doc(request), "_id": str(request["_id"])}
            for request in requests
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to fetch schedule requests.")

@router.patch("/schedule-requests/{id}")
async def update_schedule_request(id: str, payload: dict = Body(...)):
    try:
        if not ObjectId.is_valid(id):
            raise HTTPException(status_code=400, detail="Invalid schedule request ID format.")

        status = payload.get("status")
        if status not in ['approved', 'rejected', 'pending']:
            raise HTTPException(status_code=400, detail="Invalid status value.")

        req_doc = await db.schedulerequests.find_one({"_id": ObjectId(id)})
        if not req_doc:
            raise HTTPException(status_code=404, detail="Schedule request not found.")

        updated = await db.schedulerequests.find_one_and_update(
            {"_id": ObjectId(id)},
            {"$set": {"status": status, "updated_at": datetime.now(timezone.utc)}},
            return_document=ReturnDocument.AFTER
        )

        # Apply schedule change when approved
        if status == 'approved':
            proposed = req_doc.get("schedule") or {}
            target_sid = req_doc.get("scheduleId")
            
            # Clean preview flags
            proposed_classes = proposed.get("classes") or []
            clean_classes = []
            for c in proposed_classes:
                if c.get("isGhostOriginal"):
                    continue
                clean_item = {k: v for k, v in c.items() if k not in ["isRequestedChange", "isGhostOriginal"]}
                clean_classes.append(clean_item)

            sched_query = {}
            if target_sid and ObjectId.is_valid(str(target_sid)):
                sched_query = {"_id": ObjectId(str(target_sid))}
            elif proposed.get("program") and proposed.get("year") and proposed.get("section"):
                sched_query = {
                    "program": proposed.get("program"),
                    "year": str(proposed.get("year")),
                    "section": str(proposed.get("section"))
                }
            
            if sched_query:
                update_fields = {"classes": clean_classes, "updated_at": datetime.now(timezone.utc)}
                if proposed.get("academicYear"):
                    update_fields["academicYear"] = proposed.get("academicYear")
                if proposed.get("semester"):
                    update_fields["semester"] = proposed.get("semester")
                await db.schedules.update_one(sched_query, {"$set": update_fields})

        return {"message": f"Request successfully marked as {status}", "request": serialize_mongo_doc(updated)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error.")

@router.get("/bridge/student/{student_id}")
async def get_student_grades_bridge(student_id: str):
    try:
        # 1. Locate the Student or Applicant
        student = await db.students.find_one({"$or": [{"studentNumber": student_id}, {"student_id": student_id}]})
        if not student:
            variants = get_applicant_id_variants(student_id)
            student = await db.applicants.find_one({"$or": [{"applicantId": v} for v in variants]})
            if not student:
                return {"success": False, "message": "Student not found"}
            
            # Map applicant fields to the format viewGrade.jsx expects
            student["name"] = f"{student.get('firstName', '')} {student.get('lastName', '')}".strip()
            student["number"] = student.get("applicantId")
            student["section"] = student.get("section", "A")
        else:
            student["name"] = f"{student.get('firstName', '')} {student.get('lastName', '')}".strip()
            student["number"] = student.get("studentNumber") or student.get("student_id")

        # 2. Fetch Grades
        id_variants = set(get_applicant_id_variants(student_id) + [student_id])
        student_records = await db.grades.find(
            {"$or": [{"studentNumber": {"$in": list(id_variants)}}, {"student_id": {"$in": list(id_variants)}}]}
        ).to_list(None)
        
        flat_grades = []
        for record in student_records:
            # Handle Old Schema (academicRecords array)
            if isinstance(record.get("academicRecords"), list):
                for term in record["academicRecords"]:
                    for g in term.get("grades", []):
                        flat_grades.append({
                            "code": g.get("subjectCode") or g.get("code"),
                            "title": g.get("subjectTitle") or g.get("title"),
                            "prelim": g.get("prelim"),
                            "midterm": g.get("midterm"),
                            "preFinal": g.get("preFinal"),
                            "final": g.get("final"),
                            "finalGrade": g.get("finalGrade"),
                            "semester": term.get("semester", g.get("semester")),
                            "schoolYear": term.get("schoolYear", g.get("schoolYear"))
                        })
            
            # Handle Real Schema & Synthetic Transferee Schema
            if record.get("section_id") or record.get("section"):
                parts = str(record.get("section_id") or "").split("-")
                subject_code = str(record.get("subjectCode") or record.get("subject_code") or (parts[-1] if parts else "")).upper()
                
                computed = record.get("computedGrades") or {}
                raw_snaps = record.get("rawSnapshots") or {}
                
                prelim = safe_float(computed.get("prelim") or raw_snaps.get("prelim") or record.get("prelim"))
                mid = safe_float(computed.get("raw_midterm") or computed.get("midterm") or raw_snaps.get("midterm") or record.get("rawMid"))
                pre = safe_float(computed.get("raw_prefinal") or computed.get("prefinal") or raw_snaps.get("prefinal") or record.get("rawPre"))
                fin = safe_float(computed.get("raw_final") or computed.get("final") or raw_snaps.get("final") or record.get("rawFinal"))
                
                equiv_str = str(computed.get("equivalent") or "").strip().lower()
                status_str = str(record.get("status") or "").strip().lower()
                
                is_credited = status_str == "credited" or equiv_str == "credited"
                average = (prelim + pre + mid + fin) / 4 if not is_credited else 100.0
                
                flat_grades.append({
                    "code": subject_code,
                    "title": record.get("subjectTitle") or subject_code,
                    "prelim": "Credited" if is_credited else prelim,
                    "midterm": "Credited" if is_credited else mid,
                    "preFinal": "Credited" if is_credited else pre,
                    "final": "Credited" if is_credited else fin,
                    "finalGrade": "Credited" if is_credited else round(average, 2),
                    "semester": record.get("semester") or "1st",
                    "schoolYear": record.get("academic_year") or record.get("schoolYear") or "2025-2026"
                })

        # 3. Return the exact JSON structure viewGrade.jsx expects
        return {
            "success": True, 
            "data": {
                "student": serialize_mongo_doc(student),
                "grades": flat_grades
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=True)
