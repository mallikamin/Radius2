# DigitalOcean Deploy Playbook (Orbit + POS Co-Hosted)

Last updated: 2026-02-17

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
scp -r frontend/dist/* root@159.65.158.26:~/orbit-crm/frontend/dist/
```
4. Rebuild Orbit API and restart Orbit web:
```bash
ssh root@159.65.158.26 "cd ~/orbit-crm && docker compose up -d --build orbit_api"
ssh root@159.65.158.26 "docker restart orbit_web"
```
5. Re-attach Orbit containers to POS network (always verify/repair):
```bash
ssh root@159.65.158.26 "docker network connect pos-system_default orbit_web || true"
ssh root@159.65.158.26 "docker network connect pos-system_default orbit_api || true"
```

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
