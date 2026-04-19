# Deployment Hygiene Checklist (Orbit)

Last updated: 2026-04-17

This is the canonical deployment checklist for this repo.  
Use it together with `DIGITALOCEAN_DEPLOY_PLAYBOOK.md` for host-specific commands.

## 1. Pre-Deploy Gates (must pass)

1. Confirm target commit hash and branch in writing (deploy note).
2. Confirm target environment (`prod` vs `demo`) and exact domain.
3. Confirm whether DB migration is included.
4. Run local build/tests relevant to changed area.
5. Prepare rollback plan:
   - Previous working commit hash
   - Clear rollback command sequence
6. Snapshot/backup before risky schema/data changes.
7. For co-hosted setup, explicitly confirm POS safety constraints.

## 2. Change Packaging Rules

1. Deploy only required files/components (avoid unrelated rebuilds).
2. Apply DB migrations idempotently and test on cloned DB first.
3. Never embed credentials in scripts or docs.
4. Do not use TLS bypass (`curl -k`) for external verification gates.
5. Record all changed files and migration names in deploy summary.

## 3. Ordered Deploy Execution

1. Build frontend artifacts.
2. Upload backend/frontend changes.
3. Upload and run migration (if any).
4. Rebuild/restart only required Orbit service(s).
5. Re-attach runtime networks only after container recreation is complete.
6. Reload nginx after network and config checks.

## 4. Post-Deploy Verification (mandatory)

1. Container/process status checks pass.
2. Network membership checks pass.
3. Nginx config test and reload pass.
4. Internal health check passes.
5. External health check passes with valid TLS certificate CN.
6. Business-critical API smoke checks pass.
7. UI smoke on changed feature passes.

Use:

```bash
ORBIT_USER="<rep_id>" ORBIT_PASSWORD="<password>" ./scripts/do_post_deploy_check.sh
```

## 5. Deployment Evidence (must be stored)

Create/update one deployment summary file containing:

1. Date/time (UTC), environment, server, domain.
2. Git commit hash and branch.
3. Files/services changed.
4. Migration(s) executed.
5. Verification command outputs (or concise pass/fail evidence).
6. Known issues and follow-up owner.

## 6. Rollback Triggers

Rollback immediately if any of these fail and cannot be fixed quickly:

1. External health endpoint fails.
2. TLS CN/domain mismatch.
3. Authentication fails.
4. Core business endpoint fails.
5. Data integrity issue after migration.

## 7. Prohibited Actions

1. `docker compose down` in POS stack during Orbit-only deploy.
2. Broad destructive cleanup (`docker system prune -a`) during live deploy.
3. Unverified hot edits in running containers.
4. Production migration without prior test run.

