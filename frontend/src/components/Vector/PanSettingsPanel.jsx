import React, { useState, useEffect } from 'react';

export default function PanSettingsPanel() {
  const [sensitivity, setSensitivity] = useState(1.0);
  const [smoothing, setSmoothing] = useState(0.7);

  // Load current values from window
  useEffect(() => {
    if (window.getPanSensitivity) {
      setSensitivity(window.getPanSensitivity());
    }
    if (window.getPanSmoothing) {
      setSmoothing(window.getPanSmoothing());
    }
  }, []);

  const handleSensitivityChange = (value) => {
    const numValue = parseFloat(value);
    setSensitivity(numValue);
    if (window.setPanSensitivity) {
      window.setPanSensitivity(numValue);
    }
  };

  const handleSmoothingChange = (value) => {
    const numValue = parseFloat(value);
    setSmoothing(numValue);
    if (window.setPanSmoothing) {
      window.setPanSmoothing(numValue);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-2">Pan Sensitivity</h3>
        <div className="space-y-2">
          <input
            type="range"
            min="0.01"
            max="0.1"
            step="0.01"
            value={sensitivity}
            onChange={(e) => handleSensitivityChange(e.target.value)}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-600">
            <span>Slow (0.01)</span>
            <span className="font-semibold">{sensitivity.toFixed(2)}</span>
            <span>Fast (0.1)</span>
          </div>
          <p className="text-xs text-gray-500">
            Controls how fast the map moves when panning. Lower values = slower panning.
          </p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Pan Smoothing</h3>
        <div className="space-y-2">
          <input
            type="range"
            min="0.01"
            max="0.1"
            step="0.01"
            value={smoothing}
            onChange={(e) => handleSmoothingChange(e.target.value)}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-600">
            <span>Less (0.01)</span>
            <span className="font-semibold">{smoothing.toFixed(2)}</span>
            <span>More (0.1)</span>
          </div>
          <p className="text-xs text-gray-500">
            Controls smoothing/damping of pan movement. Higher values = smoother, more controlled panning.
          </p>
        </div>
      </div>

      <div className="p-2 bg-blue-50 rounded border border-blue-200">
        <p className="text-xs text-gray-700">
          <strong>Tip:</strong> Lower sensitivity (0.02-0.05) with moderate smoothing (0.03-0.05) provides the most controlled panning experience.
        </p>
      </div>
    </div>
  );
}

