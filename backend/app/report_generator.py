"""
Radius CRM - PDF and Excel Report Generation
"""
from io import BytesIO
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.pdfgen import canvas
import xlsxwriter
from datetime import datetime


def generate_customer_pdf(report_data: dict) -> BytesIO:
    """Generate PDF report for customer"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
    styles = getSampleStyleSheet()
    story = []
    
    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=18,
        textColor=colors.HexColor('#1a1a1a'),
        spaceAfter=30,
        alignment=1
    )
    story.append(Paragraph("Customer Financial Report", title_style))
    story.append(Spacer(1, 0.2*inch))
    
    # Customer Info
    customer = report_data["customer"]
    customer_data = [
        ["Customer ID", customer["customer_id"]],
        ["Name", customer["name"]],
        ["Mobile", customer.get("mobile", "-")],
        ["Email", customer.get("email", "-")],
        ["Address", customer.get("address", "-")],
        ["CNIC", customer.get("cnic", "-")]
    ]
    customer_table = Table(customer_data, colWidths=[2*inch, 4*inch])
    customer_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f3f4f6')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey)
    ]))
    story.append(customer_table)
    story.append(Spacer(1, 0.3*inch))
    
    # Financial Summary
    financials = report_data["financials"]
    fin_data = [
        ["Financial Summary", ""],
        ["Total Sale Value", f"PKR {financials['total_sale']:,.0f}"],
        ["Total Received", f"PKR {financials['total_received']:,.0f}"],
        ["Overdue Amount", f"PKR {financials['overdue']:,.0f}"],
        ["Future Receivable", f"PKR {financials['future_receivable']:,.0f}"],
        ["Outstanding Balance", f"PKR {financials['outstanding']:,.0f}"]
    ]
    fin_table = Table(fin_data, colWidths=[2.5*inch, 3.5*inch])
    fin_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a1a1a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 1, colors.black)
    ]))
    story.append(fin_table)
    story.append(Spacer(1, 0.3*inch))
    
    # Transactions
    story.append(Paragraph("Transactions", styles['Heading2']))
    story.append(Spacer(1, 0.1*inch))
    
    if report_data["transactions"]:
        for txn in report_data["transactions"]:
            txn_data = [
                ["Transaction ID", txn["transaction_id"]],
                ["Project", txn.get("project_name", "-")],
                ["Unit Number", txn.get("unit_number", "-")],
                ["Total Value", f"PKR {txn['total_value']:,.0f}"],
                ["Received", f"PKR {txn['received']:,.0f}"],
                ["Balance", f"PKR {txn['balance']:,.0f}"]
            ]
            txn_table = Table(txn_data, colWidths=[2*inch, 4*inch])
            txn_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f9fafb')),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey)
            ]))
            story.append(txn_table)
            story.append(Spacer(1, 0.2*inch))
    else:
        story.append(Paragraph("No transactions found.", styles['Normal']))
    
    story.append(PageBreak())
    
    # Interactions
    story.append(Paragraph("Interaction History", styles['Heading2']))
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph(f"Total Interactions: {report_data['interactions']['total_count']}", styles['Normal']))
    story.append(Spacer(1, 0.1*inch))
    
    if report_data["interactions"]["history"]:
        int_data = [["Date", "Rep", "Type", "Status", "Notes"]]
        for i in report_data["interactions"]["history"][:50]:  # Limit to 50
            int_data.append([
                i["date"][:10] if i.get("date") else "-",
                i.get("rep_name", "-"),
                i.get("type", "-"),
                i.get("status", "-"),
                (i.get("notes", "-") or "-")[:50]
            ])
        int_table = Table(int_data, colWidths=[1*inch, 1.2*inch, 0.8*inch, 1*inch, 2*inch])
        int_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a1a1a')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey)
        ]))
        story.append(int_table)
    else:
        story.append(Paragraph("No interactions recorded.", styles['Normal']))
    
    # Footer
    story.append(Spacer(1, 0.3*inch))
    story.append(Paragraph(f"Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", styles['Normal']))
    
    doc.build(story)
    buffer.seek(0)
    return buffer


def generate_customer_excel(report_data: dict) -> BytesIO:
    """Generate Excel report for customer"""
    buffer = BytesIO()
    workbook = xlsxwriter.Workbook(buffer, {'in_memory': True})
    worksheet = workbook.add_worksheet('Customer Report')
    
    # Styles
    header_format = workbook.add_format({'bold': True, 'bg_color': '#1a1a1a', 'font_color': 'white'})
    title_format = workbook.add_format({'bold': True, 'font_size': 14})
    currency_format = workbook.add_format({'num_format': '#,##0'})
    
    row = 0
    
    # Title
    worksheet.write(row, 0, "Customer Financial Report", title_format)
    row += 2
    
    # Customer Info
    customer = report_data["customer"]
    worksheet.write(row, 0, "Customer ID", header_format)
    worksheet.write(row, 1, customer["customer_id"])
    row += 1
    worksheet.write(row, 0, "Name", header_format)
    worksheet.write(row, 1, customer["name"])
    row += 1
    worksheet.write(row, 0, "Mobile", header_format)
    worksheet.write(row, 1, customer.get("mobile", "-"))
    row += 1
    worksheet.write(row, 0, "Email", header_format)
    worksheet.write(row, 1, customer.get("email", "-"))
    row += 2
    
    # Financial Summary
    financials = report_data["financials"]
    worksheet.write(row, 0, "Financial Summary", title_format)
    row += 1
    worksheet.write(row, 0, "Total Sale Value", header_format)
    worksheet.write(row, 1, financials["total_sale"], currency_format)
    row += 1
    worksheet.write(row, 0, "Total Received", header_format)
    worksheet.write(row, 1, financials["total_received"], currency_format)
    row += 1
    worksheet.write(row, 0, "Overdue Amount", header_format)
    worksheet.write(row, 1, financials["overdue"], currency_format)
    row += 1
    worksheet.write(row, 0, "Future Receivable", header_format)
    worksheet.write(row, 1, financials["future_receivable"], currency_format)
    row += 1
    worksheet.write(row, 0, "Outstanding Balance", header_format)
    worksheet.write(row, 1, financials["outstanding"], currency_format)
    row += 2
    
    # Transactions
    worksheet.write(row, 0, "Transactions", title_format)
    row += 1
    headers = ["Transaction ID", "Project", "Unit", "Total Value", "Received", "Balance"]
    for col, header in enumerate(headers):
        worksheet.write(row, col, header, header_format)
    row += 1
    
    for txn in report_data["transactions"]:
        worksheet.write(row, 0, txn["transaction_id"])
        worksheet.write(row, 1, txn.get("project_name", "-"))
        worksheet.write(row, 2, txn.get("unit_number", "-"))
        worksheet.write(row, 3, txn["total_value"], currency_format)
        worksheet.write(row, 4, txn["received"], currency_format)
        worksheet.write(row, 5, txn["balance"], currency_format)
        row += 1
    
    row += 1
    
    # Interactions
    worksheet.write(row, 0, "Interactions", title_format)
    row += 1
    int_headers = ["Date", "Rep", "Type", "Status", "Notes"]
    for col, header in enumerate(int_headers):
        worksheet.write(row, col, header, header_format)
    row += 1
    
    for i in report_data["interactions"]["history"]:
        worksheet.write(row, 0, i.get("date", "-")[:10] if i.get("date") else "-")
        worksheet.write(row, 1, i.get("rep_name", "-"))
        worksheet.write(row, 2, i.get("type", "-"))
        worksheet.write(row, 3, i.get("status", "-"))
        worksheet.write(row, 4, i.get("notes", "-") or "-")
        row += 1
    
    workbook.close()
    buffer.seek(0)
    return buffer


def generate_project_pdf(report_data: dict) -> BytesIO:
    """Generate PDF report for project"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    styles = getSampleStyleSheet()
    story = []
    
    story.append(Paragraph("Project Financial Report", styles['Heading1']))
    story.append(Spacer(1, 0.2*inch))
    
    # Project Info
    project = report_data["project"]
    project_data = [
        ["Project ID", project["project_id"]],
        ["Name", project["name"]],
        ["Location", project.get("location", "-")],
        ["Status", project.get("status", "-")]
    ]
    project_table = Table(project_data, colWidths=[2*inch, 4*inch])
    project_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f3f4f6')),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey)
    ]))
    story.append(project_table)
    story.append(Spacer(1, 0.3*inch))
    
    # Inventory Summary
    inv = report_data["inventory"]
    inv_data = [
        ["Inventory Summary", ""],
        ["Total Units", str(inv["total_units"])],
        ["Available Units", str(inv["available_units"])],
        ["Sold Units", str(inv["sold_units"])],
        ["Total Marlas", f"{inv['total_marlas']:.2f}"],
        ["Available Marlas", f"{inv['available_marlas']:.2f}"],
        ["Sold Marlas", f"{inv['sold_marlas']:.2f}"]
    ]
    inv_table = Table(inv_data, colWidths=[2.5*inch, 3.5*inch])
    inv_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a1a1a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 1, colors.black)
    ]))
    story.append(inv_table)
    story.append(Spacer(1, 0.3*inch))
    
    # Financial Summary
    financials = report_data["financials"]
    fin_data = [
        ["Financial Summary", ""],
        ["Total Sale", f"PKR {financials['total_sale']:,.0f}"],
        ["Total Received", f"PKR {financials['total_received']:,.0f}"],
        ["Overdue", f"PKR {financials['overdue']:,.0f}"],
        ["Future Receivable", f"PKR {financials['future_receivable']:,.0f}"]
    ]
    fin_table = Table(fin_data, colWidths=[2.5*inch, 3.5*inch])
    fin_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a1a1a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 1, colors.black)
    ]))
    story.append(fin_table)
    
    doc.build(story)
    buffer.seek(0)
    return buffer


