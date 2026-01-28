import React, { useState, useEffect } from 'react';

export default function BrushPanel({ vectorState }) {
  const [selectedAnnoId, setSelectedAnnoId] = useState(null);
  const [newAnnoNote, setNewAnnoNote] = useState('');
  const [newAnnoColor, setNewAnnoColor] = useState('#6366f1');
  const [brushSize, setBrushSize] = useState(20);

  // Set global brush annotation ID
  useEffect(() => {
    window.currentBrushAnnotationId = selectedAnnoId;
    return () => {
      window.currentBrushAnnotationId = null;
    };
  }, [selectedAnnoId]);

  const handleSelectAnnotation = (annoId) => {
    setSelectedAnnoId(annoId);
    setNewAnnoNote('');
  };

  const handleCreateNewAnnotation = () => {
    if (!newAnnoNote.trim()) {
      alert('Please enter an annotation note');
      return;
    }

    const newAnno = {
      id: Date.now(),
      note: newAnnoNote.trim(),
      cat: '',
      color: newAnnoColor,
      plotIds: [],
      plotNums: [],
      rotation: 0,
      fontSize: 12
    };

    vectorState.addAnnotation(newAnno);
    setSelectedAnnoId(newAnno.id);
    setNewAnnoNote('');
    vectorState.addChangeLog('Annotation created', `Created annotation: ${newAnno.note}`);
  };

  const selectedAnno = vectorState.annos.find(a => a.id === selectedAnnoId);

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-semibold">Brush Settings</h3>
      </div>

      {/* Select Existing Annotation */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-700">Select Annotation to Paint</label>
        <div className="max-h-32 overflow-y-auto border border-gray-200 rounded p-2 space-y-1">
          {vectorState.annos.length === 0 ? (
            <div className="text-xs text-gray-500 text-center py-2">No annotations yet</div>
          ) : (
            vectorState.annos.map(anno => (
              <button
                key={anno.id}
                onClick={() => handleSelectAnnotation(anno.id)}
                className={`w-full text-left p-2 rounded text-xs flex items-center gap-2 ${
                  selectedAnnoId === anno.id
                    ? 'bg-indigo-100 border-2 border-indigo-600'
                    : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: anno.color }}
                />
                <span className="flex-1">{anno.note || anno.cat || 'Untitled'}</span>
                <span className="text-gray-500">({anno.plotIds.length})</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Current Selection */}
      {selectedAnno && (
        <div className="p-2 bg-indigo-50 rounded border border-indigo-200">
          <div className="text-xs font-medium text-gray-700 mb-1">Current Selection:</div>
          <div className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded"
              style={{ backgroundColor: selectedAnno.color }}
            />
            <span className="text-xs font-semibold">{selectedAnno.note || selectedAnno.cat}</span>
            <span className="text-xs text-gray-500">({selectedAnno.plotIds.length} plots)</span>
          </div>
        </div>
      )}

      {/* Create New Annotation */}
      <div className="space-y-2 border-t border-gray-200 pt-3">
        <label className="text-xs font-medium text-gray-700">Or Create New Annotation</label>
        <input
          type="text"
          value={newAnnoNote}
          onChange={(e) => setNewAnnoNote(e.target.value)}
          placeholder="Annotation note"
          className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleCreateNewAnnotation();
            }
          }}
        />
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-700">Color:</label>
          <input
            type="color"
            value={newAnnoColor}
            onChange={(e) => setNewAnnoColor(e.target.value)}
            className="h-6 w-12 border border-gray-300 rounded cursor-pointer"
          />
        </div>
        <button
          onClick={handleCreateNewAnnotation}
          className="w-full px-3 py-2 text-xs bg-green-600 text-white rounded hover:bg-green-700"
        >
          Create & Select
        </button>
      </div>

      {/* Brush Size (for future use) */}
      <div className="space-y-1 border-t border-gray-200 pt-3">
        <label className="text-xs font-medium text-gray-700">
          Brush Size: {brushSize}px
        </label>
        <input
          type="range"
          min="10"
          max="50"
          value={brushSize}
          onChange={(e) => setBrushSize(parseInt(e.target.value, 10))}
          className="w-full"
        />
      </div>

      {/* Instructions */}
      <div className="text-xs text-gray-500 border-t border-gray-200 pt-3">
        <div className="font-medium mb-1">Instructions:</div>
        <ol className="list-decimal list-inside space-y-1">
          <li>Select or create an annotation above</li>
          <li>Click and drag on the map to paint plots</li>
          <li>Plots will be added to the selected annotation</li>
        </ol>
      </div>
    </div>
  );
}

