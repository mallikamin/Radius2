# TARS Audit Recommendations — 12th Feb 2026

> Branch: `TARS-12thFebRecommendations`
> Base: `VectorView`
> Purpose: Adding new functionalities based on TARS audit of Orbit CRM + Vector Module

## Implementation Status

### TIER 1 — Quick Wins
| # | Item | Status |
|---|------|--------|
| 1 | Fix Ctrl+S to save to DB when databaseMode is on | DONE |
| 2 | Remove duplicate auth useEffect | DONE |
| 3 | Remove broken "Edit" button in PlotDetailsWindow | DONE |
| 4 | Fix Legend "Refresh" button — recalculate, don't reload | DONE |
| 5 | Remove duplicate canvas tool palette | DONE |

### TIER 2 — High-Impact Features
| # | Item | Status |
|---|------|--------|
| 6 | Overdue installments dashboard with aging buckets | DONE |
| 7 | Revenue collection trend chart (monthly receipts vs due) | DONE |
| 8 | Fix inventory bulk import dedup | DONE |
| 9 | Add pagination to all list endpoints (50/page default) | DONE |
| 10 | Fix dashboard N+1 queries | DONE |
| 11 | Add search debounce (150ms) + useMemo for filters | DONE |
| 12 | Undo/Redo in Vector (command pattern) | DONE |
| 13 | Notification system — in-app with bell icon + DB storage | DONE |

### TIER 3 — Significant UX Improvements
| # | Item | Status |
|---|------|--------|
| 14 | Sidebar panel grouping (5 primary + "More") | DONE |
| 15 | Replace alert/confirm/prompt with React modals (~40 replacements) | DONE |
| 16 | Canvas performance — requestAnimationFrame, refs for hover/pan | DONE |
| 17 | Lead pipeline Kanban view | DONE |
| 18 | Quick Pay from installment row | DONE |
| 19 | Fix N+1 per-row lookups in list endpoints | DONE |
| 20 | Commission tracking dashboard | DONE |
| 21 | Client-side form validation with inline errors (6 forms) | DONE |
| 22 | Vector-to-CRM action link (click plot -> sell/view) | **PENDING** |
| 23 | Role-specific dashboards | **PENDING** |
| 24 | Keyboard shortcuts help overlay (? key) | DONE |

### TIER 4 — Strategic Enhancements
| # | Item | Status |
|---|------|--------|
| 25 | Full activity/audit log (all entities, 9 endpoints) | DONE |
| 26 | Move map PDFs from base64 to filesystem | DONE |
| 27 | Code-split App.jsx + lazy-load vendor bundles | DONE |
| 28 | SSE real-time updates for inventory status changes | DONE |
| 29 | Customer 360 slide-out drawer | DONE |
| 30 | Buyback impact preview before approval | **PENDING** |

**Score: 27/30 implemented, 3 pending discussion**

## Files Changed (22 total)

### Modified (18)
- `backend/app/main.py` — Pagination, N+1 fixes, dedup, dashboard endpoints, notifications, audit log, SSE, PDF filesystem
- `backend/Dockerfile` — Added uploads directory
- `docker-compose.yml` — Added uploads volume mount
- `docker-compose.prod.yml` — Added uploads volume mount
- `frontend/src/App.jsx` — Dashboard charts, debounce, modals, validation, Kanban, QuickPay, Customer360, code splitting
- `frontend/src/main.jsx` — Dynamic jsPDF import
- `frontend/src/components/Vector/VectorMap.jsx` — Removed duplicate palette, keyboard overlay, PDF URL loading
- `frontend/src/components/Vector/MapCanvas.jsx` — requestAnimationFrame, hover/mouse refs
- `frontend/src/components/Vector/Sidebar.jsx` — Panel grouping (5 primary + More)
- `frontend/src/components/Vector/LegendPanel.jsx` — Refresh recalculates instead of reload
- `frontend/src/components/Vector/PlotDetailsWindow.jsx` — Removed broken Edit button
- `frontend/src/hooks/useKeyboardShortcuts.js` — DB-aware Ctrl+S, real undo/redo calls
- `frontend/src/utils/exportUtils.js` — Dynamic jsPDF import
- `frontend/src/utils/inventoryUtils.js` — Dynamic XLSX import
- `frontend/src/utils/pdfLoader.js` — Added loadPDFFromUrl for filesystem PDFs
- `frontend/vite.config.js` — Manual vendor chunks
- `frontend/package.json` — Added chart.js, react-chartjs-2
- `frontend/package-lock.json` — Updated lockfile

### New (4)
- `TARS-NOTES.md` — This file
- `backend/migrations/add_notifications_audit_log.sql` — Migration for notifications + audit_log + map_file_path
- `frontend/src/components/Vector/KeyboardShortcutsOverlay.jsx` — Shortcut help overlay
- `frontend/src/hooks/useUndoRedo.js` — Command pattern undo/redo hook

