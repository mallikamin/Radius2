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

## 6. Current State (as of 2026-02-21)

### Active Branches
- `master` — latest, includes all deploys through 21 Feb 2026
- `prod/21stFeb-2026-1545` — current production snapshot

### Production Database (`sitara_crm`)
- 25 customers, 17 brokers, 4 projects
- 31 transactions (28 Sitara Square + 3 other)
- 30 receipts with 62 allocations
- 269 inventory items (28 sold Sitara Square)

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
