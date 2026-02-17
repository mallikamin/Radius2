import { jsPDF } from 'jspdf';

// Format currency helper
export function formatCurrency(amount) {
  if (!amount) return 'PKR 0';
  return 'PKR ' + parseFloat(amount).toLocaleString('en-PK', { maximumFractionDigits: 0 });
}

// Export plot details to PDF
export function exportPlotDetailsToPDF(plotsToExport, vectorState) {
  const doc = new jsPDF();
  
  if (plotsToExport.length === 0) {
    alert('No plots to export');
    return;
  }
  
  const isSingle = plotsToExport.length === 1;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - (margin * 2);
  let yPos = margin;
  
  // Header
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text(vectorState.projectName || 'Vector Project', margin, yPos);
  yPos += 8;
  
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, yPos);
  yPos += 10;
  
  if (isSingle) {
    // Single plot detailed view
    const p = plotsToExport[0];
    const inv = vectorState.inventory[p.n] || {};
    const anno = vectorState.annos.find(a => a.plotIds.includes(p.id));
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text(`Plot ${p.n}`, margin, yPos);
    yPos += 12;
    
    // Annotation info
    if (anno) {
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('Annotation:', margin, yPos);
      yPos += 6;
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text(`${anno.note} (${anno.plotIds.length} plots)`, margin + 5, yPos);
      yPos += 8;
    }
    
    // Inventory details
    if (inv.marla || inv.totalValue || inv.owner) {
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('Inventory Details:', margin, yPos);
      yPos += 8;
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      
      if (inv.marla) {
        doc.text(`Marla: ${inv.marla}`, margin + 5, yPos);
        yPos += 6;
      }
      if (inv.totalValue) {
        doc.text(`Total Value: ${formatCurrency(inv.totalValue)}`, margin + 5, yPos);
        yPos += 6;
      }
      if (inv.ratePerMarla) {
        doc.text(`Rate per Marla: ${formatCurrency(inv.ratePerMarla)}`, margin + 5, yPos);
        yPos += 6;
      }
      if (inv.dimensions) {
        doc.text(`Dimensions: ${inv.dimensions}`, margin + 5, yPos);
        yPos += 6;
      }
      if (inv.owner) {
        doc.text(`Owner: ${typeof inv.owner === 'object' ? inv.owner.name || '' : inv.owner}`, margin + 5, yPos);
        yPos += 6;
      }
      if (inv.status) {
        doc.text(`Status: ${inv.status}`, margin + 5, yPos);
        yPos += 6;
      }
      if (inv.notes) {
        doc.text(`Notes: ${inv.notes}`, margin + 5, yPos);
        yPos += 6;
      }
    }
  } else {
    // Multiple plots - detailed view with all information
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text(`${plotsToExport.length} Plots - Detailed Report`, margin, yPos);
    yPos += 10;
    
    plotsToExport.forEach((p, idx) => {
      if (yPos > pageHeight - 50) {
        doc.addPage();
        yPos = margin;
      }
      
      const inv = vectorState.inventory[p.n] || {};
      const anno = vectorState.annos.find(a => a.plotIds.includes(p.id));
      
      // Plot header
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(`Plot ${p.n}`, margin, yPos);
      yPos += 8;
      
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      
      // Annotation
      if (anno) {
        doc.setTextColor(50, 50, 50);
        doc.text('Annotation:', margin + 5, yPos);
        doc.setTextColor(0, 0, 0);
        doc.text(`${anno.note} (${anno.plotIds.length} plots)`, margin + 35, yPos);
        yPos += 6;
      }
      
      // Area (Marla)
      if (inv.marla) {
        doc.setTextColor(50, 50, 50);
        doc.text('Area:', margin + 5, yPos);
        doc.setTextColor(0, 0, 0);
        doc.text(`${inv.marla} Marla`, margin + 35, yPos);
        yPos += 6;
      }
      
      // Total Value
      if (inv.totalValue) {
        doc.setTextColor(50, 50, 50);
        doc.text('Total Value:', margin + 5, yPos);
        doc.setTextColor(0, 0, 0);
        doc.text(formatCurrency(inv.totalValue), margin + 35, yPos);
        yPos += 6;
      }
      
      // Rate per Marla
      if (inv.ratePerMarla) {
        doc.setTextColor(50, 50, 50);
        doc.text('Rate per Marla:', margin + 5, yPos);
        doc.setTextColor(0, 0, 0);
        doc.text(formatCurrency(inv.ratePerMarla), margin + 35, yPos);
        yPos += 6;
      }
      
      // Dimensions
      if (inv.dimensions) {
        doc.setTextColor(50, 50, 50);
        doc.text('Dimensions:', margin + 5, yPos);
        doc.setTextColor(0, 0, 0);
        doc.text(inv.dimensions, margin + 35, yPos);
        yPos += 6;
      }
      
      // Owner
      if (inv.owner) {
        doc.setTextColor(50, 50, 50);
        doc.text('Owner:', margin + 5, yPos);
        doc.setTextColor(0, 0, 0);
        doc.text(typeof inv.owner === 'object' ? inv.owner.name || '' : inv.owner, margin + 35, yPos);
        yPos += 6;
      }
      
      // Status
      if (inv.status) {
        doc.setTextColor(50, 50, 50);
        doc.text('Status:', margin + 5, yPos);
        doc.setTextColor(0, 0, 0);
        doc.text(inv.status, margin + 35, yPos);
        yPos += 6;
      }
      
      // Notes
      if (inv.notes) {
        doc.setTextColor(50, 50, 50);
        doc.text('Notes:', margin + 5, yPos);
        doc.setTextColor(0, 0, 0);
        // Handle long notes with word wrap
        const noteLines = doc.splitTextToSize(inv.notes, contentWidth - 40);
        doc.text(noteLines, margin + 35, yPos);
        yPos += noteLines.length * 5;
      }
      
      yPos += 4; // Space between plots
      
      // Draw separator line
      if (idx < plotsToExport.length - 1) {
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, yPos, margin + contentWidth, yPos);
        yPos += 4;
      }
    });
  }
  
  // Save PDF
  const filename = isSingle
    ? `Plot_Details_${plotsToExport[0].n}_${new Date().toISOString().split('T')[0]}.pdf`
    : `Plot_Details_${plotsToExport.length}_plots_${new Date().toISOString().split('T')[0]}.pdf`;
  
  doc.save(filename);
  alert(`✅ PDF saved: ${filename}`);
}

