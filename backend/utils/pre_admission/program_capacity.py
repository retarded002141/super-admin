def _to_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def get_program_seated_count(applicant_collection, school_year, program_name):
    if not school_year or not program_name:
        return 0

    return applicant_collection.count_documents({
        "schoolYear": school_year,
        "$or": [
            {"firstChoice": program_name, "isRejectedFirstChoice": {"$ne": True}},
            {"secondChoice": program_name, "isRejectedFirstChoice": True},
            {"profile.appDetails.firstChoice": program_name, "isRejectedFirstChoice": {"$ne": True}},
            {"profile.appDetails.secondChoice": program_name, "isRejectedFirstChoice": True}
        ],
        "slotStatus": "Admitted"
    })


def get_program_applicants_count(applicant_collection, school_year, program_name):
    if not school_year or not program_name:
        return 0

    return applicant_collection.count_documents({
        "schoolYear": school_year,
        "$or": [
            {"firstChoice": program_name, "isRejectedFirstChoice": {"$ne": True}},
            {"secondChoice": program_name, "isRejectedFirstChoice": True},
            {"profile.appDetails.firstChoice": program_name, "isRejectedFirstChoice": {"$ne": True}},
            {"profile.appDetails.secondChoice": program_name, "isRejectedFirstChoice": True}
        ]
    })


def with_capacity_status(course, applicant_collection, school_year):
    enriched = dict(course)
    limit = _to_int(enriched.get("limit"), 0)
    applicationLimit = _to_int(enriched.get("applicationLimit"), 0)
    seated = get_program_seated_count(applicant_collection, school_year, enriched.get("name"))
    applicants = get_program_applicants_count(applicant_collection, school_year, enriched.get("name"))

    enriched["limit"] = limit
    enriched["applicationLimit"] = applicationLimit
    enriched["seated"] = seated
    enriched["applicants"] = applicants
    enriched["isFull"] = limit > 0 and seated >= limit
    return enriched


def find_course_by_name(courses, program_name):
    if not program_name:
        return None

    program_name_lower = program_name.strip().lower()
    return next(
        (
            course for course in courses
            if str(course.get("name", "")).strip().lower() == program_name_lower
        ),
        None
    )
