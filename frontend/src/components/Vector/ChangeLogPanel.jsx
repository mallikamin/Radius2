import React, { useState, useMemo } from 'react';

export default function ChangeLogPanel({ vectorState }) {
  const [filterAction, setFilterAction] = useState('all');

  const filteredLogs = useMemo(() => {
    if (filterAction === 'all') {
      return vectorState.changeLog;
    }
    return vectorState.changeLog.filter(log => log.action === filterAction);
  }, [vectorState.changeLog, filterAction]);

  const uniqueActions = useMemo(() => {
    const actions = new Set(vectorState.changeLog.map(log => log.action));
    return Array.from(actions).sort();
  }, [vectorState.changeLog]);

  const handleExport = () => {
    const logText = filteredLogs.map(log => {
      const date = new Date(log.timestamp).toLocaleString();
      return `[${date}] ${log.action}: ${log.details}`;
    }).join('\n');

    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `changelog_${vectorState.projectName || 'project'}_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    if (confirm('Clear all change log entries? This cannot be undone.')) {
      vectorState.clearChangeLog();
    }
  };

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-semibold">
          Change Log ({filteredLogs.length})
        </h3>
        <div className="flex gap-1">
          <button
            onClick={handleExport}
            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            title="Export"
          >
            📥
          </button>
          <button
            onClick={handleClear}
            className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
            title="Clear"
          >
            🗑️
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-700">Filter by Action</label>
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
        >
          <option value="all">All Actions</option>
          {uniqueActions.map(action => (
            <option key={action} value={action}>{action}</option>
          ))}
        </select>
      </div>

      {/* Change Log List */}
      <div className="max-h-96 overflow-y-auto border border-gray-200 rounded p-2 space-y-2">
        {filteredLogs.length === 0 ? (
          <div className="text-xs text-gray-500 text-center py-4">
            No change log entries yet.
          </div>
        ) : (
          filteredLogs.slice().reverse().map((log, idx) => (
            <div
              key={idx}
              className="p-2 bg-gray-50 rounded text-xs hover:bg-gray-100"
            >
              <div className="flex items-start justify-between mb-1">
                <div className="flex-1">
                  <div className="font-medium text-gray-700">{log.action}</div>
                  <div className="text-gray-600 mt-1">{log.details}</div>
                  <div className="text-gray-500 text-xs mt-1">
                    {formatDate(log.timestamp)}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Instructions */}
      <div className="text-xs text-gray-500 border-t border-gray-200 pt-3">
        <div className="font-medium mb-1">About Change Log:</div>
        <ul className="list-disc list-inside space-y-1">
          <li>Tracks all changes made to the project</li>
          <li>Filter by action type using the dropdown</li>
          <li>Export to text file for backup</li>
          <li>Most recent entries appear first</li>
        </ul>
      </div>
    </div>
  );
}