// Build export canvas with high resolution
export function buildExportCanvasEnhanced(vectorState, mode = 'full', highlightItems = null, expScale = 2, includeLegend = true, legendPosition = 'bottom-right') {
  try {
    if (!vectorState.pdfImg) {
      throw new Error('PDF map not loaded. Please load a project file first.');
    }
    
    if (!vectorState.mapW || !vectorState.mapH || vectorState.mapW === 0 || vectorState.mapH === 0) {
      throw new Error('Map dimensions not set. Please ensure PDF is fully loaded.');
    }
  
  const c = document.createElement('canvas');
  c.width = vectorState.mapW * expScale;
  c.height = vectorState.mapH * expScale;
  const ctx = c.getContext('2d');
  
  // Enable high quality rendering
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  // Draw PDF background
  ctx.drawImage(vectorState.pdfImg, 0, 0, c.width, c.height);
  
  // Build annotation map - PRESERVE ORDER FROM vectorState.annos
  // Order is critical and must match JSON source file order
  const annoMap = {};
  vectorState.annos.forEach(a => {
    a.plotIds.forEach(pid => {
      annoMap[pid] = a;
    });
  });
  
  // Determine highlight annotation IDs or plot IDs
  const highlightAnnoIds = new Set();
  const highlightPlotIds = new Set();
  if (mode === 'single' && highlightItems) {
    highlightAnnoIds.add(highlightItems.id);
  } else if (mode === 'multi' && highlightItems) {
    highlightItems.forEach(h => highlightAnnoIds.add(h.id));
  } else if (mode === 'proposal' && highlightItems) {
    // highlightItems = array of plot IDs to highlight
    highlightItems.forEach(pid => highlightPlotIds.add(pid));
  }
  
  // Draw plots
  vectorState.plots.forEach(p => {
    const a = annoMap[p.id];
    
    // Skip non-annotated manual plots if hide setting is on
    if (vectorState.hideNonAnnotatedManualPlots && p.manual && !a) {
      return;
    }
    
    // Filter by mode
    if (mode === 'single' || mode === 'multi') {
      if (!a) return;
      const isHighlighted = highlightAnnoIds.has(a.id);
      if (!isHighlighted) return;
    }
    if (mode === 'proposal') {
      if (!highlightPlotIds.has(p.id)) return;
    }

    const offset = vectorState.plotOffsets[p.id] || { ox: 0, oy: 0 };
    const px = (p.x + offset.ox) * expScale;
    const py = (p.y + offset.oy) * expScale;

    // Determine styling
    let fillColor, textColor, borderColor, opacity;
    if (mode === 'proposal') {
      // Proposal mode: only selected plots reach here (non-selected skipped above)
      fillColor = '#dc2626'; // red-600
      textColor = '#ffffff';
      borderColor = '#991b1b'; // red-800
      opacity = 1;
    } else if ((mode === 'single' && highlightItems && a && a.id === highlightItems.id) ||
        (mode === 'multi' && highlightAnnoIds.has(a.id))) {
      fillColor = a.color;
      textColor = '#ffffff';
      borderColor = '#000000';
      opacity = 1;
    } else if (mode === 'single' || mode === 'multi') {
      fillColor = '#ffffff';
      textColor = '#999999';
      borderColor = '#cccccc';
      opacity = 0.5;
    } else {
      fillColor = a ? a.color : '#6366f1';
      textColor = '#ffffff';
      borderColor = '#000000';
      opacity = a ? 0.92 : 0.75;
    }

    if (a || mode === 'full' || mode === 'proposal') {
      const fontSize = (a ? (a.fontSize || 12) : 10) * expScale;
      ctx.font = `bold ${fontSize}px Arial`;
      const displayText = p.n;
      const textW = ctx.measureText(displayText).width;
      const bw = Math.max(textW + 6 * expScale, 16 * expScale);
      const bh = Math.max(fontSize + 4 * expScale, 12 * expScale);
      
      // Get rotation (same logic as MapCanvas)
      const plotRotation = vectorState.plotRotations[p.id] !== undefined 
        ? vectorState.plotRotations[p.id] 
        : (a ? (a.rotation || 0) : 0);
      
      // Apply rotation if needed
      if (plotRotation !== 0) {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(plotRotation * Math.PI / 180);
        ctx.translate(-px, -py);
      }
      
      // Draw annotation box
      ctx.fillStyle = fillColor;
      ctx.globalAlpha = opacity;
      ctx.fillRect(px - bw/2, py - bh/2, bw, bh);
      ctx.globalAlpha = 1;
      
      // Draw border
      if (borderColor) {
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1 * expScale;
        ctx.strokeRect(px - bw/2, py - bh/2, bw, bh);
      }
      
      // Draw text
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(displayText, px, py);
      
      // Manual plot indicator
      if (p.manual) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2 * expScale;
        ctx.setLineDash([4 * expScale, 2 * expScale]);
        ctx.strokeRect(px - bw/2 - 3 * expScale, py - bh/2 - 3 * expScale, bw + 6 * expScale, bh + 6 * expScale);
        ctx.setLineDash([]);
      }
      
      // Restore rotation
      if (plotRotation !== 0) {
        ctx.restore();
      }
    }
  });
  
  // Draw shapes
  vectorState.shapes.forEach(s => {
    ctx.fillStyle = s.color;
    const size = s.size * expScale;
    const sx = s.x * expScale;
    const sy = s.y * expScale;
    
    switch(s.type) {
      case 'rect':
        ctx.fillRect(sx - size/2, sy - size/2, size, size);
        break;
      case 'circle':
        ctx.beginPath();
        ctx.arc(sx, sy, size/2, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'triangle':
        ctx.beginPath();
        ctx.moveTo(sx, sy - size/2);
        ctx.lineTo(sx + size/2, sy + size/2);
        ctx.lineTo(sx - size/2, sy + size/2);
        ctx.closePath();
        ctx.fill();
        break;
      case 'cross':
        const t = size/4;
        ctx.fillRect(sx - t/2, sy - size/2, t, size);
        ctx.fillRect(sx - size/2, sy - t/2, size, t);
        break;
      case 'star':
        drawStar(ctx, sx, sy, 5, size/2, size/4);
        break;
    }
  });
  
  // Draw labels
  vectorState.labels.forEach(l => {
    ctx.font = `bold ${l.size * expScale}px Arial`;
    ctx.fillStyle = l.color || '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(l.text, l.x * expScale, l.y * expScale);
  });
  
    // Draw legend if requested
    if (includeLegend && vectorState.legend && vectorState.legend.visible) {
      try {
        drawLegendOnCanvas(ctx, vectorState, c.width, c.height, expScale, legendPosition, mode === 'proposal' ? highlightPlotIds : null);
      } catch (legendError) {
        console.warn('Error drawing legend on export:', legendError);
        // Continue without legend if it fails
      }
    }
    
    return c;
  } catch (error) {
    console.error('Error building export canvas:', error);
    throw error;
  }
}

