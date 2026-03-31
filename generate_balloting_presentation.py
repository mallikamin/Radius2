#!/usr/bin/env python3
"""
Generate COO Balloting Presentation PDF
Clean, aesthetic, decision-focused
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
filename = f"Balloting_Options_COO_Presentation_{datetime.now().strftime('%d%b%Y')}.pdf"
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
story.append(Paragraph("Options & Decision Framework", ParagraphStyle('subtitle2', parent=body_style, fontSize=12, alignment=TA_CENTER, textColor=colors.HexColor('#718096'))))
story.append(Spacer(1, 0.5*inch))

# Date
story.append(Paragraph(f"Prepared: {datetime.now().strftime('%B %d, %Y')}",
                      ParagraphStyle('date', parent=body_style, fontSize=10, alignment=TA_CENTER, textColor=colors.HexColor('#a0aec0'))))

story.append(PageBreak())

# Page 1: The Situation
story.append(Paragraph("The Situation", heading_style))
story.append(Paragraph(
    "We have EOI bookings by marla size, but buyers don't know which specific plot they'll get. "
    "This creates uncertainty and potential complaints when plots are finally assigned.",
    body_style
))
story.append(Spacer(1, 0.2*inch))

story.append(Paragraph("What We Need", subheading_style))
story.append(Paragraph("• A fair and transparent way to assign actual plot numbers", bullet_style))
story.append(Paragraph("• A system people can trust", bullet_style))
story.append(Paragraph("• Flexibility for business needs (VIP assignments, broker incentives)", bullet_style))
story.append(Paragraph("• Clear documentation and proof for buyers", bullet_style))

story.append(Spacer(1, 0.3*inch))
story.append(Paragraph("Two Types of Assignments", subheading_style))

# Two-lane table
lane_data = [
    ['Selected', 'Elected'],
    ['Reserved plots\n(VIP, management,\nbroker incentives)', 'Open balloting\n(fair draw for\neligible buyers)'],
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

# Page 2: Option A - Simple & Fair
story.append(Paragraph("Option A: Simple Random Draw", heading_style))
story.append(Paragraph("The most transparent approach", subheading_style))

story.append(Paragraph(
    "After you mark which plots are 'Selected' (reserved), the system takes all remaining plots and all eligible buyers, "
    "shuffles both lists randomly, and pairs them up one by one. Like shuffling two decks of cards and matching them.",
    body_style
))

story.append(Spacer(1, 0.15*inch))
story.append(Paragraph("Strengths", subheading_style))
story.append(Paragraph("• Easiest to explain to buyers — pure luck, no favoritism", bullet_style))
story.append(Paragraph("• Builds maximum trust", bullet_style))
story.append(Paragraph("• Fast to implement", bullet_style))
story.append(Paragraph("• Clean audit trail", bullet_style))

story.append(Spacer(1, 0.15*inch))
story.append(Paragraph("Limitations", subheading_style))
story.append(Paragraph("• No flexibility to reward early birds or full payments", bullet_style))
story.append(Paragraph("• Everyone has equal chance regardless of commitment level", bullet_style))

story.append(Spacer(1, 0.15*inch))
story.append(Paragraph("Best For", subheading_style))
story.append(Paragraph(
    "Projects where trust and public perception matter most. When you want buyers to feel confident the process was completely fair.",
    body_style
))

story.append(PageBreak())

# Page 3: Option B - Live Event Style
story.append(Paragraph("Option B: Live Lottery Event", heading_style))
story.append(Paragraph("Same fairness as Option A, with ceremony", subheading_style))

story.append(Paragraph(
    "Same random logic as Option A, but presented like a live draw. Buyers watch as names are called one by one, "
    "each 'drawing' a plot from the remaining pool. Good for making it a public event.",
    body_style
))

story.append(Spacer(1, 0.15*inch))
story.append(Paragraph("Strengths", subheading_style))
story.append(Paragraph("• Creates excitement and engagement", bullet_style))
story.append(Paragraph("• Visual transparency — people see it happen live", bullet_style))
story.append(Paragraph("• Same mathematical fairness as Option A", bullet_style))
story.append(Paragraph("• Good for marketing and PR", bullet_style))

story.append(Spacer(1, 0.15*inch))
story.append(Paragraph("Limitations", subheading_style))
story.append(Paragraph("• Requires event setup and attendance management", bullet_style))
story.append(Paragraph("• Takes longer than back-office processing", bullet_style))
story.append(Paragraph("• Still no priority for committed buyers", bullet_style))

story.append(Spacer(1, 0.15*inch))
story.append(Paragraph("Best For", subheading_style))
story.append(Paragraph(
    "High-profile launches where you want buyers physically present, media coverage, or ceremonial atmosphere. "
    "Can be combined with Option A (run algorithm behind the scenes, present it live).",
    body_style
))

story.append(PageBreak())

# Page 4: Option C - Weighted Priority
story.append(Paragraph("Option C: Priority-Based Balloting", heading_style))
story.append(Paragraph("Reward commitment with better chances", subheading_style))

story.append(Paragraph(
    "Buyers earn 'extra chances' based on your business rules. For example: full payment gets 3 tickets, "
    "partial payment gets 2 tickets, early EOI gets 1 bonus ticket. Draw is still random, but some buyers have higher odds.",
    body_style
))

story.append(Spacer(1, 0.15*inch))
story.append(Paragraph("Strengths", subheading_style))
story.append(Paragraph("• Rewards buyers who paid in full or acted early", bullet_style))
story.append(Paragraph("• Strong business control over outcomes", bullet_style))
story.append(Paragraph("• Encourages faster payments", bullet_style))

story.append(Spacer(1, 0.15*inch))
story.append(Paragraph("Limitations", subheading_style))
story.append(Paragraph("• Harder to explain — buyers may question fairness", bullet_style))
story.append(Paragraph("• Needs very clear published rules before balloting", bullet_style))
story.append(Paragraph("• Risk of disputes if rules feel arbitrary", bullet_style))
story.append(Paragraph("• Requires careful legal/policy review", bullet_style))

story.append(Spacer(1, 0.15*inch))
story.append(Paragraph("Best For", subheading_style))
story.append(Paragraph(
    "When you have a clear, well-communicated incentive policy and want to drive specific buyer behaviors. "
    "Works best if rules are published upfront (at EOI stage) so buyers know what they're getting into.",
    body_style
))

story.append(PageBreak())

# Page 5: Option D - Two-Round Approach
story.append(Paragraph("Option D: Tiered Balloting", heading_style))
story.append(Paragraph("Premium plots for priority buyers, then general round", subheading_style))

story.append(Paragraph(
    "Split the process into two rounds. Round 1: 'Premium' plots (corner, park-facing, main road) go to 'Priority' buyers "
    "(full payment, early commitments). Round 2: Remaining plots randomly allocated to remaining buyers. Balances fairness with business priorities.",
    body_style
))

story.append(Spacer(1, 0.15*inch))
story.append(Paragraph("Strengths", subheading_style))
story.append(Paragraph("• Rewards committed buyers without appearing unfair", bullet_style))
story.append(Paragraph("• Still gives everyone a fair shot in their tier", bullet_style))
story.append(Paragraph("• Easier to justify than pure weighting", bullet_style))
story.append(Paragraph("• Natural fit for projects with clear premium vs standard plots", bullet_style))

story.append(Spacer(1, 0.15*inch))
story.append(Paragraph("Limitations", subheading_style))
story.append(Paragraph("• Requires clear definition of 'premium' plots and 'priority' buyers", bullet_style))
story.append(Paragraph("• More complex to explain than simple random", bullet_style))
story.append(Paragraph("• Need policy on who qualifies for priority tier", bullet_style))

story.append(Spacer(1, 0.15*inch))
story.append(Paragraph("Best For", subheading_style))
story.append(Paragraph(
    "Projects with obvious premium inventory (corners, main road frontage) and where you have a natural way to segment buyers "
    "(full payment vs installment, early vs late). Good middle ground between pure randomness and weighted control.",
    body_style
))

story.append(PageBreak())

# Page 6: Quick Comparison
story.append(Paragraph("Quick Comparison", heading_style))
story.append(Spacer(1, 0.2*inch))

comparison_data = [
    ['Method', 'Easy to Explain?', 'Buyer Trust', 'Business Control', 'Speed'],
    ['A: Simple Random', '✓✓✓', '✓✓✓', '✓✓', 'Fast'],
    ['B: Live Event', '✓✓✓', '✓✓✓', '✓✓', 'Medium'],
    ['C: Weighted', '✓✓', '✓✓', '✓✓✓', 'Fast'],
    ['D: Tiered', '✓✓✓', '✓✓✓', '✓✓✓', 'Medium'],
]

comp_table = Table(comparison_data, colWidths=[1.8*inch, 1.3*inch, 1.3*inch, 1.4*inch, 1*inch])
comp_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c5282')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, 0), 10),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f7fafc')),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f7fafc')]),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e0')),
    ('FONTSIZE', (0, 1), (-1, -1), 9),
]))
story.append(comp_table)

story.append(Spacer(1, 0.3*inch))
story.append(Paragraph("Our Recommendation for First Launch", subheading_style))
story.append(Paragraph(
    "Start with <b>Option A</b> (Simple Random) for maximum trust and speed. Keep <b>Option B</b> (Live Event) presentation style "
    "if you want to make it a public ceremony. Consider <b>Option D</b> (Tiered) once you've established clear premium plot criteria and priority buyer policies.",
    body_style
))

story.append(PageBreak())

# Page 7: Key Decisions We Need from You
story.append(Paragraph("Key Decisions We Need from You", heading_style))
story.append(Spacer(1, 0.1*inch))

story.append(Paragraph("1. Which balloting method feels right for Sitara Grand Bazaar?", subheading_style))
story.append(Paragraph("   □ Option A (Simple Random)", bullet_style))
story.append(Paragraph("   □ Option B (Live Event)", bullet_style))
story.append(Paragraph("   □ Option C (Weighted)", bullet_style))
story.append(Paragraph("   □ Option D (Tiered)", bullet_style))
story.append(Paragraph("   □ Combination of: _________________", bullet_style))

story.append(Spacer(1, 0.2*inch))
story.append(Paragraph("2. Reserved (Selected) plot policy", subheading_style))
story.append(Paragraph("   What's the maximum % of plots we can reserve per block?  ______%", bullet_style))
story.append(Paragraph("   Should management/VIP reservations require dual approval?  □ Yes  □ No", bullet_style))

story.append(Spacer(1, 0.2*inch))
story.append(Paragraph("3. Premium plots & priority buyers (if using Option D)", subheading_style))
story.append(Paragraph("   Do we have obvious 'premium' plots (corners, main road)?  □ Yes  □ No", bullet_style))
story.append(Paragraph("   How do buyers qualify for priority tier? ___________________________", bullet_style))

story.append(Spacer(1, 0.2*inch))
story.append(Paragraph("4. Event format", subheading_style))
story.append(Paragraph("   □ Back-office processing only (faster, private)", bullet_style))
story.append(Paragraph("   □ Public live event (marketing opportunity, requires venue)", bullet_style))
story.append(Paragraph("   □ Hybrid (process backend, announce publicly)", bullet_style))

story.append(Spacer(1, 0.2*inch))
story.append(Paragraph("5. Post-balloting flexibility", subheading_style))
story.append(Paragraph("   Can we override results after balloting?  □ Yes with approval  □ No, final is final", bullet_style))
story.append(Paragraph("   Who can approve overrides? _____________________________", bullet_style))

story.append(Spacer(1, 0.2*inch))
story.append(Paragraph("6. Broker quotas", subheading_style))
story.append(Paragraph("   Should brokers get reserved plot quota (incentive/commission)?  □ Yes  □ No", bullet_style))
story.append(Paragraph("   If yes, how many per broker or per sales volume? _______________", bullet_style))

story.append(PageBreak())

# Final Page: Next Steps
story.append(Paragraph("Next Steps", heading_style))
story.append(Spacer(1, 0.2*inch))

story.append(Paragraph("Once you decide on the approach, we'll handle:", body_style))
story.append(Spacer(1, 0.1*inch))

next_steps = [
    "Complete system design & database architecture",
    "Build admin panel for event creation and plot management",
    "Develop the balloting algorithm with full audit logging",
    "Create result PDF generator and export tools",
    "Set up approval workflows and permissions",
    "Test with dummy data before going live",
    "Staff training and documentation"
]

for step in next_steps:
    story.append(Paragraph(f"• {step}", bullet_style))

story.append(Spacer(1, 0.3*inch))
story.append(Paragraph("Timeline Estimate", subheading_style))

timeline_data = [
    ['Phase', 'Duration', 'Deliverable'],
    ['Design & Database', '3-4 days', 'Schema, API endpoints'],
    ['Admin Interface', '5-6 days', 'Event management screens'],
    ['Algorithm & Testing', '3-4 days', 'Balloting engine with logs'],
    ['Results & Exports', '2-3 days', 'PDF reports, CSV downloads'],
    ['Total', '13-17 days', 'Ready for first balloting event'],
]

timeline_table = Table(timeline_data, colWidths=[2.2*inch, 1.8*inch, 2.8*inch])
timeline_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c5282')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, 0), 10),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f7fafc')),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e0')),
    ('FONTSIZE', (0, 1), (-1, -1), 9),
    ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#e6fffa')),
    ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
]))
story.append(timeline_table)

story.append(Spacer(1, 0.4*inch))
story.append(Paragraph("Questions?", subheading_style))
story.append(Paragraph(
    "We're ready to start as soon as you give the green light. Just let us know which direction feels right, "
    "and we'll take care of the technical details.",
    body_style
))

# Build PDF
doc.build(story)
print(f"PDF created: {filename}")
