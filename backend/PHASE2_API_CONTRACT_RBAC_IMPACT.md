# Phase 2 - API Contract (v1) + RBAC Matrix + Endpoint Impact Map

## 1) API Contract (v1)

Base: `/api`
Auth: `Bearer JWT`
Common error payload:
```json
{ "detail": "message", "code": "ERROR_CODE" }
```

### 1.1 Project Payment Plan CRUD

1. `POST /api/projects/{project_id}/payment-plans`
- Purpose: create project payment plan shell.
- Roles: `admin`, `director`, `cco`, `coo`.
- Request:
```json
{
  "name": "Standard Plan 10-90",
  "description": "Default booking plan",
  "is_default": true
}
```
- Response 201:
```json
{
  "id": "uuid",
  "plan_id": "PPL-0101",
  "project_id": "uuid",
  "name": "Standard Plan 10-90",
  "description": "Default booking plan",
  "is_default": true,
  "is_locked": false,
  "status": "active",
  "created_by": "uuid",
  "created_at": "2026-02-20T00:00:00Z"
}
```

2. `GET /api/projects/{project_id}/payment-plans`
- Purpose: list all plans for project (active + archived optional).
- Roles: all authenticated roles.
- Query: `status=active|archived|all` (default `active`).

3. `GET /api/payment-plans/{plan_id}`
- Purpose: plan detail with versions + lock metadata.
- Roles: all authenticated roles.

4. `PUT /api/payment-plans/{plan_id}`
- Purpose: edit mutable metadata (`name`, `description`, `is_default`, `status`).
- Roles: `admin`, `director`, `cco`, `coo`.
- Guard: reject if locked and mutation changes business fields.

5. `DELETE /api/payment-plans/{plan_id}`
- Purpose: soft delete/archive (recommended) or hard delete if no usage.
- Roles: `admin`, `director`, `cco`, `coo`.
- Guard: if referenced by transactions, force archive.

### 1.2 Version Create / Activate Flow

6. `POST /api/payment-plans/{plan_id}/versions`
- Purpose: create version from installment definition.
- Roles: `admin`, `director`, `cco`, `coo`.
- Guard: deny if parent plan locked.
- Request:
```json
{
  "installments": [
    {"number": 1, "label": "Booking", "percentage": 10, "month_offset": 0},
    {"number": 2, "label": "Installment 1", "percentage": 30, "month_offset": 6},
    {"number": 3, "label": "Installment 2", "percentage": 30, "month_offset": 12},
    {"number": 4, "label": "Installment 3", "percentage": 30, "month_offset": 18}
  ],
  "installment_cycle": "bi-annual",
  "num_installments": 4,
  "notes": "v2 after CCO review"
}
```
- Response 201: version object + computed `percentage_total`.

7. `POST /api/payment-plans/{plan_id}/versions/{version_id}/activate`
- Purpose: set one active version; auto-deactivate siblings.
- Roles: `admin`, `director`, `cco`, `coo`.
- Guard: deny if plan locked.
- Response: `{ "message": "Version activated", "active_version_id": "uuid" }`

8. `GET /api/payment-plans/{plan_id}/versions`
- Purpose: list versions with active flag.
- Roles: all authenticated roles.

### 1.3 Lock / Unlock Flow (with audit metadata)

9. `POST /api/payment-plans/{plan_id}/lock`
- Roles: `admin`, `director`, `cco`, `coo`.
- Request:
```json
{ "reason": "CCO-approved for March batch" }
```
- Response includes:
```json
{
  "is_locked": true,
  "locked_by": "uuid",
  "locked_at": "2026-02-20T00:00:00Z",
  "lock_reason": "CCO-approved for March batch"
}
```
- Side-effect: write audit event `payment_plan_locked` with actor + old/new snapshot IDs.

10. `POST /api/payment-plans/{plan_id}/unlock`
- Roles: `admin`, `director`, `cco`, `coo`.
- Request requires `reason`.
- Side-effect: write audit event `payment_plan_unlocked`.

11. `GET /api/payment-plans/{plan_id}/audit`
- Purpose: list lock/unlock/version activation events.
- Roles: `admin`, `director`, `cco`, `coo`, `manager` (read-only).

### 1.4 Inventory Override CRUD

12. `POST /api/inventory/{inventory_id}/payment-override`
- Roles: `admin`, `director`, `cco`, `coo`, `manager`.
- Request:
```json
{
  "override_type": "plan_version",
  "plan_version_id": "uuid",
  "notes": "10% exceptional unit"
}
```
or
```json
{
  "override_type": "custom",
  "custom_installments": [
    {"number": 1, "label": "Booking", "percentage": 15, "month_offset": 0},
    {"number": 2, "label": "Balance", "percentage": 85, "month_offset": 12}
  ],
  "custom_num_installments": 2,
  "custom_installment_cycle": "annual",
  "notes": "Manager-approved custom"
}
```

13. `GET /api/inventory/{inventory_id}/payment-override`
- Roles: all authenticated roles.