// Draw legend on export canvas - matches live version layout
function drawLegendOnCanvas(ctx, vectorState, canvasWidth, canvasHeight, expScale, position = 'bottom-right', filterPlotIds = null) {
  // Calculate legend items (same logic as LegendPanel)
  const items = [];
  const seen = new Set();

  vectorState.annos.forEach(a => {
    // In proposal mode, skip annotations that don't contain any selected plots
    if (filterPlotIds && !a.plotIds.some(pid => filterPlotIds.has(pid))) return;

    const key = a.color + '|' + (a.note || a.cat);

    if (!seen.has(key)) {
      seen.add(key);
      
      let totalMarla = 0;
      let totalValue = 0;
      let count = 0;
      
      a.plotIds.forEach(pid => {
        const plot = vectorState.plots.find(x => x.id === pid);
        if (plot && plot.n) {
          count++;
          let inv = vectorState.inventory[plot.n];
          if (!inv) {
            const invKey = Object.keys(vectorState.inventory).find(key =>
              key.toUpperCase() === plot.n.toUpperCase() ||
              key.trim().toUpperCase() === plot.n.trim().toUpperCase()
            );
            if (invKey) inv = vectorState.inventory[invKey];
          }
          
          if (inv) {
            totalMarla += parseFloat(inv.marla) || 0;
            totalValue += parseFloat(inv.totalValue) || 0;
          }
        }
      });
      
      items.push({
        color: a.color,
        note: a.note || a.cat || 'Marked',
        count: count,
        marla: totalMarla,
        value: totalValue
      });
    }
  });
  
  // Add manual legend entries
  if (vectorState.legend.manualEntries && vectorState.legend.manualEntries.length > 0) {
    vectorState.legend.manualEntries.forEach(entry => {
      items.push({
        color: entry.color,
        note: entry.text,
        count: 0,
        marla: 0,
        value: 0
      });
    });
  }
  
  // Sort by value total (descending) or count or marla
  items.sort((a, b) => {
    if (a.value > 0 || b.value > 0) {
      return b.value - a.value;
    }
    if (a.marla > 0 || b.marla > 0) {
      return b.marla - a.marla;
    }
    return b.count - a.count;
  });
  
  if (items.length === 0) return;
  
  // Format currency helper
  const formatCurrency = (amount) => {
    if (!amount) return 'PKR 0';
    return 'PKR ' + parseFloat(amount).toLocaleString('en-PK', { maximumFractionDigits: 0 });
  };
  
  // Calculate legend dimensions - match live version
  const legendPadding = 8 * expScale;
  const legendItemHeight = 24 * expScale;
  const legendWidth = 200 * expScale;
  const titleHeight = 20 * expScale;
  const legendHeight = titleHeight + (items.length * legendItemHeight) + legendPadding * 2;
  
  // Position legend based on setting (matches LegendPanel positions)
  let legendX, legendY;
  switch (position) {
    case 'top-right':
      legendX = canvasWidth - legendWidth - legendPadding;
      legendY = legendPadding;
      break;
    case 'top-left':
      legendX = legendPadding;
      legendY = legendPadding;
      break;
    case 'bottom-left':
      legendX = legendPadding;
      legendY = canvasHeight - legendHeight - legendPadding;
      break;
    case 'bottom-right':
    default:
      legendX = canvasWidth - legendWidth - legendPadding;
      legendY = canvasHeight - legendHeight - legendPadding;
      break;
  }
  
  // Draw legend background - match live version style
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(legendX, legendY, legendWidth, legendHeight);
  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = 1 * expScale;
  ctx.strokeRect(legendX, legendY, legendWidth, legendHeight);
  
  // Draw legend title - match live version (gray header)
  ctx.fillStyle = '#1f2937'; // gray-800
  ctx.fillRect(legendX, legendY, legendWidth, titleHeight);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${11 * expScale}px Arial`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('📊 LEGEND', legendX + legendPadding, legendY + titleHeight / 2);
  
  // Draw legend items - match live version layout
  items.forEach((item, idx) => {
    const itemY = legendY + titleHeight + legendPadding + (idx * legendItemHeight);
    
    // Color box - match live version size
    ctx.fillStyle = item.color;
    ctx.fillRect(legendX + legendPadding, itemY + 6 * expScale, 16 * expScale, 12 * expScale);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.5 * expScale;
    ctx.strokeRect(legendX + legendPadding, itemY + 6 * expScale, 16 * expScale, 12 * expScale);
    
    // Text - match live version formatting
    ctx.fillStyle = '#000000';
    ctx.font = `semibold ${10 * expScale}px Arial`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    // Note text
    ctx.fillText(item.note, legendX + legendPadding + 22 * expScale, itemY + 2 * expScale);
    
    // Count and values - match live version layout
    ctx.font = `${9 * expScale}px Arial`;
    ctx.fillStyle = '#6b7280'; // gray-500
    const details = [];
    details.push(`${item.count} plots`);
    if (item.marla > 0) details.push(`${item.marla.toFixed(1)}M`);
    if (item.value > 0) details.push(formatCurrency(item.value));
    
    ctx.fillText(details.join(' | '), legendX + legendPadding + 22 * expScale, itemY + 14 * expScale);
    
    // Border between items (match live version)
    if (idx < items.length - 1) {
      ctx.strokeStyle = '#f3f4f6'; // gray-100
      ctx.lineWidth = 1 * expScale;
      ctx.beginPath();
      ctx.moveTo(legendX + legendPadding, itemY + legendItemHeight);
      ctx.lineTo(legendX + legendWidth - legendPadding, itemY + legendItemHeight);
      ctx.stroke();
    }
  });
}

// Calculate annotation inventory stats
export function calculateAnnotationInventoryStats(annotation, vectorState) {
  let totalMarla = 0, totalValue = 0, plotsWithData = 0;
  annotation.plotIds.forEach(pid => {
    const plot = vectorState.plots.find(x => x.id === pid);
    if (plot) {
      let inv = vectorState.inventory[plot.n];
      if (!inv) {
        const invKey = Object.keys(vectorState.inventory).find(key =>
          key.toUpperCase() === plot.n.toUpperCase() || key.trim().toUpperCase() === plot.n.trim().toUpperCase()
        );
        if (invKey) inv = vectorState.inventory[invKey];
      }
      if (inv) {
        totalMarla += parseFloat(inv.marla) || 0;
        totalValue += parseFloat(inv.totalValue) || 0;
        if (inv.marla || inv.totalValue) plotsWithData++;
      }
    }
  });
  return { totalMarla, totalValue, plotsWithData, plotCount: annotation.plotIds.length };
}

// Build cropped export canvas centered on selected plots
export function buildCroppedExportCanvas(vectorState, centerPlotIdOrIds, zoomLevel, expScale = 2, includeLegend = true, legendPosition = 'bottom-right') {
  // zoomLevel: 1.0=100%, 0.75=75%, 0.50=50%, 0.25=25%
  // centerPlotIdOrIds: single ID or array of IDs
  const plotIds = Array.isArray(centerPlotIdOrIds) ? centerPlotIdOrIds : [centerPlotIdOrIds];
  const fullCanvas = buildExportCanvasEnhanced(vectorState, 'proposal', plotIds, expScale, false, legendPosition);

  // Compute centroid of all selected plots
  const selectedPlots = plotIds.map(id => vectorState.plots.find(p => p.id === id)).filter(Boolean);
  if (selectedPlots.length === 0) return fullCanvas;

  let cx = 0, cy = 0;
  selectedPlots.forEach(p => {
    const offset = vectorState.plotOffsets[p.id] || { ox: 0, oy: 0 };
    cx += (p.x + offset.ox) * expScale;
    cy += (p.y + offset.oy) * expScale;
  });
  cx /= selectedPlots.length;
  cy /= selectedPlots.length;

  const cropW = fullCanvas.width * zoomLevel;
  const cropH = fullCanvas.height * zoomLevel;

  let cropX = cx - cropW / 2;
  let cropY = cy - cropH / 2;
  cropX = Math.max(0, Math.min(fullCanvas.width - cropW, cropX));
  cropY = Math.max(0, Math.min(fullCanvas.height - cropH, cropY));

  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = cropW;
  croppedCanvas.height = cropH;
  const ctx = croppedCanvas.getContext('2d');
  ctx.drawImage(fullCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  // No extra highlight needed - proposal mode already highlights selected plots in red

  if (includeLegend && vectorState.legend && vectorState.legend.visible) {
    try {
      const filterIds = new Set(plotIds);
      drawLegendOnCanvas(ctx, vectorState, croppedCanvas.width, croppedCanvas.height, expScale, legendPosition, filterIds);
    } catch (e) { console.warn('Legend error on cropped canvas:', e); }
  }

  return croppedCanvas;
}

// Build single-plot-only canvas (shows only selected plots highlighted, rest dimmed)
export function buildSinglePlotCanvas(vectorState, plotIds, expScale = 2) {
  const fullCanvas = buildExportCanvasEnhanced(vectorState, 'proposal', plotIds, expScale, false);

  // Find bounding box of selected plots with generous padding (~5% of map)
  const selectedPlots = vectorState.plots.filter(p => plotIds.includes(p.id));
  if (selectedPlots.length === 0) return fullCanvas;

  // Use 4% of map dimension as padding (wider context for single plot view)
  const padX = Math.max(80 * expScale, fullCanvas.width * 0.04);
  const padY = Math.max(80 * expScale, fullCanvas.height * 0.04);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  selectedPlots.forEach(p => {
    const offset = vectorState.plotOffsets[p.id] || { ox: 0, oy: 0 };
    const px = (p.x + offset.ox) * expScale;
    const py = (p.y + offset.oy) * expScale;
    minX = Math.min(minX, px - padX);
    minY = Math.min(minY, py - padY);
    maxX = Math.max(maxX, px + padX);
    maxY = Math.max(maxY, py + padY);
  });

  // Clamp and add padding
  minX = Math.max(0, minX);
  minY = Math.max(0, minY);
  maxX = Math.min(fullCanvas.width, maxX);
  maxY = Math.min(fullCanvas.height, maxY);

  const cropW = maxX - minX;
  const cropH = maxY - minY;

  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = cropW;
  croppedCanvas.height = cropH;
  const ctx = croppedCanvas.getContext('2d');
  ctx.drawImage(fullCanvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

  return croppedCanvas;
}

// Export Proposal PDF - clean summary table + map views
export async function exportProposalPDF(plotsToExport, vectorState, fieldConfig, viewOptions) {
  let jsPDFClass;
  if (window.jspdf && window.jspdf.jsPDF) {
    jsPDFClass = window.jspdf.jsPDF;
  } else {
    try {
      const mod = await import('jspdf');
      jsPDFClass = mod.jsPDF;
    } catch (err) {
      alert('jsPDF not loaded. Please refresh the page.');
      return;
    }
  }

  const quality = viewOptions.quality || 2;
  const legendPosition = vectorState.legend?.position || 'bottom-right';
  const plotIds = plotsToExport.map(p => p.id);

  const fmtPKR = (v) => v ? 'PKR ' + parseFloat(v).toLocaleString('en-PK', { maximumFractionDigits: 0 }) : '';

  const generatePDF = (zoomLevels, suffix = '') => {
    const pdf = new jsPDFClass({ orientation: 'landscape', unit: 'mm', format: 'a3', compress: true });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const margin = 12;

    // === PAGE 1: Header + Summary Table ===

    // Dark header bar
    pdf.setFillColor(30, 41, 59);
    pdf.rect(0, 0, pw, 22, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(14);
    pdf.setFont(undefined, 'bold');
    pdf.text(vectorState.projectName || 'Project Proposal', margin, 15);
    pdf.setFontSize(8);
    pdf.setFont(undefined, 'normal');
    pdf.text(new Date().toLocaleDateString(), pw - margin, 15, { align: 'right' });

    let y = 30;

    // Compute totals
    let totalMarla = 0, totalValue = 0;
    plotsToExport.forEach(p => {
      const inv = vectorState.inventory[p.n] || {};
      totalMarla += parseFloat(inv.marla) || 0;
      totalValue += parseFloat(inv.totalValue) || 0;
    });

    // Summary line
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(10);
    pdf.setFont(undefined, 'bold');
    const summaryParts = [`${plotsToExport.length} Plot${plotsToExport.length > 1 ? 's' : ''}`];
    if (totalMarla > 0) summaryParts.push(`${totalMarla.toFixed(1)} Marla`);
    if (totalValue > 0) summaryParts.push(fmtPKR(totalValue));
    pdf.text(summaryParts.join('  |  '), margin, y);
    y += 8;

    // Build table columns based on fieldConfig
    const cols = [{ key: 'plot', label: 'Plot#', w: 18 }];
    if (fieldConfig.annotationInfo) cols.push({ key: 'anno', label: 'Annotation', w: 40 });
    if (fieldConfig.area) cols.push({ key: 'area', label: 'Area', w: 22 });
    if (fieldConfig.value) cols.push({ key: 'value', label: 'Value', w: 38 });
    if (fieldConfig.ratePerMarla) cols.push({ key: 'rate', label: 'Rate/M', w: 32 });
    if (fieldConfig.dimensions) cols.push({ key: 'dims', label: 'Dims', w: 28 });
    if (fieldConfig.owner) cols.push({ key: 'owner', label: 'Owner', w: 35 });
    if (fieldConfig.status) cols.push({ key: 'status', label: 'Status', w: 22 });
    if (fieldConfig.notes) cols.push({ key: 'notes', label: 'Notes', w: 0 }); // flex

    // Calculate flex column width
    const fixedW = cols.reduce((sum, c) => sum + c.w, 0);
    const tableW = pw - margin * 2;
    const flexCol = cols.find(c => c.w === 0);
    if (flexCol) flexCol.w = Math.max(30, tableW - fixedW);

    // Table header
    const rowH = 7;
    pdf.setFillColor(241, 245, 249); // slate-100
    pdf.rect(margin, y, tableW, rowH, 'F');
    pdf.setFontSize(7);
    pdf.setFont(undefined, 'bold');
    pdf.setTextColor(71, 85, 105); // slate-500
    let xPos = margin + 2;
    cols.forEach(col => {
      pdf.text(col.label, xPos, y + 5);
      xPos += col.w;
    });
    y += rowH;

    // Table rows
    pdf.setFont(undefined, 'normal');
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(7);

    plotsToExport.forEach((p, idx) => {
      if (y > ph - 20) { pdf.addPage(); y = margin; }

      const inv = vectorState.inventory[p.n] || {};
      const anno = vectorState.annos.find(a => a.plotIds.includes(p.id));

      // Alternate row shading
      if (idx % 2 === 0) {
        pdf.setFillColor(249, 250, 251);
        pdf.rect(margin, y, tableW, rowH, 'F');
      }

      // Draw thin border
      pdf.setDrawColor(229, 231, 235);
      pdf.setLineWidth(0.2);
      pdf.line(margin, y + rowH, margin + tableW, y + rowH);

      xPos = margin + 2;
      const rowData = {
        plot: p.n,
        anno: anno ? anno.note : '',
        area: inv.marla ? `${inv.marla} M` : '',
        value: fmtPKR(inv.totalValue),
        rate: fmtPKR(inv.ratePerMarla),
        dims: inv.dimensions || '',
        owner: (typeof inv.owner === 'object' ? inv.owner.name || '' : inv.owner) || '',
        status: inv.status || '',
        notes: inv.notes || ''
      };

      cols.forEach(col => {
        let text = rowData[col.key] || '';
        // Truncate to fit column
        const maxChars = Math.floor(col.w / 1.8);
        if (text.length > maxChars) text = text.substring(0, maxChars - 1) + '..';
        pdf.text(text, xPos, y + 5);
        xPos += col.w;
      });
      y += rowH;
    });

    // Totals row
    if (y > ph - 20) { pdf.addPage(); y = margin; }
    pdf.setFillColor(30, 41, 59);
    pdf.rect(margin, y, tableW, rowH + 1, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(7);
    pdf.setFont(undefined, 'bold');
    xPos = margin + 2;
    cols.forEach(col => {
      let text = '';
      if (col.key === 'plot') text = 'TOTAL';
      else if (col.key === 'area' && totalMarla > 0) text = `${totalMarla.toFixed(1)} M`;
      else if (col.key === 'value' && totalValue > 0) text = fmtPKR(totalValue);
      pdf.text(text, xPos, y + 5);
      xPos += col.w;
    });

    // === MAP PAGES at selected zoom levels ===
    zoomLevels.forEach(zoom => {
      pdf.addPage();
      let canvas;
      const zoomLabel = zoom === 0 ? 'Single Plot View' : `${Math.round(zoom * 100)}% View`;

      if (zoom === 0) {
        canvas = buildSinglePlotCanvas(vectorState, plotIds, quality);
      } else if (zoom === 1.0) {
        canvas = buildExportCanvasEnhanced(vectorState, 'proposal', plotIds, quality, viewOptions.includeLegend, legendPosition);
      } else {
        canvas = buildCroppedExportCanvas(vectorState, plotIds, zoom, quality, viewOptions.includeLegend, legendPosition);
      }

      // Slim title bar
      pdf.setFillColor(30, 41, 59);
      pdf.rect(0, 0, pw, 10, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.setFont(undefined, 'normal');
      pdf.text(`${zoomLabel}  |  ${plotsToExport.map(p => p.n).join(', ')}`, 5, 7);
      pdf.text(vectorState.projectName || '', pw - 5, 7, { align: 'right' });

      // Fit canvas to page
      const ratio = canvas.width / canvas.height;
      const availW = pw - 8, availH = ph - 16;
      let w, h;
      if (ratio > availW / availH) { w = availW; h = w / ratio; }
      else { h = availH; w = h * ratio; }
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 4, 12, w, h);
    });

    const filename = `${vectorState.projectName || 'map'}_Proposal${suffix}_${new Date().toISOString().split('T')[0]}.pdf`;
    pdf.save(filename);
    return filename;
  };

  const zoomLevels = viewOptions.zoomLevels || [1.0];

  if (viewOptions.separateFiles) {
    const filenames = [];
    zoomLevels.forEach(zoom => {
      const label = zoom === 0 ? 'SingleView' : `${Math.round(zoom * 100)}pct`;
      filenames.push(generatePDF([zoom], `_${label}`));
    });
    alert(`Saved ${filenames.length} PDF files`);
  } else {
    const filename = generatePDF(zoomLevels);
    alert(`Proposal PDF saved: ${filename}`);
  }
}

// Helper to draw star
function drawStar(ctx, x, y, points, outerRadius, innerRadius) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.fill();
}

