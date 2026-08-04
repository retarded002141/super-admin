ALLOWED_TRANSITIONS = {
    "Pending": ["Submitted"],
    "Submitted": ["Pending Interview"],
    "Pending Interview": ["Passed Interview", "Failed Interview", "Reschedule Interview"],
    "Reschedule Interview": ["Passed Interview", "Failed Interview"],
    "Passed Interview": ["For Exam"],
    "For Exam": ["Pending BCET"],
    "Pending BCET": ["Passed BCET", "Failed BCET"],
    "Passed BCET": ["For Enrollment"],
    "For Enrollment": ["Admitted"],
    "Admitted": ["Enrolled"],
}

def validate_status_transition(current_status, next_status):
    if not current_status or not next_status:
        return False
    return next_status in ALLOWED_TRANSITIONS.get(current_status, [])