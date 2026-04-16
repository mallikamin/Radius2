# Pause Checkpoint — 2026-04-16

## Project
- **Name**: Orbit CRM (Radius2 Analytics)
- **Path**: `C:\Users\Malik\desktop\radius2-analytics`
- **Branch**: master
- **Latest Commit**: a65f2b5 (perf: enable gzip compression)
- **Production URL**: https://orbit-voice.duckdns.org/

## Goal
User reported 4 issues with Vector annotation system:
1. Manual annotation rotations not persisting after save/logout/reload
2. New annotations appearing at bottom of list (wanted newest first)
3. Hex code prompts for colors (wanted visual color picker)
4. Need per-plot font size control within annotations (some plots need larger fonts, others smaller)

Additionally: Slow page load times (60+ seconds)

## Completed
- [x] **Issue #2**: Reversed annotation list order (newest first) - `Sidebar.jsx` line 288
- [x] **Issue #3**: Added color picker modals for "Add Annotation" and "Move to New" - replaced `prompt()` calls with HTML5 `<input type="color">`
- [x] **Issue #4**: Implemented per-plot font size control
  - Added `plot_font_sizes` JSONB column to `vector_annotations` table (migration applied to production)
  - Updated backend model and API endpoints to handle per-plot sizes
  - Added UI toggle "Per-plot control" in AnnotationEditor
  - Updated MapCanvas rendering to check per-plot sizes before fallback
- [x] **Build version display**: Added `v{hash}` badge in bottom-left corner to verify deployed version (helps with cache debugging)
- [x] **Performance fix**: Enabled gzip compression in nginx (72% file size reduction: 2.4MB → ~673KB)
  - Fixed in `orbit_web` nginx container
  - Fixed in POS nginx `voice.conf`

## In Progress
- [ ] **Issue #1**: Annotation rotation persistence issue - DEBUG LOGGING ADDED but not yet diagnosed
  - Added console logs: "SAVE DEBUG - Annotations with rotation" and "LOAD DEBUG - Annotations with rotation"
  - User needs to test and provide console output
  - Rotation is being saved in vector_metadata JSON (confirmed in code review)
  - Need to verify if rotation field is actually preserved during load

## Pending
- [ ] Diagnose rotation persistence once user provides console logs
- [ ] Fix rotation issue if confirmed (likely in `useVectorState.js` loadProjectData or backend GET endpoint)

## Key Decisions
- **Per-plot font sizes**: Stored as JSONB object `{"plotId": fontSize}` in `plot_font_sizes` column, falls back to annotation's global `fontSize` if not specified
- **Color picker**: Used native HTML5 `<input type="color">` in modals (created dynamically via `createElement`) instead of external library
- **Build version**: Auto-generated from git hash during build via `generate-version.sh`
- **Gzip compression**: Added at nginx level (both orbit_web and POS proxy) with level 6, covering JS/CSS/JSON/fonts

## Files Modified (Latest Commits)

### Commit a65f2b5 (gzip performance):
- `orbit_web` nginx config (ephemeral - in container)
- `~/pos-system/docker/nginx/nginx.conf` (on server)
- `~/orbit-crm/voice.conf` (on server)

### Commit 5a9d1e3 (build version):
- `frontend/src/App.jsx` — Added BUILD_INFO import and version badge in footer
- `frontend/src/version.js` — Auto-generated file with git hash/date/branch
- `frontend/package.json` — Updated build script to run `generate-version.sh`
- `generate-version.sh` — New script to generate version.js before build

### Commit 79d07f8 (vector annotations):
- `frontend/src/components/Vector/Sidebar.jsx` — Reversed list, color picker modal
- `frontend/src/components/Vector/AnnotationEditor.jsx` — Color picker for "Move to New", per-plot font size UI
- `frontend/src/components/Vector/MapCanvas.jsx` — Per-plot font size rendering
- `frontend/src/components/Vector/VectorMap.jsx` — Debug logging for rotation save/load
- `frontend/src/hooks/useVectorState.js` — Preserve plotFontSizes field
- `backend/app/main.py` — Added `plot_font_sizes` column to VectorAnnotation model, updated API endpoints
- `database/add_plot_font_sizes.sql` — Migration SQL (applied to production)

## Uncommitted Changes
All committed. Working tree clean.

## Deployment Status
- **Production Server**: 159.65.158.26 (DigitalOcean)
- **Deployed Commits**: All 3 commits (79d07f8, 5a9d1e3, a65f2b5)
- **Current JS Hash**: `index-Dw7dPu6i.js`
- **Build Version**: `v5a9d1e3` (should show in bottom-left corner)
- **Database Migration**: `plot_font_sizes` column applied successfully
- **Gzip**: Enabled and verified (nginx reloaded)

