"""
Seed demo data for frontend integration testing.
Creates a realistic task hierarchy: parent -> subtask -> micro-tasks -> comments + linked entity.

Usage:
    python backend/tests/seed_demo_data.py

Outputs the created IDs for use in curl commands or frontend dev.
"""
import httpx
import json
import sys

BASE = "http://localhost:8010"


def main():
    # 1. Login
    r = httpx.post(f"{BASE}/api/auth/login", data={"username": "REP-0009", "password": "test123"})
    if r.status_code != 200:
        print(f"FATAL: Login failed: {r.text}", file=sys.stderr)
        return 1
    token = r.json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}
    user_id = r.json()["user"]["id"]
    user_name = r.json()["user"]["name"]
    print(f"Logged in as {user_name} ({user_id})")

    # 2. Get a real customer for cross-tab linking
    r = httpx.get(f"{BASE}/api/customers?limit=1", headers=h)
    cust_id = None
    cust_name = "N/A"
    if r.status_code == 200 and r.json():
        cust_id = r.json()[0]["id"]
        cust_name = r.json()[0].get("name", "Unknown")
        print(f"Linking to customer: {cust_name} ({cust_id})")

    # 3. Get a second rep for assignee variety
    r = httpx.get(f"{BASE}/api/company-reps", headers=h)
    alt_rep_id = None
    alt_rep_name = None
    if r.status_code == 200 and r.json():
        for rep in r.json():
            if rep["id"] != user_id and rep.get("status") == "active":
                alt_rep_id = rep["id"]
                alt_rep_name = rep["name"]
                break
    if alt_rep_id:
        print(f"Alt assignee: {alt_rep_name} ({alt_rep_id})")

    # 4. Create parent task (linked to customer if available)
    parent_data = {
        "title": "Follow up with customer about Block-B payment",
        "type": "general",
        "priority": "high",
        "description": "Customer has pending installments. Need to call, prepare docs, and process partial payment.",
    }
    if cust_id:
        parent_data["crm_entity_type"] = "customer"
        parent_data["crm_entity_id"] = cust_id
    r = httpx.post(f"{BASE}/api/tasks", headers=h, data=parent_data)
    if r.status_code != 200:
        print(f"FATAL: Create parent failed: {r.text}", file=sys.stderr)
        return 1
    parent = r.json()
    print(f"\nParent task: {parent['task_id']} — {parent['title']}")

    # 5. Create subtask 1 (with alt assignee)
    sub1_data = {"title": "Call customer office", "priority": "high"}
    if alt_rep_id:
        sub1_data["assignee_id"] = alt_rep_id
    sub1_data["due_date"] = "2026-02-25"
    r = httpx.post(f"{BASE}/api/tasks/{parent['task_id']}/subtasks", headers=h, data=sub1_data)
    if r.status_code != 200:
        print(f"FATAL: Create subtask1 failed: {r.text}", file=sys.stderr)
        return 1
    sub1 = r.json()
    print(f"  Subtask 1: {sub1['task_id']} — {sub1['title']}")

    # 6. Create subtask 2
    sub2_data = {"title": "Process partial payment if agreed", "priority": "medium", "due_date": "2026-02-28"}
    r = httpx.post(f"{BASE}/api/tasks/{parent['task_id']}/subtasks", headers=h, data=sub2_data)
    sub2 = r.json() if r.status_code == 200 else None
    if sub2:
        print(f"  Subtask 2: {sub2['task_id']} — {sub2['title']}")

    # 7. Create micro-tasks on subtask 1
    mt_titles = [
        ("Check outstanding balance", None, None),
        ("Prepare payment schedule PDF", "2026-02-24", alt_rep_id),
        ("Schedule the call", "2026-02-25", alt_rep_id),
    ]
    mt_ids = []
    for i, (title, due, assignee) in enumerate(mt_titles):
        mt_data = {"title": title, "sort_order": str(i)}
        if due:
            mt_data["due_date"] = due
        if assignee:
            mt_data["assignee_id"] = assignee
        r = httpx.post(f"{BASE}/api/tasks/{sub1['task_id']}/micro-tasks", headers=h, data=mt_data)
        if r.status_code == 200:
            mt = r.json()
            mt_ids.append(mt["id"])
            print(f"    MT{i+1}: {mt['title']} (id={mt['id'][:8]}...)")

    # 8. Complete the first micro-task
    if mt_ids:
        r = httpx.put(f"{BASE}/api/micro-tasks/{mt_ids[0]}", headers=h, data={"is_completed": "true"})
        if r.status_code == 200:
            print(f"    -> MT1 marked complete")

    # 9. Create micro-tasks on subtask 2
    if sub2:
        sub2_mts = ["Create receipt entry", "Update installment schedule", "Send confirmation SMS"]
        for i, title in enumerate(sub2_mts):
            r = httpx.post(f"{BASE}/api/tasks/{sub2['task_id']}/micro-tasks", headers=h,
                           data={"title": title, "sort_order": str(i)})
            if r.status_code == 200:
                print(f"    MT: {title}")

    # 10. Add comments at all three levels
    # Parent-level comment
    httpx.post(f"{BASE}/api/tasks/{parent['task_id']}/comments", headers=h,
               data={"content": "Good progress on this. Let's close by end of week."})
    print(f"\n  Comment on parent: 'Good progress...'")

    # Subtask-level comment
    httpx.post(f"{BASE}/api/tasks/{sub1['task_id']}/comments", headers=h,
               data={"content": "Customer prefers morning calls, before 11am."})
    print(f"  Comment on subtask1: 'Customer prefers morning calls...'")

    # Micro-task-level comment
    if mt_ids:
        httpx.post(f"{BASE}/api/micro-tasks/{mt_ids[1]}/comments", headers=h,
                   data={"content": "PDF ready. Used template from last month."})
        httpx.post(f"{BASE}/api/micro-tasks/{mt_ids[1]}/comments", headers=h,
                   data={"content": "Approved, looks good."})
        print(f"  2 comments on MT2 (Prepare payment schedule PDF)")

    # 11. Print summary
    print(f"\n{'='*60}")
    print(f"SEED DATA SUMMARY")
    print(f"{'='*60}")
    print(f"Parent task:    {parent['task_id']}  (UUID: {parent['id']})")
    print(f"Subtask 1:      {sub1['task_id']}  (UUID: {sub1['id']})")
    if sub2:
        print(f"Subtask 2:      {sub2['task_id']}  (UUID: {sub2['id']})")
    print(f"Micro-task IDs: {mt_ids}")
    if cust_id:
        print(f"Linked customer: {cust_name} (UUID: {cust_id})")
    print(f"\nCurl quick-test:")
    print(f"  # Detail with micro_tasks:")
    print(f"  curl http://localhost:8010/api/tasks/{parent['task_id']} -H 'Authorization: Bearer <TOKEN>'")
    print(f"  # All comments aggregated:")
    print(f"  curl 'http://localhost:8010/api/tasks/{parent['task_id']}/comments?scope=all' -H 'Authorization: Bearer <TOKEN>'")
    if cust_id:
        print(f"  # Cross-tab customer tasks:")
        print(f"  curl http://localhost:8010/api/customers/{cust_id}/tasks -H 'Authorization: Bearer <TOKEN>'")
    print(f"{'='*60}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
