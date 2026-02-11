# TARS Backup Agent — Data Safety Protocol

> Integrated into TARS CEO audit pipeline.
> Every branch change, deployment, or infrastructure modification MUST pass these checks.

---

## Incident Report: Feb 12, 2026 — Volume Orphaning

### What Happened
Docker volume name in `docker-compose.yml` was changed from `radius2_sitara_v3_postgres` to `orbit_dev_postgres` during a dev/prod separation refactor. Docker silently created a new empty volume. The old volume with real data (6 customers, 3 transactions, 2 receipts, 269 inventory) was orphaned but not deleted.

### Root Cause
No safeguard existed to prevent volume name changes. Docker's default behavior creates new volumes silently — there is no warning.

### Resolution
Switched `docker-compose.yml` back to `radius2_sitara_v3_postgres` with `external: true`. All data recovered intact.

### Impact
Zero data loss (orphaned, not deleted). ~2 hours of investigation.

---

## The 7 Rules of Data Safety

### Rule 1: Volume Names Are Immutable
Once a Docker volume is created and contains data, its name MUST NEVER change in any compose file. Treat volume names like database connection strings — changing them disconnects you from your data.

```yaml
# CORRECT — pinned, external, commented
volumes:
  sitara_postgres_data:
    external: true  # NEVER rename — contains production data
```

### Rule 2: External Volumes Prevent Silent Creation
Always use `external: true` for data volumes in production. This makes Docker FAIL LOUDLY if the volume doesn't exist, instead of silently creating an empty one.

```yaml
# Without external: true → Docker silently creates empty volume (DANGEROUS)
# With external: true → Docker fails with "volume not found" (SAFE)
```

### Rule 3: Migration Scripts Must Be Additive Only
- `CREATE TABLE IF NOT EXISTS` — never bare `CREATE TABLE`
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — never bare `ALTER TABLE`
- `ON CONFLICT DO NOTHING` for seed data
- NEVER use `DROP TABLE`, `TRUNCATE TABLE`, or `DELETE FROM` in migrations
- Wrap in `BEGIN; ... COMMIT;` for atomicity

### Rule 4: Init Scripts Are For First Boot Only
`docker-entrypoint-initdb.d/` scripts only run when the PostgreSQL data directory is empty. They are NOT a migration mechanism. Use dedicated migration files for schema changes.

### Rule 5: Model-Table Alignment Check
Before any deployment, verify every SQLAlchemy model in `main.py` has a corresponding table in the migration. A model without a table = 500 errors. A table without a model = harmless.

### Rule 6: One Volume Per Environment
Never share volumes between environments. Each environment gets its own pinned volume:

| Environment | Volume Name | Compose File |
|---|---|---|
| Local Dev | `radius2_sitara_v3_postgres` | `docker-compose.yml` |
| Production | `sitara_postgres_data` | `docker-compose.prod.yml` |

### Rule 7: Backup Before Every Deployment
Run `pg_dump` before every deployment. A 5-second dump can save days of data recovery.

---

## TARS Backup Agent — Pre-Deployment Checklist

This checklist MUST be executed by TARS before approving any deployment.

### Phase 1: Volume Safety (Blocks Deployment)
- [ ] Compare volume name in target compose file vs what's running on server (`docker volume ls`)
- [ ] Confirm `external: true` is set on production data volumes
- [ ] Verify no volume name changes in the diff (`git diff` on compose files)
- [ ] If volume name changed → **BLOCK DEPLOYMENT** and alert

### Phase 2: Migration Safety (Blocks Deployment)
- [ ] Scan migration SQL for `DROP TABLE`, `TRUNCATE`, `DELETE FROM` → **BLOCK** if found
- [ ] Verify all migrations use `IF NOT EXISTS` / `IF EXISTS` guards
- [ ] Verify migration is wrapped in `BEGIN; ... COMMIT;`
- [ ] Cross-check: every SQLAlchemy model in `main.py` has a matching table in migration
- [ ] Cross-check: every table referenced in frontend exists in migration
- [ ] Verify sequences are synced to max existing IDs (prevents duplicate key errors)

### Phase 3: Data Backup (Blocks Deployment)
- [ ] Run `pg_dump` of current production database before deployment
- [ ] Store backup with timestamp: `backup_YYYYMMDD_HHMMSS.sql`
- [ ] Verify backup file is non-empty and contains expected table count
- [ ] Document backup location in deployment log

### Phase 4: Code Safety (Advisory)
- [ ] No `Base.metadata.create_all()` or `drop_all()` in backend startup
- [ ] No hardcoded `DELETE` or `TRUNCATE` in Python code
- [ ] No `@app.on_event("startup")` that resets data
- [ ] API endpoints don't silently filter out old data (check for hidden date/status filters)

