import React, { useState } from 'react';
import { searchPlot } from '../../utils/plotUtils';

export default function SearchPanel({ vectorState }) {
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [includeManualPlots, setIncludeManualPlots] = useState(true);

  const handleSearch = () => {
    if (!searchInput || !searchInput.trim()) {
      alert('Please enter a plot number to search');
      return;
    }

    const searchTerm = searchInput.trim().toUpperCase();
    const results = [];

    // Search in all plots
    const allPlots = includeManualPlots 
      ? vectorState.plots 
      : vectorState.plots.filter(p => !p.manual);

    allPlots.forEach(plot => {
      const plotNum = String(plot.n || '').toUpperCase();
      if (plotNum.includes(searchTerm) || plotNum === searchTerm) {
        results.push(plot);
      }
    });

    setSearchResults(results);

    if (results.length === 0) {
      alert(`No plots found matching "${searchInput}"`);
    }
  };

  const handleZoomToPlot = (plotId) => {
    if (window.zoomToPlot) {
      window.zoomToPlot(plotId);
      vectorState.selectPlot(plotId, false);
    }
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setSearchResults([]);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-semibold">Search Plot</h3>
      </div>

      {/* Search Input */}
      <div className="space-y-1">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Enter plot number..."
          className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleSearch();
            }
          }}
        />
        <div className="flex gap-2">
          <button
            onClick={handleSearch}
            className="flex-1 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Search
          </button>
          <button
            onClick={handleClearSearch}
            className="px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Include Manual Plots Toggle */}
      <div className="flex items-center">
        <input
          type="checkbox"
          checked={includeManualPlots}
          onChange={(e) => setIncludeManualPlots(e.target.checked)}
          className="mr-2"
        />
        <label className="text-xs text-gray-700">Include manual plots</label>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-700">
            Results ({searchResults.length})
          </div>
          <div className="max-h-64 overflow-y-auto border border-gray-200 rounded p-2 space-y-1">
            {searchResults.map(plot => (
              <div
                key={plot.id}
                className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs hover:bg-gray-100"
              >
                <div className="flex-1">
                  <div className="font-medium">Plot {plot.n}</div>
                  {plot.manual && (
                    <div className="text-gray-500 text-xs">Manual Plot</div>
                  )}
                  {vectorState.inventory[plot.n] && (
                    <div className="text-gray-500 text-xs">
                      {vectorState.inventory[plot.n].marla && `Marla: ${vectorState.inventory[plot.n].marla}`}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleZoomToPlot(plot.id)}
                  className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Zoom
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="text-xs text-gray-500 border-t border-gray-200 pt-3">
        <div className="font-medium mb-1">Instructions:</div>
        <ol className="list-decimal list-inside space-y-1">
          <li>Enter plot number (partial or full)</li>
          <li>Click Search or press Enter</li>
          <li>Click Zoom to navigate to plot</li>
          <li>Toggle to include/exclude manual plots</li>
        </ol>
      </div>
    </div>
  );
}

