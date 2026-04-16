# Vector Add Plot - Sticky Mode Implementation

**Date**: 2026-04-16
**Branch**: feat/EOI-7th-April
**Requested by**: Malik

---

## Changes Made

### 1. MapCanvas.jsx (Line ~641)
**Before:**
```javascript
vectorState.addPlot(newPlot);
vectorState.addChangeLog('Manual plot added', `Added plot: ${plotNum.trim()}`);
// Auto-switch to select to prevent accidental double-add on next click
if (setTool) setTool('select');
```

**After:**
```javascript
vectorState.addPlot(newPlot);
vectorState.addChangeLog('Manual plot added', `Added plot: ${plotNum.trim()}`);
// Keep tool in 'add' mode for sticky behavior - user can add multiple plots
// Tool will reset to 'select' when user clicks another tool button or presses ESC
```

**Change**: Removed `setTool('select')` to keep the tool in 'add' mode after adding a plot.

---

### 2. useKeyboardShortcuts.js (Line ~36)
**Before:**
```javascript
// Escape to deselect
if (e.key === 'Escape') {
  e.preventDefault();
  vectorState.clearSelection();
  return;
}
```

**After:**
```javascript
// Escape to deselect and reset tool to 'select'
if (e.key === 'Escape') {
  e.preventDefault();
  vectorState.clearSelection();
  // Reset tool to 'select' mode (exits add/label/shape/etc modes)
  if (window.setVectorTool) {
    window.setVectorTool('select');
  }
  return;
}
```

**Change**: Added `window.setVectorTool('select')` to reset tool when ESC is pressed.

---

## New Behavior

1. ✅ Click "Add Plot" button once → tool stays active
2. ✅ Can click multiple locations on map to add multiple plots
3. ✅ Each click prompts for plot number, then adds the plot
4. ✅ If user cancels the prompt, tool stays in "Add Plot" mode
5. ✅ Tool exits "Add Plot" mode when:
   - User clicks another tool button (Select, Pan, +Text, +Shape)
   - User presses ESC key
6. ✅ Visual feedback: Button shows `bg-blue-100` when active (unchanged)

---

## Rollback Instructions

If you need to revert these changes:

```bash
# Navigate to project
cd /c/Users/Malik/desktop/radius2-analytics

# Restore from backups
cp .snapshots/vector-add-plot-sticky-mode/MapCanvas.jsx.backup \
   frontend/src/components/Vector/MapCanvas.jsx

cp .snapshots/vector-add-plot-sticky-mode/useKeyboardShortcuts.js.backup \
   frontend/src/hooks/useKeyboardShortcuts.js

# Verify restoration
git diff frontend/src/components/Vector/MapCanvas.jsx
git diff frontend/src/hooks/useKeyboardShortcuts.js
```

---

## Testing Checklist

- [ ] Click "Add Plot" button
- [ ] Click on map → enter plot number → plot is added
- [ ] Click on map again → enter plot number → plot is added (without clicking "Add Plot" again)
- [ ] Click on map → CANCEL prompt → can still click on map to add more plots
- [ ] Press ESC key → tool exits "Add Plot" mode (button no longer highlighted)
- [ ] Click "Add Plot" again → click "Select" button → tool exits "Add Plot" mode
- [ ] Click "Add Plot" → click "Pan" button → tool exits "Add Plot" mode

---

## Files Modified

1. `frontend/src/components/Vector/MapCanvas.jsx`
2. `frontend/src/hooks/useKeyboardShortcuts.js`

## Files Backed Up

1. `.snapshots/vector-add-plot-sticky-mode/MapCanvas.jsx.backup`
2. `.snapshots/vector-add-plot-sticky-mode/useKeyboardShortcuts.js.backup`
3. `.snapshots/vector-add-plot-sticky-mode/VectorMap.jsx.backup` (unchanged, backup only)
