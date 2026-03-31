#!/usr/bin/env python3
"""
Generate COO Balloting Presentation PDF - LEAN VERSION
Just show options, ask for his vision
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import inch, cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.pdfgen import canvas
from datetime import datetime

# File setup
filename = f"Balloting_Options_COO_{datetime.now().strftime('%d%b%Y')}.pdf"
doc = SimpleDocTemplate(filename, pagesize=A4, topMargin=1.5*cm, bottomMargin=1.5*cm)
story = []
styles = getSampleStyleSheet()

# Custom styles
title_style = ParagraphStyle(
    'CustomTitle',
    parent=styles['Heading1'],
    fontSize=24,
    textColor=colors.HexColor('#1a365d'),
    spaceAfter=30,
    alignment=TA_CENTER,
    fontName='Helvetica-Bold'
)

heading_style = ParagraphStyle(
    'CustomHeading',
    parent=styles['Heading2'],
    fontSize=16,
    textColor=colors.HexColor('#2c5282'),
    spaceAfter=12,
    spaceBefore=20,
    fontName='Helvetica-Bold'
)

subheading_style = ParagraphStyle(
    'CustomSubHeading',
    parent=styles['Heading3'],
    fontSize=13,
    textColor=colors.HexColor('#2d3748'),
    spaceAfter=8,
    spaceBefore=12,
    fontName='Helvetica-Bold'
)

body_style = ParagraphStyle(
    'CustomBody',
    parent=styles['Normal'],
    fontSize=11,
    textColor=colors.HexColor('#2d3748'),
    alignment=TA_JUSTIFY,
    spaceAfter=10,
    leading=16
)

bullet_style = ParagraphStyle(
    'CustomBullet',
    parent=styles['Normal'],
    fontSize=10,
    textColor=colors.HexColor('#4a5568'),
    leftIndent=20,
    spaceAfter=6,
    leading=14
)

# Title Page
story.append(Spacer(1, 1.5*inch))
story.append(Paragraph("Plot Balloting System", title_style))
story.append(Paragraph("Sitara Grand Bazaar", ParagraphStyle('subtitle', parent=title_style, fontSize=18, textColor=colors.HexColor('#4a5568'))))
story.append(Spacer(1, 0.3*inch))
story.append(Paragraph("Four Approaches for Your Review", ParagraphStyle('subtitle2', parent=body_style, fontSize=12, alignment=TA_CENTER, textColor=colors.HexColor('#718096'))))
story.append(Spacer(1, 0.5*inch))

# Date
story.append(Paragraph(f"{datetime.now().strftime('%B %d, %Y')}",
                      ParagraphStyle('date', parent=body_style, fontSize=10, alignment=TA_CENTER, textColor=colors.HexColor('#a0aec0'))))

story.append(PageBreak())

# Two Types of Assignments
story.append(Paragraph("Two Types of Assignments", heading_style))
story.append(Spacer(1, 0.15*inch))

# Two-lane table
lane_data = [
    ['Selected', 'Elected'],
    ['Reserved plots\n(Management priority,\nVIP, broker incentives)', 'Open balloting\n(Fair draw for\neligible buyers)'],
    ['You control directly', 'System assigns fairly']
]

lane_table = Table(lane_data, colWidths=[3.5*inch, 3.5*inch])
lane_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (1, 0), colors.HexColor('#2c5282')),
    ('TEXTCOLOR', (0, 0), (1, 0), colors.white),
    ('FONTNAME', (0, 0), (1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (1, 0), 12),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f7fafc')),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e0')),
    ('FONTSIZE', (0, 1), (-1, -1), 10),
    ('ROWHEIGHT', (0, 1), (-1, -1), 0.6*inch),
]))
story.append(lane_table)

story.append(PageBreak())

# Option A
story.append(Paragraph("Option A: Simple Random Draw", heading_style))
story.append(Spacer(1, 0.1*inch))

story.append(Paragraph(
    "After marking which plots are 'Selected' (reserved), the system takes all remaining plots and all eligible buyers, "
    "shuffles both lists randomly, and pairs them up one by one. Like shuffling two decks of cards and matching them.",
    body_style
))

story.append(PageBreak())

# Option B
story.append(Paragraph("Option B: Live Lottery Event", heading_style))
story.append(Spacer(1, 0.1*inch))

story.append(Paragraph(
    "Same random logic as Option A, but presented like a live draw. Buyers watch as names are called one by one, "
    "each 'drawing' a plot from the remaining pool. Good for making it a public event.",
    body_style
))

story.append(PageBreak())

# Option C
story.append(Paragraph("Option C: Priority-Based Balloting", heading_style))
story.append(Spacer(1, 0.1*inch))

story.append(Paragraph(
    "Buyers earn 'extra chances' based on your business rules. For example: full payment gets 3 tickets, "
    "partial payment gets 2 tickets, early EOI gets 1 bonus ticket. Draw is still random, but some buyers have higher odds.",
    body_style
))

story.append(PageBreak())

# Option D
story.append(Paragraph("Option D: Tiered Balloting", heading_style))
story.append(Spacer(1, 0.1*inch))

story.append(Paragraph(
    "Split the process into two rounds. Round 1: 'Premium' plots (corner, park-facing, main road) go to 'Priority' buyers "
    "(full payment, early commitments). Round 2: Remaining plots randomly allocated to remaining buyers.",
    body_style
))

story.append(PageBreak())

# Key Decisions Page
story.append(Paragraph("What We Need from You", heading_style))
story.append(Spacer(1, 0.2*inch))

story.append(Paragraph("1. Which approach feels right for this project?", subheading_style))
story.append(Paragraph("   □ Option A (Simple Random)", bullet_style))
story.append(Paragraph("   □ Option B (Live Event)", bullet_style))
story.append(Paragraph("   □ Option C (Priority-Based)", bullet_style))
story.append(Paragraph("   □ Option D (Tiered)", bullet_style))
story.append(Paragraph("   □ Something else (describe below)", bullet_style))

story.append(Spacer(1, 0.25*inch))
story.append(Paragraph("2. Reserved plots", subheading_style))
story.append(Paragraph("   Total marlas/shops we need to reserve: __________", bullet_style))

story.append(Spacer(1, 0.25*inch))
story.append(Paragraph("3. Your vision", subheading_style))
story.append(Paragraph(
    "Tell us how you see the balloting working. Don't worry about technical details — "
    "just describe the picture in your mind:",
    body_style
))

story.append(Spacer(1, 0.15*inch))

# Lines for writing
for i in range(15):
    story.append(Paragraph("_" * 120, ParagraphStyle('line', parent=body_style, fontSize=10, textColor=colors.HexColor('#cbd5e0'))))
    story.append(Spacer(1, 0.12*inch))

story.append(PageBreak())

# Closing
story.append(Spacer(1, 1*inch))
story.append(Paragraph("Next Step", heading_style))
story.append(Spacer(1, 0.2*inch))

story.append(Paragraph(
    "Once we understand your vision, we'll design the exact flow and present it back to you for approval. "
    "Then we build it.",
    body_style
))

story.append(Spacer(1, 0.3*inch))

story.append(Paragraph(
    "We'll handle all the technical details — algorithms, approvals, audit trails, PDF exports, and admin screens. "
    "You just need to tell us what feels right for your buyers and your business.",
    body_style
))

# Build PDF
doc.build(story)
print(f"PDF created: {filename}")
