import os
import json
import base64
import urllib.request
from urllib.error import URLError, HTTPError
from dotenv import load_dotenv

load_dotenv()

def send_mail(to_email, subject, body, html=None, attachments=None):
    sender = os.getenv("GMAIL_USER") or "btech.pre.admission@gmail.com"
    sender_name = "BTECH Admission"
    api_key = os.getenv("BREVO_API_KEY")

    if not api_key:
        raise Exception("BREVO_API_KEY is not set in environment variables.")

    url = "https://api.brevo.com/v3/smtp/email"
    
    payload = {
        "sender": {"name": sender_name, "email": sender},
        "to": [{"email": to_email}],
        "subject": subject
    }
    
    if html:
        payload["htmlContent"] = html
    else:
        payload["textContent"] = body
        
    if attachments:
        brevo_attachments = []
        for att in attachments:
            content = att.get('content')
            if isinstance(content, bytes):
                b64_content = base64.b64encode(content).decode('utf-8')
            elif isinstance(content, str):
                # If it's already a base64 string, just use it
                b64_content = content
            else:
                continue
                
            brevo_attachments.append({
                "name": att["filename"],
                "content": b64_content
            })
        payload["attachment"] = brevo_attachments

    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "api-key": api_key
    }
    
    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers, method="POST")
    
    try:
        with urllib.request.urlopen(req) as response:
            if response.status in (200, 201, 202):
                print(f"Brevo email successfully sent to {to_email}")
                return True
            else:
                raise Exception(f"Brevo returned status {response.status}")
    except HTTPError as e:
        error_msg = e.read().decode('utf-8')
        raise Exception(f"Brevo HTTPError: {e.code} - {error_msg}")
    except URLError as e:
        raise Exception(f"Brevo URLError: {e.reason}")

# Export functions as requested
async def send_admission_confirmation(email, name, interview_details, applicant_type, pdf_buffer):
    subject = f"Application Received: Baliwag Polytechnic College - {name}"
    html = f"<p>Dear {name}, thank you for applying for AY {interview_details.get('academicYear')}...</p>" # Add full body here
    return send_mail(email, subject, "", html=html, attachments=[{"filename": "Slip.pdf", "content": pdf_buffer}])

async def send_student_otp(email, otp_code):
    html = f"<h1>Your OTP is: {otp_code}</h1>"
    return send_mail(email, "Your OTP", "", html=html)