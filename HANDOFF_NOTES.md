# HANDOFF NOTES — Agent Standards & Deployment Protocol

> **Last updated**: 2026-02-21
> **Any agent (Claude, Codex, or human) deploying to production MUST read and follow this file.**

---

## 1. Branch Naming Convention (MANDATORY)

| Type | Pattern | Example |
|------|---------|---------|
| **Work-in-progress** | `wip/<FeatureName>` | `wip/SitaraSquareDataUpdation_21stFeb` |
| **Production snapshot** | `prod/<date>-<HHMM>` | `prod/21stFeb-2026-1545` |
| **Archived WIP** | `archive/wip-<FeatureName>` | `archive/wip-SitaraSquareDataUpdation_21stFeb` |
| **Archived prod** | `archive/prod-<date>` | `archive/prod-18thFeb` |

### Branch Lifecycle Flow

```
1. Create:    git checkout -b wip/<FeatureName>
2. Work:      commit changes on wip branch
3. Deploy:    deploy to DO (see Section 3)
4. Merge:     git checkout master && git merge wip/<FeatureName>
5. Tag prod:  git branch prod/<date>-<HHMM>
6. Archive:   git branch -m wip/<FeatureName> archive/wip-<FeatureName>
```

**Rules:**
- NEVER work directly on `master` — always use a `wip/*` branch
- ALWAYS create a `prod/*` branch with datetime stamp at deploy time
- ALWAYS rename `wip/*` to `archive/wip-*` after successful deployment
- `master` must always reflect the latest deployed state

---

## 2. Database Migration Standard (TEST-FIRST — MANDATORY)

**NEVER run migrations directly on production.** Always test first.

### Step-by-step protocol:

```bash
# 1. Create test DB (clone from prod)
docker exec orbit_db psql -U sitara -d postgres \
  -c "CREATE DATABASE sitara_crm_test OWNER sitara;"
docker exec orbit_db bash -c \
  'pg_dump -U sitara sitara_crm | psql -U sitara sitara_crm_test'

# 2. Run migration on test DB
docker exec -i orbit_db psql -U sitara -d sitara_crm_test < /tmp/migration.sql

# 3. Validate (run verification queries, check counts, spot-check data)

# 4. If OK → run on production
docker exec -i orbit_db psql -U sitara -d sitara_crm < /tmp/migration.sql

# 5. Drop test DB
docker exec orbit_db psql -U sitara -d postgres \
  -c "DROP DATABASE sitara_crm_test;"

# 6. Restart API to clear caches
docker restart orbit_api
```

**Rules:**
- Migration SQL must be wrapped in `BEGIN; ... COMMIT;` for atomicity
- Always include verification queries at the end of the migration
- Save migration files in `database/` directory and commit to git
- Name pattern: `database/<feature>_migration.sql`

---

## 3. DigitalOcean Deployment Protocol

### Server Details
- **IP**: `159.65.158.26` | **SSH**: `root`
- **Orbit path**: `~/orbit-crm`
- **Domain**: `https://orbit-voice.duckdns.org/`
- **No git on server** — deploy via SCP + docker rebuild

### Full Code Deploy (frontend + backend)

```bash
# 1. Build frontend locally
cd frontend && ./node_modules/.bin/vite build

# 2. Clean server dist FIRST (prevents stale JS chunks)
ssh root@159.65.158.26 "rm -rf ~/orbit-crm/frontend/dist/*"

# 3. SCP files
scp backend/app/main.py root@159.65.158.26:~/orbit-crm/backend/app/
scp -r backend/app/services/ root@159.65.158.26:~/orbit-crm/backend/app/
scp -r frontend/dist/ root@159.65.158.26:~/orbit-crm/frontend/

# 4. Rebuild API container (restart alone does NOT work — Dockerfile uses COPY)
ssh root@159.65.158.26 "cd ~/orbit-crm && docker compose up -d --build orbit_api"

# 5. Restart web
ssh root@159.65.158.26 "docker restart orbit_web"

# 6. CRITICAL: Reconnect to POS network (see Section 4)
```

### DB-Only Deploy (no code changes)
- Upload SQL to `/tmp/` on server
- Follow test-first protocol (Section 2)
- Restart API after: `docker restart orbit_api`

### Verify After Deploy
```bash
# Check API is responding
docker exec orbit_web curl -s http://orbit_api:8000/api/dashboard/summary | head -100

# Check frontend hash matches
ls ~/orbit-crm/frontend/dist/assets/index-*.js
```

---

## 4. Co-Hosting Safety (Orbit + POS — CRITICAL)

