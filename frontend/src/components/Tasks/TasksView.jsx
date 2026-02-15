import React, { useState, useEffect, useCallback, useRef } from 'react';

const PRIORITY_STYLES = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-blue-100 text-blue-700 border-blue-200',
  low: 'bg-gray-100 text-gray-600 border-gray-200',
};
const STATUS_STYLES = {
  pending: 'bg-yellow-50 text-yellow-700', in_progress: 'bg-blue-50 text-blue-700',
  completed: 'bg-green-50 text-green-700', cancelled: 'bg-gray-100 text-gray-500',
  on_hold: 'bg-purple-50 text-purple-700', overdue: 'bg-red-50 text-red-700',
};
const DEPARTMENTS = ['Sales', 'Recovery', 'Finance', 'Operations'];
const fmtDate = (d) => { if (!d) return '-'; try { return new Date(d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return '-'; } };
const fmtDateTime = (d) => { if (!d) return '-'; try { return new Date(d).toLocaleString('en-PK', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return '-'; } };
const isOverdue = (t) => t.due_date && t.status !== 'completed' && t.status !== 'cancelled' && new Date(t.due_date) < new Date();
const inputCls = "w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10";
const labelCls = "block text-xs font-medium text-gray-500 mb-1";

// ============================================
// MAIN TASKS VIEW
// ============================================
export default function TasksView({ api, user, addToast, setActiveTab }) {
  const [subTab, setSubTab] = useState('active');
  const [tasks, setTasks] = useState([]);
  const [myTasks, setMyTasks] = useState([]);
  const [reps, setReps] = useState([]);
  const [summary, setSummary] = useState(null);
  const [deptConfig, setDeptConfig] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState({ status: '', priority: '', department: '', type: '' });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const searchTimerRef = useRef(null);

  // F14: Debounce search input (300ms)
  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [search]);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.priority) params.priority = filters.priority;
      if (filters.department) params.department = filters.department;
      if (filters.type) params.type = filters.type;
      if (debouncedSearch) params.search = debouncedSearch;
      const [tasksRes, repsRes] = await Promise.all([
        api.get('/tasks', { params }).catch(() => ({ data: [] })),
        api.get('/company-reps').catch(() => ({ data: [] })),
      ]);
      setTasks(tasksRes.data || []);
      setReps(repsRes.data || []);
    } catch (e) { console.error('Failed to load tasks:', e); }
    finally { setLoading(false); }
  }, [api, filters, debouncedSearch]);

  const loadMyTasks = useCallback(async () => {
    try { const res = await api.get('/tasks/my').catch(() => ({ data: [] })); setMyTasks(res.data || []); }
    catch (e) { console.error(e); }
  }, [api]);

  const loadSummary = useCallback(async () => {
    try {
      const [sumRes, deptRes] = await Promise.all([
        api.get('/tasks/reports/summary').catch(() => ({ data: null })),
        api.get('/tasks/departments/config').catch(() => ({ data: [] })),
      ]);
      setSummary(sumRes.data);
      setDeptConfig(deptRes.data || []);
    } catch (e) { console.error(e); }
  }, [api]);

  useEffect(() => { loadTasks(); }, [loadTasks]);
  useEffect(() => { if (subTab === 'my') loadMyTasks(); }, [subTab, loadMyTasks]);
  useEffect(() => { if (subTab === 'dashboard') loadSummary(); }, [subTab, loadSummary]);

  const openDetail = async (taskId) => {
    setShowDetailModal(taskId); setDetailLoading(true); setDetailData(null);
    try { const res = await api.get(`/tasks/${taskId}`); setDetailData(res.data); }
    catch (e) { if (addToast) addToast('Error', 'Failed to load task details', 'error'); }
    finally { setDetailLoading(false); }
  };
  const closeDetail = () => { setShowDetailModal(null); setDetailData(null); };

  const quickComplete = async (taskId) => {
    try {
      const fd = new FormData(); fd.append('notes', 'Completed via quick action');
      await api.post(`/tasks/${taskId}/complete`, fd);
      if (addToast) addToast('Success', 'Task completed', 'success');
      loadTasks(); loadMyTasks();
    } catch (e) { if (addToast) addToast('Error', e.response?.data?.detail || 'Failed to complete', 'error'); }
  };

  const filteredTasks = (subTab === 'my' ? myTasks : tasks).filter(t => {
    if (debouncedSearch && subTab !== 'active') {
      const q = debouncedSearch.toLowerCase();
      if (!(t.title ?? '').toLowerCase().includes(q) && !(t.task_id ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const tasksByDept = DEPARTMENTS.reduce((acc, dept) => {
    acc[dept] = tasks.filter(t => (t.department ?? '').toLowerCase() === dept.toLowerCase());
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Tasks</h2>
          <p className="text-sm text-gray-500 mt-1">Manage and track team tasks</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="text" placeholder="Search tasks..." value={search} onChange={e => setSearch(e.target.value)}
            className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 w-56" />
          <button onClick={() => setShowCreateModal(true)}
            className="bg-gray-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-800">New Task</button>
        </div>
      </div>
      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {[{ id: 'active', label: 'Active' }, { id: 'my', label: 'My Tasks' }, { id: 'department', label: 'By Department' }, { id: 'dashboard', label: 'Dashboard' }].map(tab => (
          <button key={tab.id} onClick={() => setSubTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${subTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === 'active' && (<>
        <FilterBar filters={filters} setFilters={setFilters} />
        <TaskTable tasks={filteredTasks} loading={loading} onRowClick={openDetail} onComplete={quickComplete} showComplete={false} />
      </>)}
      {subTab === 'my' && <TaskTable tasks={filteredTasks} loading={loading} onRowClick={openDetail} onComplete={quickComplete} showComplete={true} />}
      {subTab === 'department' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {DEPARTMENTS.map(dept => <DepartmentColumn key={dept} name={dept} tasks={tasksByDept[dept] ?? []} onRowClick={openDetail} />)}
        </div>
      )}
      {subTab === 'dashboard' && <DashboardTab summary={summary} tasks={tasks} deptConfig={deptConfig} />}

      {showCreateModal && <CreateTaskModal api={api} reps={reps} addToast={addToast}
        onClose={() => setShowCreateModal(false)} onCreated={() => { setShowCreateModal(false); loadTasks(); loadMyTasks(); }} />}
      {showDetailModal && <TaskDetailModal api={api} reps={reps} user={user} addToast={addToast}
        taskId={showDetailModal} data={detailData} loading={detailLoading} onClose={closeDetail}
        onUpdated={() => { openDetail(showDetailModal); loadTasks(); loadMyTasks(); }} />}
    </div>
  );
}

// ============================================
// FILTER BAR
// ============================================
function FilterBar({ filters, setFilters }) {
  const sel = "px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 bg-white";
  return (
    <div className="flex flex-wrap gap-3">
      <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} className={sel}>
        <option value="">All Statuses</option>
        <option value="pending">Pending</option><option value="in_progress">In Progress</option>
        <option value="completed">Completed</option><option value="on_hold">On Hold</option><option value="cancelled">Cancelled</option>
      </select>
      <select value={filters.priority} onChange={e => setFilters(f => ({ ...f, priority: e.target.value }))} className={sel}>
        <option value="">All Priorities</option>
        <option value="urgent">Urgent</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
      </select>
      <select value={filters.department} onChange={e => setFilters(f => ({ ...f, department: e.target.value }))} className={sel}>
        <option value="">All Departments</option>
        {DEPARTMENTS.map(d => <option key={d} value={d.toLowerCase()}>{d}</option>)}
      </select>
      <select value={filters.type} onChange={e => setFilters(f => ({ ...f, type: e.target.value }))} className={sel}>
        <option value="">All Types</option>
        <option value="general">General</option><option value="follow_up">Follow-up</option>
        <option value="recovery">Recovery</option><option value="documentation">Documentation</option><option value="site_visit">Site Visit</option>
      </select>
      {(filters.status || filters.priority || filters.department || filters.type) && (
        <button onClick={() => setFilters({ status: '', priority: '', department: '', type: '' })} className="text-sm text-gray-500 hover:text-gray-700 underline">Clear Filters</button>
      )}
    </div>
  );
}

// ============================================
// TASK TABLE
// ============================================
function TaskTable({ tasks, loading, onRowClick, onComplete, showComplete }) {
  if (loading) return <div className="p-12 text-center text-gray-400">Loading...</div>;
  if (!tasks.length) return <div className="bg-white rounded-2xl shadow-sm border p-12 text-center text-gray-400">No tasks found</div>;
  return (
    <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
      <table className="w-full">
        <thead><tr className="border-b border-gray-100">
          <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Task</th>
          <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Assignee</th>
          <th className="text-center text-xs font-medium text-gray-500 uppercase px-6 py-4">Priority</th>
          <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Due Date</th>
          <th className="text-center text-xs font-medium text-gray-500 uppercase px-6 py-4">Status</th>
          {showComplete && <th className="text-center text-xs font-medium text-gray-500 uppercase px-6 py-4">Action</th>}
        </tr></thead>
        <tbody className="divide-y divide-gray-50">
          {tasks.map(t => {
            const overdue = isOverdue(t);
            return (
              <tr key={t.id ?? t.task_id} className="hover:bg-gray-50 cursor-pointer" onClick={() => onRowClick(t.id)}>
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">{t.title ?? 'Untitled'}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{t.task_id ?? ''} {t.department ? `/ ${t.department}` : ''}</div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{t.assignee_name ?? t.assigned_to_name ?? 'Unassigned'}</td>
                <td className="px-6 py-4 text-center">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium border ${PRIORITY_STYLES[t.priority] ?? PRIORITY_STYLES.medium}`}>
                    {(t.priority ?? 'medium').toUpperCase()}</span>
                </td>
                <td className={`px-6 py-4 text-sm ${overdue ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                  {fmtDate(t.due_date)}{overdue && <span className="ml-1 text-xs text-red-500">(overdue)</span>}
                </td>
                <td className="px-6 py-4 text-center">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[t.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {(t.status ?? 'pending').replace(/_/g, ' ')}</span>
                </td>
                {showComplete && (
                  <td className="px-6 py-4 text-center" onClick={e => e.stopPropagation()}>
                    {t.status !== 'completed' && t.status !== 'cancelled' && (
                      <button onClick={() => onComplete(t.id)}
                        className="text-xs text-green-600 hover:text-green-800 font-medium border border-green-200 rounded-lg px-2 py-1 hover:bg-green-50">Complete</button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================
// DEPARTMENT COLUMN
// ============================================
function DepartmentColumn({ name, tasks, onRowClick }) {
  const pending = tasks.filter(t => t.status === 'pending').length;
  const active = tasks.filter(t => t.status === 'in_progress').length;
  const overdue = tasks.filter(t => isOverdue(t)).length;
  return (
    <div className="bg-white rounded-2xl shadow-sm border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">{name}</h3>
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{tasks.length}</span>
      </div>
      <div className="flex gap-2 mb-3 text-xs">
        {pending > 0 && <span className="bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded">{pending} pending</span>}
        {active > 0 && <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{active} active</span>}
        {overdue > 0 && <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded">{overdue} overdue</span>}
      </div>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {tasks.length === 0 && <div className="text-xs text-gray-400 text-center py-4">No tasks</div>}
        {tasks.slice(0, 20).map(t => (
          <button key={t.id ?? t.task_id} onClick={() => onRowClick(t.id)}
            className="w-full text-left p-2.5 rounded-lg border hover:bg-gray-50 transition-colors">
            <div className="text-sm font-medium text-gray-800 truncate">{t.title ?? 'Untitled'}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${PRIORITY_STYLES[t.priority] ?? PRIORITY_STYLES.medium}`}>
                {(t.priority ?? 'medium').toUpperCase()}</span>
              <span className="text-[10px] text-gray-400">{fmtDate(t.due_date)}</span>
              {isOverdue(t) && <span className="text-[10px] text-red-500 font-medium">OVERDUE</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================
// DASHBOARD TAB
// ============================================
function DashboardTab({ summary, tasks }) {
  const s = summary ?? {};
  const deptBreakdown = DEPARTMENTS.map(dept => {
    const dt = (tasks ?? []).filter(t => (t.department ?? '').toLowerCase() === dept.toLowerCase());
    return { name: dept, total: dt.length, completed: dt.filter(t => t.status === 'completed').length,
      inProgress: dt.filter(t => t.status === 'in_progress').length, overdue: dt.filter(t => isOverdue(t)).length };
  });
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[{ l: 'Total Tasks', v: s.total ?? 0 }, { l: 'In Progress', v: s.in_progress ?? 0 },
          { l: 'Completed', v: s.completed ?? 0 }, { l: 'Overdue', v: s.overdue ?? 0 }].map(c => (
          <div key={c.l} className="bg-white rounded-2xl shadow-sm border p-5">
            <div className="text-xs font-medium text-gray-400 uppercase">{c.l}</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">{c.v}</div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl shadow-sm border p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Department Breakdown</h3>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100">
            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Department</th>
            <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Total</th>
            <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">In Progress</th>
            <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Completed</th>
            <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Overdue</th>
            <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Completion %</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {deptBreakdown.map(d => {
              const pct = d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0;
              return (
                <tr key={d.name} className="hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium text-gray-900">{d.name}</td>
                  <td className="py-3 px-4 text-center text-gray-600">{d.total}</td>
                  <td className="py-3 px-4 text-center text-blue-600">{d.inProgress}</td>
                  <td className="py-3 px-4 text-center text-green-600">{d.completed}</td>
                  <td className="py-3 px-4 text-center text-red-600">{d.overdue}</td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct}%` }} /></div>
                      <span className="text-xs text-gray-500">{pct}%</span>
                    </div>
                  </td>
                </tr>);
            })}
          </tbody>
        </table>
      </div>
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {['urgent', 'high', 'medium', 'low'].map(p => (
            <div key={p} className={`rounded-2xl border p-4 ${PRIORITY_STYLES[p]}`}>
              <div className="text-xs font-medium uppercase">{p}</div>
              <div className="mt-1 text-xl font-semibold">{s[`priority_${p}`] ?? (tasks ?? []).filter(t => t.priority === p).length}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// CREATE TASK MODAL
// ============================================
function CreateTaskModal({ api, reps, addToast, onClose, onCreated }) {
  const [form, setForm] = useState({
    title: '', description: '', type: 'general', priority: 'medium',
    department: '', assigned_to: '', due_date: '', crm_entity_type: '', crm_entity_id: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // F12: Escape key closes modal
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('title', form.title.trim());
      if (form.description) fd.append('description', form.description);
      fd.append('type', form.type); fd.append('priority', form.priority);
      if (form.department) fd.append('department', form.department);
      if (form.assigned_to) fd.append('assigned_to', form.assigned_to);
      if (form.due_date) fd.append('due_date', form.due_date);
      if (form.crm_entity_type) fd.append('crm_entity_type', form.crm_entity_type);
      if (form.crm_entity_id) fd.append('crm_entity_id', form.crm_entity_id);
      await api.post('/tasks', fd);
      if (addToast) addToast('Success', 'Task created', 'success');
      onCreated();
    } catch (e) { if (addToast) addToast('Error', e.response?.data?.detail || 'Failed to create task', 'error'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl mx-4 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b flex justify-between items-center sticky top-0 bg-white rounded-t-2xl">
          <h3 className="text-lg font-semibold">New Task</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div><label className={labelCls}>Title <span className="text-red-400">*</span></label>
            <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputCls} placeholder="Task title" /></div>
          <div><label className={labelCls}>Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className={inputCls} placeholder="Details..." /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelCls}>Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className={inputCls}>
                <option value="general">General</option><option value="follow_up">Follow-up</option>
                <option value="recovery">Recovery</option><option value="documentation">Documentation</option><option value="site_visit">Site Visit</option>
              </select></div>
            <div><label className={labelCls}>Priority</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className={inputCls}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
              </select></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelCls}>Department</label>
              <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} className={inputCls}>
                <option value="">None</option>
                {DEPARTMENTS.map(d => <option key={d} value={d.toLowerCase()}>{d}</option>)}
              </select></div>
            <div><label className={labelCls}>Assignee</label>
              <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} className={inputCls}>
                <option value="">Unassigned</option>
                {(reps ?? []).map(r => <option key={r.id} value={r.id}>{r.name ?? r.rep_id}</option>)}
              </select></div>
          </div>
          <div><label className={labelCls}>Due Date</label>
            <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelCls}>CRM Link Type</label>
              <select value={form.crm_entity_type} onChange={e => setForm(f => ({ ...f, crm_entity_type: e.target.value }))} className={inputCls}>
                <option value="">None</option><option value="customer">Customer</option><option value="transaction">Transaction</option>
                <option value="inventory">Inventory</option><option value="lead">Lead</option>
              </select></div>
            <div><label className={labelCls}>CRM Entity ID</label>
              <input value={form.crm_entity_id} onChange={e => setForm(f => ({ ...f, crm_entity_id: e.target.value }))} className={inputCls} placeholder="e.g. CUST-0001" disabled={!form.crm_entity_type} /></div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50">
              {submitting ? 'Creating...' : 'Create Task'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================
// TASK DETAIL MODAL
// ============================================
function TaskDetailModal({ api, reps, user, addToast, taskId, data, loading, onClose, onUpdated }) {
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showDelegate, setShowDelegate] = useState(false);
  const [delegateTo, setDelegateTo] = useState('');

  // F12: Escape key closes modal
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const task = data?.task ?? data ?? {};
  const comments = data?.comments ?? [];
  const activities = data?.activities ?? [];
  const subtasks = data?.subtasks ?? [];

  const updateStatus = async (newStatus) => {
    setSubmitting(true);
    try {
      const fd = new FormData(); fd.append('status', newStatus);
      await api.put(`/tasks/${taskId}`, fd);
      if (addToast) addToast('Success', `Status updated to ${newStatus.replace(/_/g, ' ')}`, 'success');
      onUpdated();
    } catch (e) { if (addToast) addToast('Error', e.response?.data?.detail || 'Update failed', 'error'); }
    finally { setSubmitting(false); }
  };
  const completeTask = async () => {
    setSubmitting(true);
    try {
      const fd = new FormData(); fd.append('notes', 'Completed from detail view');
      await api.post(`/tasks/${taskId}/complete`, fd);
      if (addToast) addToast('Success', 'Task completed', 'success'); onUpdated();
    } catch (e) { if (addToast) addToast('Error', e.response?.data?.detail || 'Failed to complete', 'error'); }
    finally { setSubmitting(false); }
  };
  const addComment = async () => {
    if (!commentText.trim()) return; setSubmitting(true);
    try {
      const fd = new FormData(); fd.append('content', commentText.trim());
      await api.post(`/tasks/${taskId}/comments`, fd);
      setCommentText(''); onUpdated();
    } catch (e) { if (addToast) addToast('Error', e.response?.data?.detail || 'Failed to add comment', 'error'); }
    finally { setSubmitting(false); }
  };
  const handleDelegate = async () => {
    if (!delegateTo) return; setSubmitting(true);
    try {
      const fd = new FormData(); fd.append('new_assignee_id', delegateTo);
      await api.post(`/tasks/${taskId}/delegate`, fd);
      if (addToast) addToast('Success', 'Task delegated', 'success');
      setShowDelegate(false); setDelegateTo(''); onUpdated();
    } catch (e) { if (addToast) addToast('Error', e.response?.data?.detail || 'Delegation failed', 'error'); }
    finally { setSubmitting(false); }
  };

  const isActive = task.status !== 'completed' && task.status !== 'cancelled';

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl mx-4 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b flex justify-between items-center sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <h3 className="text-lg font-semibold">{loading ? 'Loading...' : (task.title ?? 'Task Detail')}</h3>
            {!loading && <span className="text-xs text-gray-400">{task.task_id ?? ''}</span>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        {loading ? <div className="p-12 text-center text-gray-400">Loading task details...</div> : (
          <div className="p-5 space-y-5">
            {/* Info Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <InfoCell label="Status"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[task.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {(task.status ?? 'pending').replace(/_/g, ' ')}</span></InfoCell>
              <InfoCell label="Priority"><span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.medium}`}>
                {(task.priority ?? 'medium').toUpperCase()}</span></InfoCell>
              <InfoCell label="Department" value={task.department ?? 'N/A'} />
              <InfoCell label="Type" value={(task.type ?? task.task_type ?? 'general').replace(/_/g, ' ')} />
              <InfoCell label="Assignee" value={task.assignee_name ?? task.assigned_to_name ?? 'Unassigned'} />
              <InfoCell label="Created By" value={task.creator_name ?? task.created_by_name ?? 'N/A'} />
              <InfoCell label="Due Date" value={fmtDate(task.due_date)} highlight={isOverdue(task)} />
              <InfoCell label="Created" value={fmtDate(task.created_at)} />
            </div>
            {/* Description */}
            {task.description && (<div>
              <div className="text-xs font-medium text-gray-500 mb-1">Description</div>
              <div className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">{task.description}</div>
            </div>)}
            {/* CRM Link */}
            {task.crm_entity_type && task.crm_entity_id && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Linked to:</span>
                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-medium">{task.crm_entity_type} {task.crm_entity_id}</span>
              </div>)}
            {/* Action Buttons */}
            {isActive && (
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                {task.status === 'pending' && <button onClick={() => updateStatus('in_progress')} disabled={submitting}
                  className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">Start Task</button>}
                {task.status === 'in_progress' && <button onClick={() => updateStatus('on_hold')} disabled={submitting}
                  className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">Put on Hold</button>}
                {task.status === 'on_hold' && <button onClick={() => updateStatus('in_progress')} disabled={submitting}
                  className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">Resume</button>}
                <button onClick={completeTask} disabled={submitting}
                  className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">Mark Complete</button>
                <button onClick={() => setShowDelegate(!showDelegate)} disabled={submitting}
                  className="px-3 py-1.5 text-xs font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Delegate</button>
                <button onClick={() => updateStatus('cancelled')} disabled={submitting}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg">Cancel</button>
              </div>)}
            {/* Delegate Panel */}
            {showDelegate && (
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-3">
                <select value={delegateTo} onChange={e => setDelegateTo(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10">
                  <option value="">Select assignee...</option>
                  {(reps ?? []).map(r => <option key={r.id} value={r.id}>{r.name ?? r.rep_id}</option>)}
                </select>
                <button onClick={handleDelegate} disabled={!delegateTo || submitting}
                  className="px-3 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50">Assign</button>
              </div>)}
            {/* Subtasks */}
            {subtasks.length > 0 && (<div>
              <div className="text-xs font-medium text-gray-500 mb-2">Subtasks ({subtasks.length})</div>
              <div className="space-y-1">{subtasks.map((st, i) => (
                <div key={st.id ?? i} className="flex items-center gap-2 text-sm py-1.5 px-2 rounded hover:bg-gray-50">
                  <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-[10px] ${st.status === 'completed' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`}>
                    {st.status === 'completed' ? '\u2713' : ''}</span>
                  <span className={st.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-700'}>{st.title ?? 'Subtask'}</span>
                </div>))}</div>
            </div>)}
            {/* Activity Timeline */}
            {activities.length > 0 && (<div>
              <div className="text-xs font-medium text-gray-500 mb-2">Activity</div>
              <div className="space-y-2 max-h-40 overflow-y-auto">{activities.map((a, i) => (
                <div key={a.id ?? i} className="flex gap-2 text-xs">
                  <span className="text-gray-400 whitespace-nowrap">{fmtDateTime(a.created_at ?? a.timestamp)}</span>
                  <span className="text-gray-600">{a.description ?? a.action ?? 'Activity'}</span>
                </div>))}</div>
            </div>)}
            {/* Comments */}
            <div>
              <div className="text-xs font-medium text-gray-500 mb-2">Comments ({comments.length})</div>
              {comments.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto mb-3">{comments.map((c, i) => (
                  <div key={c.id ?? i} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-medium text-gray-700">{c.author_name ?? c.rep_name ?? 'User'}</span>
                      <span className="text-[10px] text-gray-400">{fmtDateTime(c.created_at)}</span></div>
                    <div className="text-sm text-gray-600">{c.content ?? c.text ?? ''}</div>
                  </div>))}</div>)}
              <div className="flex gap-2">
                <input type="text" placeholder="Add a comment..." value={commentText} onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment(); } }}
                  className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
                <button onClick={addComment} disabled={!commentText.trim() || submitting}
                  className="px-3 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50">Post</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// INFO CELL (detail modal helper)
// ============================================
function InfoCell({ label, value, children, highlight }) {
  return (<div>
    <div className="text-[10px] font-medium text-gray-400 uppercase">{label}</div>
    {children ? <div className="mt-0.5">{children}</div> : (
      <div className={`text-sm mt-0.5 ${highlight ? 'text-red-600 font-medium' : 'text-gray-700'}`}>{value ?? 'N/A'}</div>)}
  </div>);
}
