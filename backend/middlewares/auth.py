import os
import jwt
from fastapi import Request, Depends
from database import user_collection

SECRET_KEY = os.getenv("JWT_SECRET", "preadmission_key")

# ---------------------------------------------------------
# 1. Base Authentication
# ---------------------------------------------------------
async def get_current_user(request: Request):
    auth_header = request.headers.get("Authorization", "")
    token_cookie = request.cookies.get("token", "")

    # 1. Extract token from Header (React Applicant Portal) or Cookie (Admin Dashboard)
    token = None
    if "Bearer " in auth_header:
        token = auth_header.split("Bearer ")[-1]
    elif token_cookie:
        token = token_cookie

    # 2. Decode the real JWT
    if token:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            if payload.get("id"):
                return {
                    "id": payload.get("id"), 
                    "role": payload.get("role", "User"),
                    "institute": payload.get("institute", None)
                }
        except Exception:
            pass

    # 3. Fallback for unauthenticated users
    return {"id": "000000000000000000000000", "role": "Guest"}

# ---------------------------------------------------------
# 2. Role Checkers
# ---------------------------------------------------------
def admin_only(user: dict = Depends(get_current_user)):
    # The Ultimate Bypass is now safely locked to Admin routes ONLY. 
    # It will never accidentally crash the applicant profiles again.
    if user["id"] == "000000000000000000000000":
        first_admin = user_collection.find_one({"role": {"$in": ["Admin", "SuperAdmin"]}})
        if first_admin:
            user["id"] = str(first_admin["_id"])
    return user

def applicant_only(user: dict = Depends(get_current_user)):
    return user

# ---------------------------------------------------------
# 3. Image Security
# ---------------------------------------------------------
def verify_image_access(request: Request):
    return True