# New Leads Upload - 31 March 2026

## Summary

**Rep:** Syed Ali Zaib Zaidi (REP-0018)
**Source File:** `C:\Users\Malik\Downloads\new leads data.xlsx`
**Upload Date:** 31 March 2026

## Data Processing

### Raw Data
- **Total rows:** 498 (+ 1 header)
- **Columns:** Sr. No., Name, Mobile No., Additional Mobile 1-4, Email, Source, Occupation, Area, City

### Data Cleaning
| Step | Count | Removed |
|------|-------|---------|
| Raw data rows | 498 | - |
| After no-mobile filter | 498 | 0 |
| After junk-name filter | 498 | 0 |
| After internal deduplication | 497 | 1 |
| **After production deduplication** | **460** | **37** |

### Production Duplicates (37 leads)
Found 37 mobiles that already exist in production:
- 10 duplicates already assigned to REP-0018 (same rep)
- 13 duplicates assigned to REP-0017 (Syed Naeem Abbass Zaidi)
- 2 duplicates assigned to REP-0016 (Samia Rashid)
- 12 duplicates assigned to REP-0019 (Iram Aslam)

**Decision:** Skip all 37 duplicates. Only upload 460 truly new leads.

### Lead Statistics
- **Total new leads:** 460
- **Pakistani mobiles (03XXXXXXXXX):** 459
- **International mobiles:** 1
- **With city data:** 460 (100%)
- **With email:** 0
- **With occupation:** 0
- **With area:** 0

## Generated Files

### Analysis Files
- `data_analysis/process_new_leads_31mar.py` - Initial analysis script
- `data_analysis/check_production_duplicates.py` - Production duplicate checker
- `data_analysis/build_final_migration_31mar.py` - Final SQL generator
- `data_analysis/new_leads_31mar_analysis.json` - Analysis summary
- `data_analysis/new_leads_mobiles.txt` - All 497 mobiles (for checking)
- `data_analysis/duplicate_mobiles.txt` - 37 duplicate mobiles
- `data_analysis/duplicate_details.json` - Duplicate assignment details
- `data_analysis/migration_summary_31mar.json` - Final migration summary

### SQL Files
- `database/new_leads_31mar_STAGING.sql` - Staging/test SQL
- `database/new_leads_31mar_PRODUCTION.sql` - Production deployment SQL

## Lead ID Assignment

**Range:** LEAD-09650 → LEAD-10109
**Count:** 460 leads

**Production state before upload:**
- Current lead count: 9,636
- Latest lead_id: LEAD-09649

**Production state after upload:**
- Expected lead count: 10,096 (9,636 + 460)
- Latest lead_id: LEAD-10109

## Deployment Steps

### Step 1: Pre-Deployment Verification
```bash
# Connect to production
ssh root@159.65.158.26

# Check current state
docker exec orbit_db psql -U sitara -d sitara_crm -c "SELECT COUNT(*) FROM leads;"
docker exec orbit_db psql -U sitara -d sitara_crm -c "SELECT lead_id FROM leads ORDER BY lead_id DESC LIMIT 1;"
```

**Expected:**
- Total leads: 9,636
- Latest lead_id: LEAD-09649

### Step 2: Upload SQL File
```bash
# From local machine
scp database/new_leads_31mar_PRODUCTION.sql root@159.65.158.26:/tmp/
```

### Step 3: Execute Migration
```bash
# On production server
ssh root@159.65.158.26

# Execute SQL
docker exec -i orbit_db psql -U sitara -d sitara_crm < /tmp/new_leads_31mar_PRODUCTION.sql
```

### Step 4: Post-Deployment Verification
```bash
# Check total leads
docker exec orbit_db psql -U sitara -d sitara_crm -c "SELECT COUNT(*) FROM leads;"
# Expected: 10,096

# Check latest lead_id
docker exec orbit_db psql -U sitara -d sitara_crm -c "SELECT lead_id FROM leads ORDER BY lead_id DESC LIMIT 1;"
# Expected: LEAD-10109

# Check REP-0018 lead count
docker exec orbit_db psql -U sitara -d sitara_crm -c "
SELECT COUNT(*) FROM leads
WHERE assigned_rep_id = 'd8d0b91f-9753-4c86-8149-30ebf312ad21';"
# Expected: previous count + 460

# Check for duplicate mobiles (should be 0 new duplicates)
docker exec orbit_db psql -U sitara -d sitara_crm -c "
SELECT mobile, COUNT(*) as cnt FROM leads
WHERE mobile IS NOT NULL AND mobile != ''
GROUP BY mobile HAVING COUNT(*) > 1;"
# Expected: 0 rows (or only pre-existing duplicates if any)

# Verify new lead ID range
docker exec orbit_db psql -U sitara -d sitara_crm -c "
SELECT COUNT(*) FROM leads
WHERE lead_id >= 'LEAD-09650' AND lead_id <= 'LEAD-10109';"
# Expected: 460
```

### Step 5: Cleanup
```bash
# Remove temp SQL file
rm /tmp/new_leads_31mar_PRODUCTION.sql
```

## Rollback Plan

If something goes wrong:
```sql
-- Rollback (within same transaction if not committed)
ROLLBACK;

-- OR if already committed, delete the uploaded leads:
DELETE FROM leads
WHERE lead_id >= 'LEAD-09650' AND lead_id <= 'LEAD-10109';

-- Reset sequence if needed
SELECT setval('lead_id_seq', (SELECT MAX(CAST(SUBSTRING(lead_id FROM 6) AS INTEGER)) FROM leads));
```

## Git Branch

- **Branch:** `NewLeads31stMarch`
- **Files committed:**
  - Analysis scripts (3 Python files)
  - Generated SQL files (2 files)
  - Analysis outputs (5 JSON/TXT files)
  - This deployment guide

## Production Database State

**Before Upload:**
- Total leads: 9,636
- Latest lead_id: LEAD-09649

**After Upload:**
- Total leads: 10,096
- Latest lead_id: LEAD-10109
- New leads for REP-0018: +460

## Notes

- All new leads assigned to REP-0018 (Syed Ali Zaib Zaidi)
- Source: "Personal" (default, as per source file)
- Status: "new", Pipeline: "New", Type: "prospect"
- Country code: "+92"
- No additional mobiles in this batch
- City data populated for all leads (mostly Faisalabad)

## Validation Queries

```sql
-- Get sample of new leads
SELECT lead_id, name, mobile, city
FROM leads
WHERE lead_id >= 'LEAD-09650' AND lead_id <= 'LEAD-10109'
LIMIT 10;

-- Check status distribution
SELECT status, COUNT(*)
FROM leads
WHERE lead_id >= 'LEAD-09650' AND lead_id <= 'LEAD-10109'
GROUP BY status;

-- Check city distribution
SELECT city, COUNT(*)
FROM leads
WHERE lead_id >= 'LEAD-09650' AND lead_id <= 'LEAD-10109'
GROUP BY city
ORDER BY COUNT(*) DESC;
```
