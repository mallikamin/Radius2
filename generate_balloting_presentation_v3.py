#!/usr/bin/env python3
"""
Generate COO Balloting Presentation PDF - VISUAL VERSION
Show actual UI mockups for each option
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import inch, cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from datetime import datetime

filename = f"Balloting_Options_COO_{datetime.now().strftime('%d%b%Y')}.pdf"
doc = SimpleDocTemplate(filename, pagesize=A4, topMargin=1.2*cm, bottomMargin=1.2*cm, leftMargin=1.5*cm, rightMargin=1.5*cm)
story = []
styles = getSampleStyleSheet()

# Custom styles
title_style = ParagraphStyle(
    'CustomTitle',
    parent=styles['Heading1'],
    fontSize=22,
    textColor=colors.HexColor('#1a365d'),
    spaceAfter=20,
    alignment=TA_CENTER,
    fontName='Helvetica-Bold'
)

heading_style = ParagraphStyle(
    'CustomHeading',
    parent=styles['Heading2'],
    fontSize=14,
    textColor=colors.HexColor('#2c5282'),
    spaceAfter=8,
    spaceBefore=12,
    fontName='Helvetica-Bold'
)

subheading_style = ParagraphStyle(
    'CustomSubHeading',
    parent=styles['Heading3'],
    fontSize=11,
    textColor=colors.HexColor('#2d3748'),
    spaceAfter=6,
    spaceBefore=8,
    fontName='Helvetica-Bold'
)

body_style = ParagraphStyle(
    'CustomBody',
    parent=styles['Normal'],
    fontSize=10,
    textColor=colors.HexColor('#2d3748'),
    alignment=TA_JUSTIFY,
    spaceAfter=8,
    leading=14
)

small_style = ParagraphStyle(
    'Small',
    parent=styles['Normal'],
    fontSize=8,
    textColor=colors.HexColor('#4a5568'),
    spaceAfter=4,
    leading=10
)

# Title Page
story.append(Spacer(1, 1*inch))
story.append(Paragraph("Plot Balloting System", title_style))
story.append(Paragraph("Sitara Grand Bazaar", ParagraphStyle('subtitle', parent=title_style, fontSize=16, textColor=colors.HexColor('#4a5568'))))
story.append(Spacer(1, 0.2*inch))
story.append(Paragraph("Visual Options & Decision Framework", ParagraphStyle('subtitle2', parent=body_style, fontSize=10, alignment=TA_CENTER, textColor=colors.HexColor('#718096'))))
story.append(Spacer(1, 0.3*inch))
story.append(Paragraph(f"{datetime.now().strftime('%B %d, %Y')}",
                      ParagraphStyle('date', parent=body_style, fontSize=9, alignment=TA_CENTER, textColor=colors.HexColor('#a0aec0'))))

story.append(PageBreak())

# Two Types
story.append(Paragraph("Two Types of Assignments", heading_style))
lane_data = [
    ['Selected', 'Elected'],
    ['Reserved shops\n(Management, VIP,\nbroker incentives)', 'Open balloting\n(Fair draw for\neligible buyers)'],
    ['You control directly', 'System assigns fairly']
]
lane_table = Table(lane_data, colWidths=[3.2*inch, 3.2*inch])
lane_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (1, 0), colors.HexColor('#2c5282')),
    ('TEXTCOLOR', (0, 0), (1, 0), colors.white),
    ('FONTNAME', (0, 0), (1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (1, 0), 11),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f7fafc')),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e0')),
    ('FONTSIZE', (0, 1), (-1, -1), 9),
    ('ROWHEIGHT', (0, 1), (-1, -1), 0.5*inch),
]))
story.append(lane_table)
story.append(Spacer(1, 0.15*inch))

# =========================
# OPTION A
# =========================
story.append(PageBreak())
story.append(Paragraph("Option A: Simple Random Draw", heading_style))
story.append(Paragraph(
    "After marking 'Selected' shops, system shuffles remaining shops and eligible buyers randomly, then pairs them one-to-one.",
    body_style
))
story.append(Spacer(1, 0.1*inch))

# Setup Snapshot
story.append(Paragraph("Step 1-3: Setup Snapshot", subheading_style))
setup_data = [
    ['Total Inventory', 'Selected (Reserved)', 'Elected Pool'],
    ['160\n5M: 120, 10M: 40', '19\nApproved with reasons', '141\nReady for draw']
]
setup_table = Table(setup_data, colWidths=[2.2*inch, 2.2*inch, 2.2*inch])
setup_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e6f7ff')),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, 0), 9),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e0')),
    ('FONTSIZE', (0, 1), (-1, -1), 9),
    ('BACKGROUND', (0, 1), (-1, -1), colors.white),
]))
story.append(setup_table)
story.append(Spacer(1, 0.1*inch))

# Marla balance
marla_data = [
    ['Marla', 'Eligible Buyers', 'Elected Shops', 'Expected', 'Status'],
    ['5 Marla', '104', '105', '1 leftover shop', 'Balanced'],
    ['10 Marla', '36', '36', 'Exact match', 'Balanced']
]
marla_table = Table(marla_data, colWidths=[1.3*inch, 1.3*inch, 1.3*inch, 1.3*inch, 1*inch])
marla_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c5282')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, 0), 8),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e0')),
    ('FONTSIZE', (0, 1), (-1, -1), 8),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f7fafc'), colors.white]),
]))
story.append(marla_table)
story.append(Spacer(1, 0.12*inch))

# Results Preview
story.append(Paragraph("Results Preview", subheading_style))
result_summary = [
    ['Assigned', 'Waitlist', 'Leftover Shops', 'Dispute Flags'],
    ['140', '0', '1', '0']
]
result_sum_table = Table(result_summary, colWidths=[1.6*inch, 1.6*inch, 1.6*inch, 1.6*inch])
result_sum_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e6f7ff')),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, 0), 8),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e0')),
    ('FONTSIZE', (0, 1), (-1, -1), 9),
]))
story.append(result_sum_table)
story.append(Spacer(1, 0.1*inch))

result_data = [
    ['Buyer', 'Marla', 'Allocated Shop', 'Round', 'Result'],
    ['CUST-0301 Ahmed Raza', '5', 'A-149', 'Main', 'Assigned'],
    ['CUST-0317 Sana Javed', '10', 'B-208', 'Main', 'Assigned'],
    ['CUST-0348 Bilal Khan', '5', 'A-164', 'Main', 'Assigned']
]
result_table = Table(result_data, colWidths=[2*inch, 0.7*inch, 1.2*inch, 0.8*inch, 0.9*inch])
result_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c5282')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, 0), 8),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e0')),
    ('FONTSIZE', (0, 1), (-1, -1), 8),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f7fafc'), colors.white]),
]))
story.append(result_table)

# =========================
# OPTION B
# =========================
story.append(PageBreak())
story.append(Paragraph("Option B: Live Lottery Event", heading_style))
story.append(Paragraph(
    "Same random logic as Option A, presented as live draw. Buyers watch names called one-by-one.",
    body_style
))
story.append(Spacer(1, 0.1*inch))

# Live Draw Screen
story.append(Paragraph("Live Draw Screen (Big Display Mode)", subheading_style))
live_header = [
    ['Event: Sitara Square Block A', 'Round: 5 Marla Main Draw', 'Draw # 22 of 104']
]
live_header_table = Table(live_header, colWidths=[2.2*inch, 2.2*inch, 2*inch])
live_header_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a365d')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, 0), 9),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
]))
story.append(live_header_table)
story.append(Spacer(1, 0.08*inch))

calling_data = [
    ['Now Calling', 'Drawn Shop'],
    ['CUST-0337 - Ayesha Malik\nEOI Cleared | Payment: Partial', 'A-172\n5 Marla | General Category']
]
calling_table = Table(calling_data, colWidths=[3.2*inch, 3.2*inch])
calling_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c5282')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, 0), 10),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e0')),
    ('FONTSIZE', (0, 1), (-1, -1), 9),
    ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#fffbeb')),
    ('ROWHEIGHT', (0, 1), (-1, -1), 0.5*inch),
]))
story.append(calling_table)
story.append(Spacer(1, 0.08*inch))

# Draw Log
story.append(Paragraph("Draw Log (Audience Trust Panel)", subheading_style))
log_data = [
    ['Draw #', 'Buyer', 'Shop', 'Time', 'State'],
    ['19', 'CUST-0324', 'A-165', '19:22', 'Confirmed'],
    ['20', 'CUST-0328', 'A-151', '19:23', 'Confirmed'],
    ['21', 'CUST-0334', 'A-109', '19:24', 'Confirmed'],
    ['22', 'CUST-0337', 'A-172', '19:25', 'In Progress']
]
log_table = Table(log_data, colWidths=[0.7*inch, 1.4*inch, 0.9*inch, 0.8*inch, 1.1*inch])
log_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c5282')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, 0), 8),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e0')),
    ('FONTSIZE', (0, 1), (-1, -1), 8),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f7fafc'), colors.white]),
]))
story.append(log_table)
story.append(Spacer(1, 0.1*inch))

# Results Summary
result_b = [
    ['Assigned', 'Hold Queue', 'No Show', 'Complaints'],
    ['140', '3', '2', '0']
]
result_b_table = Table(result_b, colWidths=[1.6*inch, 1.6*inch, 1.6*inch, 1.6*inch])
result_b_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e6f7ff')),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, 0), 8),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e0')),
    ('FONTSIZE', (0, 1), (-1, -1), 9),
]))
story.append(result_b_table)

# =========================
# OPTION C
# =========================
story.append(PageBreak())
story.append(Paragraph("Option C: Priority-Based Balloting", heading_style))
story.append(Paragraph(
    "Buyers earn extra chances based on business rules. Full payment = 3 tickets, partial = 2 tickets, early EOI = +1 bonus.",
    body_style
))
story.append(Spacer(1, 0.1*inch))

# Policy Builder
story.append(Paragraph("Policy Rule Builder (Admin Mockup)", subheading_style))
story.append(Paragraph(
    "<i>Public Notice Required: Rules must be finalized before lock. Late changes invalidate event.</i>",
    ParagraphStyle('notice', parent=small_style, alignment=TA_JUSTIFY, textColor=colors.HexColor('#c53030'))
))
story.append(Spacer(1, 0.08*inch))

rules_data = [
    ['Rule 1', 'Full payment before cut-off = +3 tickets'],
    ['Rule 2', 'EOI paid before priority date = +2 tickets'],
    ['Rule 3', 'Special campaign referral = +1 ticket'],
    ['Rule 4', 'Dispute flag unresolved = -2 tickets (or hold)']
]
rules_table = Table(rules_data, colWidths=[1*inch, 5.4*inch])
rules_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#fef5e7')),
    ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, -1), 8),
    ('ALIGN', (0, 0), (0, -1), 'CENTER'),
    ('ALIGN', (1, 0), (1, -1), 'LEFT'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e0')),
    ('LEFTPADDING', (1, 0), (1, -1), 8),
]))
story.append(rules_table)
story.append(Spacer(1, 0.1*inch))

# Weighted Pool Preview
story.append(Paragraph("Weighted Pool Preview", subheading_style))
pool_data = [
    ['Buyer', 'Base', 'Bonuses', 'Total Tickets', 'Notes'],
    ['CUST-0301 Ahmed', '1', '+3 full, +2 early', '6', 'Priority'],
    ['CUST-0322 Sana', '1', '+2 early', '3', 'General+'],
    ['CUST-0350 Bilal', '1', '+0', '1', 'General']
]
pool_table = Table(pool_data, colWidths=[1.8*inch, 0.6*inch, 1.5*inch, 1.2*inch, 1*inch])
pool_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c5282')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, 0), 8),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e0')),
    ('FONTSIZE', (0, 1), (-1, -1), 8),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f7fafc'), colors.white]),
]))
story.append(pool_table)
story.append(Spacer(1, 0.1*inch))

# Result Summary
result_c_sum = [
    ['Assigned', 'Appeals', 'Policy Version', 'Overrides'],
    ['140', '4', 'v1.2', '0']
]
result_c_sum_table = Table(result_c_sum, colWidths=[1.6*inch, 1.6*inch, 1.6*inch, 1.6*inch])
result_c_sum_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e6f7ff')),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, 0), 8),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e0')),
    ('FONTSIZE', (0, 1), (-1, -1), 9),
]))
story.append(result_c_sum_table)
story.append(Spacer(1, 0.08*inch))

result_c_data = [
    ['Buyer', 'Shop', 'Ticket Count', 'Why'],
    ['CUST-0301', 'A-115', '6', 'Full payment + early EOI'],
    ['CUST-0322', 'A-174', '3', 'Early EOI'],
    ['CUST-0350', 'A-142', '1', 'Base ticket only']
]
result_c_table = Table(result_c_data, colWidths=[1.3*inch, 1*inch, 1.2*inch, 2.9*inch])
result_c_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c5282')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, 0), 8),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e0')),
    ('FONTSIZE', (0, 1), (-1, -1), 8),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f7fafc'), colors.white]),
]))
story.append(result_c_table)

# =========================
# OPTION D
# =========================
story.append(PageBreak())
story.append(Paragraph("Option D: Tiered Balloting", heading_style))
story.append(Paragraph(
    "Round 1: Premium shops to priority buyers. Round 2: Remaining shops to remaining buyers.",
    body_style
))
story.append(Spacer(1, 0.1*inch))

# Premium & Priority Pools
story.append(Paragraph("Premium Shop Pool (Round 1)", subheading_style))
story.append(Paragraph("<i>Entrance shops, easy parking access, main road visibility</i>", small_style))
story.append(Spacer(1, 0.05*inch))

premium_data = [
    ['', '26 Shops', '44 Buyers'],
    ['Premium Pool', '5M: 18, 10M: 8', 'Early EOI + Cleared Dues'],
]
premium_table = Table(premium_data, colWidths=[1.8*inch, 2.3*inch, 2.3*inch])
premium_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c5282')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, 0), 9),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e0')),
    ('FONTSIZE', (0, 1), (-1, -1), 8),
    ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#fef5e7')),
]))
story.append(premium_table)
story.append(Spacer(1, 0.1*inch))

# General Pool
story.append(Paragraph("General Pool (Round 2)", subheading_style))
general_data = [
    ['', 'Remaining Shops', 'Remaining Buyers', 'Expected'],
    ['General Pool', '115', '114', '1 shop leftover'],
]
general_table = Table(general_data, colWidths=[1.8*inch, 1.6*inch, 1.6*inch, 1.6*inch])
general_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c5282')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, 0), 9),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e0')),
    ('FONTSIZE', (0, 1), (-1, -1), 8),
    ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#e6f7ff')),
]))
story.append(general_table)
story.append(Spacer(1, 0.1*inch))

# Two-Round Results
story.append(Paragraph("Two-Round Results Summary", subheading_style))
two_round_sum = [
    ['Premium Assigned', 'Priority Winners', 'General Assigned', 'Waitlist', 'Leftover'],
    ['26', '26', '114', '0', '1']
]
two_round_table = Table(two_round_sum, colWidths=[1.3*inch, 1.3*inch, 1.3*inch, 1.3*inch, 1.2*inch])
two_round_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e6f7ff')),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, 0), 8),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e0')),
    ('FONTSIZE', (0, 1), (-1, -1), 9),
]))
story.append(two_round_table)
story.append(Spacer(1, 0.08*inch))

result_d_data = [
    ['Buyer', 'Shop', 'Round', 'Tier', 'Result'],
    ['CUST-0301', 'A-102', 'Round 1', 'Premium', 'Assigned'],
    ['CUST-0322', 'A-169', 'Round 2', 'General', 'Assigned'],
    ['CUST-0355', 'B-212', 'Round 2', 'General', 'Assigned']
]
result_d_table = Table(result_d_data, colWidths=[1.3*inch, 1*inch, 1.2*inch, 1.2*inch, 1.1*inch])
result_d_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c5282')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, 0), 8),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e0')),
    ('FONTSIZE', (0, 1), (-1, -1), 8),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f7fafc'), colors.white]),
]))
story.append(result_d_table)

# =========================
# DECISION PAGE
# =========================
story.append(PageBreak())
story.append(Paragraph("What We Need from You", heading_style))
story.append(Spacer(1, 0.1*inch))

story.append(Paragraph("1. Which approach feels right?", subheading_style))
story.append(Paragraph("   □ Option A (Simple Random)", small_style))
story.append(Paragraph("   □ Option B (Live Event)", small_style))
story.append(Paragraph("   □ Option C (Priority-Based)", small_style))
story.append(Paragraph("   □ Option D (Tiered)", small_style))
story.append(Paragraph("   □ Something else (describe below)", small_style))
story.append(Spacer(1, 0.12*inch))

story.append(Paragraph("2. Reserved shops — total marlas/shops we need to reserve:", subheading_style))
story.append(Paragraph("   _______________________________________", body_style))
story.append(Spacer(1, 0.12*inch))

story.append(Paragraph("3. Your mindset — detailed scenarios, features, or flow you envision:", subheading_style))
story.append(Spacer(1, 0.08*inch))

# Just 3 lines
for i in range(3):
    story.append(Paragraph("_" * 135, ParagraphStyle('line', parent=body_style, fontSize=9, textColor=colors.HexColor('#cbd5e0'))))
    story.append(Spacer(1, 0.1*inch))

# Build PDF
doc.build(story)
print(f"PDF created: {filename}")
