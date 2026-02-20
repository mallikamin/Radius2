"""
Lead Data Cleaning & Analysis Script
Reads 4 Excel files, cleans data, analyzes duplicates/overlaps,
and generates a professional PDF report for sales team review.
"""

import pandas as pd
import re
import os
import json
from collections import Counter, defaultdict
from datetime import datetime

# ─── CONFIG ───────────────────────────────────────────────────────────────────
FILES = {
    "Ali Zaidi": {
        "path": r"C:\Users\Malik\Downloads\CRM Data Ali Zaidi.xlsx",
        "rep_id": "REP-0018",
        "full_name": "Syed Ali Zaib Zaidi",
        "title": "Executive Sr. Manager - Project Sales"
    },
    "Iram Aslam": {
        "path": r"C:\Users\Malik\Downloads\CRM Data - Iram Aslam.xlsx",
        "rep_id": "REP-0019",
        "full_name": "Iram Aslam",
        "title": "Executive Sr. Manager - Project Sales"
    },
    "Naeem Zaidi": {
        "path": r"C:\Users\Malik\Downloads\CRM Data Naeem Zaidi.xlsx",
        "rep_id": "REP-0017",
        "full_name": "Syed Naeem Abbass Zaidi",
        "title": "Sr. Manager - Project Sales"
    },
    "Samia Rashid": {
        "path": r"C:\Users\Malik\Downloads\CRM Data Samia Rashid.xlsx",
        "rep_id": "REP-0016",
        "full_name": "Samia Rashid",
        "title": "Executive Sr. Manager - Project Sales"
    },
}

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data_analysis")
os.makedirs(OUTPUT_DIR, exist_ok=True)


# ─── PHONE CLEANING ──────────────────────────────────────────────────────────

def clean_phone(raw):
    """
    Normalize a phone number. Returns (canonical, format_type, is_valid, original).
    format_type: 'local_pk' | 'international_pk' | 'international_other' | 'landline' | 'invalid' | 'empty'
    canonical: 03XXXXXXXXX for PK mobiles, or +CCNUMBER for international
    """
    if pd.isna(raw) or str(raw).strip() == '':
        return (None, 'empty', False, str(raw) if not pd.isna(raw) else '')

    original = str(raw).strip()
    # Remove all non-digit characters (spaces, dashes, +, parens, dots)
    digits = re.sub(r'[^\d]', '', original)

    if len(digits) == 0:
        return (None, 'invalid', False, original)

    # Handle absurdly long numbers (likely concatenated) — more than 15 digits
    if len(digits) > 15:
        # Try to extract first valid Pakistani mobile from it
        # Look for pattern: 03XX or 923XX
        match = re.search(r'(03\d{9})', digits)
        if match:
            return (match.group(1), 'local_pk', True, original)
        match = re.search(r'(923\d{9})', digits)
        if match:
            canonical = '0' + match.group(1)[2:]  # 923... → 03...
            return (canonical, 'local_pk', True, original)
        return (None, 'invalid', False, original)

    # Pakistani mobile: starts with 03, 10 digits after removing leading 0 = 11 digits total
    # Or starts with 3 (no leading 0) = 10 digits
    # Or starts with 92 3... = 12 digits
    # Or starts with 0092 3... = 14 digits

    # Strip country code variations
    if digits.startswith('0092'):
        digits = '0' + digits[4:]
    elif digits.startswith('92') and len(digits) >= 12 and digits[2] == '3':
        digits = '0' + digits[2:]
    elif digits.startswith('920') and len(digits) >= 13 and digits[3] == '3':
        # 920 3XXXXXXXXX — extra 0 after country code
        digits = '0' + digits[3:]

    # Now should be local format
    if digits.startswith('03') and len(digits) == 11:
        return (digits, 'local_pk', True, original)
    elif digits.startswith('3') and len(digits) == 10:
        canonical = '0' + digits
        return (canonical, 'local_pk', True, original)

    # Pakistani landline: starts with 0 + area code (2-3 digits) + number
    # Faisalabad landline: 041-XXXXXXX (10-11 digits with 0)
    if digits.startswith('0') and len(digits) in (10, 11) and not digits.startswith('03'):
        return (digits, 'landline', True, original)

    # International numbers (non-PK) — starts with country codes other than 92
    # Common: 971 (UAE), 966 (Saudi), 44 (UK), 1 (US/Canada)
    intl_prefixes = {
        '971': 'UAE', '966': 'Saudi Arabia', '965': 'Kuwait', '968': 'Oman',
        '973': 'Bahrain', '974': 'Qatar', '44': 'UK', '1': 'US/Canada',
        '61': 'Australia', '49': 'Germany', '33': 'France', '86': 'China',
        '81': 'Japan', '82': 'South Korea', '90': 'Turkey', '39': 'Italy',
        '34': 'Spain', '31': 'Netherlands', '46': 'Sweden', '47': 'Norway',
        '45': 'Denmark', '358': 'Finland', '353': 'Ireland', '60': 'Malaysia',
        '65': 'Singapore', '66': 'Thailand', '91': 'India', '880': 'Bangladesh',
        '94': 'Sri Lanka', '977': 'Nepal', '93': 'Afghanistan', '98': 'Iran',
        '964': 'Iraq', '962': 'Jordan', '961': 'Lebanon', '963': 'Syria',
        '20': 'Egypt', '27': 'South Africa', '234': 'Nigeria',
    }

    # Check if it looks international (not starting with 0 or 3, or length doesn't match PK)
    for prefix, country in sorted(intl_prefixes.items(), key=lambda x: -len(x[0])):
        if digits.startswith(prefix) and len(digits) >= len(prefix) + 6:
            canonical = '+' + digits
            return (canonical, f'international_{country}', True, original)

    # Short numbers (< 10 digits) — likely incomplete
    if len(digits) < 10:
        return (None, 'invalid', False, original)

    # Fallback: if starts with 3 and reasonable length, treat as PK mobile
    if digits.startswith('3') and 10 <= len(digits) <= 11:
        canonical = '0' + digits[:10]
        return (canonical, 'local_pk', True, original)

    # Unknown format
    return (digits, 'unknown', False, original)


