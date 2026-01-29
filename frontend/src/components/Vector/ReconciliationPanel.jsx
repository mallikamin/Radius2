import React, { useState, useRef } from 'react';
import axios from 'axios';

export default function ReconciliationPanel({ vectorState }) {
  const [loading, setLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [mappingCount, setMappingCount] = useState(0);
  const fileInputRef = useRef(null);

  const api = axios.create({ baseURL: '/api' });
  const token = localStorage.getItem('token');
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  // Get reconciliation data from systemBranches
  const reconciliation = vectorState.systemBranches?.reconciliation || {};
  const unmatchedItems = reconciliation.unmatched || [];
  const matchedItems = reconciliation.matched || [];
  const orbitBranch = vectorState.systemBranches?.orbit || {};

  // Download reconciliation template
  const handleDownloadTemplate = async () => {
    if (!vectorState.currentProjectId) {
      alert('No project loaded');
      return;
    }

    setLoading(true);
    try {
      const response = await api.get(
        `/vector/projects/${vectorState.currentProjectId}/reconciliation/template`,
        { responseType: 'blob' }
      );

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `reconciliation_template_${vectorState.projectName || 'project'}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
      alert('Failed to download template: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  // Upload completed mapping
  const handleUploadMapping = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!vectorState.currentProjectId) {
      alert('No project loaded');
      return;
    }

    setLoading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post(
        `/vector/projects/${vectorState.currentProjectId}/reconciliation/upload`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      setUploadResult({
        success: true,
        message: response.data.message,
        mappedCount: response.data.mappedCount,
        skippedCount: response.data.skippedCount
      });
      setMappingCount(response.data.mappedCount);

      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('Upload error:', err);
      setUploadResult({
        success: false,
        message: err.response?.data?.detail || err.message
      });
    } finally {
      setLoading(false);
    }
  };

  // Clear mappings
  const handleClearMappings = async () => {
    if (!vectorState.currentProjectId) return;

    if (!confirm('Are you sure you want to clear all mappings?')) return;

    setLoading(true);
    try {
      await api.delete(`/vector/projects/${vectorState.currentProjectId}/reconciliation/mapping`);
      setMappingCount(0);
      setUploadResult(null);
      alert('Mappings cleared successfully');
    } catch (err) {
      console.error('Clear error:', err);
      alert('Failed to clear mappings: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  // Load current mapping count on mount
  React.useEffect(() => {
    const loadMappingCount = async () => {
      if (!vectorState.currentProjectId) return;
      try {
        const response = await api.get(
          `/vector/projects/${vectorState.currentProjectId}/reconciliation/mapping`
        );
        setMappingCount(response.data.count || 0);
      } catch (err) {
        console.error('Failed to load mapping count:', err);
      }
    };
    loadMappingCount();
  }, [vectorState.currentProjectId]);

  if (!vectorState.linkedProjectId) {
    return (
      <div className="p-3 bg-gray-50 border border-gray-200 rounded text-xs text-gray-600">
        Link this project to an ORBIT project first to enable reconciliation.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Plot-Inventory Reconciliation</h3>

      {/* Status Summary */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2 bg-green-50 border border-green-200 rounded">
          <div className="font-semibold text-green-800">Matched</div>
          <div className="text-lg text-green-700">{matchedItems.length}</div>
        </div>
        <div className="p-2 bg-amber-50 border border-amber-200 rounded">
          <div className="font-semibold text-amber-800">Unmatched</div>
          <div className="text-lg text-amber-700">{unmatchedItems.length}</div>
        </div>
      </div>

      {/* Manual Mapping Count */}
      {mappingCount > 0 && (
        <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs">
          <span className="text-blue-800">📋 {mappingCount} manual mappings configured</span>
          <button
            onClick={handleClearMappings}
            disabled={loading}
            className="ml-2 text-red-600 hover:text-red-800 underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* Instructions */}
      <div className="p-2 bg-gray-50 border border-gray-200 rounded text-xs text-gray-700">
        <p className="font-semibold mb-1">How to reconcile:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Download the template CSV below</li>
          <li>Fill in the <code className="bg-gray-200 px-1">inventory_id</code> column for each plot</li>
          <li>Upload the completed file</li>
          <li>Click "Sync" to apply the mapping</li>
        </ol>
      </div>

      {/* Download Template Button */}
      <button
        onClick={handleDownloadTemplate}
        disabled={loading}
        className="w-full px-3 py-2 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Loading...' : '📥 Download Reconciliation Template'}
      </button>

      {/* Upload Mapping */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleUploadMapping}
          className="hidden"
          id="reconciliation-upload"
        />
        <label
          htmlFor="reconciliation-upload"
          className={`block w-full px-3 py-2 text-xs text-center rounded cursor-pointer ${
            loading
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          {loading ? 'Uploading...' : '📤 Upload Completed Mapping'}
        </label>
      </div>

      {/* Upload Result */}
      {uploadResult && (
        <div className={`p-2 rounded text-xs ${
          uploadResult.success
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {uploadResult.success ? '✅' : '❌'} {uploadResult.message}
        </div>
      )}

      {/* Unmatched Items Preview */}
      {unmatchedItems.length > 0 && (
        <div className="border border-amber-200 rounded overflow-hidden">
          <div className="bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
            Unmatched ORBIT Items ({unmatchedItems.length})
          </div>
          <div className="max-h-32 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-2 py-1 text-left">Unit</th>
                  <th className="px-2 py-1 text-left">Block</th>
                  <th className="px-2 py-1 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {unmatchedItems.slice(0, 20).map((item, idx) => (
                  <tr key={idx} className="border-t border-gray-100">
                    <td className="px-2 py-1">{item.unit}</td>
                    <td className="px-2 py-1">{item.block || '-'}</td>
                    <td className="px-2 py-1">
                      <span className={item.status === 'sold' ? 'text-red-600' : 'text-green-600'}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {unmatchedItems.length > 20 && (
              <div className="px-2 py-1 text-xs text-gray-500 text-center border-t">
                ... and {unmatchedItems.length - 20} more
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
