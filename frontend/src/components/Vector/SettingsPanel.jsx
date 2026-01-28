import React, { useState } from 'react';

export default function SettingsPanel({ vectorState }) {
  const [showImportInventory, setShowImportInventory] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-2">Vector Settings</h3>
        
        <div className="space-y-2">
          <button
            onClick={() => setShowImportInventory(!showImportInventory)}
            className="w-full px-3 py-2 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 text-left"
          >
            📥 Import Inventory
          </button>
          
          {showImportInventory && (
            <div className="mt-2 p-2 bg-gray-50 rounded border border-gray-200">
              <p className="text-xs text-gray-600 mb-2">
                Import inventory data from Excel file. Go to Inventory tab in sidebar for import options.
              </p>
              <button
                onClick={() => {
                  // Switch to inventory tab - this would need to be handled by parent
                  if (window.switchToInventoryTab) {
                    window.switchToInventoryTab();
                  }
                }}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Go to Inventory Tab →
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