# ─── NAME CLEANING ────────────────────────────────────────────────────────────

def clean_name(raw):
    """Clean a name: remove artifacts, normalize whitespace, title case."""
    if pd.isna(raw) or str(raw).strip() == '':
        return None

    name = str(raw).strip()

    # Remove common artifacts
    artifacts = [
        r'\be-?mail\b', r'\bemail\b', r'\bwhatsapp\b', r'\bwhatapp\b',
        r'\bcall\b$', r'\bno\s*answer\b', r'\bnot\s*interested\b',
        r'\bbusy\b$', r'\bswitch\s*off\b', r'\bout\s*of\s*reach\b',
        r'\bnot\s*reachable\b', r'\bwrong\s*number\b', r'\binvalid\b',
    ]
    for pattern in artifacts:
        name = re.sub(pattern, '', name, flags=re.IGNORECASE)

    # Remove trailing/leading punctuation and delimiters
    name = re.sub(r'^[\s,;/\-\.]+|[\s,;/\-\.]+$', '', name)
    # Remove multiple spaces
    name = re.sub(r'\s+', ' ', name).strip()

    # Handle slash-separated names — keep the first part
    if '/' in name:
        parts = [p.strip() for p in name.split('/') if p.strip()]
        if parts:
            name = parts[0]

    # Remove numeric-only names
    if re.match(r'^\d+$', name):
        return None

    # Remove very short names (1 char)
    if len(name) <= 1:
        return None

    # Title case (but preserve all-caps abbreviations like "CH" for Chaudhry)
    # Simple approach: title case everything
    name = name.strip()

    return name if name else None


# ─── OCCUPATION CLEANING ──────────────────────────────────────────────────────

OCCUPATION_MAP = {
    # Business variants
    'business': 'Business', 'businessman': 'Business', 'business man': 'Business',
    'bussiness': 'Business', 'busines': 'Business', 'bussinessman': 'Business',
    'buisness': 'Business', 'bisness': 'Business', 'busness': 'Business',
    'bisnuss': 'Business', 'bsnss': 'Business', 'businessmen': 'Business',
    'businesman': 'Business', 'bussinesman': 'Business', 'businesss': 'Business',
    'bisuness': 'Business', 'bisnessman': 'Business',
    # Doctor variants
    'doctor': 'Doctor', 'dr': 'Doctor', 'dr.': 'Doctor', 'medical': 'Doctor',
    'physician': 'Doctor', 'mbbs': 'Doctor',
    # Teacher variants
    'teacher': 'Teacher', 'teaching': 'Teacher', 'lecturer': 'Teacher',
    'professor': 'Teacher',
    # Engineer variants
    'engineer': 'Engineer', 'engineering': 'Engineer', 'eng': 'Engineer',
    'civil engineer': 'Civil Engineer', 'electrical engineer': 'Electrical Engineer',
    'software engineer': 'Software Engineer',
    # Govt/Service
    'govt': 'Government Service', 'government': 'Government Service',
    'govt job': 'Government Service', 'govt service': 'Government Service',
    'government job': 'Government Service', 'government service': 'Government Service',
    'sarkari mulazim': 'Government Service', 'govt servant': 'Government Service',
    'gov employee': 'Government Service',
    # Private Job
    'private': 'Private Job', 'private job': 'Private Job', 'job': 'Private Job',
    'pvt job': 'Private Job', 'pvt': 'Private Job', 'service': 'Private Job',
    'employee': 'Private Job', 'employment': 'Private Job',
    # Lawyer
    'lawyer': 'Lawyer', 'advocate': 'Lawyer', 'attorney': 'Lawyer',
    # Retired
    'retired': 'Retired', 'retd': 'Retired', 'pension': 'Retired',
    'pensioner': 'Retired',
    # Student
    'student': 'Student', 'studying': 'Student',
    # Overseas/Abroad
    'overseas': 'Overseas', 'abroad': 'Overseas', 'foreign': 'Overseas',
    'dubai': 'Overseas (UAE)', 'uae': 'Overseas (UAE)', 'saudi': 'Overseas (Saudi)',
    'ksa': 'Overseas (Saudi)', 'saudi arabia': 'Overseas (Saudi)',
    # Agriculture
    'farmer': 'Agriculture', 'farming': 'Agriculture', 'agriculture': 'Agriculture',
    'zamindar': 'Agriculture', 'landlord': 'Agriculture',
    # Property
    'property': 'Property Dealer', 'property dealer': 'Property Dealer',
    'real estate': 'Property Dealer', 'dealer': 'Property Dealer',
    # Shopkeeper
    'shopkeeper': 'Shopkeeper', 'shop': 'Shopkeeper', 'shop keeper': 'Shopkeeper',
    'dukan': 'Shopkeeper', 'dukandar': 'Shopkeeper',
    # Contractor
    'contractor': 'Contractor', 'builder': 'Contractor', 'construction': 'Contractor',
    # Not-occupation values (call dispositions that ended up in occupation column)
    'out of reach': None, 'not interested': None, 'busy': None,
    'switch off': None, 'wrong number': None, 'no answer': None,
    'not reachable': None, 'facebook': None, 'whatsapp': None,
    'call': None, 'sms': None,
}


