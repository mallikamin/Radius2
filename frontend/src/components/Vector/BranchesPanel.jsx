import React, { useState } from 'react';
import axios from 'axios';
import ReconciliationPanel from './ReconciliationPanel';

export default function BranchesPanel({ vectorState }) {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [syncResult, setSyncResult] = useState(null);

  // Get sync result from state or local
  const lastSyncResult = syncResult || vectorState.systemBranches?.syncResult;

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  // Sync with ORBIT data - creates separate auto-generated projects
  const handleSync = async () => {
    if (!vectorState.currentProjectId) {
      setError('No project loaded');
      return;
    }

    if (!vectorState.linkedProjectId) {
      setError('Project not linked to an ORBIT project');
      return;
    }

    setSyncing(true);
    setError(null);

    try {
      const api = axios.create({ baseURL: '/api' });
      const token = localStorage.getItem('token');
      if (token) {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }

      // Call the sync endpoint - creates/updates separate auto-generated projects
      const response = await api.post(`/vector/projects/${vectorState.currentProjectId}/sync-branches`);

      if (response.data) {
        const result = {
          statusMapId: response.data.statusMapId,
          customerMapId: response.data.customerMapId,
          autoMasterMapId: response.data.autoMasterMapId,
          statusMapName: response.data.statusMapName,
          customerMapName: response.data.customerMapName,
          autoMasterMapName: response.data.autoMasterMapName,
          soldCount: response.data.soldCount,
          availableCount: response.data.availableCount,
          customerCount: response.data.customerCount,
          masterAnnosCount: response.data.masterAnnosCount,
          unmatchedCount: response.data.unmatchedCount,
          lastSyncAt: new Date().toISOString(),
          message: response.data.message
        };

        setSyncResult(result);

        // Also store in vectorState for persistence
        vectorState.setSystemBranches({ syncResult: result });

        // Refresh project list to show new auto-generated maps
        if (window.refreshProjectList) {
          window.refreshProjectList();
        }

        // Show success message
        if (response.data.needsReconciliation) {
          alert(`${response.data.message}\n\n${response.data.unmatchedCount} items couldn't be matched. Check the Reconciliation section below.`);
        } else {
          alert(`${response.data.message}\n\nOpen the project list (Open button) to load the auto-generated maps.`);
        }
      }
    } catch (err) {
      console.error('Sync error:', err);
      setError(err.response?.data?.detail || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  // Load auto-generated project
  const loadAutoProject = (projectId) => {
    if (window.loadProjectFromDB && projectId) {
      window.loadProjectFromDB(projectId);
    }
  };

  // Cleanup duplicate auto-generated maps
  const handleCleanup = async () => {
    if (!vectorState.currentProjectId) return;

    if (!confirm('This will delete duplicate auto-generated maps and keep only the most recent one of each type. Continue?')) {
      return;
    }

    try {
      const api = axios.create({ baseURL: '/api' });
      const token = localStorage.getItem('token');
      if (token) {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }

      const response = await api.delete(`/vector/projects/${vectorState.currentProjectId}/cleanup-auto-maps`);
      alert(`Cleanup complete: ${response.data.deleted_count} duplicates removed.`);

      // Refresh project list
      if (window.refreshProjectList) {
        window.refreshProjectList();
      }
    } catch (err) {
      console.error('Cleanup error:', err);
      alert('Cleanup failed: ' + (err.response?.data?.detail || err.message));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-semibold">ORBIT Sync</h3>
        <div className="flex gap-2">
          {vectorState.linkedProjectId && (
            <>
              <button
                onClick={handleCleanup}
                className="text-xs px-2 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
                title="Delete duplicate auto-generated maps"
              >
                Cleanup
              </button>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 font-medium"
              >
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Linked Project Info */}
      {vectorState.linkedProjectId ? (
        <div className="p-3 bg-green-50 border border-green-200 rounded">
          <div className="font-semibold text-green-800 text-sm">Linked to ORBIT</div>
          <div className="text-green-700 text-xs mt-1">{vectorState.linkedProjectName || 'Unknown Project'}</div>
        </div>
      ) : (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded text-xs text-gray-600">
          Not linked to an ORBIT project. Link via Settings to enable sync.
        </div>
      )}

      {/* Current Project Info */}
      <div className="p-3 bg-indigo-50 border border-indigo-200 rounded">
        <div className="font-semibold text-indigo-800 text-sm">This Project (Master)</div>
        <div className="text-indigo-700 text-xs mt-1">
          {vectorState.annos?.length || 0} annotations - Your manual work, never modified by sync
        </div>
      </div>

      {/* Sync Results */}
      {lastSyncResult && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-700 mt-4">Auto-Generated Maps:</div>

          {/* Status Map */}
          {lastSyncResult.statusMapId && (
            <div
              className="p-3 bg-red-50 border border-red-200 rounded cursor-pointer hover:bg-red-100 transition-colors"
              onClick={() => loadAutoProject(lastSyncResult.statusMapId)}
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-semibold text-red-800 text-sm">Status Map</div>
                  <div className="text-red-700 text-xs mt-1">
                    SOLD vs AVAILABLE
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs">
                    <span className="text-red-600 font-semibold">{lastSyncResult.soldCount || 0}</span> sold
                  </div>
                  <div className="text-xs">
                    <span className="text-green-600 font-semibold">{lastSyncResult.availableCount || 0}</span> available
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-gray-500 mt-2">Click to load this map</div>
            </div>
          )}

          {/* Customer Map */}
          {lastSyncResult.customerMapId && (
            <div
              className="p-3 bg-orange-50 border border-orange-200 rounded cursor-pointer hover:bg-orange-100 transition-colors"
              onClick={() => loadAutoProject(lastSyncResult.customerMapId)}
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-semibold text-orange-800 text-sm">Customer Map</div>
                  <div className="text-orange-700 text-xs mt-1">
                    Each customer with unique color
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs">
                    <span className="text-orange-600 font-semibold">{lastSyncResult.customerCount || 0}</span> customers
                  </div>
                  <div className="text-xs">
                    <span className="text-green-600 font-semibold">{lastSyncResult.availableCount || 0}</span> available
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-gray-500 mt-2">Click to load this map</div>
            </div>
          )}

          {/* Automated Master */}
          {lastSyncResult.autoMasterMapId && (
            <div
              className="p-3 bg-purple-50 border border-purple-200 rounded cursor-pointer hover:bg-purple-100 transition-colors"
              onClick={() => loadAutoProject(lastSyncResult.autoMasterMapId)}
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-semibold text-purple-800 text-sm">Master [Auto]</div>
                  <div className="text-purple-700 text-xs mt-1">
                    Synced copy of your annotations
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs">
                    <span className="text-purple-600 font-semibold">{lastSyncResult.masterAnnosCount || 0}</span> annotations
                  </div>
                  <div className="text-xs text-gray-500">
                    Auto-updated
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-gray-500 mt-2">Click to load • Preserves your annotations + ORBIT data</div>
            </div>
          )}

          {/* Last Sync Info */}
          {lastSyncResult.lastSyncAt && (
            <div className="text-[10px] text-gray-400 text-right">
              Last sync: {formatDate(lastSyncResult.lastSyncAt)}
            </div>
          )}

          {/* Unmatched Warning */}
          {lastSyncResult.unmatchedCount > 0 && (
            <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
              {lastSyncResult.unmatchedCount} ORBIT items couldn't be matched to Vector plots.
              Use the Reconciliation section below to map them manually.
            </div>
          )}
        </div>
      )}

      {/* How it works */}
      <div className="text-xs text-gray-500 mt-4 p-2 bg-blue-50 border border-blue-100 rounded">
        <strong>How it works:</strong>
        <ul className="list-disc list-inside mt-1 space-y-1">
          <li><strong>This project</strong> = Your original work (unchanged)</li>
          <li><strong>Status Map</strong> = SOLD vs AVAILABLE</li>
          <li><strong>Customer Map</strong> = Customer-wise breakdown</li>
          <li><strong>Master [Auto]</strong> = Your annotations + ORBIT status</li>
        </ul>
        <div className="mt-2">Click "Sync Now" to create/update all auto-generated maps.</div>
      </div>

      {/* Reconciliation Section */}
      {vectorState.linkedProjectId && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <ReconciliationPanel vectorState={vectorState} />
        </div>
      )}
    </div>
  );
}
