# Orbit CRM Error Log

Cumulative log of errors encountered and fixed. **Any agent (Claude, Codex, Cursor, DeepSeek) MUST read this file before making changes** to avoid repeating known mistakes. Append new entries when fixing errors.

---

## Format

```
### [DATE] — Short title
- **Error**: Exact error message or symptom
- **Context**: What was being done when it happened
- **Root Cause**: Why it happened
- **Fix**: What was changed
- **Rule**: What to do differently going forward
```

---

## CRITICAL — Recurring Container Errors (READ FIRST)

These errors come up repeatedly across agents. If you hit any of them, the fix is documented — don't waste time debugging.

### RECURRING-1 — Vite proxy ECONNREFUSED to API on container startup

- **Error**: `[vite] http proxy error: /api/... Error: connect ECONNREFUSED 172.30.0.3:8000`
- **Context**: Local dev — `orbit_dev_web` starts before `orbit_dev_api` is healthy
- **Root Cause**: `docker-compose.yml` web service has `depends_on: - api` but does NOT use `condition: service_healthy`. The API takes 10-30s to boot (uvicorn + DB connection), but Vite starts instantly and begins proxying to a not-yet-ready API.
- **Fix**: This is **expected on cold start** — it self-resolves once the API is healthy (~30s). NOT a real error.
- **Rule**: Ignore ECONNREFUSED errors in `orbit_dev_web` logs during the first 30s after `docker compose up`. If they persist beyond 60s, check if the API container is healthy: `docker inspect orbit_dev_api --format '{{.State.Health.Status}}'`

### RECURRING-2 — Frontend changes not visible after edit (HMR miss on Windows)

- **Error**: Code changes saved to `frontend/src/App.jsx` but browser shows old version
- **Context**: Local dev on Windows — Vite HMR doesn't fire because Windows→Linux bind mounts don't always trigger inotify events
- **Root Cause**: Docker bind mount from Windows NTFS to Linux ext4 inside container — filesystem events don't propagate reliably
- **Fix**: `docker restart orbit_dev_web` → wait 5s → hard refresh browser (Ctrl+Shift+R)
- **Rule**: **EVERY TIME** you edit frontend files, restart the web container before telling the user to test. Never say "changes are ready" without doing this first.

### RECURRING-3 — Backend code changes ignored after edit (no --reload)

- **Error**: Edited `backend/app/main.py` on host but API still serves old logic
- **Context**: Local dev `orbit_dev_api` uses `--workers 2` (no `--reload` flag). Production API Dockerfile uses `COPY . .` — container has its own copy.
- **Root Cause**: Local dev bind-mounts `./backend/app:/app/app` so changes ARE visible inside the container, BUT uvicorn with `--workers 2` and no `--reload` flag does NOT watch for file changes.
- **Fix**:
  - **Local dev**: `docker restart orbit_dev_api` (bind mount means no rebuild needed)
  - **Production/DO**: `docker compose up -d --build orbit_api` (must rebuild — Dockerfile uses COPY)
  - **Office server**: `docker compose up -d --build` in `C:\Docker\SitaraCRM`
- **Rule**: After backend edits: local = restart, production = rebuild. `restart` alone on production does NOT work.

### RECURRING-4 — New pip/npm dependency not found in container

- **Error**: `ModuleNotFoundError: No module named 'xxx'` or `Cannot find module 'xxx'`
- **Context**: Agent adds a new dependency to `requirements.txt` or `package.json`, but doesn't rebuild the container image
- **Root Cause**: Dependencies are installed at image build time (`RUN pip install` / `RUN npm install`). Editing the requirements file on host doesn't install anything inside the running container.
- **Fix**: Rebuild the affected container: `docker compose up -d --build api` or `docker compose up -d --build web`
- **Rule**: Any change to `requirements.txt` or `package.json` requires `--build` flag on next `docker compose up`.

### RECURRING-5 — API container exits with import error on startup

