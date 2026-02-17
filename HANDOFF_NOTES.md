# HANDOFF NOTES - Interactions + Tasks

Date: 2026-02-17
Branch context: `InteractionsUpdate` (work in progress), `Prod16thFeb` reported deployed
Workspace: `C:\Users\Malik\desktop\radius2-analytics`

## 1) What was implemented (Codex - backend)

### Task casing + visibility bug fix
- Root issue: legacy tasks had uppercase `task_type` values (`GENERAL`, `FOLLOW_UP`) while filters/config expected lowercase (`general`, `follow_up`).
- Changes made:
  - `backend/app/main.py`
    - Task model defaults updated:
      - `task_type` default: `general`
      - `priority` default: `medium`
      - `status` default: `pending`
    - Leads bulk-import duplicate task creation normalized:
      - `task_type="follow_up"`
      - `priority="high"`
  - `backend/app/services/task_service.py`
    - Added one-time legacy normalization routine:
      - Lowercases existing `Task.task_type` rows in DB (`UPDATE` equivalent via SQLAlchemy)
    - Applied case-insensitive task type filtering:
      - `func.lower(Task.task_type) == task_type.lower()`
    - Normalization hook called in:
      - `get_tasks`
      - `get_my_tasks`
      - `get_task_summary`
      - `get_executive_summary`
    - Task creation path now normalizes `task_type`/`priority` to lowercase.

### Interaction timestamp verification
- `Interaction.created_at` is server-side (`server_default=func.now()`).
- API list/details/report outputs include interaction datetime fields (`created_at` / `date` from `created_at`).

### Validation run
- `python -m py_compile backend/app/main.py backend/app/services/task_service.py backend/app/reports.py` passed.

## 2) Claude-side frontend context (reported)
- Interactions target search integrated (`/api/interactions/targets/search`).
- Quick log available from:
  - Customers tab rows
  - Brokers cards
  - Pipeline lead cards
- Interactions form supports lead/customer/broker entity linking.

## 3) Pending QA checklist (must run)

### Interactions consistency
1. From Customers & Leads tab `Log`, confirm same behavior/data shape as Interactions tab submit.
2. Confirm record appears in:
   - Interactions tab
   - Related entity history (lead/customer/broker)
   - Reports history
3. Confirm date-time shown with time (not date-only) in all interaction tables/histories.

### Tasks visibility + import behavior
1. Open Tasks without type filter and verify old test tasks appear.
2. Filter by `general` and verify legacy uppercase tasks are still visible.
3. Run a lead bulk-import with known duplicate mobile and verify:
   - `results.duplicates` increments
   - follow-up task is created
   - assignee resolution (matched rep or current user fallback)
4. Verify unassigned tasks are visible when filters include unassigned scope.

## 4) Known observations
- If bulk-import has no duplicate rows, no follow-up tasks are created by design.
- Existing missing tasks were likely mostly filter-casing + assignment/filter UI effects, not data deletion.

## 5) Deployment references
- Orbit reported live: `https://orbit-voice.duckdns.org/`
- Shared DO/POS+Orbit reference (maintained in sibling repo):
  - `C:\Users\Malik\desktop\radius2\DIGITALOCEAN_SERVER_REFERENCE.md`

## 6) Next action when resuming
1. Finish frontend parity tweaks (QuickLogModal vs Interactions modal UX + toasts + timestamp display).
2. Execute QA checklist above with screenshots/results.
3. Only then merge/cherry-pick to production branch.

## 6.1) Deployment incident note (2026-02-17)
- Orbit deploy temporarily broke public routing after container rebuild.
- Root cause: `orbit_web`/`orbit_api` lost attachment to `pos-system_default`, so POS nginx could not resolve upstreams.
- Recovery performed on server:
  - `docker network connect pos-system_default orbit_web`
  - `docker network connect pos-system_default orbit_api`
  - `docker exec pos-system-nginx-1 nginx -t && docker exec pos-system-nginx-1 nginx -s reload`
- Permanent playbook reference in this repo:
  - `DIGITALOCEAN_DEPLOY_PLAYBOOK.md`

## 7) Current project structure (as of 2026-02-17)
```text
radius2-analytics/
|- .claude/
|  |- settings.local.json
|- backend/
|  |- app/
|  |- migrations/
|  |- Dockerfile
|  |- requirements.txt
|  |- create_all_tables.sql
|  |- setup_all_tables.sql
|  |- phase2_tables.sql ... phase6_media.sql
|  |- add_tables.sql, add_auth_columns.sql, apply_indexes.sql
|  |- deployment_config.sql, optimizations.sql, init.sql
|  |- install_dependencies.py, migrate_vector_schema.py
|  |- test_endpoints.py, FIND_DB_CREDENTIALS.md
|- database/
|  |- init.sql
|  |- phase9_enhanced_crm.sql
|  |- phase10_add_sales_team.sql
|- frontend/
|  |- src/
|  |- Dockerfile
|  |- package.json, package-lock.json
|  |- vite.config.js, tailwind.config.js, postcss.config.js
|  |- index.html
|  |- dist/ (build output)
|  |- node_modules/ (local dependencies)
|- media/
|  |- interactions/
|  |- payments/
|  |- projects/
|  |- receipts/
|  |- transactions/
|- nginx/
|  |- default.conf
|- _archive/
|  |- initial_deployment_docs/
|  |- test_login.py
|- docker-compose.yml
|- docker-compose.prod.yml
|- HANDOFF_NOTES.md
|- CLAUDE.md
|- DIGITALOCEAN_DEPLOY_PLAYBOOK.md
|- IMPORT_DATA_SYNC.ps1
|- SYNC_DATA_TO_SERVER.ps1
|- switch-to-local-ports.ps1
|- revert-to-office-ports.ps1
`- STOP.ps1
```