## Architecture Decisions (User-Approved)
- **Charts**: Chart.js + react-chartjs-2 (with graceful fallback tables if not installed)
- **Notifications**: In-app only (bell icon, dropdown, DB-stored, overdue auto-generation)
- **Modal replacement**: ConfirmModal + AlertModal + PromptModal + Toast (40+ replacements done)
- **SSE scope**: Inventory status changes only (sold, available, buyback_pending)
- **Audit log**: All entities via `log_audit()` helper, 9 critical endpoints instrumented
- **Code splitting**: React.lazy for VectorMap + dynamic imports for jsPDF/XLSX + Vite manual chunks
- **Pagination**: Offset-based, 50/page default, X-Total-Count header on 11 endpoints
- **Customer 360**: Slide-out drawer via `window.showCustomer360(id)`, accessible from any customer reference

## Deployment Notes

### Prerequisites
```bash
# Frontend deps (already installed)
cd frontend && npm install chart.js react-chartjs-2

# Build frontend
cd frontend && npm run build
```

### Migration (run on DB after deployment)
```bash
docker exec -i sitara_crm_db psql -U sitara -d sitara_crm < backend/migrations/add_notifications_audit_log.sql
```

This creates: `notifications` table, `audit_log` table, adds `map_file_path` to `vector_projects`.

### PDF Migration (optional, per-project)
After deployment, existing projects can be migrated from base64 to filesystem:
```
POST /api/vector/projects/{project_id}/migrate-pdf
```

## TARS Backup Agent (NEW — Feb 12, 2026)

**Trigger**: Data loss incident — Docker volume name change orphaned dev data.
**Resolution**: Volume recovered, safeguards implemented.
**Reference**: `DATA-SAFETY.md` — full protocol, checklist, volume registry.

### Key Safeguards Added
1. `external: true` on all data volumes (Docker fails loudly if volume missing)
2. `IF NOT EXISTS` + `ON CONFLICT DO NOTHING` in all init/migration scripts
3. Pre-deployment checklist (volume check, migration scan, backup, model alignment)
4. Volume Name Registry — any deviation blocks deployment

### Backup Agent Role in TARS Audit
- Runs automatically during `/audit` on any Orbit branch
- Scans compose files for volume name changes
- Scans migrations for destructive operations (DROP, TRUNCATE, DELETE)
- Verifies model-to-table alignment
- Requires backup confirmation before deployment approval

## Testing Lessons (Feb 12 Post-Mortem)

**Problem**: 26/27 features "passed" API/code tests but basic user flows (click broker name, click customer name) were broken with 500 errors.

**Root Cause**: Tests validated endpoint existence and response codes on happy paths, but never tested the actual UI click flows that pass real entity IDs (CUST-XXXX, BRK-XXXX).

### TARS Testing Protocol (Revised)
1. **Unit tests are not enough** — always test the actual user click path end-to-end
2. **Test with real data** — use actual entity IDs from the DB, not synthetic UUIDs
3. **Test error paths** — pass string IDs, empty strings, missing records
4. **Test every clickable element** — if the UI has a clickable name, test the endpoint it calls
5. **Regression test after fixes** — when fixing one bug, re-run all related endpoints

### Bugs Found in User Testing (not caught by API tests)
| Bug | Cause | Fix |
|---|---|---|
| Customer details 500 | `Customer.id == "CUST-0004"` cast as UUID | Removed UUID fallback from filter |
| Broker details 500 | Same UUID cast issue | Same fix |
| Customer details 500 (2nd) | `customer.notes` attribute missing from model | Used `getattr()` with default |
| Notification ID collision | `MAX(id)+1` same for all in batch | Use `nextval('notifications_id_seq')` |

## Known Minor Issues (from code review)
1. `create_notification` uses `MAX(id)+1` for notification_id — race condition under concurrent inserts (LOW severity, display-only field)
2. SSE `queue.get(timeout=30)` blocks the async event loop — should use `run_in_executor` for production scale (MEDIUM, fine for current user count)
3. `Notification.is_read == False` should be `.is_(False)` for idiomatic SQLAlchemy (LOW, works correctly)

## Pending Discussion Notes

### #22 — Vector-to-CRM Action Link
- Current state: Map is view-only, can't take action from plot click
- Proposed: Click plot on map -> sell / view transaction
- Questions to resolve:
  - Should this open the CRM tab or a modal overlay?
  - What actions beyond sell? (Transfer, buyback initiate, view history?)
  - How to handle plots without inventory records?
  - Permission model: can viewer role trigger actions?

### #23 — Role-Specific Dashboards
- Current state: Everyone sees identical dashboard view
- Proposed: viewer=summary, creator=recent, admin=analytics+approvals
- Questions to resolve:
  - Exact widget set per role
  - Should manager see approval queue?
  - Mobile responsive considerations per role
  - Data access restrictions vs UI-only differences

### #30 — Buyback Impact Preview
- Current state: No financial context shown before buyback approval
- Proposed: Show outstanding balance + previous buyback history
- Questions to resolve:
  - What financial metrics to show (outstanding, paid, profit/loss)?
  - Should it show all customer's buyback history or just this plot?
  - Market comparable data source — manual or automated?
  - Integration with the buyback approval workflow (separate step or inline?)
