import React, { useState, useEffect } from 'react';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// ============================================
// MAIN APP
// ============================================
export default function App() {
  const [activeTab, setActiveTab] = useState('customers');

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Header - Apple minimal */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">Radius</h1>
          <nav className="flex gap-1">
            {[
              { id: 'customers', label: 'Customers' },
              { id: 'brokers', label: 'Brokers' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  activeTab === tab.id
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {activeTab === 'customers' && <CustomersView />}
        {activeTab === 'brokers' && <BrokersView />}
      </main>
    </div>
  );
}


// ============================================
// CUSTOMERS VIEW
// ============================================
function CustomersView() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState({ name: '', mobile: '', address: '', cnic: '', email: '', notes: '' });
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);

  useEffect(() => { loadCustomers(); }, []);

  const loadCustomers = async () => {
    try {
      const res = await api.get('/customers');
      setCustomers(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCustomer) {
        await api.put(`/customers/${editingCustomer.id}`, formData);
      } else {
        await api.post('/customers', formData);
      }
      setShowModal(false);
      setEditingCustomer(null);
      setFormData({ name: '', mobile: '', address: '', cnic: '', email: '', notes: '' });
      loadCustomers();
    } catch (err) {
      alert(err.response?.data?.detail || 'Error saving customer');
    }
  };

  const handleDelete = async (customer) => {
    if (!confirm(`Delete "${customer.name}"?`)) return;
    try {
      await api.delete(`/customers/${customer.id}`);
      loadCustomers();
    } catch (err) {
      alert(err.response?.data?.detail || 'Error deleting');
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    const fd = new FormData();
    fd.append('file', importFile);
    try {
      const res = await api.post('/customers/bulk-import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setImportResult(res.data);
      setImportFile(null);
      loadCustomers();
    } catch (err) {
      setImportResult({ success: 0, errors: [err.response?.data?.detail || err.message] });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Customers</h2>
          <p className="text-sm text-gray-500 mt-1">{customers.length} total</p>
        </div>
        <button
          onClick={() => { setEditingCustomer(null); setFormData({ name: '', mobile: '', address: '', cnic: '', email: '', notes: '' }); setShowModal(true); }}
          className="bg-gray-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-800 transition"
        >
          Add Customer
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Loading...</div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No customers yet</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">ID</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Name</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Mobile</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">CNIC</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {customers.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4 text-sm font-mono text-gray-500">{c.customer_id}</td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{c.name}</div>
                    {c.email && <div className="text-xs text-gray-400">{c.email}</div>}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{c.mobile}</td>
                  <td className="px-6 py-4 text-sm text-gray-400">{c.cnic || '—'}</td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => { setEditingCustomer(c); setFormData({ name: c.name, mobile: c.mobile, address: c.address || '', cnic: c.cnic || '', email: c.email || '', notes: c.notes || '' }); setShowModal(true); }}
                      className="text-gray-400 hover:text-gray-600 mr-3"
                    >Edit</button>
                    <button onClick={() => handleDelete(c)} className="text-gray-400 hover:text-red-500">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Bulk Import */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Bulk Import</h3>
        <div className="flex items-center gap-4">
          <button
            onClick={async () => {
              const res = await api.get('/customers/template/download', { responseType: 'blob' });
              const url = window.URL.createObjectURL(new Blob([res.data]));
              const a = document.createElement('a'); a.href = url; a.download = 'customers_template.csv'; a.click();
            }}
            className="text-sm text-gray-600 hover:text-gray-900 underline"
          >
            Download Template
          </button>
          <input type="file" accept=".csv" onChange={e => setImportFile(e.target.files[0])} className="text-sm" />
          {importFile && (
            <button onClick={handleImport} className="bg-gray-900 text-white px-3 py-1.5 text-sm rounded-lg">
              Import
            </button>
          )}
        </div>
        {importResult && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${importResult.success > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {importResult.success > 0 ? `✓ Imported ${importResult.success} customers` : 'Import failed'}
            {importResult.errors?.length > 0 && <div className="mt-1 text-xs">{importResult.errors.join(', ')}</div>}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <Modal title={editingCustomer ? 'Edit Customer' : 'Add Customer'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Name" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
            <Input label="Mobile" required value={formData.mobile} onChange={e => setFormData({ ...formData, mobile: e.target.value })} placeholder="0300-1234567" />
            <Input label="CNIC" value={formData.cnic} onChange={e => setFormData({ ...formData, cnic: e.target.value })} placeholder="35201-1234567-1" />
            <Input label="Email" type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
            <Input label="Address" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} />
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800">{editingCustomer ? 'Update' : 'Create'}</button>
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
  const [editingBroker, setEditingBroker] = useState(null);
  const [selectedBroker, setSelectedBroker] = useState(null);
  const [formData, setFormData] = useState({
    name: '', mobile: '', company: '', commission_rate: 2.0, cnic: '', email: '', address: '', bank_name: '', bank_account: '', bank_iban: '', notes: ''
  });
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);

  useEffect(() => { loadBrokers(); loadSummary(); }, []);

  const loadBrokers = async () => {
    try {
      const res = await api.get('/brokers');
      setBrokers(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    try {
      const res = await api.get('/brokers/summary');
      setSummary(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingBroker) {
        await api.put(`/brokers/${editingBroker.id}`, formData);
      } else {
        await api.post('/brokers', formData);
      }
      setShowModal(false);
      setEditingBroker(null);
      resetForm();
      loadBrokers();
      loadSummary();
    } catch (err) {
      alert(err.response?.data?.detail || 'Error saving broker');
    }
  };

  const resetForm = () => setFormData({
    name: '', mobile: '', company: '', commission_rate: 2.0, cnic: '', email: '', address: '', bank_name: '', bank_account: '', bank_iban: '', notes: ''
  });

  const handleDelete = async (broker) => {
    if (!confirm(`Delete "${broker.name}"?`)) return;
    try {
      await api.delete(`/brokers/${broker.id}`);
      loadBrokers();
      loadSummary();
      if (selectedBroker?.id === broker.id) setSelectedBroker(null);
    } catch (err) {
      alert(err.response?.data?.detail || 'Error deleting');
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    const fd = new FormData();
    fd.append('file', importFile);
    try {
      const res = await api.post('/brokers/bulk-import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setImportResult(res.data);
      setImportFile(null);
      loadBrokers();
      loadSummary();
    } catch (err) {
      setImportResult({ success: 0, errors: [err.response?.data?.detail || err.message] });
    }
  };

  const formatCurrency = (n) => new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(n || 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Brokers</h2>
          <p className="text-sm text-gray-500 mt-1">Partner network</p>
        </div>
        <button
          onClick={() => { setEditingBroker(null); resetForm(); setShowModal(true); }}
          className="bg-gray-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-800 transition"
        >
          Add Broker
        </button>
      </div>

      {/* Summary Cards - McKinsey style */}
      {summary && (
        <div className="grid grid-cols-4 gap-4">
          <SummaryCard label="Total Brokers" value={summary.total_brokers} />
          <SummaryCard label="Active" value={summary.active_brokers} />
          <SummaryCard label="Brokered Deals" value={summary.total_deals} />
          <SummaryCard label="Commission Owed" value={formatCurrency(summary.total_commission_owed)} />
        </div>
      )}

      {/* Brokers Grid */}
      {loading ? (
        <div className="p-12 text-center text-gray-400">Loading...</div>
      ) : brokers.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center text-gray-400">
          No brokers yet. Add your first broker to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {brokers.map(b => (
            <div
              key={b.id}
              onClick={() => setSelectedBroker(selectedBroker?.id === b.id ? null : b)}
              className={`bg-white rounded-2xl shadow-sm border transition-all cursor-pointer ${
                selectedBroker?.id === b.id ? 'border-gray-900 ring-1 ring-gray-900' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs font-mono text-gray-400 mb-1">{b.broker_id}</div>
                    <div className="font-semibold text-gray-900">{b.name}</div>
                    {b.company && <div className="text-sm text-gray-500">{b.company}</div>}
                  </div>
                  <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    b.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {b.status}
                  </div>
                </div>
                <div className="mt-4 text-sm text-gray-600">{b.mobile}</div>
                {b.is_also_customer && (
                  <div className="mt-2 text-xs text-blue-600">Also a customer ({b.customer_id})</div>
                )}
                <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between text-xs">
                  <span className="text-gray-400">Commission Rate</span>
                  <span className="font-semibold text-gray-700">{b.commission_rate}%</span>
                </div>
              </div>

              {/* Expanded Details */}
              {selectedBroker?.id === b.id && (
                <div className="border-t border-gray-100 p-5 bg-gray-50 rounded-b-2xl space-y-4">
                  {/* Financials - Placeholder until transactions exist */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-gray-400">Total Sales</div>
                      <div className="font-semibold">{formatCurrency(b.stats.total_sales_value)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Deals</div>
                      <div className="font-semibold">{b.stats.total_deals}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Commission Earned</div>
                      <div className="font-semibold text-green-600">{formatCurrency(b.stats.commission_earned)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Pending</div>
                      <div className="font-semibold text-amber-600">{formatCurrency(b.stats.commission_pending)}</div>
                    </div>
                  </div>

                  {/* Bank Info */}
                  {b.bank_name && (
                    <div className="text-xs text-gray-500">
                      Bank: {b.bank_name} • {b.bank_account}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingBroker(b); setFormData({ name: b.name, mobile: b.mobile, company: b.company || '', commission_rate: b.commission_rate, cnic: b.cnic || '', email: b.email || '', address: b.address || '', bank_name: b.bank_name || '', bank_account: b.bank_account || '', bank_iban: b.bank_iban || '', notes: b.notes || '' }); setShowModal(true); }}
                      className="flex-1 py-2 text-sm font-medium text-gray-600 bg-white rounded-lg border border-gray-200 hover:bg-gray-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(b); }}
                      className="py-2 px-4 text-sm text-red-500 bg-white rounded-lg border border-gray-200 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Bulk Import */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Bulk Import</h3>
        <div className="flex items-center gap-4">
          <button
            onClick={async () => {
              const res = await api.get('/brokers/template/download', { responseType: 'blob' });
              const url = window.URL.createObjectURL(new Blob([res.data]));
              const a = document.createElement('a'); a.href = url; a.download = 'brokers_template.csv'; a.click();
            }}
            className="text-sm text-gray-600 hover:text-gray-900 underline"
          >
            Download Template
          </button>
          <input type="file" accept=".csv" onChange={e => setImportFile(e.target.files[0])} className="text-sm" />
          {importFile && (
            <button onClick={handleImport} className="bg-gray-900 text-white px-3 py-1.5 text-sm rounded-lg">
              Import
            </button>
          )}
        </div>
        {importResult && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${importResult.success > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {importResult.success > 0 ? `✓ Imported ${importResult.success} brokers` : 'Import failed'}
            {importResult.errors?.length > 0 && <div className="mt-1 text-xs">{importResult.errors.join(', ')}</div>}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <Modal title={editingBroker ? 'Edit Broker' : 'Add Broker'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Name" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
              <Input label="Mobile" required value={formData.mobile} onChange={e => setFormData({ ...formData, mobile: e.target.value })} placeholder="0300-1234567" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Company" value={formData.company} onChange={e => setFormData({ ...formData, company: e.target.value })} />
              <Input label="Commission %" type="number" step="0.1" value={formData.commission_rate} onChange={e => setFormData({ ...formData, commission_rate: parseFloat(e.target.value) })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="CNIC" value={formData.cnic} onChange={e => setFormData({ ...formData, cnic: e.target.value })} />
              <Input label="Email" type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
            </div>
            <Input label="Address" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} />
            <div className="grid grid-cols-3 gap-4">
              <Input label="Bank" value={formData.bank_name} onChange={e => setFormData({ ...formData, bank_name: e.target.value })} />
              <Input label="Account #" value={formData.bank_account} onChange={e => setFormData({ ...formData, bank_account: e.target.value })} />
              <Input label="IBAN" value={formData.bank_iban} onChange={e => setFormData({ ...formData, bank_iban: e.target.value })} />
            </div>
            <Input label="Notes" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800">{editingBroker ? 'Update' : 'Create'}</button>
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
function SummaryCard({ label, value }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
      <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Input({ label, required, ...props }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <input
        {...props}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition"
      />
    </div>
  );
}
