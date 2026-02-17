import React, { useState, useEffect, useRef } from 'react';
import { exportPlotDetailsToPDF, exportProposalPDF } from '../../utils/exportUtils';

export default function PlotDetailsWindow({ vectorState }) {
  const [visible, setVisible] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [plotId, setPlotId] = useState(null);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const windowRef = useRef(null);

  // Format currency
  const formatCurrency = (amount) => {
    if (!amount) return 'PKR 0';
    return 'PKR ' + parseFloat(amount).toLocaleString('en-PK', { maximumFractionDigits: 0 });
  };

  // Show plot details
  const showPlotDetails = (id) => {
    const plot = vectorState.plots.find(p => p.id === id);
    if (!plot) return;

    setPlotId(id);
    setVisible(true);
    setMinimized(false);
  };

  // Update plot details content
  const getPlotDetails = () => {
    if (!plotId) return null;
    
    const plot = vectorState.plots.find(p => p.id === plotId);
    if (!plot) return null;

    const inv = vectorState.inventory[plot.n] || {};
    const anno = vectorState.annos.find(a => a.plotIds.includes(plot.id));

    return { plot, inv, anno };
  };

  // Handle drag start
  const handleDragStart = (e) => {
    if (e.target.closest('button')) return;
    setIsDragging(true);
    const rect = windowRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    e.preventDefault();
  };

  // Handle drag
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      
      const maxX = window.innerWidth - (windowRef.current?.offsetWidth || 0);
      const maxY = window.innerHeight - (windowRef.current?.offsetHeight || 0);
      
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

  // Expose showPlotDetails globally
  useEffect(() => {
    window.onShowPlotDetails = showPlotDetails;
    return () => {
      window.onShowPlotDetails = null;
    };
  }, []);

  const details = getPlotDetails();
  if (!visible || !details) return null;

  const { plot, inv, anno } = details;

  return (
    <div
      ref={windowRef}
      className={`fixed bg-white border border-gray-300 rounded-lg shadow-lg z-30 ${
        minimized ? 'min-w-[220px]' : 'min-w-[220px] max-w-[280px]'
      }`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        display: visible ? 'block' : 'none'
      }}
    >
      {/* Header */}
      <div
        className="bg-gray-800 text-white px-3 py-2 rounded-t-lg flex justify-between items-center cursor-move select-none"
        onMouseDown={handleDragStart}
      >
        <div className="font-semibold text-sm">📋 Plot Details</div>
        <div className="flex gap-2">
          <button
            onClick={() => setMinimized(!minimized)}
            className="text-white hover:opacity-100 opacity-70 text-xs px-1"
            title="Minimize"
          >
            −
          </button>
          <button
            onClick={() => setVisible(false)}
            className="text-white hover:opacity-100 opacity-70 text-xs px-1"
            title="Close"
          >
            ×
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Body */}
          <div className="p-3 max-h-[250px] overflow-y-auto text-xs">
            <div className="mb-3">
              <div className="text-base font-bold text-gray-900 mb-2">Plot {plot.n}</div>
            </div>

            {/* Annotation info */}
            {anno && (
              <div className="bg-gray-50 p-2 rounded mb-3">
                <div className="text-sm font-bold text-gray-800 mb-1">{anno.note}</div>
                <div className="text-gray-500">{anno.plotIds.length} plots in group</div>
              </div>
            )}

            {/* Area (Marla) */}
            {inv.marla && (
              <div className="mb-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Area:</span>
                  <span className="font-semibold">{inv.marla} Marla</span>
                </div>
              </div>
            )}

            {/* Inventory data */}
            {(inv.totalValue || inv.ratePerMarla || inv.owner || inv.dimensions || inv.status || inv.notes) && (
              <div className="space-y-2 mb-3">
                <div className="font-semibold text-gray-700 mb-2">Inventory Details:</div>
                
                {inv.totalValue && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Value:</span>
                    <span className="font-semibold">{formatCurrency(inv.totalValue)}</span>
                  </div>
                )}
                
                {inv.ratePerMarla && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Rate per Marla:</span>
                    <span className="font-semibold">{formatCurrency(inv.ratePerMarla)}</span>
                  </div>
                )}
                
                {inv.dimensions && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Dimensions:</span>
                    <span className="font-semibold">{inv.dimensions}</span>
                  </div>
                )}
                
                {inv.owner && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Owner:</span>
                    <span className="font-semibold">{typeof inv.owner === 'object' ? inv.owner.name || '' : inv.owner}</span>
                  </div>
                )}
                
                {inv.status && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status:</span>
                    <span className="font-semibold">{inv.status}</span>
                  </div>
                )}
                
                {inv.notes && (
                  <div>
                    <span className="text-gray-600">Notes:</span>
                    <div className="mt-1 text-sm">{inv.notes}</div>
                  </div>
                )}
              </div>
            )}

            {!anno && !inv.marla && !inv.totalValue && (
              <div className="text-gray-500 text-center py-4">
                No additional details available
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-gray-200 bg-gray-50 flex gap-2 flex-wrap">
            <button
              onClick={() => {
                // Edit functionality - to be implemented
                alert('Edit functionality coming soon');
              }}
              className="flex-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              ✏️ Edit
            </button>
            <button
              onClick={() => {
                // Zoom functionality - to be implemented
                if (window.zoomToPlot) {
                  window.zoomToPlot(plot.id);
                }
              }}
              className="flex-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
            >
              🔍 Zoom
            </button>
            <button
              onClick={() => {
                // Copy functionality
                const text = `Plot: ${plot.n}\n${
                  anno ? `Annotation: ${anno.note}\n` : ''
                }${inv.marla ? `Area: ${inv.marla} Marla\n` : ''}${inv.totalValue ? `Value: ${formatCurrency(inv.totalValue)}\n` : ''}${inv.owner ? `Owner: ${typeof inv.owner === 'object' ? inv.owner.name || '' : inv.owner}\n` : ''}`;
                navigator.clipboard.writeText(text);
                alert('Copied to clipboard');
              }}
              className="flex-1 px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              📋 Copy
            </button>
            <button
              onClick={() => {
                // Export single plot or multiple selected plots
                const plotsToExport = vectorState.selected.size > 0
                  ? Array.from(vectorState.selected).map(id => vectorState.plots.find(p => p.id === id)).filter(Boolean)
                  : [plot];
                exportPlotDetailsToPDF(plotsToExport, vectorState);
              }}
              className="flex-1 px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 mt-1"
              title={vectorState.selected.size > 0 ? `Export ${vectorState.selected.size} selected plots` : 'Export this plot'}
            >
              📄 Export PDF {vectorState.selected.size > 0 ? `(${vectorState.selected.size})` : ''}
            </button>
            <button
              onClick={() => {
                const plotsToExport = vectorState.selected.size > 0
                  ? Array.from(vectorState.selected).map(id => vectorState.plots.find(p => p.id === id)).filter(Boolean)
                  : [plot];
                exportProposalPDF(plotsToExport, vectorState,
                  { owner: true, value: true, area: true, status: true, notes: true, ratePerMarla: true, dimensions: true, coordinates: false, annotationInfo: true },
                  { zoomLevels: [1.0, 0.50], quality: 2, includeLegend: true, includeHeader: true, separateFiles: false }
                );
              }}
              className="flex-1 px-2 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-700 mt-1"
              title="Export proposal PDF with map views + details"
            >
              📑 Proposal
            </button>
          </div>
        </>
      )}
    </div>
  );
}

