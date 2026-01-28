import React, { useState } from 'react';
import { massRenamePlotsPreview } from '../../utils/plotUtils';

export default function MassRenamePanel({ vectorState }) {
  const [findPattern, setFindPattern] = useState('');
  const [replacePattern, setReplacePattern] = useState('');
  const [useRegex, setUseRegex] = useState(false);
  const [previewMatches, setPreviewMatches] = useState([]);

  const handlePreview = () => {
    if (!findPattern || !findPattern.trim()) {
      alert('Please enter a find pattern');
      return;
    }

    try {
      const matches = massRenamePlotsPreview(
        vectorState.plots,
        vectorState.inventory,
        vectorState.annos,
        findPattern,
        replacePattern,
        useRegex
      );
      setPreviewMatches(matches);
    } catch (err) {
      alert('Error generating preview: ' + err.message);
      setPreviewMatches([]);
    }
  };

  const handleApply = () => {
    if (previewMatches.length === 0) {
      alert('Please generate a preview first');
      return;
    }

    if (!confirm(`Apply rename to ${previewMatches.length} plot(s)?`)) {
      return;
    }

    vectorState.massRenamePlots(previewMatches);
    setPreviewMatches([]);
    setFindPattern('');
    setReplacePattern('');
  };

  const handleClear = () => {
    setPreviewMatches([]);
    setFindPattern('');
    setReplacePattern('');
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-semibold">Mass Rename Plots</h3>
      </div>

      {/* Find Pattern */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-700">Find Pattern</label>
        <input
          type="text"
          value={findPattern}
          onChange={(e) => setFindPattern(e.target.value)}
          placeholder="e.g., 1I or (regex) ^1I"
          className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handlePreview();
            }
          }}
        />
      </div>

      {/* Replace Pattern */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-700">Replace With</label>
        <input
          type="text"
          value={replacePattern}
          onChange={(e) => setReplacePattern(e.target.value)}
          placeholder="e.g., Ib"
          className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handlePreview();
            }
          }}
        />
      </div>

      {/* Regex Toggle */}
      <div className="flex items-center">
        <input
          type="checkbox"
          checked={useRegex}
          onChange={(e) => setUseRegex(e.target.checked)}
          className="mr-2"
        />
        <label className="text-xs text-gray-700">Use Regular Expression</label>
      </div>

      {/* Preview Button */}
      <button
        onClick={handlePreview}
        className="w-full px-3 py-2 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Preview Rename
      </button>

      {/* Preview Results */}
      {previewMatches.length > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <div className="text-xs font-medium text-gray-700">
              Preview ({previewMatches.length} matches)
            </div>
            <button
              onClick={handleClear}
              className="text-xs text-red-600 hover:text-red-800"
            >
              Clear
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded p-2 space-y-1">
            {previewMatches.map((match, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-1 bg-gray-50 rounded text-xs"
              >
                <span className="font-medium">{match.oldName}</span>
                <span className="text-gray-500">→</span>
                <span className="font-medium text-green-600">{match.newName}</span>
              </div>
            ))}
          </div>
          <button
            onClick={handleApply}
            className="w-full px-3 py-2 text-xs bg-green-600 text-white rounded hover:bg-green-700"
          >
            Apply Rename ({previewMatches.length} plots)
          </button>
        </div>
      )}

      {/* Instructions */}
      <div className="text-xs text-gray-500 border-t border-gray-200 pt-3">
        <div className="font-medium mb-1">Instructions:</div>
        <ol className="list-decimal list-inside space-y-1">
          <li>Enter find pattern (e.g., "1I" or regex pattern)</li>
          <li>Enter replacement pattern (e.g., "Ib")</li>
          <li>Toggle regex if using regular expressions</li>
          <li>Click Preview to see changes</li>
          <li>Click Apply to rename plots</li>
        </ol>
        <div className="mt-2 font-medium">Examples:</div>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Find: "1I", Replace: "Ib" → Renames "1I" to "Ib"</li>
          <li>Find: "^1", Replace: "A1" (regex) → Renames plots starting with "1"</li>
        </ul>
      </div>
    </div>
  );
}

