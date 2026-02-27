# LLM START HERE

Last updated: 2026-02-26
Scope: Canonical startup context for Claude, Codex, Cursor, and any other LLM agent working in this repo.

## 1) First-Read Order (Do Not Skip)

Read files in this exact order at session start:

1. `LLM_START_HERE.md` (this file)
2. `ERROR_LOG.md`
3. `HANDOFF_NOTES.md`
4. Latest `PAUSE_CHECKPOINT_YYYY-MM-DD.md` (if present)
5. `CLAUDE.md` for operational conventions and environment notes

If instructions conflict, precedence is:

1. User's current request in this chat
2. Safety-critical rules in `ERROR_LOG.md` and `HANDOFF_NOTES.md`
3. This file (`LLM_START_HERE.md`)
4. Older checkpoint notes

## 2) Session-Zero Sanity Check

Run these before making changes:

```powershell
git status --short
git branch --show-current
git rev-parse --short HEAD
```

Then confirm:

- Current branch
- Dirty/untracked files already present
- Whether your task touches local dev (`5440/8010/5180`), office/prod (`5435/8001/8081`), or DO server

Never revert unrelated existing changes.

## 3) Project Structure Snapshot

Top-level layout:

- `backend/` FastAPI + SQLAlchemy app (`backend/app/main.py` is core monolith)
- `frontend/` React + Vite app (`frontend/src/App.jsx` is core monolith)
- `database/` SQL migrations + migration generators
- `scripts/` utility scripts
- `media/`, `media_demo/` uploaded files and demo artifacts
- `docker-compose.yml` local dev stack
- `docker-compose.prod.yml` production compose reference
- `docker-compose.demo.yml` demo environment compose

## 4) Environments and Ports

Local dev (default in this worktree):

- DB: `postgresql://sitara:sitara123@localhost:5440/sitara_crm`
- API: `http://localhost:8010`
- Frontend: `http://localhost:5180`

Office/production host (from docs):

- DB: `postgresql://sitara:sitara_secure_2024@localhost:5435/sitara_crm`
- API: `http://localhost:8001`
- Frontend: `http://localhost:8081`

Do not assume local and production contain the same data.

## 5) Non-Negotiable Guardrails

### 5.1 Docker Volume Safety

Do not change these volume names:

- Local: `radius2_sitara_v3_postgres`
- Production: `sitara_postgres_data`

Do not remove `external: true` from these volume declarations.

### 5.2 Migration Safety

Never run untested SQL directly on production.

Required pattern:

1. Clone prod DB to test DB
2. Run migration on test DB
3. Validate counts/data
4. Run on production only after validation
5. Drop test DB
6. Restart API

### 5.3 DO Co-Hosting Safety

This system co-hosts Orbit and POS. Do not touch POS services.

After any Orbit rebuild on DO, reconnect networks:

```bash
docker network connect pos-system_default orbit_web
docker network connect pos-system_default orbit_api
docker exec pos-system-nginx-1 nginx -t && docker exec pos-system-nginx-1 nginx -s reload
```

Never run broad destructive cleanup like `docker system prune -a`.

TLS routing note (2026-02-27):
- If `orbit-voice.duckdns.org` shows `ERR_CERT_COMMON_NAME_INVALID`, verify POS nginx is actually loading `voice.conf`.
- Host file presence is not enough; confirm mount exists in POS compose (`./docker/nginx/voice.conf:/etc/nginx/conf.d/voice.conf:ro`) and is visible in container `/etc/nginx/conf.d/`.
- `pos-system-nginx-1` uses read-only rootfs, so `docker cp` hotfixes into container will fail.
- For POS demo compose commands on this host, use `--env-file .env.demo`.

## 6) Known Runtime Behavior (Do Not Misdiagnose)

- Vite proxy `ECONNREFUSED` during first ~30s after cold start can be expected while API becomes healthy.
- Frontend hot reload can miss changes on Windows bind mounts; restart `orbit_dev_web` if UI seems stale.
- Backend code changes are not auto-reloaded with current worker mode; restart `orbit_dev_api`.
- Dependency changes in `requirements.txt` or `package.json` require container rebuild.

Full recurring patterns and fixes are in `ERROR_LOG.md`.

## 7) Data Quality and Lookup Rules (Important)

### 7.1 Mobile normalization convention

Use canonical PK format `03XXXXXXXXX` for local mobile storage where possible.

Examples:

- `+923001239856` -> `03001239856`
- `923001239856` -> `03001239856`
- `3001239856` -> `03001239856`

### 7.2 "Record not found" decision rule

When updating known entities, do not rely only on phone search.

Always check in this order:

1. Name search (case-insensitive)
2. Name variant search (for spelling/company variants)
3. Placeholder mobile search (`mobile LIKE 'PENDING-%'` or `mobile LIKE 'PNDG-%'`)
4. Leads table checks if customer/broker not found

### 7.3 Special known trap (Batch placeholder updates)

For Sitara/CityWalk migration-era records, real numbers may be absent because placeholders were inserted first.
In those cases, workflow is usually:

1. locate by name/placeholder row
2. normalize provided phone
3. update existing row
4. avoid duplicate inserts unless truly missing

### 7.4 Specific identity mapping to preserve

For Sitara Square batch 3 data maintenance, remember this mapping:

- `Asim Irshad` is a customer-side record (historically placeholder mobile `PENDING-SHOP-26`)
- `Arshad Jutt` is a broker-side record (historically placeholder mobile `PENDING-BRK-S26`)
- `Best Builder`/`Best Builders` refers to broker-side entity (historically placeholder mobile `PENDING-BRK-S41`)

If phone-based lookup returns nothing, check these by name and placeholder context before deciding to insert.

## 8) Current Working-State Snapshot

Validated in this workspace on 2026-02-26:

- Branch: `master`
- HEAD: `2c7fc21`
- Existing local changes include `.claude/settings.local.json` and demo-related untracked files (`docker-compose.demo.yml`, demo scripts, `media_demo/`, etc.)

Treat this state as baseline context, not something to clean up automatically.

## 9) Fast Verification Queries

Use these patterns before claiming data is missing:

```sql
-- Customers by name
SELECT customer_id, name, mobile, notes
FROM customers
WHERE lower(name) LIKE '%<name_fragment>%';

-- Brokers by name
SELECT broker_id, name, mobile, notes
FROM brokers
WHERE lower(name) LIKE '%<name_fragment>%';

-- Placeholder records
SELECT customer_id, name, mobile, notes FROM customers WHERE mobile LIKE 'PENDING-%' OR mobile LIKE 'PNDG-%';
SELECT broker_id, name, mobile, notes FROM brokers WHERE mobile LIKE 'PENDING-%' OR mobile LIKE 'PNDG-%';
```

## 10) Definition of Done for Agent Tasks

Before handing off:

1. State files changed
2. State commands run
3. State validation/test result (or what could not be run)
4. Call out risks or assumptions
5. If an error was newly discovered and fixed, append to `ERROR_LOG.md`

If using numbered cross-agent messaging, append entry to `AGENT_HANDOFF_LOG.md` following `AGENT_MESSAGE_PROTOCOL.md`.

## 11) Recommended Startup Prompt (Copy/Paste)

Use this when refreshing memory in a new session:

```text
Read LLM_START_HERE.md first, then ERROR_LOG.md and HANDOFF_NOTES.md.
Confirm current git branch/HEAD/dirty state.
Do not assume production data equals local data.
For data updates, search by name and placeholders before phone.
Then summarize understanding in 10 bullets before making changes.
```
