# UI/UX Design Spec: Task/Subtask Enhancement Additions
**Branch:** `wip/Tasks-Subtask` | **Date:** 2026-02-19 | **Agent:** Cursor → Codex

---

## Overview

Three new UI/UX enhancements to improve task management workflow:
1. **Micro-task completion without navigation jump** - Prevent page scroll when toggling micro-task checkboxes
2. **Subtask delete action** - Add delete button with confirmation modal
3. **Active vs Completed subtask sectioning** - Separate active and completed subtasks, collapse completed by default

---

## 1. Micro-Task Completion Without Navigation Jump

### Problem Statement
When a user clicks a micro-task checkbox, the page may jump/scroll due to DOM updates, causing disorientation and poor UX.

### Solution
Implement scroll position preservation during optimistic UI updates.

### Desktop Variant

#### Visual Layout
```
┌─────────────────────────────────────────────────────────────┐
│ ☐ Prepare payment schedule PDF  👤 Sarosh  📅 Feb 21      │
│                                                             │
│ ☑ Check outstanding balance    👤 Sarosh  ✓ Completed     │
│                                                             │
│ ☐ Schedule the call             👤 Hassan  📅 Feb 22      │
└─────────────────────────────────────────────────────────────┘
```

#### Interaction Rules
1. **Checkbox Click:**
   - Store current scroll position: `const scrollY = window.scrollY`
   - Toggle checkbox state immediately (optimistic)
   - Apply line-through styling if completed
   - After DOM update: `window.scrollTo(0, scrollY)`
   - Then make API call

2. **Animation:**
   - No animation on checkbox toggle (instant)
   - Line-through fades in over 150ms: `transition: text-decoration 150ms ease-in-out`
   - No layout shift (checkbox maintains position)

3. **Error Handling:**
   - If API fails, revert checkbox state
   - Restore scroll position again after revert
   - Show toast: "Failed to update micro-task. Please try again."

#### Copy Text
- **Toast (Success):** None (silent update)
- **Toast (Error):** "Failed to update micro-task. Please try again."
- **Loading State:** None (optimistic update)

#### Edge States

**Edge Case 1: Multiple Rapid Clicks**
- **Behavior:** Debounce API calls (300ms). Only last state change sent to API.
- **Visual:** Checkbox updates immediately, API call queued.

**Edge Case 2: Scroll During Update**
- **Behavior:** Lock scroll position during update (100ms window).
- **Visual:** No visible change, scroll position preserved.

**Edge Case 3: Very Long Micro-Task List**
- **Behavior:** Scroll position preserved relative to viewport, not document.
- **Visual:** User stays focused on current micro-task row.

### Mobile Variant

#### Visual Layout
```
┌─────────────────────────────────────┐
│ ☐ Prepare payment schedule PDF     │
│    👤 Sarosh  📅 Feb 21             │
│                                     │
│ ☑ Check outstanding balance         │
│    👤 Sarosh  ✓ Completed           │
│                                     │
│ ☐ Schedule the call                 │
│    👤 Hassan  📅 Feb 22             │
└─────────────────────────────────────┘
```

#### Interaction Rules
1. **Touch Target:**
   - Checkbox + label area: minimum 44×44px touch target
   - Entire row is tappable (not just checkbox)

2. **Scroll Preservation:**
   - Same as desktop: preserve scroll position during update
   - Account for mobile keyboard if visible

3. **Haptic Feedback (iOS):**
   - Light haptic on checkbox toggle (if available)
   - No haptic on error revert

#### Copy Text
- Same as desktop

#### Edge States
- **Mobile Keyboard Open:** Preserve scroll relative to visible content area
- **Safari Address Bar:** Account for dynamic viewport height changes

---

## 2. Subtask Delete Action

### Problem Statement
Users need ability to delete subtasks, but deletion should be protected with confirmation to prevent accidental loss.

### Solution
Add delete button with confirmation modal.

### Desktop Variant

#### Visual Layout - Collapsed Subtask
```
┌─────────────────────────────────────────────────────────────┐
│ ☐ Call customer office  🔴 High  👤 Hassan  📅 Feb 22  ▾  │
│                                                             │
│ [Delete] (visible on hover only)                            │
└─────────────────────────────────────────────────────────────┘
```

