# Design Specification: Tasks-Subtask Enhancement
**Branch:** `wip/Tasks-Subtask` | **Date:** 2026-02-19 | **Agent:** Cursor → Codex

---

## 1. Design Readiness Verdict

**VERDICT: READY WITH FIXES**

The mockup (`mockups/task-detail-enhanced.html`) aligns with PLAN_Tasks-Subtask.md architecture. All required components are represented. Minor fixes needed for edge states and API contract confirmation.

**Status:** Codex can proceed with implementation using this spec. TARS blockers listed below must be resolved before cross-tab integration.

---

## 2. Top 10 Implementation Rules for Codex

### Rule 1: Component Structure
- **SubtaskCard**: Expandable card (not modal). Click header toggles expansion. Chevron rotates 180° on expand. Animation: 150ms ease-in-out.
- **MicroTaskList**: Renders inside expanded SubtaskCard. Checkbox toggles use optimistic UI (instant flip, rollback on API error).
- **MicroTaskItem**: Checkbox (3.5×3.5px), title, assignee chip (text-xs bg-gray-100), optional due_date (text-xs text-gray-400). Completed items: line-through + text-gray-500.

### Rule 2: Color Palette (Match Existing TasksView.jsx)
- Priority badges: `urgent` → `bg-red-100 text-red-700`, `high` → `bg-orange-100 text-orange-700`, `medium` → `bg-blue-100 text-blue-700`, `low` → `bg-gray-100 text-gray-600`
- Status badges: `pending` → `bg-yellow-50 text-yellow-700`, `in_progress` → `bg-blue-50 text-blue-700`, `completed` → `bg-green-50 text-green-700`
- Overdue dates: `text-red-600 font-medium` with `(overdue)` suffix in `text-xs text-red-500`

### Rule 3: Spacing & Typography
- SubtaskCard header: `px-4 py-3`. Body padding: `px-4 pb-4`. Gap between subtasks: `space-y-2`.
- Micro-task row: `py-1.5 px-2`. Gap between elements: `gap-2.5`.
- Text sizes: Subtask title `text-sm font-medium`, micro-task title `text-sm`, assignee chip `text-xs`, due date `text-xs`.
- Border radius: Cards `rounded-lg`, chips `rounded`, progress bars `rounded-full`.

### Rule 4: Expand/Collapse Behavior
- Default: All subtasks collapsed. User can expand multiple simultaneously.
- Expanded state: Shows micro-tasks section, comments section, inline edit controls.
- Header click area: Entire row (except checkbox). Checkbox click does NOT toggle expansion (use `onClick={e => e.stopPropagation()}`).
- Chevron icon: `transition-transform` with `rotate-180` class when expanded.

### Rule 5: Micro-Task Interactions
- Checkbox toggle: Optimistic update (immediate UI change). On error: revert + show toast.
- Comment icon: Only visible on hover (`opacity-0 group-hover:opacity-100`). Click opens popover (see Rule 6).
- Add micro-task input: Inline below list. Placeholder: "Add micro-task...". Enter key submits, Escape cancels.

### Rule 6: Micro-Task Comment Popover
- Trigger: Chat icon on micro-task row (visible on hover).
- Position: Below micro-task row, left-aligned with checkbox (`ml-8 mt-1`).
- Max width: `max-w-sm`. Background: `bg-white border border-gray-200 rounded-lg shadow-sm p-3`.
- Close: Click outside OR Escape key. Show comment count badge if > 0.

### Rule 7: Comment Scope Toggle
- Location: Comments tab header, right-aligned (`ml-auto`).
- Toggle buttons: `bg-gray-100 rounded-lg p-0.5` container. Active: `bg-white text-gray-900 shadow-sm`. Inactive: `text-gray-500`.
- "This task": Shows comments on parent task only (default).
- "All comments": Shows aggregated comments with context tags. Each comment shows: `context.type` (task/subtask/micro_task), `context.title`, `context.parent_subtask_title` (if micro-task).

