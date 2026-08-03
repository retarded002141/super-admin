import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from dotenv import load_dotenv

load_dotenv()

def send_mail(to_email, subject, body, html=None, attachments=None):
    sender = os.getenv("GMAIL_USER")
    password = os.getenv("GMAIL_PASS")

    msg = MIMEMultipart()
    msg['From'] = f"Office of Admissions <{sender}>"
    msg['To'] = to_email
    msg['Subject'] = subject

    msg.attach(MIMEText(html or body, 'html' if html else 'plain'))

    if attachments:
        for att in attachments:
            part = MIMEApplication(att['content'], Name=att['filename'])
            part['Content-Disposition'] = f'attachment; filename="{att["filename"]}"'
            msg.attach(part)

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(sender, password)
        server.send_message(msg)

# Export functions as requested
async def send_admission_confirmation(email, name, interview_details, applicant_type, pdf_buffer):
    subject = f"Application Received: Baliwag Polytechnic College - {name}"
    html = f"<p>Dear {name}, thank you for applying for AY {interview_details.get('academicYear')}...</p>" # Add full body here
    return send_mail(email, subject, "", html=html, attachments=[{"filename": "Slip.pdf", "content": pdf_buffer}])

async def send_student_otp(email, otp_code):
    html = f"<h1>Your OTP is: {otp_code}</h1>"
    return send_mail(email, "Your OTP", "", html=html)