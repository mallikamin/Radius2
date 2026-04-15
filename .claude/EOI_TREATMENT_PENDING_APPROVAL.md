# EOI Treatment Field - Pending COO Approval (7 Apr 2026)

## Request
Add "Subsequent Treatment of EOI Amount" checklist to EOI Collection form

## Options to Add
1. ☑ Instrument in Cash (default)
2. ☐ Instrument with us
3. ☐ Instrument on Hold
4. ☐ Other: [text field]

## Implementation Checklist (once approved)

### 1. Database Migration
```sql
ALTER TABLE eoi_collections
ADD COLUMN instrument_treatment VARCHAR(100),
ADD COLUMN instrument_treatment_other TEXT;
```

### 2. Backend (`backend/app/main.py`)
- Line ~284: Add fields to `EOICollection` model
- Update `_eoi_row_dict()` helper
- Update POST/PUT endpoints

### 3. Frontend (`frontend/src/App.jsx`)
- Line ~3749: Update `emptyForm` state
- Line ~4935-4990: Add checklist section in modal (after payment info, before notes)
- Line ~3950: Update CSV export
- Line ~4500: Update PDF acknowledgment slip

### 4. Integration Points
- CSV export (line ~3950)
- PDF report (line ~4500+)
- Detail modal display

## Status
📋 Awaiting COO approval on flow + option names
🔗 Screenshot shared with COO

## Branch
`feat/EOI-7th-April` (already checked out)
