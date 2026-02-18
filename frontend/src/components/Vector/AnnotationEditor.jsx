import React, { useState, useEffect, useMemo } from 'react';

export default function AnnotationEditor({ annotation, vectorState, onClose }) {
  const [selectedPlotIds, setSelectedPlotIds] = useState(new Set(annotation.plotIds || []));
  const [note, setNote] = useState(annotation.note || annotation.cat || '');
  const [color, setColor] = useState(annotation.color || '#6366f1');
  const [fontSize, setFontSize] = useState(annotation.fontSize || 12);
  const [rotation, setRotation] = useState(annotation.rotation || 0);
  const [plotFilter, setPlotFilter] = useState('');
  const [bulkInput, setBulkInput] = useState('');

  // Get all plots
  const allPlots = vectorState.plots || [];
  const annotationPlots = allPlots.filter(p => selectedPlotIds.has(p.id));
  const otherPlots = allPlots.filter(p => !selectedPlotIds.has(p.id));

  // Filter other plots by search
  const filteredOtherPlots = useMemo(() => {
    if (!plotFilter.trim()) return otherPlots;
    const term = plotFilter.trim().toUpperCase();
    return otherPlots.filter(p => String(p.n || '').toUpperCase().includes(term));
  }, [otherPlots, plotFilter]);

  const handleSave = () => {
    const plotNums = allPlots
      .filter(p => selectedPlotIds.has(p.id))
      .map(p => p.n)
      .filter((v, i, a) => a.indexOf(v) === i);
    vectorState.updateAnnotation(annotation.id, {
      note,
      color,
      fontSize: parseInt(fontSize),
      rotation: parseFloat(rotation) || 0,
      plotIds: Array.from(selectedPlotIds),
      plotNums
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

  // Parse comma-separated plot numbers/ranges and add them
  const handleBulkAdd = () => {
    if (!bulkInput.trim()) return;

    const parts = bulkInput.split(',').map(s => s.trim()).filter(Boolean);
    const plotNumsToAdd = new Set();

    for (const part of parts) {
      if (part.includes('-') && /^\d+-\d+$/.test(part)) {
        // Range like "5-10"
        const [start, end] = part.split('-').map(Number);
        for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
          plotNumsToAdd.add(String(i));
        }
      } else {
        plotNumsToAdd.add(part);
      }
    }

    // Match plot numbers to plot IDs
    const newSelected = new Set(selectedPlotIds);
    let added = 0;
    allPlots.forEach(p => {
      const pn = String(p.n || '').trim();
      if (plotNumsToAdd.has(pn) && !newSelected.has(p.id)) {
        newSelected.add(p.id);
        added++;
      }
    });

    setSelectedPlotIds(newSelected);
    setBulkInput('');
    if (added === 0) {
      alert('No matching plots found. Check plot numbers.');
    }
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
            <label className="block text-sm font-medium mb-1">Rotation:</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRotation(prev => (((parseInt(prev) || 0) - 15) % 360 + 360) % 360)}
                className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm font-medium"
                title="Rotate -15 degrees"
              >
                ↶ -15
              </button>
              <span className="text-sm font-mono min-w-[50px] text-center font-semibold">{rotation}°</span>
              <button
                type="button"
                onClick={() => setRotation(prev => (((parseInt(prev) || 0) + 15) % 360 + 360) % 360)}
                className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm font-medium"
                title="Rotate +15 degrees"
              >
                ↷ +15
              </button>
              <button
                type="button"
                onClick={() => setRotation(0)}
                className="px-3 py-2 bg-yellow-100 rounded hover:bg-yellow-200 text-sm font-medium"
                title="Reset rotation"
              >
                ⟲
              </button>
            </div>
          </div>

          {/* Bulk add plots */}
          <div>
            <label className="block text-sm font-medium mb-1">Add plots by number:</label>
            <div className="flex gap-1">
              <input
                type="text"
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                placeholder="e.g. 1,2,3,5-10"
                className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
                onKeyDown={(e) => { if (e.key === 'Enter') handleBulkAdd(); }}
              />
              <button
                onClick={handleBulkAdd}
                className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
              >
                Add
              </button>
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">Comma-separated numbers or ranges</div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Plots ({selectedPlotIds.size} selected):
            </label>

            <div className="border border-gray-300 rounded p-2">
              {/* Current plots in annotation */}
              <div className="mb-2">
                <strong className="text-xs text-gray-600">Current plots ({annotationPlots.length}):</strong>
                <div className="max-h-32 overflow-y-auto">
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
              </div>

              {/* Other plots with search filter */}
              {otherPlots.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <strong className="text-xs text-gray-600">Other plots ({otherPlots.length}):</strong>
                    <input
                      type="text"
                      value={plotFilter}
                      onChange={(e) => setPlotFilter(e.target.value)}
                      placeholder="Filter..."
                      className="flex-1 px-1 py-0.5 text-xs border border-gray-200 rounded"
                    />
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    {filteredOtherPlots.map(plot => (
                      <label key={plot.id} className="flex items-center gap-2 p-1 hover:bg-gray-100 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedPlotIds.has(plot.id)}
                          onChange={() => togglePlot(plot.id)}
                        />
                        <span className="text-xs">Plot {plot.n}</span>
                      </label>
                    ))}
                    {filteredOtherPlots.length === 0 && plotFilter && (
                      <div className="text-xs text-gray-400 p-1">No matches for "{plotFilter}"</div>
                    )}
                  </div>
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
