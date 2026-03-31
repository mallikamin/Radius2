# -*- coding: utf-8 -*-
"""
New Leads Import - 31 March 2026
Single rep upload: Syed Ali Zaib Zaidi (REP-0018)
Processes raw leads with production deduplication
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')

import openpyxl
import json
import re
import uuid
from collections import Counter, defaultdict
from datetime import datetime

# ─── CONFIG ───────────────────────────────────────────────────────────────────
REP_ID = 'REP-0018'
REP_NAME = 'Syed Ali Zaib Zaidi'
REP_UUID = 'd8d0b91f-9753-4c86-8149-30ebf312ad21'
INPUT_FILE = 'C:/Users/Malik/Downloads/new leads data.xlsx'
OUTPUT_SQL = 'C:/Users/Malik/desktop/radius2-analytics/database/new_leads_31mar_migration.sql'
OUTPUT_ANALYSIS = 'C:/Users/Malik/desktop/radius2-analytics/data_analysis/new_leads_31mar_analysis.json'

# Starting lead_id (production latest is LEAD-09649)
STARTING_LEAD_NUMBER = 9650

# Junk occupation values to clean
JUNK_OCCUPATIONS = {
    'nathing': '', 'nothing': '', 'n/a': '', 'na': '', 'nil': '',
    'faisalabad': '', 'faislabad': '', 'lahore': '',
    'wapda city faisalabad': '', 'ibrahim': '',
    'out of reach': '', 'no answer': '', 'not interested': '',
    'wrong number': '', 'switched off': '',
}

# Specific mobile fixes
MOBILE_FIXES = {'9710508285799': '971508285799'}

# ─── MOBILE NORMALIZATION ─────────────────────────────────────────────────────
def normalize_mobile(raw_value):
    """Normalize a mobile number (first number only). Returns (normalized, is_standard_pk)"""
    if raw_value is None:
        return None, False

    # Convert numeric to string
    val = str(raw_value)

    # Handle scientific notation from Excel (e.g., 9.72E+11)
    if 'E+' in val or 'e+' in val:
        try:
            val = str(int(float(val)))
        except (ValueError, OverflowError):
            return val, False

    # Remove .0 suffix from float conversion
    if val.endswith('.0'):
        val = val[:-2]

    # Clean unicode, prefixes, emails
    val = _clean_mobile_str(val)
    if val is None:
        return None, False

    # SPLIT multi-number cells BEFORE stripping delimiters
    # Common separators: " - ", " / ", " & ", "/", ","
    for sep in [' - ', ' / ', ' & ', '/', ',']:
        if sep in val:
            val = val.split(sep)[0]  # Take first number

    # Strip whitespace, dashes, dots, parens, plus sign, Unicode invisible chars
    val = re.sub(r'[\s\-\.\(\)\+\u200e\u200f\u200b\u202a-\u202e\ufeff\u2066-\u2069]', '', val)

    # Apply specific fixes
    if val in MOBILE_FIXES:
        val = MOBILE_FIXES[val]

    # Skip empty/zero
    if not val or val == '0' or val == 'None':
        return None, False

    # Skip non-numeric (text/names/garbage in mobile field)
    if not val.isdigit():
        return None, False

    # Pakistani number normalization
    # 920XXXXXXXXXX (13 digits, starts with 920) → 0XXXXXXXXXX
    if len(val) == 13 and val.startswith('920'):
        val = '0' + val[3:]
    # 92XXXXXXXXXX (12 digits, starts with 92) → 0XXXXXXXXXX
    elif len(val) == 12 and val.startswith('92'):
        val = '0' + val[2:]
    # 3XXXXXXXXX (10 digits, starts with 3) → 03XXXXXXXXX
    elif len(val) == 10 and val[0] == '3':
        val = '0' + val
    # 03XXXXXXXXX (11 digits, starts with 03) → already standard
    elif len(val) == 11 and val.startswith('03'):
        pass  # Already standard Pakistani format

    # Safety: truncate to 20 chars max (varchar(20) in DB)
    if len(val) > 20:
        val = val[:20]

    is_pk = len(val) == 11 and val.startswith('03')
    return val, is_pk


def normalize_mobile_multi(raw_value):
    """Parse a raw mobile value that may contain multiple numbers.
    Returns list of (normalized, is_standard_pk) tuples."""
    if raw_value is None:
        return []
    val = str(raw_value)
    if 'E+' in val or 'e+' in val:
        try:
            val = str(int(float(val)))
        except (ValueError, OverflowError):
            pass
    if val.endswith('.0'):
        val = val[:-2]
    # Clean unicode, prefixes, emails
    val = _clean_mobile_str(val)
    if val is None:
        return []
    # Split on common separators
    parts = re.split(r'\s*[-/&,]\s*', val)
    results = []
    for part in parts:
        part = re.sub(r'[\s\.\(\)\+\u200e\u200f\u200b\u202a-\u202e\ufeff\u2066-\u2069]', '', part)
        if not part or part == '0' or part == 'None' or not part.isdigit():
            continue
        # Apply specific fixes
        if part in MOBILE_FIXES:
            part = MOBILE_FIXES[part]
        # Pakistani normalization
        if len(part) == 13 and part.startswith('920'):
            part = '0' + part[3:]
        elif len(part) == 12 and part.startswith('92'):
            part = '0' + part[2:]
        elif len(part) == 10 and part[0] == '3':
            part = '0' + part
        if len(part) > 20:
            part = part[:20]
        is_pk = len(part) == 11 and part.startswith('03')
        results.append((part, is_pk))
    return results


def _clean_mobile_str(val):
    """Common mobile string cleaning steps."""
    # Strip Unicode invisible chars (LTR/RTL marks, zero-width spaces, etc.)
    val = re.sub(r'[\u200e\u200f\u200b\u200c\u200d\u202a\u202b\u202c\u202d\u202e\ufeff\u2066\u2067\u2068\u2069]', '', val)
    # Strip surrounding double quotes
    val = val.strip('"').strip('"').strip('"')
    # Strip p: prefix (phonebook notation)
    if val.lower().startswith('p:'):
        val = val[2:]
    # Skip if contains @ (email) or all-alpha (name/text)
    if '@' in val or (val.isalpha() and len(val) > 2):
        return None
    return val


def is_junk_name(name):
    """Check if a name is junk/missing"""
    if not name:
        return True
    n = str(name).strip().lower()
    return n in ('', 'none', 'not mentioned', 'not mentionedd', 'n/a', 'na',
                 'nil', 'unknown', 'test', '-', '--', '---')


def clean_occupation(occ):
    """Clean occupation field"""
    if not occ:
        return ''
    occ = str(occ).strip()
    if occ.lower() in JUNK_OCCUPATIONS:
        return JUNK_OCCUPATIONS[occ.lower()]
    return occ


def sql_escape(val):
    """Escape a string for SQL insertion"""
    if val is None or val == '':
        return 'NULL'
    s = str(val).replace("'", "''")
    return f"'{s}'"


# ─── STEP 1: Parse Excel file ─────────────────────────────────────────────────
print("=" * 80)
print("NEW LEADS IMPORT - 31 MARCH 2026")
print("=" * 80)
print(f"Rep: {REP_NAME} ({REP_ID})")
print(f"File: {INPUT_FILE}")
print()

wb = openpyxl.load_workbook(INPUT_FILE, read_only=True, data_only=True)
ws = wb.active
rows = list(ws.iter_rows(values_only=True))
wb.close()

if not rows:
    print("ERROR: Empty file!")
    sys.exit(1)

header = rows[0]
data_rows = rows[1:]

print(f"Total rows in file: {len(rows)} (1 header + {len(data_rows)} data)")
print(f"Header: {header}")
print()

# ─── Map columns ──────────────────────────────────────────────────────────────
def find_col(patterns):
    for i, h in enumerate(header):
        if h is None:
            continue
        h_str = str(h).strip().lower().rstrip(';').rstrip('.')
        for p in patterns:
            if p in h_str:
                return i
    return None

col_map = {
    'sr_no': find_col(['sr', 'sr.', 'sr no']),
    'name': find_col(['name']),
    'mobile': find_col(['mobile no']),
    'add_mobile_1': find_col(['additional mobile 1']),
    'add_mobile_2': find_col(['additional mobile 2']),
    'add_mobile_3': find_col(['additional mobile 3']),
    'add_mobile_4': find_col(['additional mobile 4']),
    'email': find_col(['email']),
    'source': find_col(['source']),
    'occupation': find_col(['occupation']),
    'area': find_col(['area']),
    'city': find_col(['city']),
}

print("Column mapping:")
for field, idx in col_map.items():
    print(f"  {field}: col {idx}")
print()

# ─── STEP 2: Parse and clean leads ────────────────────────────────────────────
print("=" * 80)
print("STEP 1: Parsing and cleaning leads")
print("=" * 80)

leads = []
skipped_no_mobile = 0
skipped_junk_name = 0
skipped_invalid_mobile = 0
weird_mobiles = []
name_issues = []

for row_idx, row in enumerate(data_rows, start=2):
    # Skip empty rows
    if all(v is None for v in row):
        continue

    # Get fields
    def get(field):
        idx = col_map.get(field)
        if idx is not None and idx < len(row):
            return row[idx]
        return None

    # Primary mobile
    raw_mobile = get('mobile')
    mobile, is_pk = normalize_mobile(raw_mobile)

    if mobile is None:
        skipped_no_mobile += 1
        continue

    if not mobile.isdigit():
        skipped_invalid_mobile += 1
        weird_mobiles.append({
            'row': row_idx,
            'raw': raw_mobile,
            'normalized': mobile,
        })
        continue

    # Name
    raw_name = get('name')
    name = str(raw_name).strip() if raw_name is not None else None

    if is_junk_name(name):
        skipped_junk_name += 1
        name_issues.append({
            'row': row_idx,
            'name': raw_name,
            'mobile': mobile,
        })
        continue

    # Additional mobiles
    addl_mobiles = []
    for field in ['add_mobile_1', 'add_mobile_2', 'add_mobile_3', 'add_mobile_4']:
        raw = get(field)
        if raw:
            parsed = normalize_mobile_multi(raw)
            for addl_m, _ in parsed:
                if addl_m and addl_m != mobile and addl_m not in addl_mobiles:
                    addl_mobiles.append(addl_m)

    # Other fields
    email = str(get('email')).strip() if get('email') else ''
    if email.lower() in ('none', 'nan', ''):
        email = ''

    source = str(get('source')).strip() if get('source') else 'Personal'
    if source.lower() in ('none', 'nan', ''):
        source = 'Personal'

    occupation = clean_occupation(get('occupation'))
    area = str(get('area')).strip() if get('area') else ''
    if area.lower() in ('none', 'nan', ''):
        area = ''

    city = str(get('city')).strip() if get('city') else ''
    if city.lower() in ('none', 'nan', ''):
        city = ''

    leads.append({
        'row': row_idx,
        'name': name,
        'mobile': mobile,
        'is_pk': is_pk,
        'additional_mobiles': addl_mobiles,
        'email': email,
        'source': source,
        'occupation': occupation,
        'area': area,
        'city': city,
    })

print(f"Parsed {len(data_rows)} rows:")
print(f"  Valid leads: {len(leads)}")
print(f"  Skipped (no mobile): {skipped_no_mobile}")
print(f"  Skipped (junk name): {skipped_junk_name}")
print(f"  Skipped (invalid mobile): {skipped_invalid_mobile}")
print()

# ─── STEP 3: Internal deduplication ───────────────────────────────────────────
print("=" * 80)
print("STEP 2: Internal deduplication")
print("=" * 80)

before_count = len(leads)
seen = set()
deduped = []
internal_dups = defaultdict(list)

for lead in leads:
    if lead['mobile'] in seen:
        internal_dups[lead['mobile']].append(lead['row'])
    else:
        seen.add(lead['mobile'])
        deduped.append(lead)

leads = deduped
print(f"Leads: {before_count} → {len(leads)} (removed {before_count - len(leads)} internal duplicates)")
if internal_dups:
    print(f"Internal duplicate mobiles: {len(internal_dups)}")
    for mob, rows in list(internal_dups.items())[:10]:
        print(f"  {mob}: rows {rows}")
    if len(internal_dups) > 10:
        print(f"  ... and {len(internal_dups) - 10} more")
print()

# ─── STEP 4: Get production mobiles ───────────────────────────────────────────
print("=" * 80)
print("STEP 3: Checking against production database")
print("=" * 80)
print("Fetching existing mobiles from production...")

# We'll create a separate script to fetch production mobiles via SSH
# For now, we'll prepare the SQL to do this check

print(f"Total leads to check: {len(leads)}")
print()

# ─── STEP 5: Mobile distribution ──────────────────────────────────────────────
pk_count = sum(1 for l in leads if l['is_pk'])
intl_count = len(leads) - pk_count
with_addl = sum(1 for l in leads if l['additional_mobiles'])
with_email = sum(1 for l in leads if l['email'])
with_occ = sum(1 for l in leads if l['occupation'])
with_area = sum(1 for l in leads if l['area'])
with_city = sum(1 for l in leads if l['city'])

print("=" * 80)
print("LEAD STATISTICS")
print("=" * 80)
print(f"Total leads after cleaning: {len(leads)}")
print(f"Pakistani mobiles (03XXXXXXXXX): {pk_count}")
print(f"International mobiles: {intl_count}")
print(f"With additional mobiles: {with_addl}")
print(f"With email: {with_email}")
print(f"With occupation: {with_occ}")
print(f"With area: {with_area}")
print(f"With city: {with_city}")
print()

# ─── Export mobiles for production check ──────────────────────────────────────
mobiles_list = [l['mobile'] for l in leads]
mobiles_file = 'C:/Users/Malik/desktop/radius2-analytics/data_analysis/new_leads_mobiles.txt'
with open(mobiles_file, 'w') as f:
    f.write('\n'.join(mobiles_list))

print(f"Exported {len(mobiles_list)} mobiles to: {mobiles_file}")
print("Use this to check against production DB for duplicates.")
print()

# ─── Save analysis JSON ───────────────────────────────────────────────────────
analysis = {
    'generated_at': datetime.now().isoformat(),
    'rep_id': REP_ID,
    'rep_name': REP_NAME,
    'input_file': INPUT_FILE,
    'total_rows': len(data_rows),
    'valid_leads': len(leads),
    'skipped': {
        'no_mobile': skipped_no_mobile,
        'junk_name': skipped_junk_name,
        'invalid_mobile': skipped_invalid_mobile,
    },
    'internal_duplicates': {
        'count': len(internal_dups),
        'details': {mob: rows for mob, rows in internal_dups.items()},
    },
    'statistics': {
        'pakistani_mobiles': pk_count,
        'international_mobiles': intl_count,
        'with_additional_mobiles': with_addl,
        'with_email': with_email,
        'with_occupation': with_occ,
        'with_area': with_area,
        'with_city': with_city,
    },
    'weird_mobiles': weird_mobiles[:30],
    'name_issues': name_issues[:30],
    'mobiles_export_file': mobiles_file,
}

with open(OUTPUT_ANALYSIS, 'w', encoding='utf-8') as f:
    json.dump(analysis, f, indent=2, ensure_ascii=False)

print(f"Analysis JSON saved to: {OUTPUT_ANALYSIS}")
print()

# ─── Generate helper SQL for production check ─────────────────────────────────
print("=" * 80)
print("PRODUCTION DUPLICATE CHECK")
print("=" * 80)
print("Run this SQL on production to find duplicate mobiles:")
print()
print("-- Create temp table with new mobiles")
print("CREATE TEMP TABLE new_mobiles (mobile VARCHAR(20));")
print("-- Insert mobiles (copy from new_leads_mobiles.txt)")
for i in range(0, min(5, len(mobiles_list))):
    print(f"INSERT INTO new_mobiles VALUES ('{mobiles_list[i]}');")
print("-- ... (insert all mobiles)")
print()
print("-- Find duplicates")
print("SELECT l.lead_id, l.name, l.mobile, cr.rep_id, cr.name as rep_name")
print("FROM leads l")
print("JOIN company_reps cr ON l.assigned_rep_id = cr.id")
print("WHERE l.mobile IN (SELECT mobile FROM new_mobiles);")
print()

print("=" * 80)
print("NEXT STEPS:")
print("=" * 80)
print("1. Check production for duplicate mobiles using the SQL above")
print("2. Remove duplicates from the leads list")
print("3. Run build_migration_sql.py to generate final SQL")
print()
print(f"Total leads ready for potential upload: {len(leads)}")
print(f"New lead IDs will start from: LEAD-{STARTING_LEAD_NUMBER:05d}")
print()
