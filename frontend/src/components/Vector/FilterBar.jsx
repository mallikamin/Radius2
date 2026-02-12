import React, { useState, useEffect } from 'react';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status', color: '#6b7280' },
  { value: 'available', label: 'Available', color: '#22c55e' },
  { value: 'sold', label: 'Sold', color: '#ef4444' },
  { value: 'buyback_pending', label: 'Buyback', color: '#f97316' },
  { value: 'reserved', label: 'Reserved', color: '#3b82f6' },
  { value: 'booked', label: 'Booked', color: '#8b5cf6' }
];

export default function FilterBar({ vectorState }) {
  const [filteredCount, setFilteredCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const filters = vectorState.plotFilters || {};

  // Update counts from canvas via custom event (no polling)
  useEffect(() => {
    const handler = (e) => {
      setFilteredCount(e.detail.filtered);
      setTotalCount(e.detail.total);
    };
    window.addEventListener('vectorFilterCounts', handler);
    return () => window.removeEventListener('vectorFilterCounts', handler);
  }, []);

  const updateFilter = (key, value) => {
    vectorState.setPlotFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    vectorState.setPlotFilters({
      status: 'all', sizeMin: '', sizeMax: '',
      block: 'all', priceMin: '', priceMax: '', searchPlot: ''
    });
  };

  const hasActiveFilters = (filters.status && filters.status !== 'all') || filters.sizeMin || filters.sizeMax ||
    (filters.block && filters.block !== 'all') || filters.priceMin || filters.priceMax || filters.searchPlot;

  // Get unique blocks from annotations
  const blocks = vectorState.annos?.map(a => a.note || a.cat).filter(Boolean) || [];
  const uniqueBlocks = [...new Set(blocks)];

  // Get status counts
  const statusCounts = {};
  Object.values(vectorState.inventory || {}).forEach(inv => {
    const status = (inv.status || 'unknown').toLowerCase().replace(/\s+/g, '_');
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 bg-white border-b border-gray-200 text-xs"
      style={{ minHeight: '36px' }}
    >
      {/* Status Filter */}
      <select
        value={filters.status || 'all'}
        onChange={(e) => updateFilter('status', e.target.value)}
        className="px-2 py-1 border border-gray-300 rounded text-xs bg-white min-w-[110px]"
      >
        {STATUS_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label} {opt.value !== 'all' && statusCounts[opt.value] ? `(${statusCounts[opt.value]})` : ''}
          </option>
        ))}
      </select>

      {/* Block Filter */}
      {uniqueBlocks.length > 0 && (
        <select
          value={filters.block || 'all'}
          onChange={(e) => updateFilter('block', e.target.value)}
          className="px-2 py-1 border border-gray-300 rounded text-xs bg-white min-w-[100px] max-w-[140px]"
        >
          <option value="all">All Blocks</option>
          {uniqueBlocks.map(b => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      )}

      {/* Size Range */}
      <div className="flex items-center gap-1">
        <span className="text-gray-500">Size:</span>
        <input
          type="number"
          placeholder="Min"
          value={filters.sizeMin || ''}
          onChange={(e) => updateFilter('sizeMin', e.target.value)}
          className="w-14 px-1.5 py-1 border border-gray-300 rounded text-xs"
        />
        <span className="text-gray-400">-</span>
        <input
          type="number"
          placeholder="Max"
          value={filters.sizeMax || ''}
          onChange={(e) => updateFilter('sizeMax', e.target.value)}
          className="w-14 px-1.5 py-1 border border-gray-300 rounded text-xs"
        />
        <span className="text-gray-500">marla</span>
      </div>

      {/* Plot Search */}
      <div className="flex items-center gap-1">
        <input
          type="text"
          placeholder="Plot #"
          value={filters.searchPlot || ''}
          onChange={(e) => updateFilter('searchPlot', e.target.value)}
          className="w-16 px-1.5 py-1 border border-gray-300 rounded text-xs"
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Status Legend (mini) */}
      {vectorState.colorMode === 'status' && (
        <div className="flex items-center gap-2">
          {Object.keys(statusCounts).length === 0 ? (
            <span className="text-gray-400 italic">No inventory data</span>
          ) : (
            STATUS_OPTIONS.filter(s => s.value !== 'all' && statusCounts[s.value]).map(s => (
              <div key={s.value} className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                <span className="text-gray-500">{statusCounts[s.value]}</span>
              </div>
            ))
          )}
        </div>
      )}
      {/* Price mode hint */}
      {vectorState.colorMode === 'price' && Object.keys(vectorState.inventory || {}).length === 0 && (
        <span className="text-gray-400 italic">No price data</span>
      )}

      {/* Results Count */}
      {hasActiveFilters && (
        <span className="text-gray-500 font-medium">
          {filteredCount}/{totalCount} plots
        </span>
      )}

      {/* Clear Filters */}
      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          className="px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 font-medium"
        >
          Clear
        </button>
      )}
    </div>
  );
}
