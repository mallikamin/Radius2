# Raw Leads Bulk Upload — 24 Feb 2026

## Context
Four sales reps (Samia, Naeem, Ali, Iram) submitted their personal contact lists for CRM upload. The data had significant cross-rep overlap — 386 leads appeared in multiple reps' files. The sales team resolved allocations in a separate file ("To be uploaded in CRM.xlsx").

## Source Files
| File | Rep | Raw Rows |
|------|-----|----------|
| `CRM Data Samia Rashid.xlsx` | REP-0016 (Samia Rashid) | 1,580 |
| `CRM Data Naeem Zaidi.xlsx` | REP-0017 (Syed Naeem Abbass Zaidi) | 2,970 |
| `CRM Data Ali Zaidi.xlsx` | REP-0018 (Syed Ali Zaib Zaidi) | 2,427 |
| `CRM Data - Iram Aslam.xlsx` | REP-0019 (Iram Aslam) | 2,943 |
| `To be uploaded in CRM.xlsx` | Overlap resolution (386 leads) | 386 |

All source files located in `C:\Users\Malik\Downloads\` at time of import.

## Overlap Resolution

### Previous Analysis (by Claude Code)
- `data_analysis/Cross_Rep_Overlaps_Report.xlsx` — identified 386 cross-rep duplicate mobiles
- `data_analysis/rep_data_analysis.json` — full per-file analysis with internal dups, weird mobiles, name issues

### Sales Team Resolution
- "To be uploaded in CRM.xlsx" — 10 sheets (4x 3-way overlaps, 6x 2-way overlaps)
- Each row has: Mobile, Overlap type, **"Allocation Required in CRM"** (which rep gets the lead)
- 386 unique mobiles resolved across the 4 reps

### Allocation Breakdown (from overlap file)
| Allocated To | Count |
|-------------|-------|
| Iram Aslam (REP-0019) | 128 |
| Syed Ali Zaib Zaidi (REP-0018) | 119 |
| Syed Naeem Abbass Zaidi (REP-0017) | 81 |
| Samia Rashid (REP-0016) | 58 |
| **Total** | **386** |

### Allocation Name Variants (mapped in builder script)
- "Syed Ali Zaidi" / "Syed Ali Zaib Zaidi" → REP-0018
- "Naeem" / "Naeem Abbas" / "Naeem Abbass" / "Naeem Zaidi" / "Syed Naeem Abbas" → REP-0017
- "Samia Rashid" / "Samia Rasheed" → REP-0016
- "Iram Aslam" → REP-0019

### New Duplicate (Not in Overlap File)
- Mobile `03077674577` (Muhammad Ahmed Shahid) — found in both Iram & Samia's files
- **Decision**: Assigned to Iram Aslam (REP-0019)

## Data Processing Pipeline

### Steps (in `data_analysis/build_leads_migration.py`)
1. Parse all 4 individual rep files
2. Remove no-mobile rows (197 skipped)
3. Remove junk-name rows (179 skipped: "Not mentioned", "N/A", null, "unknown")
4. Normalize mobile numbers (see rules below)
5. Deduplicate within each file (keep first occurrence)
6. Remove 386+1 overlap mobiles from all individual files
7. Add back resolved overlaps to the allocated rep
8. Final cross-rep dedup verification
9. Generate SQL migration

### Mobile Normalization Rules
| Pattern | Action | Example |
|---------|--------|---------|
| Float `.0` suffix | Strip | `3055430688.0` → `3055430688` |
| Scientific notation | `int(float())` | `9.72E+11` → `972000000000` |
| Unicode invisible chars | Strip `\u200e`, `\u200f`, `\u200b`, `\u202a`-`\u202e`, etc. | `3055645795‬` → `3055645795` |
| Multi-number cells | Split on ` - `, ` / `, ` & `, `/`, `,` — take first | `3176298952 - +61468778662` → `03176298952` |
| `p:` prefix | Strip | `p:03079767732` → `03079767732` |
| Pakistani 10-digit | Prepend `0` | `3055430688` → `03055430688` |
| Pakistani +92 (12-digit) | Strip `92`, prepend `0` | `923008669975` → `03008669975` |
| Pakistani +920 (13-digit) | Strip `920`, prepend `0` | `9203065553246` → `03065553246` |
| Email in mobile | Skip lead | `drwaqas@livecom` → NULL |
| Text/name in mobile | Skip lead | `SananHaider`, `ClientReference` → NULL |
| Specific fix | `9710508285799` → `971508285799` (UAE number) |

### What Was Skipped
| Reason | Count |
|--------|-------|
| No mobile number | 197 (Ali=152, Iram=32, Naeem=12, Samia=1) |
| Junk/missing name | 179 (mostly Ali's data) |
| Non-numeric mobile (email/text) | 5 |
| Internal duplicates | 583 (Samia=263, Ali=184, Iram=113, Naeem=57) |
| **Total rows filtered** | **~964** |

## Final Upload Summary

### Per-Rep Breakdown
| Rep | Rep ID | UUID | Leads | PK Mobiles | Intl Mobiles | Additional Mobiles |
|-----|--------|------|-------|------------|-------------|-------------------|
| Samia Rashid | REP-0016 | `254c4e3d-15fe-44ed-9d01-2111824ff464` | 1,247 | 1,219 | 31 | 0 |
| Syed Naeem Abbass Zaidi | REP-0017 | `0979ceba-e38a-47cc-b50b-cc0d684f2795` | 2,781 | 2,726 | 58 | 259 |
| Syed Ali Zaib Zaidi | REP-0018 | `d8d0b91f-9753-4c86-8149-30ebf312ad21` | 1,917 | 1,834 | 101 | 223 |
| Iram Aslam | REP-0019 | `af723dce-2620-416f-bc29-fa7294a01cc9` | 2,598 | 2,546 | 55 | 9 |
| **Total** | | | **8,543** | **8,325** | **245** | **491** |

### Lead Properties
- **Lead ID range**: LEAD-00031 → LEAD-08573
- **Status**: `new` / Pipeline: `New` / Type: `prospect`
- **Source**: All `Personal`
- **Country code**: `+92` (default)

### Production State After Migration
- **Total leads in DB**: 8,560 (17 existing + 8,543 new)
- **Known duplicate mobile**: `03167469271` (pre-existing LEAD-00028 + new LEAD in Iram's data)

## Files in This Commit
| File | Purpose |
|------|---------|
| `database/raw_leads_migration.sql` | Production migration SQL (8,543 INSERTs) |
| `data_analysis/build_leads_migration.py` | Builder script — processes all source files, generates SQL |
| `data_analysis/rep_data_analysis.json` | Detailed per-file analysis (internal dups, weird mobiles, name issues) |
| `data_analysis/analyze_rep_data.py` | Initial analysis script |
| `data_analysis/migration_summary.json` | Final migration summary |
| `RAW_LEADS_UPLOAD_NOTES.md` | This file |

## Deployment
- **Target**: DigitalOcean production (`159.65.158.26` → `orbit_db` → `sitara_crm`)
- **Method**: Test DB first → validate → production → drop test
- **Date**: 24 Feb 2026
- **Verification**: 0 duplicate mobiles (except 1 pre-existing), all rep counts correct