- **Error**: `orbit_dev_api` or `orbit_api` exits immediately after start, logs show Python ImportError or SyntaxError
- **Context**: Agent edited `main.py` with a syntax error, missing import, or circular import
- **Root Cause**: Uvicorn tries to import `app.main:app` at startup — any import-time error kills the process
- **Fix**: Check logs: `docker logs orbit_dev_api --tail=50`. Fix the Python error. Then restart: `docker restart orbit_dev_api`
- **Rule**: Before restarting API after edits, validate syntax: `python -m py_compile backend/app/main.py`. For services: `python -m py_compile backend/app/services/task_service.py` etc. This catches 90% of startup crashes.

### RECURRING-6 — Frontend container build fails on large App.jsx

- **Error**: `orbit_dev_web` fails to start or Vite crashes with out-of-memory
- **Context**: `App.jsx` is 8000+ lines. Vite dev server can struggle with very large single files
- **Root Cause**: Memory limit in Docker container for Node.js
- **Fix**: If Vite crashes with OOM, increase memory limit or restart Docker Desktop. Usually a simple `docker restart orbit_dev_web` fixes transient crashes.
- **Rule**: Monitor `docker logs orbit_dev_web` after restart. If Vite repeatedly fails, check Docker Desktop → Settings → Resources → Memory (should be ≥4GB).

---

## CRITICAL — Deployment Errors

### RECURRING-7 — Stale JS chunks after frontend deploy to DO/Office

- **Error**: Browser loads old JavaScript, shows stale UI or 404 on JS chunk files
- **Context**: SCP'd new `dist/` to server but old files remain (SCP merges, doesn't clean)
- **Root Cause**: `index.html` references `index-NEWHASH.js` but old `index-OLDHASH.js` still exists. Some CDN/browser caching may serve stale `index.html`.
- **Fix**: **Always clean dist before uploading**:
  ```bash
  ssh root@159.65.158.26 "rm -rf ~/orbit-crm/frontend/dist/*"
  ```
  Then SCP fresh dist. Then restart nginx.
- **Rule**: NEVER SCP dist without cleaning first. This is step 2 in the deploy playbook — don't skip it.

### RECURRING-8 — DO site goes dark after container rebuild (POS network disconnect)

- **Error**: `https://orbit-voice.duckdns.org/` returns connection reset / silent drop (HTTP 444)
- **Context**: Ran `docker compose up -d --build orbit_api` on DO server
- **Root Cause**: Container rebuild removes runtime network attachments. Orbit containers lose `pos-system_default` membership. POS nginx can't reach them anymore.
- **Fix**: Reconnect after EVERY rebuild:
  ```bash
  docker network connect pos-system_default orbit_web
  docker network connect pos-system_default orbit_api
  docker exec pos-system-nginx-1 nginx -s reload
  ```
- **Rule**: This must happen AFTER rebuild completes (not in parallel). See `DIGITALOCEAN_DEPLOY_PLAYBOOK.md` step 7.

### RECURRING-9 — Network reconnect run too early (race condition)

- **Error**: Network connect succeeds but site still down after deploy
- **Context**: Agent ran `docker network connect` while `docker compose up --build` was still running
- **Root Cause**: The build step recreates the container — any network connect done before recreation is lost
- **Fix**: Wait for rebuild to complete, THEN connect. Verify with:
  ```bash
  docker inspect orbit_api -f '{{json .NetworkSettings.Networks}}' | python3 -m json.tool
  ```
  Must include `pos-system_default`.
- **Rule**: Deploy is strictly sequential: rebuild → wait → connect → reload nginx → verify.

---

## Historical Errors

### HISTORICAL — Docker volume name change causes silent total data loss
- **Error**: All CRM data disappeared after `docker compose up`
- **Context**: Changing docker-compose.yml volume names or removing `external: true`
- **Root Cause**: Docker volume names are immutable. Changing the name silently creates a new empty volume.
- **Fix**: Restored from backup. Volume config locked in CLAUDE.md.
- **Rule**: NEVER change volume `name:` or remove `external: true`. Dev: `radius2_sitara_v3_postgres`. Prod: `sitara_postgres_data`.