#### Visual Layout - Expanded Subtask
```
┌─────────────────────────────────────────────────────────────┐
│ ☐ Call customer office  🔴 High  👤 Hassan  📅 Feb 22  ▾  │
│                                                             │
│ ┌─ Micro-tasks ──────────────────────────────── 1/3 ───────┐ │
│ │ ☑ Check outstanding balance    👤 Sarosh  ✓ Completed   │ │
│ │ ☐ Prepare payment schedule PDF  👤 Sarosh  📅 Feb 21    │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                             │
│ [Delete Subtask] (button in header, always visible)        │
└─────────────────────────────────────────────────────────────┘
```

#### Delete Button Placement
- **Collapsed State:** Icon button in header row, right-aligned, visible on hover only
- **Expanded State:** Text button below micro-tasks section, left-aligned, always visible
- **Icon:** Trash icon (SVG), `w-4 h-4`, `text-gray-400 hover:text-red-600`

#### Confirmation Modal

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️ Delete Subtask?                                           │
│                                                             │
│ Are you sure you want to delete this subtask?              │
│                                                             │
│ "Call customer office"                                     │
│                                                             │
│ This will also delete:                                     │
│ • 3 micro-tasks                                             │
│ • 5 comments                                                │
│                                                             │
│ This action cannot be undone.                              │
│                                                             │
│                    [Cancel]  [Delete Subtask]               │
└─────────────────────────────────────────────────────────────┘
```

**Modal Styling:**
- **Width:** `max-w-md` (448px)
- **Background:** `bg-white`
- **Border:** `border border-gray-200 rounded-lg shadow-lg`
- **Padding:** `p-6`
- **Backdrop:** `bg-black/50 backdrop-blur-sm` (overlay)

#### Interaction Rules

1. **Delete Button Click:**
   - Show confirmation modal
   - Focus trap: Tab cycles within modal only
   - Escape key closes modal (cancels)

2. **Confirmation Modal:**
   - **Cancel Button:** Closes modal, no action
   - **Delete Button:** 
     - Shows loading state (spinner + disabled)
     - API call: `DELETE /api/tasks/{subtask_id}`
     - On success: Close modal, remove subtask from list, show toast
     - On error: Show error toast, keep modal open

3. **Loading State:**
   - Delete button: `[Deleting...]` with spinner
   - Both buttons disabled during API call

#### Copy Text

**Button Labels:**
- **Delete Button (Collapsed):** Icon only (trash SVG)
- **Delete Button (Expanded):** "Delete Subtask"
- **Modal Title:** "Delete Subtask?"
- **Modal Body:** 
  - "Are you sure you want to delete this subtask?"
  - `"{subtask_title}"` (in quotes, italic)
  - "This will also delete:"
  - `"• {count} micro-task(s)"` (if micro_tasks.length > 0)
  - `"• {count} comment(s)"` (if comment_count > 0)
  - "This action cannot be undone."
- **Cancel Button:** "Cancel"
- **Delete Button (Modal):** "Delete Subtask"
- **Delete Button (Loading):** "Deleting..."

**Toast Messages:**
- **Success:** "Subtask deleted successfully"
- **Error:** "Failed to delete subtask. Please try again."

#### Edge States

**Edge Case 1: Subtask with Many Micro-Tasks**
- **Behavior:** Show count: "• 15 micro-tasks"
- **Visual:** Modal height adjusts, scrollable if needed

**Edge Case 2: Subtask with No Micro-Tasks/Comments**
- **Behavior:** Omit "This will also delete:" section
- **Visual:** Modal shows only main warning text

**Edge Case 3: Network Error During Delete**
- **Behavior:** Modal stays open, error toast shown
- **Visual:** Delete button re-enabled, loading state removed

**Edge Case 4: Concurrent Delete (Another User)**
- **Behavior:** API returns 404, show error toast, remove from list anyway
- **Visual:** Toast: "Subtask was already deleted"

**Edge Case 5: Delete Last Subtask**
- **Behavior:** Subtask removed, show empty state
- **Visual:** "No subtasks" message appears

### Mobile Variant

#### Visual Layout - Collapsed Subtask
```
┌─────────────────────────────────────┐
│ ☐ Call customer office              │
│    🔴 High  👤 Hassan  📅 Feb 22   │
│    [🗑️] (icon button, always visible)│
└─────────────────────────────────────┘
```

#### Visual Layout - Expanded Subtask
```
┌─────────────────────────────────────┐
│ ☐ Call customer office              │
│    🔴 High  👤 Hassan  📅 Feb 22   │
│                                     │
│ ┌─ Micro-tasks ────────────────────┐ │
│ │ ☑ Check outstanding balance     │ │
│ │ ☐ Prepare payment schedule PDF   │ │
│ └──────────────────────────────────┘ │
│                                     │
│ [Delete Subtask] (full-width button) │
└─────────────────────────────────────┘
```

#### Confirmation Modal (Mobile)
- **Width:** Full screen (`fixed inset-0`)
- **Padding:** `p-4`
- **Buttons:** Stack vertically, full-width
- **Touch Targets:** Minimum 44×44px

**Layout:**
```
┌─────────────────────────────────────┐
│ ⚠️ Delete Subtask?                  │
│                                     │
│ Are you sure you want to delete     │
│ this subtask?                       │
│                                     │
│ "Call customer office"              │
│                                     │
│ This will also delete:              │
│ • 3 micro-tasks                     │
│ • 5 comments                        │
│                                     │
│ This action cannot be undone.       │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │        [Cancel]                 │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │     [Delete Subtask]            │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