def generate_broker_pdf(report_data: dict) -> BytesIO:
    """Generate PDF report for broker"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    styles = getSampleStyleSheet()
    story = []
    
    story.append(Paragraph("Broker Commission Report", styles['Heading1']))
    story.append(Spacer(1, 0.2*inch))
    
    # Broker Info
    broker = report_data["broker"]
    broker_data = [
        ["Broker ID", broker["broker_id"]],
        ["Name", broker["name"]],
        ["Mobile", broker.get("mobile", "-")],
        ["Commission Rate", f"{broker['commission_rate']}%"]
    ]
    broker_table = Table(broker_data, colWidths=[2*inch, 4*inch])
    broker_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f3f4f6')),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey)
    ]))
    story.append(broker_table)
    story.append(Spacer(1, 0.3*inch))
    
    # Commission Summary
    commission = report_data["commission"]
    comm_data = [
        ["Commission Summary", ""],
        ["Total Earned", f"PKR {commission['total_earned']:,.0f}"],
        ["Total Paid", f"PKR {commission['total_paid']:,.0f}"],
        ["Pending", f"PKR {commission['pending']:,.0f}"]
    ]
    comm_table = Table(comm_data, colWidths=[2.5*inch, 3.5*inch])
    comm_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a1a1a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 1, colors.black)
    ]))
    story.append(comm_table)
    
    doc.build(story)
    buffer.seek(0)
    return buffer

