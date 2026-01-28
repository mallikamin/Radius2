import React, { useState, useEffect } from 'react';

export default function AnnotationEditor({ annotation, vectorState, onClose }) {
  const [selectedPlotIds, setSelectedPlotIds] = useState(new Set(annotation.plotIds || []));
  const [note, setNote] = useState(annotation.note || annotation.cat || '');
  const [color, setColor] = useState(annotation.color || '#6366f1');
  const [fontSize, setFontSize] = useState(annotation.fontSize || 12);
  const [rotation, setRotation] = useState(annotation.rotation || 0);

  // Get all plots
  const allPlots = vectorState.plots || [];
  const annotationPlots = allPlots.filter(p => annotation.plotIds?.includes(p.id));
  const otherPlots = allPlots.filter(p => !annotation.plotIds?.includes(p.id));

  const handleSave = () => {
    vectorState.updateAnnotation(annotation.id, {
      note,
      color,
      fontSize: parseInt(fontSize),
      rotation: parseFloat(rotation) || 0,
      plotIds: Array.from(selectedPlotIds)
    });
    onClose();
  };

  const handleMoveToNew = () => {
    const newNote = prompt('New annotation note:');
    if (!newNote) return;

    const newColor = prompt('Color (hex):', color);
    const newAnno = {
      id: Date.now(),
      note: newNote,
      cat: '',
      color: newColor || color,
      plotIds: Array.from(selectedPlotIds),
      plotNums: [],
      rotation: 0,
      fontSize: parseInt(fontSize)
    };
    vectorState.addAnnotation(newAnno);
    
    // Remove selected plots from current annotation
    vectorState.updateAnnotation(annotation.id, {
      plotIds: annotation.plotIds.filter(id => !selectedPlotIds.has(id))
    });
    
    onClose();
  };

  const togglePlot = (plotId) => {
    setSelectedPlotIds(prev => {
      const next = new Set(prev);
      if (next.has(plotId)) {
        next.delete(plotId);
      } else {
        next.add(plotId);
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96 max-h-[80vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Edit Annotation</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Note:</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Color:</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-full h-10 border border-gray-300 rounded"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Font Size:</label>
            <input
              type="number"
              value={fontSize}
              onChange={(e) => setFontSize(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded"
              min="8"
              max="24"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Rotation (degrees):</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                value={rotation}
                onChange={(e) => setRotation(e.target.value)}
                className="flex-1"
                min="-180"
                max="180"
                step="1"
              />
              <input
                type="number"
                value={rotation}
                onChange={(e) => setRotation(e.target.value)}
                className="w-20 px-2 py-2 border border-gray-300 rounded"
                min="-180"
                max="180"
                step="1"
              />
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Current: {rotation}°
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Plots ({selectedPlotIds.size} selected):
            </label>
            
            <div className="border border-gray-300 rounded p-2 max-h-48 overflow-y-auto">
              <div className="mb-2">
                <strong className="text-xs text-gray-600">Current plots ({annotationPlots.length}):</strong>
                {annotationPlots.map(plot => (
                  <label key={plot.id} className="flex items-center gap-2 p-1 hover:bg-gray-100 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedPlotIds.has(plot.id)}
                      onChange={() => togglePlot(plot.id)}
                    />
                    <span className="text-xs">Plot {plot.n}</span>
                  </label>
                ))}
              </div>
              
              {otherPlots.length > 0 && (
                <div>
                  <strong className="text-xs text-gray-600">Other plots ({otherPlots.length}):</strong>
                  {otherPlots.slice(0, 20).map(plot => (
                    <label key={plot.id} className="flex items-center gap-2 p-1 hover:bg-gray-100 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedPlotIds.has(plot.id)}
                        onChange={() => togglePlot(plot.id)}
                      />
                      <span className="text-xs">Plot {plot.n}</span>
                    </label>
                  ))}
                  {otherPlots.length > 20 && (
                    <div className="text-xs text-gray-500 p-1">
                      +{otherPlots.length - 20} more plots
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800"
          >
            Save
          </button>
          <button
            onClick={handleMoveToNew}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            title="Move selected plots to new annotation"
          >
            Move to New
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

