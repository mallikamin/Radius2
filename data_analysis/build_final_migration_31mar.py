# -*- coding: utf-8 -*-
"""
Build final SQL migration for new leads (31 March 2026)
Filters out production duplicates and generates staging + production SQL
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')

import json
from datetime import datetime

# ─── CONFIG ───────────────────────────────────────────────────────────────────
REP_ID = 'REP-0018'
REP_NAME = 'Syed Ali Zaib Zaidi'
REP_UUID = 'd8d0b91f-9753-4c86-8149-30ebf312ad21'

STARTING_LEAD_NUMBER = 9650  # Production latest is LEAD-09649

OUTPUT_SQL_STAGING = 'C:/Users/Malik/desktop/radius2-analytics/database/new_leads_31mar_STAGING.sql'
OUTPUT_SQL_PRODUCTION = 'C:/Users/Malik/desktop/radius2-analytics/database/new_leads_31mar_PRODUCTION.sql'
OUTPUT_SUMMARY = 'C:/Users/Malik/desktop/radius2-analytics/data_analysis/migration_summary_31mar.json'

# ─── Load data ────────────────────────────────────────────────────────────────
print("=" * 80)
print("FINAL MIGRATION BUILDER - 31 MARCH 2026")
print("=" * 80)
print()

# Load analysis
with open('C:/Users/Malik/desktop/radius2-analytics/data_analysis/new_leads_31mar_analysis.json', 'r', encoding='utf-8') as f:
    analysis = json.load(f)

# Load duplicate mobiles
try:
    with open('C:/Users/Malik/desktop/radius2-analytics/data_analysis/duplicate_mobiles.txt', 'r') as f:
        duplicate_mobiles = set(line.strip() for line in f)
    print(f"Loaded {len(duplicate_mobiles)} duplicate mobiles to exclude")
except FileNotFoundError:
    duplicate_mobiles = set()
    print("No duplicate mobiles file found - will upload all leads")

print()

# Load all leads from previous analysis (we need to re-parse with full data)
# For simplicity, we'll load from the Excel file again
import openpyxl
import re

def normalize_mobile(raw_value):
    """Quick mobile normalization"""
    if raw_value is None:
        return None
    val = str(raw_value)
    if 'E+' in val or 'e+' in val:
        try:
            val = str(int(float(val)))
        except:
            return None
    if val.endswith('.0'):
        val = val[:-2]
    # Clean
    val = re.sub(r'[\s\-\.\(\)\+\u200e\u200f\u200b\u202a-\u202e\ufeff\u2066-\u2069]', '', val)
    if not val or not val.isdigit():
        return None
    # Pakistani normalization
    if len(val) == 13 and val.startswith('920'):
        val = '0' + val[3:]
    elif len(val) == 12 and val.startswith('92'):
        val = '0' + val[2:]
    elif len(val) == 10 and val[0] == '3':
        val = '0' + val
    if len(val) > 20:
        val = val[:20]
    return val

def is_junk_name(name):
    if not name:
        return True
    n = str(name).strip().lower()
    return n in ('', 'none', 'not mentioned', 'n/a', 'na', 'nil', 'unknown', '-')

def sql_escape(val):
    if val is None or val == '':
        return 'NULL'
    s = str(val).replace("'", "''")
    return f"'{s}'"

# Parse Excel
INPUT_FILE = 'C:/Users/Malik/Downloads/new leads data.xlsx'
wb = openpyxl.load_workbook(INPUT_FILE, read_only=True, data_only=True)
ws = wb.active
rows = list(ws.iter_rows(values_only=True))
wb.close()

header = rows[0]
data_rows = rows[1:]

# Column indices
mobile_idx = 2
name_idx = 1
email_idx = 7
source_idx = 8
occupation_idx = 9
area_idx = 10
city_idx = 11

# Parse leads
all_leads = []
seen_mobiles = set()

for row_idx, row in enumerate(data_rows, start=2):
    if all(v is None for v in row):
        continue

    mobile = normalize_mobile(row[mobile_idx] if mobile_idx < len(row) else None)
    if not mobile:
        continue

    # Skip internal duplicates (keep first)
    if mobile in seen_mobiles:
        continue
    seen_mobiles.add(mobile)

    name = str(row[name_idx]).strip() if name_idx < len(row) and row[name_idx] else None
    if is_junk_name(name):
        continue

    # Skip production duplicates
    if mobile in duplicate_mobiles:
        continue

    email = str(row[email_idx]).strip() if email_idx < len(row) and row[email_idx] else ''
    source = str(row[source_idx]).strip() if source_idx < len(row) and row[source_idx] else 'Personal'
    occupation = str(row[occupation_idx]).strip() if occupation_idx < len(row) and row[occupation_idx] else ''
    area = str(row[area_idx]).strip() if area_idx < len(row) and row[area_idx] else ''
    city = str(row[city_idx]).strip() if city_idx < len(row) and row[city_idx] else ''

    # Clean
    if email.lower() in ('none', 'nan', ''):
        email = ''
    if source.lower() in ('none', 'nan', ''):
        source = 'Personal'
    if occupation.lower() in ('none', 'nan', ''):
        occupation = ''
    if area.lower() in ('none', 'nan', ''):
        area = ''
    if city.lower() in ('none', 'nan', ''):
        city = ''

    all_leads.append({
        'row': row_idx,
        'name': name,
        'mobile': mobile,
        'email': email,
        'source': source,
        'occupation': occupation,
        'area': area,
        'city': city,
    })

print(f"Leads after filtering:")
print(f"  Total parsed: {len(data_rows)}")
print(f"  After internal dedup: {len(seen_mobiles)}")
print(f"  After production dedup: {len(all_leads)}")
print()

# ─── Generate SQL ─────────────────────────────────────────────────────────────
def generate_sql(leads, starting_number, target_env):
    """Generate SQL migration"""
    sql_lines = []
    sql_lines.append("-- ============================================================")
    sql_lines.append(f"-- New Leads Migration - 31 March 2026 ({target_env})")
    sql_lines.append(f"-- Rep: {REP_NAME} ({REP_ID})")
    sql_lines.append(f"-- Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    sql_lines.append(f"-- Total leads: {len(leads)}")
    sql_lines.append("-- ============================================================")
    sql_lines.append("")
    sql_lines.append("BEGIN;")
    sql_lines.append("")

    lead_counter = starting_number

    for lead in leads:
        lead_id = f"LEAD-{lead_counter:05d}"
        lead_counter += 1

        name_esc = sql_escape(lead['name'])
        mobile_esc = sql_escape(lead['mobile'])
        email_esc = sql_escape(lead['email']) if lead['email'] else 'NULL'
        source_esc = sql_escape(lead.get('source', 'Personal') or 'Personal')
        occ_esc = sql_escape(lead['occupation']) if lead['occupation'] else 'NULL'
        area_esc = sql_escape(lead['area']) if lead['area'] else 'NULL'
        city_esc = sql_escape(lead['city']) if lead['city'] else 'NULL'

        sql_lines.append(
            f"INSERT INTO leads (id, lead_id, name, mobile, email, source, occupation, "
            f"area, city, assigned_rep_id, status, pipeline_stage, lead_type, "
            f"additional_mobiles, country_code, metadata, created_at, updated_at) "
            f"VALUES ("
            f"uuid_generate_v4(), '{lead_id}', {name_esc}, {mobile_esc}, {email_esc}, "
            f"{source_esc}, {occ_esc}, {area_esc}, {city_esc}, "
            f"'{REP_UUID}', 'new', 'New', 'prospect', "
            f"'[]'::jsonb, '+92', '{{}}', NOW(), NOW());"
        )

    sql_lines.append("")
    sql_lines.append("-- ── Verification Queries ──")
    sql_lines.append("")
    sql_lines.append("-- Check total leads")
    sql_lines.append("SELECT COUNT(*) as total_leads FROM leads;")
    sql_lines.append("")
    sql_lines.append("-- Check for duplicate mobiles")
    sql_lines.append("SELECT mobile, COUNT(*) as cnt FROM leads")
    sql_lines.append("WHERE mobile IS NOT NULL AND mobile != ''")
    sql_lines.append("GROUP BY mobile HAVING COUNT(*) > 1;")
    sql_lines.append("")
    sql_lines.append("-- Check REP-0018 lead count")
    sql_lines.append(f"SELECT COUNT(*) FROM leads WHERE assigned_rep_id = '{REP_UUID}';")
    sql_lines.append("")
    sql_lines.append("COMMIT;")

    return '\n'.join(sql_lines), lead_counter - 1

# Generate staging SQL (test on local DB first)
staging_sql, last_staging_id = generate_sql(all_leads, STARTING_LEAD_NUMBER, "STAGING")
with open(OUTPUT_SQL_STAGING, 'w', encoding='utf-8') as f:
    f.write(staging_sql)

print(f"✓ Staging SQL generated: {OUTPUT_SQL_STAGING}")
print(f"  Lead IDs: LEAD-{STARTING_LEAD_NUMBER:05d} → LEAD-{last_staging_id:05d}")
print()

# Generate production SQL (same content, for deployment)
prod_sql, last_prod_id = generate_sql(all_leads, STARTING_LEAD_NUMBER, "PRODUCTION")
with open(OUTPUT_SQL_PRODUCTION, 'w', encoding='utf-8') as f:
    f.write(prod_sql)

print(f"✓ Production SQL generated: {OUTPUT_SQL_PRODUCTION}")
print(f"  Lead IDs: LEAD-{STARTING_LEAD_NUMBER:05d} → LEAD-{last_prod_id:05d}")
print()

# ─── Summary ──────────────────────────────────────────────────────────────────
summary = {
    'generated_at': datetime.now().isoformat(),
    'rep_id': REP_ID,
    'rep_name': REP_NAME,
    'rep_uuid': REP_UUID,
    'input_file': INPUT_FILE,
    'total_raw_rows': len(data_rows),
    'internal_duplicates_removed': len(seen_mobiles) - len(all_leads),
    'production_duplicates_removed': len(duplicate_mobiles),
    'final_leads_to_upload': len(all_leads),
    'lead_id_range': f'LEAD-{STARTING_LEAD_NUMBER:05d} to LEAD-{last_prod_id:05d}',
    'sql_files': {
        'staging': OUTPUT_SQL_STAGING,
        'production': OUTPUT_SQL_PRODUCTION,
    },
    'deployment_steps': [
        '1. Test on local/staging DB first',
        '2. Verify counts and no duplicates',
        '3. Deploy to DigitalOcean production',
        '4. Re-verify on production',
    ],
}

with open(OUTPUT_SUMMARY, 'w', encoding='utf-8') as f:
    json.dump(summary, f, indent=2, ensure_ascii=False)

print(f"✓ Migration summary saved: {OUTPUT_SUMMARY}")
print()

print("=" * 80)
print("MIGRATION READY")
print("=" * 80)
print(f"Total leads to upload: {len(all_leads)}")
print(f"Production duplicates excluded: {len(duplicate_mobiles)}")
print(f"New lead IDs: LEAD-{STARTING_LEAD_NUMBER:05d} → LEAD-{last_prod_id:05d}")
print()
print("Next steps:")
print("  1. Test staging SQL on local DB")
print("  2. Verify counts")
print("  3. Deploy production SQL to DigitalOcean")
print()
