"""
Integration tests for micro-task CRUD, comment aggregation, and cross-tab endpoints.
Runs against the live dev API at http://localhost:8010.

Usage:
    docker exec orbit_dev_api pytest /app/tests/test_micro_tasks.py -v
"""
import httpx
import pytest
import uuid

BASE = "http://localhost:8010"
AUTH_HEADER = {}
_state = {}


@pytest.fixture(scope="module", autouse=True)
def auth_token():
    """Login once and reuse the token for all tests."""
    r = httpx.post(f"{BASE}/api/auth/login", data={"username": "REP-0009", "password": "test123"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    token = r.json()["access_token"]
    AUTH_HEADER["Authorization"] = f"Bearer {token}"


@pytest.fixture(scope="module")
def parent_task():
    """Create a parent task for the test suite."""
    r = httpx.post(f"{BASE}/api/tasks", headers=AUTH_HEADER,
                   data={"title": f"Test Parent {uuid.uuid4().hex[:6]}", "type": "general", "priority": "high"})
    assert r.status_code == 200, f"Create parent failed: {r.text}"
    d = r.json()
    _state["parent_id"] = d["id"]
    _state["parent_task_id"] = d["task_id"]
    return d


@pytest.fixture(scope="module")
def subtask(parent_task):
    """Create a subtask under the parent."""
    r = httpx.post(f"{BASE}/api/tasks/{parent_task['task_id']}/subtasks", headers=AUTH_HEADER,
                   data={"title": f"Test Subtask {uuid.uuid4().hex[:6]}", "priority": "medium"})
    assert r.status_code == 200, f"Create subtask failed: {r.text}"
    d = r.json()
    _state["subtask_id"] = d["id"]
    _state["subtask_task_id"] = d["task_id"]
    return d


# ============================================
# MICRO-TASK CRUD TESTS
# ============================================

class TestMicroTaskCreate:
    def test_create_micro_task(self, subtask):
        r = httpx.post(f"{BASE}/api/tasks/{subtask['task_id']}/micro-tasks", headers=AUTH_HEADER,
                       data={"title": "Prepare PDF", "due_date": "2026-03-15"})
        assert r.status_code == 200
        d = r.json()
        assert d["title"] == "Prepare PDF"
        assert d["is_completed"] is False
        assert d["due_date"] == "2026-03-15"
        assert d["comment_count"] == 0
        _state["mt1_id"] = d["id"]

    def test_create_micro_task_with_sort_order(self, subtask):
        r = httpx.post(f"{BASE}/api/tasks/{subtask['task_id']}/micro-tasks", headers=AUTH_HEADER,
                       data={"title": "Schedule call", "sort_order": "1"})
        assert r.status_code == 200
        d = r.json()
        assert d["sort_order"] == 1
        _state["mt2_id"] = d["id"]

    def test_create_micro_task_with_assignee(self, subtask):
        r = httpx.post(f"{BASE}/api/tasks/{subtask['task_id']}/micro-tasks", headers=AUTH_HEADER,
                       data={"title": "Review docs", "sort_order": "2"})
        assert r.status_code == 200
        _state["mt3_id"] = r.json()["id"]

    def test_create_micro_task_on_non_subtask_fails(self, parent_task):
        """Micro-tasks can only be added to subtasks (tasks with parent_task_id)."""
        r = httpx.post(f"{BASE}/api/tasks/{parent_task['task_id']}/micro-tasks", headers=AUTH_HEADER,
                       data={"title": "Should fail"})
        assert r.status_code == 400
        assert "subtask" in r.json()["detail"].lower()

    def test_create_micro_task_on_nonexistent_task(self):
        r = httpx.post(f"{BASE}/api/tasks/TASK-99999/micro-tasks", headers=AUTH_HEADER,
                       data={"title": "Should fail"})
        assert r.status_code == 404


class TestMicroTaskList:
    def test_list_micro_tasks(self, subtask):
        r = httpx.get(f"{BASE}/api/tasks/{subtask['task_id']}/micro-tasks", headers=AUTH_HEADER)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 3
        titles = [m["title"] for m in items]
        assert "Prepare PDF" in titles
        assert "Schedule call" in titles

    def test_list_micro_tasks_ordered(self, subtask):
        r = httpx.get(f"{BASE}/api/tasks/{subtask['task_id']}/micro-tasks", headers=AUTH_HEADER)
        items = r.json()
        sort_orders = [m["sort_order"] for m in items]
        assert sort_orders == sorted(sort_orders)


class TestMicroTaskUpdate:
    def test_toggle_complete(self):
        mt_id = _state["mt1_id"]
        r = httpx.put(f"{BASE}/api/micro-tasks/{mt_id}", headers=AUTH_HEADER,
                      data={"is_completed": "true"})
        assert r.status_code == 200
        d = r.json()
        assert d["is_completed"] is True
        assert d["completed_at"] is not None
        assert d["completed_by"] is not None

    def test_toggle_uncomplete(self):
        mt_id = _state["mt1_id"]
        r = httpx.put(f"{BASE}/api/micro-tasks/{mt_id}", headers=AUTH_HEADER,
                      data={"is_completed": "false"})
        assert r.status_code == 200
        d = r.json()
        assert d["is_completed"] is False
        assert d["completed_at"] is None
        assert d["completed_by"] is None

    def test_update_title(self):
        mt_id = _state["mt1_id"]
        r = httpx.put(f"{BASE}/api/micro-tasks/{mt_id}", headers=AUTH_HEADER,
                      data={"title": "Prepare PDF v2"})
        assert r.status_code == 200
        assert r.json()["title"] == "Prepare PDF v2"

    def test_update_due_date(self):
        mt_id = _state["mt2_id"]
        r = httpx.put(f"{BASE}/api/micro-tasks/{mt_id}", headers=AUTH_HEADER,
                      data={"due_date": "2026-04-01"})
        assert r.status_code == 200
        assert r.json()["due_date"] == "2026-04-01"

    def test_update_nonexistent_fails(self):
        fake_id = str(uuid.uuid4())
        r = httpx.put(f"{BASE}/api/micro-tasks/{fake_id}", headers=AUTH_HEADER,
                      data={"title": "Nope"})
        assert r.status_code == 404


class TestMicroTaskReorder:
    def test_reorder(self):
        import json
        items = json.dumps([
            {"id": _state["mt1_id"], "sort_order": 10},
            {"id": _state["mt2_id"], "sort_order": 20},
        ])
        r = httpx.put(f"{BASE}/api/micro-tasks/reorder", headers=AUTH_HEADER,
                      data={"items": items})
        assert r.status_code == 200
        assert "Reordered" in r.json()["detail"]

    def test_reorder_invalid_json(self):
        r = httpx.put(f"{BASE}/api/micro-tasks/reorder", headers=AUTH_HEADER,
                      data={"items": "not json"})
        assert r.status_code == 400


# ============================================
# MICRO-TASK COMMENT TESTS
# ============================================

class TestMicroTaskComments:
    def test_add_comment(self):
        mt_id = _state["mt1_id"]
        r = httpx.post(f"{BASE}/api/micro-tasks/{mt_id}/comments", headers=AUTH_HEADER,
                       data={"content": "PDF looks good"})
        assert r.status_code == 200
        d = r.json()
        assert d["content"] == "PDF looks good"
        assert d["micro_task_id"] == mt_id
        assert d["author_name"] is not None

    def test_add_second_comment(self):
        mt_id = _state["mt1_id"]
        r = httpx.post(f"{BASE}/api/micro-tasks/{mt_id}/comments", headers=AUTH_HEADER,
                       data={"content": "Approved by finance"})
        assert r.status_code == 200

    def test_list_comments(self):
        mt_id = _state["mt1_id"]
        r = httpx.get(f"{BASE}/api/micro-tasks/{mt_id}/comments", headers=AUTH_HEADER)
        assert r.status_code == 200
        comments = r.json()
        assert len(comments) >= 2
        contents = [c["content"] for c in comments]
        assert "PDF looks good" in contents

    def test_comment_too_long(self):
        mt_id = _state["mt1_id"]
        r = httpx.post(f"{BASE}/api/micro-tasks/{mt_id}/comments", headers=AUTH_HEADER,
                       data={"content": "x" * 5001})
        assert r.status_code == 400

    def test_comment_on_nonexistent_micro_task(self):
        fake_id = str(uuid.uuid4())
        r = httpx.post(f"{BASE}/api/micro-tasks/{fake_id}/comments", headers=AUTH_HEADER,
                       data={"content": "nope"})
        assert r.status_code == 404


# ============================================
# ENHANCED TASK DETAIL TESTS
# ============================================

class TestTaskDetail:
    def test_detail_includes_micro_tasks(self, parent_task):
        r = httpx.get(f"{BASE}/api/tasks/{parent_task['task_id']}", headers=AUTH_HEADER)
        assert r.status_code == 200
        d = r.json()
        assert "subtasks" in d
        assert len(d["subtasks"]) >= 1
        sub = d["subtasks"][0]
        assert "micro_tasks" in sub
        assert "micro_task_progress" in sub
        assert "total" in sub["micro_task_progress"]
        assert "completed" in sub["micro_task_progress"]
        assert "comment_count" in sub

    def test_micro_task_progress_counts(self, parent_task):
        # Complete one micro-task first
        httpx.put(f"{BASE}/api/micro-tasks/{_state['mt1_id']}", headers=AUTH_HEADER,
                  data={"is_completed": "true"})
        r = httpx.get(f"{BASE}/api/tasks/{parent_task['task_id']}", headers=AUTH_HEADER)
        d = r.json()
        sub = d["subtasks"][0]
        prog = sub["micro_task_progress"]
        assert prog["total"] >= 3
        assert prog["completed"] >= 1

    def test_micro_task_has_comment_count(self, parent_task):
        r = httpx.get(f"{BASE}/api/tasks/{parent_task['task_id']}", headers=AUTH_HEADER)
        sub = r.json()["subtasks"][0]
        mt = next(m for m in sub["micro_tasks"] if m["id"] == _state["mt1_id"])
        assert mt["comment_count"] >= 2


# ============================================
# COMMENT AGGREGATION TESTS
# ============================================

class TestCommentAggregation:
    def test_scope_task_default(self, parent_task):
        """Default scope returns only direct comments on this task."""
        # Add a comment on the parent
        httpx.post(f"{BASE}/api/tasks/{parent_task['task_id']}/comments", headers=AUTH_HEADER,
                   data={"content": "Parent level comment"})
        r = httpx.get(f"{BASE}/api/tasks/{parent_task['task_id']}/comments", headers=AUTH_HEADER)
        assert r.status_code == 200
        comments = r.json()
        assert len(comments) >= 1
        # Should NOT have context tags in default scope
        assert "context" not in comments[0]

    def test_scope_all_aggregates(self, parent_task, subtask):
        """scope=all returns comments from task + subtasks + micro-tasks with context."""
        # Add a subtask-level comment
        httpx.post(f"{BASE}/api/tasks/{subtask['task_id']}/comments", headers=AUTH_HEADER,
                   data={"content": "Subtask level comment"})
        r = httpx.get(f"{BASE}/api/tasks/{parent_task['task_id']}/comments?scope=all", headers=AUTH_HEADER)
        assert r.status_code == 200
        comments = r.json()
        assert len(comments) >= 3  # parent + subtask + micro-task comments
        # All should have context tags
        for c in comments:
            assert "context" in c
            assert c["context"]["type"] in ("task", "subtask", "micro_task")

    def test_scope_all_micro_task_context(self, parent_task):
        r = httpx.get(f"{BASE}/api/tasks/{parent_task['task_id']}/comments?scope=all", headers=AUTH_HEADER)
        comments = r.json()
        mt_comments = [c for c in comments if c["context"]["type"] == "micro_task"]
        assert len(mt_comments) >= 1
        # Micro-task comments should have parent_subtask_title
        for mc in mt_comments:
            assert mc["context"]["title"] != ""


# ============================================
# CROSS-TAB ENTITY TASK ENDPOINTS
# ============================================

class TestCrossTabEndpoints:
    def test_customer_tasks(self):
        r = httpx.get(f"{BASE}/api/customers/{str(uuid.uuid4())}/tasks", headers=AUTH_HEADER)
        assert r.status_code == 200
        d = r.json()
        assert "tasks" in d
        assert "total" in d
        assert d["total"] == 0

    def test_project_tasks(self):
        r = httpx.get(f"{BASE}/api/projects/{str(uuid.uuid4())}/tasks", headers=AUTH_HEADER)
        assert r.status_code == 200
        assert r.json()["total"] == 0

    def test_inventory_tasks(self):
        r = httpx.get(f"{BASE}/api/inventory/{str(uuid.uuid4())}/tasks", headers=AUTH_HEADER)
        assert r.status_code == 200
        assert r.json()["total"] == 0

    def test_transaction_tasks(self):
        r = httpx.get(f"{BASE}/api/transactions/{str(uuid.uuid4())}/tasks", headers=AUTH_HEADER)
        assert r.status_code == 200
        assert r.json()["total"] == 0

    def test_customer_tasks_with_data(self):
        """Create a task linked to a real customer, verify it shows up."""
        # Get a real customer
        r = httpx.get(f"{BASE}/api/customers?limit=1", headers=AUTH_HEADER)
        if r.status_code != 200 or not r.json():
            pytest.skip("No customers in DB")
        cust_id = r.json()[0]["id"]
        # Create linked task
        httpx.post(f"{BASE}/api/tasks", headers=AUTH_HEADER,
                   data={"title": "Cross-tab test task", "type": "general",
                         "crm_entity_type": "customer", "crm_entity_id": cust_id})
        r = httpx.get(f"{BASE}/api/customers/{cust_id}/tasks", headers=AUTH_HEADER)
        assert r.status_code == 200
        d = r.json()
        assert d["total"] >= 1
        task = d["tasks"][0]
        assert "subtask_count" in task
        assert "micro_task_count" in task
        assert "comment_count" in task

    def test_invalid_uuid_returns_400(self):
        r = httpx.get(f"{BASE}/api/customers/not-a-uuid/tasks", headers=AUTH_HEADER)
        assert r.status_code == 400


# ============================================
# MICRO-TASK DELETE TEST
# ============================================

class TestMicroTaskDelete:
    def test_delete_micro_task(self):
        mt_id = _state["mt3_id"]
        r = httpx.delete(f"{BASE}/api/micro-tasks/{mt_id}", headers=AUTH_HEADER)
        assert r.status_code == 200
        assert r.json()["detail"] == "Micro-task deleted"
        # Verify it's gone
        r2 = httpx.put(f"{BASE}/api/micro-tasks/{mt_id}", headers=AUTH_HEADER,
                       data={"title": "Should not exist"})
        assert r2.status_code == 404

    def test_delete_nonexistent(self):
        fake_id = str(uuid.uuid4())
        r = httpx.delete(f"{BASE}/api/micro-tasks/{fake_id}", headers=AUTH_HEADER)
        assert r.status_code == 404


# ============================================
# SUBTASK DELETE CASCADE TEST
# ============================================

class TestSubtaskDeleteCascade:
    """Deleting a subtask via DELETE /api/tasks/{id} must cascade-delete its micro-tasks and comments."""

    def test_subtask_delete_cascades_micro_tasks(self):
        # Create a fresh subtask
        r = httpx.post(f"{BASE}/api/tasks/{_state['parent_task_id']}/subtasks", headers=AUTH_HEADER,
                       data={"title": f"Cascade Test Sub {uuid.uuid4().hex[:6]}", "priority": "low"})
        assert r.status_code == 200
        sub = r.json()
        sub_task_id = sub["task_id"]

        # Add micro-tasks to the subtask
        r1 = httpx.post(f"{BASE}/api/tasks/{sub_task_id}/micro-tasks", headers=AUTH_HEADER,
                        data={"title": "Cascade MT 1"})
        assert r1.status_code == 200
        mt1_id = r1.json()["id"]

        r2 = httpx.post(f"{BASE}/api/tasks/{sub_task_id}/micro-tasks", headers=AUTH_HEADER,
                        data={"title": "Cascade MT 2"})
        assert r2.status_code == 200
        mt2_id = r2.json()["id"]

        # Add a comment on the subtask
        httpx.post(f"{BASE}/api/tasks/{sub_task_id}/comments", headers=AUTH_HEADER,
                   data={"content": "Subtask comment for cascade test"})

        # Add a comment on a micro-task
        httpx.post(f"{BASE}/api/micro-tasks/{mt1_id}/comments", headers=AUTH_HEADER,
                   data={"content": "MT comment for cascade test"})

        # Delete the subtask
        r = httpx.delete(f"{BASE}/api/tasks/{sub_task_id}", headers=AUTH_HEADER)
        assert r.status_code == 200

        # Verify micro-tasks are gone
        r = httpx.put(f"{BASE}/api/micro-tasks/{mt1_id}", headers=AUTH_HEADER, data={"title": "ghost"})
        assert r.status_code == 404, "Micro-task 1 should be cascade-deleted"

        r = httpx.put(f"{BASE}/api/micro-tasks/{mt2_id}", headers=AUTH_HEADER, data={"title": "ghost"})
        assert r.status_code == 404, "Micro-task 2 should be cascade-deleted"

    def test_subtask_response_has_is_completed(self):
        """Enriched subtask dict should include is_completed boolean."""
        r = httpx.get(f"{BASE}/api/tasks/{_state['parent_task_id']}", headers=AUTH_HEADER)
        assert r.status_code == 200
        d = r.json()
        if d.get("subtasks"):
            for sub in d["subtasks"]:
                assert "is_completed" in sub, "Subtask missing is_completed field"
                assert isinstance(sub["is_completed"], bool)
                assert sub["is_completed"] == (sub["status"] == "completed")
