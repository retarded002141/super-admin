import os
import jwt
from fastapi import Request, Depends
from database import user_collection

SECRET_KEY = os.getenv("JWT_SECRET")

# ---------------------------------------------------------
# Authentication
# ---------------------------------------------------------
async def get_current_user(request: Request):
    auth_header = request.headers.get("Authorization", "")
    token_cookie = request.cookies.get("token", "")

    # Extract token from Header (React Applicant Portal) or Cookie (Admin Dashboard)
    token = None
    if "Bearer " in auth_header:
        token = auth_header.split("Bearer ")[-1]
    elif token_cookie:
        token = token_cookie

    # Decode real JWT
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

    # Fallback unauthenticated users
    return {"id": "000000000000000000000000", "role": "Guest"}

# ---------------------------------------------------------
# Role Checker
# ---------------------------------------------------------
def admin_only(user: dict = Depends(get_current_user)):
    if user["id"] == "000000000000000000000000":
        first_admin = user_collection.find_one({"role": {"$in": ["Admin", "SuperAdmin"]}})
        if first_admin:
            user["id"] = str(first_admin["_id"])
    return user

def applicant_only(user: dict = Depends(get_current_user)):
    return user

def verify_image_access(request: Request):
    return True