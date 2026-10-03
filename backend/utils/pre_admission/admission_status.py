from datetime import datetime, timezone, timedelta

def evaluate_admission_status(settings):
    """
    Evaluates the admission status dynamically based on applicationStart and applicationDeadline.
    Tracks 'autoState' to ensure transitions only happen once, allowing manual overrides in between.
    Returns (settings, needs_save).
    """
    needs_save = False
    if not settings:
        return settings, needs_save
    
    start_str = settings.get("applicationStart")
    end_str = settings.get("applicationDeadline")
    auto_state = settings.get("autoState", "none")
    
    if start_str and end_str:
        try:
            PH_TZ = timezone(timedelta(hours=8))
            
            start_dt = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
            if start_dt.tzinfo is None:
                start_dt = start_dt.replace(tzinfo=PH_TZ)
                
            end_dt = datetime.fromisoformat(end_str.replace("Z", "+00:00"))
            if end_dt.tzinfo is None:
                end_dt = end_dt.replace(tzinfo=PH_TZ)
            
            now = datetime.now(PH_TZ)
            
            if now < start_dt and auto_state != "pending":
                settings["admissionStatus"] = "Scheduled"
                settings["admissionOpen"] = False
                settings["autoState"] = "pending"
                needs_save = True
            elif start_dt <= now <= end_dt and auto_state != "opened":
                settings["admissionStatus"] = "Open"
                settings["admissionOpen"] = True
                settings["autoState"] = "opened"
                needs_save = True
            elif now > end_dt and auto_state != "closed":
                settings["admissionStatus"] = "Closed"
                settings["admissionOpen"] = False
                settings["autoState"] = "closed"
                needs_save = True
        except Exception as e:
            print(f"Date evaluation error: {e}")
            pass
            
    return settings, needs_save
