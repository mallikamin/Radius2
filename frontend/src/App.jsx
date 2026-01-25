import React, { useState, useEffect } from 'react';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });
const formatCurrency = (n) => new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(n || 0);

// ============================================
// MAIN APP
// ============================================
export default function App() {
  const [activeTab, setActiveTab] = useState('projects');
  const tabs = [
    { id: 'projects', label: 'Projects' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'transactions', label: 'Transactions' },
    { id: 'receipts', label: 'Receipts' },
    { id: 'interactions', label: 'Interactions' },
    { id: 'customers', label: 'Customers' },
    { id: 'brokers', label: 'Brokers' },
    { id: 'campaigns', label: 'Campaigns' },
    { id: 'settings', label: 'Settings' }
  ];

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">Radius</h1>
          <nav className="flex gap-1 overflow-x-auto">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'projects' && <ProjectsView />}
        {activeTab === 'inventory' && <InventoryView />}
        {activeTab === 'transactions' && <TransactionsView />}
        {activeTab === 'receipts' && <ReceiptsView />}
        {activeTab === 'interactions' && <InteractionsView />}
        {activeTab === 'customers' && <CustomersView />}
        {activeTab === 'brokers' && <BrokersView />}
        {activeTab === 'campaigns' && <CampaignsView />}
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
            <div key={p.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
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
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-mono text-gray-500">{t.transaction_id}</td>
                  <td className="px-6 py-4"><div className="text-sm font-medium">{t.customer_name}</div>{t.broker_name && <div className="text-xs text-gray-400">via {t.broker_name}</div>}</td>
                  <td className="px-6 py-4"><div className="text-sm">{t.project_name}</div><div className="text-xs text-gray-500">{t.unit_number}</div></td>
                  <td className="px-6 py-4 text-sm text-right font-medium">{formatCurrency(t.total_value)}</td>
                  <td className="px-6 py-4 text-sm text-right text-green-600">{formatCurrency(t.total_paid)}</td>
                  <td className="px-6 py-4 text-sm text-right text-amber-600">{formatCurrency(t.balance)}</td>
                  <td className="px-6 py-4 text-center"><span className={`px-2 py-1 rounded-full text-xs font-medium ${t.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{t.status}</span></td>
                  <td className="px-6 py-4 text-right"><button onClick={() => viewDetails(t)} className="text-sm text-blue-600 hover:text-blue-800">View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BulkImport entity="transactions" onImport={handleImport} importFile={importFile} setImportFile={setImportFile} importResult={importResult} />

      {showModal && <NewTransactionModal onClose={() => setShowModal(false)} onSuccess={() => { setShowModal(false); loadData(); }} />}
      {selectedTxn && <TransactionDetailModal txn={selectedTxn} onClose={() => setSelectedTxn(null)} onUpdate={loadData} />}
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
                <tr key={r.id} className="hover:bg-gray-50">
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
    </div>
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
// SETTINGS VIEW (Company Reps)
// ============================================
function SettingsView() {
  const [reps, setReps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', mobile: '', email: '' });

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
      </div>

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
