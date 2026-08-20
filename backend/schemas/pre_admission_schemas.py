from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from schemas.global_schemas import CourseModel, InstituteModel

# ==========================================
# APPLICANT MODELS
# ==========================================
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
    interviewRatings: Dict[str, Any] = Field(default_factory=dict)
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
    documents: List[DocumentModel] = Field(default_factory=list)
    otpCodeHash: Optional[str] = None
    otpExpiresAt: Optional[datetime] = None
    isEmailSent: bool = False

# ==========================================
# PRE-ADMISSION SCHEDULING & ASSESSMENT
# ==========================================
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

class AdmissionSettingsModel(BaseModel):
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
    security: Dict[str, bool] = Field(default_factory=lambda: {"twoFactorAuth": False})
    termStart: Optional[datetime] = None
    termEnd: Optional[datetime] = None
    courses: List[CourseModel] = Field(default_factory=list)
    institutes: List[InstituteModel] = Field(default_factory=list)
    notifications: Dict[str, bool] = Field(default_factory=lambda: {
        "emailNewApp": True,
        "emailBCET": False,
        "emailDeadline": True,
        "sysMaintenance": True,
        "docUploads": True
    })
    rolePermissions: Dict[str, RolePermissionFlags] = Field(default_factory=lambda: {
        "SuperAdmin": RolePermissionFlags(),
        "Admin": RolePermissionFlags(admissionStatus=False, systemProfile=False, systemMaintenance=False, manageAdmins=False)
    })
    updatedBy: str = "System"
    lastUpdated: datetime = Field(default_factory=datetime.utcnow)