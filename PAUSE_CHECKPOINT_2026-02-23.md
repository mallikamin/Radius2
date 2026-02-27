# Pause Checkpoint — 2026-02-23

## Project
- **Name**: Orbit CRM (radius2-analytics worktree)
- **Path**: `C:\Users\Malik\desktop\radius2-analytics`
- **Branch**: `master`

## Goal
Add Sitara Square **Batch 3** — 6-7 additional transactions from the same Excel source ("Sitara Square Inventory Updating 2.xlsx" or a new sheet). These transactions are missing customer contact details and broker contact details.

## Completed
- [x] Sitara Square Batch 2 migration committed (`database/sitara_square_migration_2.sql`) — 12 transactions, 11 customers, 2 new brokers, C6 inventory
- [x] MEMORY.md updated with batch 2 context (23 Feb 2026)
- [x] HANDOFF_NOTES.md Section 6 updated — batch 2 pending deployment, expected post-deploy counts
- [x] Designed the approach for batch 3 (missing contacts problem)

## In Progress
- [ ] **Sitara Square Batch 3 migration** — approach is agreed, waiting for user to share the Excel data
  - Strategy designed but NO SQL written yet
  - User confirmed: same Excel format, just missing contact columns

## Pending
- [ ] User shares Excel file/data for the 6-7 transactions
- [ ] Generate `database/sitara_square_migration_3.sql` with:
  - Pre-flight duplicate scanner (name-match against existing customers/brokers, RAISE NOTICE + EXCEPTION on match)
  - Placeholder mobiles: `PENDING-SHOP-XX` for customers, `PENDING-BRK-XX` for brokers
  - Notes flagging: `'CONTACT DETAILS PENDING — added from Sitara Square batch 3'`
  - Same transaction/installment structure as batches 1 & 2
  - Verification queries + "find all pending contacts" query
- [ ] Deploy batch 2 + batch 3 together to production (test-first protocol)

## Key Decisions
- **Placeholder mobile pattern**: `PENDING-SHOP-XX` for customers, `PENDING-BRK-XX` for brokers — satisfies NOT NULL + UNIQUE constraints, easily searchable with `WHERE mobile LIKE 'PENDING-%'`
- **Duplicate detection**: Pre-flight block runs name-matching queries BEFORE inserts, raises NOTICE for matches and EXCEPTION to halt if any found — user reviews and decides to reuse existing record or confirm different person
- **Notes flagging**: Every record without real contact gets notes marking it as pending — visible in CRM UI

## Files Modified
- `C:\Users\Malik\.claude\projects\C--Users-Malik-desktop-radius2-analytics\memory\MEMORY.md` — Added batch 2 context, cumulative Sitara Square totals
- `C:\Users\Malik\desktop\radius2-analytics\HANDOFF_NOTES.md` — Updated Section 6 with batch 2 pending state and expected post-deploy counts

## Uncommitted Changes
- `HANDOFF_NOTES.md` — Section 6 updated (batch 2 context)
- `.claude/settings.local.json` — minor settings change

## Errors & Resolutions
- None this session

## Critical Context
- **DB schema constraint**: `customers.mobile` and `brokers.mobile` are both `NOT NULL + UNIQUE` — cannot leave blank, must use placeholders
- **Batch 2 not yet deployed to prod** — `database/sitara_square_migration_2.sql` is committed on master but production still only has batch 1 (28 transactions)
- **Rizwan Ali Ashraf mobile clash** from batch 2 still needs verification (stored as '3008669557' without leading 0, same number as broker Ali Akbar)
- **Batch 3 data not yet provided** — user will share the Excel after restart
- All 3 batches target PRJ-0001 (Sitara Square)
- Cumulative after all 3 batches: ~47 transactions, ~35+ customers, ~14+ brokers
