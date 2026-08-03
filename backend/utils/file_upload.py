import os
import time
from fastapi import UploadFile, HTTPException

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True) # Automatically creates the folder if it doesn't exist

ALLOWED_EXTENSIONS = {".jpeg", ".jpg", ".png", ".pdf", ".csv"}
ALLOWED_MIMETYPES = {
    "image/jpeg", "image/jpg", "image/png", 
    "application/pdf", "text/csv", 
    "application/vnd.ms-excel", 
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
}

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB limit

async def save_upload(file: UploadFile, fieldname: str):
    # 1. Check Extension & MIME Type
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS or file.content_type not in ALLOWED_MIMETYPES:
        raise HTTPException(status_code=400, detail="Error: Only Images, PDFs, and CSV files are allowed!")
        
    # 2. Generate unique filename (just like Multer did)
    timestamp = int(time.time() * 1000)
    new_filename = f"{fieldname}-{timestamp}{ext}"
    file_path = os.path.join(UPLOAD_DIR, new_filename)
    
    # 3. Read, check size, and save
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Error: File is too large. Limit is 10MB.")
        
    with open(file_path, "wb") as f:
        f.write(content)
        
    return f"uploads/{new_filename}"