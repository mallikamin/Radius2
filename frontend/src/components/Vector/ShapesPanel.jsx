import React, { useState, useEffect } from 'react';

export default function ShapesPanel({ vectorState }) {
  const [shapeType, setShapeType] = useState('rectangle');
  const [shapeColor, setShapeColor] = useState('#6366f1');
  const [shapeSize, setShapeSize] = useState(50);
  const [editingShape, setEditingShape] = useState(null);

  // Set global shape settings
  useEffect(() => {
    window.currentShapeType = shapeType;
    window.currentShapeColor = shapeColor;
    return () => {
      window.currentShapeType = 'rectangle';
      window.currentShapeColor = '#6366f1';
    };
  }, [shapeType, shapeColor]);

  const handleEditShape = (shape) => {
    setEditingShape(shape);
    setShapeType(shape.type);
    setShapeColor(shape.color || '#6366f1');
    setShapeSize(shape.width || 50);
  };

  const handleSaveEdit = () => {
    if (!editingShape) return;
    
    const updatedShapes = vectorState.shapes.map(s =>
      s.id === editingShape.id
        ? { ...s, type: shapeType, color: shapeColor, width: shapeSize, height: shapeSize }
        : s
    );
    vectorState.setShapes(updatedShapes);
    vectorState.addChangeLog('Shape edited', `Edited ${shapeType} shape`);
    setEditingShape(null);
  };

  const handleDeleteShape = (shapeId) => {
    if (confirm('Delete this shape?')) {
      const updatedShapes = vectorState.shapes.filter(s => s.id !== shapeId);
      vectorState.setShapes(updatedShapes);
      vectorState.addChangeLog('Shape deleted', 'Deleted shape');
    }
  };

  const shapeTypes = [
    { id: 'rectangle', label: 'Rectangle', icon: '▭' },
    { id: 'circle', label: 'Circle', icon: '○' },
    { id: 'triangle', label: 'Triangle', icon: '△' },
    { id: 'cross', label: 'Cross', icon: '✚' },
    { id: 'star', label: 'Star', icon: '★' }
  ];

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-semibold">
          Shapes ({vectorState.shapes.length})
        </h3>
        <div className="text-xs text-gray-500">
          Use +Shape tool to add
        </div>
      </div>

      {/* Shape Type Selection */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-700">Shape Type</label>
        <div className="grid grid-cols-3 gap-1">
          {shapeTypes.map(type => (
            <button
              key={type.id}
              onClick={() => setShapeType(type.id)}
              className={`p-2 text-xs rounded border ${
                shapeType === type.id
                  ? 'bg-indigo-100 border-indigo-600'
                  : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
              }`}
              title={type.label}
            >
              {type.icon}
            </button>
          ))}
        </div>
      </div>

      {/* Shape Color */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-700">Color</label>
        <input
          type="color"
          value={shapeColor}
          onChange={(e) => setShapeColor(e.target.value)}
          className="h-8 w-full border border-gray-300 rounded cursor-pointer"
        />
      </div>

      {/* Shape Size */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-700">
          Size: {shapeSize}px
        </label>
        <input
          type="range"
          min="20"
          max="200"
          value={shapeSize}
          onChange={(e) => setShapeSize(parseInt(e.target.value, 10))}
          className="w-full"
        />
      </div>

      {/* Edit Form */}
      {editingShape && (
        <div className="p-2 bg-blue-50 rounded border border-blue-200 space-y-2">
          <div className="text-xs font-medium text-gray-700">Edit Shape</div>
          <div className="flex gap-2">
            <button
              onClick={handleSaveEdit}
              className="flex-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
            >
              Save
            </button>
            <button
              onClick={() => setEditingShape(null)}
              className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Shapes List */}
      <div className="max-h-96 overflow-y-auto border border-gray-200 rounded p-2 space-y-1">
        {vectorState.shapes.length === 0 ? (
          <div className="text-xs text-gray-500 text-center py-4">
            No shapes yet. Use the +Shape tool to add shapes.
          </div>
        ) : (
          vectorState.shapes.map(shape => {
            const typeInfo = shapeTypes.find(t => t.id === shape.type) || shapeTypes[0];
            return (
              <div
                key={shape.id}
                className="p-2 bg-gray-50 rounded text-xs hover:bg-gray-100"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 flex-1">
                    <span>{typeInfo.icon}</span>
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: shape.color || '#6366f1' }}
                    />
                    <span className="font-medium">{typeInfo.label}</span>
                    <span className="text-gray-500">({shape.width || 50}px)</span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleEditShape(shape)}
                      className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDeleteShape(shape.id)}
                      className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                      title="Delete"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div className="text-gray-500 text-xs">
                  Position: ({Math.round(shape.x)}, {Math.round(shape.y)})
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Instructions */}
      <div className="text-xs text-gray-500 border-t border-gray-200 pt-3">
        <div className="font-medium mb-1">Instructions:</div>
        <ol className="list-decimal list-inside space-y-1">
          <li>Select shape type, color, and size above</li>
          <li>Select +Shape tool from toolbar</li>
          <li>Click on map to add shape</li>
          <li>Edit or delete shapes from this panel</li>
        </ol>
      </div>
    </div>
  );
}

