import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

export default function OrphanTrackingPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    orphan_vectors: [],
    orphan_orbit: [],
    linked_vectors: [],
    linked_orbit: []
  });
  const [linking, setLinking] = useState(null);
  const [unlinking, setUnlinking] = useState(null);
  const [searchVector, setSearchVector] = useState('');
  const [searchOrbit, setSearchOrbit] = useState('');
  const [showLinked, setShowLinked] = useState(false);

  // Use ref to persist axios instance across renders
  const apiRef = useRef(null);

  // Initialize API instance with auth
  const getApi = useCallback(() => {
    if (!apiRef.current) {
      apiRef.current = axios.create({ baseURL: '/api' });
    }
    // Always set fresh token
    const token = localStorage.getItem('token');
    if (token) {
      apiRef.current.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    return apiRef.current;
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const api = getApi();
      const response = await api.get('/vector/orphan-tracking');
      setData({
        orphan_vectors: response.data.orphan_vectors || [],
        orphan_orbit: response.data.orphan_orbit || [],
        linked_vectors: response.data.linked_vectors || [],
        linked_orbit: response.data.linked_orbit || []
      });
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err.response?.data?.detail || 'Failed to load project data');
    } finally {
      setLoading(false);
    }
  };

  const handleLink = async (vectorId, orbitId, vectorName, orbitName) => {
    if (!orbitId) {
      alert('Please select an ORBIT project to link');
      return;
    }

    if (!confirm(`Link Vector "${vectorName}" to ORBIT "${orbitName}"?\n\nThis will auto-generate SOLD and INVENTORY annotations.`)) {
      return;
    }

    setLinking(vectorId);
    try {
      const api = getApi();
      const formData = new FormData();
      formData.append('linked_project_id', orbitId);
      await api.post(`/vector/projects/${vectorId}/link`, formData);
      alert(`Successfully linked!\n\nVector: ${vectorName}\nORBIT: ${orbitName}\n\nAuto-generated annotations have been created.`);
      loadData();
    } catch (err) {
      console.error('Error linking projects:', err);
      alert('Failed to link projects: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLinking(null);
    }
  };

  const handleUnlink = async (vectorId, vectorName) => {
    if (!confirm(`Unlink Vector "${vectorName}"?\n\nThis will remove the connection to ORBIT.`)) {
      return;
    }

    setUnlinking(vectorId);
    try {
      const api = getApi();
      await api.post(`/vector/projects/${vectorId}/unlink`);
      alert(`Successfully unlinked: ${vectorName}`);
      loadData();
    } catch (err) {
      console.error('Error unlinking project:', err);
      alert('Failed to unlink project: ' + (err.response?.data?.detail || err.message));
    } finally {
      setUnlinking(null);
    }
  };

  // Filter orphan projects based on search
  const filteredOrphanVectors = data.orphan_vectors.filter(vp =>
    !searchVector ||
    (vp.name || '').toLowerCase().includes(searchVector.toLowerCase()) ||
    (vp.map_name || '').toLowerCase().includes(searchVector.toLowerCase())
  );

  const filteredOrphanOrbit = data.orphan_orbit.filter(op =>
    !searchOrbit ||
    (op.name || '').toLowerCase().includes(searchOrbit.toLowerCase()) ||
    (op.project_id || '').toLowerCase().includes(searchOrbit.toLowerCase())
  );

  // Filter linked projects based on search
  const filteredLinkedVectors = data.linked_vectors.filter(vp =>
    !searchVector ||
    (vp.name || '').toLowerCase().includes(searchVector.toLowerCase()) ||
    (vp.linked_orbit_name || '').toLowerCase().includes(searchVector.toLowerCase())
  );

  const filteredLinkedOrbit = data.linked_orbit.filter(op =>
    !searchOrbit ||
    (op.name || '').toLowerCase().includes(searchOrbit.toLowerCase()) ||
    (op.linked_vector_name || '').toLowerCase().includes(searchOrbit.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-8 text-gray-500">Loading project data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          <div className="font-semibold">Error</div>
          <div>{error}</div>
          <button
            onClick={loadData}
            className="mt-2 px-3 py-1 text-sm bg-red-100 hover:bg-red-200 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const totalLinked = data.linked_vectors.length;
  const totalOrphans = data.orphan_vectors.length + data.orphan_orbit.length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Project Linking</h2>
          <p className="text-sm text-gray-500">Connect Vector maps to ORBIT projects for auto-sync</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowLinked(!showLinked)}
            className={`px-3 py-1.5 text-sm rounded flex items-center gap-1 ${
              showLinked ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {showLinked ? 'Hide Linked' : 'Show Linked'} ({totalLinked})
          </button>
          <button
            onClick={loadData}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-1"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-purple-600">{data.orphan_vectors.length}</div>
          <div className="text-sm text-purple-700">Unlinked Vector Maps</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-blue-600">{data.orphan_orbit.length}</div>
          <div className="text-sm text-blue-700">Unlinked ORBIT Projects</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-600">{totalLinked}</div>
          <div className="text-sm text-green-700">Linked Pairs</div>
        </div>
      </div>

      {/* Already Linked Projects */}
      {showLinked && totalLinked > 0 && (
        <div className="bg-white border border-green-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-green-50 border-b">
            <h3 className="font-semibold text-green-800">
              Linked Projects ({totalLinked})
            </h3>
            <p className="text-xs text-green-600 mt-1">
              Vector maps already connected to ORBIT projects
            </p>
          </div>
          <div className="divide-y max-h-60 overflow-y-auto">
            {data.linked_vectors.map(vp => (
              <div key={vp.id} className="p-3 flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-purple-700">{vp.name || 'Unnamed'}</span>
                    <span className="text-gray-400">↔</span>
                    <span className="font-medium text-sm text-blue-700">{vp.linked_orbit_name}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Vector Map linked to ORBIT Project
                  </div>
                </div>
                <button
                  onClick={() => handleUnlink(vp.id, vp.name)}
                  disabled={unlinking === vp.id}
                  className="text-xs px-2 py-1 bg-red-100 text-red-700 hover:bg-red-200 rounded disabled:opacity-50"
                >
                  {unlinking === vp.id ? 'Unlinking...' : 'Unlink'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {totalOrphans === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <div className="text-green-600 text-lg font-semibold">All Projects Linked!</div>
          <div className="text-green-700 text-sm mt-1">All Vector maps are connected to ORBIT projects.</div>
        </div>
      ) : (
        <>
          {/* Vector Projects - Need Linking */}
          {data.orphan_vectors.length > 0 && (
            <div className="bg-white border rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-purple-50 border-b">
                <h3 className="font-semibold text-purple-800">
                  Vector Maps Without ORBIT Link ({data.orphan_vectors.length})
                </h3>
                <p className="text-xs text-purple-600 mt-1">
                  Select an ORBIT project to link each Vector map
                </p>
              </div>

              {/* Search */}
              <div className="p-3 border-b bg-gray-50">
                <input
                  type="text"
                  placeholder="Search Vector maps..."
                  value={searchVector}
                  onChange={(e) => setSearchVector(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded"
                />
              </div>

              <div className="divide-y max-h-80 overflow-y-auto">
                {filteredOrphanVectors.map(vp => (
                  <div key={vp.id} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900">{vp.name || 'Unnamed'}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {vp.map_name && <span className="mr-2">Map: {vp.map_name}</span>}
                          {vp.has_map && <span className="text-green-600">Has PDF</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          className="text-sm border rounded px-3 py-2 min-w-[200px]"
                          defaultValue=""
                          disabled={linking === vp.id}
                          onChange={(e) => {
                            if (e.target.value) {
                              const selectedOrbit = data.orphan_orbit.find(op => op.id === e.target.value);
                              handleLink(vp.id, e.target.value, vp.name, selectedOrbit?.name);
                            }
                          }}
                        >
                          <option value="">Select ORBIT Project...</option>
                          {data.orphan_orbit.map(op => (
                            <option key={op.id} value={op.id}>
                              {op.name} ({op.inventory_count} units, {op.transaction_count} txn)
                            </option>
                          ))}
                        </select>
                        {linking === vp.id && (
                          <span className="text-sm text-gray-500">Linking...</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {filteredOrphanVectors.length === 0 && searchVector && (
                  <div className="p-4 text-center text-gray-500 text-sm">
                    No Vector maps match "{searchVector}"
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ORBIT Projects - Available for Linking */}
          {data.orphan_orbit.length > 0 && (
            <div className="bg-white border rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-blue-50 border-b">
                <h3 className="font-semibold text-blue-800">
                  ORBIT Projects Without Vector Map ({data.orphan_orbit.length})
                </h3>
                <p className="text-xs text-blue-600 mt-1">
                  These projects have inventory but no linked Vector map
                </p>
              </div>

              {/* Search */}
              <div className="p-3 border-b bg-gray-50">
                <input
                  type="text"
                  placeholder="Search ORBIT projects..."
                  value={searchOrbit}
                  onChange={(e) => setSearchOrbit(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded"
                />
              </div>

              <div className="divide-y max-h-60 overflow-y-auto">
                {filteredOrphanOrbit.map(op => (
                  <div key={op.id} className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{op.name}</div>
                      <div className="text-xs text-gray-500">
                        {op.project_id} | {op.inventory_count} inventory | {op.transaction_count} transactions
                      </div>
                    </div>
                    <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded">
                      Needs Vector Map
                    </span>
                  </div>
                ))}
                {filteredOrphanOrbit.length === 0 && searchOrbit && (
                  <div className="p-4 text-center text-gray-500 text-sm">
                    No ORBIT projects match "{searchOrbit}"
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Help Info */}
      <div className="bg-gray-50 border rounded-lg p-4 text-sm text-gray-600">
        <div className="font-semibold mb-2">How Project Linking Works:</div>
        <ul className="space-y-1 list-disc list-inside">
          <li><strong>Vector Maps</strong> contain plot drawings and annotations</li>
          <li><strong>ORBIT Projects</strong> contain inventory, transactions, and customer data</li>
          <li>When linked, <span className="text-red-600 font-medium">SOLD</span> plots are auto-marked in red</li>
          <li>Available <span className="text-green-600 font-medium">INVENTORY</span> plots are auto-marked in green</li>
          <li>Changes in ORBIT automatically update Vector annotations</li>
        </ul>
      </div>
    </div>
  );
}
