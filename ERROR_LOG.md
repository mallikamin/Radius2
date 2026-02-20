# Orbit CRM Error Log (Analytics Branch)

Cumulative log of errors encountered and fixed during development. Any agent (Claude, Codex, Cursor, DeepSeek) working on this project should read this file first to avoid repeating known mistakes, and append new entries when fixing errors.

**Worktree note**: This is the `prod/18thFeb` analytics branch worktree. Main worktree is at `C:\Users\Malik\Desktop\radius2`. Errors that apply to both should be synced manually.

---

## Format

Each entry follows:
```
### [DATE] — Short title
- **Error**: Exact error message or symptom
- **Context**: What was being done when it happened
- **Root Cause**: Why it happened
- **Fix**: What was changed
- **Rule**: What to do differently going forward
```

---

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

### 2026-02-19 - Deploy race: network reconnect lost after API rebuild
- **Error**: Orbit frontend looked up, but API path could fail after deploy.
- **Context**: `docker network connect pos-system_default orbit_api` was run before `docker compose up -d --build orbit_api` fully finished.
- **Root Cause**: API container was recreated after connect, so runtime-only network attach was lost.
- **Fix**: Re-ran network connect after rebuild completed, then reloaded POS nginx.
- **Rule**: Deploy must be serialized: rebuild API -> connect networks -> reload nginx -> verify network membership.

### 2026-02-19 - Windows SCP path/wildcard pitfalls on manual deploy
- **Error**: SCP failed when using wildcard paths and missing remote directories.
- **Context**: Uploading frontend dist and migration SQL from Windows.
- **Root Cause**: Shell/path expansion differences plus missing `~/orbit-crm/backend/migrations` directory on server.
- **Fix**: Use `scp -r frontend/dist/. root@...:~/orbit-crm/frontend/dist/` and create remote dirs with `mkdir -p` before copy.
- **Rule**: Avoid wildcard-dependent SCP on Windows and always ensure remote path exists first.