### Phase 5: Post-Deployment Verification
- [ ] Run table count query and compare with pre-deployment
- [ ] Run row count on critical tables (customers, transactions, inventory, receipts, installments)
- [ ] Verify all API endpoints return 200 (not 500)
- [ ] Verify frontend loads and displays existing data

---

## Backup Agent Commands

### Manual Backup (run before any deployment)
```bash
# Production server
docker exec sitara_crm_db pg_dump -U sitara -d sitara_crm > backup_$(date +%Y%m%d_%H%M%S).sql

# Local dev
docker exec orbit_dev_db pg_dump -U sitara -d sitara_crm > backup_dev_$(date +%Y%m%d_%H%M%S).sql
```

### Verify Backup Integrity
```bash
# Check file size (should be > 0)
ls -la backup_*.sql

# Count tables in backup
grep -c "CREATE TABLE" backup_*.sql

# Quick content check
head -50 backup_*.sql
```

### Restore From Backup
```bash
# Production (CAUTION: replaces current data)
docker exec -i sitara_crm_db psql -U sitara -d sitara_crm < backup_YYYYMMDD_HHMMSS.sql

# Local dev
docker exec -i orbit_dev_db psql -U sitara -d sitara_crm < backup_YYYYMMDD_HHMMSS.sql
```

### Recover Orphaned Volume
```bash
# 1. List all volumes to find the orphaned one
docker volume ls --filter name=postgres

# 2. Start temp container on orphaned volume
docker run --rm -d --name temp_recovery \
  -v ORPHANED_VOLUME_NAME:/var/lib/postgresql/data \
  -e POSTGRES_USER=sitara -e POSTGRES_DB=sitara_crm \
  -e POSTGRES_PASSWORD=sitara123 \
  -p 5499:5432 postgres:15-alpine

# 3. Dump data
docker exec temp_recovery pg_dump -U sitara -d sitara_crm --data-only --inserts > recovered_data.sql

# 4. Restore into current database
docker exec -i orbit_dev_db psql -U sitara -d sitara_crm < recovered_data.sql

# 5. Clean up
docker stop temp_recovery
```

---

## Volume Name Registry

> TARS must maintain this registry. Any deviation triggers an alert.

| Environment | Volume Name | Compose File | Status |
|---|---|---|---|
| **Local Dev** | `radius2_sitara_v3_postgres` | `docker-compose.yml` | Active, `external: true` |
| **Production** | `sitara_postgres_data` | `docker-compose.prod.yml` | Active, deploying Feb 12 |
| **Orphaned** | `radius2_orbit_dev_postgres` | — | Empty test data, safe to delete |
| **Orphaned** | `radius2_sitara_postgres_data` | — | Empty, safe to delete |

---

## Integration With TARS Audit Pipeline

When TARS runs `/audit` on any Orbit branch, the Backup Agent should:

1. **Auto-scan compose files** for volume name changes vs the registry above
2. **Auto-scan migration files** for destructive operations
3. **Auto-verify model-table alignment** (parse SQLAlchemy models vs CREATE TABLE statements)
4. **Flag any branch** that modifies `docker-compose*.yml` volume sections
5. **Require backup confirmation** before any deployment approval

### TARS Agent Assignment
| Agent | Responsibility |
|---|---|
| **Database Engineer** | Migration safety, schema alignment, sequence sync |
| **DevOps Engineer** | Volume safety, compose file audit, backup execution |
| **Backend Engineer** | Model-table alignment, startup event audit, query filter audit |
| **QA Engineer** | Post-deployment data verification, row count comparison |
| **Backup Agent (NEW)** | Orchestrates all above, maintains volume registry, blocks unsafe deployments |

---

## Lessons Learned

1. **Docker volumes are invisible** — unlike files, you can't `git diff` a volume. The only protection is naming discipline and `external: true`.
2. **Renaming is deleting** — in Docker's world, a new volume name = a new empty volume. The old data still exists but is disconnected.
3. **Init scripts are not migrations** — `docker-entrypoint-initdb.d` is for bootstrapping, not upgrading. Use proper migration files.
4. **Silent failures are the worst failures** — Docker doesn't warn when it creates a new volume. PostgreSQL doesn't warn when init scripts run. The app loads fine with empty data. Everything looks "working" until someone checks the actual records.
5. **Test data in production init = time bomb** — if a volume is ever recreated, production gets test records.
6. **Pre-deployment pg_dump takes 5 seconds, data recovery takes hours** — always backup first.
