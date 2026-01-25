import React, { useState, useEffect } from 'react';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export default function App() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    address: '',
    cnic: '',
    email: ''
  });
  
  // Bulk import state
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);

  // Load customers on mount
  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/customers');
      setCustomers(res.data);
      setError(null);
    } catch (err) {
      setError('Failed to load customers: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  // Form handlers
  const openAddModal = () => {
    setEditingCustomer(null);
    setFormData({ name: '', mobile: '', address: '', cnic: '', email: '' });
    setShowModal(true);
  };

  const openEditModal = (customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      mobile: customer.mobile,
      address: customer.address || '',
      cnic: customer.cnic || '',
      email: customer.email || ''
    });
    setShowModal(true);
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
      loadCustomers();
    } catch (err) {
      alert('Error: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleDelete = async (customer) => {
    if (!confirm(`Delete customer "${customer.name}"?`)) return;
    try {
      await api.delete(`/customers/${customer.id}`);
      loadCustomers();
    } catch (err) {
      alert('Error: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Bulk import handlers
  const downloadTemplate = async () => {
    try {
      const res = await api.get('/customers/template/download', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'customers_template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert('Download failed: ' + err.message);
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    
    setImporting(true);
    setImportResult(null);
    
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const res = await api.post('/customers/bulk-import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setImportResult(res.data);
      setImportFile(null);
      loadCustomers();
    } catch (err) {
      setImportResult({ success: 0, errors: [err.response?.data?.detail || err.message] });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-blue-900 text-white py-4 px-6 shadow">
        <h1 className="text-2xl font-bold">🏠 Sitara CRM</h1>
      </header>

      <main className="max-w-6xl mx-auto py-6 px-4">
        {/* Tabs - Only Customers for now */}
        <div className="mb-6">
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium">
            👥 Customers
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Customers Section */}
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">Customers ({customers.length})</h2>
            <button
              onClick={openAddModal}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              + Add Customer
            </button>
          </div>

          {/* Customers Table */}
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : customers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No customers yet. Add your first customer!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3 font-medium">Customer ID</th>
                    <th className="text-left p-3 font-medium">Name</th>
                    <th className="text-left p-3 font-medium">Mobile</th>
                    <th className="text-left p-3 font-medium">CNIC</th>
                    <th className="text-left p-3 font-medium">Address</th>
                    <th className="text-center p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id} className="border-t hover:bg-gray-50">
                      <td className="p-3 font-mono text-blue-600">{c.customer_id}</td>
                      <td className="p-3 font-medium">{c.name}</td>
                      <td className="p-3">{c.mobile}</td>
                      <td className="p-3 text-gray-600">{c.cnic || '-'}</td>
                      <td className="p-3 text-gray-600 max-w-xs truncate">{c.address || '-'}</td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => openEditModal(c)}
                          className="text-blue-600 hover:text-blue-800 mr-3"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => handleDelete(c)}
                          className="text-red-600 hover:text-red-800"
                        >
                          🗑️ Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Bulk Import Section */}
        <div className="bg-white rounded-xl shadow p-6 mt-6">
          <h3 className="text-lg font-semibold mb-4">📤 Bulk Import</h3>
          
          <div className="grid md:grid-cols-2 gap-6">
            {/* Step 1: Download Template */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium mb-2">Step 1: Download Template</h4>
              <p className="text-sm text-gray-600 mb-3">
                Get the CSV template with the correct column headers.
              </p>
              <button
                onClick={downloadTemplate}
                className="bg-gray-800 text-white px-4 py-2 rounded hover:bg-gray-900"
              >
                📥 Download Template
              </button>
            </div>

            {/* Step 2: Upload CSV */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium mb-2">Step 2: Upload Filled CSV</h4>
              <p className="text-sm text-gray-600 mb-3">
                Fill in your data and upload the CSV file.
              </p>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setImportFile(e.target.files[0])}
                className="block w-full text-sm mb-2"
              />
              {importFile && (
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {importing ? '⏳ Importing...' : '🚀 Import Now'}
                </button>
              )}
            </div>
          </div>

          {/* Import Results */}
          {importResult && (
            <div className={`mt-4 p-4 rounded ${importResult.success > 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <p className="font-medium">
                {importResult.success > 0 ? `✅ Successfully imported ${importResult.success} customers` : '❌ Import failed'}
              </p>
              {importResult.errors?.length > 0 && (
                <ul className="mt-2 text-sm text-red-600">
                  {importResult.errors.map((err, i) => (
                    <li key={i}>• {err}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* SQL Commands Reference */}
        <div className="bg-white rounded-xl shadow p-6 mt-6">
          <h3 className="text-lg font-semibold mb-4">🛠️ Direct SQL Commands</h3>
          <p className="text-sm text-gray-600 mb-4">
            Connect to database: <code className="bg-gray-100 px-2 py-1 rounded">docker exec -it sitara_db psql -U sitara -d sitara_crm</code>
          </p>
          <div className="bg-gray-900 text-green-400 p-4 rounded-lg text-sm font-mono overflow-x-auto">
            <p className="text-gray-500">-- View all customers</p>
            <p>SELECT * FROM customers;</p>
            <br />
            <p className="text-gray-500">-- Insert customer (customer_id auto-generated)</p>
            <p>INSERT INTO customers (name, mobile, address) VALUES ('Test User', '0300-0000000', 'Test Address');</p>
            <br />
            <p className="text-gray-500">-- Add new column (flexible schema)</p>
            <p>ALTER TABLE customers ADD COLUMN occupation VARCHAR(100);</p>
            <br />
            <p className="text-gray-500">-- Update customer</p>
            <p>UPDATE customers SET address = 'New Address' WHERE mobile = '0300-0000000';</p>
            <br />
            <p className="text-gray-500">-- Delete customer</p>
            <p>DELETE FROM customers WHERE mobile = '0300-0000000';</p>
          </div>
        </div>
      </main>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold">
                {editingCustomer ? 'Edit Customer' : 'Add Customer'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Mobile <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.mobile}
                  onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0300-1234567"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">CNIC</label>
                <input
                  type="text"
                  value={formData.cnic}
                  onChange={(e) => setFormData({ ...formData, cnic: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="35201-1234567-1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={2}
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingCustomer ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
