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
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.4*inch, bottomMargin=0.4*inch, 
                           leftMargin=0.5*inch, rightMargin=0.5*inch)
    styles = getSampleStyleSheet()
    story = []
    
    # Report Header - optimized for margins
    header_style = ParagraphStyle(
        'ReportHeader',
        parent=styles['Heading1'],
        fontSize=16,
        textColor=colors.HexColor('#ffffff'),
        spaceAfter=5,
        alignment=1,
        fontName='Helvetica-Bold'
    )
    subtitle_style = ParagraphStyle(
        'ReportSubtitle',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.HexColor('#e5e7eb'),
        spaceAfter=10,
        alignment=1
    )
    
    # Header with background - fit within page width (7.5 inch - 1 inch margins = 6.5 inch max)
    header_data = [
        [Paragraph(report_data.get("report_header", {}).get("title", "Customer Detailed Financial Report"), header_style)],
        [Paragraph(f"Generated via <b>Radius CRM</b> • {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", subtitle_style)]
    ]
    header_table = Table(header_data, colWidths=[6.5*inch])
    header_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#1a1a1a')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    story.append(header_table)
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
    
    # Installment Schedule
    if report_data.get("installment_schedule"):
        story.append(Paragraph("Complete Installment Schedule", styles['Heading2']))
        story.append(Spacer(1, 0.1*inch))
        
        inst_headers = ["#", "Project", "Due Date", "Amount", "Paid", "Balance", "Days", "Status"]
        inst_data = [inst_headers]
        
        for inst in report_data["installment_schedule"]:
            due_date = inst.get("due_date", "-")
            if due_date != "-":
                try:
                    due_date = datetime.strptime(due_date, "%Y-%m-%d").strftime("%m/%d/%Y")
                except:
                    pass
            
            days_out = inst.get("days_outstanding")
            days_str = f"{days_out}" if days_out is not None and days_out > 0 else "-"
            
            status = "Overdue" if inst.get("is_overdue") else inst.get("status", "Pending")
            
            project_name = inst.get("project_name", "-")
            if len(project_name) > 15:
                project_name = project_name[:12] + "..."
            
            inst_data.append([
                str(inst.get("number", "-")),
                project_name,
                due_date[:10] if due_date != "-" else "-",
                f"{inst.get('amount', 0):,.0f}",
                f"{inst.get('paid', 0):,.0f}",
                f"{inst.get('balance', 0):,.0f}",
                days_str,
                status[:8]
            ])
        
        # Optimized column widths to fit page (6.5 inch total)
        inst_table = Table(inst_data, colWidths=[0.35*inch, 1.1*inch, 0.85*inch, 0.9*inch, 0.9*inch, 0.9*inch, 0.55*inch, 0.65*inch])
        inst_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a1a1a')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('ALIGN', (3, 1), (5, -1), 'RIGHT'),
            ('ALIGN', (6, 1), (6, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 7),
            ('FONTSIZE', (0, 0), (-1, 0), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9fafb')]),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(inst_table)
        story.append(Spacer(1, 0.2*inch))
        # Force page break after installment schedule
        story.append(PageBreak())
    
    # Unallocated Receipts
    if report_data.get("unallocated_receipts"):
        story.append(Paragraph("Unallocated Receipts", styles['Heading2']))
        story.append(Spacer(1, 0.1*inch))
        
        unalloc_headers = ["Receipt ID", "Payment Date", "Method", "Total", "Allocated", "Unallocated"]
        unalloc_data = [unalloc_headers]
        
        for rec in report_data["unallocated_receipts"]:
            payment_date = rec.get("payment_date", "-")
            if payment_date != "-":
                try:
                    payment_date = datetime.strptime(payment_date, "%Y-%m-%d").strftime("%m/%d/%Y")
                except:
                    pass
            
            unalloc_data.append([
                rec.get("receipt_id", "-")[:12],
                payment_date[:10] if payment_date != "-" else "-",
                rec.get("payment_method", "-")[:8],
                f"{rec.get('total_amount', 0):,.0f}",
                f"{rec.get('allocated_amount', 0):,.0f}",
                f"{rec.get('unallocated_amount', 0):,.0f}"
            ])
        
        # Optimized widths
        unalloc_table = Table(unalloc_data, colWidths=[1*inch, 0.9*inch, 0.7*inch, 1*inch, 1*inch, 1*inch])
        unalloc_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f59e0b')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('ALIGN', (3, 1), (-1, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#fef3c7')])
        ]))
        story.append(unalloc_table)
        story.append(Spacer(1, 0.2*inch))
        # Force page break if there are transactions coming
        if report_data.get("transactions"):
            story.append(PageBreak())
    
    # Transactions - Start on new page
    story.append(Paragraph("Transactions", styles['Heading2']))
    story.append(Spacer(1, 0.1*inch))
    
    if report_data["transactions"]:
        # Group transactions to avoid splitting across pages
        txn_count = len(report_data["transactions"])
        txn_per_page = 5  # Approximate transactions per page
        
        for idx, txn in enumerate(report_data["transactions"]):
            # Check if we need a new page (every 5 transactions or if near page end)
            if idx > 0 and idx % txn_per_page == 0:
                story.append(PageBreak())
                story.append(Paragraph("Transactions (continued)", styles['Heading2']))
                story.append(Spacer(1, 0.1*inch))
            
            txn_data = [
                ["Transaction ID", txn["transaction_id"]],
                ["Project", txn.get("project_name", "-")],
                ["Unit Number", txn.get("unit_number", "-")],
                ["Total Value", f"PKR {txn['total_value']:,.0f}"],
                ["Received", f"PKR {txn['received']:,.0f}"],
                ["Balance", f"PKR {txn['balance']:,.0f}"]
            ]
            txn_table = Table(txn_data, colWidths=[2*inch, 4.5*inch])
            txn_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f9fafb')),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ]))
            story.append(txn_table)
            story.append(Spacer(1, 0.15*inch))
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
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.HexColor('#6b7280'),
        alignment=1
    )
    story.append(Paragraph(f"Report Generated via Radius CRM • {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", footer_style))
    
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
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.4*inch, bottomMargin=0.4*inch,
                           leftMargin=0.5*inch, rightMargin=0.5*inch)
    styles = getSampleStyleSheet()
    story = []
    
    # Report Header - optimized
    header_style = ParagraphStyle(
        'ReportHeader',
        parent=styles['Heading1'],
        fontSize=16,
        textColor=colors.HexColor('#ffffff'),
        spaceAfter=5,
        alignment=1,
        fontName='Helvetica-Bold'
    )
    subtitle_style = ParagraphStyle(
        'ReportSubtitle',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.HexColor('#e5e7eb'),
        spaceAfter=10,
        alignment=1
    )
    
    header_data = [
        [Paragraph(report_data.get("report_header", {}).get("title", "Project Financial Report"), header_style)],
        [Paragraph(f"Generated via <b>Radius CRM</b> • {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", subtitle_style)]
    ]
    header_table = Table(header_data, colWidths=[6.5*inch])
    header_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#1a1a1a')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    story.append(header_table)
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
        ["Future Receivable", f"PKR {financials['future_receivable']:,.0f}"],
        ["Outstanding", f"PKR {financials.get('outstanding', 0):,.0f}"]
    ]
    fin_table = Table(fin_data, colWidths=[2.5*inch, 3.5*inch])
    fin_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a1a1a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 1, colors.black)
    ]))
    story.append(fin_table)
    story.append(Spacer(1, 0.3*inch))
    
    # Customer-wise Top Receivables
    if report_data.get("customer_receivables"):
        story.append(Paragraph("Customer-wise Top Receivables", styles['Heading2']))
        story.append(Paragraph("For CFO/COO Review", ParagraphStyle('Subtitle', parent=styles['Normal'], fontSize=9, textColor=colors.HexColor('#6b7280'))))
        story.append(Spacer(1, 0.2*inch))
        
        for idx, customer in enumerate(report_data["customer_receivables"]):
            # Start each customer on new page if not first
            if idx > 0:
                story.append(PageBreak())
            
            # Customer Header - optimized width
            cust_name = customer['customer_name']
            if len(cust_name) > 30:
                cust_name = cust_name[:27] + "..."
            
            cust_header = [
                [f"{cust_name} ({customer['customer_id']})", 
                 f"Outstanding: {customer['total_outstanding']:,.0f}"]
            ]
            cust_header_table = Table(cust_header, colWidths=[4*inch, 2.5*inch])
            cust_header_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#3b82f6')),
                ('TEXTCOLOR', (0, 0), (-1, -1), colors.white),
                ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ]))
            story.append(cust_header_table)
            story.append(Spacer(1, 0.1*inch))
            
            # Customer Summary
            cust_summary = [
                ["Overdue", f"{customer['total_overdue']:,.0f}"],
                ["Future Receivable", f"{customer['total_future']:,.0f}"]
            ]
            cust_summary_table = Table(cust_summary, colWidths=[2*inch, 1.5*inch])
            cust_summary_table.setStyle(TableStyle([
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ]))
            story.append(cust_summary_table)
            story.append(Spacer(1, 0.1*inch))
            
            # Installments
            if customer.get("installments"):
                inst_headers = ["#", "Unit", "Due Date", "Amount", "Paid", "Balance", "Days"]
                inst_data = [inst_headers]
                
                for inst in customer["installments"]:
                    due_date = inst.get("due_date", "-")
                    if due_date != "-":
                        try:
                            due_date = datetime.strptime(due_date, "%Y-%m-%d").strftime("%m/%d/%Y")
                        except:
                            pass
                    
                    days_out = inst.get("days_outstanding")
                    days_str = f"{days_out}" if days_out is not None and days_out > 0 else "-"
                    
                    unit_num = inst.get("unit_number", "-")
                    if len(unit_num) > 12:
                        unit_num = unit_num[:9] + "..."
                    
                    inst_data.append([
                        str(inst.get("installment_number", "-")),
                        unit_num,
                        due_date[:10] if due_date != "-" else "-",
                        f"{inst.get('amount', 0):,.0f}",
                        f"{inst.get('paid', 0):,.0f}",
                        f"{inst.get('balance', 0):,.0f}",
                        days_str
                    ])
                
                # Optimized widths
                inst_table = Table(inst_data, colWidths=[0.35*inch, 0.75*inch, 0.85*inch, 0.9*inch, 0.9*inch, 0.9*inch, 0.55*inch])
                inst_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a1a1a')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('ALIGN', (3, 1), (5, -1), 'RIGHT'),
                    ('ALIGN', (6, 1), (6, -1), 'CENTER'),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, -1), 7),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ]))
                story.append(inst_table)
            
            story.append(Spacer(1, 0.2*inch))
    
    # Footer
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.HexColor('#6b7280'),
        alignment=1
    )
    story.append(Paragraph(f"Report Generated via Radius CRM • {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", footer_style))
    
    doc.build(story)
    buffer.seek(0)
    return buffer