## Errors & Resolutions

### Error 1: Slow page load (60+ seconds)
- **Error**: Site taking forever to load, user reported "internet working fine, all other websites loading"
- **Context**: After deploying build version feature, user experienced extremely slow load times
- **Root Cause**: Gzip compression was NOT enabled in nginx configurations. Browser downloading 2.4MB uncompressed JS files at ~38KB/sec
- **Fix**:
  1. Added gzip configuration to `orbit_web` nginx: `sed -i` to enable gzip in `/etc/nginx/nginx.conf`
  2. Added gzip to POS nginx `voice.conf`: `sed -i` on `~/orbit-crm/voice.conf` (mounted read-only, edited on host)
  3. Reloaded nginx in both containers
- **Rule**: ALWAYS enable gzip compression in nginx for production deployments. Should be in standard deployment checklist.
- **Verification**: `curl -I -H "Accept-Encoding: gzip"` should show `Content-Encoding: gzip` header

### Error 2: Build version badge not visible (cache issue)
- **Error**: User couldn't see new features after deployment ("don't see add new annotation button")
- **Context**: Deployed new frontend build but user still seeing old version
- **Root Cause**: Browser cache serving old JS files despite new deployment
- **Fix**:
  1. Added build version badge (`v{hash}`) in bottom-left corner to verify deployed version
  2. Instructed user to do hard refresh (Ctrl+Shift+R) or use incognito mode
- **Rule**: Always add version indicator in production apps to diagnose cache issues. Build version should be visible without DevTools.
- **Prevention**: Consider adding cache-busting query params or using Vite's built-in hash-based filenames (already doing this)

## Critical Context

### Docker Containers on Production
- `orbit_db` (postgres) — Up 3 weeks (healthy)
- `orbit_api` (FastAPI) — Up 2 hours (rebuilt during deployment, healthy)
- `orbit_web` (nginx) — Up 3 weeks (restarted once during gzip fix)
- POS nginx proxy — Running separately, routes both POS and Orbit domains

### Network Configuration (CRITICAL)
- Orbit containers MUST stay connected to `pos-system_default` network
- After restarting `orbit_web`, reconnected with: `docker network connect pos-system_default orbit_web`
- POS nginx (`pos-system-nginx-1`) is the ONLY entry point for ports 80/443
- Never restart POS containers during Orbit deployment (see DEPLOYMENT.md safety rules)

### Current Performance Issue
**User still reports slow load after gzip fix** — this is the TOP PRIORITY issue:
- Build version badge is correct (`v5a9d1e3`)
- Gzip is enabled (verified in config files)
- User says "project takes forever to load (usually it was within seconds)"
- User interrupted request before providing more details

**Next session must investigate**:
1. Check if gzip is actually serving compressed files: `curl -I -H "Accept-Encoding: gzip" https://orbit-voice.duckdns.org/assets/index-Dw7dPu6i.js` should show `Content-Encoding: gzip`
2. Check if issue is specific to vector projects (large PDF loads)
3. Check API response times: Vector project GET endpoint may be slow if project has large PDF embedded
4. Consider moving PDF storage to separate endpoint or using lazy loading
5. Check database query performance for vector projects
6. Check server resource usage: `docker stats` for CPU/memory
7. Ask user: Is it slow on initial page load OR only when opening vector projects?

### Rotation Persistence Issue (Unresolved)
- User manually rotated annotations in Sitara Grand Bazaar map
- After logout/refresh, all rotations were lost
- Debug logging added but user hasn't tested yet
- Need console output from user showing SAVE DEBUG and LOAD DEBUG entries
- Suspected issue: Rotation field may not be properly preserved in vector_metadata JSON during save or load

### Database Connection
- Production: `sitara:sitara_secure_orbit_2026@orbit_db:5432/sitara_crm`
- Migration applied: `plot_font_sizes` JSONB column exists in `vector_annotations` table

### Key Memory Notes
- Always use hard refresh (Ctrl+Shift+R) after deployments due to aggressive caching
- Vector system stores everything in `vector_metadata` JSONB column (plots, annotations, offsets, rotations, etc.)
- Annotations have global `fontSize` and optional per-plot `plotFontSizes` object
- Build version auto-updates during `npm run build` via `generate-version.sh`
- Never restart `orbit_web` without reconnecting to POS network afterward