def clean_occupation(raw):
    """Normalize occupation text."""
    if pd.isna(raw) or str(raw).strip() == '':
        return None
    occ = str(raw).strip().lower()
    # Remove trailing/leading punctuation
    occ = re.sub(r'^[\s,;/\-\.]+|[\s,;/\-\.]+$', '', occ)

    if occ in OCCUPATION_MAP:
        return OCCUPATION_MAP[occ]

    # Partial match
    for key, val in OCCUPATION_MAP.items():
        if key in occ:
            return val

    # Return title-cased original if no match
    return str(raw).strip().title()


# ─── CITY CLEANING ────────────────────────────────────────────────────────────

def clean_city(raw):
    if pd.isna(raw) or str(raw).strip() == '':
        return None
    city = str(raw).strip()
    # Fix known typos
    typos = {
        'faislabad': 'Faisalabad', 'faislaabad': 'Faisalabad',
        'faisalabad': 'Faisalabad', 'fsd': 'Faisalabad',
        'lahore': 'Lahore', 'lhr': 'Lahore',
        'islamabad': 'Islamabad', 'isb': 'Islamabad',
        'rawalpindi': 'Rawalpindi', 'rwp': 'Rawalpindi',
        'karachi': 'Karachi', 'khi': 'Karachi',
        'multan': 'Multan',
    }
    return typos.get(city.lower(), city.title())


# ─── SOURCE CLEANING ─────────────────────────────────────────────────────────

def clean_source(raw):
    if pd.isna(raw) or str(raw).strip() == '':
        return 'Personal'
    src = str(raw).strip().lower()
    if src in ('personal', 'self', 'own'):
        return 'Personal'
    if 'facebook' in src or 'fb' in src:
        return 'Facebook'
    if 'whatsapp' in src or 'wa' in src:
        return 'WhatsApp'
    if 'referr' in src:
        return 'Referral'
    return str(raw).strip().title()


# ─── MAIN PROCESSING ─────────────────────────────────────────────────────────

def read_and_normalize_columns(filepath):
    """Read Excel and normalize column names."""
    df = pd.read_excel(filepath, sheet_name=0)
    # Normalize column names — strip whitespace, semicolons, periods
    col_map = {}
    for c in df.columns:
        clean = re.sub(r'[;\.\s]+$', '', str(c)).strip()
        clean = re.sub(r'\s+', ' ', clean)
        col_map[c] = clean
    df.rename(columns=col_map, inplace=True)
    return df