def generate_broker_pdf(report_data: dict) -> BytesIO:
    """Generate PDF report for broker"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.4*inch, bottomMargin=0.4*inch,
                           leftMargin=0.5*inch, rightMargin=0.5*inch)
    styles = getSampleStyleSheet()
    story = []
    
    # Report Header - optimized
    header_style = ParagraphStyle(
        'ReportHeader',
        parent=styles['Heading1'],
        fontSize=16,
        textColor=colors.HexColor('#ffffff'),
        spaceAfter=5,
        alignment=1,
        fontName='Helvetica-Bold'
    )
    subtitle_style = ParagraphStyle(
        'ReportSubtitle',
        parent=styles['Normal'],
        fontSize=9,
        textColor=colors.HexColor('#e5e7eb'),
        spaceAfter=10,
        alignment=1
    )
    
    header_data = [
        [Paragraph(report_data.get("report_header", {}).get("title", "Broker Detailed Report"), header_style)],
        [Paragraph(f"Generated via <b>Radius CRM</b> • {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", subtitle_style)]
    ]
    header_table = Table(header_data, colWidths=[6.5*inch])
    header_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#1a1a1a')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    story.append(header_table)
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
    story.append(Spacer(1, 0.3*inch))
    
    # Financial Summary
    if report_data.get("financials"):
        financials = report_data["financials"]
        fin_data = [
            ["Financial Summary", ""],
            ["Total Sale Value", f"PKR {financials.get('total_sale_value', 0):,.0f}"],
            ["Total Received", f"PKR {financials.get('total_received', 0):,.0f}"],
            ["Due", f"PKR {financials.get('due', 0):,.0f}"],
            ["Future Receivable", f"PKR {financials.get('future_receivable', 0):,.0f}"]
        ]
        fin_table = Table(fin_data, colWidths=[2.5*inch, 3.5*inch])
        fin_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a1a1a')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        story.append(fin_table)
        story.append(Spacer(1, 0.3*inch))
    
    # Footer
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.HexColor('#6b7280'),
        alignment=1
    )
    story.append(Paragraph(f"Report Generated via Radius CRM • {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", footer_style))
    
    doc.build(story)
    buffer.seek(0)
    return buffer

