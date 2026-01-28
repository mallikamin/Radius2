import React, { useState } from 'react';
import { parsePlotNumbers } from '../../utils/selectionUtils';

export default function SelectionPanel({ vectorState }) {
  const [rangeInput, setRangeInput] = useState('');
  const [listInput, setListInput] = useState('');

  const selectedPlots = vectorState.plots.filter(p => vectorState.selected.has(p.id));
  const selectedPlotNums = selectedPlots.map(p => p.n).sort();

  const handleSelectByRange = () => {
    if (!rangeInput.trim()) {
      alert('Please enter a range (e.g., "1-10")');
      return;
    }
    
    const parts = rangeInput.split('-');
    if (parts.length !== 2) {
      alert('Invalid range format. Use "start-end" (e.g., "1-10")');
      return;
    }
    
    const start = parseInt(parts[0].trim(), 10);
    const end = parseInt(parts[1].trim(), 10);
    
    if (isNaN(start) || isNaN(end) || start > end) {
      alert('Invalid range. Start must be less than or equal to end.');
      return;
    }
    
    vectorState.selectByRange(start, end);
    setRangeInput('');
  };

  const handleSelectByList = () => {
    if (!listInput.trim()) {
      alert('Please enter a list (e.g., "1,2,3" or "1,2,5-10")');
      return;
    }
    
    vectorState.selectByList(listInput);
    setListInput('');
  };

  const handleSelectAll = () => {
    vectorState.selectAll();
  };

  const handleClearSelection = () => {
    vectorState.clearSelection();
  };

  const handleAddToSelection = () => {
    if (!listInput.trim()) {
      alert('Please enter plot numbers to add');
      return;
    }
    
    const plotNums = parsePlotNumbers(listInput);
    const matchingPlots = vectorState.plots.filter(p => plotNums.includes(String(p.n)));
    const plotIds = matchingPlots.map(p => p.id);
    
    if (plotIds.length > 0) {
      vectorState.addToSelection(plotIds);
      setListInput('');
    } else {
      alert('No matching plots found');
    }
  };

  const handleRemoveFromSelection = () => {
    if (!listInput.trim()) {
      alert('Please enter plot numbers to remove');
      return;
    }
    
    const plotNums = parsePlotNumbers(listInput);
    const matchingPlots = vectorState.plots.filter(p => plotNums.includes(String(p.n)));
    const plotIds = matchingPlots.map(p => p.id);
    
    if (plotIds.length > 0) {
      vectorState.removeFromSelection(plotIds);
      setListInput('');
    } else {
      alert('No matching plots found');
    }
  };

  const handleRemoveFromList = (plotId) => {
    vectorState.removeFromSelection([plotId]);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-semibold">
          Selection ({vectorState.selected.size})
        </h3>
      </div>

      {/* Select All */}
      <button
        onClick={handleSelectAll}
        className="w-full px-3 py-2 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Select All
      </button>

      {/* Select by Range */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-700">Select by Range</label>
        <div className="flex gap-1">
          <input
            type="text"
            value={rangeInput}
            onChange={(e) => setRangeInput(e.target.value)}
            placeholder="1-10"
            className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleSelectByRange();
              }
            }}
          />
          <button
            onClick={handleSelectByRange}
            className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Go
          </button>
        </div>
      </div>

      {/* Select by List */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-700">Select by List</label>
        <div className="flex gap-1">
          <input
            type="text"
            value={listInput}
            onChange={(e) => setListInput(e.target.value)}
            placeholder="1,2,3 or 1,2,5-10"
            className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleSelectByList();
              }
            }}
          />
          <button
            onClick={handleSelectByList}
            className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Go
          </button>
        </div>
        <div className="flex gap-1 mt-1">
          <button
            onClick={handleAddToSelection}
            className="flex-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
          >
            Add
          </button>
          <button
            onClick={handleRemoveFromSelection}
            className="flex-1 px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
          >
            Remove
          </button>
        </div>
      </div>

      {/* Clear Selection */}
      <button
        onClick={handleClearSelection}
        className="w-full px-3 py-2 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
      >
        Clear Selection
      </button>

      {/* Selection List */}
      {selectedPlots.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-medium text-gray-700 mb-1">
            Selected Plots ({selectedPlots.length})
          </div>
          <div className="max-h-40 overflow-y-auto border border-gray-200 rounded p-2 space-y-1">
            {selectedPlotNums.map((plotNum, idx) => {
              const plot = selectedPlots.find(p => p.n === plotNum);
              if (!plot) return null;
              return (
                <div
                  key={plot.id}
                  className="flex items-center justify-between p-1 bg-gray-50 rounded text-xs"
                >
                  <span className="font-medium">Plot {plotNum}</span>
                  <button
                    onClick={() => handleRemoveFromList(plot.id)}
                    className="text-red-600 hover:text-red-800"
                    title="Remove from selection"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

