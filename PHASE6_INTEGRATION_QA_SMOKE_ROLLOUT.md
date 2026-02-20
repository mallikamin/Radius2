# Phase 6 - Integration QA Checklist, Smoke Tests, and Rollout Plan (Final Closure)

Date: 2026-02-20
Owner: Codex
Scope: Verification and release gating only
Status: Final re-validation complete after `sales-kpis` hotfix

## 1) Integration QA Checklist (final)

| Area | Check | Pass Criteria | Result | Evidence |
|---|---|---|---|---|
| Payment-rule locking behavior | Payment-plan API + lock/unlock routes available and role-guarded | Endpoints exist, non-404, privileged-only mutation | PASS | Routes present in `backend/app/main.py` (`/api/projects/{project_id}/payment-plans`, `/api/payment-plans/{plan_id}/lock`, `/api/payment-plans/{plan_id}/unlock`); authenticated probe `/api/projects/PRJ-0001/payment-plans` -> 200; non-auth probe -> 403. |
| Receipt classification logic | Token/partial/down-payment classification and precedence tests | Unit suite passes | PASS | `pytest backend/tests/ -q -k unit` -> `30 passed`. |
| Receipt classification API path | Receipts endpoints healthy with auth guard | Endpoints available and non-404/500 | PASS | Auth probe `/api/receipts` -> 200; non-auth probe -> 403. |
| Leads UX updates | Leads tabs and follow-up segmentation intact | Build succeeds and code paths present | PASS | `npm.cmd run build` passed; Leads/follow-up tabs present in `frontend/src/App.jsx`. |
| Interactions taxonomy update | Updated status taxonomy for Call/WhatsApp/Meeting | Taxonomy options present and build clean | PASS | Options present in `frontend/src/App.jsx`; build passed. |
| Dashboard role segmentation | Role-specific views + KPI loading path operational | Sales/global role paths active; KPI endpoint responsive | PASS | `/api/dashboard/sales-kpis` auth probe -> 200; non-auth -> 403. |
| Analytics drilldown JSON | Drilldown endpoint operational | JSON response endpoint 200 with auth | PASS | `/api/analytics/leads/drilldown` -> 200 (auth). |
| Analytics drilldown CSV/Excel export | Export variants operational | CSV/XLSX responses 200 with auth | PASS | `/api/analytics/leads/drilldown?export_format=csv` -> 200, `...excel` -> 200. |
| RBAC boundaries | Restricted endpoints deny unauth | Protected endpoints return 403/401 without token | PASS | `/api/analytics/campaign-metrics`, `/api/analytics/rep-performance`, `/api/vector/projects`, `/api/receipts`, `/api/leads/pipeline`, `/api/dashboard/sales-kpis` all -> 403 unauth. |

## 2) Final Smoke Test Matrix

### Backend/API smoke flows

| ID | Flow | Expected | Actual | Status |
|---|---|---|---|---|
| B1 | Invalid login (`POST /api/auth/login`) | 401 | 401 | PASS |
| B2 | `/api/dashboard/sales-kpis` (auth) | 200 | 200 | PASS |
| B3 | `/api/analytics/leads/drilldown` (auth) | 200 | 200 | PASS |
| B4 | `/api/analytics/leads/drilldown?export_format=csv` (auth) | 200 | 200 | PASS |
| B5 | `/api/analytics/leads/drilldown?export_format=excel` (auth) | 200 | 200 | PASS |
| B6 | `/api/receipts` (auth) | 200 | 200 | PASS |
| B7 | `/api/leads/pipeline` (auth) | 200 | 200 | PASS |
| B8 | `/api/projects/PRJ-0001/payment-plans` (auth) | 200 | 200 | PASS |
| B9 | RBAC guard checks (selected protected GETs, unauth) | 401/403 | 403 | PASS |
| B10 | Backend unit regression (`pytest -k unit`) | pass | 30 passed | PASS |

Backend totals: Passed 10, Failed 0, Skipped 0

### Frontend smoke flows

| ID | Flow | Expected | Actual | Status |
|---|---|---|---|---|
| F1 | Production build | build success | success | PASS |
| F2 | Leads/Interactions/dashboard wiring compile check | no compile/runtime build break | no build break | PASS |
| F3 | Drilldown/export frontend dependency availability | backend endpoints reachable | reachable (all 200 with auth) | PASS |

Frontend totals: Passed 3, Failed 0, Skipped 0

### Combined totals

Passed 13, Failed 0, Skipped 0

## 3) Rollout Plan (unchanged, now unblocked)

### Pre-deploy checks

1. Confirm backend/frontend image tags map to same commit SHA.
2. Run backend unit suite (`pytest backend/tests/ -q -k unit`).
3. Run frontend production build (`npm.cmd run build`).
4. Run authenticated API probes for:
   - `/api/dashboard/sales-kpis`
   - `/api/analytics/leads/drilldown` (json/csv/excel)
   - `/api/receipts`, `/api/leads/pipeline`
   - `/api/projects/{project_id}/payment-plans`
5. Run unauth probes to confirm 403/401 on protected endpoints.

### Migration/apply order

1. DB snapshot backup.
2. Apply Phase 11 migration (`phase11_payment_plans_targets_temperature.sql`) on target env.
3. Deploy backend.
4. Execute backend smoke probes.
5. Deploy frontend.
6. Execute UI smoke pass (Leads, Interactions, Dashboard, drilldown/export).

### Post-deploy verification

1. Confirm no 5xx on `/api/dashboard/sales-kpis`.
2. Confirm drilldown/export returns 200 and downloadable payloads.
3. Confirm RBAC denies unauth and low-privilege misuse cases.
4. Confirm payment plan list/lock/unlock behavior under allowed roles.
5. Confirm receipts list/create/get remain operational.

### Rollback steps (DB + app)

1. Drain API traffic / maintenance mode.
2. Roll back backend image to prior stable tag.
3. Roll back frontend artifact to prior stable build.
4. If migration impact requires, restore pre-deploy DB snapshot.
5. Re-run smoke probes on rollback state.

## 4) Known Risks + Mitigation (current)

1. `project_units_target` may be null in KPI response where `MonthlyRepTarget` rows are not present.
   Mitigation: Pre-seed targets for active month before UAT/production reporting sign-off.

2. Frontend build reports existing chunk-size/dynamic-import warnings.
   Mitigation: Non-blocking for release; track as performance hardening task.

## 5) Release Gate Decision

Decision: **GO**

Rationale:
- Prior critical blockers are resolved and re-validated.
- Required authenticated runtime endpoints now return 200.
- RBAC unauth boundaries still enforced (403).
- Backend unit regression and frontend production build pass.

## 6) First 24h Post-Deploy Watchlist

1. 5xx rate and latency on `/api/dashboard/sales-kpis`.
2. 4xx/5xx ratio on `/api/analytics/leads/drilldown` and export variants.
3. Auth failure spikes by role (unexpected 403 increases).
4. Receipt create/list/get error rates and classification exception logs.
5. Frontend client errors on dashboard and drilldown/export components.
