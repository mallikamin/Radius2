// XLSX is loaded dynamically to enable code-splitting (vendor-excel chunk)
// It will be loaded on-demand when Excel import/export functions are called
let _XLSX = null;
async function getXLSX() {
  if (!_XLSX) {
    _XLSX = await import('xlsx');
  }
  return _XLSX;
}

/**
 * Auto-detect column mapping from Excel row
 */
export function detectColumnMapping(firstRow) {
  const columnMap = {};
  
  Object.keys(firstRow || {}).forEach(key => {
    const lowerKey = key.toLowerCase().trim();
    if (lowerKey.includes('plot') || lowerKey.includes('#')) columnMap.plot = key;
    if (lowerKey.includes('marla') || lowerKey.includes('size')) columnMap.marla = key;
    if (lowerKey.includes('dimension')) columnMap.dimensions = key;
    if (lowerKey.includes('owner') || lowerKey.includes('name')) columnMap.owner = key;
    if (lowerKey.includes('value') && !lowerKey.includes('rate')) columnMap.totalValue = key;
    if (lowerKey.includes('rate') || lowerKey.includes('price')) columnMap.ratePerMarla = key;
    if (lowerKey.includes('factor') && lowerKey.includes('note')) columnMap.factorNotes = key;
    else if (lowerKey.includes('corner') || lowerKey.includes('boulevard') || lowerKey.includes('road') || lowerKey.includes('feature')) columnMap.factorNotes = key;
    if (lowerKey.includes('note') || lowerKey.includes('remark') || lowerKey.includes('comment')) columnMap.notes = key;
    if (lowerKey.includes('status') || lowerKey.includes('condition')) columnMap.status = key;
    if (lowerKey.includes('date') || lowerKey.includes('updated')) columnMap.date = key;
  });
  
  return columnMap;
}

/**
 * Import inventory from Excel file
 */
export async function importInventoryFromExcel(file, onProgress) {
  const XLSX = await getXLSX();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        
        if (rows.length === 0) {
          reject(new Error('Excel file is empty'));
          return;
        }
        
        const columnMap = detectColumnMapping(rows[0]);
        const inventory = {};
        let imported = 0;
        let updated = 0;
        
        rows.forEach((r, idx) => {
          const plotNum = String(r[columnMap.plot] || r['Plot#'] || r['Plot'] || r['PlotNo'] || '').trim();
          if (!plotNum) return;
          
          const marla = parseFloat(r[columnMap.marla] || r['Marla'] || 0);
          const totalValue = parseFloat(r[columnMap.totalValue] || r['Total Value'] || r['Value'] || 0);
          const ratePerMarla = parseFloat(r[columnMap.ratePerMarla] || r['Rate'] || r['Price'] || r['Rate per Marla'] || 0);
          
          // Calculate missing values
          let calculatedTotalValue = totalValue;
          let calculatedRate = ratePerMarla;
          
          if (totalValue > 0 && marla > 0 && ratePerMarla === 0) {
            calculatedRate = totalValue / marla;
          } else if (ratePerMarla > 0 && marla > 0 && totalValue === 0) {
            calculatedTotalValue = ratePerMarla * marla;
          }
          
          const existing = inventory[plotNum] || {};
          const isNew = !existing.marla && !existing.totalValue;
          
          inventory[plotNum] = {
            marla: marla || existing.marla || 0,
            totalValue: calculatedTotalValue || existing.totalValue || 0,
            ratePerMarla: calculatedRate || existing.ratePerMarla || 0,
            dimensions: r[columnMap.dimensions] || r['Dimensions'] || existing.dimensions || '',
            owner: r[columnMap.owner] || r['Owner'] || existing.owner || '',
            status: r[columnMap.status] || r['Status'] || existing.status || '',
            factorNotes: r[columnMap.factorNotes] || r['Factor Notes'] || existing.factorNotes || '',
            notes: r[columnMap.notes] || r['Notes'] || existing.notes || '',
            date: r[columnMap.date] || r['Date'] || existing.date || new Date().toISOString()
          };
          
          if (isNew) imported++;
          else updated++;
        });
        
        resolve({ inventory, imported, updated });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Export inventory to Excel
 */
export async function exportInventoryToExcel(inventory, plots, filename = 'inventory') {
  const XLSX = await getXLSX();
  const data = [];

  // Header
  data.push(['Plot#', 'Marla', 'Total Value', 'Rate per Marla', 'Dimensions', 'Owner', 'Status', 'Factor Notes', 'Notes']);

  // Data rows
  Object.keys(inventory).forEach(plotNum => {
    const inv = inventory[plotNum];
    data.push([
      plotNum,
      inv.marla || '',
      inv.totalValue || '',
      inv.ratePerMarla || '',
      inv.dimensions || '',
      inv.owner || '',
      inv.status || '',
      inv.factorNotes || '',
      inv.notes || ''
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

/**
 * Export manual plots to Excel separately
 */
export async function exportManualPlotsToExcel(plots, inventory, filename = 'manual_plots') {
  const XLSX = await getXLSX();
  const manualPlots = plots.filter(p => p.manual);
  const data = [];

  // Header
  data.push(['Plot#', 'X', 'Y', 'Width', 'Height', 'Marla', 'Total Value', 'Rate per Marla', 'Dimensions', 'Owner', 'Status', 'Notes']);

  // Data rows
  manualPlots.forEach(plot => {
    const inv = inventory[plot.n] || {};
    data.push([
      plot.n,
      Math.round(plot.x),
      Math.round(plot.y),
      plot.w || 20,
      plot.h || 14,
      inv.marla || '',
      inv.totalValue || '',
      inv.ratePerMarla || '',
      inv.dimensions || '',
      inv.owner || '',
      inv.status || '',
      inv.notes || ''
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Manual Plots');
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