14. `PUT /api/inventory/{inventory_id}/payment-override`
- Roles: `admin`, `director`, `cco`, `coo`, `manager`.
- Guard: if referenced by locked/posted transaction policy, reject mutation.

15. `DELETE /api/inventory/{inventory_id}/payment-override`
- Roles: `admin`, `director`, `cco`, `coo`.

16. `GET /api/projects/{project_id}/payment-overrides`
- Purpose: project-level override list for manager/admin dashboards.
- Roles: `admin`, `director`, `cco`, `coo`, `manager`.

### 1.5 Monthly Targets Upload / List / Update

17. `POST /api/targets/monthly/upload`
- Purpose: CSV bulk upload.
- Roles: `admin`, `director`, `cco`, `coo`, `manager`.
- Input columns: `rep_id,target_month,target_year,revenue_target,transaction_target,lead_target,notes`.
- Response:
```json
{ "processed": 32, "created": 20, "updated": 12, "errors": [] }
```

18. `GET /api/targets/monthly`
- Roles: all authenticated roles (scope-filtered by role).
- Query: `target_year`, `target_month`, `rep_id`, `manager_id`, `project_id` (optional join-filter).

19. `PUT /api/targets/monthly/{target_id}`
- Roles: `admin`, `director`, `cco`, `coo`, `manager`.
- Request: partial update of revenue/txn/lead targets + notes.

20. `POST /api/targets/monthly`
- Purpose: single-row create (non-upload).
- Roles: `admin`, `director`, `cco`, `coo`, `manager`.

### 1.6 Required Read Endpoints for Role-Specific Dashboards / Analytics Filters

21. `GET /api/dashboard/sales-kpis`
- Roles: `user`, `manager`, `admin`, `director`, `cco`, `coo` (role-scoped).
- Query: `month`, `year`, `rep_id`, `manager_id`, `project_id`.
- Returns: `token_amount`, `partial_down_payment_amount`, `closed_won_count`, `achieved_revenue`, `unit_vs_target`.

22. `GET /api/analytics/funnel-clickthrough`
- Roles: `admin`, `director`, `cco`, `coo`, `manager`, `user` (self/team scope).
- Query: `stage`, `campaign_id`, `assigned_rep_id`, `start_date`, `end_date`, `temperature`.

23. `GET /api/analytics/rep-aging-clickthrough`
- Roles: `admin`, `director`, `cco`, `coo`, `manager`.
- Query: `bucket=0-7|8-14|15-30|31+`, `rep_id`, `manager_id`, `campaign_id`.

24. `GET /api/analytics/export`
- Roles: `admin`, `director`, `cco`, `coo`, `manager`.
- Query: `type=funnel|aging|targets|revenue`, `format=csv|xlsx`, plus active filters.

25. `PATCH /api/customers/{cid}/temperature` and `PATCH /api/leads/{lid}/temperature`
- Roles: `admin`, `director`, `cco`, `coo`, `manager`, `user`.
- `viewer` denied.

## 2) RBAC Matrix (explicit)

`Y` allowed, `N` denied.

| Action | admin | director | cco | coo | manager | user | viewer |
|---|---|---|---|---|---|---|---|
| Create payment plan | Y | Y | Y | Y | N | N | N |
| Edit payment plan/version | Y | Y | Y | Y | N | N | N |
| Lock payment plan | Y | Y | Y | Y | N | N | N |
| Unlock payment plan | Y | Y | Y | Y | N | N | N |
| Create inventory override | Y | Y | Y | Y | Y | N | N |
| Run sync actions (lead/customer/broker sync + vector sync jobs) | Y | Y | Y | Y | Y | N | N |
| Create customers | Y | Y | Y | Y | Y | N | N |
| Edit temperatures (lead/customer) | Y | Y | Y | Y | Y | Y (scoped) | N |
| Export analytics (CSV/Excel) | Y | Y | Y | Y | Y | N | N |

Deny-by-default notes:
- Any sensitive mutation endpoint (`payment plan`, `lock/unlock`, `override`, `sync`, `export`) defaults deny unless role is explicitly allowlisted.
- New roles `director` and `coo` must be recognized by auth guard (currently role strings are checked ad hoc).
- `viewer` is read-only on all modules; no mutation routes.
- `user` cannot create customers and cannot run sync/export actions.

## 3) Endpoint Impact Map (existing API)

### 3.1 Existing endpoints to change

1. `POST /api/transactions`
- Delta request:
```json
{
  "payment_plan_version_id": "uuid|null",
  "payment_override_snapshot": {"source":"inventory_override|plan_version|legacy_default","version_id":"uuid|null"}
}
```
- Behavior: when `payment_plan_version_id` provided, installment amounts follow version percentages instead of equal split.

2. `GET /api/transactions` and `GET /api/transactions/{tid}`
- Delta response add:
```json
{
  "payment_plan_version_id": "uuid|null",
  "payment_rule_source": "inventory_override|project_plan|legacy_default",
  "down_payment_threshold_percent": 10.0
}
```

