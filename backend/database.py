import os
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")

client = AsyncIOMotorClient(MONGO_URI)

# Database references
db_admin = client["superadmin"]  # Dedicated database for Admin panel data
db_studentportal = client["studentportal"]
# db_preadmission = client["pre-admission"]
db_preenrollment = client["pre-enrollment"]
db_preadvising = client["pre-advising"]
db_facultyeval = client["faculty_evaluation"]

async def ping_db():
    try:
        await client.admin.command('ping')
        print("Successfully connected to MongoDB Cluster0!")
    except Exception as e:
        print(f"Failed to connect to MongoDB Atlas: {e}")


# SYNC Pre-Admission
sync_client = MongoClient(MONGO_URI)

db = sync_client["iiti_db"] 
user_collection = db["users"]
applicant_collection = db["applicants"]
rubric_collection = db["interviewrubrics"]
settings_collection = db["systemsettings"]
audit_collection = db["auditlogs"]
notification_collection = db["notifications"]
student_collection = db["students"]