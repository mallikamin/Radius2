import * as XLSX from 'xlsx';

/**
 * Auto-detect column mapping from Excel row.
 * Uses strict precedence: longer/more-specific patterns are checked first.
 * Returns { columnMap, diagnostics } where diagnostics shows which header mapped to which field.
 */
export function detectColumnMapping(firstRow) {
  const columnMap = {};
  const diagnostics = {}; // field → { header, reason }
  const claimed = new Set(); // headers already assigned

  const headers = Object.keys(firstRow || {});

  // Helper: claim a header for a field (skip if header already claimed or field already mapped)
  const claim = (field, headerKey, reason) => {
    if (columnMap[field] || claimed.has(headerKey)) return false;
    columnMap[field] = headerKey;
    claimed.add(headerKey);
    diagnostics[field] = { header: headerKey, reason };
    return true;
  };

  // Pass 1: Exact / highly-specific patterns (longest match first to avoid collisions)
  // Order matters — "rate per marla" must be checked BEFORE "marla" alone
  headers.forEach(key => {
    const lk = key.toLowerCase().trim();

    // ratePerMarla — must precede marla check. "Rate per Marla", "rate/marla", "price per marla"
    if (lk.includes('rate per') || lk.includes('rate/') || lk.includes('price per')) {
      claim('ratePerMarla', key, 'exact: rate per / price per');
      return; // don't let this header match anything else
    }

    // totalValue — "total value", "value" but NOT "rate"
    if ((lk.includes('total') && lk.includes('value')) || (lk === 'value')) {
      claim('totalValue', key, 'exact: total value');
      return;
    }

    // factorNotes — "factor note(s)"
    if (lk.includes('factor') && lk.includes('note')) {
      claim('factorNotes', key, 'exact: factor note');
      return;
    }
  });

  // Pass 2: Broader patterns (only for fields not yet claimed)
  headers.forEach(key => {
    if (claimed.has(key)) return;
    const lk = key.toLowerCase().trim();

    if (!columnMap.plot && (lk.includes('plot') || lk === '#' || lk === 'sr' || lk === 'sr#' || lk === 'sr.')) {
      claim('plot', key, 'broad: plot/#');
    }

    // marla/size — but NOT if this header also contains "rate" or "per" (those are ratePerMarla)
    if (!columnMap.marla && (lk.includes('marla') || lk.includes('size')) && !lk.includes('rate') && !lk.includes('per') && !lk.includes('price')) {
      claim('marla', key, 'broad: marla/size (excludes rate/per/price)');
    }

    if (!columnMap.dimensions && lk.includes('dimension')) {
      claim('dimensions', key, 'broad: dimension');
    }

    if (!columnMap.owner && (lk.includes('owner') || lk === 'name')) {
      claim('owner', key, 'broad: owner/name');
    }

    if (!columnMap.totalValue && lk.includes('value') && !lk.includes('rate')) {
      claim('totalValue', key, 'broad: value (not rate)');
    }

    if (!columnMap.ratePerMarla && (lk.includes('rate') || lk.includes('price'))) {
      claim('ratePerMarla', key, 'broad: rate/price');
    }

    if (!columnMap.factorNotes && (lk.includes('corner') || lk.includes('boulevard') || lk.includes('road') || lk.includes('feature'))) {
      claim('factorNotes', key, 'broad: corner/boulevard/road/feature');
    }

    if (!columnMap.notes && (lk.includes('note') || lk.includes('remark') || lk.includes('comment')) && !lk.includes('factor')) {
      claim('notes', key, 'broad: note/remark/comment (not factor)');
    }

    if (!columnMap.status && (lk.includes('status') || lk.includes('condition'))) {
      claim('status', key, 'broad: status/condition');
    }

    if (!columnMap.date && (lk.includes('date') || lk.includes('updated'))) {
      claim('date', key, 'broad: date/updated');
    }
  });

  // Conflict check: warn if marla and ratePerMarla mapped to the same header
  if (columnMap.marla && columnMap.ratePerMarla && columnMap.marla === columnMap.ratePerMarla) {
    console.error('[inventoryUtils] CONFLICT: marla and ratePerMarla mapped to same header:', columnMap.marla);
    // Prefer ratePerMarla (more specific), clear marla
    delete columnMap.marla;
    delete diagnostics.marla;
  }

  return { columnMap, diagnostics };
}

