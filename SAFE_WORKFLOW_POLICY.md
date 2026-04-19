# Safe Workflow Policy (PR + Deploy)

Last updated: 2026-04-20

## Goals
- Keep co-hosted production stable (Orbit and POS isolation).
- Improve profile quality with real PR-based delivery.
- Make every deployment reversible and evidenced.

## Required Git Flow
1. Never work directly on `master`.
2. Use branches: `feat/*`, `fix/*`, `wip/*`, `hotfix/*`.
3. Open PR for every deployable change.
4. Merge only after CI passes and deploy checklist is attached.
5. Create deploy snapshot branch before production cut:
- `prod/<date>-<HHMM>`

## Required Deploy Flow
1. Deploy only required components (no broad rebuilds).
2. Run migrations on cloned/test DB first.
3. For co-hosted setup, preserve POS safety invariants.
4. Re-attach runtime networks only after Orbit container recreation.
5. Run mandatory post-deploy checks (TLS CN, health, auth, core API).

## Hard Safety Rules
1. Do not run `docker compose down` on POS stack during Orbit deploy.
2. Do not run broad cleanup commands during live deploy.
3. Do not bypass external TLS checks with insecure flags.
4. Roll back immediately on critical gate failure.