### HISTORICAL — Task type casing mismatch
- **Error**: Tasks not appearing when filtered by type
- **Context**: Legacy tasks had uppercase values, filters expected lowercase
- **Root Cause**: No normalization at write or read time
- **Fix**: One-time normalization + case-insensitive filtering + lowercase on create
- **Rule**: Normalize enum-like string fields to lowercase at write time. Case-insensitive comparison at read time.

### HISTORICAL — Host filesystem != container filesystem
- **Error**: File exists on host but container build fails
- **Context**: File created after container was built, or bind mount gap
- **Root Cause**: Agent verified on host, not inside container
- **Fix**: Always verify inside container: `docker compose exec <service> ls <path>`
- **Rule**: Container is source of truth. Check `docker compose logs --tail=20` for build errors.

### 2026-02-17 — Interaction timestamp missing time component
- **Error**: Interaction list shows date-only instead of date+time
- **Context**: API list/details/report outputs for interactions
- **Root Cause**: `Interaction.created_at` uses `server_default=func.now()` which includes time, but frontend display may truncate
- **Fix**: Verified backend sends full datetime. Frontend display format was the issue.
- **Rule**: Always check both backend response shape AND frontend display formatting when datetime appears wrong.

### 2026-02-19 — Deploy race: network reconnect lost after API rebuild
- **Error**: Orbit frontend looked up, but API path could fail after deploy.
- **Context**: `docker network connect pos-system_default orbit_api` was run before `docker compose up -d --build orbit_api` fully finished.
- **Root Cause**: API container was recreated after connect, so runtime-only network attach was lost.
- **Fix**: Re-ran network connect after rebuild completed, then reloaded POS nginx.
- **Rule**: Deploy must be serialized: rebuild API -> connect networks -> reload nginx -> verify network membership.

### 2026-02-19 — Windows SCP path/wildcard pitfalls on manual deploy
- **Error**: SCP failed when using wildcard paths and missing remote directories.
- **Context**: Uploading frontend dist and migration SQL from Windows.
- **Root Cause**: Shell/path expansion differences plus missing `~/orbit-crm/backend/migrations` directory on server.
- **Fix**: Use `scp -r frontend/dist/. root@...:~/orbit-crm/frontend/dist/` and create remote dirs with `mkdir -p` before copy.
- **Rule**: Avoid wildcard-dependent SCP on Windows and always ensure remote path exists first.

### 2026-02-20 — Codex Phase 2 reported missing sales-kpis endpoint (500)
- **Error**: `GET /api/dashboard/sales-kpis` returned 500 Internal Server Error
- **Context**: Phase 6 QA — Codex smoke testing newly added endpoints
- **Root Cause**: Endpoint referenced `Transaction.sales_rep_id` which doesn't exist — correct field is `Transaction.company_rep_id`
- **Fix**: Codex hotfix replaced `sales_rep_id` with `company_rep_id`, restarted API
- **Rule**: When writing queries on models, verify column names against the model class, not assumptions. `Transaction` model uses `company_rep_id` not `sales_rep_id`.

### 2026-02-21 — Receipts not showing in customer reports after data migration
- **Error**: Customer report "Receipts Summary" section empty despite "Total Received" showing correct value
- **Context**: Sitara Square data migration set `installments.amount_paid` but did not create Receipt records
- **Root Cause**: Report has two data sources: `total_received` from `SUM(installments.amount_paid)`, but `receipts` section queries the `receipts` table directly. Migration only updated installments.
- **Fix**: Created `sitara_square_receipts_sync.sql` — generates Receipt + ReceiptAllocation records matching installment payments
- **Rule**: When importing historical payment data, ALWAYS create both installment `amount_paid` AND corresponding Receipt + ReceiptAllocation records. These must stay in sync.

---

## Quick Reference: Pre-Flight Checks

### Before editing backend code:
```bash
# After edits, validate syntax:
python -m py_compile backend/app/main.py
# Restart (local):
docker restart orbit_dev_api
```

### Before editing frontend code:
```bash
# After edits, restart web container (HMR unreliable on Windows):
docker restart orbit_dev_web
# Wait 5s, then tell user to Ctrl+Shift+R
```

