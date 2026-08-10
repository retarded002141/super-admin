from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel
from typing import Optional

# 1. ADMIN & AUDIT LOG MODELS

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

# APPLICANT MODELS

class DocumentModel(BaseModel):
    filename: Optional[str] = None
    originalName: Optional[str] = None
    path: Optional[str] = None
    uploadedAt: datetime = Field(default_factory=datetime.utcnow)

class ApplicantModel(BaseModel):
    email: EmailStr
    password: str
    applicantId: Optional[str] = None
    schoolYear: Optional[str] = None
    isSubmitted: bool = False
    admissionStatus: str = "Pending"
    interviewStatus: str = "Pending"
    examStatus: str = "Pending"
    interviewDate: Optional[str] = None
    interviewSlot: Optional[str] = None
    interviewScore: Optional[float] = None
    isInterviewed: bool = False
    interviewRatings: Dict[str, Any] = {}
    interviewer: str = ""
    examScore: Optional[float] = None
    gwa: Optional[float] = None
    isExamined: bool = False
    examDate: Optional[str] = None
    applicantType: Optional[str] = None
    firstChoice: Optional[str] = None
    secondChoice: Optional[str] = None
    photo: Optional[str] = None
    firstName: Optional[str] = None
    middleName: Optional[str] = None
    lastName: Optional[str] = None
    suffix: Optional[str] = None
    gender: Optional[str] = None
    birthDate: Optional[str] = None
    placeOfBirth: Optional[str] = None
    civilStatus: Optional[str] = None
    spouseName: Optional[str] = None
    contactNumber: Optional[str] = None
    permanentHouse: Optional[str] = None
    permanentStreet: Optional[str] = None
    permanentProvince: Optional[str] = None
    permanentCity: Optional[str] = None
    permanentBarangay: Optional[str] = None
    permanentZip: Optional[str] = None
    isSameAddress: bool = False
    presentHouse: Optional[str] = None
    presentStreet: Optional[str] = None
    presentProvince: Optional[str] = None
    presentCity: Optional[str] = None
    presentBarangay: Optional[str] = None
    presentZip: Optional[str] = None
    fatherName: Optional[str] = None
    fatherContact: Optional[str] = None
    motherName: Optional[str] = None
    motherContact: Optional[str] = None
    disability: bool = False
    indigenous: bool = False
    soloParent: bool = False
    fourPs: bool = False
    elementarySchool: Optional[str] = None
    elementaryAddress: Optional[str] = None
    elementaryYear: Optional[str] = None
    juniorHighSchool: Optional[str] = None
    juniorHighAddress: Optional[str] = None
    juniorHighYear: Optional[str] = None
    seniorHighSchool: Optional[str] = None
    seniorHighAddress: Optional[str] = None
    seniorHighYear: Optional[str] = None
    seniorHighGwa: Optional[str] = None
    collegeSchool: Optional[str] = None
    collegeAddress: Optional[str] = None
    collegeYear: Optional[str] = None
    documents: List[DocumentModel] = []
    otpCodeHash: Optional[str] = None
    otpExpiresAt: Optional[datetime] = None
    isEmailSent: bool = False

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

# INSTITUTES & COURSES MODELS

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

# SYSTEM, NOTIFICATIONS & SCHEDULING

class NotificationModel(BaseModel):
    title: str
    message: str
    type: str = "info"
    isUnread: bool = True
    createdAt: datetime = Field(default_factory=datetime.utcnow)

class SlotModel(BaseModel):
    date: str
    time: str
    capacity: int = 10
    booked: int = 0
    isActive: bool = True

class CriteriaModel(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    desc: Optional[str] = None
    weight: Optional[float] = None

class SectionModel(BaseModel):
    id: Optional[str] = None
    title: Optional[str] = None
    criteria: List[CriteriaModel] = []

class InterviewRubricModel(BaseModel):
    sections: List[SectionModel] = []

class RolePermissionFlags(BaseModel):
    applicantManagement: bool = True
    admissionStatus: bool = True
    systemProfile: bool = True
    systemMaintenance: bool = True
    activityLogs: bool = True
    manageAdmins: bool = True

class SystemSettingsModel(BaseModel):
    institute: str = "Admission"
    systemName: str = "Pre-Admission"
    schoolName: str = "Baliwag Polytechnic College (BTECH)"
    contactInfo: str = "+63 912 345 6789"
    email: str = ""
    admissionStatus: str = "Open"
    schoolYear: str = "2025-2026"
    semester: str = "1st Semester"
    applicationStartDate: Optional[datetime] = None
    applicationDeadline: Optional[datetime] = None
    security: Dict[str, bool] = {"twoFactorAuth": False}
    termStart: Optional[datetime] = None
    termEnd: Optional[datetime] = None
    courses: List[CourseModel] = []
    institutes: List[InstituteModel] = []
    
    notifications: Dict[str, bool] = {
        "emailNewApp": True,
        "emailBCET": False,
        "emailDeadline": True,
        "sysMaintenance": True,
        "docUploads": True
    }
    rolePermissions: Dict[str, RolePermissionFlags] = {
        "SuperAdmin": RolePermissionFlags(),
        "Admin": RolePermissionFlags(admissionStatus=False, systemProfile=False, systemMaintenance=False, manageAdmins=False)
    }
    updatedBy: str = "System"
    lastUpdated: datetime = Field(default_factory=datetime.utcnow)

# 5. SUPER ADMIN & ANNOUNCEMENTS

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