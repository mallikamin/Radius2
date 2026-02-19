# Micro-Task API Contract (for Codex frontend integration)

> Base URL: `http://localhost:8010`
> Auth: `Authorization: Bearer <JWT>`
> All mutations use `application/x-www-form-urlencoded` (FormData)

---

## 1. POST `/api/tasks/{task_id}/micro-tasks` — Create micro-task

**Constraint:** `task_id` must be a subtask (has `parent_task_id`). Returns 400 otherwise.

**Request (FormData):**
| Field | Type | Required | Default |
|-------|------|----------|---------|
| title | string(300) | YES | — |
| assignee_id | UUID string | no | null |
| due_date | ISO date (YYYY-MM-DD) | no | null |
| sort_order | integer | no | 0 |

**Response 200:**
```json
{
  "id": "947ed598-4cba-4648-83b0-fa30641d674c",
  "task_id": "e2ebc1aa-e46d-4210-82db-3d41ec1f2bda",
  "title": "Prepare payment schedule",
  "is_completed": false,
  "assignee_id": null,
  "assignee_name": null,
  "due_date": "2026-03-01",
  "sort_order": 0,
  "created_by": "b51aab53-f0c0-4760-8596-f150fc23b0f8",
  "completed_at": null,
  "completed_by": null,
  "comment_count": 0,
  "created_at": "2026-02-19T18:21:04.434017+00:00",
  "updated_at": "2026-02-19T18:21:04.434017+00:00"
}
```

**Errors:**
| Code | When |
|------|------|
| 400 | `task_id` is a root task (no parent) — `"Micro-tasks can only be added to subtasks"` |
| 404 | `task_id` not found |
| 403 | User has no access to parent task |

---

## 2. GET `/api/tasks/{task_id}/micro-tasks` — List micro-tasks

**Response 200:** Array of micro-task objects (same shape as above), ordered by `sort_order`, then `created_at`.

---

## 3. PUT `/api/micro-tasks/reorder` — Batch reorder

**Request (FormData):**
| Field | Type | Required |
|-------|------|----------|
| items | JSON string | YES |

`items` format: `[{"id": "uuid", "sort_order": 0}, {"id": "uuid", "sort_order": 1}]`

**Response 200:**
```json
{"detail": "Reordered 2 micro-tasks"}
```

**Errors:** 400 if `items` is not valid JSON or not an array.

---

## 4. PUT `/api/micro-tasks/{micro_task_id}` — Update micro-task

**Request (FormData) — all optional:**
| Field | Type | Notes |
|-------|------|-------|
| title | string | New title |
| is_completed | string | `"true"` or `"false"` — auto-sets `completed_at`/`completed_by` |
| assignee_id | UUID string | New assignee |
| due_date | ISO date | New due date |
| sort_order | integer | New position |

**Response 200:** Updated micro-task object.

**Key behavior:** When `is_completed` toggles to `true`, `completed_at` is set to now and `completed_by` to the current user. When toggled back to `false`, both are cleared to `null`.

**Errors:** 404 if not found, 403 if no access.

---

## 5. DELETE `/api/micro-tasks/{micro_task_id}` — Delete micro-task

**Response 200:**
```json
{"detail": "Micro-task deleted"}
```

**Errors:** 404, 403.

---

## 6. POST `/api/micro-tasks/{micro_task_id}/comments` — Add comment

**Request (FormData):**
| Field | Type | Required |
|-------|------|----------|
| content | string (max 5000) | YES |

**Response 200:**
```json
{
  "id": "9a38d016-b42a-4217-ac8e-2ae5dffe4a58",
  "content": "PDF ready, uploaded",
  "task_id": "e2ebc1aa-e46d-4210-82db-3d41ec1f2bda",
  "micro_task_id": "947ed598-4cba-4648-83b0-fa30641d674c",
  "author_id": "b51aab53-f0c0-4760-8596-f150fc23b0f8",
  "author_name": "Sarosh Javed",
  "created_at": "2026-02-19T18:21:05.094830"
}
```

**Errors:** 400 if content > 5000 chars, 404, 403.

---

## 7. GET `/api/micro-tasks/{micro_task_id}/comments` — List comments

**Response 200:** Array of comment objects (same shape as above), ordered by `created_at DESC`, limit 50.

---

## 8. GET `/api/tasks/{task_id}` — Enhanced task detail (MODIFIED)

**New fields in each subtask object:**

```json
{
  "...existing task fields...",
  "subtasks": [
    {
      "...existing subtask fields...",
      "micro_tasks": [
        {
          "id": "uuid",
          "title": "Prepare PDF",
          "is_completed": true,
          "assignee_id": "uuid|null",
          "assignee_name": "Sarosh|null",
          "due_date": "2026-03-01|null",
          "sort_order": 0,
          "comment_count": 2,
          "completed_at": "iso|null",
          "completed_by": "uuid|null",
          "created_by": "uuid",
          "created_at": "iso",
          "updated_at": "iso"
        }
      ],
      "micro_task_progress": {
        "total": 3,
        "completed": 1
      },
      "comment_count": 5,
      "is_completed": false
    }
  ]
}
```

