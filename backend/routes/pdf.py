from fastapi import APIRouter, HTTPException, Response
from fpdf import FPDF
from bson import ObjectId
from bson.errors import InvalidId
from datetime import datetime
from database import applicant_collection

router = APIRouter(prefix="/api/admin/pdf", tags=["PDF"])

@router.get("/admission-slip/{id}")
async def generate_admission_slip(id: str):
    clean_id = id.replace('_slip.pdf', '')
    
    try:
        applicant = applicant_collection.find_one({"_id": ObjectId(clean_id)})
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid Applicant ID format")
        
    if not applicant:
        raise HTTPException(status_code=404, detail="Applicant not found")

    pdf = FPDF(format='A4')
    pdf.add_page()
    pdf.set_margins(20, 20, 20)

    # Header
    pdf.set_font("helvetica", "B", 20)
    pdf.cell(0, 10, "BTECH COLLEGE", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "", 12)
    pdf.cell(0, 10, "Bulacan, Philippines", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)

    pdf.set_text_color(21, 128, 61) # Green color
    pdf.set_font("helvetica", "U", 16)
    pdf.cell(0, 10, "OFFICIAL ADMISSION SLIP", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(10)
    pdf.set_text_color(0, 0, 0)

    # Box around details
    pdf.rect(20, 60, 170, 50)

    # Applicant Details
    pdf.set_font("helvetica", "B", 12)
    pdf.set_xy(25, 65)
    pdf.cell(50, 10, "Applicant ID:")
    pdf.set_font("helvetica", "", 12)
    pdf.cell(0, 10, str(applicant.get("applicantId", applicant["_id"])), new_x="LMARGIN", new_y="NEXT")

    pdf.set_xy(25, 75)
    pdf.set_font("helvetica", "B", 12)
    pdf.cell(50, 10, "Name:")
    pdf.set_font("helvetica", "", 12)
    pdf.cell(0, 10, f"{applicant.get('lastName', '')}, {applicant.get('firstName', '')}", new_x="LMARGIN", new_y="NEXT")

    pdf.set_xy(25, 85)
    pdf.set_font("helvetica", "B", 12)
    pdf.cell(50, 10, "Course Choice:")
    pdf.set_font("helvetica", "", 12)
    pdf.cell(0, 10, applicant.get("firstChoice", "N/A"), new_x="LMARGIN", new_y="NEXT")

    pdf.set_xy(25, 95)
    pdf.set_font("helvetica", "B", 12)
    pdf.cell(50, 10, "Status:")
    pdf.set_font("helvetica", "B", 12)
    pdf.set_text_color(21, 128, 61)
    display_status = str(applicant.get("admissionStatus", applicant.get("status", "PENDING"))).upper()
    pdf.cell(0, 10, display_status, new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)

    # Footer
    pdf.set_y(130)
    pdf.set_font("helvetica", "I", 10)
    pdf.cell(0, 10, "Note: Please present this slip to the Registrar Office for enrollment.", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 10, f"Generated on: {datetime.now().strftime('%m/%d/%Y')}", align="C")

    # Output to bytes
    pdf_bytes = pdf.output()
    headers = {
        "Content-Disposition": f"attachment; filename={applicant.get('lastName', 'Applicant')}_Admission_Slip.pdf"
    }
    
    return Response(content=bytes(pdf_bytes), media_type="application/pdf", headers=headers)