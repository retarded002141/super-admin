from pydantic import BaseModel, EmailStr, Field
from typing import Dict, List, Optional
from datetime import datetime

# ==========================================
# 1. ADMIN & AUDIT LOG MODELS
# ==========================================
class AdminModel(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: str = "Admin"
    image: Optional[str] = None
    institute: str = "Admission"
    resetPasswordToken: Optional[str] = None
    resetPasswordExpire: Optional[datetime] = None

class AuditLogModel(BaseModel):
    user: str
    role: str = "Admin"
    institute: str = "Admission"
    action: str
    status: str = "Success"
    details: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)

# ==========================================
# 2. SYSTEM USERS & STUDENTS (GLOBAL)
# ==========================================
class UserModel(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: str = "Applicant"
    status: str = "Admitted"
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    lastLogin: Optional[datetime] = None

class StudentProfileModel(BaseModel):
    applicant_id: str
    first_name: str
    middle_name: Optional[str] = None
    last_name: str
    course: Optional[str] = None
    section: Optional[str] = None
    school_year: Optional[str] = None
    birth_date: Optional[str] = None
    contact_number: Optional[str] = None
    permanent_address: Optional[str] = None
    present_address: Optional[str] = None
    father_name: Optional[str] = None
    father_contact: Optional[str] = None
    mother_name: Optional[str] = None
    mother_contact: Optional[str] = None
    elementary_school: Optional[str] = None
    elementary_address: Optional[str] = None
    junior_high_school: Optional[str] = None
    junior_high_address: Optional[str] = None
    senior_high_school: Optional[str] = None
    senior_high_address: Optional[str] = None
    college_school: Optional[str] = None
    college_address: Optional[str] = None

# ==========================================
# 3. SHARED SYSTEM CONFIGURATION
# ==========================================
class InstituteModel(BaseModel):
    abbreviation: str
    name: str
    address: str = ""
    openingDays: str = ""
    openingTime: str = ""
    closingTime: str = ""
    dailyLimit: Optional[int] = 0

class CourseModel(BaseModel):
    institute: str
    abbreviation: str = ""
    name: str
    limit: int = 0

class NotificationModel(BaseModel):
    title: str
    message: str
    type: str = "info"
    isUnread: bool = True
    createdAt: datetime = Field(default_factory=datetime.utcnow)

# ==========================================
# 4. SUPER ADMIN & ANNOUNCEMENTS
# ==========================================
class AnnouncementSchema(BaseModel):
    category: str = "iiti"
    title: str
    description: str
    image: Optional[str] = ""
    date: str
    dateValue: Optional[str] = ""
    published: Optional[bool] = True

class AnnouncementUpdateSchema(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    date: Optional[str] = None
    dateValue: Optional[str] = None