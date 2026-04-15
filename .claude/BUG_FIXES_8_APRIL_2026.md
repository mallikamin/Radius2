# Bug Fixes - 8 April 2026
## Reported by: Imran Younas (Manager role)

---

## Issue #1: Mobile Search Not Finding Leads with Numbers in additional_mobiles

### Root Cause
- LEAD-08695 has **primary mobile field = NULL**
- The mobile number "03324305912" is stored in **additional_mobiles JSON array**: `["03324305912"]`
- The unified search endpoint (`GET /api/search/unified`) only checked the primary `mobile` field
- The duplicate check endpoint correctly searches both primary and additional_mobiles
- Result: Duplicate check finds the lead, but main search bar doesn't

### Fix Applied
**Backend** (`main.py` lines ~10429-10502):
- Added JSONB array search for **customer additional_mobiles** using `jsonb_array_elements_text`
- Added JSONB array search for **lead additional_mobiles** using `jsonb_array_elements_text`
- Both use the same normalization and suffix matching as primary mobile search
- Duplicate prevention: Check if entity already in results before adding

**Code Pattern:**
```sql
SELECT l.id, l.lead_id, l.name, l.mobile, am.elem, l.pipeline_stage,
       r.name as rep_name, r.rep_id as rep_rep_id
FROM leads l
LEFT JOIN company_reps r ON l.assigned_rep_id = r.id
CROSS JOIN jsonb_array_elements_text(l.additional_mobiles) AS am(elem)
WHERE l.status != 'converted'
  AND l.additional_mobiles IS NOT NULL AND l.additional_mobiles != '[]'::jsonb
  AND regexp_replace(am.elem, '[^0-9]', '', 'g') LIKE :suffix_pattern
```

### Testing Steps
1. Search for "3324305912" in main search bar → Should now find LEAD-08695 (Kashif Tariq)
2. Search for any other lead with mobile in additional_mobiles array
3. Verify duplicate check still works correctly
4. Verify no duplicate results if a lead has BOTH primary and additional mobile matching

---

## Issue #2: Lead Assignment Failing with Generic Error

### Root Cause
- Backend bulk-assign endpoint had minimal error handling
- Exceptions were caught but not properly logged or reported
- Frontend showed generic "Assignment failed" message
- Actual error cause was hidden (could be notification failure, DB constraint, rep not found, etc.)

### Fix Applied

**Backend** (`main.py` lines ~10837-10887):
1. **Input Validation**:
   - Check lead_ids is non-empty array
   - Return specific error: "lead_ids must be a non-empty array"

2. **Rep Lookup Error**:
   - Return specific error: "Rep not found with id: {rep_id}"

3. **Lead Lookup Check**:
   - Return error if no leads found: "No leads found matching the provided IDs"

4. **Notification Failure Handling**:
   - Wrap notification creation in try-catch
   - Log error but DON'T fail the assignment
   - Assignment succeeds even if notification fails

5. **Transaction Handling**:
   - Wrap assignment loop in try-catch
   - Rollback DB on failure
   - Return detailed error: "Assignment failed: {actual error}"
   - Log to console with `[bulk-assign]` prefix

**Frontend** (`App.jsx` line ~2051-2059):
1. Added `console.error` logging for full error object
2. Added `console.error` logging for response data
3. Extract error from BOTH `detail` and `message` fields
4. Fallback to "Assignment failed" only if no specific error

### Testing Steps
1. Assign lead to "Syed Ali Zaib Zaidi" (REP-0018) → Should succeed
2. Try to assign with invalid rep_id → Should show "Rep not found with id: X"
3. Try to assign with empty lead_ids → Should show "lead_ids must be a non-empty array"
4. Check browser console for detailed error logs if any issue occurs

---

## Database Verification (Production)

### REP-0018 (Syed Ali Zaib Zaidi)
```sql
SELECT rep_id, name, role FROM company_reps WHERE rep_id = 'REP-0018';
```
Result:
```
  rep_id  |        name         | role 
----------+---------------------+------
 REP-0018 | Syed Ali Zaib Zaidi | user
```
✅ Rep exists and is active

### LEAD-08695 (Kashif Tariq)
```sql
SELECT lead_id, name, mobile, additional_mobiles, pipeline_stage, status 
FROM leads WHERE lead_id = 'LEAD-08695';
```
Result:
```
  lead_id   |     name     | mobile | additional_mobiles | pipeline_stage | status 
------------+--------------+--------+--------------------+----------------+--------
 LEAD-08695 | Kashif Tariq |        | ["03324305912"]    | New            | new
```
✅ Lead exists with mobile in additional_mobiles array

---

## Files Modified
1. `backend/app/main.py`:
   - Lines ~10429-10457: Customer additional_mobiles search
   - Lines ~10474-10502: Lead additional_mobiles search
   - Lines ~10837-10887: Bulk assign error handling

2. `frontend/src/App.jsx`:
   - Lines ~2051-2059: Frontend error logging and display

---

## Deployment Checklist
- [ ] Restart backend API container: `docker compose up -d --build orbit_api`
- [ ] Verify API is healthy: `curl http://159.65.158.26:8001/health`
- [ ] Test mobile search for "3324305912"
- [ ] Test lead assignment to REP-0018
- [ ] Check browser console for any errors
- [ ] Verify search logs in backend container logs

---

## Notes for Future
1. **Always search additional_mobiles**: Any new search endpoint should include JSONB array search
2. **Always log errors**: Backend errors should be logged with context prefix (e.g., `[bulk-assign]`)
3. **Always return specific errors**: HTTPException should have descriptive detail messages
4. **Frontend error handling**: Always log full error object to console for debugging
5. **Transaction safety**: Always wrap DB operations in try-catch with rollback
