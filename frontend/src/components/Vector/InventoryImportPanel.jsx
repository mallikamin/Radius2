import React, { useState, useRef } from 'react';
import { importInventoryFromExcel } from '../../utils/inventoryUtils';

export default function InventoryImportPanel({ vectorState }) {
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      alert('Please select an Excel file (.xlsx or .xls)');
      return;
    }

    setImporting(true);
    setImportResult(null);

    try {
      const result = await importInventoryFromExcel(file, (progress) => {
        console.log('Import progress:', progress);
      });

      // Merge imported inventory with existing
      const updatedInventory = { ...vectorState.inventory };
      Object.keys(result.inventory).forEach(plotNum => {
        updatedInventory[plotNum] = {
          ...updatedInventory[plotNum],
          ...result.inventory[plotNum]
        };
      });

      vectorState.setInventory(updatedInventory);
      vectorState.addChangeLog('Inventory imported', `Imported ${result.imported} new, updated ${result.updated} existing plots`);
      
      setImportResult({
        success: true,
        imported: result.imported,
        updated: result.updated,
        total: Object.keys(result.inventory).length
      });
    } catch (error) {
      console.error('Import error:', error);
      setImportResult({
        success: false,
        error: error.message || 'Failed to import inventory'
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-2">Import Inventory from Excel</h3>
        <p className="text-xs text-gray-600 mb-3">
          Import plot inventory data from an Excel file. The system will auto-detect columns for:
          Plot#, Marla, Total Value, Rate per Marla, Dimensions, Owner, Status, Notes, etc.
        </p>
        
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleImport}
          className="hidden"
          id="inventory-import-input"
        />
        
        <label
          htmlFor="inventory-import-input"
          className={`block w-full px-4 py-2 text-xs text-center rounded cursor-pointer ${
            importing
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {importing ? 'Importing...' : '📥 Choose Excel File'}
        </label>
      </div>

      {importResult && (
        <div className={`p-3 rounded text-xs ${
          importResult.success
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {importResult.success ? (
            <div>
              <div className="font-semibold mb-1">✅ Import Successful</div>
              <div>• Imported: {importResult.imported} new plots</div>
              <div>• Updated: {importResult.updated} existing plots</div>
              <div>• Total: {importResult.total} plots processed</div>
            </div>
          ) : (
            <div>
              <div className="font-semibold mb-1">❌ Import Failed</div>
              <div>{importResult.error}</div>
            </div>
          )}
        </div>
      )}

      <div className="p-2 bg-blue-50 rounded border border-blue-200">
        <p className="text-xs text-gray-700 font-semibold mb-1">Excel Format:</p>
        <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
          <li>First row should contain column headers</li>
          <li>Required: Plot# column</li>
          <li>Optional: Marla, Total Value, Rate per Marla, Dimensions, Owner, Status, Notes</li>
          <li>System will auto-detect column names</li>
        </ul>
      </div>
    </div>
  );
}