### Before deploying to DO (FRONTEND-ONLY — no container restarts):
1. Build locally: `cd frontend && ./node_modules/.bin/vite build`
2. Clean dist: `ssh root@159.65.158.26 "rm -rf ~/orbit-crm/frontend/dist/*"`
3. SCP files: `scp -r frontend/dist/* root@159.65.158.26:~/orbit-crm/frontend/dist/`
4. Verify JS hash: `ssh root@159.65.158.26 "ls ~/orbit-crm/frontend/dist/assets/index-*.js"`
5. **VERIFY site works (NO -k flag!)**: `curl -s -o /dev/null -w '%{http_code}' https://orbit-voice.duckdns.org`
6. Must return 200. If exit code 60 (SSL error) — cert is broken, investigate nginx SSL config.
7. **VERIFY SSL cert**: `openssl s_client -connect 159.65.158.26:443 -servername orbit-voice.duckdns.org 2>/dev/null | openssl x509 -noout -subject` → must show `CN = orbit-voice.duckdns.org`

### Before deploying to DO (BACKEND changes — requires API rebuild):
1. SCP backend files: `main.py`, `services/`
2. Rebuild API: `docker compose up -d --build orbit_api`
3. WAIT for rebuild to complete
4. Reconnect networks: `docker network connect pos-system_default orbit_web && docker network connect pos-system_default orbit_api`
5. Reload nginx: `docker exec pos-system-nginx-1 nginx -s reload`
6. Verify network: `docker network inspect pos-system_default --format '{{range .Containers}}{{.Name}} {{end}}'`
7. **VERIFY site works (NO -k flag!)**: `curl -s -o /dev/null -w '%{http_code}' https://orbit-voice.duckdns.org`
8. **VERIFY SSL cert**: `openssl s_client -connect 159.65.158.26:443 -servername orbit-voice.duckdns.org 2>/dev/null | openssl x509 -noout -subject`