The DO server co-hosts Orbit CRM and a POS system. **Breaking POS = breaking a live business.**

- POS stack at `~/pos-system` — **NEVER touch during Orbit deploy**
- **NEVER run `docker system prune -a`** — destroys POS images
- POS nginx (`pos-system-nginx-1`) is the ONLY entry point for ports 80/443
- Orbit has NO host port bindings — relies on POS nginx reverse proxy

### After ANY `docker compose up --build` on Orbit:

Containers get recreated on `orbit-crm_orbit_internal` only — they lose `pos-system_default` membership. **You MUST reconnect:**

```bash
docker network connect pos-system_default orbit_web
docker network connect pos-system_default orbit_api
docker exec pos-system-nginx-1 nginx -s reload
```

**Without this, `orbit-voice.duckdns.org` silently drops (returns 444).**

---

## 5. Docker Volume Safety (CRITICAL)

Volume names are IMMUTABLE. Changing them causes **silent total data loss**.

| Environment | Volume Name | Compose Key |
|-------------|-------------|-------------|
| Local Dev | `radius2_sitara_v3_postgres` | `external: true` |
| Production | `sitara_postgres_data` | `external: true` |

**NEVER** remove `external: true` or change the `name:` field.

---

## 6. Current State (as of 2026-02-23)

### Active Branches
- `master` — latest, includes batch 2 migration SQL (not yet deployed to prod)
- `prod/21stFeb-2026-1545` — current production snapshot (batch 1 only)

### Pending Migration (NOT YET DEPLOYED)
- `database/sitara_square_migration_2.sql` — Sitara Square Batch 2
- 12 transactions: shops 5,10,19,20,21,24,28,33,34,36,45,C6
- 11 new customers, 2 new brokers (Affaq Khan, Waqar)
- Creates C6 inventory unit (commercial, not in original inventory)
- **Must run test-first protocol (Section 2) before deploying**

### Production Database (`sitara_crm`) — after batch 1, before batch 2
- 25 customers, 17 brokers, 4 projects
- 31 transactions (28 Sitara Square + 3 other)
- 30 receipts with 62 allocations
- 269 inventory items (28 sold Sitara Square)

### After Batch 2 is deployed (expected counts)
- ~36 customers (+11), ~19 brokers (+2), 4 projects
- 43 transactions (+12), 270 inventory items (+1 C6)

### Key Credentials
- **DB**: `postgresql://sitara:sitara_secure_2024@localhost:5435/sitara_crm` (inside Docker network)
- **Login**: REP-0002 (Admin) — reset password: `UPDATE company_reps SET password_hash = NULL WHERE rep_id = 'REP-0002';`

---

## 7. Error Logging

When you fix a new error, **append it to `ERROR_LOG.md`** with:
- Date
- Error message
- Context (what you were doing)
- Root cause
- Fix applied
- Rule to prevent recurrence

## 8. 2026-02-27 SSL Incident Learnings (POS nginx)

- Symptom: `orbit-voice.duckdns.org` served `pos-demo.duckdns.org` certificate (`ERR_CERT_COMMON_NAME_INVALID`).
- Confirmed cause: `voice.conf` existed on host but was not mounted into POS nginx `/etc/nginx/conf.d/`.
- Important constraint: POS nginx container uses read-only root filesystem; `docker cp` hotfix into container will fail.
- Required permanent fix: add volume mount in `~/pos-system/docker-compose.demo.yml`:
  - `./docker/nginx/voice.conf:/etc/nginx/conf.d/voice.conf:ro`
- POS compose commands must include env file on this host:
  - `docker compose -f docker-compose.demo.yml --env-file .env.demo ...`
- After nginx recreate, always verify:
  1. `docker exec pos-system-nginx-1 nginx -t`
  2. `docker exec pos-system-nginx-1 nginx -T | grep -i orbit`
  3. `echo | openssl s_client -connect orbit-voice.duckdns.org:443 -servername orbit-voice.duckdns.org 2>/dev/null | openssl x509 -noout -subject -dates`
- 2026-03-08 live repair state:
  1. Remote file `~/pos-system/docker-compose.demo.yml` now includes the `voice.conf` mount.
  2. Backup exists at `~/pos-system/docker-compose.demo.yml.bak_orbit_tls_20260308_1135`.
  3. Only `pos-system-nginx-1` was recreated; Orbit/POS DBs and app containers were not rebuilt for this fix.
  4. Post-fix verification succeeded: `voice.conf` present in `/etc/nginx/conf.d/`, cert CN `orbit-voice.duckdns.org`, Orbit `/api/health` healthy, and `orbit_web`/`orbit_api` still attached to `pos-system_default`.
