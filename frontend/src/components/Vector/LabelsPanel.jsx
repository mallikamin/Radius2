import React, { useState } from 'react';

export default function LabelsPanel({ vectorState }) {
  const [editingLabel, setEditingLabel] = useState(null);
  const [editText, setEditText] = useState('');
  const [editColor, setEditColor] = useState('#000000');
  const [editSize, setEditSize] = useState(12);

  const handleEditLabel = (label) => {
    setEditingLabel(label);
    setEditText(label.text);
    setEditColor(label.color || '#000000');
    setEditSize(label.size || 12);
  };

  const handleSaveEdit = () => {
    if (!editingLabel) return;
    
    const updatedLabels = vectorState.labels.map(l =>
      l.id === editingLabel.id
        ? { ...l, text: editText, color: editColor, size: editSize }
        : l
    );
    vectorState.setLabels(updatedLabels);
    vectorState.addChangeLog('Label edited', `Edited label: ${editText}`);
    setEditingLabel(null);
  };

  const handleDeleteLabel = (labelId) => {
    if (confirm('Delete this label?')) {
      const updatedLabels = vectorState.labels.filter(l => l.id !== labelId);
      vectorState.setLabels(updatedLabels);
      vectorState.addChangeLog('Label deleted', 'Deleted label');
    }
  };

  const handleZoomToLabel = (label) => {
    if (window.fitMap) {
      // Zoom to label position
      const canvas = document.querySelector('canvas');
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const scale = Math.min(rect.width / vectorState.mapW, rect.height / vectorState.mapH) * 2;
        // Center on label
        // This would need more complex logic to center on label
        // For now, just log
        console.log('Zoom to label:', label);
      }
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-semibold">
          Labels ({vectorState.labels.length})
        </h3>
        <div className="text-xs text-gray-500">
          Use +Text tool to add
        </div>
      </div>

      {/* Edit Form */}
      {editingLabel && (
        <div className="p-2 bg-blue-50 rounded border border-blue-200 space-y-2">
          <div className="text-xs font-medium text-gray-700">Edit Label</div>
          <input
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
            placeholder="Label text"
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-700">Color:</label>
            <input
              type="color"
              value={editColor}
              onChange={(e) => setEditColor(e.target.value)}
              className="h-6 w-12 border border-gray-300 rounded cursor-pointer"
            />
            <label className="text-xs text-gray-700">Size:</label>
            <input
              type="number"
              value={editSize}
              onChange={(e) => setEditSize(parseInt(e.target.value, 10) || 12)}
              min="8"
              max="48"
              className="w-16 px-2 py-1 text-xs border border-gray-300 rounded"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSaveEdit}
              className="flex-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
            >
              Save
            </button>
            <button
              onClick={() => setEditingLabel(null)}
              className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Labels List */}
      <div className="max-h-96 overflow-y-auto border border-gray-200 rounded p-2 space-y-1">
        {vectorState.labels.length === 0 ? (
          <div className="text-xs text-gray-500 text-center py-4">
            No labels yet. Use the +Text tool to add labels.
          </div>
        ) : (
          vectorState.labels.map(label => (
            <div
              key={label.id}
              className="p-2 bg-gray-50 rounded text-xs hover:bg-gray-100"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 flex-1">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: label.color || '#000000' }}
                  />
                  <span className="font-medium">{label.text}</span>
                  <span className="text-gray-500">({label.size || 12}px)</span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleEditLabel(label)}
                    className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                    title="Edit"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDeleteLabel(label.id)}
                    className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="text-gray-500 text-xs">
                Position: ({Math.round(label.x)}, {Math.round(label.y)})
              </div>
            </div>
          ))
        )}
      </div>

      {/* Instructions */}
      <div className="text-xs text-gray-500 border-t border-gray-200 pt-3">
        <div className="font-medium mb-1">Instructions:</div>
        <ol className="list-decimal list-inside space-y-1">
          <li>Select +Text tool from toolbar</li>
          <li>Click on map to add label</li>
          <li>Edit or delete labels from this panel</li>
        </ol>
      </div>
    </div>
  );
}

