# Task & Subtask Enhancement Plan

> Branch: `wip/Tasks-Subtask` | Worktree: `radius2-analytics`
> Agents: TARS (backend), Codex (frontend), Cursor (UI/UX templates)
> Date: 2026-02-19

---

## 1. Overview

Upgrade the task management system from a flat Task + simple-checkbox-subtask model to a rich 2-level hierarchy with micro-task checklists, per-level comments, deadlines, and bidirectional cross-tab entity linking.

**Current state:**
- Task -> Subtask (subtask is a Task with `parent_task_id`)
- Subtask UI: checkbox + title only (no deadline, no comments, no detail view)
- CRM linking: one-way (task references entity, entity doesn't show tasks)
- Comments: per-task only, no micro-task concept

**Target state:**
- Task -> Subtask (full: assignee, deadline, priority, status, comments)
- Subtask -> Micro-tasks (lightweight checklist: title, checkbox, optional assignee, optional deadline)
- Comments: per-level with "All Comments" aggregate view on parent
- Cross-tab: Customer/Project/Transaction/Inventory detail pages show linked tasks
- Real-time sync: changes in one view reflected in all views

---

## 2. Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Nesting depth | 2 full levels + checklist | Task -> Subtask (full Task model) -> Micro-task (lightweight). Prevents infinite nesting complexity while giving enough structure. |
| Micro-task model | Separate `micro_tasks` table | Lightweight: title, checkbox, optional assignee/deadline. NOT a full task — no status workflow, no priority, no department. |
| Micro-task comments | Extend `task_comments` with nullable `micro_task_id` FK | Reuse existing comment infrastructure. A comment belongs to a task OR a micro-task. |
| Cross-tab linking | Bidirectional via API queries | Entity detail pages fetch linked tasks. No new FK columns needed — query existing `linked_*_id` fields on tasks table. |
| Comment aggregation | "All Comments" tab on parent task | Query comments across parent + subtasks + micro-tasks, tagged with source context. |
| Subtask detail UI | Expandable inline card (not separate modal) | Click subtask row -> expands in-place showing full fields, micro-tasks, comments. Keeps context visible. |

---

## 3. Data Model Changes

### 3a. New Table: `micro_tasks`

```sql
CREATE TABLE micro_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,  -- parent subtask
    title VARCHAR(300) NOT NULL,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    assignee_id UUID REFERENCES company_reps(id) ON DELETE SET NULL,
    due_date DATE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by UUID NOT NULL REFERENCES company_reps(id),
    completed_at TIMESTAMPTZ,
    completed_by UUID REFERENCES company_reps(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_micro_tasks_task ON micro_tasks(task_id);
CREATE INDEX idx_micro_tasks_assignee ON micro_tasks(assignee_id);
```

**Constraints:**
- `task_id` must reference a task that HAS a `parent_task_id` (i.e., is itself a subtask). Enforced at application level, not DB level, to avoid complex check constraints.
- `ON DELETE CASCADE`: deleting a subtask deletes its micro-tasks.
- `sort_order` for drag-reorder within the subtask.

### 3b. Alter Table: `task_comments`

```sql
ALTER TABLE task_comments
    ADD COLUMN micro_task_id UUID REFERENCES micro_tasks(id) ON DELETE CASCADE;

CREATE INDEX idx_task_comments_micro_task ON task_comments(micro_task_id);

COMMENT ON COLUMN task_comments.micro_task_id IS
    'If set, this comment belongs to a micro-task. task_id still references the parent subtask for aggregation queries.';
```

**Comment ownership rules:**
- `task_id` set, `micro_task_id` NULL -> comment on task/subtask
- `task_id` set, `micro_task_id` set -> comment on micro-task (task_id = parent subtask for JOIN convenience)

### 3c. New ORM Model: `MicroTask`

```python
# backend/app/models/tasks.py (add to existing file)

class MicroTask(Base):
    __tablename__ = 'micro_tasks'

    id = Column(PG_UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    task_id = Column(PG_UUID(as_uuid=True), ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False)
    title = Column(String(300), nullable=False)
    is_completed = Column(Boolean, nullable=False, server_default=text("false"))
    assignee_id = Column(PG_UUID(as_uuid=True), ForeignKey('company_reps.id', ondelete='SET NULL'))
    due_date = Column(Date)
    sort_order = Column(Integer, nullable=False, server_default=text("0"))
    created_by = Column(PG_UUID(as_uuid=True), ForeignKey('company_reps.id'), nullable=False)
    completed_at = Column(DateTime(timezone=True))
    completed_by = Column(PG_UUID(as_uuid=True), ForeignKey('company_reps.id'))
    created_at = Column(DateTime(timezone=True), server_default=text("NOW()"))
    updated_at = Column(DateTime(timezone=True), server_default=text("NOW()"))
```

### 3d. Alter ORM: `TaskComment`

```python
# Add to existing TaskComment model
micro_task_id = Column(PG_UUID(as_uuid=True), ForeignKey('micro_tasks.id', ondelete='CASCADE'))
```

---

## 4. API Changes

### 4a. New Endpoints

| Method | Path | Description | Request Body |
|--------|------|-------------|-------------|
| `POST` | `/api/tasks/{task_id}/micro-tasks` | Create micro-task on a subtask | `{ title, assignee_id?, due_date?, sort_order? }` |
| `GET` | `/api/tasks/{task_id}/micro-tasks` | List micro-tasks for a subtask | — |
| `PUT` | `/api/micro-tasks/{id}` | Update micro-task | `{ title?, is_completed?, assignee_id?, due_date?, sort_order? }` |
| `DELETE` | `/api/micro-tasks/{id}` | Delete micro-task | — |
| `POST` | `/api/micro-tasks/{id}/comments` | Add comment to micro-task | `{ content }` |
| `GET` | `/api/micro-tasks/{id}/comments` | Get micro-task comments | — |
| `PUT` | `/api/micro-tasks/reorder` | Batch reorder micro-tasks | `{ items: [{ id, sort_order }] }` |

### 4b. Cross-Tab Entity Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/customers/{id}/tasks` | Tasks linked to customer (+ subtasks + micro-task counts) |
| `GET` | `/api/projects/{id}/tasks` | Tasks linked to project |
| `GET` | `/api/inventory/{id}/tasks` | Tasks linked to inventory item |
| `GET` | `/api/transactions/{id}/tasks` | Tasks linked to transaction |

**Response shape (all 4):**
```json
{
  "tasks": [
    {
      "id": "uuid",
      "task_id": "TASK-00123",
      "title": "Follow up with customer about payment",
      "status": "in_progress",
      "priority": "high",
      "assignee_name": "Faisal",
      "due_date": "2026-02-25",
      "subtask_count": 3,
      "subtask_completed": 1,
      "micro_task_count": 8,
      "micro_task_completed": 5,
      "comment_count": 4,
      "created_at": "2026-02-19T10:00:00Z"
    }
  ],
  "total": 5
}
```

### 4c. Modified Endpoints

**`GET /api/tasks/{task_id}` — Enhanced response:**
```json
{
  "...existing fields...",
  "subtasks": [
    {
      "id": "uuid",
      "task_id": "TASK-00124",
      "title": "Call customer re: installment",
      "status": "pending",
      "priority": "medium",
      "assignee_id": "uuid",
      "assignee_name": "Hassan",
      "due_date": "2026-02-22",
      "micro_tasks": [
        {
          "id": "uuid",
          "title": "Prepare payment schedule PDF",
          "is_completed": false,
          "assignee_id": "uuid",
          "assignee_name": "Sarosh",
          "due_date": "2026-02-21",
          "comment_count": 2
        }
      ],
      "micro_task_progress": { "total": 3, "completed": 1 },
      "comment_count": 5
    }
  ]
}
```

**`GET /api/tasks/{task_id}/comments?scope=all` — New query param:**
- `scope=task` (default): comments on this task only
- `scope=all`: comments across entire subtree (this task + subtasks + micro-tasks), each tagged with:
  ```json
  {
    "id": "uuid",
    "content": "Payment schedule looks correct",
    "author_name": "Faisal",
    "created_at": "2026-02-19T14:30:00Z",
    "context": {
      "type": "micro_task",
      "title": "Prepare payment schedule PDF",
      "parent_subtask_title": "Call customer re: installment"
    }
  }
  ```

### 4d. Subtask Creation — Already Enhanced

**`POST /api/tasks/{task_id}/subtasks` already accepts:**
`FormData { title (required), description, assignee_id, priority, due_date }`

No changes needed to this endpoint — it already supports all fields via FormData.
The frontend AddSubtaskForm just needs to send all fields (currently only sends title).

---

## 5. Frontend Changes

### 5a. Component Architecture

```
TasksView.jsx (existing — modify)
├── TaskDetailModal (existing — major upgrade)
│   ├── SubtaskSection (new component)
│   │   ├── SubtaskCard (new — expandable card per subtask)
│   │   │   ├── SubtaskHeader (title, assignee, due date, priority, progress)
│   │   │   ├── MicroTaskList (new — checklist inside expanded subtask)
│   │   │   │   ├── MicroTaskItem (checkbox + title + assignee chip + due date)
│   │   │   │   └── AddMicroTaskInput (inline input)
│   │   │   ├── SubtaskComments (reuse comment component, scoped to subtask)
│   │   │   └── SubtaskProperties (inline edit: status, assignee, due date, priority)
│   │   └── AddSubtaskForm (new — replaces current text input)
│   ├── CommentSection (existing — upgrade with scope toggle)
│   │   ├── ScopeToggle: "This task" | "All comments"
│   │   └── CommentItem (existing — add context tag for aggregated view)
│   └── ActivitySection (existing — no changes)
│
├── EntityTaskWidget (new — reusable cross-tab component)
│   ├── TaskCard (compact: title, status badge, assignee, due date, progress)
│   ├── QuickAddTask (inline form: title + assignee + due date)
│   └── "View in Tasks" link
│
└── Existing views (Active, Kanban, Timeline, My, Dept, Dashboard — minor updates)
    └── Show subtask/micro-task progress counts in task rows
```

### 5b. Cross-Tab Integration Points

| Page | Where | What |
|------|-------|------|
| `CustomersPage.jsx` | Customer detail section | `<EntityTaskWidget entityType="customer" entityId={id} />` |
| `TransactionsPage.jsx` | Transaction detail modal | `<EntityTaskWidget entityType="transaction" entityId={id} />` |
| `ProjectsPage.jsx` | Project detail section | `<EntityTaskWidget entityType="project" entityId={id} />` |
| `InventoryPage.jsx` | Inventory detail/sell modal | `<EntityTaskWidget entityType="inventory" entityId={id} />` |

### 5c. Subtask Card Behavior

**Collapsed state (default):**
```
┌──────────────────────────────────────────────────────────────┐
│ ☐ Call customer re: installment                    ▸ expand  │
│   👤 Hassan  📅 Feb 22  🔵 Medium  ██░░ 1/3 micro-tasks     │
└──────────────────────────────────────────────────────────────┘
```

**Expanded state (click to expand):**
```
┌──────────────────────────────────────────────────────────────┐
│ ☐ Call customer re: installment                    ▾ collapse│
│   👤 Hassan  📅 Feb 22  🔵 Medium  Status: Pending          │
│                                                              │
│ ┌─ Micro-tasks ──────────────────────────────── 1/3 ───────┐ │
│ │ ☑ Prepare payment schedule PDF      👤 Sarosh  📅 Feb 21 │ │
│ │ ☐ Get approval from finance lead                         │ │
│ │ ☐ Schedule call with customer       👤 Hassan  📅 Feb 22 │ │
│ │ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │ │
│ │ + Add micro-task...                                      │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌─ Comments (3) ───────────────────────────────────────────┐ │
│ │ Hassan · 2h ago                                          │ │
│ │ "Customer prefers morning call, before 11am"             │ │
│ │                                                          │ │
│ │ Sarosh · 1h ago                                          │ │
│ │ "PDF ready, uploaded to media"                           │ │
│ │ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │ │
│ │ Write a comment...                              [Post]   │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 5d. Micro-Task Inline Comment

When a micro-task is clicked, a small popover or inline section shows:
```
┌─────────────────────────────────────────────┐
│ ☑ Prepare payment schedule PDF              │
│   👤 Sarosh  📅 Feb 21  ✓ Completed        │
│                                             │
│   💬 2 comments                             │
│   ┌─────────────────────────────────┐       │
│   │ Sarosh · 1h ago                 │       │
│   │ "Used template from last month" │       │
│   │                                 │       │
│   │ Faisal · 30m ago               │       │
│   │ "Approved, looks good"          │       │
│   └─────────────────────────────────┘       │
│   Write a comment...            [Post]      │
└─────────────────────────────────────────────┘
```

### 5e. "All Comments" Aggregate View

On the parent task's Comments tab, a scope toggle:
```
┌────────────────────────────────────────────────────────┐
│ Comments    [This task ▪] [All comments]               │
│                                                        │
│ 📌 on "Call customer re: installment" (subtask)        │
│ Hassan · 2h ago                                        │
│ "Customer prefers morning call, before 11am"           │
│                                                        │
│ 📌 on "Prepare payment schedule PDF" (micro-task)      │
│ Sarosh · 1h ago                                        │
│ "Used template from last month"                        │
│                                                        │
│ 📌 on this task                                        │
│ Faisal · 45m ago                                       │
│ "Good progress on this, let's close by EOW"            │
│                                                        │
│ 📌 on "Prepare payment schedule PDF" (micro-task)      │
│ Faisal · 30m ago                                       │
│ "Approved, looks good"                                 │
└────────────────────────────────────────────────────────┘
```

### 5f. Cross-Tab Entity Task Widget

Compact widget embedded in entity detail pages:
```
┌─ Linked Tasks (3) ──────────────────────── [+ Add Task] ─┐
│                                                           │
│ TASK-00123 · Follow up about payment          🔴 Urgent  │
│ 👤 Faisal  📅 Feb 25  ██░░ 1/3 subtasks                  │
│                                                           │
│ TASK-00156 · Site visit for unit inspection   🔵 Medium  │
│ 👤 Hassan  📅 Mar 01  ████ 2/2 subtasks  ✓               │
│                                                           │
│ TASK-00189 · Documentation for transfer       🟡 Low     │
│ 👤 Sarosh  📅 Mar 05  ░░░░ 0/1 subtasks                  │
│                                                           │
│                              [View all in Tasks tab →]    │
└───────────────────────────────────────────────────────────┘
```

Quick-add form (inline):
```
┌─ Add Task ───────────────────────────────────────────────┐
│ Title: [________________________]                        │
│ Assign to: [▼ Select rep]  Due: [📅 Pick date]          │
│ Priority: ○Low ●Medium ○High ○Urgent                    │
│                                    [Cancel]  [Create]    │
└──────────────────────────────────────────────────────────┘
```

---

## 6. Enhanced Subtask Creation Form

Replace the current single text input with a proper form:

```
┌─ Add Subtask ────────────────────────────────────────────┐
│ Title: [________________________] (required)             │
│                                                          │
│ Assign to: [▼ Select rep]  Due: [📅 Pick date]          │
│ Priority: [▼ Medium]                                     │
│                                                          │
│ Description (optional):                                  │
│ [___________________________________________________]    │
│                                    [Cancel]  [Create]    │
└──────────────────────────────────────────────────────────┘
```

---

## 7. Sync Strategy

### 7a. Within Task Detail Modal
- All mutations (subtask status change, micro-task toggle, comment add) trigger a full re-fetch of `GET /api/tasks/{task_id}` to get fresh state.
- Optimistic UI for micro-task toggles (instant checkbox flip, rollback on error).

### 7b. Cross-Tab Sync
- When a task is created/modified from an entity detail page (via EntityTaskWidget), the Tasks tab data is invalidated.
- Approach: Use a shared `taskVersion` counter in Zustand's `dataStore`. Increment on any task mutation. Tasks tab checks version on focus/visibility and re-fetches if stale.
- EntityTaskWidget fetches independently via `GET /api/{entity_type}/{id}/tasks` — always fresh on mount.

### 7c. Kanban/Timeline/Active Sync
- Task list views re-fetch when:
  1. TaskDetailModal closes after changes
  2. Tab becomes active (visibility change)
  3. Subtask status changes (affects parent progress display)

---

## 8. Agent Assignments

### TARS (Backend — Claude Code)
All backend work happens in `backend/app/main.py` (monolithic) and `backend/app/services/task_service.py`:
1. Database migration: `backend/migrations/phase9_micro_tasks.sql`
2. `MicroTask` ORM model in `main.py` (after TaskActivity, line ~586)
3. `TaskComment` alteration: add `micro_task_id` FK in `main.py`
4. Micro-task CRUD endpoints in `main.py` (7 endpoints)
5. Enhanced task detail response (micro_tasks array + progress counts)
6. "All Comments" aggregation query (`scope=all` param)
7. Cross-tab entity task endpoints (4 new GET endpoints in `main.py`)
8. Activity logging for micro-task actions in `task_service.py`
9. Backend tests: `backend/tests/test_micro_tasks.py`

### Codex (Frontend — OpenAI Codex)
All new components go in `frontend/src/components/Tasks/`. Cross-tab integration goes in `App.jsx`:
1. `SubtaskCard.jsx` — expandable card with micro-tasks + comments
2. `MicroTaskList.jsx` + `MicroTaskItem.jsx` — checklist components
3. `AddSubtaskForm.jsx` — full form (sends all FormData fields)
4. `SubtaskComments.jsx` — per-subtask/micro-task comment thread
5. Comment scope toggle in TaskDetailModal ("This task" / "All comments")
6. `EntityTaskWidget.jsx` — compact cross-tab widget
7. Integration into `App.jsx` entity detail sections (NOT separate page files)
8. Task sync: re-fetch on mutation + visibility-based refresh (no Zustand needed — use existing pattern)

### Cursor (UI/UX Templates — first task)
1. Review + refine `mockups/task-detail-enhanced.html`
2. Add: loading skeletons, empty states, error states, mobile considerations
3. Verify visual consistency with existing `TasksView.jsx` patterns
4. Design QA after Codex implementation

---

## 9. Implementation Phases

### Phase A: Schema + Backend Core (TARS) — PARALLEL with Phase B
1. Write migration: `backend/migrations/phase9_micro_tasks.sql`
2. Apply migration to local dev DB, verify with psql
3. Add `MicroTask` model to `backend/app/main.py` (after line 586, after TaskActivity)
4. Add `micro_task_id` column to `TaskComment` model in `main.py`
5. Add micro-task CRUD endpoints to `main.py` (POST, GET, PUT, DELETE, comments)
6. Enhance `GET /api/tasks/{task_id}` response with micro_tasks array + progress counts
7. Add `GET /api/tasks/{task_id}/comments?scope=all` aggregation
8. Add 4 cross-tab endpoints to `main.py`: GET `/api/{entity}/{id}/tasks`
9. Test all endpoints with curl
10. Add backend tests for micro-task CRUD + comment aggregation

### Phase B: UI/UX Templates (Cursor) — PARALLEL with Phase A
1. Review existing `mockups/task-detail-enhanced.html` in browser
2. Refine mockups: add loading skeletons, empty states, error states
3. Verify visual consistency with `TasksView.jsx` patterns
4. Review with Malik before Codex starts

### Phase C: Frontend Implementation (Codex) — after A + B
1. Create new components in `frontend/src/components/Tasks/`:
   SubtaskCard, MicroTaskList, MicroTaskItem, AddSubtaskForm, SubtaskComments
2. Upgrade TaskDetailModal in `TasksView.jsx` with new components
3. Add comment scope toggle ("This task" / "All comments")
4. Create `EntityTaskWidget.jsx` in `frontend/src/components/Tasks/`
5. Integrate EntityTaskWidget into entity detail sections in `App.jsx`
   (customers tab, transactions tab, projects tab, inventory tab)
6. Add task sync logic (re-fetch on mutation, visibility-based refresh)

### Phase D: Integration Test + Polish (All)
1. TARS: End-to-end curl test of full scenario (task → subtask → micro-tasks → comments → cross-tab)
2. Codex: Frontend smoke test (all views render, mutations sync)
3. Cursor: Design QA — compare implemented UI to mockups
4. TARS: Run backend tests, verify no regressions

### Phase E: Deploy to DigitalOcean
1. Merge to production branch
2. Run migration on DO server (test on local copy first)
3. Rebuild containers, verify all endpoints
4. Frontend build + deploy

---

## 10. Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| Subtask expansion makes modal too tall | Max-height with scroll, lazy-load comments |
| N+1 queries on micro-tasks | Batch load micro-tasks for all subtasks in single query |
| Cross-tab widget stale data | taskVersion counter + visibility-based refresh |
| Migration on production DB with data | Test migration on local DB copy first |
| Cursor unfamiliar with codebase | HTML-only mockups (no React), existing component patterns documented |

---

## 11. Files to Create/Modify

### New Files
- `backend/migrations/phase9_micro_tasks.sql` — Migration (CREATE TABLE + ALTER)
- `frontend/src/components/Tasks/SubtaskCard.jsx` — Expandable subtask card
- `frontend/src/components/Tasks/MicroTaskList.jsx` — Micro-task checklist container
- `frontend/src/components/Tasks/MicroTaskItem.jsx` — Single micro-task row
- `frontend/src/components/Tasks/AddSubtaskForm.jsx` — Full subtask creation form
- `frontend/src/components/Tasks/SubtaskComments.jsx` — Per-subtask comment thread
- `frontend/src/components/Tasks/EntityTaskWidget.jsx` — Cross-tab linked tasks widget
- `backend/tests/test_micro_tasks.py` — Backend tests for micro-task CRUD

### Modified Files
- `backend/app/main.py` — Add MicroTask model (after line 586), add micro_task_id to TaskComment, add micro-task endpoints, add cross-tab entity endpoints, enhance task detail response
- `backend/app/services/task_service.py` — Micro-task activity logging, comment aggregation queries
- `frontend/src/components/Tasks/TasksView.jsx` — Major TaskDetailModal upgrade (SubtaskCard integration, comment scope toggle)
- `frontend/src/App.jsx` — Add EntityTaskWidget to customer/transaction/project/inventory detail sections

---

## 12. Example Scenarios

### Scenario 1: Sales Follow-up Task
**Task**: "Follow up with Mr. Khan about Block-B payment" (linked to customer CUST-0042)
- **Subtask 1**: "Call customer office" | Assignee: Hassan | Due: Feb 22 | Priority: High
  - Micro-task: "Check outstanding balance" | Assignee: Sarosh
  - Micro-task: "Prepare payment schedule PDF" | Assignee: Sarosh | Due: Feb 21
  - Micro-task: "Schedule the call" | Assignee: Hassan
  - Comment: "Customer prefers morning calls before 11am" — Hassan
- **Subtask 2**: "Process partial payment if agreed" | Assignee: Faisal | Due: Feb 25
  - Micro-task: "Create receipt entry"
  - Micro-task: "Update installment schedule"
  - Micro-task: "Send confirmation SMS"
- **Subtask 3**: "Update broker about status" | Assignee: Hassan | Due: Feb 26

**Cross-tab**: This task appears in Customer CUST-0042's detail page under "Linked Tasks (1)" with progress bar showing subtask/micro-task completion.

### Scenario 2: Site Visit with Documentation
**Task**: "Site visit for Greenfield Phase 3 handover" (linked to project PRJ-0012)
- **Subtask 1**: "Pre-visit documentation" | Assignee: Sarosh | Due: Mar 1
  - Micro-task: "Print plot allocation sheets"
  - Micro-task: "Prepare handover checklist"
  - Micro-task: "Collect customer signatures needed list"
- **Subtask 2**: "On-site inspection" | Assignee: Hassan + Faisal | Due: Mar 3
  - Micro-task: "Check utility connections"
  - Micro-task: "Photograph all units"
  - Micro-task: "Note any defects"
  - Comment: "Bring extra batteries for camera" — Faisal

**Cross-tab**: Visible in Project PRJ-0012's detail page AND in customer detail pages for all customers with units in that project.
