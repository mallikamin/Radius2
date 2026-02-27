# DigitalOcean Deploy Playbook (Orbit + POS Co-Hosted)

Last updated: 2026-02-21

## Scope
- Droplet: `159.65.158.26`
- Orbit domain: `https://orbit-voice.duckdns.org/`
- POS domain: `https://pos-demo.duckdns.org/`
- Constraint: POS must remain untouched during Orbit deploys.

## Incident Summary (2026-02-17)
- Orbit containers were rebuilt via `docker compose up -d --build orbit_api`.
- After container recreation, Orbit containers were no longer attached to `pos-system_default`.
- POS nginx (`pos-system-nginx-1`) could not resolve/reach `orbit_web` and `orbit_api`.
- Result: Orbit domain became unreachable even though containers were running.

## Incident Addendum (2026-02-19)
- Deploy succeeded, but one critical race condition reappeared:
- `docker network connect pos-system_default orbit_api` was run before API rebuild fully finished.
- `orbit_api` container was then recreated by `docker compose up -d --build orbit_api`, dropping the just-added network link.
- Outcome: frontend could still return `200`, but API route path was fragile/failing until reconnect was repeated after rebuild.

Secondary deploy friction seen on Windows:
- SCP wildcard expansion (`dist/*`) can fail depending on shell.
- Fix: use `scp -r frontend/dist/. root@...:~/orbit-crm/frontend/dist/` (PowerShell-safe) or full dir path in Git Bash.
- Manual SCP deploy means remote directories may not exist; create with `mkdir -p` first.

## Root Cause
- Network link to `pos-system_default` was not fully enforced as a persistent deploy invariant.
- Recreated containers only keep networks defined in compose. Any missing runtime-only network links are lost.

## Mandatory Invariants
1. `orbit_web` and `orbit_api` must be reachable from `pos-system-nginx-1`.
2. `voice.conf` must continue proxying:
- `orbit_backend -> orbit_api:8000`
- `orbit_frontend -> orbit_web:80`
3. Do not restart/modify POS services unless explicitly requested.

## Standard Orbit Deploy (Safe Sequence)
1. Build frontend locally:
```powershell
cd frontend
npm.cmd run build
```
2. Clean remote dist:
```bash
ssh root@159.65.158.26 "rm -rf ~/orbit-crm/frontend/dist/*"
```
3. Upload changed files:
```bash
scp backend/app/main.py root@159.65.158.26:~/orbit-crm/backend/app/main.py
scp -r frontend/dist/. root@159.65.158.26:~/orbit-crm/frontend/dist/
```
4. Upload migrations (manual deploy path):
```bash
ssh root@159.65.158.26 "mkdir -p ~/orbit-crm/backend/migrations"
scp backend/migrations/phase9_micro_tasks.sql root@159.65.158.26:~/orbit-crm/backend/migrations/
```
5. Apply migration (idempotent):
```bash
ssh root@159.65.158.26 "cat ~/orbit-crm/backend/migrations/phase9_micro_tasks.sql | docker exec -i orbit_db psql -U sitara -d sitara_crm"
```
6. Rebuild Orbit API (must complete before reconnect):
```bash
ssh root@159.65.158.26 "cd ~/orbit-crm && docker compose up -d --build orbit_api"
```
7. Re-attach Orbit containers to POS network (MUST run after step 6):
```bash
ssh root@159.65.158.26 "docker network connect pos-system_default orbit_web || true"
ssh root@159.65.158.26 "docker network connect pos-system_default orbit_api || true"
ssh root@159.65.158.26 "docker exec pos-system-nginx-1 nginx -s reload"
```

Hard rule:
- Never run step 7 in parallel with step 6.
- Wait for API rebuild/recreate to finish first, or network attach is lost.

## Mandatory Verification Checklist
Run all of these after deploy:

1. Containers up:
```bash
ssh root@159.65.158.26 "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'orbit_|pos-system-nginx-1|NAMES'"
```

2. POS nginx can resolve Orbit containers:
```bash
ssh root@159.65.158.26 "docker exec pos-system-nginx-1 ping -c1 orbit_web"
ssh root@159.65.158.26 "docker exec pos-system-nginx-1 ping -c1 orbit_api"
```

3. Nginx config valid and reloaded:
```bash
ssh root@159.65.158.26 "docker exec pos-system-nginx-1 nginx -t && docker exec pos-system-nginx-1 nginx -s reload"
```

