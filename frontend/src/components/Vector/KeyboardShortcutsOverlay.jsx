import React, { useState, useEffect } from 'react';

export default function KeyboardShortcutsOverlay() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        setVisible(v => !v);
      }
      if (e.key === 'Escape' && visible) {
        setVisible(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [visible]);

  // Also expose globally
  useEffect(() => {
    window.showKeyboardShortcuts = () => setVisible(true);
    return () => { window.showKeyboardShortcuts = null; };
  }, []);

  if (!visible) return null;

  const shortcuts = [
    { keys: 'Ctrl+S', action: 'Save project' },
    { keys: 'Ctrl+A', action: 'Select all plots' },
    { keys: 'Ctrl+Z', action: 'Undo' },
    { keys: 'Ctrl+Y', action: 'Redo' },
    { keys: 'Ctrl+F', action: 'Search plot by number' },
    { keys: 'Escape', action: 'Clear selection' },
    { keys: 'Arrow keys', action: 'Move selected (1px)' },
    { keys: 'Shift+Arrows', action: 'Move selected (10px)' },
    { keys: 'Delete/Backspace', action: 'Delete selected plots' },
    { keys: '?', action: 'Toggle this help' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setVisible(false)}>
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Keyboard Shortcuts</h3>
          <button onClick={() => setVisible(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <div className="space-y-2">
          {shortcuts.map((s, i) => (
            <div key={i} className="flex justify-between items-center py-1.5 border-b border-gray-100 last:border-0">
              <span className="text-sm text-gray-600">{s.action}</span>
              <kbd className="px-2 py-1 text-xs font-mono bg-gray-100 border border-gray-300 rounded text-gray-700">{s.keys}</kbd>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-4 text-center">Press ? or Escape to close</p>
      </div>
    </div>
  );
}
