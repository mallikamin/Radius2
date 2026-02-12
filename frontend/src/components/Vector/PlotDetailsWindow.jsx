import React, { useState, useEffect, useRef } from 'react';
import { exportPlotDetailsToPDF, exportProposalPDF } from '../../utils/exportUtils';

const STATUS_BADGES = {
  available: { bg: 'bg-green-100', text: 'text-green-700', label: 'Available' },
  sold: { bg: 'bg-red-100', text: 'text-red-700', label: 'Sold' },
  buyback_pending: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Buyback' },
  reserved: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Reserved' },
  booked: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Booked' }
};

export default function PlotDetailsWindow({ vectorState }) {
  const [visible, setVisible] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [plotId, setPlotId] = useState(null);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [crmData, setCrmData] = useState(null);
  const [loadingCrm, setLoadingCrm] = useState(false);
  const windowRef = useRef(null);

  // Format currency
  const formatCurrency = (amount) => {
    if (!amount) return 'PKR 0';
    return 'PKR ' + parseFloat(amount).toLocaleString('en-PK', { maximumFractionDigits: 0 });
  };

  // Format percentage
  const formatPercent = (paid, total) => {
    if (!paid || !total) return '0%';
    return Math.round((parseFloat(paid) / parseFloat(total)) * 100) + '%';
  };

  // Show plot details - only sets state, CRM fetch handled by useEffect below
  const showPlotDetails = (id) => {
    setPlotId(id);
    setVisible(true);
    setMinimized(false);
    setCrmData(null);
  };

  // Fetch CRM data when plotId changes (avoids stale closure over vectorState)
  useEffect(() => {
    if (!plotId) return;
    const plot = vectorState.plots.find(p => p.id === plotId);
    if (!plot) return;
    const inv = vectorState.inventory[plot.n];
    if (inv && (inv.transactionId || inv.customerId || inv.inventoryId)) {
      fetchCrmData(inv);
    }
  }, [plotId, vectorState.plots, vectorState.inventory]);

  // Fetch extended CRM data from backend
  const fetchCrmData = async (inv) => {
    setLoadingCrm(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      // Try to fetch transaction details if we have a transaction ID
      if (inv.transactionId) {
        const resp = await fetch(`/api/transactions/${inv.transactionId}`, { headers });
        if (resp.ok) {
          const txn = await resp.json();
          setCrmData(txn);
          return;
        }
      }

      // Try inventory endpoint if we have inventory ID
      if (inv.inventoryId) {
        const resp = await fetch(`/api/inventory/${inv.inventoryId}`, { headers });
        if (resp.ok) {
          const invData = await resp.json();
          setCrmData(invData);
          return;
        }
      }
    } catch (err) {
      console.warn('Could not fetch CRM data:', err.message);
    } finally {
      setLoadingCrm(false);
    }
  };

  // Get plot details
  const getPlotDetails = () => {
    if (!plotId) return null;
    const plot = vectorState.plots.find(p => p.id === plotId);
    if (!plot) return null;
    const inv = vectorState.inventory[plot.n] || {};
    const anno = vectorState.annos.find(a => a.plotIds.some(pid => String(pid) === String(plot.id)));
    return { plot, inv, anno };
  };

  // Handle drag
  const handleDragStart = (e) => {
    if (e.target.closest('button')) return;
    setIsDragging(true);
    const rect = windowRef.current.getBoundingClientRect();
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    e.preventDefault();
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e) => {
      const maxX = window.innerWidth - (windowRef.current?.offsetWidth || 0);
      const maxY = window.innerHeight - (windowRef.current?.offsetHeight || 0);
      setPosition({
        x: Math.max(0, Math.min(maxX, e.clientX - dragOffset.x)),
        y: Math.max(0, Math.min(maxY, e.clientY - dragOffset.y))
      });
    };
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // Expose globally - showPlotDetails only uses React setters so it's stable
  useEffect(() => {
    window.onShowPlotDetails = showPlotDetails;
    return () => { window.onShowPlotDetails = null; };
  }, [showPlotDetails]);

  const details = getPlotDetails();
  if (!visible || !details) return null;
  const { plot, inv, anno } = details;

  // Status badge
  const statusKey = (inv.status || '').toLowerCase().replace(/\s+/g, '_');
  const badge = STATUS_BADGES[statusKey];

  // GPS coordinates from project metadata
  const gps = vectorState.projectMetadata?.gpsCoordinates;

  return (
    <div
      ref={windowRef}
      className={`fixed bg-white border border-gray-300 rounded-lg shadow-lg z-30 ${
        minimized ? 'min-w-[240px]' : 'min-w-[260px] max-w-[320px]'
      }`}
      style={{ left: `${position.x}px`, top: `${position.y}px`, display: visible ? 'block' : 'none' }}
    >
      {/* Header */}
      <div
        className="bg-gray-800 text-white px-3 py-2 rounded-t-lg flex justify-between items-center cursor-move select-none"
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2">
          <span className="font-bold text-base">Plot {plot.n}</span>
          {badge && (
            <span className={`px-1.5 py-0.5 text-[10px] rounded font-semibold ${badge.bg} ${badge.text}`}>
              {badge.label}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setMinimized(!minimized)} className="text-white hover:opacity-100 opacity-70 text-xs px-1">−</button>
          <button onClick={() => setVisible(false)} className="text-white hover:opacity-100 opacity-70 text-xs px-1">×</button>
        </div>
      </div>

      {!minimized && (
        <>
          <div className="p-3 max-h-[350px] overflow-y-auto text-xs space-y-2">

            {/* Annotation */}
            {anno && (
              <div className="flex items-center gap-2 p-2 rounded" style={{ backgroundColor: anno.color + '15' }}>
                <div className="w-3 h-3 rounded" style={{ backgroundColor: anno.color }} />
                <span className="font-semibold text-gray-800">{anno.note || anno.cat}</span>
                <span className="text-gray-500 ml-auto">{anno.plotIds.length} plots</span>
              </div>
            )}

            {/* Plot Info Section */}
            {(inv.marla || inv.dimensions) && (
              <div className="bg-gray-50 rounded p-2 space-y-1">
                {inv.marla && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Area</span>
                    <span className="font-semibold">{inv.marla} Marla</span>
                  </div>
                )}
                {inv.dimensions && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Dimensions</span>
                    <span className="font-semibold">{inv.dimensions}</span>
                  </div>
                )}
              </div>
            )}

            {/* Pricing Section */}
            {(inv.totalValue || inv.ratePerMarla) && (
              <div className="bg-blue-50 rounded p-2 space-y-1">
                {inv.totalValue && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Total Value</span>
                    <span className="font-bold text-blue-800">{formatCurrency(inv.totalValue)}</span>
                  </div>
                )}
                {inv.ratePerMarla && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Rate / Marla</span>
                    <span className="font-semibold">{formatCurrency(inv.ratePerMarla)}</span>
                  </div>
                )}
              </div>
            )}

            {/* CRM Data - Customer/Transaction */}
            {(inv.customerName || inv.customer || crmData?.customer_name) && (
              <div className="bg-amber-50 rounded p-2 space-y-1">
                <div className="font-semibold text-amber-800 text-[11px] mb-1">Customer</div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Name</span>
                  <span className="font-semibold">{inv.customerName || inv.customer || crmData?.customer_name}</span>
                </div>
                {(inv.customerId || crmData?.customer_id) && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">ID</span>
                    <span className="font-mono text-[10px]">{inv.customerId || crmData?.customer_id}</span>
                  </div>
                )}
              </div>
            )}

            {/* Broker info */}
            {(inv.brokerName || inv.broker || crmData?.broker_name) && (
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span className="text-gray-500">Broker</span>
                <span className="font-semibold">{inv.brokerName || inv.broker || crmData?.broker_name}</span>
              </div>
            )}

            {/* Payment Progress */}
            {(inv.amountPaid || inv.amountPending || crmData?.amount_paid) && (
              <div className="bg-green-50 rounded p-2 space-y-1">
                <div className="font-semibold text-green-800 text-[11px] mb-1">Payment Status</div>
                {(inv.amountPaid || crmData?.amount_paid) && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Paid</span>
                    <span className="font-semibold text-green-700">
                      {formatCurrency(inv.amountPaid || crmData?.amount_paid)}
                      {inv.totalValue && (
                        <span className="text-gray-400 ml-1">
                          ({formatPercent(inv.amountPaid || crmData?.amount_paid, inv.totalValue)})
                        </span>
                      )}
                    </span>
                  </div>
                )}
                {(inv.amountPending || crmData?.amount_pending) && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Pending</span>
                    <span className="font-semibold text-red-600">{formatCurrency(inv.amountPending || crmData?.amount_pending)}</span>
                  </div>
                )}
                {(inv.nextDueDate || crmData?.next_due_date) && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Next Due</span>
                    <span className="font-semibold">{inv.nextDueDate || crmData?.next_due_date}</span>
                  </div>
                )}
                {/* Progress bar */}
                {inv.amountPaid && inv.totalValue && (
                  <div className="mt-1">
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className="bg-green-500 h-1.5 rounded-full"
                        style={{ width: `${Math.min(100, (parseFloat(inv.amountPaid) / parseFloat(inv.totalValue)) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Transaction ID */}
            {(inv.transactionId || crmData?.transaction_id) && (
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span className="text-gray-500">Transaction</span>
                <span className="font-mono text-[10px]">{inv.transactionId || crmData?.transaction_id}</span>
              </div>
            )}

            {/* Owner */}
            {inv.owner && !inv.customerName && !inv.customer && (
              <div className="flex justify-between">
                <span className="text-gray-500">Owner</span>
                <span className="font-semibold">{inv.owner}</span>
              </div>
            )}

            {/* Notes */}
            {inv.notes && (
              <div className="p-2 bg-yellow-50 rounded">
                <span className="text-gray-500">Notes: </span>
                <span>{inv.notes}</span>
              </div>
            )}

            {/* CRM Loading */}
            {loadingCrm && (
              <div className="text-center text-gray-400 py-2">Loading CRM data...</div>
            )}

            {/* No data */}
            {!anno && !inv.marla && !inv.totalValue && !inv.status && !inv.owner && (
              <div className="text-gray-400 text-center py-3">
                No inventory data linked
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="px-3 py-2 border-t border-gray-200 bg-gray-50 space-y-1.5">
            <div className="flex gap-2">
              <button
                onClick={() => window.zoomToPlot?.(plot.id)}
                className="flex-1 px-2 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 font-medium"
              >
                Zoom
              </button>
              <button
                onClick={() => {
                  const lines = [`Plot: ${plot.n}`];
                  if (inv.status) lines.push(`Status: ${inv.status}`);
                  if (anno) lines.push(`Block: ${anno.note}`);
                  if (inv.marla) lines.push(`Area: ${inv.marla} Marla`);
                  if (inv.totalValue) lines.push(`Value: ${formatCurrency(inv.totalValue)}`);
                  if (inv.ratePerMarla) lines.push(`Rate: ${formatCurrency(inv.ratePerMarla)}/marla`);
                  if (inv.customerName || inv.customer) lines.push(`Customer: ${inv.customerName || inv.customer}`);
                  if (inv.owner) lines.push(`Owner: ${inv.owner}`);
                  navigator.clipboard.writeText(lines.join('\n'));
                }}
                className="flex-1 px-2 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 font-medium"
              >
                Copy
              </button>
              {/* Google Maps */}
              {gps && gps.lat && gps.lng && !isNaN(parseFloat(gps.lat)) && !isNaN(parseFloat(gps.lng)) && (
                <button
                  onClick={() => {
                    const url = `https://www.google.com/maps?q=${gps.lat},${gps.lng}`;
                    window.open(url, '_blank');
                  }}
                  className="flex-1 px-2 py-1.5 text-xs bg-teal-600 text-white rounded hover:bg-teal-700 font-medium"
                  title={gps.label || 'View project location on Google Maps'}
                >
                  Google Maps
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const plotsToExport = vectorState.selected.size > 0
                    ? Array.from(vectorState.selected).map(id => vectorState.plots.find(p => p.id === id)).filter(Boolean)
                    : [plot];
                  exportPlotDetailsToPDF(plotsToExport, vectorState);
                }}
                className="flex-1 px-2 py-1.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 font-medium"
              >
                PDF {vectorState.selected.size > 0 ? `(${vectorState.selected.size})` : ''}
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
                className="flex-1 px-2 py-1.5 text-xs bg-orange-600 text-white rounded hover:bg-orange-700 font-medium"
              >
                Proposal
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