4. Health endpoint from droplet:
```bash
ssh root@159.65.158.26 "curl -sk https://orbit-voice.duckdns.org/api/health -H 'Host: orbit-voice.duckdns.org' --resolve orbit-voice.duckdns.org:443:127.0.0.1"
```

5. Health endpoint from local machine:
```powershell
curl https://orbit-voice.duckdns.org/api/health
```

6. Confirm network membership (post-rebuild):
```bash
ssh root@159.65.158.26 "docker inspect orbit_api -f '{{json .NetworkSettings.Networks}}'"
```
Expected to include:
- `orbit-crm_orbit_internal`
- `voice_gateway`
- `pos-system_default`

## Emergency Recovery (If Orbit Goes Dark)
1. Check network memberships:
```bash
ssh root@159.65.158.26 "docker network inspect pos-system_default --format '{{range .Containers}}{{.Name}} {{end}}'"
```
2. If `orbit_web` or `orbit_api` missing, reconnect:
```bash
ssh root@159.65.158.26 "docker network connect pos-system_default orbit_web"
ssh root@159.65.158.26 "docker network connect pos-system_default orbit_api"
```
3. Reload nginx:
```bash
ssh root@159.65.158.26 "docker exec pos-system-nginx-1 nginx -t && docker exec pos-system-nginx-1 nginx -s reload"
```

## POS Safety Guardrails
- Do not run `docker compose down` in POS project path during Orbit deploy.
- Do not run broad cleanup commands like `docker system prune -a`.
- Do not edit/remove POS nginx default config while deploying Orbit.

## DB Migration Protocol (MANDATORY — added 2026-02-21)

**NEVER run migrations directly on production. Always test first.**

```bash
# 1. Create test DB (clone from prod)
docker exec orbit_db psql -U sitara -d postgres \
  -c "CREATE DATABASE sitara_crm_test OWNER sitara;"
docker exec orbit_db bash -c \
  'pg_dump -U sitara sitara_crm | psql -U sitara sitara_crm_test'

# 2. Upload and run migration on test DB
docker exec -i orbit_db psql -U sitara -d sitara_crm_test < /tmp/migration.sql

# 3. Validate (check counts, spot-check data)

# 4. If OK → run on production
docker exec -i orbit_db psql -U sitara -d sitara_crm < /tmp/migration.sql

# 5. Drop test DB and restart API
docker exec orbit_db psql -U sitara -d postgres \
  -c "DROP DATABASE sitara_crm_test;"
docker restart orbit_api
```

Note: `CREATE DATABASE ... WITH TEMPLATE` won't work while prod has active connections. Use `pg_dump | psql` instead.

## Branch Protocol (added 2026-02-21)

See `HANDOFF_NOTES.md` Section 1 for full branch naming convention.
- `wip/*` → deploy → merge to master → rename to `archive/wip-*`
- Create `prod/<date>-<HHMM>` snapshot at deploy time
- NEVER work directly on master

## Incident Addendum (2026-02-27) - Orbit SSL CN mismatch due missing voice.conf mount
- Symptom: `https://orbit-voice.duckdns.org/` returned browser warning `ERR_CERT_COMMON_NAME_INVALID`.
- External probe showed cert CN `pos-demo.duckdns.org`, not `orbit-voice.duckdns.org`.
- Root cause: POS nginx only loaded `default.conf`; `voice.conf` existed on host but was not mounted into container.
- Failed quick fix: `docker cp` into `pos-system-nginx-1` failed because container rootfs is read-only.

### Corrective Action
1. Add mount in POS demo compose nginx volumes:
```yaml
- ./docker/nginx/voice.conf:/etc/nginx/conf.d/voice.conf:ro
```
2. Recreate nginx with env file:
```bash
docker compose -f docker-compose.demo.yml --env-file .env.demo up -d nginx
```
3. Verify config + cert:
```bash
docker exec pos-system-nginx-1 nginx -t
docker exec pos-system-nginx-1 nginx -T | grep -i orbit
echo | openssl s_client -connect orbit-voice.duckdns.org:443 -servername orbit-voice.duckdns.org 2>/dev/null | openssl x509 -noout -subject -issuer -dates
```

### New hard rules
- Do not assume host config files are active; verify mounts in running container (`ls /etc/nginx/conf.d`).
- Do not use `docker cp` for POS nginx runtime config when rootfs is read-only.
- For POS demo compose operations on this host, always pass `--env-file .env.demo`.