**`micro_tasks`** is always present (empty array if none).
**`micro_task_progress`** is always present.
**`comment_count`** counts only direct comments on the subtask (excludes micro-task comments).
**`is_completed`** computed boolean (`status === "completed"`). Use for frontend Active/Completed grouping.

---

## 9. GET `/api/tasks/{task_id}/comments?scope=all` — Comment aggregation (MODIFIED)

**New query param:** `scope` = `"task"` (default) | `"all"`

- `scope=task`: Returns only comments directly on this task (excludes micro-task comments). Same as before.
- `scope=all`: Returns comments from this task + all subtasks + all micro-tasks under subtasks. Each comment gets a `context` object.

**Response with `scope=all`:**
```json
[
  {
    "id": "uuid",
    "content": "Parent level comment",
    "author_id": "uuid",
    "author_name": "Sarosh Javed",
    "created_at": "iso",
    "context": {
      "type": "task",
      "title": "Follow up with customer",
      "parent_subtask_title": null
    }
  },
  {
    "id": "uuid",
    "content": "Subtask level comment",
    "author_id": "uuid",
    "author_name": "Hassan",
    "created_at": "iso",
    "context": {
      "type": "subtask",
      "title": "Call customer office",
      "parent_subtask_title": null
    }
  },
  {
    "id": "uuid",
    "content": "PDF ready, uploaded",
    "author_id": "uuid",
    "author_name": "Sarosh",
    "created_at": "iso",
    "context": {
      "type": "micro_task",
      "title": "Prepare payment schedule PDF",
      "parent_subtask_title": "Call customer office"
    }
  }
]
```

**`context.type`** values: `"task"`, `"subtask"`, `"micro_task"`

---

## 10-13. Cross-tab entity endpoints

All four follow identical pattern:

| Method | Path |
|--------|------|
| GET | `/api/customers/{customer_id}/tasks` |
| GET | `/api/projects/{project_id}/tasks` |
| GET | `/api/inventory/{inventory_id}/tasks` |
| GET | `/api/transactions/{transaction_id}/tasks` |

**Response 200:**
```json
{
  "tasks": [
    {
      "...all standard task fields...",
      "subtask_count": 3,
      "subtask_completed": 1,
      "micro_task_count": 8,
      "micro_task_completed": 5,
      "comment_count": 4
    }
  ],
  "total": 1
}
```

Only returns root tasks (no subtasks). `comment_count` includes all levels.

**Errors:** 400 if entity ID is not a valid UUID.

---

## Quick-test curl commands

```bash
# Get token
TOKEN=$(curl -s -X POST http://localhost:8010/api/auth/login \
  -d "username=REP-0009&password=test123" | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Use seed data (created by seed script):
# Parent: TASK-00021, Subtask1: TASK-00022, Subtask2: TASK-00023
# Customer: eb2c8971-ca8f-408c-bab2-3875ed082398

# List micro-tasks on subtask
curl -s http://localhost:8010/api/tasks/TASK-00022/micro-tasks \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool

# Toggle a micro-task complete
curl -s -X PUT http://localhost:8010/api/micro-tasks/bf00436d-70fa-4038-b424-1570844c41e9 \
  -H "Authorization: Bearer $TOKEN" -d "is_completed=true"

# Get task detail with micro_tasks
curl -s http://localhost:8010/api/tasks/TASK-00021 \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool

# Get aggregated comments
curl -s "http://localhost:8010/api/tasks/TASK-00021/comments?scope=all" \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool

# Cross-tab: customer tasks
curl -s http://localhost:8010/api/customers/eb2c8971-ca8f-408c-bab2-3875ed082398/tasks \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
```

---

## Edge cases and known behaviors

| Scenario | Expected | Code |
|----------|----------|------|
| Create micro-task on root task (no parent) | Rejected | 400 |
| Create micro-task on nonexistent task | Not found | 404 |
| Toggle complete sets completed_at/completed_by | Auto-populated | 200 |
| Toggle back to incomplete clears completed_at/completed_by | Both become null | 200 |
| Comment > 5000 chars | Rejected | 400 |
| Reorder with invalid JSON | Rejected | 400 |
| Reorder with unknown UUIDs | Silently skipped (no error) | 200 |
| Delete micro-task cascades its comments | Comments deleted by DB FK CASCADE | 200 |
| Delete subtask (`DELETE /api/tasks/{subtask_id}`) | Cascades: micro_tasks, comments, activities all deleted via DB FK CASCADE | 200 |
| Delete parent task | Code deletes subtasks first (line 9518), each subtask cascades its micro-tasks/comments | 200 |
| Subtask `is_completed` field | Computed: `status == "completed"`. Use for Active/Completed grouping | — |
| scope=all on task with no subtasks | Returns only task's own comments | 200 |
| Cross-tab with no linked tasks | Returns `{"tasks": [], "total": 0}` | 200 |
| Cross-tab with invalid UUID | Bad request | 400 |
| All mutations use FormData (not JSON body) | Standard for this codebase | — |
