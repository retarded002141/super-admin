from pydantic import BaseModel, ConfigDict, EmailStr
from typing import Optional, List, Dict, Any

class BasePayload(BaseModel):
    model_config = ConfigDict(extra='ignore')

# ----------------
# COMMON PAYLOADS
# ----------------
class LoginPayload(BasePayload):
    email: str
    password: str
    role: Optional[str] = None

class SendOtpPayload(BasePayload):
    email: EmailStr
    role: Optional[str] = None

class VerifyOtpPayload(BasePayload):
    email: EmailStr
    otp: str
    role: Optional[str] = None

class ForgotPasswordPayload(BasePayload):
    email: EmailStr
    role: Optional[str] = None

class ResetPasswordPayload(BasePayload):
    email: Optional[EmailStr] = None
    otp: Optional[str] = None
    newPassword: str
    confirmPassword: str
    role: Optional[str] = None

# ----------------
# ADMIN PAYLOADS
# ----------------
class ChangePasswordPayload(BasePayload):
    current_password: str
    new_password: str
    confirm_password: str

class Verify2FaPayload(BasePayload):
    email: EmailStr
    otp: str

class CreateAdminPayload(BasePayload):
    firstName: str
    lastName: str
    email: EmailStr
    password: str
    role: str

class UpdateAdminPayload(BasePayload):
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[str] = None

class CreateLogPayload(BasePayload):
    action: str
    details: Optional[str] = None
    status: Optional[str] = "Success"

class CoursePayload(BasePayload):
    name: str
    abbreviation: str
    institute: str
    limit: Optional[int] = 0

class InstitutePayload(BasePayload):
    name: str
    abbreviation: str
    address: Optional[str] = ""
    dailyLimit: Optional[int] = 0

class EncodeScorePayload(BasePayload):
    score: float
    ratings: Optional[Dict[str, Any]] = None
    interviewDate: Optional[str] = None
    interviewer: Optional[str] = None

class UpdateInterviewStatusPayload(BasePayload):
    status: str
    interviewDate: Optional[str] = None

class BulkUpdateStatusPayload(BasePayload):
    applicantIds: List[str]
    status: str

class EmailDataPayload(BasePayload):
    email: str
    subject: str
    message: str
    applicantId: Optional[str] = None
    type: Optional[str] = None
    htmlMessage: Optional[str] = None

class SendBulkEmailsPayload(BasePayload):
    emails: List[EmailDataPayload]

class ReassignProgramPayload(BasePayload):
    new_program: str

class UpdateStatusPayload(BasePayload):
    status: Optional[str] = None
    examScore: Optional[float] = None
    interviewScore: Optional[float] = None
    gwa: Optional[str] = None
    totalPerc: Optional[float] = None
    slotStatus: Optional[str] = None
    bcetRawScore: Optional[float] = None
    bcetHighestScore: Optional[float] = None

class UpdateEmailTemplatePayload(BasePayload):
    subject: str
    content: str

# For applicant and generic dict payloads where the structure is massive or completely dynamic:
class GenericDictPayload(BasePayload):
    model_config = ConfigDict(extra='allow')
    pass

# ----------------
# APPLICANT PAYLOADS
# ----------------
class RegisterPayload(BasePayload):
    email: EmailStr
    password: str
    otp: Optional[str] = None
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    phoneNumber: Optional[str] = None
    signupType: Optional[str] = None
    schoolYear: Optional[str] = None
    confirmPassword: Optional[str] = None

class SendSignupOtpPayload(BasePayload):
    email: EmailStr

class SetApplicantTypePayload(BasePayload):
    applicantType: str

class AdmissionDecisionPayload(BasePayload):
    applicantId: str
    isAccepted: bool

class AcceptOfferPayload(BasePayload):
    id: str
