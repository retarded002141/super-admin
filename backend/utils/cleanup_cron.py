from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime, timedelta
from database import applicant_collection

def cleanup_stale_records():
    sixty_days_ago = datetime.utcnow() - timedelta(days=60)
    result = applicant_collection.delete_many({
        "status": "Pending",
        "updatedAt": {"$lt": sixty_days_ago}
    })
    print(f"Cleaned up {result.deleted_count} stale records.")

def start_cron():
    scheduler = BackgroundScheduler()
    # Runs at midnight every Sunday
    scheduler.add_job(cleanup_stale_records, 'cron', day_of_week='sun', hour=0, minute=0)
    scheduler.start()