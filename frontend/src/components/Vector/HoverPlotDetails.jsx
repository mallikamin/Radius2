import React, { useState, useEffect } from 'react';

export default function HoverPlotDetails({ vectorState }) {
  const [visible, setVisible] = useState(false);
  const [plotId, setPlotId] = useState(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // Format currency
  const formatCurrency = (amount) => {
    if (!amount) return 'PKR 0';
    return 'PKR ' + parseFloat(amount).toLocaleString('en-PK', { maximumFractionDigits: 0 });
  };

  // Show hover details
  const showHoverDetails = (id, mouseX, mouseY) => {
    const plot = vectorState.plots.find(p => p.id === id);
    if (!plot) return;

    setPlotId(id);
    setVisible(true);
    // Position near mouse cursor
    setPosition({ x: mouseX + 15, y: mouseY + 15 });
  };

  // Hide hover details
  const hideHoverDetails = () => {
    setVisible(false);
    setPlotId(null);
  };

  // Expose functions globally
  useEffect(() => {
    window.showHoverPlotDetails = showHoverDetails;
    window.hideHoverPlotDetails = hideHoverDetails;
    return () => {
      window.showHoverPlotDetails = null;
      window.hideHoverPlotDetails = null;
    };
  }, [vectorState.plots]);

  if (!visible || !plotId) return null;

  const plot = vectorState.plots.find(p => p.id === plotId);
  if (!plot) return null;

  const inv = vectorState.inventory[plot.n] || {};
  const anno = vectorState.annos.find(a => a.plotIds.includes(plot.id));

  // Keep within viewport
  const maxX = window.innerWidth - 280;
  const maxY = window.innerHeight - 300;
  const finalX = Math.min(position.x, maxX);
  const finalY = Math.min(position.y, maxY);

  return (
    <div
      className="fixed bg-white border-2 border-gray-400 rounded-lg shadow-xl z-50 min-w-[260px] max-w-[280px]"
      style={{
        left: `${finalX}px`,
        top: `${finalY}px`,
        pointerEvents: 'none' // Don't interfere with mouse events
      }}
    >
      <div className="p-3 text-xs">
        <div className="text-base font-bold text-gray-900 mb-2 border-b border-gray-200 pb-2">
          Plot {plot.n}
        </div>

        {/* Annotation */}
        {anno && (
          <div className="mb-2">
            <span className="text-gray-600">Annotation: </span>
            <span className="font-semibold" style={{ color: anno.color }}>
              {anno.note || anno.cat}
            </span>
          </div>
        )}

        {/* Area (Marla) */}
        {inv.marla && (
          <div className="mb-1">
            <span className="text-gray-600">Area: </span>
            <span className="font-semibold">{inv.marla} Marla</span>
          </div>
        )}

        {/* Total Value */}
        {inv.totalValue && (
          <div className="mb-1">
            <span className="text-gray-600">Total Value: </span>
            <span className="font-semibold">{formatCurrency(inv.totalValue)}</span>
          </div>
        )}

        {/* Rate per Marla */}
        {inv.ratePerMarla && (
          <div className="mb-1">
            <span className="text-gray-600">Rate per Marla: </span>
            <span className="font-semibold">{formatCurrency(inv.ratePerMarla)}</span>
          </div>
        )}

        {/* Dimensions */}
        {inv.dimensions && (
          <div className="mb-1">
            <span className="text-gray-600">Dimensions: </span>
            <span className="font-semibold">{inv.dimensions}</span>
          </div>
        )}

        {/* Notes */}
        {inv.notes && (
          <div className="mb-1">
            <span className="text-gray-600">Notes: </span>
            <span className="font-semibold text-sm">{inv.notes}</span>
          </div>
        )}

        {/* Coordinates */}
        <div className="mt-2 pt-2 border-t border-gray-200 text-gray-500 text-xs">
          X: {Math.round(plot.x)}, Y: {Math.round(plot.y)}
        </div>
      </div>
    </div>
  );
}