3. `POST /api/transactions/bulk-import`
- Delta: support optional column `payment_plan_version_id`; fallback resolver if blank.

4. `PUT /api/customers/{cid}` and `PUT /api/leads/{lid}`
- Delta: enforce role checks for `temperature` edits (viewer denied; user scoped).

5. `POST /api/leads/{lid}/convert`
- Delta: role guard per RBAC (`manager+` and leadership only).

6. `GET /api/analytics/campaign-metrics` / `GET /api/analytics/rep-performance`
- Delta: add role-safe filters (`manager_id`, `rep_id`, `target_month`, `target_year`, `temperature`).

7. Export/report endpoints (`/api/reports/*/excel`, `/api/reports/*/pdf` and new `/api/analytics/export`)
- Delta: add auth + role guard, currently many endpoints have no role dependency.

8. Sync endpoints (`POST /api/vector/projects/{project_id}/reconcile/sync-from-projects`, `POST /api/vector/projects/{project_id}/sync-branches`)
- Delta: restrict to `manager+` per matrix.

### 3.2 New endpoints to add

- `/api/projects/{project_id}/payment-plans` (POST, GET)
- `/api/payment-plans/{plan_id}` (GET, PUT, DELETE/archive)
- `/api/payment-plans/{plan_id}/versions` (POST, GET)
- `/api/payment-plans/{plan_id}/versions/{version_id}/activate` (POST)
- `/api/payment-plans/{plan_id}/lock` (POST)
- `/api/payment-plans/{plan_id}/unlock` (POST)
- `/api/payment-plans/{plan_id}/audit` (GET)
- `/api/inventory/{inventory_id}/payment-override` (POST, GET, PUT, DELETE)
- `/api/projects/{project_id}/payment-overrides` (GET)
- `/api/targets/monthly` (POST, GET)
- `/api/targets/monthly/upload` (POST)
- `/api/targets/monthly/{target_id}` (PUT)
- `/api/dashboard/sales-kpis` (GET)
- `/api/analytics/funnel-clickthrough` (GET)
- `/api/analytics/rep-aging-clickthrough` (GET)
- `/api/analytics/export` (GET)
- `/api/customers/{cid}/temperature` (PATCH)
- `/api/leads/{lid}/temperature` (PATCH)

### 3.3 Backward compatibility (`transactions.payment_plan_version_id IS NULL`)

- Legacy transactions remain valid; API must return `payment_plan_version_id: null`.
- Resolver for classification/reporting:
  1. check inventory override active at transaction date,
  2. else project active plan version,
  3. else `legacy_default` equal-split behavior.
- Never rewrite historical legacy transactions automatically in v1.
- For new transactions where resolver uses fallback, include `payment_rule_source="legacy_default"` for traceability.

## 4) Validation + Guardrails

### 4.1 Installment percentage validation

App-layer rules (applies to plan versions and custom overrides):
- `installments` required; min 1.
- every item requires `number`, `percentage`, `month_offset`.
- each `percentage` > 0 and <= 100.
- sum(`percentage`) must equal `100.00` within epsilon `0.01`.
- `number` values unique and sequential starting at 1.
- `month_offset` non-negative and non-decreasing.

Validation error:
```json
{
  "detail": "Installment percentages must sum to 100",
  "code": "PAYMENT_PLAN_INVALID_PERCENT_TOTAL"
}
```

### 4.2 Override precedence (documented API behavior)

For transaction plan resolution and receipt classification:
1. inventory-level override (`project_inventory_payment_overrides`),
2. active project plan version,
3. legacy fallback default.

Response field `payment_rule_source` must always disclose which layer was used.

### 4.3 Unauthorized and locked-state errors

- Unauthorized role:
```json
{
  "detail": "Role 'user' is not allowed to lock payment plans",
  "code": "RBAC_FORBIDDEN_ACTION"
}
```
HTTP `403`.

- Locked-state mutation attempt:
```json
{
  "detail": "Payment plan is locked; unlock required before mutation",
  "code": "PAYMENT_PLAN_LOCKED"
}
```
HTTP `409`.

- Unlock request missing reason:
```json
{
  "detail": "Unlock reason is required",
  "code": "PAYMENT_PLAN_UNLOCK_REASON_REQUIRED"
}
```
HTTP `400`.

---

## Current-State Notes (derived from codebase)

- Models for `project_payment_plans`, `project_payment_plan_versions`, `project_inventory_payment_overrides`, and `monthly_rep_targets` already exist in `backend/app/main.py`.
- No API routes currently exist for these models.
- `transactions` already has nullable `payment_plan_version_id`, but create/list handlers do not yet use or expose it.
- Current analytics endpoints are role-guarded, but report/export endpoints are largely open and need role enforcement.
- Current role values in code include `admin, manager, cco, user, viewer, creator`; `director` and `coo` need explicit support.