def process_file(rep_name, config):
    """Process a single Excel file. Returns cleaned DataFrame + stats."""
    print(f"\n{'='*60}")
    print(f"Processing: {rep_name} ({config['rep_id']})")
    print(f"{'='*60}")

    df = read_and_normalize_columns(config['path'])
    raw_count = len(df)
    print(f"  Raw rows: {raw_count}")

    # Identify phone columns
    mobile_col = [c for c in df.columns if 'mobile no' in c.lower()]
    mobile_col = mobile_col[0] if mobile_col else None
    addl_cols = [c for c in df.columns if 'additional mobile' in c.lower()]
    addl_cols = sorted(addl_cols)

    stats = {
        'rep_name': rep_name,
        'rep_id': config['rep_id'],
        'full_name': config['full_name'],
        'title': config['title'],
        'raw_count': raw_count,
        'phone_issues': [],
        'name_issues': [],
        'promoted_phones': 0,
        'invalid_phones': [],
        'international_phones': [],
        'landline_phones': [],
        'cleaned_rows': 0,
        'dropped_no_name': 0,
        'dropped_no_phone': 0,
        'internal_duplicates': 0,
        'occupation_cleaned': 0,
    }

    cleaned_rows = []

    for idx, row in df.iterrows():
        # ── Clean Name ──
        name = clean_name(row.get('Name', None))
        if name is None:
            stats['dropped_no_name'] += 1
            continue

        # ── Clean Primary Mobile ──
        primary_raw = row.get(mobile_col, None) if mobile_col else None
        primary_result = clean_phone(primary_raw)
        primary_canonical, primary_type, primary_valid, primary_original = primary_result

        # ── Clean Additional Mobiles ──
        additional = []
        additional_raw = []
        for ac in addl_cols:
            val = row.get(ac, None)
            result = clean_phone(val)
            if result[2]:  # is_valid
                additional.append(result)
                additional_raw.append(val)

        # ── Promote additional to primary if primary is empty/invalid ──
        if not primary_valid and additional:
            promoted = additional.pop(0)
            primary_canonical, primary_type, primary_valid, primary_original = promoted
            stats['promoted_phones'] += 1

        # ── Track phone issues ──
        if not primary_valid:
            if primary_type != 'empty':
                stats['invalid_phones'].append({
                    'row': idx + 2, 'name': name,
                    'original': primary_original, 'type': primary_type
                })
            stats['dropped_no_phone'] += 1
            # Still include the lead but flag it
            # Actually let's keep it — we'll track stats but include in output
            # with None mobile for the sales team to decide

        if 'international' in primary_type:
            country = primary_type.replace('international_', '')
            stats['international_phones'].append({
                'row': idx + 2, 'name': name,
                'phone': primary_canonical, 'country': country
            })

        if primary_type == 'landline':
            stats['landline_phones'].append({
                'row': idx + 2, 'name': name, 'phone': primary_canonical
            })

        # ── Clean other fields ──
        email = str(row.get('Email', '')).strip() if not pd.isna(row.get('Email', None)) else None
        if email and not re.match(r'^[^@]+@[^@]+\.[^@]+$', email):
            email = None  # Invalid email

        source = clean_source(row.get('Source', None))
        occupation = clean_occupation(row.get('Occupation', None))
        area = str(row.get('Area', '')).strip().title() if not pd.isna(row.get('Area', None)) and str(row.get('Area', '')).strip() else None
        city = clean_city(row.get('City', None))

        # Build additional_mobiles list (canonical numbers only)
        addl_canonicals = [a[0] for a in additional if a[2]]
        # Also track international in additional
        for a in additional:
            if 'international' in a[1]:
                country = a[1].replace('international_', '')
                stats['international_phones'].append({
                    'row': idx + 2, 'name': name,
                    'phone': a[0], 'country': country, 'note': 'additional'
                })

        cleaned_rows.append({
            'name': name,
            'mobile': primary_canonical,
            'mobile_valid': primary_valid,
            'mobile_type': primary_type,
            'additional_mobiles': json.dumps(addl_canonicals) if addl_canonicals else '[]',
            'email': email,
            'source': source,
            'occupation': occupation,
            'area': area,
            'city': city,
            'assigned_rep': config['rep_id'],
            'rep_name': rep_name,
            'original_row': idx + 2,  # Excel row (1-indexed header + 1)
        })

    # Build cleaned DataFrame
    cleaned_df = pd.DataFrame(cleaned_rows)
    stats['after_cleaning'] = len(cleaned_df)

    # ── Internal deduplication analysis (by mobile) ──
    if 'mobile' in cleaned_df.columns:
        valid_mobiles = cleaned_df[cleaned_df['mobile'].notna()]
        dupes = valid_mobiles[valid_mobiles.duplicated(subset='mobile', keep=False)]
        stats['internal_duplicates'] = len(dupes) - len(dupes.drop_duplicates(subset='mobile'))
        stats['internal_dupe_details'] = []
        for mob, group in dupes.groupby('mobile'):
            if len(group) > 1:
                stats['internal_dupe_details'].append({
                    'mobile': mob,
                    'count': len(group),
                    'names': group['name'].tolist()
                })

    stats['cleaned_rows'] = len(cleaned_df)

    # Count occupation changes
    stats['occupation_cleaned'] = len(cleaned_df[cleaned_df['occupation'].notna()])

    print(f"  After cleaning: {stats['after_cleaning']}")
    print(f"  Promoted phones: {stats['promoted_phones']}")
    print(f"  Invalid phones: {len(stats['invalid_phones'])}")
    print(f"  International: {len(stats['international_phones'])}")
    print(f"  Landlines: {len(stats['landline_phones'])}")
    print(f"  Internal duplicates: {stats['internal_duplicates']}")
    print(f"  Dropped (no name): {stats['dropped_no_name']}")

    return cleaned_df, stats


def cross_file_analysis(all_dfs, all_stats):
    """Analyze overlaps across all 4 reps."""
    # Build mobile → rep mapping
    mobile_to_reps = defaultdict(list)
    mobile_to_names = defaultdict(list)

    for rep_name, df in all_dfs.items():
        valid = df[df['mobile'].notna()]
        for _, row in valid.iterrows():
            mobile_to_reps[row['mobile']].append(rep_name)
            mobile_to_names[row['mobile']].append(row['name'])

    # Find overlaps
    overlaps = {}
    for mobile, reps in mobile_to_reps.items():
        if len(reps) > 1:
            overlaps[mobile] = {
                'reps': reps,
                'names': mobile_to_names[mobile]
            }

    # Pairwise overlap matrix
    rep_names = list(all_dfs.keys())
    pairwise = {}
    for i, r1 in enumerate(rep_names):
        for j, r2 in enumerate(rep_names):
            if i < j:
                m1 = set(all_dfs[r1][all_dfs[r1]['mobile'].notna()]['mobile'])
                m2 = set(all_dfs[r2][all_dfs[r2]['mobile'].notna()]['mobile'])
                common = m1 & m2
                pairwise[f"{r1} vs {r2}"] = {
                    'count': len(common),
                    'numbers': list(common)[:20]  # Sample
                }

    # Total unique mobiles
    all_mobiles = set()
    for df in all_dfs.values():
        all_mobiles.update(df[df['mobile'].notna()]['mobile'].tolist())

    return {
        'total_overlapping_numbers': len(overlaps),
        'total_unique_mobiles': len(all_mobiles),
        'pairwise': pairwise,
        'overlap_details': overlaps,
    }


# ─── PDF GENERATION ──────────────────────────────────────────────────────────

