from fpdf import FPDF

def generate_application_form_pdf(applicant: dict, interview_date: str) -> bytes:
    pdf = FPDF(format='A4')
    pdf.add_page()
    pdf.set_margins(20, 20, 20)
    
    # Helper for full name
    first = applicant.get("firstName", "")
    last = applicant.get("lastName", "")
    full_name = f"{last}, {first}".strip()

    # Header
    pdf.set_font("helvetica", "B", 13)
    pdf.cell(0, 8, "DALUBHASAANG POLITEKNIKO NG LUNGSOD NG BALIWAG", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "I", 10)
    pdf.cell(0, 6, "(BALIWAG POLYTECHNIC COLLEGE)", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)
    
    pdf.set_font("helvetica", "B", 15)
    pdf.cell(0, 10, "PRE-ADMISSION APPLICATION FORM", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)

    # Helper function to create sections
    def add_section(title, rows):
        pdf.set_font("helvetica", "B", 11)
        pdf.cell(0, 8, title, new_x="LMARGIN", new_y="NEXT")
        for label, value in rows:
            pdf.set_font("helvetica", "B", 9)
            pdf.cell(50, 6, f"{label}: ")
            pdf.set_font("helvetica", "", 9)
            pdf.cell(0, 6, str(value) if value else "N/A", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

    # Application Details
    add_section("Application Details", [
        ("Applicant ID", applicant.get("applicantId")),
        ("School Year", applicant.get("schoolYear")),
        ("Applicant Type", applicant.get("applicantType")),
        ("First Choice", applicant.get("firstChoice")),
        ("Interview Date", interview_date)
    ])

    # Personal Information
    add_section("Personal Information", [
        ("Name", full_name),
        ("Email", applicant.get("email")),
        ("Contact Number", applicant.get("contactNumber")),
    ])

    # Signature Line
    pdf.ln(15)
    pdf.set_font("helvetica", "", 8)
    pdf.cell(0, 6, "I hereby affirm that the information in this application form is true and correct.", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(15)
    
    pdf.set_font("helvetica", "B", 8)
    pdf.line(120, pdf.get_y(), 190, pdf.get_y()) # Draw signature line
    pdf.cell(100, 4, "") # Spacer
    pdf.cell(70, 4, "Applicant Signature Over Printed Name", align="C")

    # Output as a byte string (perfect for email attachments)
    return bytes(pdf.output())