#### Interaction Rules
- Same as desktop, with mobile-specific touch targets
- Swipe down on modal backdrop to cancel (optional enhancement)

#### Copy Text
- Same as desktop

#### Edge States
- Same as desktop

---

## 3. Active vs Completed Subtask Sectioning

### Problem Statement
Completed subtasks clutter the interface. Users need clear separation between active and completed work, with completed items collapsed by default.

### Solution
Section subtasks into "Active" and "Completed" groups, with completed section collapsed by default.

### Desktop Variant

#### Visual Layout - Both Sections Expanded
```
┌─────────────────────────────────────────────────────────────┐
│ Subtasks (1/3 completed)                                    │
│ ████░░░░ 33%                                                 │
│                                                             │
│ ┌─ Active (2) ────────────────────────────────────────────┐ │
│ │                                                         │ │
│ │ ☐ Call customer office  🔴 High  👤 Hassan  📅 Feb 22  │ │
│ │    ██░░ 1/3 micro-tasks                                  │ │
│ │                                                         │ │
│ │ ☐ Process partial payment  🔵 Medium  👤 Sarosh       │ │
│ │    ░░░░ 0/3 micro-tasks                                  │ │
│ │                                                         │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Completed (1) ────────────────────────────────────────┐ │
│ │ ▾ Show 1 completed subtask                             │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ [Add subtask]                                                │
└─────────────────────────────────────────────────────────────┘
```