def generate_pdf(all_stats, cross_analysis, all_dfs, output_path):
    """Generate a professional PDF report."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch, mm
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        PageBreak, HRFlowable, ListFlowable, ListItem
    )
    from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm,
        topMargin=20*mm, bottomMargin=20*mm
    )

    styles = getSampleStyleSheet()

    # Custom styles
    styles.add(ParagraphStyle(
        'MainTitle', parent=styles['Title'],
        fontSize=22, spaceAfter=6, textColor=colors.HexColor('#1a1a2e')
    ))
    styles.add(ParagraphStyle(
        'Subtitle', parent=styles['Normal'],
        fontSize=11, textColor=colors.HexColor('#666666'), spaceAfter=20
    ))
    styles.add(ParagraphStyle(
        'SectionHead', parent=styles['Heading1'],
        fontSize=15, textColor=colors.HexColor('#16213e'),
        spaceBefore=16, spaceAfter=8,
        borderWidth=0, borderPadding=0,
    ))
    styles.add(ParagraphStyle(
        'SubSection', parent=styles['Heading2'],
        fontSize=12, textColor=colors.HexColor('#0f3460'),
        spaceBefore=12, spaceAfter=6
    ))
    styles.add(ParagraphStyle(
        'BodyText2', parent=styles['Normal'],
        fontSize=9.5, leading=13, spaceAfter=4
    ))
    styles.add(ParagraphStyle(
        'SmallNote', parent=styles['Normal'],
        fontSize=8, textColor=colors.HexColor('#888888'), spaceAfter=2
    ))
    styles.add(ParagraphStyle(
        'QuestionText', parent=styles['Normal'],
        fontSize=10, leading=14, textColor=colors.HexColor('#1a1a2e'),
        spaceBefore=6, spaceAfter=2, leftIndent=10
    ))
    styles.add(ParagraphStyle(
        'OptionText', parent=styles['Normal'],
        fontSize=9, leading=12, textColor=colors.HexColor('#333333'),
        leftIndent=25, spaceAfter=2
    ))
    styles.add(ParagraphStyle(
        'CellText', parent=styles['Normal'],
        fontSize=8.5, leading=11
    ))
    styles.add(ParagraphStyle(
        'CellTextBold', parent=styles['Normal'],
        fontSize=8.5, leading=11, fontName='Helvetica-Bold'
    ))

    elements = []

    # ── COVER / HEADER ──
    elements.append(Paragraph("Orbit CRM - Lead Data Import Analysis", styles['MainTitle']))
    elements.append(Paragraph(
        f"Generated: {datetime.now().strftime('%d %B %Y, %I:%M %p')}&nbsp;&nbsp;|&nbsp;&nbsp;"
        f"Source: 4 Excel files (Sales Team Personal Contacts)&nbsp;&nbsp;|&nbsp;&nbsp;"
        f"Branch: RawLeadsData",
        styles['Subtitle']
    ))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#e0e0e0')))
    elements.append(Spacer(1, 10))

    # ── EXECUTIVE SUMMARY ──
    elements.append(Paragraph("1. Executive Summary", styles['SectionHead']))

    total_raw = sum(s['raw_count'] for s in all_stats.values())
    total_cleaned = sum(s['cleaned_rows'] for s in all_stats.values())
    total_unique = cross_analysis['total_unique_mobiles']
    total_overlaps = cross_analysis['total_overlapping_numbers']
    total_international = sum(len(s['international_phones']) for s in all_stats.values())
    total_landlines = sum(len(s['landline_phones']) for s in all_stats.values())
    total_no_phone = sum(1 for df in all_dfs.values() for _, r in df.iterrows() if not r['mobile_valid'])
    total_promoted = sum(s['promoted_phones'] for s in all_stats.values())
    total_internal_dupes = sum(s['internal_duplicates'] for s in all_stats.values())

    summary_data = [
        [Paragraph('<b>Metric</b>', styles['CellTextBold']), Paragraph('<b>Count</b>', styles['CellTextBold']), Paragraph('<b>Notes</b>', styles['CellTextBold'])],
        ['Total Raw Rows', f'{total_raw:,}', 'Across all 4 Excel files'],
        ['After Name Cleaning', f'{total_cleaned:,}', f'{total_raw - total_cleaned} dropped (no valid name)'],
        ['Unique Mobile Numbers', f'{total_unique:,}', 'After normalization to 03XXXXXXXXX'],
        ['Cross-Rep Overlaps', f'{total_overlaps:,}', 'Same mobile in 2+ reps\' lists'],
        ['Within-Rep Duplicates', f'{total_internal_dupes:,}', 'Same mobile repeated in same file'],
        ['Phone Promoted to Primary', f'{total_promoted:,}', 'Had no primary, used Additional Mobile 1'],
        ['International Numbers', f'{total_international:,}', 'Non-Pakistani numbers detected'],
        ['Landline Numbers', f'{total_landlines:,}', 'Pakistani landlines (not mobile)'],
        ['No Valid Phone', f'{total_no_phone:,}', 'No usable phone after cleaning all columns'],
    ]

    t = Table(summary_data, colWidths=[150, 70, 250])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#16213e')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (1, 0), (1, -1), 'CENTER'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9fa')]),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 16))

    # ── PER-REP BREAKDOWN ──
    elements.append(Paragraph("2. Per-Rep Breakdown", styles['SectionHead']))

    for rep_name, stats in all_stats.items():
        elements.append(Paragraph(f"{rep_name} ({stats['rep_id']})", styles['SubSection']))
        elements.append(Paragraph(f"<i>{stats['full_name']} &mdash; {stats['title']}</i>", styles['SmallNote']))

        rep_data = [
            [Paragraph('<b>Metric</b>', styles['CellTextBold']), Paragraph('<b>Value</b>', styles['CellTextBold'])],
            ['Raw Rows', f"{stats['raw_count']:,}"],
            ['After Cleaning', f"{stats['cleaned_rows']:,}"],
            ['Phone Promoted', f"{stats['promoted_phones']}"],
            ['Invalid Phones', f"{len(stats['invalid_phones'])}"],
            ['International Numbers', f"{len(stats['international_phones'])}"],
            ['Landlines', f"{len(stats['landline_phones'])}"],
            ['Internal Duplicates', f"{stats['internal_duplicates']}"],
            ['Dropped (no name)', f"{stats['dropped_no_name']}"],
        ]
        t = Table(rep_data, colWidths=[160, 80])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0f3460')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f0f4ff')]),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(t)

        # International numbers detail
        if stats['international_phones']:
            elements.append(Spacer(1, 4))
            elements.append(Paragraph(f"<b>International Numbers ({len(stats['international_phones'])}):</b>", styles['BodyText2']))
            intl_data = [['Name', 'Phone', 'Country']]
            for p in stats['international_phones'][:15]:
                intl_data.append([p['name'][:30], p['phone'], p.get('country', 'Unknown')])
            if len(stats['international_phones']) > 15:
                intl_data.append(['...', f"+{len(stats['international_phones'])-15} more", ''])
            ti = Table(intl_data, colWidths=[140, 120, 100])
            ti.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e8d44d')),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#dddddd')),
                ('TOPPADDING', (0, 0), (-1, -1), 2),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ]))
            elements.append(ti)

        # Landline detail
        if stats['landline_phones']:
            elements.append(Spacer(1, 4))
            elements.append(Paragraph(f"<b>Landline Numbers ({len(stats['landline_phones'])}):</b>", styles['BodyText2']))
            ll_data = [['Name', 'Phone']]
            for p in stats['landline_phones'][:10]:
                ll_data.append([p['name'][:30], p['phone']])
            if len(stats['landline_phones']) > 10:
                ll_data.append(['...', f"+{len(stats['landline_phones'])-10} more"])
            tl = Table(ll_data, colWidths=[160, 120])
            tl.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#b8d4e3')),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#dddddd')),
                ('TOPPADDING', (0, 0), (-1, -1), 2),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ]))
            elements.append(tl)

        elements.append(Spacer(1, 10))

    # ── CROSS-REP OVERLAP ANALYSIS ──
    elements.append(PageBreak())
    elements.append(Paragraph("3. Cross-Rep Overlap Analysis", styles['SectionHead']))

    elements.append(Paragraph(
        f"<b>{total_overlaps}</b> mobile numbers appear in more than one rep's list. "
        f"These need a decision on allocation before import.",
        styles['BodyText2']
    ))
    elements.append(Spacer(1, 8))

    # Pairwise matrix
    elements.append(Paragraph("Pairwise Overlap Count:", styles['SubSection']))
    pair_data = [
        [Paragraph('<b>Rep Pair</b>', styles['CellTextBold']),
         Paragraph('<b>Shared Contacts</b>', styles['CellTextBold'])]
    ]
    for pair, info in sorted(cross_analysis['pairwise'].items(), key=lambda x: -x[1]['count']):
        pair_data.append([pair, str(info['count'])])

    tp = Table(pair_data, colWidths=[200, 100])
    tp.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#16213e')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (1, 0), (1, -1), 'CENTER'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#fff3e0')]),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(tp)
    elements.append(Spacer(1, 12))

    # Sample overlapping contacts
    elements.append(Paragraph("Sample Overlapping Contacts (first 25):", styles['SubSection']))
    overlap_data = [['Mobile', 'Name(s)', 'Shared Between']]
    sample_overlaps = list(cross_analysis['overlap_details'].items())[:25]
    for mobile, info in sample_overlaps:
        names = ', '.join(set(info['names']))[:40]
        reps = ', '.join(info['reps'])
        overlap_data.append([mobile, names, reps])

    if len(cross_analysis['overlap_details']) > 25:
        overlap_data.append(['...', f"+{len(cross_analysis['overlap_details'])-25} more", ''])

    to = Table(overlap_data, colWidths=[100, 160, 200])
    to.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e65100')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#fff8e1')]),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(to)

    # ── WITHIN-REP DUPLICATES ──
    elements.append(Spacer(1, 16))
    elements.append(Paragraph("4. Within-Rep Duplicate Analysis", styles['SectionHead']))
    elements.append(Paragraph(
        f"<b>{total_internal_dupes}</b> rows are duplicates within the same rep's file "
        f"(same mobile number appearing multiple times).",
        styles['BodyText2']
    ))

    for rep_name, stats in all_stats.items():
        if stats.get('internal_dupe_details'):
            elements.append(Paragraph(f"<b>{rep_name}</b> &mdash; {stats['internal_duplicates']} duplicate rows:", styles['BodyText2']))
            dd = [['Mobile', 'Count', 'Names']]
            for d in stats['internal_dupe_details'][:10]:
                names = ', '.join(set(d['names']))[:50]
                dd.append([d['mobile'], str(d['count']), names])
            if len(stats['internal_dupe_details']) > 10:
                dd.append(['...', '', f"+{len(stats['internal_dupe_details'])-10} more"])
            td = Table(dd, colWidths=[100, 50, 310])
            td.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#5c6bc0')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
                ('TOPPADDING', (0, 0), (-1, -1), 2),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
                ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ]))
            elements.append(td)
            elements.append(Spacer(1, 6))

    # ── DATA QUALITY NOTES ──
    elements.append(PageBreak())
    elements.append(Paragraph("5. Data Cleaning Applied", styles['SectionHead']))

    cleaning_notes = [
        "<b>Phone Numbers:</b> All normalized to 03XXXXXXXXX format. International codes (92, 0092, +92) stripped. International numbers (UAE, Saudi, etc.) preserved with + prefix.",
        "<b>Primary Phone Promotion:</b> Where primary mobile was blank but Additional Mobile 1 existed, it was promoted to primary.",
        "<b>Name Cleaning:</b> Removed artifacts (\"e-mail\", call dispositions like \"not interested\"), trailing commas/slashes, extra whitespace.",
        "<b>City Normalization:</b> Fixed typos (\"Faislabad\" \u2192 \"Faisalabad\"), standardized casing.",
        "<b>Source Normalization:</b> \"PERSONAL\" / \"Personal\" / blank all standardized to \"Personal\".",
        "<b>Occupation Normalization:</b> Merged variants (Business/Businessman/business), removed call dispositions misplaced in occupation field.",
        "<b>Invalid Numbers:</b> Numbers with &lt;10 or &gt;15 digits flagged as invalid. Concatenated numbers (23-37 digits) had first valid sequence extracted where possible.",
    ]
    for note in cleaning_notes:
        elements.append(Paragraph(f"\u2022 {note}", styles['BodyText2']))
    elements.append(Spacer(1, 4))

    # ── NO-PHONE LEADS ──
    elements.append(Paragraph("6. Leads With No Valid Phone Number", styles['SectionHead']))
    no_phone_total = 0
    for rep_name, df in all_dfs.items():
        no_phone = df[~df['mobile_valid']]
        no_phone_total += len(no_phone)
        if len(no_phone) > 0:
            elements.append(Paragraph(f"<b>{rep_name}:</b> {len(no_phone)} leads with no valid phone", styles['BodyText2']))
            np_data = [['Name', 'Email', 'Occupation', 'City']]
            for _, row in no_phone.head(10).iterrows():
                np_data.append([
                    str(row.get('name', ''))[:30],
                    str(row.get('email', '') or '')[:30],
                    str(row.get('occupation', '') or '')[:20],
                    str(row.get('city', '') or '')[:15],
                ])
            if len(no_phone) > 10:
                np_data.append(['...', f"+{len(no_phone)-10} more", '', ''])
            tn = Table(np_data, colWidths=[140, 140, 100, 80])
            tn.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#c62828')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
                ('TOPPADDING', (0, 0), (-1, -1), 2),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ]))
            elements.append(tn)
            elements.append(Spacer(1, 6))

    # ── QUESTIONS FOR SALES TEAM ──
    elements.append(PageBreak())
    elements.append(Paragraph("7. Decisions Required From Sales Team", styles['SectionHead']))
    elements.append(Paragraph(
        "The following questions need to be answered before we can proceed with the CRM import. "
        "Please discuss with the team and provide your preferences.",
        styles['BodyText2']
    ))
    elements.append(Spacer(1, 8))

    questions = [
        {
            'q': f'Q1. Cross-Rep Duplicate Handling ({total_overlaps} contacts shared between reps)',
            'detail': f'{total_overlaps} mobile numbers appear in multiple reps\' lists. How should these be allocated?',
            'options': [
                'Option A: Keep first occurrence only \u2014 first rep processed gets the lead, duplicates in other files are skipped.',
                'Option B: Import all copies \u2014 each rep gets their own independent lead for the same contact (allows parallel outreach).',
                'Option C: Assign to the rep with the most complete data (more fields filled = gets the lead).',
                'Option D: Flag for manual review \u2014 import all but tag them as "Shared" for management to decide allocation.',
            ]
        },
        {
            'q': f'Q2. Within-File Duplicates ({total_internal_dupes} duplicate rows)',
            'detail': f'{total_internal_dupes} rows are exact mobile duplicates within the same rep\'s file.',
            'options': [
                'Option A (Recommended): Deduplicate by mobile \u2014 keep only the first occurrence per phone number.',
                'Option B: Keep all rows as-is (will create duplicate leads for the same contact).',
            ]
        },
        {
            'q': f'Q3. Leads With No Phone Number ({no_phone_total} contacts)',
            'detail': f'{no_phone_total} leads have no valid phone number (not even in additional mobile columns).',
            'options': [
                'Option A (Recommended): Skip them \u2014 only import leads with at least one valid phone number.',
                'Option B: Import them anyway \u2014 they\'ll have name/occupation/city only, no phone to call.',
            ]
        },
        {
            'q': f'Q4. International Numbers ({total_international} contacts)',
            'detail': f'{total_international} contacts have international (non-Pakistani) phone numbers (UAE, Saudi, UK, etc.).',
            'options': [
                'Option A: Import with country tag \u2014 import all international numbers, tagged with their country for easy filtering.',
                'Option B: Separate list \u2014 import domestic only, provide a separate list of international leads for targeted outreach.',
                'Option C: Skip international \u2014 only import Pakistani mobile numbers.',
            ]
        },
        {
            'q': f'Q5. Landline Numbers ({total_landlines} contacts)',
            'detail': f'{total_landlines} contacts have landline numbers instead of mobile numbers.',
            'options': [
                'Option A: Import as-is \u2014 landlines are valid contact numbers.',
                'Option B: Flag them \u2014 import but mark as "Landline" for different outreach strategy.',
                'Option C: Skip \u2014 only import mobile numbers.',
            ]
        },
        {
            'q': 'Q6. Lead Status on Import',
            'detail': 'All contacts are raw personal contacts with no pipeline history. What initial status should they get?',
            'options': [
                'Option A (Recommended): All as "New" \u2014 fresh leads entering the pipeline from scratch.',
                'Option B: All as "Contacted" \u2014 since these are personal contacts, the reps presumably know them already.',
            ]
        },
        {
            'q': 'Q7. Occupation Data Standardization',
            'detail': 'Occupation data is messy (e.g., "Business", "business", "Businessman", "Bussiness" are all separate entries). Some fields contain call dispositions instead of occupations.',
            'options': [
                'Option A (Recommended): Standardize \u2014 normalize casing, fix typos, merge obvious variants.',
                'Option B: Import raw \u2014 keep exactly as typed in the Excel files.',
            ]
        },
    ]

    for q in questions:
        elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#e0e0e0')))
        elements.append(Spacer(1, 4))
        elements.append(Paragraph(f"<b>{q['q']}</b>", styles['QuestionText']))
        elements.append(Paragraph(q['detail'], styles['SmallNote']))
        elements.append(Spacer(1, 2))
        for opt in q['options']:
            bullet = "\u25cb"  # Empty circle for checkbox feel
            elements.append(Paragraph(f"{bullet} {opt}", styles['OptionText']))
        elements.append(Spacer(1, 6))

    # ── NOTES SECTION ──
    elements.append(Spacer(1, 16))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#16213e')))
    elements.append(Spacer(1, 8))
    elements.append(Paragraph("Notes / Additional Feedback:", styles['SubSection']))
    # Add blank lines for writing
    for _ in range(6):
        elements.append(Paragraph("_" * 90, styles['SmallNote']))
        elements.append(Spacer(1, 8))

    elements.append(Spacer(1, 20))
    elements.append(Paragraph(
        "<i>Report generated by Orbit CRM Data Import Pipeline. "
        "Please return this document with your selections marked.</i>",
        styles['SmallNote']
    ))

    doc.build(elements)
    print(f"\nPDF generated: {output_path}")


# ─── MAIN ─────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    all_dfs = {}
    all_stats = {}

    for rep_name, config in FILES.items():
        df, stats = process_file(rep_name, config)
        all_dfs[rep_name] = df
        all_stats[rep_name] = stats

    print(f"\n{'='*60}")
    print("Cross-File Analysis")
    print(f"{'='*60}")
    cross = cross_file_analysis(all_dfs, all_stats)
    print(f"  Total unique mobiles: {cross['total_unique_mobiles']:,}")
    print(f"  Cross-rep overlaps: {cross['total_overlapping_numbers']:,}")
    for pair, info in cross['pairwise'].items():
        print(f"    {pair}: {info['count']} shared")

    # Generate PDF
    pdf_path = os.path.join(OUTPUT_DIR, "Lead_Import_Analysis_Report.pdf")
    generate_pdf(all_stats, cross, all_dfs, pdf_path)

    # Also save cleaned data as Excel for reference
    for rep_name, df in all_dfs.items():
        safe_name = rep_name.replace(' ', '_')
        excel_path = os.path.join(OUTPUT_DIR, f"Cleaned_{safe_name}.xlsx")
        df.to_excel(excel_path, index=False)
        print(f"Cleaned data saved: {excel_path}")

    # Save summary JSON
    summary = {
        'generated_at': datetime.now().isoformat(),
        'total_raw': sum(s['raw_count'] for s in all_stats.values()),
        'total_cleaned': sum(s['cleaned_rows'] for s in all_stats.values()),
        'total_unique_mobiles': cross['total_unique_mobiles'],
        'cross_rep_overlaps': cross['total_overlapping_numbers'],
        'per_rep': {name: {
            'raw': s['raw_count'],
            'cleaned': s['cleaned_rows'],
            'promoted_phones': s['promoted_phones'],
            'invalid_phones': len(s['invalid_phones']),
            'international': len(s['international_phones']),
            'landlines': len(s['landline_phones']),
            'internal_dupes': s['internal_duplicates'],
        } for name, s in all_stats.items()},
        'pairwise_overlaps': {k: v['count'] for k, v in cross['pairwise'].items()},
    }
    json_path = os.path.join(OUTPUT_DIR, "analysis_summary.json")
    with open(json_path, 'w') as f:
        json.dump(summary, f, indent=2)
    print(f"Summary JSON saved: {json_path}")

    print(f"\n{'='*60}")
    print(f"DONE. All output in: {OUTPUT_DIR}")
    print(f"PDF Report: {pdf_path}")
    print(f"{'='*60}")
