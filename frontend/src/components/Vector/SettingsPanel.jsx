import React, { useState } from 'react';

export default function SettingsPanel({ vectorState }) {
  const [showImportInventory, setShowImportInventory] = useState(false);

  const gps = vectorState.projectMetadata?.gpsCoordinates || {};

  const updateGPS = (field, value) => {
    vectorState.setProjectMetadata(prev => ({
      ...prev,
      gpsCoordinates: {
        ...(prev.gpsCoordinates || {}),
        [field]: value
      }
    }));
    vectorState.setHasUnsavedChanges(true);
  };

  return (
    <div className="space-y-4">
      {/* Project Info */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Project Info</h3>
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Name</span>
            <span className="font-medium">{vectorState.projectName || 'No Project'}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Plots</span>
            <span className="font-medium">{vectorState.plots?.length || 0}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Annotations</span>
            <span className="font-medium">{vectorState.annos?.length || 0}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Inventory</span>
            <span className="font-medium">{Object.keys(vectorState.inventory || {}).length}</span>
          </div>
        </div>
      </div>

      {/* GPS / Navigation */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Project Location (GPS)</h3>
        <p className="text-[10px] text-gray-500 mb-2">
          Set GPS coordinates to enable "Navigate" in plot details. Get coordinates from Google Maps.
        </p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-8">Lat</label>
            <input
              type="text"
              placeholder="e.g. 31.4505"
              value={gps.lat || ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^-?\d*\.?\d*$/.test(val)) updateGPS('lat', val);
              }}
              className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-8">Lng</label>
            <input
              type="text"
              placeholder="e.g. 74.3507"
              value={gps.lng || ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || /^-?\d*\.?\d*$/.test(val)) updateGPS('lng', val);
              }}
              className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-8">Label</label>
            <input
              type="text"
              placeholder="e.g. Sitara Square"
              value={gps.label || ''}
              onChange={(e) => updateGPS('label', e.target.value)}
              className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
            />
          </div>
          {gps.lat && gps.lng && !isNaN(parseFloat(gps.lat)) && !isNaN(parseFloat(gps.lng)) && (
            <button
              onClick={() => {
                const url = `https://www.google.com/maps?q=${gps.lat},${gps.lng}`;
                window.open(url, '_blank');
              }}
              className="w-full px-2 py-1.5 text-xs bg-teal-600 text-white rounded hover:bg-teal-700"
            >
              Preview on Google Maps
            </button>
          )}
        </div>
      </div>

      {/* Import Inventory */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Data</h3>
        <div className="space-y-2">
          <button
            onClick={() => setShowImportInventory(!showImportInventory)}
            className="w-full px-3 py-2 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 text-left"
          >
            Import Inventory
          </button>

          {showImportInventory && (
            <div className="mt-2 p-2 bg-gray-50 rounded border border-gray-200">
              <p className="text-xs text-gray-600 mb-2">
                Import inventory data from Excel file. Go to Inventory tab in sidebar for import options.
              </p>
              <button
                onClick={() => {
                  if (window.switchToInventoryTab) {
                    window.switchToInventoryTab();
                  }
                }}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Go to Inventory Tab
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="p-2 bg-gray-50 rounded border border-gray-200">
        <p className="text-xs text-gray-600">
          <strong>Note:</strong> Additional settings are available in their respective sidebar tabs:
        </p>
        <ul className="text-xs text-gray-600 mt-2 space-y-1 list-disc list-inside">
          <li>Pan Settings - Control pan sensitivity and smoothing</li>
          <li>Brush Settings - Configure annotation painting</li>
          <li>Eraser Settings - Configure eraser behavior</li>
        </ul>
      </div>
    </div>
  );
}