### Rule 8: AddSubtaskForm
- Trigger: "Add subtask" button below subtask list. Toggles form visibility.
- Fields: Title (required, `text-sm border rounded-lg px-3 py-2`), Assignee dropdown, Due date picker, Priority dropdown.
- Layout: Grid 3 columns on desktop (`grid-cols-3 gap-3`). Stack on mobile (< 640px).
- Description: Collapsible textarea (toggle button: "Add description (optional)"). Hidden by default.
- Actions: Cancel (text-gray-500) + Create (bg-gray-900 text-white). Form resets on submit.

### Rule 9: EntityTaskWidget (Cross-Tab)
- Placement: In entity detail pages (Customer/Project/Transaction/Inventory). Above or below main entity details (TARS blocker #1).
- Header: "Linked Tasks (N)" with "+ Add Task" button (bg-white border border-gray-200).
- Task cards: Compact layout. Status dot (w-2 h-2 rounded-full), task_id (text-xs font-mono text-gray-400), title (text-sm), priority badge, assignee, due date, progress bar (w-12 h-1 bg-gray-200 with green fill).
- Quick-add form: Toggle button shows/hides. Fields: Title, Assignee, Due date, Priority (radio buttons: Low/Med/High). Submit creates task with `linked_customer_id` (or project/transaction/inventory) set.

### Rule 10: Responsive Behavior
- Mobile breakpoint: `640px` (Tailwind `sm:`).
- TaskDetailModal: Full-screen on mobile (`fixed inset-0`), centered modal on desktop (`max-w-7xl mx-auto`).
- SubtaskCard: Header remains single line (truncate long titles). Expanded body scrolls if needed (`max-h-96 overflow-y-auto`).
- AddSubtaskForm: Grid becomes single column on mobile (`grid-cols-1 sm:grid-cols-3`).
- Touch targets: Minimum 44×44px for all interactive elements (checkboxes, buttons, clickable rows).

---

## 3. Top 10 QA Checks

### Check 1: Subtask Expansion
- **Pass:** Clicking subtask header expands body. Chevron rotates. Micro-tasks and comments visible.
- **Fail:** Body doesn't show, chevron doesn't rotate, or expansion breaks layout.

### Check 2: Micro-Task Checkbox Toggle
- **Pass:** Checkbox click toggles `is_completed` immediately (optimistic). API call succeeds. Completed items show line-through.
- **Fail:** Checkbox doesn't toggle, or UI doesn't update until API response.

### Check 3: Comment Scope Toggle
- **Pass:** "This task" shows only parent task comments. "All comments" shows aggregated list with context tags (subtask title, micro-task title).
- **Fail:** Toggle doesn't switch views, or context tags missing in "All comments" mode.

### Check 4: AddSubtaskForm Submission
- **Pass:** Form submits with all fields (title, assignee_id, due_date, priority). New subtask appears in list. Form resets.
- **Fail:** Form doesn't submit, or only title sent (missing other fields).

### Check 5: Micro-Task Comment Popover
- **Pass:** Hover shows comment icon. Click opens popover below row. Popover shows existing comments. Escape closes.
- **Fail:** Popover doesn't open, or positioning breaks layout.

### Check 6: Empty States
- **Pass:** No subtasks shows "No subtasks" message. No micro-tasks shows empty list with "Add micro-task..." input. No comments shows empty state in comments section.
- **Fail:** Empty states show errors or broken layout.

### Check 7: Loading States
- **Pass:** Task detail modal shows skeleton loader while fetching. Subtask expansion shows loading spinner if micro-tasks/comments loading.
- **Fail:** No loading indicators, or blank screen during fetch.

### Check 8: Error Handling
- **Pass:** API errors show toast notification. Optimistic updates roll back on error. Form validation shows inline errors (red border + error text).
- **Fail:** Errors crash UI, or no user feedback on failure.

### Check 9: Keyboard Navigation
- **Pass:** Tab navigates through all interactive elements. Enter expands subtask. Escape closes popovers/modals. Focus visible (ring-2 ring-gray-900/20).
- **Fail:** Keyboard navigation skips elements, or focus not visible.

### Check 10: Cross-Tab EntityTaskWidget
- **Pass:** Widget renders on Customer/Project/Transaction/Inventory detail pages. Shows linked tasks with progress. Quick-add creates task with correct `linked_*_id`. "View all in Tasks tab" link navigates correctly.
- **Fail:** Widget missing, or tasks not linked to entity.

---

## 4. TARS Blockers (Max 5)

### Blocker 1: EntityTaskWidget Placement
- **Issue:** PLAN section 5b lists integration points but doesn't specify exact placement (above/below entity details, or in sidebar).
- **Decision Needed:** Confirm placement for each entity type (Customer, Project, Transaction, Inventory).
- **Owner:** TARS (backend) + Malik (product decision)
- **Priority:** Medium (Codex can implement with default: below main entity details)

### Blocker 2: Micro-Task Validation Error Response
- **Issue:** PLAN section 3a states "task_id must reference a task that HAS a parent_task_id" (enforced at application level). UI needs error message format.
- **Decision Needed:** What error message/code when creating micro-task on non-subtask? (e.g., "Micro-tasks can only be added to subtasks")
- **Owner:** TARS
- **Priority:** High (blocks micro-task creation)

### Blocker 3: Comment Context Object Structure
- **Issue:** PLAN section 4c shows `context` object in "All Comments" response. Mockup assumes `context.type`, `context.title`, `context.parent_subtask_title`. Need confirmation.
- **Decision Needed:** Exact JSON structure for `context` field in aggregated comments response.
- **Owner:** TARS
- **Priority:** High (blocks "All Comments" view)

### Blocker 4: Cross-Tab API Response Fields
- **Issue:** PLAN section 4b shows response with `subtask_count`, `subtask_completed`, `micro_task_count`, `micro_task_completed`. Need confirmation these are included in all 4 endpoints.
- **Decision Needed:** Confirm `/api/customers/{id}/tasks`, `/api/projects/{id}/tasks`, `/api/inventory/{id}/tasks`, `/api/transactions/{id}/tasks` all return these progress fields.
- **Owner:** TARS
- **Priority:** Medium (Codex can implement with fallback if missing)

### Blocker 5: Task Version Sync Mechanism
- **Issue:** PLAN section 7b mentions `taskVersion` counter in Zustand `dataStore`. Need API contract: how does frontend know when to invalidate? (WebSocket? Polling? Response header?)
- **Decision Needed:** Sync strategy for cross-tab updates (real-time vs on-focus refresh).
- **Owner:** TARS + Codex (coordination)
- **Priority:** Low (can use simple on-focus refresh as fallback)

---

## Known Gaps

1. **Animation Timings:** Specific durations not in mockup. Default: 150ms ease-in-out for expand/collapse.
2. **Field Limits:** Character limits not specified. Default: Title 300 chars (matches DB), Description 2000 chars.
3. **Error Copy:** Exact error messages not defined. Use generic: "Failed to [action]. Please try again."
4. **Mobile Breakpoints:** Only `640px` confirmed. Tablet breakpoint (`768px`) behavior not specified.
5. **Accessibility:** ARIA labels not in mockup. Codex should add: `aria-expanded` on subtask headers, `aria-label` on buttons.

---

## Handoff Summary

**File Path:** `C:\Users\Malik\Desktop\radius2-analytics\DESIGN_SPEC_Tasks-Subtask.md`

**Status:** READY WITH FIXES

**Codex Action Items:**
1. Implement SubtaskCard with expand/collapse (Rule 1-4)
2. Implement MicroTaskList with optimistic toggles (Rule 5)
3. Add comment scope toggle (Rule 7)
4. Build AddSubtaskForm (Rule 8)
5. Create EntityTaskWidget (Rule 9) — wait for Blocker 1 resolution
6. Add responsive breakpoints (Rule 10)
7. Run QA checks 1-10 before marking tasks complete

**TARS Action Items:**
1. Resolve Blocker 2 (micro-task validation error format)
2. Resolve Blocker 3 (comment context structure)
3. Confirm Blocker 4 (cross-tab API response fields)

**Next Steps:**
- Codex starts with tasks 7-8 (SubtaskCard, MicroTaskList) — no blockers
- Codex waits for TARS on tasks 9 (EntityTaskWidget) until blockers resolved
- Cursor reviews final implementation (task 10) against this spec

---

*Generated: 2026-02-19 | Agent: Cursor | Branch: wip/Tasks-Subtask*