/**
 * Parse a numeric value from a cell: strips commas, currency symbols (PKR, Rs, $, etc.),
 * and trailing text suffixes (e.g., "/marla", "per marla").
 */
function parseNumeric(raw) {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
  const cleaned = String(raw)
    .replace(/,/g, '')                    // strip commas: 1,500,000 → 1500000
    .replace(/PKR|Rs\.?|USD|\$|£|€/gi, '') // strip currency symbols
    .replace(/\s*(per|\/)\s*marla/gi, '')  // strip "/marla", "per marla"
    .replace(/\s*marla$/gi, '')            // strip trailing "marla"
    .trim();
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

/**
 * Import inventory from Excel file.
 * Returns { inventory, imported, updated, columnDiagnostics }
 */
export function importInventoryFromExcel(file, onProgress) {
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

        const { columnMap, diagnostics: columnDiagnostics } = detectColumnMapping(rows[0]);
        console.log('[inventoryUtils] Column mapping:', columnMap);
        console.log('[inventoryUtils] Diagnostics:', columnDiagnostics);

        const inventory = {};
        let imported = 0;
        let updated = 0;

        rows.forEach((r, idx) => {
          const plotNum = String(r[columnMap.plot] || r['Plot#'] || r['Plot'] || r['PlotNo'] || '').trim();
          if (!plotNum) return;

          const marla = parseNumeric(r[columnMap.marla] || r['Marla']);
          const totalValue = parseNumeric(r[columnMap.totalValue] || r['Total Value'] || r['Value']);
          const ratePerMarla = parseNumeric(r[columnMap.ratePerMarla] || r['Rate'] || r['Price'] || r['Rate per Marla']);

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

        resolve({ inventory, imported, updated, columnDiagnostics });
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
export function exportInventoryToExcel(inventory, plots, filename = 'inventory', annos = []) {
  const data = [];

  const plotToAnnotation = {};
  (annos || []).forEach(a => {
    const label = (a.note || a.cat || '').trim();
    if (!label) return;
    (a.plotNums || []).forEach(pn => {
      plotToAnnotation[String(pn)] = label;
    });
  });

  // Header
  data.push(['Plot#', 'Marla', 'Total Value', 'Rate per Marla', 'Dimensions', 'Owner', 'Annotation', 'Status', 'Factor Notes', 'Notes']);

  // Data rows
  Object.keys(inventory).forEach(plotNum => {
    const inv = inventory[plotNum];
    data.push([
      plotNum,
      inv.marla || '',
      inv.totalValue || '',
      inv.ratePerMarla || '',
      inv.dimensions || '',
      (typeof inv.owner === 'object' ? inv.owner.name || '' : inv.owner) || '',
      plotToAnnotation[String(plotNum)] || '',
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
export function exportManualPlotsToExcel(plots, inventory, filename = 'manual_plots', annos = []) {
  const manualPlots = plots.filter(p => p.manual);
  const data = [];

  // Header - added Annotation and Rotation columns
  data.push(['Plot#', 'X', 'Y', 'Width', 'Height', 'Marla', 'Total Value', 'Rate per Marla', 'Dimensions', 'Owner', 'Status', 'Annotation', 'Rotation', 'Notes']);

  // Data rows
  manualPlots.forEach(plot => {
    const inv = inventory[plot.n] || {};

    // Find matching annotation (type-flexible ID comparison)
    const anno = annos.find(a =>
      a.plotIds && Array.isArray(a.plotIds) &&
      a.plotIds.some(apid => String(apid) === String(plot.id))
    );
    const annotationText = anno ? (anno.note || anno.cat || '') : '';
    const rotation = anno ? (anno.rotation || 0) : '';

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
      (typeof inv.owner === 'object' ? inv.owner.name || '' : inv.owner) || '',
      inv.status || '',
      annotationText,
      rotation,
      inv.notes || ''
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Manual Plots');
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

