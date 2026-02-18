# Codex + Claude Collaboration Playbook

## Universal Trigger
Use this line to start any project:

`Codex take charge. Begin collaboration with Claude Code.`

Optional extended form:

`Codex take charge. Begin collaboration with Claude Code. You are lead architect and execution owner. Claude does heavy implementation. Escalate disagreements to me before proceeding.`

## Roles
- Codex: lead architect, execution controller, standards owner, reviewer, sign-off authority.
- Claude Code: high-volume implementation, documentation production, test execution, refactor batches.
- User: product direction, business decisions, final tie-breaker on disagreements.

## Default Operating Mode
1. Local-first build by default.
2. Cloud-ready architecture from day one.
3. Security/audit optimized baseline (RBAC, logging, encryption strategy, recovery plan).
4. Premium enterprise clarity + bold category-level UX where appropriate.
5. Milestone reviews + short progress updates.

## Decision Rule
If Codex and Claude disagree:
1. Codex prepares a brief with options, tradeoffs, recommendation.
2. User decides.
3. Execution resumes immediately after decision.

## Delivery Pipeline (Every Project)
1. Discovery and constraints capture.
2. Decisions lock (`DECISIONS.md`).
3. Technical design (`TECHNICAL_DESIGN_V1.md`).
4. Data model (`DATA_MODEL_V1.md`).
5. API contract (`API_CONTRACT_V1.md`).
6. Scaffold + local run.
7. Milestone implementation with smoke/regression evidence.
8. Performance + security hardening.
9. Deployment + verification checklist.

## Quality Gates (Definition of Done)
A feature/milestone is done only when:
1. Functional tests pass.
2. RBAC/security checks pass.
3. Performance sanity passes.
4. UX walkthrough passes.
5. Evidence package is shared and reviewed.

## Kickoff Template (Copy/Paste)
```text
Codex take charge. Begin collaboration with Claude Code.

Project:
Primary users:
Core workflow to optimize:
Success metric (if unknown, propose one):
Design direction (premium / bold / hybrid):
Constraints (tech, legal, timeline):

Operate with the Codex+Claude Collaboration Playbook.
Escalate disagreements to me with options and tradeoffs.
```

## Evidence Package Template (Per Milestone)
1. Build/lint/typecheck results.
2. Smoke test matrix (pass/fail totals).
3. RBAC/security proof.
4. Performance timings.
5. File change summary.
6. Known risks + next-step recommendation.

## Local Dev — Mandatory HMR Restart (NEVER SKIP)

**Problem:** `orbit_dev_web` runs Vite inside Docker with `/app/src` bind-mounted from Windows. Windows→Linux bind mounts do NOT reliably trigger inotify, so Vite HMR often misses file changes entirely. The browser will show stale code.

**Rule:** After ANY frontend file edit, BEFORE telling the user "ready to test":

```bash
docker restart orbit_dev_web
```

Then tell the user to hard refresh (`Ctrl+Shift+R`) at `http://localhost:5180/`.

**Checklist (copy into your workflow):**
1. Make code changes to `frontend/src/**`
2. Run `docker restart orbit_dev_web`
3. Wait ~5 seconds for Vite to recompile
4. Tell user: "Restart done — hard refresh localhost:5180 (Ctrl+Shift+R)"
5. Only THEN confirm changes are testable

**Why this matters:** Without the restart, the user sees the OLD version and thinks your changes are broken or missing. This has caused confusion multiple times.

**For production builds:** This does not apply — `vite build` reads files directly from disk. But for local dev testing via Docker, ALWAYS restart.

