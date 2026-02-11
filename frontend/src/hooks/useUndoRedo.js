import { useState, useCallback, useRef } from 'react';

export function useUndoRedo(maxHistory = 50) {
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const pushAction = useCallback((action) => {
    // action = { type: string, undo: () => void, redo: () => void, description: string }
    undoStack.current.push(action);
    if (undoStack.current.length > maxHistory) {
      undoStack.current.shift();
    }
    redoStack.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, [maxHistory]);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const action = undoStack.current.pop();
    action.undo();
    redoStack.current.push(action);
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
  }, []);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const action = redoStack.current.pop();
    action.redo();
    undoStack.current.push(action);
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
  }, []);

  const clear = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  return { pushAction, undo, redo, clear, canUndo, canRedo };
}