#### Visual Layout - Completed Section Expanded
```
┌─────────────────────────────────────────────────────────────┐
│ ┌─ Completed (1) ────────────────────────────────────────┐ │
│ │ ▾ Show 1 completed subtask                             │ │
│ │                                                         │ │
│ │ ☑ Update broker about status  🟢 Low  👤 Faisal       │ │
│ │    ✓ Completed Feb 25                                  │ │
│ │                                                         │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

#### Section Headers

**Active Section:**
- **Title:** "Active ({count})"
- **Icon:** None (always expanded)
- **Styling:** `text-sm font-semibold text-gray-900`, `mb-3`

**Completed Section:**
- **Title:** "Completed ({count})"
- **Icon:** Chevron (▾ collapsed, ▴ expanded)
- **Styling:** `text-sm font-semibold text-gray-600`, `mb-3`
- **Toggle:** Click header to expand/collapse

#### Interaction Rules

1. **Default State:**
   - Active section: Always expanded
   - Completed section: Collapsed by default
   - Show summary: "▾ Show {count} completed subtask(s)"

2. **Completed Section Toggle:**
   - Click header to expand/collapse
   - Animation: 150ms ease-in-out
   - Chevron rotates 180° on expand

3. **Subtask Status Change:**
   - When subtask marked complete: Move to completed section
   - When completed subtask marked active: Move to active section
   - Smooth transition: 200ms slide animation

4. **Empty States:**
   - **No Active Subtasks:** Show "No active subtasks" message
   - **No Completed Subtasks:** Hide completed section entirely

#### Copy Text

**Section Headers:**
- **Active:** "Active ({count})"
- **Completed (Collapsed):** "Completed ({count})" + "▾ Show {count} completed subtask(s)"
- **Completed (Expanded):** "Completed ({count})" + "▴ Hide completed subtasks"

**Empty States:**
- **No Active:** "No active subtasks"
- **No Completed:** (section hidden)

**Completed Subtask Badge:**
- "✓ Completed {date}" (e.g., "✓ Completed Feb 25")
- Styling: `text-xs text-gray-500`

#### Edge States

**Edge Case 1: All Subtasks Completed**
- **Behavior:** Active section shows "No active subtasks", completed section visible
- **Visual:** Active section empty state, completed section expanded by default (override)

**Edge Case 2: All Subtasks Active**
- **Behavior:** Completed section hidden
- **Visual:** Only active section visible

**Edge Case 3: Rapid Status Changes**
- **Behavior:** Debounce section updates (100ms)
- **Visual:** Subtask moves smoothly between sections

**Edge Case 4: Very Long Completed List**
- **Behavior:** Completed section scrollable when expanded (`max-h-96 overflow-y-auto`)
- **Visual:** Scrollbar appears if > 10 completed subtasks

**Edge Case 5: Subtask Completed While Expanded**
- **Behavior:** Subtask collapses, then moves to completed section
- **Visual:** Smooth animation: collapse → move → expand in completed section

### Mobile Variant

#### Visual Layout - Collapsed Completed
```
┌─────────────────────────────────────┐
│ Subtasks (1/3 completed)            │
│ ████░░░░ 33%                        │
│                                     │
│ Active (2)                          │
│                                     │
│ ☐ Call customer office              │
│    🔴 High  👤 Hassan  📅 Feb 22   │
│    ██░░ 1/3                          │
│                                     │
│ ☐ Process partial payment           │
│    🔵 Medium  👤 Sarosh             │
│    ░░░░ 0/3                         │
│                                     │
│ Completed (1)                       │
│ ▾ Show 1 completed subtask         │
│                                     │
│ [Add subtask]                       │
└─────────────────────────────────────┘
```

#### Visual Layout - Expanded Completed
```
┌─────────────────────────────────────┐
│ Completed (1)                       │
│ ▴ Hide completed subtasks           │
│                                     │
│ ☑ Update broker about status        │
│    🟢 Low  👤 Faisal                │
│    ✓ Completed Feb 25               │
└─────────────────────────────────────┘
```

#### Interaction Rules
- Same as desktop
- Touch target for completed header: Full width, minimum 44px height

#### Copy Text
- Same as desktop

#### Edge States
- Same as desktop

---

## Implementation Notes

### Component Changes Required

1. **MicroTaskList.jsx:**
   - Add scroll position preservation on checkbox toggle
   - Store `scrollY` before state update, restore after

2. **SubtaskCard.jsx:**
   - Add delete button (hover-visible in collapsed, always-visible in expanded)
   - Add confirmation modal component
   - Handle delete API call with loading state

3. **TasksView.jsx (Subtask Section):**
   - Group subtasks by status (active vs completed)
   - Add section headers with toggle for completed
   - Implement smooth transitions when subtask moves between sections

### API Endpoints Required

1. **DELETE /api/tasks/{subtask_id}**
   - **Method:** DELETE
   - **Response:** 204 No Content (success) or 404 (not found)
   - **Cascade:** Deletes micro-tasks and comments (handled by DB CASCADE)

### State Management

1. **Completed Section Expanded State:**
   - Store in component state: `const [completedExpanded, setCompletedExpanded] = useState(false)`
   - Persist to localStorage (optional): `localStorage.setItem('subtasks_completed_expanded', 'true')`

2. **Scroll Position:**
   - Store in closure during optimistic update
   - Restore synchronously after DOM update

### Accessibility

1. **Delete Button:**
   - `aria-label="Delete subtask {title}"`
   - `aria-describedby="delete-warning"` (in modal)

2. **Completed Section Toggle:**
   - `aria-expanded={completedExpanded}`
   - `aria-label="Toggle completed subtasks"`

3. **Keyboard Navigation:**
   - Tab order: Active subtasks → Completed header → Completed subtasks (if expanded)
   - Enter/Space on completed header toggles expansion

---

## Design Tokens

### Colors
- **Delete Button (Hover):** `text-red-600`
- **Delete Button (Default):** `text-gray-400`
- **Modal Warning Icon:** `text-orange-500`
- **Completed Badge:** `text-gray-500`
- **Section Header (Active):** `text-gray-900`
- **Section Header (Completed):** `text-gray-600`

### Spacing
- **Section Header Margin:** `mb-3` (12px)
- **Section Gap:** `space-y-4` (16px between sections)
- **Modal Padding:** `p-6` (24px)
- **Modal Max Width:** `max-w-md` (448px)

### Typography
- **Section Header:** `text-sm font-semibold`
- **Modal Title:** `text-lg font-semibold text-gray-900`
- **Modal Body:** `text-sm text-gray-600`
- **Completed Badge:** `text-xs text-gray-500`

### Animations
- **Scroll Preservation:** Instant (no animation)
- **Section Toggle:** 150ms ease-in-out
- **Subtask Move:** 200ms ease-in-out
- **Line-through Fade:** 150ms ease-in-out

---

*Generated: 2026-02-19 | Agent: Cursor | Branch: wip/Tasks-Subtask*

