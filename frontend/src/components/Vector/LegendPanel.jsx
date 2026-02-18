import React, { useEffect, useState, useMemo } from 'react';

export default function LegendPanel({ vectorState }) {
  const [minimized, setMinimized] = useState(vectorState.legend.minimized);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [showPositionMenu, setShowPositionMenu] = useState(false);

  // Format currency
  const formatCurrency = (amount) => {
    if (!amount) return 'PKR 0';
    return 'PKR ' + parseFloat(amount).toLocaleString('en-PK', { maximumFractionDigits: 0 });
  };

  // Helper function to find plot with fallback for type mismatches
  const findPlotById = (plots, pid) => {
    // Try exact match first
    let plot = plots.find(x => x.id === pid);
    // Fallback: try string comparison if exact match fails
    if (!plot) {
      plot = plots.find(x => String(x.id) === String(pid));
    }
    return plot;
  };

  // Calculate legend items
  const legendItems = useMemo(() => {
    const items = [];
    const seen = new Set();
    let globalMarlaTotal = 0;
    let globalValueTotal = 0;

    // Debug: Log inventory state
    const invKeys = Object.keys(vectorState.inventory || {});
    console.log('LegendPanel: Inventory keys count:', invKeys.length);
    if (invKeys.length > 0) {
      console.log('LegendPanel: Sample inventory keys:', invKeys.slice(0, 5));
      console.log('LegendPanel: Sample inventory value:', vectorState.inventory[invKeys[0]]);
    }
    console.log('LegendPanel: Plots count:', vectorState.plots?.length || 0);
    console.log('LegendPanel: Annos count:', vectorState.annos?.length || 0);

    // Debug: Show sample plot names to compare with inventory keys
    if (vectorState.plots?.length > 0) {
      const samplePlotNames = vectorState.plots.slice(0, 5).map(p => p.n);
      console.log('LegendPanel: Sample plot names (plot.n):', samplePlotNames);
    }

    // Debug: Check first annotation's plotIds
    if (vectorState.annos?.length > 0 && vectorState.annos[0].plotIds?.length > 0) {
      const firstAnno = vectorState.annos[0];
      const firstPlotId = firstAnno.plotIds[0];
      const foundPlot = vectorState.plots.find(p => p.id === firstPlotId || String(p.id) === String(firstPlotId));
      console.log('LegendPanel: First anno plotId:', firstPlotId, 'Found plot:', foundPlot ? { id: foundPlot.id, n: foundPlot.n } : 'NOT FOUND');
    }

    // Process annotations
    vectorState.annos.forEach(a => {
      const key = a.color + '|' + (a.note || a.cat);

      if (!seen.has(key)) {
        seen.add(key);

        let totalMarla = 0;
        let totalValue = 0;
        let plotsWithData = 0;
        let debugMatchCount = 0;

        a.plotIds.forEach(pid => {
          const plot = findPlotById(vectorState.plots, pid);
          if (plot && plot.n) {
            let inv = vectorState.inventory[plot.n];
            if (!inv) {
              const invKey = Object.keys(vectorState.inventory).find(key =>
                key.toUpperCase() === plot.n.toUpperCase() ||
                key.trim().toUpperCase() === plot.n.trim().toUpperCase()
              );
              if (invKey) inv = vectorState.inventory[invKey];
            }

            if (inv) {
              debugMatchCount++;
              const marlaVal = parseFloat(inv.marla) || 0;
              const valueVal = parseFloat(inv.totalValue) || 0;

              totalMarla += marlaVal;
              totalValue += valueVal;
              globalMarlaTotal += marlaVal;
              globalValueTotal += valueVal;

              if (marlaVal > 0 || valueVal > 0) {
                plotsWithData++;
              }
            }
          }
        });

        console.log(`LegendPanel: Anno "${a.note || a.cat}" - ${a.plotIds.length} plotIds, ${debugMatchCount} inv matches, marla=${totalMarla}, value=${totalValue}`);

        items.push({
          id: a.id,
          color: a.color,
          note: a.note || a.cat || 'Marked',
          count: a.plotIds.length,
          plotsWithData,
          marla: totalMarla,
          value: totalValue,
          isManual: false
        });
      } else {
        const existingItem = items.find(i => i.color === a.color && i.note === (a.note || a.cat || 'Marked'));
        if (existingItem) {
          let totalMarla = 0;
          let totalValue = 0;
          let plotsWithData = 0;

          a.plotIds.forEach(pid => {
            const plot = findPlotById(vectorState.plots, pid);
            if (plot && plot.n) {
              let inv = vectorState.inventory[plot.n];
              if (!inv) {
                const invKey = Object.keys(vectorState.inventory).find(key =>
                  key.toUpperCase() === plot.n.toUpperCase() ||
                  key.trim().toUpperCase() === plot.n.trim().toUpperCase()
                );
                if (invKey) inv = vectorState.inventory[invKey];
              }

              if (inv) {
                const marlaVal = parseFloat(inv.marla) || 0;
                const valueVal = parseFloat(inv.totalValue) || 0;
                totalMarla += marlaVal;
                totalValue += valueVal;
                globalMarlaTotal += marlaVal;
                globalValueTotal += valueVal;
                if (marlaVal > 0 || valueVal > 0) plotsWithData++;
              }
            }
          });

          existingItem.count += a.plotIds.length;
          existingItem.plotsWithData += plotsWithData;
          existingItem.marla += totalMarla;
          existingItem.value += totalValue;
        }
      }
    });

    // Add manual legend entries
    if (vectorState.legend.manualEntries && vectorState.legend.manualEntries.length > 0) {
      vectorState.legend.manualEntries.forEach(entry => {
        items.push({
          color: entry.color,
          note: entry.text,
          count: 0,
          plotsWithData: 0,
          marla: 0,
          value: 0,
          isManual: true
        });
      });
    }

    // Fallback: when no annotations have plotIds but inventory exists, show "All Inventory" summary
    const hasAnnotatedPlots = vectorState.annos.some(a => a.plotIds && a.plotIds.length > 0);
    let fallbackMode = false;
    if (!hasAnnotatedPlots && invKeys.length > 0) {
      fallbackMode = true;
      let fallbackMarla = 0;
      let fallbackValue = 0;
      let plotsWithInv = 0;
      invKeys.forEach(key => {
        const inv = vectorState.inventory[key];
        const m = parseFloat(inv.marla) || 0;
        const v = parseFloat(inv.totalValue) || 0;
        fallbackMarla += m;
        fallbackValue += v;
        if (m > 0 || v > 0) plotsWithInv++;
      });
      globalMarlaTotal = fallbackMarla;
      globalValueTotal = fallbackValue;
      items.push({
        id: '__all_inventory__',
        color: '#3b82f6',
        note: 'All Inventory',
        count: invKeys.length,
        plotsWithData: plotsWithInv,
        marla: fallbackMarla,
        value: fallbackValue,
        isManual: false,
        isFallback: true
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

    return { items, globalMarlaTotal, globalValueTotal, fallbackMode };
  }, [vectorState.annos, vectorState.plots, vectorState.inventory, vectorState.legend.manualEntries]);

  // Position legend based on position setting (only if not manually positioned)
  useEffect(() => {
    if (isDragging) return; // Don't auto-position while dragging
    
    const updatePosition = () => {
      const panel = document.getElementById('legendPanel');
      if (!panel) return;

      const parentRect = panel.parentElement?.getBoundingClientRect() || { width: window.innerWidth, height: window.innerHeight };
      const panelWidth = 200; // Approximate width
      const panelHeight = minimized ? 40 : 200; // Approximate height

      let x = 0, y = 0;
      switch (vectorState.legend.position) {
        case 'top-right':
          x = parentRect.width - panelWidth - 10;
          y = 50;
          break;
        case 'top-left':
          x = 10;
          y = 50;
          break;
        case 'bottom-right':
          x = parentRect.width - panelWidth - 10;
          y = parentRect.height - panelHeight - 10;
          break;
        case 'bottom-left':
          x = 10;
          y = parentRect.height - panelHeight - 10;
          break;
        default:
          x = parentRect.width - panelWidth - 10;
          y = parentRect.height - panelHeight - 10;
      }

      setPosition({ x, y });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [vectorState.legend.position, minimized, isDragging]);

  // Handle drag
  const handleDragStart = (e) => {
    if (e.target.closest('button')) return;
    setIsDragging(true);
    const rect = document.getElementById('legendPanel')?.getBoundingClientRect();
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
    e.preventDefault();
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      
      const maxX = window.innerWidth - 200;
      const maxY = window.innerHeight - 200;
      
      setPosition({
        x: Math.max(0, Math.min(maxX, newX)),
        y: Math.max(0, Math.min(maxY, newY))
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  if (!vectorState.legend.visible) return null;

  const { items, globalMarlaTotal, globalValueTotal, fallbackMode } = legendItems;

  return (
    <div
      id="legendPanel"
      className="fixed bg-white border border-gray-300 rounded-lg shadow-lg z-20 min-w-[160px] max-w-[200px]"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`
      }}
    >
      {/* Header */}
      <div 
        className="bg-gray-800 text-white px-2 py-1 rounded-t-lg flex justify-between items-center text-xs font-semibold cursor-move select-none"
        onMouseDown={handleDragStart}
      >
        <span>
          📊 {fallbackMode ? 'INVENTORY TOTALS' : 'LEGEND'}
          {(globalMarlaTotal > 0 || globalValueTotal > 0) && (
            <span className="ml-2 text-green-400">
              {globalMarlaTotal > 0 && `${globalMarlaTotal.toFixed(1)}M`}
              {globalMarlaTotal > 0 && globalValueTotal > 0 && ' | '}
              {globalValueTotal > 0 && formatCurrency(globalValueTotal)}
            </span>
          )}
        </span>
        <div className="flex gap-1 relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowPositionMenu(!showPositionMenu); }}
            className="text-white hover:opacity-100 opacity-70 text-xs"
            title="Legend Position"
          >
            📌
          </button>
          {showPositionMenu && (
            <div
              className="absolute top-6 right-0 bg-white border border-gray-300 rounded shadow-lg z-50 py-1 min-w-[120px]"
              onClick={(e) => e.stopPropagation()}
            >
              {[
                { value: 'top-left', label: 'Top Left' },
                { value: 'top-right', label: 'Top Right' },
                { value: 'bottom-left', label: 'Bottom Left' },
                { value: 'bottom-right', label: 'Bottom Right' },
              ].map(opt => (
                <div
                  key={opt.value}
                  className={`px-3 py-1 text-xs cursor-pointer hover:bg-gray-100 ${
                    vectorState.legend.position === opt.value ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-700'
                  }`}
                  onClick={() => {
                    vectorState.setLegend({ ...vectorState.legend, position: opt.value });
                    setShowPositionMenu(false);
                  }}
                >
                  {opt.label}
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => {
              // Refresh legend
              window.location.reload();
            }}
            className="text-white hover:opacity-100 opacity-70 text-xs"
            title="Refresh"
          >
            🔄
          </button>
          <button
            onClick={() => {
              setMinimized(!minimized);
              vectorState.setLegend({ ...vectorState.legend, minimized: !minimized });
            }}
            className="text-white hover:opacity-100 opacity-70 text-xs"
            title="Minimize"
          >
            −
          </button>
          <button
            onClick={() => {
              vectorState.setLegend({ ...vectorState.legend, visible: false });
            }}
            className="text-white hover:opacity-100 opacity-70 text-xs"
            title="Close"
          >
            ×
          </button>
        </div>
      </div>

      {!minimized && (
        <div className="p-2 max-h-[180px] overflow-y-auto">
          {/* View All button */}
          {vectorState.activeView !== 'all' && (
            <div
              className="flex items-center gap-2 py-1.5 px-2 mb-1 bg-blue-50 border border-blue-200 rounded cursor-pointer hover:bg-blue-100"
              onClick={() => vectorState.setActiveView('all')}
              title="Show all annotations"
            >
              <span className="text-xs font-semibold text-blue-700">← Show All</span>
            </div>
          )}

          {items.length === 0 ? (
            <div className="text-xs text-gray-500 text-center py-4">No annotations yet</div>
          ) : (
            items.map((item, idx) => {
              const parts = [];
              if (item.marla > 0) parts.push(`${item.marla.toFixed(1)}M`);
              if (item.value > 0) parts.push(formatCurrency(item.value));

              const isActiveView = vectorState.activeView === item.id;

              return (
                <div
                  key={idx}
                  className={`flex items-start gap-2 py-1.5 border-b border-gray-100 last:border-0 cursor-pointer transition-all ${
                    isActiveView
                      ? 'bg-indigo-50 border-l-2 border-l-indigo-500 pl-1'
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => {
                    if (item.isManual) return; // manual entries are info-only, not filterable
                    if (isActiveView) {
                      vectorState.setActiveView('all');
                    } else {
                      vectorState.setActiveView(item.id);
                    }
                  }}
                  title={item.isManual ? item.note : (isActiveView ? "Click to show all" : `Click to focus on ${item.note}`)}
                >
                  <div
                    className="w-4 h-3 rounded flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: item.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-xs flex gap-1" style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>
                      <span className="flex-1">{item.note}</span>
                      {isActiveView && <span className="text-indigo-500 flex-shrink-0">●</span>}
                      {item.isManual && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Remove legend entry "${item.note}"?`)) {
                              const updated = (vectorState.legend.manualEntries || []).filter(
                                me => !(me.text === item.note && me.color === item.color)
                              );
                              vectorState.setLegend({ ...vectorState.legend, manualEntries: updated });
                              vectorState.setHasUnsavedChanges(true);
                            }
                          }}
                          className="text-red-400 hover:text-red-600 text-[9px] flex-shrink-0"
                          title="Remove this entry"
                        >
                          x
                        </button>
                      )}
                    </div>
                    {!item.isManual && (
                      <div className="text-xs text-gray-500">
                        {item.count} plots
                        {parts.length > 0 && (
                          <span className="float-right text-blue-600 font-semibold">
                            {parts.join(' | ')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Add manual legend entry button */}
          <div className="border-t border-gray-200 pt-1 mt-1">
            <button
              onClick={() => {
                const text = prompt('Legend entry text:');
                if (!text || !text.trim()) return;
                const color = prompt('Color (hex):', '#9ca3af');
                if (!color) return;
                const entry = { text: text.trim(), color: color.trim() || '#9ca3af' };
                const current = vectorState.legend.manualEntries || [];
                vectorState.setLegend({ ...vectorState.legend, manualEntries: [...current, entry] });
                vectorState.setHasUnsavedChanges(true);
              }}
              className="w-full text-[10px] text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded py-1 transition-colors"
              title="Add a custom text entry to the legend"
            >
              + Add Entry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

