# QA Report: UI Enhancements
**Date:** 2026-02-19 | **Agent:** Cursor | **Branch:** `wip/Tasks-Subtask`

---

## Verdict: **FAIL**

### Summary
- **Enhancement 1 (Scroll Preservation):** ❌ NOT IMPLEMENTED
- **Enhancement 2 (Delete Subtask):** ⚠️ PARTIALLY IMPLEMENTED (missing spec details)
- **Enhancement 3 (Active/Completed Sectioning):** ✅ IMPLEMENTED

---

## Critical Issues (Must-Fix Before Local Acceptance)

### Issue 1: Micro-Task Completion Scroll Preservation Missing
**File:** `frontend/src/components/Tasks/MicroTaskList.jsx`  
**Lines:** 48-66  
**Severity:** HIGH

**Problem:**
- No scroll position preservation implemented in `toggleComplete` function
- Page may jump/scroll when micro-task checkbox is toggled
- Violates Enhancement 1 requirement

**Expected Behavior:**
- Store scroll position before state update: `const scrollY = window.scrollY`
- Restore after DOM update: `window.scrollTo(0, scrollY)`

**Current Code:**
```javascript
const toggleComplete = async (mt) => {
  if (disabled) return;
  const next = !mt.is_completed;
  setItems((prev) => prev.map((m) => (m.id === mt.id ? { ...m, is_completed: next } : m)));
  // Missing: scroll position preservation
  setPendingId(mt.id);
  // ... API call
};
```

**Fix Required:**
```javascript
const toggleComplete = async (mt) => {
  if (disabled) return;
  const scrollY = window.scrollY; // Store scroll position
  const next = !mt.is_completed;
  setItems((prev) => prev.map((m) => (m.id === mt.id ? { ...m, is_completed: next } : m)));
  // Restore scroll after state update
  requestAnimationFrame(() => {
    window.scrollTo(0, scrollY);
  });
  setPendingId(mt.id);
  // ... rest of code
};
```

---

### Issue 2: Delete Modal Missing Micro-Task and Comment Counts
**File:** `frontend/src/components/Tasks/SubtaskCard.jsx`  
**Lines:** 243-268  
**Severity:** MEDIUM

**Problem:**
- Modal copy is generic: "This will remove the subtask and all its micro-tasks."
- Does not show actual counts of micro-tasks and comments
- Does not match spec requirement

**Expected Behavior (per spec):**
- Show subtask title in quotes
- Show "This will also delete:" section with:
  - `"• {count} micro-task(s)"` (if micro_tasks.length > 0)
  - `"• {count} comment(s)"` (if comment_count > 0)
- Show "This action cannot be undone."

**Current Code:**
```javascript
<h4 className="text-sm font-semibold text-gray-900">Delete subtask?</h4>
<p className="text-sm text-gray-600">This will remove the subtask and all its micro-tasks.</p>
```

**Fix Required:**
```javascript
<h4 className="text-sm font-semibold text-gray-900">Delete Subtask?</h4>
<p className="text-sm text-gray-600">Are you sure you want to delete this subtask?</p>
<p className="text-sm text-gray-700 italic">"{localSubtask.title}"</p>
{(localSubtask.micro_tasks?.length > 0 || localSubtask.comment_count > 0) && (
  <div className="text-sm text-gray-600 mt-2">
    <p>This will also delete:</p>
    <ul className="list-disc list-inside ml-2">
      {localSubtask.micro_tasks?.length > 0 && (
        <li>{localSubtask.micro_tasks.length} micro-task{localSubtask.micro_tasks.length !== 1 ? 's' : ''}</li>
      )}
      {localSubtask.comment_count > 0 && (
        <li>{localSubtask.comment_count} comment{localSubtask.comment_count !== 1 ? 's' : ''}</li>
      )}
    </ul>
  </div>
)}
<p className="text-sm text-gray-600 mt-2">This action cannot be undone.</p>
```

---

### Issue 3: Delete Button Text Mismatch
**File:** `frontend/src/components/Tasks/SubtaskCard.jsx`  
**Lines:** 263  
**Severity:** LOW

**Problem:**
- Button text is "Delete" instead of "Delete Subtask" (per spec)

**Current Code:**
```javascript
{saving ? 'Deleting...' : 'Delete'}
```

**Fix Required:**
```javascript
{saving ? 'Deleting...' : 'Delete Subtask'}
```

---

### Issue 4: Toast Message Mismatch
**File:** `frontend/src/components/Tasks/SubtaskCard.jsx`  
**Lines:** 85  
**Severity:** LOW

**Problem:**
- Toast says "Subtask deleted" instead of "Subtask deleted successfully" (per spec)

**Current Code:**
```javascript
if (addToast) addToast('Success', 'Subtask deleted', 'success');
```

**Fix Required:**
```javascript
if (addToast) addToast('Success', 'Subtask deleted successfully', 'success');
```

---

## Enhancement 3: Active vs Completed Sectioning

### Status: ✅ PASS

**Implementation Verified:**
- ✅ Active section always expanded (line 1164)
- ✅ Completed section collapsed by default (line 922: `useState(false)`)
- ✅ Toggle button with chevron icon (lines 1184-1191)
- ✅ Empty states handled (lines 1167, 1194)
- ✅ Smooth transitions (CSS transition classes)

**File:** `frontend/src/components/Tasks/TasksView.jsx`  
**Lines:** 1077-1200

**No issues found.**

---

## Non-Critical Issues

### Issue 5: Delete Button Placement
**File:** `frontend/src/components/Tasks/SubtaskCard.jsx`  
**Lines:** 216-223  
**Severity:** LOW

**Observation:**
- Delete button is always visible in expanded state (per spec: should be always visible when expanded)
- Spec also mentions hover-visible in collapsed state, but current implementation doesn't show delete button in collapsed state
- **Acceptable:** Current implementation is functional, though not fully matching spec

---

## Test Results

### Enhancement 1: Scroll Preservation
- **Test:** Toggle micro-task checkbox, observe scroll position
- **Result:** ❌ FAIL - Scroll position not preserved, page may jump

### Enhancement 2: Delete Subtask
- **Test:** Click delete button, verify modal content
- **Result:** ⚠️ PARTIAL - Modal works but missing counts and proper copy
- **Test:** Confirm deletion, verify toast
- **Result:** ⚠️ PARTIAL - Toast message doesn't match spec

### Enhancement 3: Active/Completed Sectioning
- **Test:** Verify completed section collapsed by default
- **Result:** ✅ PASS
- **Test:** Toggle completed section
- **Result:** ✅ PASS
- **Test:** Verify empty states
- **Result:** ✅ PASS

---

## Must-Fix Before Local Acceptance

1. **Issue 1 (HIGH):** Implement scroll position preservation in MicroTaskList.jsx `toggleComplete` function
2. **Issue 2 (MEDIUM):** Update delete modal to show micro-task and comment counts with proper copy
3. **Issue 3 (LOW):** Change delete button text to "Delete Subtask"
4. **Issue 4 (LOW):** Update toast message to "Subtask deleted successfully"

---

## Ready for Local Retest: **NO**

**Blocking Issues:**
- Scroll preservation not implemented (Enhancement 1)
- Delete modal missing required information (Enhancement 2)

**Recommendation:**
- Fix Issues 1 and 2 before retest
- Issues 3 and 4 are minor copy changes, can be fixed in same pass

---

*Generated: 2026-02-19 | Agent: Cursor | Branch: wip/Tasks-Subtask*

