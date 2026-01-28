import React, { useState, useEffect } from 'react';

export default function EraserPanel({ vectorState }) {
  const [eraserMode, setEraserMode] = useState('removePlot'); // 'removePlot' or 'removeAnnotation'
  const [eraserSize, setEraserSize] = useState(20);
  const [requireConfirmation, setRequireConfirmation] = useState(false);

  // Set global eraser mode
  useEffect(() => {
    window.eraserMode = eraserMode;
    return () => {
      window.eraserMode = 'removePlot';
    };
  }, [eraserMode]);

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-semibold">Eraser Settings</h3>
      </div>

      {/* Eraser Mode */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-700">Eraser Mode</label>
        <div className="space-y-1">
          <label className="flex items-center p-2 border border-gray-200 rounded cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="eraserMode"
              value="removePlot"
              checked={eraserMode === 'removePlot'}
              onChange={(e) => setEraserMode(e.target.value)}
              className="mr-2"
            />
            <div className="flex-1">
              <div className="text-xs font-medium">Remove Plot from Annotation</div>
              <div className="text-xs text-gray-500">Removes individual plots from their annotations</div>
            </div>
          </label>
          <label className="flex items-center p-2 border border-gray-200 rounded cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="eraserMode"
              value="removeAnnotation"
              checked={eraserMode === 'removeAnnotation'}
              onChange={(e) => setEraserMode(e.target.value)}
              className="mr-2"
            />
            <div className="flex-1">
              <div className="text-xs font-medium">Remove Entire Annotation</div>
              <div className="text-xs text-gray-500">Removes the entire annotation when clicking on any plot</div>
            </div>
          </label>
        </div>
      </div>

      {/* Eraser Size */}
      <div className="space-y-1 border-t border-gray-200 pt-3">
        <label className="text-xs font-medium text-gray-700">
          Eraser Size: {eraserSize}px
        </label>
        <input
          type="range"
          min="10"
          max="50"
          value={eraserSize}
          onChange={(e) => setEraserSize(parseInt(e.target.value, 10))}
          className="w-full"
        />
      </div>

      {/* Confirmation Toggle */}
      <div className="space-y-1 border-t border-gray-200 pt-3">
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={requireConfirmation}
            onChange={(e) => setRequireConfirmation(e.target.checked)}
            className="mr-2"
          />
          <span className="text-xs text-gray-700">Require confirmation before erasing</span>
        </label>
      </div>

      {/* Instructions */}
      <div className="text-xs text-gray-500 border-t border-gray-200 pt-3">
        <div className="font-medium mb-1">Instructions:</div>
        <ol className="list-decimal list-inside space-y-1">
          <li>Select eraser mode above</li>
          <li>Click or drag on annotated plots to erase</li>
          <li>Use the eraser tool from the toolbar</li>
        </ol>
      </div>

      {/* Current Mode Display */}
      <div className="p-2 bg-yellow-50 rounded border border-yellow-200">
        <div className="text-xs font-medium text-gray-700 mb-1">Current Mode:</div>
        <div className="text-xs text-gray-600">
          {eraserMode === 'removePlot' 
            ? 'Removing plots from annotations'
            : 'Removing entire annotations'}
        </div>
      </div>
    </div>
  );
}

