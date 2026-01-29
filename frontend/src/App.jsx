import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import VectorMap from './components/Vector/VectorMap';
import OrphanTrackingPanel from './components/OrphanTrackingPanel';

const api = axios.create({ baseURL: '/api' });
const formatCurrency = (n) => new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(n || 0);

// ============================================
// AUTHENTICATION - LOGIN VIEW
// ============================================
function LoginView({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('username', username);
      formData.append('password', password);
      const res = await api.post('/auth/login', formData);
      localStorage.setItem('token', res.data.access_token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      api.defaults.headers.common['Authorization'] = `Bearer ${res.data.access_token}`;
      onLogin(res.data.user);
    } catch (e) {
      setError(e.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">ORBIT</h1>
        <p className="text-gray-600 mb-8">Sign in to your account</p>
        
        {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username / Email / Mobile</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="Enter your rep_id (e.g., REP-0002)"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="Enter your password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white py-2 px-4 rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        
        <p className="mt-6 text-xs text-gray-500 text-center">
          First time? Use your rep_id as username and any password
        </p>
      </div>
    </div>
  );
}

// ============================================
// MAIN APP
// ============================================
export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('projects');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  
  // Expose setActiveTab for Vector navigation
  useEffect(() => {
    window.setActiveTab = setActiveTab;
    return () => {
      window.setActiveTab = null;
    };
  }, []);
  
  // Check for existing login on mount - MUST be before any conditional returns
  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) {
      try {
        const userData = JSON.parse(savedUser);
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        // Verify token is still valid
        api.get('/auth/me').then(res => {
          setUser(res.data);
          setCheckingAuth(false);
        }).catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setCheckingAuth(false);
        });
      } catch (e) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setCheckingAuth(false);
      }
    } else {
      setCheckingAuth(false);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
  };
  
  // Check for existing login on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) {
      try {
        const userData = JSON.parse(savedUser);
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        // Verify token is still valid
        api.get('/auth/me').then(res => {
          setUser(res.data);
        }).catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        });
      } catch (e) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
  }, []);

  // Close dropdown when clicking outside - MUST be before conditional returns
  useEffect(() => {
    if (!showMoreMenu) return;
    
    const handleClickOutside = (event) => {
      const target = event.target;
      const menuElement = document.querySelector('.more-menu-container');
      const buttonElement = document.querySelector('.more-menu-button');
      
      if (menuElement && buttonElement && 
          !menuElement.contains(target) && 
          !buttonElement.contains(target)) {
        setShowMoreMenu(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMoreMenu]);

  // Show login if not authenticated
  if (!user) {
    return <LoginView onLogin={setUser} />;
  }
  
  // Role-based access control
  const canAccess = (tabId) => {
    if (!user) return false;
    const role = user.role || 'user';
    
    // Admin can access everything
    if (role === 'admin') return true;
    
    // Role-based access rules
    const roleAccess = {
      admin: ['dashboard', 'projects', 'inventory', 'transactions', 'receipts', 'payments', 'reports', 'interactions', 'customers', 'brokers', 'campaigns', 'media', 'vector', 'settings'],
      manager: ['dashboard', 'projects', 'inventory', 'transactions', 'receipts', 'payments', 'reports', 'interactions', 'customers', 'brokers', 'media', 'vector'],
      user: ['dashboard', 'projects', 'inventory', 'transactions', 'receipts', 'interactions', 'customers', 'media', 'vector'],
      viewer: ['dashboard', 'projects', 'inventory', 'transactions', 'receipts', 'media', 'vector']
    };
    
    return roleAccess[role]?.includes(tabId) || false;
  };
  
  // Primary tabs - always visible
  const primaryTabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'projects', label: 'Projects' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'transactions', label: 'Transactions' }
  ].filter(tab => canAccess(tab.id));
  
  // Financial menu items
  const financialTabs = [
    { id: 'receipts', label: 'Receipts' },
    { id: 'payments', label: 'Payments' },
    { id: 'reports', label: 'Reports' }
  ].filter(tab => canAccess(tab.id));
  
  // Management menu items
  const managementTabs = [
    { id: 'interactions', label: 'Interactions' },
    { id: 'customers', label: 'Customers' },
    { id: 'brokers', label: 'Brokers' },
    { id: 'campaigns', label: 'Campaigns' },
    { id: 'media', label: 'Media Library' },
    { id: 'vector', label: 'Vector' }
  ].filter(tab => canAccess(tab.id));
  
  // All tabs for reference
  const allTabs = [...primaryTabs, ...financialTabs, ...managementTabs];
  if (canAccess('settings')) allTabs.push({ id: 'settings', label: 'Settings' });
  
  // Show loading while checking auth, then show login if not authenticated
  // ALL HOOKS MUST BE ABOVE THIS POINT
  if (checkingAuth) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-600">Loading...</div></div>;
  }
  
  if (!user) {
    return <LoginView onLogin={setUser} />;
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">ORBIT</h1>
          <nav className="flex items-center gap-2">
            <div className="text-sm text-gray-600 mr-4">
              {user.name} <span className="text-gray-400">({user.role})</span>
            </div>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            >
              Logout
            </button>
            {/* Primary tabs */}
            <div className="flex gap-1">
              {primaryTabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}>
                  {tab.label}
                </button>
              ))}
            </div>
            
            {/* More menu dropdown */}
            <div className="relative">
              <button 
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className={`more-menu-button px-3 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${showMoreMenu || financialTabs.some(t => t.id === activeTab) || managementTabs.some(t => t.id === activeTab) ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}>
                More
              </button>
              
              {showMoreMenu && (
                <div className="more-menu-container absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                  <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Financial</div>
                  {financialTabs.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => { setActiveTab(tab.id); setShowMoreMenu(false); }}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors ${activeTab === tab.id ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                      {tab.label}
                    </button>
                  ))}
                  <div className="border-t border-gray-100 my-1"></div>
                  <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Management</div>
                  {managementTabs.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => { setActiveTab(tab.id); setShowMoreMenu(false); }}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors ${activeTab === tab.id ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* Settings button - less prominent */}
            <button 
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${activeTab === 'settings' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}>
              Settings
            </button>
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'dashboard' && <DashboardView />}
        {activeTab === 'projects' && <ProjectsView />}
        {activeTab === 'inventory' && <InventoryView />}
        {activeTab === 'transactions' && <TransactionsView />}
        {activeTab === 'receipts' && <ReceiptsView />}
        {activeTab === 'payments' && <PaymentsView />}
        {activeTab === 'reports' && <ReportsView />}
        {activeTab === 'interactions' && <InteractionsView />}
        {activeTab === 'customers' && <CustomersView />}
        {activeTab === 'brokers' && <BrokersView />}
        {activeTab === 'campaigns' && <CampaignsView />}
        {activeTab === 'media' && <MediaView />}
        {activeTab === 'vector' && <VectorView />}
        {activeTab === 'settings' && <SettingsView />}
      </main>
    </div>
  );
}

// ============================================
// PROJECTS VIEW
// ============================================
function ProjectsView() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [form, setForm] = useState({ name: '', location: '', description: '' });

  useEffect(() => { loadProjects(); }, []);
  const loadProjects = async () => {
    try { const res = await api.get('/projects'); setProjects(res.data); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try { await api.post('/projects', form); setShowModal(false); setForm({ name: '', location: '', description: '' }); loadProjects(); }
    catch (e) { alert(e.response?.data?.detail || 'Error'); }
  };

  const handleProjectClick = async (projectId) => {
    try {
      const res = await api.get(`/projects/${projectId}`);
      setSelectedProject(res.data);
      setShowDetailModal(true);
    } catch (e) {
      console.error('Error loading project details:', e);
      alert('Error loading project details');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold text-gray-900">Projects</h2>
          <p className="text-sm text-gray-500 mt-1">Overview of all projects</p></div>
        <button onClick={() => setShowModal(true)} className="bg-gray-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-800">Add Project</button>
      </div>

      {loading ? <Loader /> : projects.length === 0 ? <Empty msg="No projects yet" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map(p => (
            <div 
              key={p.id} 
              onClick={() => handleProjectClick(p.id)}
              className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
            >
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="text-xs font-mono text-gray-400">{p.project_id}</div>
                    <div className="text-lg font-semibold text-gray-900">{p.name}</div>
                    <div className="text-sm text-gray-500">{p.location}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div><div className="text-xs text-gray-400">Available</div><div className="text-xl font-semibold text-green-600">{p.stats?.available || 0}</div></div>
                  <div><div className="text-xs text-gray-400">Sold</div><div className="text-xl font-semibold text-blue-600">{p.stats?.sold || 0}</div></div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><div className="text-xs text-gray-400">Total Units</div><div className="font-medium">{p.stats?.total_units || 0}</div></div>
                  <div><div className="text-xs text-gray-400">Avg Rate</div><div className="font-medium">{formatCurrency(p.stats?.avg_rate)}</div></div>
                </div>
              </div>
              <div className="bg-gray-50 px-5 py-3 border-t border-gray-100">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Value</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(p.stats?.total_value)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title="Add Project" onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Name" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            <Input label="Location" value={form.location} onChange={e => setForm({...form, location: e.target.value})} />
            <Input label="Description" value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg">Create</button>
            </div>
          </form>
        </Modal>
      )}

      {showDetailModal && selectedProject && (
        <Modal title={`Project: ${selectedProject.name}`} onClose={() => { setShowDetailModal(false); setSelectedProject(null); }}>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Project ID</label>
                <div className="text-sm text-gray-900">{selectedProject.project_id}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
                <div className="text-sm text-gray-900">{selectedProject.location || '-'}</div>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                <div className="text-sm text-gray-900">{selectedProject.description || '-'}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                <div className="text-sm text-gray-900">{selectedProject.status || 'active'}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Inventory Units</label>
                <div className="text-sm text-gray-900">{selectedProject.inventory?.length || 0}</div>
              </div>
            </div>

            {/* Media Attachments */}
            <div className="border-t pt-4">
              <MediaManager 
                entityType="project" 
                entityId={selectedProject.id || selectedProject.project_id}
                onUpload={() => {}}
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================
// INVENTORY VIEW
// ============================================
function InventoryView() {
  const [inventory, setInventory] = useState([]);
  const [projects, setProjects] = useState([]);
  const [summary, setSummary] = useState(null);
  const [filter, setFilter] = useState({ project_id: '', status: '' });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showSellModal, setShowSellModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [form, setForm] = useState({ project_id: '', unit_number: '', unit_type: 'plot', block: '', area_marla: '', rate_per_marla: '', factor_details: '', notes: '' });
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);

  useEffect(() => { loadData(); }, [filter]);
  const loadData = async () => {
    try {
      const [invRes, projRes, sumRes] = await Promise.all([
        api.get('/inventory', { params: filter }),
        api.get('/projects'),
        api.get('/inventory/summary')
      ]);
      setInventory(invRes.data);
      setProjects(projRes.data);
      setSummary(sumRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try { await api.post('/inventory', form); setShowModal(false); setForm({ project_id: '', unit_number: '', unit_type: 'plot', block: '', area_marla: '', rate_per_marla: '', factor_details: '', notes: '' }); loadData(); }
    catch (e) { alert(e.response?.data?.detail || 'Error'); }
  };

  const handleImport = async () => {
    if (!importFile) return;
    const fd = new FormData(); fd.append('file', importFile);
    try { const res = await api.post('/inventory/bulk-import', fd); setImportResult(res.data); setImportFile(null); loadData(); }
    catch (e) { setImportResult({ success: 0, errors: [e.message] }); }
  };

  const openSellModal = (item) => { setSelectedItem(item); setShowSellModal(true); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold text-gray-900">Inventory</h2>
          <p className="text-sm text-gray-500 mt-1">{inventory.length} units</p></div>
        <button onClick={() => setShowModal(true)} className="bg-gray-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-800">Add Unit</button>
      </div>

      {summary && (
        <div className="grid grid-cols-3 gap-4">
          <SummaryCard label="Total Projects" value={summary.total_projects} />
          <SummaryCard label="Available Units" value={summary.total_available} sub={formatCurrency(summary.available_value)} />
          <SummaryCard label="Sold Units" value={summary.total_sold} sub={formatCurrency(summary.sold_value)} />
        </div>
      )}

      <div className="flex gap-4">
        <select value={filter.project_id} onChange={e => setFilter({...filter, project_id: e.target.value})} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filter.status} onChange={e => setFilter({...filter, status: e.target.value})} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Status</option>
          <option value="available">Available</option>
          <option value="sold">Sold</option>
          <option value="reserved">Reserved</option>
        </select>
      </div>

      {loading ? <Loader /> : inventory.length === 0 ? <Empty msg="No inventory" /> : (
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">ID</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Project</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Unit</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Block</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4">Area</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4">Rate/Marla</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4">Total</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-6 py-4">Status</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4">Action</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {inventory.map(i => (
                <tr key={i.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-mono text-gray-500">{i.inventory_id}</td>
                  <td className="px-6 py-4 text-sm">{i.project_name}</td>
                  <td className="px-6 py-4 text-sm font-medium">{i.unit_number}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{i.block || '—'}</td>
                  <td className="px-6 py-4 text-sm text-right">{i.area_marla} M</td>
                  <td className="px-6 py-4 text-sm text-right">{formatCurrency(i.rate_per_marla)}</td>
                  <td className="px-6 py-4 text-sm text-right font-medium">{formatCurrency(i.total_value)}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${i.status === 'available' ? 'bg-green-50 text-green-700' : i.status === 'sold' ? 'bg-blue-50 text-blue-700' : 'bg-yellow-50 text-yellow-700'}`}>{i.status}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {i.status === 'available' && <button onClick={() => openSellModal(i)} className="text-sm text-blue-600 hover:text-blue-800 font-medium">Sell</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BulkImport entity="inventory" onImport={handleImport} importFile={importFile} setImportFile={setImportFile} importResult={importResult} />

      {showModal && (
        <Modal title="Add Unit" onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="block text-xs font-medium text-gray-500 mb-1">Project *</label>
              <select required value={form.project_id} onChange={e => setForm({...form, project_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">Select Project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Unit Number" required value={form.unit_number} onChange={e => setForm({...form, unit_number: e.target.value})} />
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                <select value={form.unit_type} onChange={e => setForm({...form, unit_type: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="plot">Plot</option><option value="shop">Shop</option><option value="house">House</option><option value="flat">Flat</option>
                </select>
              </div>
            </div>
            <Input label="Block" value={form.block} onChange={e => setForm({...form, block: e.target.value})} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Area (Marla)" type="number" step="0.01" required value={form.area_marla} onChange={e => setForm({...form, area_marla: e.target.value})} />
              <Input label="Rate/Marla" type="number" required value={form.rate_per_marla} onChange={e => setForm({...form, rate_per_marla: e.target.value})} />
            </div>
            <Input label="Factor Details" value={form.factor_details} onChange={e => setForm({...form, factor_details: e.target.value})} />
            <Input label="Notes" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg">Create</button>
            </div>
          </form>
        </Modal>
      )}

      {showSellModal && selectedItem && <SellModal item={selectedItem} onClose={() => setShowSellModal(false)} onSuccess={() => { setShowSellModal(false); loadData(); }} />}
    </div>
  );
}

// ============================================
// SELL MODAL (Create Transaction)
// ============================================
function SellModal({ item, onClose, onSuccess }) {
  const [customers, setCustomers] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [reps, setReps] = useState([]);
  const [form, setForm] = useState({
    customer_id: '', broker_id: '', company_rep_id: '',
    area_marla: item.area_marla, rate_per_marla: item.rate_per_marla,
    broker_commission_rate: 2, installment_cycle: 'bi-annual', num_installments: 4,
    first_due_date: '', booking_date: new Date().toISOString().split('T')[0], notes: ''
  });

  useEffect(() => {
    api.get('/customers').then(r => setCustomers(r.data));
    api.get('/brokers').then(r => setBrokers(r.data));
    api.get('/company-reps').then(r => setReps(r.data));
  }, []);

  const totalValue = (parseFloat(form.area_marla) || 0) * (parseFloat(form.rate_per_marla) || 0);
  const commission = totalValue * (parseFloat(form.broker_commission_rate) || 0) / 100;

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/transactions', { ...form, inventory_id: item.id });
      onSuccess();
    } catch (e) { alert(e.response?.data?.detail || 'Error'); }
  };

  return (
    <Modal title={`Sell ${item.unit_number}`} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><span className="text-gray-500">Project:</span> <span className="font-medium">{item.project_name}</span></div>
            <div><span className="text-gray-500">Unit:</span> <span className="font-medium">{item.unit_number}</span></div>
            <div><span className="text-gray-500">Block:</span> <span className="font-medium">{item.block || '—'}</span></div>
          </div>
        </div>

        <div><label className="block text-xs font-medium text-gray-500 mb-1">Customer *</label>
          <select required value={form.customer_id} onChange={e => setForm({...form, customer_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="">Select Customer</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.mobile})</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Broker</label>
            <select value={form.broker_id} onChange={e => { setForm({...form, broker_id: e.target.value, broker_commission_rate: brokers.find(b => b.id === e.target.value)?.commission_rate || 2}); }} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">No Broker</option>
              {brokers.map(b => <option key={b.id} value={b.id}>{b.name} ({b.commission_rate}%)</option>)}
            </select>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Company Rep</label>
            <select value={form.company_rep_id} onChange={e => setForm({...form, company_rep_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Select Rep</option>
              {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Input label="Area (Marla)" type="number" step="0.01" value={form.area_marla} onChange={e => setForm({...form, area_marla: e.target.value})} />
          <Input label="Rate/Marla" type="number" value={form.rate_per_marla} onChange={e => setForm({...form, rate_per_marla: e.target.value})} />
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Total Value</label>
            <div className="px-3 py-2 bg-gray-100 rounded-lg text-sm font-semibold">{formatCurrency(totalValue)}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Input label="Commission %" type="number" step="0.1" value={form.broker_commission_rate} onChange={e => setForm({...form, broker_commission_rate: e.target.value})} />
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Commission Amount</label>
            <div className="px-3 py-2 bg-gray-100 rounded-lg text-sm">{formatCurrency(commission)}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Installment Cycle</label>
            <select value={form.installment_cycle} onChange={e => setForm({...form, installment_cycle: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option>
              <option value="bi-annual">Bi-Annual</option><option value="annual">Annual</option>
            </select>
          </div>
          <Input label="# Installments" type="number" value={form.num_installments} onChange={e => setForm({...form, num_installments: e.target.value})} />
          <Input label="First Due Date" type="date" required value={form.first_due_date} onChange={e => setForm({...form, first_due_date: e.target.value})} />
        </div>

        <Input label="Booking Date" type="date" value={form.booking_date} onChange={e => setForm({...form, booking_date: e.target.value})} />
        <Input label="Notes" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />

        <div className="flex justify-end gap-3 pt-4 border-t">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
          <button type="submit" className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create Transaction</button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================
// TRANSACTIONS VIEW
// ============================================
function TransactionsView() {
  const [transactions, setTransactions] = useState([]);
  const [projects, setProjects] = useState([]);
  const [summary, setSummary] = useState(null);
  const [filter, setFilter] = useState({ project_id: '' });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedBroker, setSelectedBroker] = useState(null);
  const [customerDetails, setCustomerDetails] = useState(null);
  const [brokerDetails, setBrokerDetails] = useState(null);

  const loadCustomerDetails = async (customerId) => {
    try {
      const res = await api.get(`/customers/${customerId}/details`);
      setCustomerDetails(res.data);
      setSelectedCustomer(customerId);
    } catch (e) { alert('Error loading customer details'); }
  };

  const loadBrokerDetails = async (brokerId) => {
    try {
      const res = await api.get(`/brokers/${brokerId}/details`);
      setBrokerDetails(res.data);
      setSelectedBroker(brokerId);
    } catch (e) { alert('Error loading broker details'); }
  };

  useEffect(() => { loadData(); }, [filter]);
  const loadData = async () => {
    try {
      // Only pass params if they have values
      const params = {};
      if (filter.project_id) params.project_id = filter.project_id;
      
      const [txnRes, projRes, sumRes] = await Promise.all([
        api.get('/transactions'),
        api.get('/projects'),
        api.get('/transactions/summary', { params })
      ]);
      let txns = txnRes.data || [];
      if (filter.project_id) {
        const proj = projRes.data.find(p => p.id === filter.project_id);
        if (proj) txns = txns.filter(t => t.project_name === proj.name);
      }
      setTransactions(txns);
      setProjects(projRes.data || []);
      setSummary(sumRes.data);
    } catch (e) { console.error(e); setSummary({ total_transactions: 0, total_value: 0, this_month_count: 0, this_month_value: 0 }); }
    finally { setLoading(false); }
  };

  const handleImport = async () => {
    if (!importFile) return;
    const fd = new FormData(); fd.append('file', importFile);
    try { const res = await api.post('/transactions/bulk-import', fd); setImportResult(res.data); setImportFile(null); loadData(); }
    catch (e) { setImportResult({ success: 0, errors: [e.message] }); }
  };

  const viewDetails = async (t) => {
    try { const res = await api.get(`/transactions/${t.id}`); setSelectedTxn(res.data); }
    catch (e) { alert('Error loading details'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold text-gray-900">Transactions</h2>
          <p className="text-sm text-gray-500 mt-1">{transactions.length} sales</p></div>
        <button onClick={() => setShowModal(true)} className="bg-gray-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-800">Add Transaction</button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Total Transactions" value={summary.total_transactions} />
          <SummaryCard label="Total Value" value={formatCurrency(summary.total_value)} />
          <SummaryCard label="This Month" value={summary.this_month_count} />
          <SummaryCard label="This Month Value" value={formatCurrency(summary.this_month_value)} />
        </div>
      )}

      <div className="flex gap-4">
        <select value={filter.project_id} onChange={e => setFilter({...filter, project_id: e.target.value})} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {loading ? <Loader /> : transactions.length === 0 ? <Empty msg="No transactions yet" /> : (
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">ID</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Customer</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Project / Unit</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4">Total Value</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4">Paid</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4">Balance</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-6 py-4">Status</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4">Action</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {transactions.map(t => (
                <tr key={t.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => viewDetails(t)}>
                  <td className="px-6 py-4 text-sm font-mono text-gray-500">{t.transaction_id}</td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium">
                      {t.customer_id ? (
                        <button onClick={() => loadCustomerDetails(t.customer_id)} className="text-blue-600 hover:text-blue-800 hover:underline">
                          {t.customer_name}
                        </button>
                      ) : (
                        t.customer_name
                      )}
                    </div>
                    {t.broker_name && t.broker_id && (
                      <div className="text-xs text-gray-400">
                        via <button onClick={() => loadBrokerDetails(t.broker_id)} className="text-blue-600 hover:text-blue-800 hover:underline">{t.broker_name}</button>
                      </div>
                    )}
                    {t.broker_name && !t.broker_id && (
                      <div className="text-xs text-gray-400">via {t.broker_name}</div>
                    )}
                  </td>
                  <td className="px-6 py-4"><div className="text-sm">{t.project_name}</div><div className="text-xs text-gray-500">{t.unit_number}</div></td>
                  <td className="px-6 py-4 text-sm text-right font-medium">{formatCurrency(t.total_value)}</td>
                  <td className="px-6 py-4 text-sm text-right text-green-600">{formatCurrency(t.total_paid)}</td>
                  <td className="px-6 py-4 text-sm text-right text-amber-600">{formatCurrency(t.balance)}</td>
                  <td className="px-6 py-4 text-center"><span className={`px-2 py-1 rounded-full text-xs font-medium ${t.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{t.status}</span></td>
                  <td className="px-6 py-4 text-right"><button onClick={(e) => { e.stopPropagation(); viewDetails(t); }} className="text-sm text-blue-600 hover:text-blue-800">View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BulkImport entity="transactions" onImport={handleImport} importFile={importFile} setImportFile={setImportFile} importResult={importResult} />

      {showModal && <NewTransactionModal onClose={() => setShowModal(false)} onSuccess={() => { setShowModal(false); loadData(); }} />}
      {selectedTxn && <TransactionDetailModal txn={selectedTxn} onClose={() => setSelectedTxn(null)} onUpdate={loadData} />}
      
      {selectedCustomer && customerDetails && (
        <CustomerDetailModal 
          customer={customerDetails} 
          onClose={() => { setSelectedCustomer(null); setCustomerDetails(null); }} 
        />
      )}
      
      {selectedBroker && brokerDetails && (
        <BrokerDetailModal 
          broker={brokerDetails} 
          onClose={() => { setSelectedBroker(null); setBrokerDetails(null); }} 
        />
      )}
    </div>
  );
}

// ============================================
// NEW TRANSACTION MODAL (Searchable, Scalable)
// ============================================
function NewTransactionModal({ onClose, onSuccess }) {
  const [projects, setProjects] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [reps, setReps] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedInv, setSelectedInv] = useState(null);
  const [projectSearch, setProjectSearch] = useState('');
  const [unitSearch, setUnitSearch] = useState('');
  const [form, setForm] = useState({
    customer_id: '', broker_id: '', company_rep_id: '',
    area_marla: '', rate_per_marla: '',
    broker_commission_rate: 2, installment_cycle: 'bi-annual', num_installments: 4,
    first_due_date: '', booking_date: new Date().toISOString().split('T')[0], notes: ''
  });

  useEffect(() => {
    Promise.all([
      api.get('/projects'),
      api.get('/inventory/available'),
      api.get('/customers'),
      api.get('/brokers'),
      api.get('/company-reps')
    ]).then(([projRes, invRes, custRes, brkRes, repRes]) => {
      setProjects(projRes.data);
      setInventory(invRes.data);
      setCustomers(custRes.data);
      setBrokers(brkRes.data);
      setReps(repRes.data);
    });
  }, []);

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(projectSearch.toLowerCase()) &&
    inventory.some(i => i.project_id === p.id)
  );

  const filteredUnits = inventory.filter(i => 
    i.project_id === selectedProject &&
    (i.unit_number.toLowerCase().includes(unitSearch.toLowerCase()) || 
     (i.block && i.block.toLowerCase().includes(unitSearch.toLowerCase())))
  );

  const selectProject = (projectId) => {
    setSelectedProject(projectId);
    setSelectedInv(null);
    setUnitSearch('');
  };

  const selectUnit = (inv) => {
    setSelectedInv(inv);
    setForm({...form, area_marla: inv.area_marla, rate_per_marla: inv.rate_per_marla});
  };

  const totalValue = (parseFloat(form.area_marla) || 0) * (parseFloat(form.rate_per_marla) || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedInv) { alert('Select a unit'); return; }
    if (!form.customer_id) { alert('Select a customer'); return; }
    try {
      await api.post('/transactions', { ...form, inventory_id: selectedInv.id });
      onSuccess();
    } catch (e) { alert(e.response?.data?.detail || 'Error'); }
  };

  return (
    <Modal title="New Transaction" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Project Selection */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Project *</label>
            <input type="text" placeholder="Search projects..." value={projectSearch}
              onChange={e => setProjectSearch(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm mb-2" />
            <div className="border rounded-lg max-h-32 overflow-y-auto">
              {filteredProjects.length === 0 ? (
                <div className="p-3 text-sm text-gray-400 text-center">No projects with available units</div>
              ) : filteredProjects.map(p => (
                <button key={p.id} type="button" onClick={() => selectProject(p.id)}
                  className={`w-full text-left px-3 py-2 text-sm border-b last:border-0 ${selectedProject === p.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`}>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-gray-500">{inventory.filter(i => i.project_id === p.id).length} units available</div>
                </button>
              ))}
            </div>
          </div>

          {/* Unit Selection */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Unit *</label>
            <input type="text" placeholder="Search units..." value={unitSearch}
              onChange={e => setUnitSearch(e.target.value)}
              disabled={!selectedProject}
              className="w-full border rounded-lg px-3 py-2 text-sm mb-2 disabled:bg-gray-100" />
            <div className="border rounded-lg max-h-32 overflow-y-auto">
              {!selectedProject ? (
                <div className="p-3 text-sm text-gray-400 text-center">Select a project first</div>
              ) : filteredUnits.length === 0 ? (
                <div className="p-3 text-sm text-gray-400 text-center">No matching units</div>
              ) : filteredUnits.map(i => (
                <button key={i.id} type="button" onClick={() => selectUnit(i)}
                  className={`w-full text-left px-3 py-2 text-sm border-b last:border-0 ${selectedInv?.id === i.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`}>
                  <div className="font-medium">{i.unit_number} {i.block && `(${i.block})`}</div>
                  <div className="text-xs text-gray-500">{i.area_marla} Marla • {formatCurrency(i.rate_per_marla)}/M</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {selectedInv && (
          <>
            <div className="bg-blue-50 rounded-lg p-3 text-sm">
              <span className="font-medium">Selected:</span> {selectedInv.project_name} - {selectedInv.unit_number} 
              ({selectedInv.area_marla} Marla @ {formatCurrency(selectedInv.rate_per_marla)}/M = {formatCurrency(selectedInv.total_value)})
            </div>

            <div><label className="block text-xs font-medium text-gray-500 mb-1">Customer *</label>
              <select required value={form.customer_id} onChange={e => setForm({...form, customer_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">Select Customer</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.mobile})</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Broker</label>
                <select value={form.broker_id} onChange={e => setForm({...form, broker_id: e.target.value, broker_commission_rate: brokers.find(b => b.id === e.target.value)?.commission_rate || 2})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">No Broker</option>
                  {brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Company Rep</label>
                <select value={form.company_rep_id} onChange={e => setForm({...form, company_rep_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Select Rep</option>
                  {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Input label="Area (Marla)" type="number" step="0.01" value={form.area_marla} onChange={e => setForm({...form, area_marla: e.target.value})} />
              <Input label="Rate/Marla" type="number" value={form.rate_per_marla} onChange={e => setForm({...form, rate_per_marla: e.target.value})} />
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Total</label>
                <div className="px-3 py-2 bg-gray-100 rounded-lg text-sm font-semibold">{formatCurrency(totalValue)}</div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <Input label="Commission %" type="number" step="0.1" value={form.broker_commission_rate} onChange={e => setForm({...form, broker_commission_rate: e.target.value})} />
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Cycle</label>
                <select value={form.installment_cycle} onChange={e => setForm({...form, installment_cycle: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option>
                  <option value="bi-annual">Bi-Annual</option><option value="annual">Annual</option>
                </select>
              </div>
              <Input label="# Installments" type="number" value={form.num_installments} onChange={e => setForm({...form, num_installments: e.target.value})} />
              <Input label="First Due" type="date" required value={form.first_due_date} onChange={e => setForm({...form, first_due_date: e.target.value})} />
            </div>
          </>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
          <button type="submit" disabled={!selectedInv} className="px-6 py-2 text-sm bg-gray-900 text-white rounded-lg disabled:bg-gray-300">Create</button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================
// TRANSACTION DETAIL MODAL
// ============================================
function TransactionDetailModal({ txn, onClose, onUpdate }) {
  const [installments, setInstallments] = useState(txn.installments || []);

  const updateInstallment = async (inst, field, value) => {
    try {
      await api.put(`/installments/${inst.id}`, { [field]: value });
      const res = await api.get(`/transactions/${txn.id}`);
      setInstallments(res.data.installments);
      onUpdate();
    } catch (e) { alert('Error updating'); }
  };

  return (
    <Modal title={`Transaction ${txn.transaction_id}`} onClose={onClose} wide>
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-6">
          <div><div className="text-xs text-gray-400">Customer</div><div className="font-medium">{txn.customer_name}</div></div>
          <div><div className="text-xs text-gray-400">Broker</div><div className="font-medium">{txn.broker_name || '—'}</div></div>
          <div><div className="text-xs text-gray-400">Project / Unit</div><div className="font-medium">{txn.project_name} - {txn.unit_number}</div></div>
          <div><div className="text-xs text-gray-400">Total Value</div><div className="font-semibold text-lg">{formatCurrency(txn.total_value)}</div></div>
        </div>

        <div className="border-t pt-4">
          <h4 className="text-sm font-semibold mb-3">Installments</h4>
          <table className="w-full text-sm">
            <thead><tr className="border-b">
              <th className="text-left py-2">#</th>
              <th className="text-left py-2">Due Date</th>
              <th className="text-right py-2">Amount</th>
              <th className="text-right py-2">Paid</th>
              <th className="text-right py-2">Balance</th>
              <th className="text-center py-2">Status</th>
            </tr></thead>
            <tbody>
              {installments.map(i => (
                <tr key={i.id} className="border-b">
                  <td className="py-2">{i.number}</td>
                  <td className="py-2"><input type="date" value={i.due_date} onChange={e => updateInstallment(i, 'due_date', e.target.value)} className="border rounded px-2 py-1 text-sm" /></td>
                  <td className="py-2 text-right"><input type="number" value={i.amount} onChange={e => updateInstallment(i, 'amount', e.target.value)} className="border rounded px-2 py-1 text-sm w-28 text-right" /></td>
                  <td className="py-2 text-right"><input type="number" value={i.amount_paid} onChange={e => updateInstallment(i, 'amount_paid', e.target.value)} className="border rounded px-2 py-1 text-sm w-28 text-right" /></td>
                  <td className="py-2 text-right font-medium">{formatCurrency(i.balance)}</td>
                  <td className="py-2 text-center"><span className={`px-2 py-1 rounded-full text-xs ${i.status === 'paid' ? 'bg-green-100 text-green-700' : i.status === 'partial' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100'}`}>{i.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Media Attachments */}
        <div className="border-t pt-4">
          <MediaManager 
            entityType="transaction" 
            entityId={txn.id || txn.transaction_id}
            onUpload={() => {}}
          />
        </div>
      </div>
    </Modal>
  );
}

// ============================================
// CUSTOMERS VIEW
// ============================================
function CustomersView() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', mobile: '', address: '', cnic: '', email: '' });
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);

  useEffect(() => { loadCustomers(); }, []);
  const loadCustomers = async () => {
    try { const res = await api.get('/customers'); setCustomers(res.data); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) { await api.put(`/customers/${editing.id}`, form); }
      else { await api.post('/customers', form); }
      setShowModal(false); setEditing(null); setForm({ name: '', mobile: '', address: '', cnic: '', email: '' }); loadCustomers();
    } catch (e) { alert(e.response?.data?.detail || 'Error'); }
  };

  const handleDelete = async (c) => {
    if (!confirm(`Delete "${c.name}"?`)) return;
    try { await api.delete(`/customers/${c.id}`); loadCustomers(); }
    catch (e) { alert(e.response?.data?.detail || 'Error'); }
  };

  const openEdit = (c) => { setEditing(c); setForm({ name: c.name, mobile: c.mobile, address: c.address || '', cnic: c.cnic || '', email: c.email || '' }); setShowModal(true); };

  const handleImport = async () => {
    if (!importFile) return;
    const fd = new FormData(); fd.append('file', importFile);
    try { const res = await api.post('/customers/bulk-import', fd); setImportResult(res.data); setImportFile(null); loadCustomers(); }
    catch (e) { setImportResult({ success: 0, errors: [e.message] }); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold text-gray-900">Customers</h2><p className="text-sm text-gray-500 mt-1">{customers.length} total</p></div>
        <button onClick={() => { setEditing(null); setForm({ name: '', mobile: '', address: '', cnic: '', email: '' }); setShowModal(true); }} className="bg-gray-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-800">Add Customer</button>
      </div>

      {loading ? <Loader /> : customers.length === 0 ? <Empty msg="No customers" /> : (
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">ID</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Name</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Mobile</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">CNIC</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {customers.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-mono text-gray-500">{c.customer_id}</td>
                  <td className="px-6 py-4"><div className="text-sm font-medium">{c.name}</div>{c.email && <div className="text-xs text-gray-400">{c.email}</div>}</td>
                  <td className="px-6 py-4 text-sm">{c.mobile}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{c.cnic || '—'}</td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => openEdit(c)} className="text-gray-400 hover:text-gray-600 mr-3">Edit</button>
                    <button onClick={() => handleDelete(c)} className="text-gray-400 hover:text-red-500">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BulkImport entity="customers" onImport={handleImport} importFile={importFile} setImportFile={setImportFile} importResult={importResult} />

      {showModal && (
        <Modal title={editing ? 'Edit Customer' : 'Add Customer'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Name" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            <Input label="Mobile" required value={form.mobile} onChange={e => setForm({...form, mobile: e.target.value})} placeholder="0300-1234567" />
            <Input label="CNIC" value={form.cnic} onChange={e => setForm({...form, cnic: e.target.value})} />
            <Input label="Email" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
            <Input label="Address" value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg">{editing ? 'Update' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ============================================
// BROKERS VIEW
// ============================================
function BrokersView() {
  const [brokers, setBrokers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', mobile: '', company: '', commission_rate: 2 });
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);

  useEffect(() => { loadData(); }, []);
  const loadData = async () => {
    try {
      const [bRes, sRes] = await Promise.all([api.get('/brokers'), api.get('/brokers/summary')]);
      setBrokers(bRes.data); setSummary(sRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) { await api.put(`/brokers/${editing.id}`, form); }
      else { await api.post('/brokers', form); }
      setShowModal(false); setEditing(null); setForm({ name: '', mobile: '', company: '', commission_rate: 2 }); loadData();
    } catch (e) { alert(e.response?.data?.detail || 'Error'); }
  };

  const handleDelete = async (b) => {
    if (!confirm(`Delete "${b.name}"?`)) return;
    try { await api.delete(`/brokers/${b.id}`); loadData(); }
    catch (e) { alert(e.response?.data?.detail || 'Error'); }
  };

  const openEdit = (b) => { setEditing(b); setForm({ name: b.name, mobile: b.mobile, company: b.company || '', commission_rate: b.commission_rate }); setShowModal(true); };

  const handleImport = async () => {
    if (!importFile) return;
    const fd = new FormData(); fd.append('file', importFile);
    try { const res = await api.post('/brokers/bulk-import', fd); setImportResult(res.data); setImportFile(null); loadData(); }
    catch (e) { setImportResult({ success: 0, errors: [e.message] }); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold text-gray-900">Brokers</h2><p className="text-sm text-gray-500 mt-1">Partner network</p></div>
        <button onClick={() => { setEditing(null); setForm({ name: '', mobile: '', company: '', commission_rate: 2 }); setShowModal(true); }} className="bg-gray-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-800">Add Broker</button>
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard label="Total Brokers" value={summary.total_brokers} />
            <SummaryCard label="Active Brokers" value={summary.active_brokers} />
            <SummaryCard label="Total Deals" value={summary.total_deals} />
            <SummaryCard label="Total Deal Value" value={formatCurrency(summary.total_deals_value)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl shadow-sm border p-5">
              <div className="text-xs font-medium text-gray-400 uppercase mb-3">This Month</div>
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-3xl font-semibold text-gray-900">{summary.deals_this_month}</div>
                  <div className="text-sm text-gray-500">Deals</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold text-green-600">{formatCurrency(summary.deals_this_month_value)}</div>
                  <div className="text-sm text-gray-500">Value</div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border p-5">
              <div className="text-xs font-medium text-gray-400 uppercase mb-3">Top Performers</div>
              {summary.top_performers?.length > 0 ? (
                <div className="space-y-2">
                  {summary.top_performers.slice(0, 3).map((tp, idx) => (
                    <div key={tp.broker_id} className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-yellow-100 text-yellow-700' : idx === 1 ? 'bg-gray-100 text-gray-600' : 'bg-orange-100 text-orange-700'}`}>{idx + 1}</span>
                        <span className="text-sm font-medium">{tp.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{formatCurrency(tp.total_value)}</div>
                        <div className="text-xs text-gray-400">{tp.deal_count} deals</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-400">No deals yet</div>
              )}
            </div>
          </div>
        </>
      )}

      {loading ? <Loader /> : brokers.length === 0 ? <Empty msg="No brokers" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {brokers.map(b => (
            <div key={b.id} className="bg-white rounded-2xl shadow-sm border p-5">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="text-xs font-mono text-gray-400">{b.broker_id}</div>
                  <div className="font-semibold">{b.name}</div>
                  {b.company && <div className="text-sm text-gray-500">{b.company}</div>}
                </div>
                <span className={`px-2 py-1 rounded-full text-xs ${b.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100'}`}>{b.status}</span>
              </div>
              <div className="text-sm text-gray-600 mb-3">{b.mobile}</div>
              <div className="flex justify-between text-sm border-t pt-3">
                <span className="text-gray-400">Commission</span>
                <span className="font-medium">{b.commission_rate}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Deals</span>
                <span className="font-medium">{b.stats.total_deals}</span>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => openEdit(b)} className="flex-1 py-2 text-sm border rounded-lg hover:bg-gray-50">Edit</button>
                <button onClick={() => handleDelete(b)} className="py-2 px-4 text-sm text-red-500 border rounded-lg hover:bg-red-50">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <BulkImport entity="brokers" onImport={handleImport} importFile={importFile} setImportFile={setImportFile} importResult={importResult} />

      {showModal && (
        <Modal title={editing ? 'Edit Broker' : 'Add Broker'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Name" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            <Input label="Mobile" required value={form.mobile} onChange={e => setForm({...form, mobile: e.target.value})} />
            <Input label="Company" value={form.company} onChange={e => setForm({...form, company: e.target.value})} />
            <Input label="Commission %" type="number" step="0.1" value={form.commission_rate} onChange={e => setForm({...form, commission_rate: parseFloat(e.target.value)})} />
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg">{editing ? 'Update' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ============================================
// RECEIPTS VIEW (McKinsey-style)
// ============================================
function ReceiptsView() {
  const [receipts, setReceipts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [reps, setReps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerTransactions, setCustomerTransactions] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [form, setForm] = useState({
    customer_id: '', transaction_id: '', amount: '',
    payment_method: 'cash', reference_number: '', payment_date: new Date().toISOString().split('T')[0],
    notes: '', created_by_rep_id: '', allocations: []
  });

  useEffect(() => { loadData(); }, []);
  const loadData = async () => {
    try {
      const [rcpRes, sumRes, custRes, repRes] = await Promise.all([
        api.get('/receipts', { params: { limit: 50 } }).catch(() => ({ data: [] })),
        api.get('/receipts/summary').catch(() => ({ data: { total_receipts: 0, total_amount: 0, today_count: 0, today_amount: 0, month_count: 0, month_amount: 0, by_method: {} } })),
        api.get('/customers').catch(() => ({ data: [] })),
        api.get('/company-reps').catch(() => ({ data: [] }))
      ]);
      setReceipts(rcpRes.data || []);
      setSummary(sumRes.data);
      setCustomers(custRes.data || []);
      setReps(repRes.data || []);
    } catch (e) { 
      console.error(e); 
      setSummary({ total_receipts: 0, total_amount: 0, today_count: 0, today_amount: 0, month_count: 0, month_amount: 0, by_method: {} });
    }
    finally { setLoading(false); }
  };

  const selectCustomer = async (customer) => {
    setSelectedCustomer(customer);
    setForm({...form, customer_id: customer.id, transaction_id: '', allocations: []});
    try {
      const res = await api.get(`/receipts/customer/${customer.id}/transactions`);
      setCustomerTransactions(res.data || []);
    } catch (e) { setCustomerTransactions([]); }
  };

  const selectTransaction = (txn) => {
    setForm({...form, transaction_id: txn.id, allocations: []});
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.customer_id) { alert('Select a customer'); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { alert('Enter valid amount'); return; }
    try {
      await api.post('/receipts', form);
      setShowModal(false);
      setForm({ customer_id: '', transaction_id: '', amount: '', payment_method: 'cash', reference_number: '', payment_date: new Date().toISOString().split('T')[0], notes: '', created_by_rep_id: '', allocations: [] });
      setSelectedCustomer(null);
      setCustomerTransactions([]);
      setCustomerSearch('');
      loadData();
    } catch (e) { alert(e.response?.data?.detail || 'Error'); }
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.mobile.includes(customerSearch) ||
    c.customer_id.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const selectedTxn = customerTransactions.find(t => t.id === form.transaction_id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold text-gray-900">Receipts</h2>
          <p className="text-sm text-gray-500 mt-1">Payment collection & allocation</p></div>
        <button onClick={() => setShowModal(true)} className="bg-gray-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-800">Record Receipt</button>
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard label="Total Receipts" value={summary.total_receipts} />
            <SummaryCard label="Total Collected" value={formatCurrency(summary.total_amount)} />
            <SummaryCard label="Today" value={summary.today_count} sub={formatCurrency(summary.today_amount)} />
            <SummaryCard label="This Month" value={summary.month_count} sub={formatCurrency(summary.month_amount)} />
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border p-4">
              <div className="text-xs text-gray-400 uppercase">Cash</div>
              <div className="text-lg font-semibold text-green-600">{formatCurrency(summary.by_method?.cash || 0)}</div>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <div className="text-xs text-gray-400 uppercase">Cheque</div>
              <div className="text-lg font-semibold text-blue-600">{formatCurrency(summary.by_method?.cheque || 0)}</div>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <div className="text-xs text-gray-400 uppercase">Bank Transfer</div>
              <div className="text-lg font-semibold text-purple-600">{formatCurrency(summary.by_method?.bank_transfer || 0)}</div>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <div className="text-xs text-gray-400 uppercase">Online</div>
              <div className="text-lg font-semibold text-orange-600">{formatCurrency(summary.by_method?.online || 0)}</div>
            </div>
          </div>
        </>
      )}

      {loading ? <Loader /> : receipts.length === 0 ? <Empty msg="No receipts recorded" /> : (
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Receipt</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Customer</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Project / Unit</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4">Amount</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-6 py-4">Method</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Date</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {receipts.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => { setSelectedReceipt(r); setShowDetailModal(true); }}>
                  <td className="px-6 py-4">
                    <div className="text-sm font-mono text-gray-900">{r.receipt_id}</div>
                    {r.reference_number && <div className="text-xs text-gray-400">Ref: {r.reference_number}</div>}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium">{r.customer_name}</div>
                    <div className="text-xs text-gray-400">{r.customer_id}</div>
                  </td>
                  <td className="px-6 py-4">
                    {r.project_name ? (
                      <><div className="text-sm">{r.project_name}</div><div className="text-xs text-gray-500">{r.unit_number}</div></>
                    ) : <span className="text-sm text-gray-400">-</span>}
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-semibold text-green-600">{formatCurrency(r.amount)}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      r.payment_method === 'cash' ? 'bg-green-50 text-green-700' :
                      r.payment_method === 'cheque' ? 'bg-blue-50 text-blue-700' :
                      r.payment_method === 'bank_transfer' ? 'bg-purple-50 text-purple-700' : 'bg-orange-50 text-orange-700'
                    }`}>{r.payment_method}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{r.payment_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title="Record Receipt" onClose={() => { setShowModal(false); setSelectedCustomer(null); setCustomerTransactions([]); setCustomerSearch(''); }} wide>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Customer Selection */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Customer *</label>
              <input type="text" placeholder="Search by name, mobile or ID..." value={customerSearch}
                onChange={e => { setCustomerSearch(e.target.value); setSelectedCustomer(null); }}
                className="w-full border rounded-lg px-3 py-2 text-sm mb-2" />
              {customerSearch && !selectedCustomer && (
                <div className="border rounded-lg max-h-32 overflow-y-auto">
                  {filteredCustomers.length === 0 ? (
                    <div className="p-3 text-sm text-gray-400 text-center">No customers found</div>
                  ) : filteredCustomers.slice(0, 5).map(c => (
                    <button key={c.id} type="button" onClick={() => { selectCustomer(c); setCustomerSearch(c.name); }}
                      className="w-full text-left px-3 py-2 text-sm border-b last:border-0 hover:bg-gray-50">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-gray-500">{c.customer_id} • {c.mobile}</div>
                    </button>
                  ))}
                </div>
              )}
              {selectedCustomer && (
                <div className="bg-blue-50 rounded-lg p-3 text-sm">
                  <span className="font-medium">Selected:</span> {selectedCustomer.name} ({selectedCustomer.mobile})
                </div>
              )}
            </div>

            {/* Transaction Selection (for multi-purchase customers) */}
            {selectedCustomer && customerTransactions.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Allocate to Transaction</label>
                <div className="border rounded-lg max-h-40 overflow-y-auto">
                  {customerTransactions.map(t => (
                    <button key={t.id} type="button" onClick={() => selectTransaction(t)}
                      className={`w-full text-left px-3 py-2 text-sm border-b last:border-0 ${form.transaction_id === t.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-medium">{t.project_name} - {t.unit_number}</div>
                          <div className="text-xs text-gray-500">{t.transaction_id}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-amber-600">{formatCurrency(t.balance)}</div>
                          <div className="text-xs text-gray-400">pending</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Show pending installments if transaction selected */}
            {selectedTxn && (
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs font-medium text-gray-500 mb-2">Pending Installments</div>
                <div className="space-y-1">
                  {selectedTxn.installments.map(i => (
                    <div key={i.id} className="flex justify-between text-sm">
                      <span>#{i.number} - Due {i.due_date}</span>
                      <span className="text-amber-600">{formatCurrency(i.balance)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Input label="Amount *" type="number" required value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} />
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Payment Method</label>
                <select value={form.payment_method} onChange={e => setForm({...form, payment_method: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="cash">💵 Cash</option>
                  <option value="cheque">📝 Cheque</option>
                  <option value="bank_transfer">🏦 Bank Transfer</option>
                  <option value="online">💳 Online</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Reference # (Cheque/Transaction ID)" value={form.reference_number} onChange={e => setForm({...form, reference_number: e.target.value})} />
              <Input label="Payment Date" type="date" value={form.payment_date} onChange={e => setForm({...form, payment_date: e.target.value})} />
            </div>

            <div><label className="block text-xs font-medium text-gray-500 mb-1">Received By</label>
              <select value={form.created_by_rep_id} onChange={e => setForm({...form, created_by_rep_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">Select Rep</option>
                {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>

            <Input label="Notes" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button type="button" onClick={() => { setShowModal(false); setSelectedCustomer(null); setCustomerTransactions([]); setCustomerSearch(''); }} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button type="submit" className="px-6 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">Record Receipt</button>
            </div>
          </form>
        </Modal>
      )}

      {showDetailModal && selectedReceipt && (
        <ReceiptDetailModal 
          receipt={selectedReceipt} 
          onClose={() => { setShowDetailModal(false); setSelectedReceipt(null); }} 
        />
      )}
    </div>
  );
}

// ============================================
// RECEIPT DETAIL MODAL
// ============================================
function ReceiptDetailModal({ receipt, onClose }) {
  return (
    <Modal title={`Receipt: ${receipt.receipt_id}`} onClose={onClose} wide>
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Receipt ID</label>
            <div className="text-sm text-gray-900">{receipt.receipt_id}</div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Customer</label>
            <div className="text-sm text-gray-900">{receipt.customer_name || '-'}</div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Project / Unit</label>
            <div className="text-sm text-gray-900">
              {receipt.project_name ? `${receipt.project_name} - ${receipt.unit_number}` : '-'}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Amount</label>
            <div className="text-sm font-semibold text-green-600">{formatCurrency(receipt.amount)}</div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Payment Method</label>
            <div className="text-sm">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                receipt.payment_method === 'cash' ? 'bg-green-50 text-green-700' :
                receipt.payment_method === 'cheque' ? 'bg-blue-50 text-blue-700' :
                receipt.payment_method === 'bank_transfer' ? 'bg-purple-50 text-purple-700' : 'bg-orange-50 text-orange-700'
              }`}>{receipt.payment_method}</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Payment Date</label>
            <div className="text-sm text-gray-900">{receipt.payment_date || '-'}</div>
          </div>
          {receipt.reference_number && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Reference Number</label>
              <div className="text-sm text-gray-900">{receipt.reference_number}</div>
            </div>
          )}
          {receipt.notes && (
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
              <div className="text-sm text-gray-900">{receipt.notes}</div>
            </div>
          )}
        </div>

        {/* Media Attachments */}
        <div className="border-t pt-4">
          <MediaManager 
            entityType="receipt" 
            entityId={receipt.id || receipt.receipt_id}
            onUpload={() => {}}
          />
        </div>
      </div>
    </Modal>
  );
}

// ============================================
// INTERACTIONS VIEW (McKinsey-style dashboard)
// ============================================
function InteractionsView() {
  const [interactions, setInteractions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [reps, setReps] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    company_rep_id: '', customer_id: '', broker_id: '',
    interaction_type: 'call', status: '', notes: '', next_follow_up: ''
  });

  useEffect(() => { loadData(); }, []);
  const loadData = async () => {
    try {
      const [intRes, sumRes, repRes, custRes, brkRes] = await Promise.all([
        api.get('/interactions', { params: { limit: 50 } }),
        api.get('/interactions/summary'),
        api.get('/company-reps'),
        api.get('/customers'),
        api.get('/brokers')
      ]);
      setInteractions(intRes.data);
      setSummary(sumRes.data);
      setReps(repRes.data);
      setCustomers(custRes.data);
      setBrokers(brkRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/interactions', form);
      setShowModal(false);
      setForm({ company_rep_id: '', customer_id: '', broker_id: '', interaction_type: 'call', status: '', notes: '', next_follow_up: '' });
      loadData();
    } catch (e) { alert(e.response?.data?.detail || 'Error'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold text-gray-900">Interactions</h2>
          <p className="text-sm text-gray-500 mt-1">Track rep communications</p></div>
        <button onClick={() => setShowModal(true)} className="bg-gray-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-800">Log Interaction</button>
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard label="Total Interactions" value={summary.total_interactions} />
            <SummaryCard label="Total Calls" value={summary.total_calls} />
            <SummaryCard label="Messages" value={summary.total_messages} />
            <SummaryCard label="WhatsApp" value={summary.total_whatsapp} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl shadow-sm border p-5">
              <div className="text-xs font-medium text-gray-400 uppercase">Today</div>
              <div className="mt-2 text-3xl font-semibold text-gray-900">{summary.today}</div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border p-5">
              <div className="text-xs font-medium text-gray-400 uppercase">This Week</div>
              <div className="mt-2 text-3xl font-semibold text-gray-900">{summary.this_week}</div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border p-5">
              <div className="text-xs font-medium text-gray-400 uppercase">This Month</div>
              <div className="mt-2 text-3xl font-semibold text-gray-900">{summary.this_month}</div>
            </div>
          </div>
          {summary.pending_followups > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="text-sm font-medium text-amber-800">⚠️ {summary.pending_followups} pending follow-ups due</div>
            </div>
          )}
        </>
      )}

      {loading ? <Loader /> : interactions.length === 0 ? <Empty msg="No interactions logged" /> : (
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">ID</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Rep</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Contact</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-6 py-4">Type</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Status</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Follow-up</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Date</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {interactions.map(i => (
                <tr key={i.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-mono text-gray-500">{i.interaction_id}</td>
                  <td className="px-6 py-4 text-sm">{i.rep_name}</td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium">{i.customer_name || i.broker_name}</div>
                    <div className="text-xs text-gray-400">{i.customer_id ? 'Customer' : 'Broker'}</div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      i.interaction_type === 'call' ? 'bg-blue-50 text-blue-700' :
                      i.interaction_type === 'whatsapp' ? 'bg-green-50 text-green-700' : 'bg-gray-100'
                    }`}>{i.interaction_type}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{i.status || '-'}</td>
                  <td className="px-6 py-4 text-sm">{i.next_follow_up || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{new Date(i.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title="Log Interaction" onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="block text-xs font-medium text-gray-500 mb-1">Company Rep *</label>
              <select required value={form.company_rep_id} onChange={e => setForm({...form, company_rep_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">Select Rep</option>
                {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Customer</label>
                <select value={form.customer_id} onChange={e => setForm({...form, customer_id: e.target.value, broker_id: e.target.value ? '' : form.broker_id})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Select Customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.mobile})</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Or Broker</label>
                <select value={form.broker_id} onChange={e => setForm({...form, broker_id: e.target.value, customer_id: e.target.value ? '' : form.customer_id})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Select Broker</option>
                  {brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Type *</label>
                <select required value={form.interaction_type} onChange={e => setForm({...form, interaction_type: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="call">📞 Call</option>
                  <option value="message">💬 Message</option>
                  <option value="whatsapp">📱 WhatsApp</option>
                </select>
              </div>
              <Input label="Status" value={form.status} onChange={e => setForm({...form, status: e.target.value})} placeholder="e.g., Interested, Not available" />
            </div>
            <Input label="Notes" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
            <Input label="Next Follow-up" type="date" value={form.next_follow_up} onChange={e => setForm({...form, next_follow_up: e.target.value})} />
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg">Log</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ============================================
// CAMPAIGNS VIEW (Lead Management)
// ============================================
function CampaignsView() {
  const [campaigns, setCampaigns] = useState([]);
  const [leads, setLeads] = useState([]);
  const [summary, setSummary] = useState(null);
  const [reps, setReps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [campaignForm, setCampaignForm] = useState({ name: '', source: 'facebook', start_date: '', budget: '', notes: '' });
  const [leadForm, setLeadForm] = useState({ name: '', mobile: '', email: '', assigned_rep_id: '', lead_type: 'prospect', notes: '' });
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);

  useEffect(() => { loadData(); }, []);
  const loadData = async () => {
    try {
      const [cmpRes, sumRes, repRes] = await Promise.all([
        api.get('/campaigns').catch(() => ({ data: [] })),
        api.get('/campaigns/summary').catch(() => ({ data: { total_campaigns: 0, active_campaigns: 0, total_leads: 0, converted_leads: 0, total_budget: 0, conversion_rate: 0 } })),
        api.get('/company-reps').catch(() => ({ data: [] }))
      ]);
      setCampaigns(cmpRes.data || []);
      setSummary(sumRes.data);
      setReps(repRes.data || []);
    } catch (e) { console.error(e); setSummary({ total_campaigns: 0, active_campaigns: 0, total_leads: 0, converted_leads: 0, total_budget: 0, conversion_rate: 0 }); }
    finally { setLoading(false); }
  };

  const loadLeads = async (campaign) => {
    setSelectedCampaign(campaign);
    try {
      const res = await api.get('/leads', { params: { campaign_id: campaign.id } });
      setLeads(res.data || []);
    } catch (e) { console.error(e); setLeads([]); }
  };

  const handleCampaignSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/campaigns', campaignForm);
      setShowCampaignModal(false);
      setCampaignForm({ name: '', source: 'facebook', start_date: '', budget: '', notes: '' });
      loadData();
    } catch (e) { alert(e.response?.data?.detail || 'Error'); }
  };

  const handleLeadSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/leads', { ...leadForm, campaign_id: selectedCampaign?.id });
      setShowLeadModal(false);
      setLeadForm({ name: '', mobile: '', email: '', assigned_rep_id: '', notes: '' });
      if (selectedCampaign) loadLeads(selectedCampaign);
      loadData();
    } catch (e) { alert(e.response?.data?.detail || 'Error'); }
  };

  const handleImport = async () => {
    if (!importFile || !selectedCampaign) return;
    const fd = new FormData(); fd.append('file', importFile);
    try {
      const res = await api.post(`/leads/bulk-import?campaign_id=${selectedCampaign.id}`, fd);
      setImportResult(res.data);
      setImportFile(null);
      loadLeads(selectedCampaign);
      loadData();
    } catch (e) { setImportResult({ success: 0, errors: [e.message] }); }
  };

  const updateLeadStatus = async (lead, status) => {
    try {
      await api.put(`/leads/${lead.id}`, { status });
      if (selectedCampaign) loadLeads(selectedCampaign);
    } catch (e) { alert('Error updating lead'); }
  };

  const assignRep = async (lead, repId) => {
    try {
      await api.put(`/leads/${lead.id}`, { assigned_rep_id: repId || null });
      if (selectedCampaign) loadLeads(selectedCampaign);
    } catch (e) { alert('Error assigning rep'); }
  };

  const convertLead = async (lead, convertTo) => {
    if (!confirm(`Convert "${lead.name}" to ${convertTo}? This will create a new ${convertTo} record.`)) return;
    try {
      await api.post(`/leads/${lead.id}/convert`, { convert_to: convertTo });
      if (selectedCampaign) loadLeads(selectedCampaign);
      loadData();
      alert(`Lead converted to ${convertTo} successfully!`);
    } catch (e) { alert(e.response?.data?.detail || 'Error converting lead'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold text-gray-900">Campaigns</h2>
          <p className="text-sm text-gray-500 mt-1">Manage ad campaigns and leads</p></div>
        <button onClick={() => setShowCampaignModal(true)} className="bg-gray-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-800">New Campaign</button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Total Campaigns" value={summary.total_campaigns} />
          <SummaryCard label="Active" value={summary.active_campaigns} />
          <SummaryCard label="Total Leads" value={summary.total_leads} />
          <SummaryCard label="Conversion Rate" value={`${summary.conversion_rate}%`} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Campaigns List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-sm border p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Campaigns</h3>
            {loading ? <Loader /> : campaigns.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No campaigns</div>
            ) : (
              <div className="space-y-2">
                {campaigns.map(c => (
                  <button key={c.id} onClick={() => loadLeads(c)}
                    className={`w-full text-left p-3 rounded-lg border ${selectedCampaign?.id === c.id ? 'bg-blue-50 border-blue-500' : 'hover:bg-gray-50'}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-sm">{c.name}</div>
                        <div className="text-xs text-gray-500">{c.source} • {c.start_date}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${c.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100'}`}>{c.status}</span>
                    </div>
                    <div className="flex gap-4 mt-2 text-xs">
                      <span className="text-gray-500">Leads: <strong>{c.lead_stats.total}</strong></span>
                      <span className="text-green-600">Converted: <strong>{c.lead_stats.converted}</strong></span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Leads for Selected Campaign */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">
                {selectedCampaign ? `Leads - ${selectedCampaign.name}` : 'Select a campaign'}
              </h3>
              {selectedCampaign && (
                <button onClick={() => setShowLeadModal(true)} className="text-sm text-blue-600 hover:text-blue-800">+ Add Lead</button>
              )}
            </div>
            
            {selectedCampaign && (
              <div className="flex items-center gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
                <input type="file" accept=".csv" onChange={e => setImportFile(e.target.files[0])} className="text-xs" />
                {importFile && <button onClick={handleImport} className="text-sm bg-gray-900 text-white px-3 py-1 rounded">Import</button>}
                <a href="#" onClick={async (e) => { e.preventDefault(); const res = await api.get('/leads/template/download', { responseType: 'blob' }); const url = window.URL.createObjectURL(new Blob([res.data])); const a = document.createElement('a'); a.href = url; a.download = 'leads_template.csv'; a.click(); }} className="text-xs text-gray-500 hover:text-gray-700">Download Template</a>
              </div>
            )}
            
            {importResult && (
              <div className={`mb-4 p-3 rounded-lg text-sm ${importResult.success > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {importResult.success > 0 ? `✓ Imported ${importResult.success} leads` : 'Import failed'}
              </div>
            )}

            {!selectedCampaign ? (
              <div className="text-center py-12 text-gray-400 text-sm">← Select a campaign to view leads</div>
            ) : leads.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">No leads in this campaign</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b">
                    <th className="text-left py-2 px-2 text-xs text-gray-500">Lead</th>
                    <th className="text-left py-2 px-2 text-xs text-gray-500">Contact</th>
                    <th className="text-left py-2 px-2 text-xs text-gray-500">Rep</th>
                    <th className="text-left py-2 px-2 text-xs text-gray-500">Type</th>
                    <th className="text-left py-2 px-2 text-xs text-gray-500">Status</th>
                    <th className="text-right py-2 px-2 text-xs text-gray-500">Actions</th>
                  </tr></thead>
                  <tbody>
                    {leads.map(l => (
                      <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 px-2">
                          <div className="font-medium">{l.name}</div>
                          <div className="text-xs text-gray-400">{l.lead_id}</div>
                        </td>
                        <td className="py-2 px-2 text-gray-600">{l.mobile || l.email || '-'}</td>
                        <td className="py-2 px-2">
                          <select value={l.rep_id || ''} onChange={e => assignRep(l, e.target.value)} className="text-xs rounded px-1 py-0.5 border">
                            <option value="">Unassigned</option>
                            {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                        </td>
                        <td className="py-2 px-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${
                            l.lead_type === 'customer' ? 'bg-blue-50 text-blue-700' :
                            l.lead_type === 'broker' ? 'bg-purple-50 text-purple-700' : 'bg-gray-100'
                          }`}>{l.lead_type || 'prospect'}</span>
                        </td>
                        <td className="py-2 px-2">
                          <select value={l.status} onChange={e => updateLeadStatus(l, e.target.value)}
                            className={`text-xs rounded px-2 py-1 border-0 ${
                              l.status === 'converted' ? 'bg-green-50 text-green-700' :
                              l.status === 'lost' ? 'bg-red-50 text-red-700' :
                              l.status === 'qualified' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100'
                            }`}>
                            <option value="new">New</option>
                            <option value="contacted">Contacted</option>
                            <option value="qualified">Qualified</option>
                            <option value="converted">Converted</option>
                            <option value="lost">Lost</option>
                          </select>
                        </td>
                        <td className="py-2 px-2 text-right">
                          {l.status !== 'converted' && (
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => convertLead(l, 'customer')} className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100" title="Convert to Customer">→ Customer</button>
                              <button onClick={() => convertLead(l, 'broker')} className="text-xs px-2 py-1 bg-purple-50 text-purple-600 rounded hover:bg-purple-100" title="Convert to Broker">→ Broker</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {showCampaignModal && (
        <Modal title="New Campaign" onClose={() => setShowCampaignModal(false)}>
          <form onSubmit={handleCampaignSubmit} className="space-y-4">
            <Input label="Campaign Name" required value={campaignForm.name} onChange={e => setCampaignForm({...campaignForm, name: e.target.value})} />
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
                <select value={campaignForm.source} onChange={e => setCampaignForm({...campaignForm, source: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="facebook">Facebook</option>
                  <option value="google">Google</option>
                  <option value="instagram">Instagram</option>
                  <option value="referral">Referral</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <Input label="Start Date" type="date" value={campaignForm.start_date} onChange={e => setCampaignForm({...campaignForm, start_date: e.target.value})} />
            </div>
            <Input label="Budget (PKR)" type="number" value={campaignForm.budget} onChange={e => setCampaignForm({...campaignForm, budget: e.target.value})} />
            <Input label="Notes" value={campaignForm.notes} onChange={e => setCampaignForm({...campaignForm, notes: e.target.value})} />
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setShowCampaignModal(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg">Create</button>
            </div>
          </form>
        </Modal>
      )}

      {showLeadModal && (
        <Modal title="Add Lead" onClose={() => setShowLeadModal(false)}>
          <form onSubmit={handleLeadSubmit} className="space-y-4">
            <Input label="Name" required value={leadForm.name} onChange={e => setLeadForm({...leadForm, name: e.target.value})} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Mobile" value={leadForm.mobile} onChange={e => setLeadForm({...leadForm, mobile: e.target.value})} />
              <Input label="Email" type="email" value={leadForm.email} onChange={e => setLeadForm({...leadForm, email: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Lead Type</label>
                <select value={leadForm.lead_type} onChange={e => setLeadForm({...leadForm, lead_type: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="prospect">Prospect</option>
                  <option value="customer">Potential Customer</option>
                  <option value="broker">Potential Broker</option>
                </select>
              </div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Assign to Rep</label>
                <select value={leadForm.assigned_rep_id} onChange={e => setLeadForm({...leadForm, assigned_rep_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Unassigned</option>
                  {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>
            <Input label="Notes" value={leadForm.notes} onChange={e => setLeadForm({...leadForm, notes: e.target.value})} />
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setShowLeadModal(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg">Add</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ============================================
// PAYMENTS VIEW (Outgoing Payments - Commissions, Incentives, Creditors)
// ============================================
function PaymentsView() {
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [brokers, setBrokers] = useState([]);
  const [reps, setReps] = useState([]);
  const [creditors, setCreditors] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [filter, setFilter] = useState({ payment_type: '', status: '', broker_id: '', rep_id: '', creditor_id: '' });
  const [form, setForm] = useState({
    payment_type: 'broker_commission', payee_type: 'broker',
    broker_id: '', company_rep_id: '', creditor_id: '', transaction_id: '',
    amount: '', payment_method: 'bank_transfer', reference_number: '',
    payment_date: new Date().toISOString().split('T')[0], notes: '',
    approved_by_rep_id: '', status: 'completed', allocations: []
  });

  useEffect(() => { loadData(); }, [filter]);
  const loadData = async () => {
    try {
      const params = {};
      if (filter.payment_type) params.payment_type = filter.payment_type;
      if (filter.status) params.status = filter.status;
      if (filter.broker_id) params.broker_id = filter.broker_id;
      if (filter.rep_id) params.rep_id = filter.rep_id;
      if (filter.creditor_id) params.creditor_id = filter.creditor_id;

      const [payRes, sumRes, brkRes, repRes, crdRes] = await Promise.all([
        api.get('/payments', { params }).catch(() => ({ data: [] })),
        api.get('/payments/summary').catch(() => ({ data: { total_payments: 0, total_amount: 0, today_count: 0, today_amount: 0, month_count: 0, month_amount: 0, by_type: {}, pending_count: 0, pending_amount: 0 } })),
        api.get('/brokers').catch(() => ({ data: [] })),
        api.get('/company-reps').catch(() => ({ data: [] })),
        api.get('/creditors').catch(() => ({ data: [] }))
      ]);
      setPayments(payRes.data || []);
      setSummary(sumRes.data);
      setBrokers(brkRes.data || []);
      setReps(repRes.data || []);
      setCreditors(crdRes.data || []);
    } catch (e) {
      console.error(e);
      setSummary({ total_payments: 0, total_amount: 0, today_count: 0, today_amount: 0, month_count: 0, month_amount: 0, by_type: {}, pending_count: 0, pending_amount: 0 });
    }
    finally { setLoading(false); }
  };

  const loadTransactions = async (brokerId) => {
    if (!brokerId) return;
    try {
      const broker = brokers.find(b => b.id === brokerId || b.broker_id === brokerId);
      if (broker) {
        const res = await api.get(`/brokers/${broker.broker_id}`);
        const txnIds = res.data.transactions?.map(t => t.transaction_id) || [];
        const allTxns = await api.get('/transactions');
        setTransactions(allTxns.data.filter(t => txnIds.includes(t.transaction_id)) || []);
      }
    } catch (e) { setTransactions([]); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || parseFloat(form.amount) <= 0) { alert('Enter valid amount'); return; }
    if (form.payment_type === 'broker_commission' && !form.broker_id) { alert('Select broker'); return; }
    if (form.payment_type === 'rep_incentive' && !form.company_rep_id) { alert('Select company rep'); return; }
    if (form.payment_type === 'creditor' && !form.creditor_id) { alert('Select creditor'); return; }
    
    try {
      await api.post('/payments', form);
      setShowModal(false);
      setForm({
        payment_type: 'broker_commission', payee_type: 'broker',
        broker_id: '', company_rep_id: '', creditor_id: '', transaction_id: '',
        amount: '', payment_method: 'bank_transfer', reference_number: '',
        payment_date: new Date().toISOString().split('T')[0], notes: '',
        approved_by_rep_id: '', status: 'completed', allocations: []
      });
      setTransactions([]);
      loadData();
    } catch (e) { alert(e.response?.data?.detail || 'Error'); }
  };

  const updatePaymentType = (type) => {
    setForm({
      ...form,
      payment_type: type,
      payee_type: type === 'broker_commission' ? 'broker' : type === 'rep_incentive' ? 'company_rep' : 'creditor',
      broker_id: type === 'broker_commission' ? form.broker_id : '',
      company_rep_id: type === 'rep_incentive' ? form.company_rep_id : '',
      creditor_id: type === 'creditor' ? form.creditor_id : '',
      transaction_id: ''
    });
    if (type === 'broker_commission' && form.broker_id) {
      loadTransactions(form.broker_id);
    } else {
      setTransactions([]);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold text-gray-900">Payments</h2>
          <p className="text-sm text-gray-500 mt-1">Commission payments, incentives & creditor payments</p></div>
        <button onClick={() => setShowModal(true)} className="bg-gray-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-800">Record Payment</button>
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard label="Total Payments" value={summary.total_payments} />
            <SummaryCard label="Total Paid" value={formatCurrency(summary.total_amount)} />
            <SummaryCard label="Today" value={summary.today_count} sub={formatCurrency(summary.today_amount)} />
            <SummaryCard label="This Month" value={summary.month_count} sub={formatCurrency(summary.month_amount)} />
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border p-4">
              <div className="text-xs text-gray-400 uppercase">Broker Commissions</div>
              <div className="text-lg font-semibold text-blue-600">{formatCurrency(summary.by_type?.broker_commission || 0)}</div>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <div className="text-xs text-gray-400 uppercase">Rep Incentives</div>
              <div className="text-lg font-semibold text-purple-600">{formatCurrency(summary.by_type?.rep_incentive || 0)}</div>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <div className="text-xs text-gray-400 uppercase">Creditor Payments</div>
              <div className="text-lg font-semibold text-orange-600">{formatCurrency(summary.by_type?.creditor || 0)}</div>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <div className="text-xs text-gray-400 uppercase">Pending</div>
              <div className="text-lg font-semibold text-amber-600">{formatCurrency(summary.pending_amount || 0)}</div>
              <div className="text-xs text-gray-500 mt-1">{summary.pending_count} payments</div>
            </div>
          </div>
        </>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Payment Type</label>
            <select value={filter.payment_type} onChange={e => setFilter({...filter, payment_type: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">All Types</option>
              <option value="broker_commission">Broker Commission</option>
              <option value="rep_incentive">Rep Incentive</option>
              <option value="creditor">Creditor</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select value={filter.status} onChange={e => setFilter({...filter, status: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">All Status</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Broker</label>
            <select value={filter.broker_id} onChange={e => setFilter({...filter, broker_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">All Brokers</option>
              {brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Rep</label>
            <select value={filter.rep_id} onChange={e => setFilter({...filter, rep_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">All Reps</option>
              {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Creditor</label>
            <select value={filter.creditor_id} onChange={e => setFilter({...filter, creditor_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">All Creditors</option>
              {creditors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {loading ? <Loader /> : payments.length === 0 ? <Empty msg="No payments recorded" /> : (
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Payment</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Payee</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Type</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4">Amount</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-6 py-4">Method</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Date</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-6 py-4">Status</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {payments.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => { setSelectedPayment(p); setShowDetailModal(true); }}>
                  <td className="px-6 py-4">
                    <div className="text-sm font-mono text-gray-900">{p.payment_id}</div>
                    {p.reference_number && <div className="text-xs text-gray-400">Ref: {p.reference_number}</div>}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium">{p.broker_name || p.rep_name || p.creditor_name || '-'}</div>
                    <div className="text-xs text-gray-400">{p.broker_id || p.rep_id || p.creditor_id || ''}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      p.payment_type === 'broker_commission' ? 'bg-blue-50 text-blue-700' :
                      p.payment_type === 'rep_incentive' ? 'bg-purple-50 text-purple-700' :
                      p.payment_type === 'creditor' ? 'bg-orange-50 text-orange-700' : 'bg-gray-100'
                    }`}>{p.payment_type.replace('_', ' ')}</span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-semibold text-red-600">{formatCurrency(p.amount)}</td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-xs text-gray-600">{p.payment_method || '-'}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{p.payment_date}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      p.status === 'completed' ? 'bg-green-50 text-green-700' :
                      p.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100'
                    }`}>{p.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title="Record Payment" onClose={() => { setShowModal(false); setTransactions([]); }} wide>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="block text-xs font-medium text-gray-500 mb-1">Payment Type *</label>
              <select required value={form.payment_type} onChange={e => updatePaymentType(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="broker_commission">💰 Broker Commission</option>
                <option value="rep_incentive">🎯 Rep Incentive</option>
                <option value="creditor">🏦 Creditor Payment</option>
                <option value="other">📋 Other</option>
              </select>
            </div>

            {form.payment_type === 'broker_commission' && (
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Broker *</label>
                <select required value={form.broker_id} onChange={e => { setForm({...form, broker_id: e.target.value}); loadTransactions(e.target.value); }} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Select Broker</option>
                  {brokers.map(b => <option key={b.id} value={b.id}>{b.name} ({b.broker_id})</option>)}
                </select>
              </div>
            )}

            {form.payment_type === 'rep_incentive' && (
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Company Rep *</label>
                <select required value={form.company_rep_id} onChange={e => setForm({...form, company_rep_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Select Rep</option>
                  {reps.map(r => <option key={r.id} value={r.id}>{r.name} ({r.rep_id})</option>)}
                </select>
              </div>
            )}

            {form.payment_type === 'creditor' && (
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Creditor *</label>
                <select required value={form.creditor_id} onChange={e => setForm({...form, creditor_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Select Creditor</option>
                  {creditors.map(c => <option key={c.id} value={c.id}>{c.name} ({c.creditor_id})</option>)}
                </select>
              </div>
            )}

            {form.payment_type === 'broker_commission' && transactions.length > 0 && (
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Allocate to Transaction (Optional)</label>
                <select value={form.transaction_id} onChange={e => setForm({...form, transaction_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">No specific transaction</option>
                  {transactions.map(t => <option key={t.id} value={t.id}>{t.transaction_id} - {t.project_name} ({formatCurrency(t.total_value)})</option>)}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Input label="Amount *" type="number" required value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} />
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Payment Method</label>
                <select value={form.payment_method} onChange={e => setForm({...form, payment_method: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="cash">💵 Cash</option>
                  <option value="cheque">📝 Cheque</option>
                  <option value="bank_transfer">🏦 Bank Transfer</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Reference #" value={form.reference_number} onChange={e => setForm({...form, reference_number: e.target.value})} />
              <Input label="Payment Date" type="date" value={form.payment_date} onChange={e => setForm({...form, payment_date: e.target.value})} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Approved By</label>
                <select value={form.approved_by_rep_id} onChange={e => setForm({...form, approved_by_rep_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Select Rep</option>
                  {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="completed">✅ Completed</option>
                  <option value="pending">⏳ Pending</option>
                  <option value="cancelled">❌ Cancelled</option>
                </select>
              </div>
            </div>

            <Input label="Notes" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button type="button" onClick={() => { setShowModal(false); setTransactions([]); }} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button type="submit" className="px-6 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">Record Payment</button>
            </div>
          </form>
        </Modal>
      )}

      {showDetailModal && selectedPayment && (
        <PaymentDetailModal 
          payment={selectedPayment} 
          onClose={() => { setShowDetailModal(false); setSelectedPayment(null); }} 
        />
      )}
    </div>
  );
}

// ============================================
// PAYMENT DETAIL MODAL
// ============================================
function PaymentDetailModal({ payment, onClose }) {
  return (
    <Modal title={`Payment: ${payment.payment_id}`} onClose={onClose} wide>
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Payment ID</label>
            <div className="text-sm text-gray-900">{payment.payment_id}</div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Payment Type</label>
            <div className="text-sm text-gray-900">{payment.payment_type?.replace('_', ' ') || '-'}</div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Payee</label>
            <div className="text-sm text-gray-900">{payment.broker_name || payment.rep_name || payment.creditor_name || '-'}</div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Amount</label>
            <div className="text-sm font-semibold text-red-600">{formatCurrency(payment.amount)}</div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Payment Method</label>
            <div className="text-sm text-gray-900">{payment.payment_method || '-'}</div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <div className="text-sm">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                payment.status === 'completed' ? 'bg-green-50 text-green-700' :
                payment.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100'
              }`}>{payment.status}</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Payment Date</label>
            <div className="text-sm text-gray-900">{payment.payment_date || '-'}</div>
          </div>
          {payment.reference_number && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Reference Number</label>
              <div className="text-sm text-gray-900">{payment.reference_number}</div>
            </div>
          )}
          {payment.notes && (
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
              <div className="text-sm text-gray-900">{payment.notes}</div>
            </div>
          )}
        </div>

        {/* Media Attachments */}
        <div className="border-t pt-4">
          <MediaManager 
            entityType="payment" 
            entityId={payment.id || payment.payment_id}
            onUpload={() => {}}
          />
        </div>
      </div>
    </Modal>
  );
}

// ============================================
// DASHBOARD VIEW
// ============================================
function DashboardView() {
  const [summary, setSummary] = useState(null);
  const [customerStats, setCustomerStats] = useState([]);
  const [projectStats, setProjectStats] = useState([]);
  const [brokerStats, setBrokerStats] = useState([]);
  const [topReceivables, setTopReceivables] = useState([]);
  const [projectInventory, setProjectInventory] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedBroker, setSelectedBroker] = useState(null);
  const [customerDetails, setCustomerDetails] = useState(null);
  const [brokerDetails, setBrokerDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);
  const loadData = async () => {
    try {
      const [sumRes, custRes, projRes, brkRes, recRes, invRes] = await Promise.all([
        api.get('/dashboard/summary').catch(() => ({ data: null })),
        api.get('/dashboard/customer-stats').catch(() => ({ data: [] })),
        api.get('/dashboard/project-stats').catch(() => ({ data: [] })),
        api.get('/dashboard/broker-stats').catch(() => ({ data: [] })),
        api.get('/dashboard/top-receivables?limit=10').catch(() => ({ data: [] })),
        api.get('/dashboard/project-inventory').catch(() => ({ data: [] }))
      ]);
      setSummary(sumRes.data);
      setCustomerStats(custRes.data || []);
      setProjectStats(projRes.data || []);
      setBrokerStats(brkRes.data || []);
      setTopReceivables(recRes.data || []);
      setProjectInventory(invRes.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadCustomerDetails = async (customerId) => {
    try {
      const res = await api.get(`/customers/${customerId}/details`);
      setCustomerDetails(res.data);
      setSelectedCustomer(customerId);
    } catch (e) { alert('Error loading customer details'); }
  };

  const loadBrokerDetails = async (brokerId) => {
    try {
      const res = await api.get(`/brokers/${brokerId}/details`);
      setBrokerDetails(res.data);
      setSelectedBroker(brokerId);
    } catch (e) { alert('Error loading broker details'); }
  };

  const topBroker = brokerStats.length > 0 ? brokerStats.sort((a, b) => b.total_sale_value - a.total_sale_value)[0] : null;

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-semibold text-gray-900">Dashboard</h2>
        <p className="text-sm text-gray-500 mt-1">Comprehensive system overview & analytics</p></div>

      {loading ? <Loader /> : summary && (
        <>
          {/* Key Metrics Row 1 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard label="Total Customers" value={summary.customers?.total} />
            <SummaryCard label="Total Transactions" value={summary.transactions?.total} />
            <SummaryCard label="Total Sale Value" value={formatCurrency(summary.financials?.total_sale)} />
            <SummaryCard label="Total Received" value={formatCurrency(summary.financials?.total_received)} />
          </div>

          {/* Outstanding Breakdown - NEW */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl shadow-sm border p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Outstanding Breakdown</h3>
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-red-50 rounded-lg border-l-4 border-red-500">
                  <div className="text-xs font-medium text-red-600 uppercase mb-1">Total Overdue</div>
                  <div className="text-2xl font-bold text-red-700">{formatCurrency(summary.financials?.total_overdue || 0)}</div>
                  <div className="text-xs text-red-600 mt-1">Installments due on or before today</div>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
                  <div className="text-xs font-medium text-blue-600 uppercase mb-1">Future Receivable</div>
                  <div className="text-2xl font-bold text-blue-700">{formatCurrency(summary.financials?.future_receivable || 0)}</div>
                  <div className="text-xs text-blue-600 mt-1">Not due yet</div>
                </div>
                <div className="pt-3 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-600">Total Outstanding</span>
                    <span className="text-lg font-semibold text-gray-900">{formatCurrency(summary.financials?.total_outstanding)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Broker Performance Card - NEW */}
            {topBroker && (
              <div className="bg-white rounded-2xl shadow-sm border p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Top Broker Performance</h3>
                  <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded">#1</span>
                </div>
                <div className="space-y-4">
                  <div>
                    <button onClick={() => loadBrokerDetails(topBroker.broker_id)} className="text-left w-full hover:bg-gray-50 p-2 rounded-lg transition-colors">
                      <div className="font-semibold text-gray-900">{topBroker.name}</div>
                      <div className="text-xs text-gray-500">{topBroker.broker_id} • {topBroker.mobile}</div>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t">
                    <div>
                      <div className="text-xs text-gray-500">Total Sales</div>
                      <div className="text-lg font-semibold">{formatCurrency(topBroker.total_sale_value)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Transactions</div>
                      <div className="text-lg font-semibold">{topBroker.total_transactions}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Commission Rate</div>
                      <div className="text-lg font-semibold">{topBroker.commission?.rate}%</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Commission Earned</div>
                      <div className="text-lg font-semibold text-green-600">{formatCurrency(topBroker.commission?.total_earned)}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Key Metrics Row 2 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard label="This Month Sale" value={formatCurrency(summary.transactions?.this_month_value)} />
            <SummaryCard label="Active Projects" value={summary.projects?.active} />
            <SummaryCard label="Available Inventory" value={summary.inventory?.available} sub={`${summary.inventory?.total} total units`} />
            <SummaryCard label="Active Brokers" value={summary.brokers?.active} />
          </div>

          {/* Project Inventory Details - NEW */}
          {projectInventory.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border p-6">
              <h3 className="text-lg font-semibold mb-4">Project-Wise Inventory Analysis</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-semibold text-gray-700">Project</th>
                      <th className="text-right p-3 font-semibold text-gray-700">Total Units</th>
                      <th className="text-right p-3 font-semibold text-gray-700">Available</th>
                      <th className="text-right p-3 font-semibold text-gray-700">Sold</th>
                      <th className="text-right p-3 font-semibold text-gray-700">Total Marlas</th>
                      <th className="text-right p-3 font-semibold text-gray-700">Available Marlas</th>
                      <th className="text-right p-3 font-semibold text-gray-700">Total Value</th>
                      <th className="text-right p-3 font-semibold text-gray-700">Available Value</th>
                      <th className="text-right p-3 font-semibold text-gray-700">Utilization</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectInventory.map(p => (
                      <tr key={p.project_id} className="border-b hover:bg-gray-50">
                        <td className="p-3">
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-gray-500">{p.location || 'N/A'}</div>
                        </td>
                        <td className="text-right p-3">{p.summary.total_units}</td>
                        <td className="text-right p-3 text-green-600 font-medium">{p.summary.available_units}</td>
                        <td className="text-right p-3 text-blue-600 font-medium">{p.summary.sold_units}</td>
                        <td className="text-right p-3">{p.area.total_marlas.toFixed(2)}</td>
                        <td className="text-right p-3 text-green-600">{p.area.available_marlas.toFixed(2)}</td>
                        <td className="text-right p-3 font-medium">{formatCurrency(p.value.total_value)}</td>
                        <td className="text-right p-3 text-green-600 font-medium">{formatCurrency(p.value.available_value)}</td>
                        <td className="text-right p-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            p.summary.utilization_rate >= 80 ? 'bg-green-100 text-green-800' :
                            p.summary.utilization_rate >= 50 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {p.summary.utilization_rate.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Top Receivables by Customer - NEW */}
          {topReceivables.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border p-6">
              <h3 className="text-lg font-semibold mb-4">Top Receivables by Customer</h3>
              <div className="space-y-3">
                {topReceivables.map(c => (
                  <div key={c.customer_id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <button onClick={() => loadCustomerDetails(c.customer_id)} className="text-left hover:text-blue-600 transition-colors">
                          <div className="font-semibold text-gray-900">{c.customer_name}</div>
                          <div className="text-xs text-gray-500">{c.customer_id} • {c.mobile}</div>
                        </button>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-gray-900">{formatCurrency(c.total_outstanding)}</div>
                        <div className="text-xs text-gray-500">{c.transaction_count} transactions</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 pt-3 border-t">
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Overdue</div>
                        <div className="text-sm font-semibold text-red-600">{formatCurrency(c.overdue)}</div>
                        <div className="text-xs text-gray-400">{c.overdue_installments.length} installments</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Future Receivable</div>
                        <div className="text-sm font-semibold text-blue-600">{formatCurrency(c.future_receivable)}</div>
                        <div className="text-xs text-gray-400">{c.future_installments.length} installments</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Total Sale</div>
                        <div className="text-sm font-semibold text-gray-900">{formatCurrency(c.total_sale)}</div>
                        <div className="text-xs text-gray-400">{formatCurrency(c.total_received)} received</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Customers */}
          {customerStats.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border p-6">
              <h3 className="text-lg font-semibold mb-4">Top Customers by Sale Value</h3>
              <div className="space-y-2">
                {customerStats.sort((a, b) => b.total_sale - a.total_sale).slice(0, 5).map(c => (
                  <div key={c.customer_id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div>
                      <button onClick={() => loadCustomerDetails(c.customer_id)} className="text-left hover:text-blue-600 transition-colors">
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-gray-500">{c.customer_id}</div>
                      </button>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{formatCurrency(c.total_sale)}</div>
                      <div className="text-xs text-gray-500">{c.transaction_count} transactions</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Projects */}
          {projectStats.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border p-6">
              <h3 className="text-lg font-semibold mb-4">Project Performance</h3>
              <div className="space-y-2">
                {projectStats.sort((a, b) => b.financials.total_sale - a.financials.total_sale).slice(0, 5).map(p => (
                  <div key={p.project_id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-gray-500">{p.project_id}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{formatCurrency(p.financials.total_sale)}</div>
                      <div className="text-xs text-gray-500">{p.transaction_count} transactions</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Customer Details Modal */}
      {selectedCustomer && customerDetails && (
        <CustomerDetailModal 
          customer={customerDetails} 
          onClose={() => { setSelectedCustomer(null); setCustomerDetails(null); }} 
        />
      )}

      {/* Broker Details Modal */}
      {selectedBroker && brokerDetails && (
        <BrokerDetailModal 
          broker={brokerDetails} 
          onClose={() => { setSelectedBroker(null); setBrokerDetails(null); }} 
        />
      )}
    </div>
  );
}

// ============================================
// REPORTS VIEW
// ============================================
function ReportsView() {
  const [customers, setCustomers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedBroker, setSelectedBroker] = useState(null);
  const [customerReport, setCustomerReport] = useState(null);
  const [projectReport, setProjectReport] = useState(null);
  const [brokerReport, setBrokerReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState('customer');
  const [expandedTransactions, setExpandedTransactions] = useState(new Set());
  const [expandedInventory, setExpandedInventory] = useState(false);

  useEffect(() => { loadData(); }, []);
  const loadData = async () => {
    try {
      const [custRes, projRes, brkRes] = await Promise.all([
        api.get('/customers').catch(() => ({ data: [] })),
        api.get('/projects').catch(() => ({ data: [] })),
        api.get('/brokers').catch(() => ({ data: [] }))
      ]);
      setCustomers(custRes.data || []);
      setProjects(projRes.data || []);
      setBrokers(brkRes.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadCustomerReport = async (customerId) => {
    try {
      setLoading(true);
      const res = await api.get(`/reports/customers/detailed/${customerId}`);
      setCustomerReport(res.data);
      setSelectedCustomer(customerId);
    } catch (e) { 
      alert('Error loading report: ' + (e.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  const loadProjectReport = async (projectId) => {
    try {
      setLoading(true);
      const res = await api.get(`/reports/projects/${projectId}`);
      setProjectReport(res.data);
      setSelectedProject(projectId);
    } catch (e) { 
      alert('Error loading report: ' + (e.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  const loadBrokerReport = async (brokerId) => {
    try {
      setLoading(true);
      const res = await api.get(`/reports/brokers/${brokerId}`);
      setBrokerReport(res.data);
      setSelectedBroker(brokerId);
    } catch (e) { 
      alert('Error loading report: ' + (e.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async (type, id) => {
    try {
      let url = '';
      if (type === 'customer') url = `/api/reports/customers/pdf/${id}`;
      else if (type === 'project') url = `/api/reports/projects/pdf/${id}`;
      else if (type === 'broker') url = `/api/reports/brokers/pdf/${id}`;
      
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${type}_${id}_report.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (e) { alert('Error downloading PDF'); }
  };

  const downloadExcel = async (type) => {
    try {
      let url = '';
      if (type === 'customer') url = '/api/reports/customers/excel';
      else if (type === 'project') url = '/api/reports/projects/excel';
      else if (type === 'broker') url = '/api/reports/brokers/excel';
      
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${type}s_report.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (e) { alert('Error downloading Excel'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold text-gray-900">Reports & Analytics</h2>
          <p className="text-sm text-gray-500 mt-1">Generate detailed reports and exports</p></div>
      </div>

      {/* Report Type Selector */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex gap-2">
          <button onClick={() => setReportType('customer')} className={`px-4 py-2 rounded-lg text-sm font-medium ${reportType === 'customer' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}>
            Customer Reports
          </button>
          <button onClick={() => setReportType('project')} className={`px-4 py-2 rounded-lg text-sm font-medium ${reportType === 'project' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}>
            Project Reports
          </button>
          <button onClick={() => setReportType('broker')} className={`px-4 py-2 rounded-lg text-sm font-medium ${reportType === 'broker' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}>
            Broker Reports
          </button>
        </div>
      </div>

      {reportType === 'customer' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border p-4">
              <h3 className="text-sm font-medium text-gray-600 mb-2">Select Customer</h3>
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {customers.map(c => (
                  <button key={c.id} onClick={() => loadCustomerReport(c.id)}
                    className={`w-full text-left p-2 rounded text-xs ${selectedCustomer === c.id ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'}`}>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-gray-500">{c.customer_id}</div>
                  </button>
                ))}
              </div>
              <button onClick={() => downloadExcel('customer')} className="mt-3 w-full px-3 py-2 bg-gray-800 text-white rounded text-xs font-medium hover:bg-gray-900">
                Export All (Excel)
              </button>
            </div>

            {customerReport ? (
              <div className="lg:col-span-3 space-y-4">
                {/* Report Header */}
                <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-lg border border-gray-700 p-6 text-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-2xl font-bold mb-1">{customerReport.report_header?.title || 'Customer Detailed Financial Report'}</h2>
                      <div className="text-sm text-gray-300">
                        Generated via <span className="font-semibold text-white">ORBIT</span>
                        {customerReport.report_header?.generated_at && (
                          <span className="ml-4">• {new Date(customerReport.report_header.generated_at).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => downloadPDF('customer', customerReport.customer.customer_id)} 
                      className="px-4 py-2 bg-white text-gray-900 rounded text-sm font-medium hover:bg-gray-100">
                      Export PDF
                    </button>
                  </div>
                </div>

                {/* Customer Info Header */}
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">{customerReport.customer.name}</h3>
                      <div className="text-sm text-gray-600 mt-1">
                        {customerReport.customer.customer_id} • {customerReport.customer.mobile}
                        {customerReport.customer.email && ` • ${customerReport.customer.email}`}
                      </div>
                      {customerReport.customer.address && (
                        <div className="text-sm text-gray-500 mt-1">{customerReport.customer.address}</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Financial Summary Cards */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Total Sale</div>
                    <div className="text-2xl font-semibold text-gray-900">{formatCurrency(customerReport.financials.total_sale)}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Total Received</div>
                    <div className="text-2xl font-semibold text-green-700">{formatCurrency(customerReport.financials.total_received)}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Overdue</div>
                    <div className="text-2xl font-semibold text-red-600">{formatCurrency(customerReport.financials.overdue)}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Future Receivable</div>
                    <div className="text-2xl font-semibold text-blue-600">{formatCurrency(customerReport.financials.future_receivable)}</div>
                  </div>
                </div>

                {/* Transactions Table */}
                <div className="bg-white rounded-lg border">
                  <div className="p-4 border-b">
                    <h4 className="font-semibold text-gray-900">Transactions ({customerReport.transactions.length})</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Transaction ID</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Project</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Unit</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Area (Marla)</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Total Value</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Received</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Balance</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {customerReport.transactions.map((txn, idx) => (
                          <React.Fragment key={idx}>
                            <tr className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-mono text-xs">{txn.transaction_id}</td>
                              <td className="px-4 py-3">{txn.project_name || '-'}</td>
                              <td className="px-4 py-3">{txn.unit_number || '-'}</td>
                              <td className="px-4 py-3 text-right">{txn.area_marla.toFixed(2)}</td>
                              <td className="px-4 py-3 text-right font-medium">{formatCurrency(txn.total_value)}</td>
                              <td className="px-4 py-3 text-right text-green-700">{formatCurrency(txn.received)}</td>
                              <td className="px-4 py-3 text-right">{formatCurrency(txn.balance)}</td>
                              <td className="px-4 py-3">
                                <button onClick={() => {
                                  const newExpanded = new Set(expandedTransactions);
                                  if (newExpanded.has(idx)) newExpanded.delete(idx);
                                  else newExpanded.add(idx);
                                  setExpandedTransactions(newExpanded);
                                }} className="text-gray-600 hover:text-gray-900">
                                  {expandedTransactions.has(idx) ? '▼' : '▶'}
                                </button>
                              </td>
                            </tr>
                            {expandedTransactions.has(idx) && txn.installments && (
                              <tr>
                                <td colSpan="8" className="px-4 py-3 bg-gray-50">
                                  <div className="text-xs">
                                    <div className="font-semibold mb-2">Installments:</div>
                                    <table className="w-full">
                                      <thead>
                                        <tr className="border-b">
                                          <th className="text-left py-1">#</th>
                                          <th className="text-left py-1">Due Date</th>
                                          <th className="text-right py-1">Amount</th>
                                          <th className="text-right py-1">Paid</th>
                                          <th className="text-right py-1">Balance</th>
                                          <th className="text-left py-1">Status</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {txn.installments.map((inst, i) => (
                                          <tr key={i} className={inst.is_overdue ? 'text-red-600' : ''}>
                                            <td className="py-1">{inst.number}</td>
                                            <td className="py-1">{inst.due_date}</td>
                                            <td className="text-right py-1">{formatCurrency(inst.amount)}</td>
                                            <td className="text-right py-1">{formatCurrency(inst.paid)}</td>
                                            <td className="text-right py-1 font-medium">{formatCurrency(inst.balance)}</td>
                                            <td className="py-1">
                                              <span className={`px-2 py-0.5 rounded text-xs ${inst.is_overdue ? 'bg-red-100 text-red-700' : 'bg-gray-100'}`}>
                                                {inst.status}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Interactions History */}
                <div className="bg-white rounded-lg border">
                  <div className="p-4 border-b">
                    <h4 className="font-semibold text-gray-900">Interactions History ({customerReport.interactions.total_count})</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Rep</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Notes</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Next Follow-up</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {customerReport.interactions.history.map((interaction, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-xs">{new Date(interaction.date).toLocaleDateString()}</td>
                            <td className="px-4 py-3">{interaction.type}</td>
                            <td className="px-4 py-3">{interaction.rep_name || '-'}</td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded text-xs bg-gray-100">{interaction.status}</span>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600">{interaction.notes || '-'}</td>
                            <td className="px-4 py-3 text-xs">{interaction.next_follow_up ? new Date(interaction.next_follow_up).toLocaleDateString() : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Installment Schedule */}
                {customerReport.installment_schedule && customerReport.installment_schedule.length > 0 && (
                  <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                    <div className="p-4 border-b border-gray-200 bg-gray-50">
                      <h4 className="font-semibold text-gray-900">Complete Installment Schedule</h4>
                      <p className="text-xs text-gray-600 mt-1">All installments with due dates, balances, and receipt allocations</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">#</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Project</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Due Date</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Amount</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Paid</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Balance</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Days Outstanding</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Receipts</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {customerReport.installment_schedule.map((inst, idx) => (
                            <tr key={idx} className={`hover:bg-gray-50 ${inst.is_overdue ? 'bg-red-50' : ''}`}>
                              <td className="px-4 py-3 font-medium">{inst.number}</td>
                              <td className="px-4 py-3 text-xs text-gray-600">{inst.project_name || '-'}</td>
                              <td className="px-4 py-3">{inst.due_date ? new Date(inst.due_date).toLocaleDateString() : '-'}</td>
                              <td className="px-4 py-3 text-right">{formatCurrency(inst.amount)}</td>
                              <td className="px-4 py-3 text-right text-green-700">{formatCurrency(inst.paid)}</td>
                              <td className={`px-4 py-3 text-right font-medium ${inst.is_overdue ? 'text-red-600' : 'text-gray-900'}`}>
                                {formatCurrency(inst.balance)}
                              </td>
                              <td className={`px-4 py-3 text-right ${inst.days_outstanding > 0 ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                                {inst.days_outstanding !== null ? `${inst.days_outstanding} days` : '-'}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded text-xs ${
                                  inst.is_overdue ? 'bg-red-100 text-red-700' : 
                                  inst.status === 'paid' ? 'bg-green-100 text-green-700' : 
                                  'bg-gray-100 text-gray-700'
                                }`}>
                                  {inst.status}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {inst.receipt_allocations && inst.receipt_allocations.length > 0 ? (
                                  <div className="text-xs">
                                    {inst.receipt_allocations.map((rec, rIdx) => (
                                      <div key={rIdx} className="text-gray-600">
                                        {rec.receipt_id}: {formatCurrency(rec.amount)}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-xs">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Unallocated Receipts */}
                {customerReport.unallocated_receipts && customerReport.unallocated_receipts.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <h4 className="font-semibold text-amber-900 mb-3">Unallocated Receipts</h4>
                    <p className="text-xs text-amber-700 mb-3">These receipts need to be allocated to installments</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-amber-100 border-b border-amber-200">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-amber-900">Receipt ID</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-amber-900">Payment Date</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-amber-900">Method</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-amber-900">Total Amount</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-amber-900">Allocated</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-amber-900">Unallocated</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-200">
                          {customerReport.unallocated_receipts.map((rec, idx) => (
                            <tr key={idx} className="hover:bg-amber-100">
                              <td className="px-4 py-2 font-mono text-xs">{rec.receipt_id}</td>
                              <td className="px-4 py-2 text-xs">{rec.payment_date ? new Date(rec.payment_date).toLocaleDateString() : '-'}</td>
                              <td className="px-4 py-2 text-xs">{rec.payment_method || '-'}</td>
                              <td className="px-4 py-2 text-right font-medium">{formatCurrency(rec.total_amount)}</td>
                              <td className="px-4 py-2 text-right text-green-700">{formatCurrency(rec.allocated_amount)}</td>
                              <td className="px-4 py-2 text-right font-semibold text-amber-700">{formatCurrency(rec.unallocated_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Receipts Summary */}
                {customerReport.receipts && (
                  <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                    <h4 className="font-semibold text-gray-900 mb-3">Receipts Summary</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-gray-600">Total Receipts: <span className="font-semibold">{customerReport.receipts.total_count}</span></div>
                        <div className="text-gray-600 mt-1">Total Amount: <span className="font-semibold">{formatCurrency(customerReport.receipts.total_amount)}</span></div>
                      </div>
                      <div>
                        <div className="text-gray-600 mb-1">By Payment Method:</div>
                        {Object.entries(customerReport.receipts.by_method || {}).map(([method, amount]) => (
                          <div key={method} className="text-xs text-gray-600">
                            {method}: {formatCurrency(amount)}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="lg:col-span-3 bg-white rounded-lg border p-12 text-center text-gray-400">
                {loading ? 'Loading report...' : 'Select a customer to view detailed report'}
              </div>
            )}
          </div>
        </div>
      )}

      {reportType === 'project' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border p-4">
              <h3 className="text-sm font-medium text-gray-600 mb-2">Select Project</h3>
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {projects.map(p => (
                  <button key={p.id} onClick={() => loadProjectReport(p.id)}
                    className={`w-full text-left p-2 rounded text-xs ${selectedProject === p.id ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'}`}>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-gray-500">{p.project_id}</div>
                  </button>
                ))}
              </div>
              <button onClick={() => downloadExcel('project')} className="mt-3 w-full px-3 py-2 bg-gray-800 text-white rounded text-xs font-medium hover:bg-gray-900">
                Export All (Excel)
              </button>
            </div>

            {projectReport ? (
              <div className="lg:col-span-3 space-y-4">
                {/* Report Header */}
                <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-lg border border-gray-700 p-6 text-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-2xl font-bold mb-1">{projectReport.report_header?.title || 'Project Financial Report'}</h2>
                      <div className="text-sm text-gray-300">
                        Generated via <span className="font-semibold text-white">ORBIT</span>
                        {projectReport.report_header?.generated_at && (
                          <span className="ml-4">• {new Date(projectReport.report_header.generated_at).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => downloadPDF('project', projectReport.project.project_id)} 
                      className="px-4 py-2 bg-white text-gray-900 rounded text-sm font-medium hover:bg-gray-100">
                      Export PDF
                    </button>
                  </div>
                </div>

                {/* Project Info Header */}
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">{projectReport.project.name}</h3>
                      <div className="text-sm text-gray-600 mt-1">
                        {projectReport.project.project_id} • {projectReport.project.location}
                      </div>
                      {projectReport.project.description && (
                        <div className="text-sm text-gray-500 mt-2">{projectReport.project.description}</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Financial Summary Cards */}
                <div className="grid grid-cols-5 gap-4">
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Total Sale</div>
                    <div className="text-xl font-semibold text-gray-900">{formatCurrency(projectReport.financials.total_sale)}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Total Received</div>
                    <div className="text-xl font-semibold text-green-700">{formatCurrency(projectReport.financials.total_received)}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Overdue</div>
                    <div className="text-xl font-semibold text-red-600">{formatCurrency(projectReport.financials.overdue)}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Future Receivable</div>
                    <div className="text-xl font-semibold text-blue-600">{formatCurrency(projectReport.financials.future_receivable)}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Outstanding</div>
                    <div className="text-xl font-semibold text-gray-900">{formatCurrency(projectReport.financials.outstanding)}</div>
                  </div>
                </div>

                {/* Inventory Summary */}
                <div className="bg-white rounded-lg border p-4">
                  <h4 className="font-semibold text-gray-900 mb-3">Inventory Summary</h4>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600">Total Units: <span className="font-semibold">{projectReport.inventory.total_units}</span></div>
                      <div className="text-gray-600 mt-1">Available: <span className="font-semibold text-green-700">{projectReport.inventory.available_units}</span></div>
                      <div className="text-gray-600 mt-1">Sold: <span className="font-semibold">{projectReport.inventory.sold_units}</span></div>
                    </div>
                    <div>
                      <div className="text-gray-600">Total Marlas: <span className="font-semibold">{projectReport.inventory.total_marlas.toFixed(2)}</span></div>
                      <div className="text-gray-600 mt-1">Available: <span className="font-semibold text-green-700">{projectReport.inventory.available_marlas.toFixed(2)}</span></div>
                      <div className="text-gray-600 mt-1">Sold: <span className="font-semibold">{projectReport.inventory.sold_marlas.toFixed(2)}</span></div>
                    </div>
                    <div>
                      <div className="text-gray-600">Total Value: <span className="font-semibold">{formatCurrency(projectReport.inventory.total_value)}</span></div>
                      <div className="text-gray-600 mt-1">Available Value: <span className="font-semibold text-green-700">{formatCurrency(projectReport.inventory.available_value)}</span></div>
                      <div className="text-gray-600 mt-1">Sold Value: <span className="font-semibold">{formatCurrency(projectReport.inventory.sold_value)}</span></div>
                    </div>
                  </div>
                </div>

                {/* Marla-wise Breakdown */}
                {projectReport.inventory.marla_wise_breakdown && (
                  <div className="bg-white rounded-lg border">
                    <div className="p-4 border-b flex items-center justify-between">
                      <h4 className="font-semibold text-gray-900">Marla-wise Inventory Breakdown</h4>
                      <button onClick={() => setExpandedInventory(!expandedInventory)} className="text-xs text-gray-600 hover:text-gray-900">
                        {expandedInventory ? 'Hide' : 'Show'} Details
                      </button>
                    </div>
                    {expandedInventory && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Marla Range</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Total Units</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Available</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Sold</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Total Marlas</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Total Value</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Available Value</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Sold Value</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {projectReport.inventory.marla_wise_breakdown.map((range, idx) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-4 py-3 font-medium">{range.range}</td>
                                <td className="px-4 py-3 text-right">{range.total_units}</td>
                                <td className="px-4 py-3 text-right text-green-700">{range.available_units}</td>
                                <td className="px-4 py-3 text-right">{range.sold_units}</td>
                                <td className="px-4 py-3 text-right">{range.total_marlas.toFixed(2)}</td>
                                <td className="px-4 py-3 text-right">{formatCurrency(range.total_value)}</td>
                                <td className="px-4 py-3 text-right text-green-700">{formatCurrency(range.available_value)}</td>
                                <td className="px-4 py-3 text-right">{formatCurrency(range.sold_value)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Inventory Details */}
                <div className="bg-white rounded-lg border">
                  <div className="p-4 border-b">
                    <h4 className="font-semibold text-gray-900">Inventory Details ({projectReport.inventory.details.length})</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Unit Number</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Block</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Area (Marla)</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Rate/Marla</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Total Value</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {projectReport.inventory.details.map((item, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3">{item.unit_number || '-'}</td>
                            <td className="px-4 py-3">{item.unit_type || '-'}</td>
                            <td className="px-4 py-3">{item.block || '-'}</td>
                            <td className="px-4 py-3 text-right">{item.area_marla.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(item.rate_per_marla)}</td>
                            <td className="px-4 py-3 text-right font-medium">{formatCurrency(item.total_value)}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded text-xs ${item.status === 'available' ? 'bg-green-100 text-green-700' : 'bg-gray-100'}`}>
                                {item.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Customer-wise Top Receivables */}
                {projectReport.customer_receivables && projectReport.customer_receivables.length > 0 && (
                  <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                    <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                      <h4 className="font-semibold text-gray-900 text-lg">Customer-wise Top Receivables</h4>
                      <p className="text-xs text-gray-600 mt-1">Grouped by customer with installment schedules - For CFO/COO Review</p>
                    </div>
                    <div className="divide-y divide-gray-200">
                      {projectReport.customer_receivables.map((customer, idx) => (
                        <div key={idx} className="p-4 hover:bg-gray-50">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h5 className="font-semibold text-gray-900">{customer.customer_name}</h5>
                              <div className="text-xs text-gray-600 mt-1">
                                {customer.customer_id} • {customer.mobile}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-gray-600">Total Outstanding</div>
                              <div className="text-lg font-bold text-red-600">{formatCurrency(customer.total_outstanding)}</div>
                              <div className="text-xs text-gray-500 mt-1">
                                Overdue: {formatCurrency(customer.total_overdue)} • Future: {formatCurrency(customer.total_future)}
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead className="bg-gray-100 border-b">
                                <tr>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-700">#</th>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Unit</th>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Due Date</th>
                                  <th className="px-3 py-2 text-right font-semibold text-gray-700">Amount</th>
                                  <th className="px-3 py-2 text-right font-semibold text-gray-700">Paid</th>
                                  <th className="px-3 py-2 text-right font-semibold text-gray-700">Balance</th>
                                  <th className="px-3 py-2 text-right font-semibold text-gray-700">Days Outstanding</th>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {customer.installments.map((inst, iIdx) => (
                                  <tr key={iIdx} className={inst.is_overdue ? 'bg-red-50' : ''}>
                                    <td className="px-3 py-2">{inst.installment_number}</td>
                                    <td className="px-3 py-2 text-gray-600">{inst.unit_number || '-'}</td>
                                    <td className="px-3 py-2">{inst.due_date ? new Date(inst.due_date).toLocaleDateString() : '-'}</td>
                                    <td className="px-3 py-2 text-right">{formatCurrency(inst.amount)}</td>
                                    <td className="px-3 py-2 text-right text-green-700">{formatCurrency(inst.paid)}</td>
                                    <td className={`px-3 py-2 text-right font-medium ${inst.is_overdue ? 'text-red-600' : 'text-gray-900'}`}>
                                      {formatCurrency(inst.balance)}
                                    </td>
                                    <td className={`px-3 py-2 text-right ${inst.days_outstanding > 0 ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                                      {inst.days_outstanding !== null ? `${inst.days_outstanding} days` : '-'}
                                    </td>
                                    <td className="px-3 py-2">
                                      <span className={`px-2 py-0.5 rounded text-xs ${
                                        inst.is_overdue ? 'bg-red-100 text-red-700' : 
                                        'bg-gray-100 text-gray-700'
                                      }`}>
                                        {inst.is_overdue ? 'Overdue' : 'Pending'}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Transactions Table */}
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                  <div className="p-4 border-b border-gray-200">
                    <h4 className="font-semibold text-gray-900">All Transactions ({projectReport.transactions.length})</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Transaction ID</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Customer</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Broker</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Unit</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Area (Marla)</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Total Value</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Received</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {projectReport.transactions.map((txn, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono text-xs">{txn.transaction_id}</td>
                            <td className="px-4 py-3">{txn.customer_name || '-'}</td>
                            <td className="px-4 py-3">{txn.broker_name || '-'}</td>
                            <td className="px-4 py-3">{txn.unit_number || '-'}</td>
                            <td className="px-4 py-3 text-right">{txn.area_marla.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right font-medium">{formatCurrency(txn.total_value)}</td>
                            <td className="px-4 py-3 text-right text-green-700">{formatCurrency(txn.received)}</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(txn.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="lg:col-span-3 bg-white rounded-lg border p-12 text-center text-gray-400">
                {loading ? 'Loading report...' : 'Select a project to view detailed report'}
              </div>
            )}
          </div>
        </div>
      )}

      {reportType === 'broker' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border p-4">
              <h3 className="text-sm font-medium text-gray-600 mb-2">Select Broker</h3>
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {brokers.map(b => (
                  <button key={b.id} onClick={() => loadBrokerReport(b.id)}
                    className={`w-full text-left p-2 rounded text-xs ${selectedBroker === b.id ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'}`}>
                    <div className="font-medium">{b.name}</div>
                    <div className="text-gray-500">{b.broker_id}</div>
                  </button>
                ))}
              </div>
              <button onClick={() => downloadExcel('broker')} className="mt-3 w-full px-3 py-2 bg-gray-800 text-white rounded text-xs font-medium hover:bg-gray-900">
                Export All (Excel)
              </button>
            </div>

            {brokerReport ? (
              <div className="lg:col-span-3 space-y-4">
                {/* Report Header */}
                <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-lg border border-gray-700 p-6 text-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-2xl font-bold mb-1">{brokerReport.report_header?.title || 'Broker Detailed Report'}</h2>
                      <div className="text-sm text-gray-300">
                        Generated via <span className="font-semibold text-white">ORBIT</span>
                        {brokerReport.report_header?.generated_at && (
                          <span className="ml-4">• {new Date(brokerReport.report_header.generated_at).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => downloadPDF('broker', brokerReport.broker.broker_id)} 
                      className="px-4 py-2 bg-white text-gray-900 rounded text-sm font-medium hover:bg-gray-100">
                      Export PDF
                    </button>
                  </div>
                </div>

                {/* Broker Info Header */}
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">{brokerReport.broker.name}</h3>
                      <div className="text-sm text-gray-600 mt-1">
                        {brokerReport.broker.broker_id} • {brokerReport.broker.mobile}
                        {brokerReport.broker.email && ` • ${brokerReport.broker.email}`}
                      </div>
                      {brokerReport.broker.company && (
                        <div className="text-sm text-gray-500 mt-1">Company: {brokerReport.broker.company}</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Commission Summary Cards */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Total Commission Earned</div>
                    <div className="text-2xl font-semibold text-gray-900">{formatCurrency(brokerReport.commission.total_earned)}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Total Commission Paid</div>
                    <div className="text-2xl font-semibold text-green-700">{formatCurrency(brokerReport.commission.total_paid)}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Pending Commission</div>
                    <div className="text-2xl font-semibold text-amber-600">{formatCurrency(brokerReport.commission.pending)}</div>
                  </div>
                </div>

                {/* Financial Summary Cards */}
                <div className="grid grid-cols-5 gap-4">
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Total Sale Value</div>
                    <div className="text-xl font-semibold text-gray-900">{formatCurrency(brokerReport.financials.total_sale_value)}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Total Received</div>
                    <div className="text-xl font-semibold text-green-700">{formatCurrency(brokerReport.financials.total_received)}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Due</div>
                    <div className="text-xl font-semibold text-red-600">{formatCurrency(brokerReport.financials.due)}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Future Receivable</div>
                    <div className="text-xl font-semibold text-blue-600">{formatCurrency(brokerReport.financials.future_receivable)}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Transactions</div>
                    <div className="text-xl font-semibold text-gray-900">{brokerReport.financials.total_transactions}</div>
                  </div>
                </div>

                {/* Transactions Table */}
                <div className="bg-white rounded-lg border">
                  <div className="p-4 border-b">
                    <h4 className="font-semibold text-gray-900">Transactions ({brokerReport.transactions.length})</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Transaction ID</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Customer</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Project</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Unit</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Sale Value</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Commission Rate</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Commission Earned</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Commission Paid</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Commission Pending</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {brokerReport.transactions.map((txn, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono text-xs">{txn.transaction_id}</td>
                            <td className="px-4 py-3">{txn.customer_name || '-'}</td>
                            <td className="px-4 py-3">{txn.project_name || '-'}</td>
                            <td className="px-4 py-3">{txn.unit_number || '-'}</td>
                            <td className="px-4 py-3 text-right font-medium">{formatCurrency(txn.total_value)}</td>
                            <td className="px-4 py-3 text-right">{txn.commission_rate.toFixed(2)}%</td>
                            <td className="px-4 py-3 text-right font-medium">{formatCurrency(txn.commission_earned)}</td>
                            <td className="px-4 py-3 text-right text-green-700">{formatCurrency(txn.commission_paid)}</td>
                            <td className="px-4 py-3 text-right text-amber-600 font-medium">{formatCurrency(txn.commission_pending)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Payment History */}
                {brokerReport.payments && brokerReport.payments.length > 0 && (
                  <div className="bg-white rounded-lg border">
                    <div className="p-4 border-b">
                      <h4 className="font-semibold text-gray-900">Commission Payment History ({brokerReport.payments.length})</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Payment ID</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Date</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Transaction ID</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Amount</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Method</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Approved By</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Reference</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {brokerReport.payments.map((payment, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-mono text-xs">{payment.payment_id}</td>
                              <td className="px-4 py-3 text-xs">{payment.payment_date ? new Date(payment.payment_date).toLocaleDateString() : '-'}</td>
                              <td className="px-4 py-3 font-mono text-xs">{payment.transaction_id || '-'}</td>
                              <td className="px-4 py-3 text-right font-medium">{formatCurrency(payment.amount)}</td>
                              <td className="px-4 py-3">{payment.payment_method || '-'}</td>
                              <td className="px-4 py-3">{payment.approved_by || '-'}</td>
                              <td className="px-4 py-3 text-xs text-gray-600">{payment.reference_number || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Interactions History */}
                {brokerReport.interactions && brokerReport.interactions.history && brokerReport.interactions.history.length > 0 && (
                  <div className="bg-white rounded-lg border">
                    <div className="p-4 border-b">
                      <h4 className="font-semibold text-gray-900">Interactions History ({brokerReport.interactions.total_count})</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Date</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Type</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Rep</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Notes</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Next Follow-up</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {brokerReport.interactions.history.map((interaction, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-xs">{new Date(interaction.date).toLocaleDateString()}</td>
                              <td className="px-4 py-3">{interaction.type}</td>
                              <td className="px-4 py-3">{interaction.rep_name || '-'}</td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-0.5 rounded text-xs bg-gray-100">{interaction.status}</span>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-600">{interaction.notes || '-'}</td>
                              <td className="px-4 py-3 text-xs">{interaction.next_follow_up ? new Date(interaction.next_follow_up).toLocaleDateString() : '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="lg:col-span-3 bg-white rounded-lg border p-12 text-center text-gray-400">
                {loading ? 'Loading report...' : 'Select a broker to view detailed report'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// SETTINGS VIEW (Company Reps)
// ============================================
function SettingsView() {
  const [reps, setReps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', mobile: '', email: '' });
  const [settingsTab, setSettingsTab] = useState('reps');

  useEffect(() => { loadReps(); }, []);
  const loadReps = async () => {
    try { const res = await api.get('/company-reps'); setReps(res.data); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) { await api.put(`/company-reps/${editing.id}`, form); }
      else { await api.post('/company-reps', form); }
      setShowModal(false); setEditing(null); setForm({ name: '', mobile: '', email: '' }); loadReps();
    } catch (e) { alert(e.response?.data?.detail || 'Error'); }
  };

  const handleDelete = async (r) => {
    if (!confirm(`Delete "${r.name}"?`)) return;
    try { await api.delete(`/company-reps/${r.id}`); loadReps(); }
    catch (e) { alert(e.response?.data?.detail || 'Error'); }
  };

  const openEdit = (r) => { setEditing(r); setForm({ name: r.name, mobile: r.mobile || '', email: r.email || '' }); setShowModal(true); };

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-semibold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-500 mt-1">Manage system configuration</p></div>

      {/* Settings Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setSettingsTab('reps')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            settingsTab === 'reps' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Company Reps
        </button>
        <button
          onClick={() => setSettingsTab('project-linking')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            settingsTab === 'project-linking' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Project Linking
        </button>
      </div>

      {settingsTab === 'project-linking' && (
        <div className="bg-white rounded-2xl shadow-sm border">
          <OrphanTrackingPanel />
        </div>
      )}

      {settingsTab === 'reps' && (
      <div className="bg-white rounded-2xl shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Company Representatives</h3>
            <p className="text-sm text-gray-500">Sales reps that handle transactions</p>
          </div>
          <button onClick={() => { setEditing(null); setForm({ name: '', mobile: '', email: '' }); setShowModal(true); }} 
            className="bg-gray-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-800">Add Rep</button>
        </div>

        {loading ? <Loader /> : reps.length === 0 ? (
          <div className="text-center py-8 text-gray-400">No company reps added yet</div>
        ) : (
          <div className="divide-y">
            {reps.map(r => (
              <div key={r.id} className="py-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-400">{r.rep_id}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${r.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                  </div>
                  <div className="font-medium text-gray-900">{r.name}</div>
                  <div className="text-sm text-gray-500">{r.mobile} {r.email && `• ${r.email}`}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(r)} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">Edit</button>
                  <button onClick={() => handleDelete(r)} className="px-3 py-1.5 text-sm text-red-500 border rounded-lg hover:bg-red-50">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showModal && (
          <Modal title={editing ? 'Edit Company Rep' : 'Add Company Rep'} onClose={() => setShowModal(false)}>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input label="Name" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
              <Input label="Mobile" value={form.mobile} onChange={e => setForm({...form, mobile: e.target.value})} />
              <Input label="Email" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg">{editing ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </Modal>
        )}
      </div>
      )}
    </div>
  );
}

// ============================================
// MEDIA LIBRARY VIEW
// ============================================
function MediaView() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [fileTypeFilter, setFileTypeFilter] = useState('');

  useEffect(() => {
    loadFiles();
  }, [search, entityTypeFilter, fileTypeFilter]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (entityTypeFilter) params.append('entity_type', entityTypeFilter);
      if (fileTypeFilter) params.append('file_type', fileTypeFilter);
      
      const res = await api.get(`/media/library?${params.toString()}`);
      setFiles(res.data.files || []);
    } catch (e) {
      console.error('Error loading media:', e);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (fileId) => {
    if (!confirm('Delete this file?')) return;
    try {
      await api.delete(`/media/${fileId}`);
      loadFiles();
    } catch (e) {
      alert('Error deleting file');
    }
  };

  const handleDownload = (fileId, fileName) => {
    window.open(`/api/media/${fileId}/download`, '_blank');
  };

  const getFileIcon = (fileType) => {
    switch (fileType) {
      case 'pdf': return '📄';
      case 'image': return '🖼️';
      case 'video': return '🎥';
      case 'audio': return '🎵';
      default: return '📎';
    }
  };

  const getEntityTypeLabel = (type) => {
    const labels = {
      project: 'Project',
      customer: 'Customer',
      broker: 'Broker',
      interaction: 'Interaction',
      receipt: 'Receipt',
      payment: 'Payment'
    };
    return labels[type] || type;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Media Library</h2>
          <p className="text-sm text-gray-500 mt-1">Manage all uploaded files and attachments</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              placeholder="Search files..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Entity Type</label>
            <select
              value={entityTypeFilter}
              onChange={(e) => setEntityTypeFilter(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              <option value="">All Types</option>
              <option value="project">Project</option>
              <option value="customer">Customer</option>
              <option value="broker">Broker</option>
              <option value="interaction">Interaction</option>
              <option value="receipt">Receipt</option>
              <option value="payment">Payment</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">File Type</label>
            <select
              value={fileTypeFilter}
              onChange={(e) => setFileTypeFilter(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              <option value="">All Files</option>
              <option value="image">Images</option>
              <option value="pdf">PDFs</option>
              <option value="video">Videos</option>
              <option value="audio">Audio</option>
              <option value="document">Documents</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setSearch('');
                setEntityTypeFilter('');
                setFileTypeFilter('');
              }}
              className="w-full px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md border"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Files List */}
      {loading ? (
        <div className="bg-white rounded-xl border p-8 text-center">
          <div className="text-gray-400">Loading media files...</div>
        </div>
      ) : files.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center">
          <div className="text-gray-400">No media files found</div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">File</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uploaded</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {files.map((file) => (
                  <tr key={file.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getFileIcon(file.file_type)}</span>
                        <span className="text-sm text-gray-900">{file.file_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">
                        {getEntityTypeLabel(file.entity_type)} #{file.entity_id}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">{file.description || '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-500">
                        {file.created_at ? new Date(file.created_at).toLocaleDateString() : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleDownload(file.file_id, file.file_name)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          Download
                        </button>
                        <button
                          onClick={() => handleDelete(file.file_id)}
                          className="text-red-600 hover:text-red-800 text-sm font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// MEDIA MANAGER COMPONENT
// ============================================
function MediaManager({ entityType, entityId, onUpload }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (entityId) loadFiles();
  }, [entityType, entityId]);

  const loadFiles = async () => {
    try {
      const res = await api.get(`/media/${entityType}/${entityId}`);
      setFiles(res.data || []);
    } catch (e) { console.error(e); }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('entity_type', entityType);
      formData.append('entity_id', entityId);
      if (description) formData.append('description', description);
      await api.post('/media/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setUploadFile(null);
      setDescription('');
      setShowUpload(false);
      loadFiles();
      if (onUpload) onUpload();
    } catch (e) { alert('Error uploading file'); }
    finally { setUploading(false); }
  };

  const handleDelete = async (fileId) => {
    if (!confirm('Delete this file?')) return;
    try {
      await api.delete(`/media/${fileId}`);
      loadFiles();
    } catch (e) { alert('Error deleting file'); }
  };

  const handleDownload = (fileId, fileName) => {
    window.open(`/api/media/${fileId}/download`, '_blank');
  };

  if (!entityId) return null;

  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold">Attachments</h4>
        <button onClick={() => setShowUpload(!showUpload)} className="text-xs text-blue-600 hover:text-blue-800">
          {showUpload ? 'Cancel' : '+ Upload'}
        </button>
      </div>

      {showUpload && (
        <form onSubmit={handleUpload} className="mb-4 p-3 bg-gray-50 rounded-lg">
          <input type="file" onChange={e => setUploadFile(e.target.files[0])} className="mb-2 text-sm" required />
          <input type="text" placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} className="w-full border rounded px-2 py-1 text-sm mb-2" />
          <button type="submit" disabled={uploading} className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50">
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </form>
      )}

      {files.length === 0 ? (
        <div className="text-xs text-gray-400 text-center py-4">No files attached</div>
      ) : (
        <div className="space-y-2">
          {files.map(f => (
            <div key={f.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-gray-500">
                  {f.file_type === 'pdf' ? '📄' : f.file_type === 'image' ? '🖼️' : f.file_type === 'video' ? '🎥' : f.file_type === 'audio' ? '🎵' : '📎'}
                </span>
                <span className="truncate">{f.file_name}</span>
                {f.description && <span className="text-xs text-gray-400">({f.description})</span>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleDownload(f.file_id, f.file_name)} className="text-blue-600 hover:text-blue-800 text-xs">
                  Download
                </button>
                <button onClick={() => handleDelete(f.file_id)} className="text-red-600 hover:text-red-800 text-xs">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// DETAIL MODALS
// ============================================
function CustomerDetailModal({ customer, onClose }) {
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <Modal title={`Customer Details: ${customer.customer.name}`} onClose={onClose} wide>
      <div className="space-y-6 max-h-[80vh] overflow-y-auto">
        {/* Personal Details */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Personal Information</h3>
          <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
            <div>
              <div className="text-xs text-gray-500">Customer ID</div>
              <div className="font-medium">{customer.customer.customer_id}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Mobile</div>
              <div className="font-medium">{customer.customer.mobile}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Email</div>
              <div className="font-medium">{customer.customer.email || 'N/A'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">CNIC</div>
              <div className="font-medium">{customer.customer.cnic || 'N/A'}</div>
            </div>
            <div className="col-span-2">
              <div className="text-xs text-gray-500">Address</div>
              <div className="font-medium">{customer.customer.address || 'N/A'}</div>
            </div>
          </div>
        </div>

        {/* Financial Summary */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Financial Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-xs text-blue-600 mb-1">Total Sale</div>
              <div className="text-lg font-semibold text-blue-900">{formatCurrency(customer.financials.total_sale)}</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-xs text-green-600 mb-1">Total Received</div>
              <div className="text-lg font-semibold text-green-900">{formatCurrency(customer.financials.total_received)}</div>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <div className="text-xs text-red-600 mb-1">Total Overdue</div>
              <div className="text-lg font-semibold text-red-900">{formatCurrency(customer.financials.total_overdue)}</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="text-xs text-purple-600 mb-1">Future Receivable</div>
              <div className="text-lg font-semibold text-purple-900">{formatCurrency(customer.financials.future_receivable)}</div>
            </div>
          </div>
        </div>

        {/* Overdue Installments */}
        {customer.installments.overdue.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-red-700 uppercase mb-3">Overdue Installments ({customer.installments.overdue.length})</h3>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-red-50">
                  <tr>
                    <th className="text-left p-2 font-semibold text-red-700">Project</th>
                    <th className="text-left p-2 font-semibold text-red-700">Unit</th>
                    <th className="text-right p-2 font-semibold text-red-700">Due Date</th>
                    <th className="text-right p-2 font-semibold text-red-700">Amount</th>
                    <th className="text-right p-2 font-semibold text-red-700">Paid</th>
                    <th className="text-right p-2 font-semibold text-red-700">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.installments.overdue.map((inst, idx) => (
                    <tr key={idx} className="border-t hover:bg-red-50">
                      <td className="p-2">{inst.project_name || 'N/A'}</td>
                      <td className="p-2">{inst.unit_number || 'N/A'}</td>
                      <td className="text-right p-2">{formatDate(inst.due_date)}</td>
                      <td className="text-right p-2">{formatCurrency(inst.amount)}</td>
                      <td className="text-right p-2">{formatCurrency(inst.amount_paid)}</td>
                      <td className="text-right p-2 font-semibold text-red-700">{formatCurrency(inst.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Future Installments */}
        {customer.installments.future.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-blue-700 uppercase mb-3">Future Installments ({customer.installments.future.length})</h3>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-blue-50">
                  <tr>
                    <th className="text-left p-2 font-semibold text-blue-700">Project</th>
                    <th className="text-left p-2 font-semibold text-blue-700">Unit</th>
                    <th className="text-right p-2 font-semibold text-blue-700">Due Date</th>
                    <th className="text-right p-2 font-semibold text-blue-700">Amount</th>
                    <th className="text-right p-2 font-semibold text-blue-700">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.installments.future.map((inst, idx) => (
                    <tr key={idx} className="border-t hover:bg-blue-50">
                      <td className="p-2">{inst.project_name || 'N/A'}</td>
                      <td className="p-2">{inst.unit_number || 'N/A'}</td>
                      <td className="text-right p-2">{formatDate(inst.due_date)}</td>
                      <td className="text-right p-2">{formatCurrency(inst.amount)}</td>
                      <td className="text-right p-2 font-semibold text-blue-700">{formatCurrency(inst.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Receipts */}
        {customer.receipts.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Receipts ({customer.receipts.length})</h3>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-2 font-semibold">Receipt ID</th>
                    <th className="text-right p-2 font-semibold">Date</th>
                    <th className="text-right p-2 font-semibold">Amount</th>
                    <th className="text-left p-2 font-semibold">Method</th>
                    <th className="text-left p-2 font-semibold">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.receipts.map((r, idx) => (
                    <tr key={idx} className="border-t hover:bg-gray-50">
                      <td className="p-2">{r.receipt_id}</td>
                      <td className="text-right p-2">{formatDate(r.payment_date)}</td>
                      <td className="text-right p-2 font-medium">{formatCurrency(r.amount)}</td>
                      <td className="p-2">{r.payment_method || 'N/A'}</td>
                      <td className="p-2">{r.reference_number || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Interactions */}
        {customer.interactions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Recent Interactions ({customer.interactions.length})</h3>
            <div className="space-y-2">
              {customer.interactions.map((i, idx) => (
                <div key={idx} className="border rounded-lg p-3 bg-gray-50">
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-medium">{i.interaction_type}</div>
                    <div className="text-xs text-gray-500">{formatDate(i.created_at)}</div>
                  </div>
                  <div className="text-sm text-gray-600">{i.notes || 'No notes'}</div>
                  {i.rep_name && <div className="text-xs text-gray-500 mt-1">By: {i.rep_name}</div>}
                  {i.next_follow_up && <div className="text-xs text-blue-600 mt-1">Next follow-up: {formatDate(i.next_follow_up)}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function BrokerDetailModal({ broker, onClose }) {
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <Modal title={`Broker Details: ${broker.broker.name}`} onClose={onClose} wide>
      <div className="space-y-6 max-h-[80vh] overflow-y-auto">
        {/* Personal Details */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Personal Information</h3>
          <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
            <div>
              <div className="text-xs text-gray-500">Broker ID</div>
              <div className="font-medium">{broker.broker.broker_id}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Mobile</div>
              <div className="font-medium">{broker.broker.mobile}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Email</div>
              <div className="font-medium">{broker.broker.email || 'N/A'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Company</div>
              <div className="font-medium">{broker.broker.company || 'N/A'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Commission Rate</div>
              <div className="font-medium">{broker.broker.commission_rate}%</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Status</div>
              <div className="font-medium">{broker.broker.status}</div>
            </div>
          </div>
        </div>

        {/* Performance Summary */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Performance Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-xs text-blue-600 mb-1">Total Sales</div>
              <div className="text-lg font-semibold text-blue-900">{formatCurrency(broker.performance.total_sale_value)}</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-xs text-green-600 mb-1">Commission Earned</div>
              <div className="text-lg font-semibold text-green-900">{formatCurrency(broker.performance.commission.total_earned)}</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="text-xs text-purple-600 mb-1">Commission Paid</div>
              <div className="text-lg font-semibold text-purple-900">{formatCurrency(broker.performance.commission.total_paid)}</div>
            </div>
            <div className="bg-orange-50 p-4 rounded-lg">
              <div className="text-xs text-orange-600 mb-1">Pending</div>
              <div className="text-lg font-semibold text-orange-900">{formatCurrency(broker.performance.commission.pending)}</div>
            </div>
          </div>
        </div>

        {/* Brokered Transactions */}
        {broker.brokered_transactions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Brokered Transactions ({broker.brokered_transactions.length})</h3>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-2 font-semibold">Transaction ID</th>
                    <th className="text-left p-2 font-semibold">Project</th>
                    <th className="text-left p-2 font-semibold">Customer</th>
                    <th className="text-right p-2 font-semibold">Sale Value</th>
                    <th className="text-right p-2 font-semibold">Commission</th>
                    <th className="text-right p-2 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {broker.brokered_transactions.map((t, idx) => (
                    <tr key={idx} className="border-t hover:bg-gray-50">
                      <td className="p-2">{t.transaction_id}</td>
                      <td className="p-2">{t.project_name || 'N/A'}</td>
                      <td className="p-2">{t.customer_name || 'N/A'}</td>
                      <td className="text-right p-2">{formatCurrency(t.total_value)}</td>
                      <td className="text-right p-2 font-medium text-green-600">{formatCurrency(t.commission_amount)} ({t.commission_rate}%)</td>
                      <td className="text-right p-2">{formatDate(t.booking_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Commission Payments */}
        {broker.payments.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Commission Payments ({broker.payments.length})</h3>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-2 font-semibold">Payment ID</th>
                    <th className="text-right p-2 font-semibold">Date</th>
                    <th className="text-right p-2 font-semibold">Amount</th>
                    <th className="text-left p-2 font-semibold">Method</th>
                    <th className="text-left p-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {broker.payments.map((p, idx) => (
                    <tr key={idx} className="border-t hover:bg-gray-50">
                      <td className="p-2">{p.payment_id}</td>
                      <td className="text-right p-2">{formatDate(p.payment_date)}</td>
                      <td className="text-right p-2 font-medium">{formatCurrency(p.amount)}</td>
                      <td className="p-2">{p.payment_method || 'N/A'}</td>
                      <td className="p-2">
                        <span className={`px-2 py-1 rounded text-xs ${
                          p.status === 'completed' ? 'bg-green-100 text-green-800' :
                          p.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Interactions */}
        {broker.interactions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Recent Interactions ({broker.interactions.length})</h3>
            <div className="space-y-2">
              {broker.interactions.map((i, idx) => (
                <div key={idx} className="border rounded-lg p-3 bg-gray-50">
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-medium">{i.interaction_type}</div>
                    <div className="text-xs text-gray-500">{formatDate(i.created_at)}</div>
                  </div>
                  <div className="text-sm text-gray-600">{i.notes || 'No notes'}</div>
                  {i.rep_name && <div className="text-xs text-gray-500 mt-1">By: {i.rep_name}</div>}
                  {i.next_follow_up && <div className="text-xs text-blue-600 mt-1">Next follow-up: {formatDate(i.next_follow_up)}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ============================================
// SHARED COMPONENTS
// ============================================
function SummaryCard({ label, value, sub }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border p-5">
      <div className="text-xs font-medium text-gray-400 uppercase">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
      {sub && <div className="text-sm text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className={`bg-white rounded-2xl shadow-xl mx-4 max-h-[90vh] overflow-y-auto ${wide ? 'w-full max-w-2xl' : 'w-full max-w-lg'}`}>
        <div className="p-5 border-b flex justify-between items-center sticky top-0 bg-white rounded-t-2xl">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Input({ label, required, ...props }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label} {required && <span className="text-red-400">*</span>}</label>
      <input {...props} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
    </div>
  );
}

function Loader() { return <div className="p-12 text-center text-gray-400">Loading...</div>; }
function Empty({ msg }) { return <div className="bg-white rounded-2xl shadow-sm border p-12 text-center text-gray-400">{msg}</div>; }

function BulkImport({ entity, onImport, importFile, setImportFile, importResult }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border p-6">
      <h3 className="text-sm font-semibold mb-4">Bulk Import</h3>
      <div className="flex items-center gap-4">
        <button onClick={async () => {
          const res = await api.get(`/${entity}/template/download`, { responseType: 'blob' });
          const url = window.URL.createObjectURL(new Blob([res.data]));
          const a = document.createElement('a'); a.href = url; a.download = `${entity}_template.csv`; a.click();
        }} className="text-sm text-gray-600 hover:text-gray-900 underline">Download Template</button>
        <input type="file" accept=".csv" onChange={e => setImportFile(e.target.files[0])} className="text-sm" />
        {importFile && <button onClick={onImport} className="bg-gray-900 text-white px-3 py-1.5 text-sm rounded-lg">Import</button>}
      </div>
      {importResult && (
        <div className={`mt-4 p-3 rounded-lg text-sm ${importResult.success > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {importResult.success > 0 ? `✓ Imported ${importResult.success}` : 'Import failed'}
          {importResult.errors?.length > 0 && <div className="mt-1 text-xs">{importResult.errors.slice(0, 3).join(', ')}</div>}
        </div>
      )}
    </div>
  );
}

// ============================================
// VECTOR VIEW
// ============================================
function VectorView() {
  // Use the new VectorMap component for full Vector functionality
  return <VectorMap />;
}

// ============================================
// VECTOR MAP EDITOR COMPONENT - FULL FEATURED
// ============================================
function VectorMapEditor({ project, onClose, onUpdate }) {
  const [projectData, setProjectData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [annotations, setAnnotations] = useState([]);
  const [labels, setLabels] = useState([]);
  const [shapes, setShapes] = useState([]);
  const [plots, setPlots] = useState([]);
  const [pdfPages, setPdfPages] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [scale, setScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState('select'); // select, pan, addPlot, brush, rectangle, circle, text
  const [selectedItem, setSelectedItem] = useState(null);
  const [showAnnotationModal, setShowAnnotationModal] = useState(false);
  const [editingAnnotation, setEditingAnnotation] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [drawingStart, setDrawingStart] = useState(null);
  const [tempShape, setTempShape] = useState(null);

  useEffect(() => {
    loadProjectData();
  }, [project.id]);

  useEffect(() => {
    if (projectData?.map_pdf_base64) {
      loadPDF();
    }
  }, [projectData]);

  useEffect(() => {
    if (canvasRef.current && pdfPages.length > 0) {
      drawCanvas();
    }
  }, [pdfPages, currentPage, scale, panOffset, annotations, labels, shapes, plots, tool, selectedItem, tempShape]);

  const loadProjectData = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/vector/projects/${project.id}`);
      const data = res.data;
      setProjectData(data);
      
      const [annosRes, labelsRes, shapesRes] = await Promise.all([
        api.get(`/vector/projects/${project.id}/annotations`).catch(() => ({ data: [] })),
        api.get(`/vector/projects/${project.id}/labels`).catch(() => ({ data: [] })),
        api.get(`/vector/projects/${project.id}/shapes`).catch(() => ({ data: [] }))
      ]);
      
      setAnnotations(annosRes.data || []);
      setLabels(labelsRes.data || []);
      setShapes(shapesRes.data || []);
      
      if (data.vector_metadata?.plots) {
        setPlots(data.vector_metadata.plots);
      }
    } catch (e) {
      alert('Error loading project: ' + (e.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  const loadPDF = async () => {
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
      
      const base64 = projectData.map_pdf_base64;
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      const pages = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        pages.push(page);
      }
      setPdfPages(pages);
    } catch (e) {
      console.error('Error loading PDF:', e);
      alert('Error loading PDF: ' + e.message);
    }
  };

  const drawCanvas = async () => {
    const canvas = canvasRef.current;
    if (!canvas || pdfPages.length === 0) return;
    
    const ctx = canvas.getContext('2d');
    const page = pdfPages[currentPage];
    const viewport = page.getViewport({ scale: scale });
    
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(panOffset.x, panOffset.y);
    
    // Draw PDF page
    const renderContext = {
      canvasContext: ctx,
      viewport: viewport
    };
    await page.render(renderContext).promise;
    
    // Draw plots
    plots.forEach(plot => {
      if (plot.x !== undefined && plot.y !== undefined) {
        const isSelected = selectedItem?.type === 'plot' && selectedItem.data.id === plot.id;
        ctx.strokeStyle = isSelected ? '#ef4444' : '#3b82f6';
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.strokeRect(plot.x * scale, plot.y * scale, (plot.w || 50) * scale, (plot.h || 50) * scale);
        if (plot.n) {
          ctx.fillStyle = isSelected ? '#ef4444' : '#3b82f6';
          ctx.font = `${12 * scale}px Arial`;
          ctx.fillText(plot.n, plot.x * scale + 5, plot.y * scale + 15);
        }
      }
    });
    
    // Draw shapes
    shapes.forEach(shape => {
      ctx.strokeStyle = shape.color || '#000000';
      ctx.lineWidth = 2;
      if (shape.type === 'rectangle') {
        ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
      } else if (shape.type === 'circle') {
        ctx.beginPath();
        ctx.arc(shape.x + shape.width/2, shape.y + shape.height/2, Math.min(shape.width, shape.height)/2, 0, 2 * Math.PI);
        ctx.stroke();
      }
    });
    
    // Draw labels
    labels.forEach(label => {
      ctx.fillStyle = label.color || '#000000';
      ctx.font = `${(label.size || 12) * scale}px Arial`;
      ctx.fillText(label.text || '', label.x, label.y);
    });
    
    // Draw annotations
    annotations.forEach(anno => {
      if (anno.plot_ids && anno.plot_ids.length > 0) {
        const plotIds = anno.plot_ids;
        plotIds.forEach(plotId => {
          const plot = plots.find(p => p.id === plotId);
          if (plot && plot.x !== undefined) {
            ctx.fillStyle = anno.color || '#ff0000';
            ctx.font = `${(anno.font_size || 12) * scale}px Arial`;
            const text = anno.note || '';
            const x = plot.x * scale + (plot.w || 50) * scale / 2;
            const y = plot.y * scale - 10;
            ctx.fillText(text, x, y);
          }
        });
      }
    });
    
    // Draw temp shape while drawing
    if (tempShape && drawingStart) {
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      if (tool === 'rectangle') {
        ctx.strokeRect(
          Math.min(drawingStart.x, tempShape.x),
          Math.min(drawingStart.y, tempShape.y),
          Math.abs(tempShape.x - drawingStart.x),
          Math.abs(tempShape.y - drawingStart.y)
        );
      } else if (tool === 'circle') {
        const radius = Math.sqrt(
          Math.pow(tempShape.x - drawingStart.x, 2) + 
          Math.pow(tempShape.y - drawingStart.y, 2)
        );
        ctx.beginPath();
        ctx.arc(drawingStart.x, drawingStart.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    
    ctx.restore();
  };

  const handleCanvasMouseDown = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - panOffset.x;
    const y = e.clientY - rect.top - panOffset.y;
    
    if (tool === 'pan') {
      setIsDragging(true);
      setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    } else if (tool === 'addPlot' || tool === 'rectangle' || tool === 'circle') {
      setDrawingStart({ x, y });
      setTempShape({ x, y });
    } else if (tool === 'select') {
      // Check if clicking on a plot
      const clickedPlot = plots.find(p => {
        const px = p.x * scale;
        const py = p.y * scale;
        return x >= px && x <= px + (p.w || 50) * scale && y >= py && y <= py + (p.h || 50) * scale;
      });
      if (clickedPlot) {
        setSelectedItem({ type: 'plot', data: clickedPlot });
      } else {
        // Check if clicking on a shape
        const clickedShape = shapes.find(s => {
          if (s.type === 'rectangle') {
            return x >= s.x && x <= s.x + s.width && y >= s.y && y <= s.y + s.height;
          } else if (s.type === 'circle') {
            const centerX = s.x + s.width / 2;
            const centerY = s.y + s.height / 2;
            const radius = Math.min(s.width, s.height) / 2;
            const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
            return dist <= radius;
          }
          return false;
        });
        if (clickedShape) {
          setSelectedItem({ type: 'shape', data: clickedShape });
        } else {
          setSelectedItem(null);
        }
      }
    }
  };

  const handleCanvasMouseMove = (e) => {
    if (isDragging && tool === 'pan') {
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;
      setPanOffset({ x: newX, y: newY });
    } else if (drawingStart && (tool === 'addPlot' || tool === 'rectangle' || tool === 'circle')) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - panOffset.x;
      const y = e.clientY - rect.top - panOffset.y;
      setTempShape({ x, y });
    }
  };

  const handleCanvasMouseUp = async (e) => {
    if (isDragging) {
      setIsDragging(false);
    } else if (tool === 'text') {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - panOffset.x;
      const y = e.clientY - rect.top - panOffset.y;
      const text = prompt('Enter text label:');
      if (text) {
        await saveLabel({ text, x, y, size: 12, color: '#000000' });
        saveHistory();
      }
    } else if (drawingStart && tempShape) {
      if (tool === 'addPlot') {
        const plotNum = prompt('Plot number:');
        if (plotNum) {
          const newPlot = {
            id: Date.now().toString(),
            n: plotNum,
            x: Math.min(drawingStart.x, tempShape.x) / scale,
            y: Math.min(drawingStart.y, tempShape.y) / scale,
            w: Math.abs(tempShape.x - drawingStart.x) / scale,
            h: Math.abs(tempShape.y - drawingStart.y) / scale
          };
          const updatedPlots = [...plots, newPlot];
          setPlots(updatedPlots);
          await savePlots(updatedPlots);
          saveHistory();
        }
      } else if (tool === 'rectangle' || tool === 'circle') {
        const newShape = {
          type: tool === 'rectangle' ? 'rectangle' : 'circle',
          x: Math.min(drawingStart.x, tempShape.x),
          y: Math.min(drawingStart.y, tempShape.y),
          width: Math.abs(tempShape.x - drawingStart.x),
          height: Math.abs(tempShape.y - drawingStart.y),
          color: '#000000'
        };
        await saveShape(newShape);
        saveHistory();
      }
      setDrawingStart(null);
      setTempShape(null);
    }
  };

  const savePlots = async (plotsToSave) => {
    if (!projectData) return;
    try {
      const metadata = { ...projectData.vector_metadata, plots: plotsToSave };
      const formData = new FormData();
      formData.append('vector_metadata', JSON.stringify(metadata));
      await api.put(`/vector/projects/${project.id}`, formData);
      setProjectData({ ...projectData, vector_metadata: metadata });
    } catch (e) {
      console.error('Error saving plots:', e);
    }
  };

  const saveShape = async (shape) => {
    try {
      const formData = new FormData();
      formData.append('shape_id', Date.now().toString());
      formData.append('type', shape.type);
      formData.append('x', shape.x);
      formData.append('y', shape.y);
      formData.append('width', shape.width);
      formData.append('height', shape.height);
      formData.append('color', shape.color);
      const res = await api.post(`/vector/projects/${project.id}/shapes`, formData);
      setShapes([...shapes, res.data]);
    } catch (e) {
      alert('Error saving shape: ' + (e.response?.data?.detail || e.message));
    }
  };

  const saveLabel = async (label) => {
    try {
      const formData = new FormData();
      formData.append('label_id', Date.now().toString());
      formData.append('text', label.text);
      formData.append('x', label.x);
      formData.append('y', label.y);
      formData.append('size', label.size || 12);
      formData.append('color', label.color || '#000000');
      const res = await api.post(`/vector/projects/${project.id}/labels`, formData);
      setLabels([...labels, res.data]);
    } catch (e) {
      alert('Error saving label: ' + (e.response?.data?.detail || e.message));
    }
  };

  const saveHistory = () => {
    const state = { annotations, labels, shapes, plots };
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(state);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevState = history[historyIndex - 1];
      setAnnotations(prevState.annotations);
      setLabels(prevState.labels);
      setShapes(prevState.shapes);
      setPlots(prevState.plots);
      setHistoryIndex(historyIndex - 1);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setAnnotations(nextState.annotations);
      setLabels(nextState.labels);
      setShapes(nextState.shapes);
      setPlots(nextState.plots);
      setHistoryIndex(historyIndex + 1);
    }
  };

  const handleAddAnnotation = () => {
    if (selectedItem && selectedItem.type === 'plot') {
      setEditingAnnotation({ plot_ids: [selectedItem.data.id], plot_nums: [selectedItem.data.n] });
      setShowAnnotationModal(true);
    } else {
      alert('Please select a plot first');
    }
  };

  const handleSaveAnnotation = async (annoData) => {
    try {
      const formData = new FormData();
      formData.append('annotation_id', editingAnnotation?.id || Date.now().toString());
      formData.append('note', annoData.note || '');
      formData.append('category', annoData.category || '');
      formData.append('color', annoData.color || '#ff0000');
      formData.append('font_size', annoData.fontSize || 12);
      formData.append('plot_ids', JSON.stringify(annoData.plotIds || []));
      formData.append('plot_nums', JSON.stringify(annoData.plotNums || []));
      
      if (editingAnnotation?.id) {
        await api.put(`/vector/projects/${project.id}/annotations/${editingAnnotation.id}`, formData);
        setAnnotations(annotations.map(a => a.id === editingAnnotation.id ? { ...a, ...annoData } : a));
      } else {
        const res = await api.post(`/vector/projects/${project.id}/annotations`, formData);
        setAnnotations([...annotations, res.data]);
      }
      setShowAnnotationModal(false);
      setEditingAnnotation(null);
      saveHistory();
    } catch (e) {
      alert('Error saving annotation: ' + (e.response?.data?.detail || e.message));
    }
  };

  const handleExport = async (format) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    if (format === 'image') {
      const link = document.createElement('a');
      link.download = `${project.name}_map.png`;
      link.href = canvas.toDataURL();
      link.click();
    } else if (format === 'pdf') {
      // Export as PDF using canvas
      alert('PDF export coming soon - use image export for now');
    }
  };

  if (loading) return <Loader />;

  if (!projectData) {
    return (
      <Modal title="Vector Map Editor" onClose={onClose}>
        <div className="p-6 text-center">
          <p className="text-gray-600 mb-4">Project data not found</p>
          <button onClick={onClose} className="bg-gray-900 text-white px-4 py-2 rounded-lg">Close</button>
        </div>
      </Modal>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full h-full max-w-[95vw] max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold">Vector Map Editor - {project.name}</h3>
            <div className="text-xs text-gray-500 mt-1">
              Plots: {plots.length} | Annotations: {annotations.length} | Labels: {labels.length} | Shapes: {shapes.length}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>

        {/* Toolbar */}
        <div className="p-3 border-b bg-gray-50 flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 border-r pr-2">
            <button
              onClick={() => setTool('select')}
              className={`px-3 py-1.5 text-xs rounded ${tool === 'select' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-100'}`}
              title="Select"
            >
              ↖ Select
            </button>
            <button
              onClick={() => setTool('pan')}
              className={`px-3 py-1.5 text-xs rounded ${tool === 'pan' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-100'}`}
              title="Pan"
            >
              ✋ Pan
            </button>
            <button
              onClick={() => setTool('addPlot')}
              className={`px-3 py-1.5 text-xs rounded ${tool === 'addPlot' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-100'}`}
              title="Add Plot"
            >
              ▢ Plot
            </button>
            <button
              onClick={() => setTool('rectangle')}
              className={`px-3 py-1.5 text-xs rounded ${tool === 'rectangle' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-100'}`}
              title="Rectangle"
            >
              ▭ Rect
            </button>
            <button
              onClick={() => setTool('circle')}
              className={`px-3 py-1.5 text-xs rounded ${tool === 'circle' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-100'}`}
              title="Circle"
            >
              ○ Circle
            </button>
            <button
              onClick={() => setTool('text')}
              className={`px-3 py-1.5 text-xs rounded ${tool === 'text' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-100'}`}
              title="Text Label"
            >
              A Text
            </button>
          </div>
          
          <div className="flex gap-1 border-r pr-2">
            <button
              onClick={handleAddAnnotation}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
              title="Add Annotation"
            >
              📝 Annotate
            </button>
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="px-3 py-1.5 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
              title="Undo"
            >
              ↶ Undo
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="px-3 py-1.5 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
              title="Redo"
            >
              ↷ Redo
            </button>
          </div>

          <div className="flex gap-1 border-r pr-2">
            <button
              onClick={() => setScale(Math.max(0.5, scale - 0.1))}
              className="px-3 py-1.5 text-xs bg-white hover:bg-gray-100 rounded"
            >
              −
            </button>
            <span className="px-3 py-1.5 text-xs">{Math.round(scale * 100)}%</span>
            <button
              onClick={() => setScale(Math.min(3, scale + 0.1))}
              className="px-3 py-1.5 text-xs bg-white hover:bg-gray-100 rounded"
            >
              +
            </button>
          </div>

          {pdfPages.length > 1 && (
            <div className="flex gap-1 border-r pr-2">
              <button
                onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                disabled={currentPage === 0}
                className="px-3 py-1.5 text-xs bg-white hover:bg-gray-100 rounded disabled:opacity-50"
              >
                ‹ Prev
              </button>
              <span className="px-3 py-1.5 text-xs">{currentPage + 1} / {pdfPages.length}</span>
              <button
                onClick={() => setCurrentPage(Math.min(pdfPages.length - 1, currentPage + 1))}
                disabled={currentPage === pdfPages.length - 1}
                className="px-3 py-1.5 text-xs bg-white hover:bg-gray-100 rounded disabled:opacity-50"
              >
                Next ›
              </button>
            </div>
          )}

          <div className="flex gap-1">
            {selectedItem && (
              <button
                onClick={async () => {
                  if (confirm('Delete selected item?')) {
                    if (selectedItem.type === 'plot') {
                      const updatedPlots = plots.filter(p => p.id !== selectedItem.data.id);
                      setPlots(updatedPlots);
                      await savePlots(updatedPlots);
                      setSelectedItem(null);
                      saveHistory();
                    }
                  }
                }}
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                title="Delete Selected"
              >
                🗑️ Delete
              </button>
            )}
            <button
              onClick={() => handleExport('image')}
              className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700"
              title="Export as Image"
            >
              💾 Export
            </button>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 overflow-auto bg-gray-100 p-4" ref={containerRef}>
          {!projectData.map_pdf_base64 ? (
            <div className="p-8 text-center bg-yellow-50 rounded-lg">
              <p className="text-yellow-800 mb-4">⚠️ No map PDF uploaded for this project</p>
              <label className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg cursor-pointer hover:bg-blue-700">
                Upload Map PDF
                <input
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                      const base64 = event.target.result.split(',')[1];
                      const formData = new FormData();
                      formData.append('map_name', file.name);
                      formData.append('map_pdf_base64', base64);
                      await api.put(`/vector/projects/${project.id}`, formData);
                      await loadProjectData();
                      await onUpdate();
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            </div>
          ) : (
            <div className="relative inline-block">
              <canvas
                ref={canvasRef}
                className="border border-gray-300 bg-white cursor-crosshair"
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={() => {
                  setIsDragging(false);
                  setDrawingStart(null);
                  setTempShape(null);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Annotation Modal */}
      {showAnnotationModal && (
        <AnnotationEditor
          annotation={editingAnnotation}
          plots={plots}
          onSave={handleSaveAnnotation}
          onClose={() => {
            setShowAnnotationModal(false);
            setEditingAnnotation(null);
          }}
        />
      )}
    </div>
  );
}

// Annotation Editor Component
function AnnotationEditor({ annotation, plots, onSave, onClose }) {
  const [note, setNote] = useState(annotation?.note || '');
  const [category, setCategory] = useState(annotation?.category || '');
  const [color, setColor] = useState(annotation?.color || '#ff0000');
  const [fontSize, setFontSize] = useState(annotation?.font_size || 12);
  const [plotIds, setPlotIds] = useState(annotation?.plot_ids || []);
  const [plotNums, setPlotNums] = useState(annotation?.plot_nums || []);

  const handleSave = () => {
    onSave({
      note,
      category,
      color,
      fontSize,
      plotIds,
      plotNums
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h3 className="text-lg font-semibold mb-4">Edit Annotation</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Note</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <input
              type="text"
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Color</label>
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="w-full h-10 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Font Size</label>
              <input
                type="number"
                value={fontSize}
                onChange={e => setFontSize(parseInt(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg"
                min="8"
                max="72"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Linked Plots</label>
            <div className="text-xs text-gray-600">
              {plotNums.length > 0 ? plotNums.join(', ') : 'No plots linked'}
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          <button
            onClick={handleSave}
            className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800"
          >
            Save
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
