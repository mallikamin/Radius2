# Branch Registry — Radius CRM (ORBIT)
> Last updated: Feb 12, 2026 — Post-cleanup

---

## Branch Lineage (Visual)

```
master (79d9a5e) — Search Feature, base stable
│
├─→ Prod30012026 (1f743d1) — ARCHIVED on GitHub
│   │                         Tags: deployed-30jan2026, prod-30-01-2026, archive/prod30012026
│   │
│   └─→ 11thFebIssues (0da434b) — ARCHIVED on GitHub
│       │                           Tags: prod-11feb2026, archive/11th-feb-issues
│       │
│       └─→ Prod11022026 (0da434b) ← PRODUCTION (deployed Feb 12)
│
├─→ VectorView (1181905) — ARCHIVED on GitHub
│   │                       Tags: TARS-12thFeb-new-functionalities, archive/vector-view
│   │
│   └─→ TARS-12thFebRecommendations (12845f9) ← PENDING APPROVAL
│       │
│       └─→ VectorPlotFinder (12845f9) ← ACTIVE DEV
│                                        Tag: vectorplotfinder-start
│
├─→ ProjectsVector (17cb712) — ARCHIVED: archive/projects-vector
├─→ VectorMerge (e924739) — ARCHIVED: archive/vector-merge
└─→ FinalTouches (79d9a5e) — ARCHIVED: archive/final-touches
```

---

## Local Branches (4 remaining)

| Branch | Commit | Remote | Status | Purpose |
|--------|--------|--------|--------|---------|
| **VectorPlotFinder** | `12845f9` | origin/VectorPlotFinder | **ACTIVE DEV** | Vector upgrade: zameen.com-inspired features |
| **TARS-12thFebRecommendations** | `12845f9` | origin/TARS-12thFebRecommendations | **PENDING APPROVAL** | TARS audit: 27/30 items. Awaiting COO sign-off |
| **Prod11022026** | `0da434b` | origin/Prod11022026 | **PRODUCTION** | Deployed Feb 12 to office server |
| **master** | `79d9a5e` | origin/master | **STABLE BASE** | Original stable baseline |

---

## Archived Branches (on GitHub only — retrievable anytime)

| Archive Tag | Original Branch | Commit | Retrieval Command |
|-------------|----------------|--------|-------------------|
| `archive/prod30012026` | Prod30012026 | `1f743d1` | `git checkout -b Prod30012026 archive/prod30012026` |
| `archive/11th-feb-issues` | 11thFebIssues | `0da434b` | `git checkout -b 11thFebIssues archive/11th-feb-issues` |
| `archive/vector-view` | VectorView | `1181905` | `git checkout -b VectorView archive/vector-view` |
| `archive/final-touches` | FinalTouches | `79d9a5e` | `git checkout -b FinalTouches archive/final-touches` |
| `archive/vector-merge` | VectorMerge | `e924739` | `git checkout -b VectorMerge archive/vector-merge` |
| `archive/projects-vector` | ProjectsVector | `17cb712` | `git checkout -b ProjectsVector archive/projects-vector` |

> Each archive tag has full metadata (run `git tag -n20 archive/<name>` to see purpose, parent, lineage, dates)

---

## All Tags (11 total)

### Production Tags
| Tag | Commit | Date | Notes |
|-----|--------|------|-------|
| `prod-30-01-2026` | `79d9a5e` | Jan 30, 2026 | First production snapshot |
| `deployed-30jan2026` | `1f743d1` | Jan 30, 2026 | First office server deployment |
| `prod-11feb2026` | `0da434b` | Feb 11, 2026 | Second production (creator role, soft-delete, vector) |

### Feature Tags
| Tag | Commit | Notes |
|-----|--------|-------|
| `TARS-12thFeb-new-functionalities` | `1181905` | TARS audit baseline (27/30 items) |
| `vectorplotfinder-start` | `12845f9` | VectorPlotFinder branch origin point |

### Archive Tags
| Tag | Commit | Notes |
|-----|--------|-------|
| `archive/prod30012026` | `1f743d1` | First production, replaced by Prod11022026 |
| `archive/11th-feb-issues` | `0da434b` | Feb 11 dev work, merged into Prod11022026 |
| `archive/vector-view` | `1181905` | Buyback + vector merge, continued as TARS |
| `archive/final-touches` | `79d9a5e` | Identical to master, redundant |
| `archive/vector-merge` | `e924739` | First vector integration (Radius → Orbit rename) |
| `archive/projects-vector` | `17cb712` | Early vector WIP, superseded |

---

## Remote-Only Branches (legacy, not tracked locally)

| Remote Branch | Commit | Notes |
|---------------|--------|-------|
| `origin/Deployment` | `aa409de` | Old deployment WIP |
| `origin/NewUsers` | `112b891` | Old user/reporting work |
| `origin/media` | `1a4e10e` | Media handling |
| `origin/FinalTouches` | `79d9a5e` | Archived (identical to master) |
| `origin/ProjectsVector` | `17cb712` | Archived |

---

## Stashes

| Stash | Branch | Description |
|-------|--------|-------------|
| `stash@{0}` | media | Cursor edits parked |
| `stash@{1}` | Reports | WIP Reports messed up |

---

## Environment Mapping

| Branch | Environment | DB Port | API Port | Web Port | Compose File |
|--------|------------|---------|----------|----------|-------------|
| VectorPlotFinder | Local Dev (Orbit) | 5440 | 8010 | 5180 | `docker-compose.yml` |
| Prod11022026 | Office Server (Sitara) | 5435 | 8001 | 8081 | `docker-compose.prod.yml` |

---

## Branch Workflow Rules

1. **Never commit directly to Prod11022026** — it's the live production branch
2. **New features branch from latest dev branch** (currently VectorPlotFinder)
3. **Tag before every deployment** with `prod-DDMMYYYY` format
4. **Deployment = .bat ZIP package** (see MEMORY.md for full method)
5. **Merge direction**: feature → dev → prod (never backwards)
6. **Archive before delete** — always `git tag -a archive/<name>` + push before deleting

---

## Three Reference Points

| # | Branch | Role | Key Moment |
|---|--------|------|------------|
| 1 | **Prod11022026** | Production | Deployed Feb 12 — live on office server |
| 2 | **TARS-12thFebRecommendations** | Approval Queue | 27/30 TARS audit items — awaiting COO approval |
| 3 | **VectorPlotFinder** | Active Dev | Vector upgrade (zameen.com-inspired) — see `VECTOR-UPGRADE-PLAN.md` |

---

## Current Dev Focus

**Branch:** `VectorPlotFinder`
**Plan:** `VECTOR-UPGRADE-PLAN.md`
**Goal:** Upgrade Vector module with zameen.com-inspired features

### Phase 1 — COMPLETED (Feb 12, 2026)
- Status Color Mode (annotation / CRM status / price heatmap)
- Enhanced PlotDetailsWindow (CRM fetch, status badges, payment bar, Google Maps)
- Smart Filter Bar (status, block, size, price, plot search)
- Display Modes (plot numbers, customer names, annotations, price overlay)
- GPS Navigation (settings input, Google Maps preview in plot details)
- Sidebar Pan fix, QA audit fixes, canvas rAF rendering fix

### Remaining Phases
- Phase 2: Shareable plot URLs
- Phase 3: Mobile touch + PDF tracing
- Phase 4: Society dashboard + heatmap
- Phase 5: Satellite toggle (Leaflet)
- Phase 6: Undo/redo