### ABSOLUTE PROHIBITIONS during Orbit deploy:
- NEVER `docker restart orbit_web` (changes IP, breaks nginx routing)
- NEVER `docker compose up -d` in `~/pos-system/` (recreates ALL POS containers)
- NEVER replace ssl directory with symlinks (Docker can't follow host symlinks)
- NEVER declare "deploy complete" without curl verification
- NEVER use `curl -k` for final deployment verification (hides SSL cert errors — caused 25 Mar 2026 incident)
- NEVER use `server_name _;` catch-all for multi-domain SSL nginx (serves wrong cert for non-default domains)

### Before DB migrations:
1. Create test DB first (see HANDOFF_NOTES.md Section 2)
2. Run migration on test, validate
3. Only then run on production
4. Drop test DB after

### 2026-02-25 � EOI create endpoint failed on non-UUID project/customer/broker refs
- **Error**: `EOI create error: invalid input syntax for type uuid: "PRJ-0999"`
- **Context**: Smoke test using business IDs like `PRJ-0999`, `CUST-0001`, `INV-99901`
- **Root Cause**: EOI resolver helpers compared UUID columns directly against non-UUID business keys in OR filters, forcing invalid casts in PostgreSQL.
- **Fix**: Added UUID-safe resolvers (`_resolve_eoi_project/_broker/_customer/_inventory`, `_resolve_eoi_record`) using parse-first fallback logic.
- **Rule**: Never OR-compare UUID columns with string business IDs directly; use UUID parsing fallback or helper like `find_entity`.

### 2026-02-25 � Media upload 500 for `uploaded_by_rep_id=REP-0001`
- **Error**: `/api/media/upload` returned 500 with `invalid input syntax for type uuid: "REP-0001"`
- **Context**: EOI attachment upload during smoke test
- **Root Cause**: Uploader lookup queried `(CompanyRep.id == uploaded_by_rep_id) | (CompanyRep.rep_id == uploaded_by_rep_id)` where first predicate attempted UUID cast of rep code.
- **Fix**: Switched uploader lookup to UUID-safe helper `find_entity(db, CompanyRep, "rep_id", uploaded_by_rep_id)`.
- **Rule**: For mixed UUID/business-key inputs, always use UUID-safe entity resolver helpers in upload/action endpoints.

### 2026-02-25 � Receipts list filter failed when transaction_id passed as TXN code
- **Error**: `/api/receipts?transaction_id=TXN-...` returned empty due hidden UUID cast failure path.
- **Context**: Smoke verification after EOI conversion.
- **Root Cause**: Query compared `Transaction.id` UUID directly with string code in OR clause.
- **Fix**: Switched transaction lookup in receipts list to UUID-safe helper `find_entity(db, Transaction, "transaction_id", transaction_id)`.
- **Rule**: Use UUID-safe entity resolvers for all query filters that accept business IDs.

### 2026-03-07 — lead_id_seq out of sync after bulk import (UniqueViolation)
- **Error**: `duplicate key value violates unique constraint "leads_lead_id_key" DETAIL: Key (lead_id)=(LEAD-00057) already exists` — manual lead creation fails
- **Context**: Sales team tried creating new leads after 8,543 leads were bulk-imported via `raw_leads_migration.sql` on 24 Feb
- **Root Cause**: The bulk migration inserted explicit `lead_id` values (LEAD-00031 to LEAD-08573), which bypasses the trigger's `nextval('lead_id_seq')` call because of the condition `WHEN (NEW.lead_id IS NULL)`. The sequence remained stuck at ~57 while 8,543 leads existed.
- **Fix**: `SELECT setval('lead_id_seq', (SELECT MAX(CAST(SUBSTRING(lead_id FROM 6) AS INTEGER)) FROM leads));` — returned 8573. Ran directly on prod DB via `docker exec orbit_db psql`.
- **Rule**: After ANY bulk SQL import that inserts explicit entity_id values (bypassing triggers), ALWAYS run `setval('<entity>_id_seq', ...)` to sync the sequence to the max existing ID. This applies to ALL entity tables (leads, customers, brokers, transactions, etc.) that use the `WHEN (NEW.<field> IS NULL)` trigger pattern.

### 2026-03-25 — CRITICAL: Frontend-only deploy caused full site outage (1+ hour downtime)

- **Error**: Both `orbit-voice.duckdns.org` and `pos-demo.duckdns.org` returned 502/444/000 for ~1 hour
- **Context**: Simple task — grant EOI access to 3 users (frontend-only change). Agent built new frontend, SCP'd to server, then ran `docker restart orbit_web`.
- **Root Cause (chain of failures)**:
  1. `docker restart orbit_web` gave the container a **new IP address** (172.18.0.7 → 172.18.0.5)
  2. POS nginx had the old IP cached → 502 Bad Gateway for Orbit
  3. Agent tried `docker exec pos-system-nginx-1 nginx -s reload` but POS nginx was in crash-loop (unrelated SSL issue)
  4. Agent replaced SSL symlink directory, breaking Docker volume mount (Docker cannot follow host-to-host symlinks in bind mounts)
  5. Agent ran `docker compose -f docker-compose.prod.yml up -d` which **recreated ALL POS containers** (not just nginx)
  6. POS backend entered unhealthy state, blocking nginx startup
  7. Both sites completely down
- **Fix**:
  1. Copied actual SSL cert files (not symlinks) to `~/pos-system/docker/nginx/ssl/`
  2. Created proper dual-domain nginx.conf with separate server blocks for `pos-demo.duckdns.org` and `orbit-voice.duckdns.org`
  3. Manually created nginx container with `docker run` (not docker-compose) to avoid touching POS services
  4. Both sites restored
- **Rules (MANDATORY for all agents)**:
  1. **NEVER `docker restart orbit_web` for frontend-only deploys.** Just SCP new dist files — nginx serves them immediately. The container does NOT need restart for static file changes.
  2. **NEVER touch POS containers during Orbit deploy.** If POS nginx has issues, investigate — don't blindly recreate.
  3. **Docker cannot follow host symlinks in bind mounts.** Always use real files, never symlinks, in mounted directories.
  4. **`docker compose up -d --force-recreate <service>` recreates ALL dependencies** — it is NOT scoped to just that service. Use `docker run` or `docker start/stop` for isolated container operations.
  5. **ALWAYS verify site accessibility with `curl` BEFORE declaring deploy complete.** Never trust `docker ps` alone.
  6. **Frontend-only deploy checklist**: Build → Clean dist → SCP → Verify JS hash on server → curl test. NO container restarts needed.

### 2026-02-27 - SSL cert mismatch on Orbit domain (wrong cert served)
- **Error**: Browser showed `net::ERR_CERT_COMMON_NAME_INVALID` on `https://orbit-voice.duckdns.org/`; served cert CN was `pos-demo.duckdns.org`.
- **Context**: Nginx on `pos-system-nginx-1` was expected to serve Orbit TLS config from `voice.conf`.
- **Root Cause**:
  - `~/pos-system/docker/nginx/voice.conf` existed but was not mounted into `/etc/nginx/conf.d/` in `docker-compose.demo.yml`.
  - `docker cp` quick fix failed because container root filesystem is read-only (`read_only: true`).
  - Running `docker compose` without `--env-file .env.demo` caused service startup failures due missing env vars.
- **Fix**:
  - Added compose mount: `./docker/nginx/voice.conf:/etc/nginx/conf.d/voice.conf:ro` under POS nginx service.
  - Recreated nginx with env file: `docker compose -f docker-compose.demo.yml --env-file .env.demo up -d nginx`.
  - Verified active cert via `openssl s_client` shows `subject=CN = orbit-voice.duckdns.org`.
- **Rule**:
  - Never rely on `docker cp` for `pos-system-nginx-1`; config is immutable at runtime due read-only rootfs.
  - For POS demo compose actions, always include `--env-file .env.demo`.
  - If Orbit shows CN mismatch, first verify `voice.conf` is mounted in `/etc/nginx/conf.d/` and loaded by `nginx -T`.

### 2026-03-08 - Live Orbit TLS mount repaired without touching POS or Orbit data
- **Error**: User could open `https://orbit-voice.duckdns.org/` only with Chrome privacy warning `ERR_CERT_COMMON_NAME_INVALID`.
- **Context**: Orbit containers and DB were still running, but POS nginx was serving the wrong certificate for the Orbit domain.
- **Root Cause**: The live droplet copy of `~/pos-system/docker-compose.demo.yml` still lacked `./docker/nginx/voice.conf:/etc/nginx/conf.d/voice.conf:ro`, so `pos-system-nginx-1` loaded only `default.conf`.
- **Fix**:
  - Backed up the live compose file to `~/pos-system/docker-compose.demo.yml.bak_orbit_tls_20260308_1135`.
  - Added only the missing `voice.conf` mount line on the droplet.
  - Validated with `docker compose -f docker-compose.demo.yml --env-file .env.demo config -q`.
  - Recreated only `pos-system-nginx-1`.
  - Verified `/etc/nginx/conf.d/voice.conf` existed in-container, the public cert CN was `orbit-voice.duckdns.org`, and `curl -sk https://orbit-voice.duckdns.org/api/health` returned healthy from the droplet.
- **Rule**:
  - For Orbit TLS/certificate mismatches on this host, debug shared nginx mounts first, not Orbit app code or git history.
  - Preserve POS and Orbit data by limiting the repair to the nginx config mount plus `docker compose ... up -d nginx`; do not rebuild app or DB containers for this class of issue.

### 2026-03-25 — SSL cert domain mismatch: `curl -k` masked broken SSL on both domains
- **Error**: Browser showed "Your connection is not private" on `https://orbit-voice.duckdns.org/` (both mobile and desktop). Certificate CN was `pos-demo.duckdns.org` — wrong cert served for Orbit domain.
- **Context**: After mobile optimization deploy. We declared deploy "successful" using `curl -k` which bypasses SSL validation entirely.
- **Root Cause**: POS nginx had a single catch-all `server_name _;` server block using only the POS SSL cert (`fullchain.pem` for `pos-demo.duckdns.org`). Orbit-specific certs (`orbit-fullchain.pem`, `orbit-privkey.pem`) existed on the server at `~/pos-system/docker/nginx/ssl/` but were NOT wired into any nginx server block. SNI needs per-domain server blocks to serve the correct cert.
- **Fix**: Split the single nginx server block into two SNI-aware server blocks:
  - `server_name pos-demo.duckdns.org` → `fullchain.pem` / `privkey.pem` + POS upstream routing
  - `server_name orbit-voice.duckdns.org` → `orbit-fullchain.pem` / `orbit-privkey.pem` + Orbit upstream routing
  - Graceful reload: `docker exec pos-system-nginx-1 nginx -s reload` (no container restart)
  - Verified both domains return 200 WITHOUT `-k` flag
- **Rule**:
  1. **NEVER use `curl -k` for final deployment verification.** The `-k` flag skips SSL certificate validation — it will return 200 even when the cert is completely wrong. Real browsers enforce SSL, so `curl -k` hides cert issues. Always use `curl` WITHOUT `-k` for verification.
  2. When co-hosting multiple domains on shared nginx, ALWAYS use per-domain `server_name` blocks with matching SSL certs. Never use `server_name _;` catch-all for SSL — it serves the default cert for ALL domains.
  3. If adding a new domain to shared nginx, verify SNI by checking the cert CN: `openssl s_client -connect <host>:443 -servername <domain> 2>/dev/null | openssl x509 -noout -subject`

### 2026-03-25 — Mobile UI completely broken: no responsive breakpoints in entire frontend
- **Error**: On mobile devices — header navigation overflowed off-screen (8+ horizontal tabs), all data tables unreadable (7-9 columns crammed), forms cramped (2-column grids too narrow), modals cut off (fixed 512px width)
- **Context**: App was built entirely for desktop. No mobile testing was ever done. Discovered when deploying mobile optimization.
- **Root Cause**: The entire frontend (`App.jsx`, 11,000+ lines) was built without ANY mobile responsive breakpoints on navigation, tables, modals, or forms. Tailwind CSS was already in use but only desktop classes were applied.
- **Fix**: Full mobile optimization in 3 phases:
  1. Phase 1: Hamburger menu + slide-out drawer, responsive modals (`sm:max-w-lg`), container padding (`px-4 sm:px-6`), form grids (`grid-cols-1 sm:grid-cols-2`), leads mobile card view
  2. Phase 2: Interactions table + Customers table → mobile card views (dual-view pattern: `hidden lg:block` desktop table + `lg:hidden space-y-3` mobile cards)
  3. Phase 3: Responsive typography (`text-xl sm:text-2xl`)
- **Rule**: When building ANY new view or table in Orbit CRM:
  1. Use mobile-first Tailwind: start with mobile styles, add `sm:` / `md:` / `lg:` for larger screens
  2. Tables with 5+ columns MUST have a mobile card view using the dual-view pattern
  3. Forms MUST use `grid-cols-1 sm:grid-cols-2` (never bare `grid-cols-2`)
  4. Modals MUST use `sm:max-w-lg` (never bare `max-w-lg`)
  5. Navigation on new sections must be tested at 375px viewport width

### 2026-03-25 — Deployment verification gap: `curl -k` hides SSL errors
- **Error**: Deploy declared "successful" but SSL was actually broken. Users could not access the site on any browser (mobile or desktop).
- **Context**: Standard frontend deploy verification step used `curl -s -o /dev/null -w '%{http_code}' -k https://orbit-voice.duckdns.org` — the `-k` flag returned 200 despite cert mismatch.
- **Root Cause**: The deployment playbook (ERROR_LOG.md, MEMORY.md, CLAUDE.md) all used `curl -k` or `curl -s` patterns. The `-k` flag (insecure) tells curl to ignore SSL certificate errors, which is exactly the class of error that broke the site.
- **Fix**: Updated ALL verification commands across all docs to use curl WITHOUT `-k`. Added explicit SSL cert verification step.
- **Rule**: The deployment verification step MUST be:
  ```bash
  # Step 1: HTTP status check (NO -k flag!)
  curl -s -o /dev/null -w '%{http_code}' https://orbit-voice.duckdns.org
  # Must return 200. If it returns 60 (SSL error), the cert is broken.

  # Step 2: SSL cert verification (new mandatory step)
  openssl s_client -connect 159.65.158.26:443 -servername orbit-voice.duckdns.org 2>/dev/null | openssl x509 -noout -subject
  # Must show: subject=CN = orbit-voice.duckdns.org
  ```
  If curl returns exit code 60 (SSL certificate problem), that IS the bug — do NOT add `-k` to "fix" it.

### 2026-04-16 — Site extremely slow to load: gzip compression not enabled
- **Error**: "Site taking forever to load" — 60+ seconds for initial page load. User reported internet working fine, all other websites loading normally.
- **Context**: After deploying build version feature and vector annotation improvements (commits 79d07f8, 5a9d1e3). User's build badge showed correct version (`v5a9d1e3`) but loading was painfully slow.
- **Root Cause**: Gzip compression was NOT enabled in ANY nginx configuration (orbit_web or POS nginx). Browser was downloading 2.4MB uncompressed JS files at only ~38KB/sec. Typical gzip would reduce to ~673KB (72% smaller).
- **Fix**: Added gzip configuration to three locations:
  1. `/etc/nginx/nginx.conf` in `orbit_web` container (via `sed -i` — ephemeral, container-specific)
  2. `~/pos-system/docker/nginx/nginx.conf` on DO server (main POS nginx config — added at top of http block)
  3. `~/orbit-crm/voice.conf` on DO server (Orbit-specific server block — added after `server_tokens off;`)
  - Reloaded nginx in all containers
  - Gzip settings: `gzip on; gzip_vary on; gzip_proxied any; gzip_comp_level 6;` plus mime types for JS/CSS/JSON/fonts/SVG
- **Rule**:
  1. **ALWAYS enable gzip compression in nginx for production deployments.** Should be in standard deployment checklist and base nginx configs.
  2. When co-hosting (POS + Orbit), gzip must be enabled in BOTH the main nginx config AND per-domain server blocks (e.g., voice.conf).
  3. To verify gzip is working: `curl -I -H "Accept-Encoding: gzip" <URL>` should return `Content-Encoding: gzip` header. If it's missing, gzip is not working.
  4. Expected compression ratio for minified JS: ~70% (2.4MB → ~673KB).
  5. If adding nginx config to mounted volumes (like voice.conf), ensure the mount is NOT read-only — edit on host, then reload nginx.

### 2026-04-16 — Browser cache confusion: build version badge solves verification gap
- **Error**: User couldn't see deployed features ("don't see add new annotation button") despite successful deployment.
- **Context**: Deployed new frontend build with vector annotation improvements. Server had correct files, but user's browser was serving cached old version.
- **Root Cause**: Aggressive browser caching of JS/CSS files. Hard refresh not performed, so browser kept serving stale files despite new deployment with different hashes.
- **Fix**:
  1. Added build version badge to bottom-left corner of UI showing `v{hash}` (git commit short hash)
  2. Tooltip shows full details: branch + build timestamp
  3. Auto-generated during `npm run build` via `generate-version.sh` script
  4. Instructed user to hard refresh (Ctrl+Shift+R) and check version badge
- **Rule**:
  1. **ALWAYS add a visible version indicator** in production apps to diagnose cache issues. Should be visible without opening DevTools.
  2. After ANY frontend deployment, instruct user to hard refresh BEFORE testing: `Ctrl + Shift + R` (Windows/Linux) or `Cmd + Shift + R` (Mac).
  3. If user reports "changes not visible," FIRST ask them to check the version badge. If it shows old hash, it's a cache issue — not a deployment issue.
  4. Build version should be generated at build time (not runtime) so it matches the deployed code exactly.
  5. Consider adding cache-busting query params or using Vite's built-in hash-based filenames (already doing this in Orbit).
