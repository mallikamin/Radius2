# Claude-Codex Collaboration Plan - CCO 21 Feb Changes

## Context
- Branch: `wip/CCO21stFebChanges`
- Owner: MasterCodex (lead orchestrator)
- Execution model: MasterCodex delegates implementation packets to Claude/Codex; all replies route back to MasterCodex.

## Scope to Implement
1. Flexible project-level payment rules with lock control and inventory-level override support.
2. Receipt allocation logic tied to locked payment rules.
3. Role-segmented dashboards for Sales Reps/Managers vs Admin/Director/CCO/COO.
4. Clickable analytics funnels + rep lead aging with exports.
5. Customer & Leads UX updates (Pipeline renamed to Leads, new columns/layout, follow-up tabs).
6. Interactions form taxonomy/status redesign.
7. Access restrictions for customer creation and lead/customer/broker sync operations.
8. Monthly targets framework (manager uploads; dashboards consume targets).

## Architecture and Integration Plan

### 1) Payment Rules Engine + Locking
- Add a normalized rule model:
  - `project_payment_plans` (project-level base rule, lock metadata, active version).
  - `project_payment_plan_versions` (versioned percentages/labels).
  - `project_inventory_payment_overrides` (per inventory override for exceptional 10% units).
- Core fields per version:
  - `installment_count`
  - `installment_percentages_json` (must total 100)
  - `down_payment_threshold_percent` (`x`, default first installment percent but explicitly stored)
  - `effective_from`, `effective_to`, `is_active`
- Lock behavior:
  - Editable only while unlocked.
  - Once locked, rule mutations require privileged unlock flow.
  - Audit trail: actor, timestamp, old/new payload.

### 2) RBAC Rules
- Can create/edit/lock/unlock payment plans: `admin`, `director`, `cco`, `coo`.
- Can view only: `manager`, `user` (sales rep), `viewer`.
- No customer creation for sales reps (`role=user`).
- Lead/customer/broker sync actions only for `manager`, `director`, `cco`, `coo`, `admin`.

### 3) Receipt Allocation Logic
- Receipt posting pipeline computes cumulative paid against transaction value.
- Classification by cumulative percentage:
  - `0% <= paid < 10%` -> `TOKEN_MONEY`
  - `10% <= paid < x%` -> `PARTIAL_DOWN_PAYMENT`
  - `paid >= x%` -> `DOWN_PAYMENT_COMPLETED`
- `x` comes from locked payment rule resolved in order:
  1. inventory override
  2. active locked project rule
  3. fallback system default (guardrail, only if legacy data)
- System auto-tags receipt allocation rows and exposes summary aggregates by class.

### 4) Dashboard Segmentation
- Sales Reps/Managers dashboard KPIs:
  - Tokens (total token amount)
  - Partial Down Payments (total)
  - Closed Won Cases (count)
  - Achieved Revenue
  - Project Unit/Target (units sold vs assigned monthly target)
- Admin/Director/CCO/COO dashboards keep global/filtered overview and can filter by rep/manager.

### 5) Targets Framework
- Add monthly target model:
  - `monthly_rep_targets` with project, rep, month, target_units, optional target_revenue.
- Manager upload template endpoint + parser.
- Dashboard joins sold units by month against targets; show completion percent and variance.

### 6) Analytics Clickthrough + Export
- Campaign conversion funnel cards become clickable and open filtered lead list.
- Rep lead aging widgets become clickable and open filtered lead list.
- Filters:
  - Sales rep view: self scope only.
  - Admin/Director/CCO/COO: filter by rep/manager/team.
- Export options on filtered views: CSV and Excel.

### 7) Customer & Leads UX Changes
- Rename Pipeline to Leads in UI labels/routes where applicable.
- Leads table layout:
  - Lead ID
  - Lead Name
  - Last Interaction
  - Source
  - Allocated To
  - Actions
- Add left tab window in Customer & Leads:
  - Main Leads
  - Pending Follow-ups
  - Overdue Follow-ups
- Follow-up tabs use `next_follow_up` date logic.

### 8) Interactions Taxonomy Update
- For `Call`, status becomes dropdown: `Connected`, `Attempted`.
- Replace broad `Message` with channel-aware options:
  - `WhatsApp (Call, Message)`
  - `Meeting (Arrange, Done @ Site Office, Done @ Client Office, Done @ Head Office/Inhouse)`
- Add consolidated lead/customer temperature field:
  - `Hot`, `Mild`, `Cold`
  - Stored on lead/customer profile, surfaced in actions and list views.

## Delivery Phases
1. Data model + migrations + seed-safe backfill.
2. Backend APIs + RBAC enforcement.
3. Receipt allocator + regression tests.
4. Frontend UX updates (Leads, Interactions, dashboards).
5. Analytics clickthrough + export.
6. QA, UAT checklist, rollout guards.

## Delegation Queue (Prescribed Output Format)

Output#3  
Recipient: Claude  
Sender: MasterCodex  
Task: Phase 1 - DB design + migrations for payment plans, overrides, targets, and temperature fields  
In-Reply-To: Output#2  
Status: REQUEST  
Notes: Include migration SQL + rollback notes + backfill script for legacy transactions.

Output#4  
Recipient: Codex  
Sender: MasterCodex  
Task: Phase 2 - Backend API contract draft + RBAC matrix + endpoint impact map  
In-Reply-To: Output#3  
Status: REQUEST  
Notes: Must include role guards for lock/unlock, sync permissions, and customer-create restriction.

Output#5  
Recipient: Claude  
Sender: MasterCodex  
Task: Phase 3 - Receipt classification service and tests (token/partial/down-payment by locked x%)  
In-Reply-To: Output#4  
Status: REQUEST  
Notes: Cover incremental receipts, edge percentages, override precedence, and legacy fallback.

Output#6  
Recipient: Codex  
Sender: MasterCodex  
Task: Phase 4 - Frontend UX delivery (Leads layout, follow-up tabs, interactions dropdowns, segmented dashboards)  
In-Reply-To: Output#5  
Status: REQUEST  
Notes: Keep admin vs rep views isolated by role and align labels to Leads.

Output#7  
Recipient: Claude  
Sender: MasterCodex  
Task: Phase 5 - Analytics clickthrough and CSV/Excel export plumbing  
In-Reply-To: Output#6  
Status: REQUEST  
Notes: Click from funnel + lead aging into filtered list; enforce scope by role.

Output#8  
Recipient: Codex  
Sender: MasterCodex  
Task: Phase 6 - Integration QA checklist, smoke tests, and rollout plan  
In-Reply-To: Output#7  
Status: REQUEST  
Notes: Include API tests + UI path tests + permission boundary tests.

## Required Agent Reply Format (to MasterCodex)
Use this exact structure:

```text
Output#<N>
Recipient: MasterCodex
Sender: <Claude|Codex>
Task: <task id/title>
In-Reply-To: Output#<M>
Status: <IN_PROGRESS|BLOCKED|DONE>

Processed Output#<M>
Files changed: <list or none>
Commands run: <list or none>
Test/build result: <pass/fail/not run + brief reason>
Risks/Blockers: <short list or none>
Next handoff: <who should receive next output>
```

## Guardrails
- No edits to unrelated dirty files in the repository.
- No payment rule mutation once locked unless privileged unlock path is used.
- Always compute receipt classification from cumulative paid percentage, not single-receipt percentage.
- Exports must reflect active filters and role scope.
