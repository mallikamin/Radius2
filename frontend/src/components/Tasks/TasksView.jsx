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
      if (filters.type) params.task_type = filters.type;
      if (debouncedSearch) params.search = debouncedSearch;
      // Department view needs all tasks to show accurate per-department counts
      if (subTab === 'department') params.limit = 500;
      const [tasksRes, repsRes] = await Promise.all([
        api.get('/tasks', { params }).catch(() => ({ data: [] })),
        api.get('/company-reps').catch(() => ({ data: [] })),
      ]);
      setTasks(tasksRes.data || []);
      setReps(repsRes.data || []);
    } catch (e) { console.error('Failed to load tasks:', e); }
    finally { setLoading(false); }
  }, [api, filters, debouncedSearch, subTab]);

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
        {[{ id: 'active', label: 'Active' }, { id: 'kanban', label: 'Board' }, { id: 'timeline', label: 'Timeline' }, { id: 'my', label: 'My Tasks' }, { id: 'department', label: 'By Department' }, { id: 'dashboard', label: 'Dashboard' }].map(tab => (
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
      {subTab === 'kanban' && <KanbanBoard tasks={tasks} loading={loading} api={api} addToast={addToast}
        onCardClick={openDetail} onStatusChange={() => { loadTasks(); loadMyTasks(); }} />}
      {subTab === 'timeline' && <TimelineView tasks={tasks} loading={loading} onCardClick={openDetail} />}
      {subTab === 'department' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {DEPARTMENTS.map(dept => <DepartmentColumn key={dept} name={dept} tasks={tasksByDept[dept] ?? []} onRowClick={openDetail} />)}
        </div>
      )}
      {subTab === 'dashboard' && <DashboardTab api={api} summary={summary} tasks={tasks} deptConfig={deptConfig} />}

      {showCreateModal && <CreateTaskModal api={api} reps={reps} addToast={addToast}
        onClose={() => setShowCreateModal(false)} onCreated={() => { setShowCreateModal(false); loadTasks(); loadMyTasks(); }} />}
      {showDetailModal && <TaskDetailModal api={api} reps={reps} user={user} addToast={addToast}
        taskId={showDetailModal} data={detailData} loading={detailLoading} onClose={closeDetail}
        onUpdated={() => { openDetail(showDetailModal); loadTasks(); loadMyTasks(); }}
        onDeleted={() => { loadTasks(); loadMyTasks(); }} />}
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
                <td className="px-6 py-4 text-sm text-gray-600">{t.assignee_name ?? t.assigned_to_name ?? 'Unassigned'}{(t.collaborators ?? []).length > 0 && <span className="ml-1 text-xs text-gray-400">+{t.collaborators.length}</span>}</td>
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
// KANBAN BOARD
// ============================================
const KANBAN_COLUMNS = [
  { id: 'pending', label: 'Pending', color: 'border-yellow-400', bg: 'bg-yellow-50', dot: 'bg-yellow-400' },
  { id: 'in_progress', label: 'In Progress', color: 'border-blue-400', bg: 'bg-blue-50', dot: 'bg-blue-400' },
  { id: 'on_hold', label: 'On Hold', color: 'border-purple-400', bg: 'bg-purple-50', dot: 'bg-purple-400' },
  { id: 'completed', label: 'Completed', color: 'border-green-400', bg: 'bg-green-50', dot: 'bg-green-400' },
  { id: 'cancelled', label: 'Cancelled', color: 'border-gray-300', bg: 'bg-gray-50', dot: 'bg-gray-400' },
];

function KanbanBoard({ tasks, loading, api, addToast, onCardClick, onStatusChange }) {
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [updating, setUpdating] = useState(null);

  const moveTask = async (taskDbId, newStatus) => {
    setUpdating(taskDbId);
    try {
      const fd = new FormData(); fd.append('status', newStatus);
      await api.put(`/tasks/${taskDbId}`, fd);
      if (addToast) addToast('Success', `Moved to ${newStatus.replace(/_/g, ' ')}`, 'success');
      onStatusChange();
    } catch (e) { if (addToast) addToast('Error', e.response?.data?.detail || 'Failed to move task', 'error'); }
    finally { setUpdating(null); }
  };

  const onDragStart = (e, task) => { setDragId(task.id); e.dataTransfer.effectAllowed = 'move'; };
  const onDragEnd = () => { setDragId(null); setDragOver(null); };
  const onDragOverCol = (e, colId) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(colId); };
  const onDragLeaveCol = () => setDragOver(null);
  const onDropCol = (e, colId) => {
    e.preventDefault(); setDragOver(null);
    if (!dragId) return;
    const task = tasks.find(t => t.id === dragId);
    if (task && task.status !== colId) moveTask(task.id, colId);
    setDragId(null);
  };

  if (loading) return <div className="p-12 text-center text-gray-400">Loading...</div>;

  return (
    <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '70vh' }}>
      {KANBAN_COLUMNS.map(col => {
        const colTasks = tasks.filter(t => t.status === col.id);
        const isDragTarget = dragOver === col.id && dragId;
        return (
          <div key={col.id}
            className={`flex-shrink-0 w-72 rounded-xl border-t-3 ${col.color} bg-white flex flex-col transition-all ${isDragTarget ? 'ring-2 ring-gray-900/20 shadow-lg scale-[1.01]' : 'shadow-sm'}`}
            style={{ borderTopWidth: '3px' }}
            onDragOver={e => onDragOverCol(e, col.id)} onDragLeave={onDragLeaveCol} onDrop={e => onDropCol(e, col.id)}>
            {/* Column Header */}
            <div className="px-4 py-3 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                <span className="text-sm font-semibold text-gray-800">{col.label}</span>
              </div>
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{colTasks.length}</span>
            </div>
            {/* Cards */}
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
              {colTasks.length === 0 && (
                <div className={`rounded-lg border-2 border-dashed border-gray-200 p-6 text-center text-xs text-gray-400 ${isDragTarget ? 'border-gray-400 bg-gray-50' : ''}`}>
                  {isDragTarget ? 'Drop here' : 'No tasks'}
                </div>
              )}
              {colTasks.map(t => (
                <div key={t.id} draggable className={`rounded-lg border bg-white p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${dragId === t.id ? 'opacity-40 scale-95' : ''} ${updating === t.id ? 'opacity-60 pointer-events-none' : ''}`}
                  onDragStart={e => onDragStart(e, t)} onDragEnd={onDragEnd}
                  onClick={() => onCardClick(t.id)}>
                  <div className="text-sm font-medium text-gray-900 mb-2 line-clamp-2">{t.title ?? 'Untitled'}</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${PRIORITY_STYLES[t.priority] ?? PRIORITY_STYLES.medium}`}>
                      {(t.priority ?? 'medium').toUpperCase()}</span>
                    {t.due_date && (
                      <span className={`text-[10px] ${isOverdue(t) ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                        {fmtDate(t.due_date)}{isOverdue(t) ? ' !' : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
                    <span className="text-[10px] text-gray-400 truncate max-w-[120px]">{t.assignee_name ?? t.assigned_to_name ?? 'Unassigned'}</span>
                    <span className="text-[10px] text-gray-300">{t.task_id ?? ''}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================
// TIMELINE VIEW — Gantt-style
// ============================================
function TimelineView({ tasks, loading, onCardClick }) {
  const [scope, setScope] = useState('month'); // 'week' | 'month' | 'quarter'

  if (loading) return <div className="p-12 text-center text-gray-400">Loading...</div>;

  const activeTasks = tasks.filter(t => t.status !== 'cancelled');
  if (!activeTasks.length) return <div className="bg-white rounded-2xl shadow-sm border p-12 text-center text-gray-400">No tasks to display</div>;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const scopeDays = scope === 'week' ? 14 : scope === 'month' ? 42 : 90;

  // Timeline range: 7 days before today → scopeDays after today
  const rangeStart = new Date(today); rangeStart.setDate(rangeStart.getDate() - 7);
  const rangeEnd = new Date(today); rangeEnd.setDate(rangeEnd.getDate() + scopeDays);
  const totalDays = Math.round((rangeEnd - rangeStart) / 86400000);

  const dayToPercent = (d) => {
    const diff = Math.round((d - rangeStart) / 86400000);
    return Math.max(0, Math.min(100, (diff / totalDays) * 100));
  };

  // Generate day markers
  const dayMarkers = [];
  const markerDate = new Date(rangeStart);
  while (markerDate <= rangeEnd) {
    const isToday = markerDate.toDateString() === today.toDateString();
    const isMonday = markerDate.getDay() === 1;
    const isFirst = markerDate.getDate() === 1;
    if (isToday || isMonday || isFirst) {
      dayMarkers.push({ date: new Date(markerDate), pct: dayToPercent(markerDate), isToday, isFirst });
    }
    markerDate.setDate(markerDate.getDate() + 1);
  }

  // Sort tasks: overdue first, then by due date
  const sorted = [...activeTasks].sort((a, b) => {
    const aOver = isOverdue(a) ? 0 : 1;
    const bOver = isOverdue(b) ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;
    const aDate = a.due_date ? new Date(a.due_date) : new Date('2099-12-31');
    const bDate = b.due_date ? new Date(b.due_date) : new Date('2099-12-31');
    return aDate - bDate;
  });

  const BAR_COLORS = {
    pending: 'bg-yellow-400', in_progress: 'bg-blue-500', on_hold: 'bg-purple-400',
    completed: 'bg-green-500', cancelled: 'bg-gray-300', overdue: 'bg-red-500',
  };

  return (
    <div className="space-y-3">
      {/* Scope Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
          {[{ id: 'week', label: '2 Weeks' }, { id: 'month', label: '6 Weeks' }, { id: 'quarter', label: '3 Months' }].map(s => (
            <button key={s.id} onClick={() => setScope(s.id)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${scope === s.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-400">
          {Object.entries(BAR_COLORS).filter(([k]) => k !== 'overdue' && k !== 'cancelled').map(([k, cls]) => (
            <span key={k} className="flex items-center gap-1">
              <span className={`w-2.5 h-2.5 rounded-sm ${cls}`} />{k.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      </div>
      {/* Timeline Chart */}
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        {/* Header with date markers */}
        <div className="relative h-8 border-b bg-gray-50 text-[10px] text-gray-400">
          {dayMarkers.map((m, i) => (
            <div key={i} className={`absolute top-0 h-full flex items-center ${m.isToday ? 'text-red-600 font-bold z-10' : m.isFirst ? 'text-gray-600 font-medium' : ''}`}
              style={{ left: `${m.pct}%`, transform: 'translateX(-50%)' }}>
              {m.isToday ? 'Today' : m.isFirst
                ? m.date.toLocaleDateString('en-PK', { month: 'short', day: 'numeric' })
                : m.date.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' }).split(' ')[0]}
            </div>
          ))}
        </div>
        {/* Task Rows */}
        <div className="divide-y divide-gray-50">
          {sorted.map(t => {
            const created = t.created_at ? new Date(t.created_at) : today;
            const due = t.due_date ? new Date(t.due_date) : null;
            const overdue = isOverdue(t);
            const barStart = due ? dayToPercent(created) : dayToPercent(created);
            const barEnd = due ? dayToPercent(due) : dayToPercent(created) + 2;
            const barWidth = Math.max(1.5, barEnd - barStart);
            const barColor = overdue ? BAR_COLORS.overdue : BAR_COLORS[t.status] ?? BAR_COLORS.pending;

            return (
              <div key={t.id} className="flex items-center hover:bg-gray-50 cursor-pointer group" onClick={() => onCardClick(t.id)}>
                {/* Task Label */}
                <div className="w-56 flex-shrink-0 px-4 py-2.5 border-r border-gray-100">
                  <div className="text-xs font-medium text-gray-800 truncate group-hover:text-gray-900">{t.title ?? 'Untitled'}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`px-1 py-0 rounded text-[9px] font-medium border ${PRIORITY_STYLES[t.priority] ?? PRIORITY_STYLES.medium}`}>
                      {(t.priority ?? 'M')[0].toUpperCase()}</span>
                    <span className="text-[10px] text-gray-400 truncate">{t.assignee_name ?? t.assigned_to_name ?? ''}</span>
                  </div>
                </div>
                {/* Bar Area */}
                <div className="flex-1 relative h-10">
                  {/* Today line */}
                  <div className="absolute top-0 h-full w-px bg-red-300 z-10" style={{ left: `${dayToPercent(today)}%` }} />
                  {/* Bar */}
                  <div className={`absolute top-2 h-6 rounded-md ${barColor} opacity-85 hover:opacity-100 transition-opacity shadow-sm`}
                    style={{ left: `${barStart}%`, width: `${barWidth}%`, minWidth: '12px' }}
                    title={`${t.title}\n${fmtDate(t.created_at)} → ${due ? fmtDate(t.due_date) : 'No due date'}${overdue ? ' (OVERDUE)' : ''}`}>
                    {barWidth > 8 && (
                      <span className="absolute inset-0 flex items-center px-2 text-[9px] text-white font-medium truncate">
                        {due ? fmtDate(t.due_date) : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================
// DASHBOARD TAB — Executive Summary
// ============================================
function DashboardTab({ api, summary, tasks }) {
  const [execData, setExecData] = useState(null);
  const [execLoading, setExecLoading] = useState(true);
  const [expandedPerson, setExpandedPerson] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [reportResult, setReportResult] = useState(null);

  const openReport = async (url) => {
    try {
      const res = await api.get(url, { responseType: 'text' });
      const win = window.open('', '_blank');
      if (win) { win.document.write(res.data); win.document.close(); }
    } catch (e) {
      console.error('Failed to open report:', e);
    }
  };

  const generateReports = async () => {
    setGenerating(true);
    setReportResult(null);
    try {
      const res = await api.post('/tasks/daily-report');
      setReportResult(res.data);
    } catch (e) {
      setReportResult({ error: e.response?.data?.detail || 'Failed to generate reports' });
    } finally { setGenerating(false); }
  };

  useEffect(() => {
    (async () => {
      setExecLoading(true);
      try {
        const res = await api.get('/tasks/executive-summary');
        setExecData(res.data);
      } catch (e) { console.error('Failed to load executive summary:', e); }
      finally { setExecLoading(false); }
    })();
  }, [api]);

  const s = summary ?? {};
  const org = execData?.org_stats ?? {};

  return (
    <div className="space-y-6">
      {/* Report Generation */}
      <div className="flex items-center justify-between bg-white rounded-2xl shadow-sm border p-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Daily Task Reports</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">Generate personalized HTML reports for all users with assigned tasks</p>
        </div>
        <div className="flex items-center gap-3">
          {reportResult && !reportResult.error && (
            <span className="text-xs text-green-600 font-medium">{reportResult.message}</span>
          )}
          {reportResult?.error && (
            <span className="text-xs text-red-600 font-medium">{reportResult.error}</span>
          )}
          <button onClick={generateReports} disabled={generating}
            className="px-4 py-2 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 whitespace-nowrap">
            {generating ? 'Generating...' : 'Generate Reports'}
          </button>
        </div>
      </div>

      {reportResult?.reports?.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border p-4">
          <div className="text-xs font-medium text-gray-500 mb-2">Generated Reports ({reportResult.reports.length})</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {reportResult.reports.map(r => (
              <button key={r.rep_id} onClick={() => openReport(`/tasks/daily-report/${r.rep_id}`)}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors text-left w-full">
                <div>
                  <div className="text-xs font-medium text-gray-800">{r.name}</div>
                  <div className="text-[10px] text-gray-400">{r.rep_id} — {r.task_count} tasks</div>
                </div>
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Org-wide Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[{ l: 'Total', v: org.total ?? s.total ?? 0, c: 'text-gray-900' },
          { l: 'Active', v: org.active ?? s.in_progress ?? 0, c: 'text-blue-600' },
          { l: 'Completed', v: org.completed ?? s.completed ?? 0, c: 'text-green-600' },
          { l: 'Overdue', v: org.overdue ?? s.overdue ?? 0, c: 'text-red-600' },
          { l: 'Due Today', v: org.due_today ?? s.due_today ?? 0, c: 'text-orange-600' }].map(c => (
          <div key={c.l} className="bg-white rounded-2xl shadow-sm border p-4">
            <div className="text-[10px] font-medium text-gray-400 uppercase">{c.l}</div>
            <div className={`mt-1 text-2xl font-semibold ${c.c}`}>{c.v}</div>
          </div>
        ))}
      </div>

      {/* Department Breakdown */}
      {s.by_department && Object.keys(s.by_department).length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">By Department</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(s.by_department).sort((a,b) => b[1] - a[1]).map(([dept, count]) => (
              <div key={dept} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50">
                <span className="text-xs font-medium text-gray-700 capitalize">{dept}</span>
                <span className="text-sm font-semibold text-gray-900">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {execLoading ? <div className="p-8 text-center text-gray-400">Loading executive summary...</div> : execData && (<>
        {/* Your Tasks */}
        {execData.your_tasks && (
          <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
            <div className="px-5 py-4 border-b bg-gray-50/50">
              <h3 className="text-sm font-semibold text-gray-900">Your Tasks</h3>
              <p className="text-[10px] text-gray-400 mt-0.5">{execData.user?.name} ({execData.user?.title})</p>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Assigned to you */}
              <div>
                <div className="text-xs font-medium text-gray-500 mb-2">Assigned to you ({execData.your_tasks.assigned_to_you?.length ?? 0})</div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {(execData.your_tasks.assigned_to_you ?? []).map(t => (
                    <MiniTaskCard key={t.id} task={t} showCreator />
                  ))}
                  {(execData.your_tasks.assigned_to_you?.length ?? 0) === 0 && <div className="text-xs text-gray-400 py-2">None</div>}
                </div>
              </div>
              {/* Created by you (delegated) */}
              <div>
                <div className="text-xs font-medium text-gray-500 mb-2">You assigned to others ({execData.your_tasks.created_by_you?.length ?? 0})</div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {(execData.your_tasks.created_by_you ?? []).map(t => (
                    <MiniTaskCard key={t.id} task={t} showAssignee />
                  ))}
                  {(execData.your_tasks.created_by_you?.length ?? 0) === 0 && <div className="text-xs text-gray-400 py-2">None</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Direct Reports */}
        {(execData.direct_reports ?? []).length > 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Team Overview</h3>
            {execData.direct_reports.map(dr => {
              const p = dr.person;
              const st = dr.stats ?? {};
              const isExpanded = expandedPerson === p.rep_id;
              return (
                <div key={p.rep_id} className="bg-white rounded-2xl shadow-sm border overflow-hidden">
                  {/* Person Header — always visible */}
                  <button className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandedPerson(isExpanded ? null : p.rep_id)}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-600">
                        {(p.name ?? '?')[0]}
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-semibold text-gray-900">{p.name}</div>
                        <div className="text-[10px] text-gray-400">{p.title}
                          {dr.subordinates?.length > 0 && ` + ${dr.subordinates.length} report${dr.subordinates.length > 1 ? 's' : ''}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {/* Mini stat badges */}
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{st.total ?? 0} total</span>
                        {(st.in_progress ?? 0) > 0 && <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{st.in_progress} active</span>}
                        {(st.overdue ?? 0) > 0 && <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">{st.overdue} overdue</span>}
                        {(st.completed ?? 0) > 0 && <span className="bg-green-50 text-green-600 px-2 py-0.5 rounded-full">{st.completed} done</span>}
                      </div>
                      <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </button>
                  {/* Expanded Detail */}
                  {isExpanded && (
                    <div className="border-t">
                      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* Tasks assigned TO this person */}
                        <div>
                          <div className="text-xs font-medium text-gray-500 mb-2">
                            Assigned to {p.name.split(' ')[0]} ({dr.assigned_to_them?.length ?? 0})
                          </div>
                          <div className="space-y-1.5 max-h-56 overflow-y-auto">
                            {(dr.assigned_to_them ?? []).map(t => <MiniTaskCard key={t.id} task={t} showCreator />)}
                            {(dr.assigned_to_them?.length ?? 0) === 0 && <div className="text-xs text-gray-400 py-2">No tasks assigned</div>}
                          </div>
                        </div>
                        {/* Tasks assigned BY this person */}
                        <div>
                          <div className="text-xs font-medium text-gray-500 mb-2">
                            {p.name.split(' ')[0]} assigned to others ({dr.assigned_by_them?.length ?? 0})
                          </div>
                          <div className="space-y-1.5 max-h-56 overflow-y-auto">
                            {(dr.assigned_by_them ?? []).map(t => <MiniTaskCard key={t.id} task={t} showAssignee />)}
                            {(dr.assigned_by_them?.length ?? 0) === 0 && <div className="text-xs text-gray-400 py-2">No delegated tasks</div>}
                          </div>
                        </div>
                      </div>
                      {/* Recent Updates */}
                      {(dr.recent_updates ?? []).length > 0 && (
                        <div className="px-5 pb-5">
                          <div className="text-xs font-medium text-gray-500 mb-2">Recent Updates (48h)</div>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {dr.recent_updates.map((u, i) => (
                              <div key={i} className="flex items-start gap-2 text-[11px] py-1">
                                <span className="text-gray-400 whitespace-nowrap flex-shrink-0">{fmtDateTime(u.created_at)}</span>
                                <span className="text-gray-600">
                                  <span className="font-medium text-gray-700">{u.actor_name}</span>
                                  {' '}{u.action?.replace(/_/g, ' ')}
                                  {u.new_value && <> &rarr; <span className="font-medium">{u.new_value.replace(/_/g, ' ')}</span></>}
                                  {' on '}<span className="text-gray-500">{u.task_title}</span>
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </>)}
    </div>
  );
}

// Mini task card for executive summary
function MiniTaskCard({ task: t, showAssignee, showCreator }) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-50 transition-colors">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
        t.status === 'completed' ? 'bg-green-500' : t.overdue ? 'bg-red-500' :
        t.status === 'in_progress' ? 'bg-blue-500' : 'bg-yellow-400'}`} />
      <span className="text-xs text-gray-800 truncate flex-1">{t.title}</span>
      <span className={`px-1 py-0 rounded text-[9px] font-medium border ${PRIORITY_STYLES[t.priority] ?? PRIORITY_STYLES.medium}`}>
        {(t.priority ?? 'M')[0].toUpperCase()}</span>
      {showAssignee && <span className="text-[10px] text-gray-400 truncate max-w-[80px]">{t.assignee_name}</span>}
      {showCreator && <span className="text-[10px] text-gray-400 truncate max-w-[80px]">by {t.creator_name}</span>}
      {t.due_date && <span className={`text-[10px] flex-shrink-0 ${t.overdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>{fmtDate(t.due_date)}</span>}
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
    collaborators: [],
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
      if (form.collaborators.length > 0) fd.append('collaborator_ids', JSON.stringify(form.collaborators));
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
          {/* Collaborators */}
          <div>
            <label className={labelCls}>Collaborators</label>
            {form.collaborators.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {form.collaborators.map(cId => {
                  const rep = (reps ?? []).find(r => r.id === cId);
                  return (
                    <span key={cId} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full">
                      {rep?.name ?? cId}
                      <button type="button" onClick={() => setForm(f => ({ ...f, collaborators: f.collaborators.filter(id => id !== cId) }))}
                        className="text-gray-400 hover:text-gray-600 ml-0.5">&times;</button>
                    </span>
                  );
                })}
              </div>
            )}
            <select value="" onChange={e => { if (e.target.value) setForm(f => ({ ...f, collaborators: [...f.collaborators, e.target.value] })); }} className={inputCls}>
              <option value="">Add collaborator...</option>
              {(reps ?? []).filter(r => r.id !== form.assigned_to && !form.collaborators.includes(r.id)).map(r => (
                <option key={r.id} value={r.id}>{r.name ?? r.rep_id}</option>
              ))}
            </select>
          </div>
          <div><label className={labelCls}>Due Date</label>
            <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelCls}>CRM Link Type</label>
              <select value={form.crm_entity_type} onChange={e => setForm(f => ({ ...f, crm_entity_type: e.target.value }))} className={inputCls}>
                <option value="">None</option><option value="customer">Customer</option><option value="transaction">Transaction</option>
                <option value="inventory">Inventory</option><option value="project">Project</option><option value="lead">Lead</option>
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
// TASK DETAIL MODAL — Asana-style inline editing
// ============================================
function TaskDetailModal({ api, reps, user, addToast, taskId, data, loading, onClose, onUpdated, onDeleted }) {
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [newSubtask, setNewSubtask] = useState('');
  const [newSubtaskAssignee, setNewSubtaskAssignee] = useState('');
  const [activeTab, setActiveTab] = useState('comments');
  const [attachments, setAttachments] = useState([]);
  const [attachLoading, setAttachLoading] = useState(false);
  const titleRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') { setEditingTitle(false); setEditingDesc(false); onClose(); } };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  useEffect(() => { if (editingTitle && titleRef.current) titleRef.current.focus(); }, [editingTitle]);

  // Polling: refresh task data every 30 seconds while modal is open
  useEffect(() => {
    if (!taskId) return;
    const interval = setInterval(() => { onUpdated(); }, 30000);
    return () => clearInterval(interval);
  }, [taskId, onUpdated]);

  const task = data?.task ?? data ?? {};
  const comments = data?.comments ?? [];
  const activities = data?.activities ?? [];
  const subtasks = data?.subtasks ?? [];

  // Generic field update via PUT
  const updateField = async (field, value) => {
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append(field, value);
      await api.put(`/tasks/${taskId}`, fd);
      onUpdated();
    } catch (e) { if (addToast) addToast('Error', e.response?.data?.detail || `Failed to update ${field}`, 'error'); }
    finally { setSubmitting(false); }
  };

  const saveTitle = async () => {
    const v = titleDraft.trim();
    if (v && v !== task.title) await updateField('title', v);
    setEditingTitle(false);
  };
  const saveDescription = async () => {
    if (descDraft !== (task.description ?? '')) await updateField('description', descDraft);
    setEditingDesc(false);
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

  const addSubtask = async () => {
    if (!newSubtask.trim()) return; setSubmitting(true);
    try {
      const fd = new FormData(); fd.append('title', newSubtask.trim());
      if (newSubtaskAssignee) fd.append('assignee_id', newSubtaskAssignee);
      await api.post(`/tasks/${taskId}/subtasks`, fd);
      setNewSubtask(''); setNewSubtaskAssignee(''); onUpdated();
    } catch (e) { if (addToast) addToast('Error', e.response?.data?.detail || 'Failed to create subtask', 'error'); }
    finally { setSubmitting(false); }
  };

  const toggleSubtask = async (st) => {
    const newStatus = st.status === 'completed' ? 'pending' : 'completed';
    setSubmitting(true);
    try {
      const fd = new FormData(); fd.append('status', newStatus);
      await api.put(`/tasks/${st.id}`, fd);
      onUpdated();
    } catch (e) { if (addToast) addToast('Error', 'Failed to update subtask', 'error'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this task permanently?')) return;
    setSubmitting(true);
    try {
      await api.delete(`/tasks/${taskId}`);
      if (addToast) addToast('Success', 'Task deleted', 'success');
      onClose(); if (onDeleted) onDeleted();
    } catch (e) { if (addToast) addToast('Error', e.response?.data?.detail || 'Failed to delete', 'error'); }
    finally { setSubmitting(false); }
  };

  const fetchAttachments = useCallback(async () => {
    setAttachLoading(true);
    try {
      const res = await api.get(`/media/task/${taskId}`);
      setAttachments(res.data ?? []);
    } catch { setAttachments([]); }
    finally { setAttachLoading(false); }
  }, [api, taskId]);

  useEffect(() => { if (taskId && !loading) fetchAttachments(); }, [taskId, loading, fetchAttachments]);

  const uploadAttachment = async (file) => {
    if (!file) return;
    setAttachLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('entity_type', 'task');
      fd.append('entity_id', taskId);
      await api.post('/media/upload', fd);
      if (addToast) addToast('Success', 'File uploaded', 'success');
      fetchAttachments();
    } catch (e) { if (addToast) addToast('Error', e.response?.data?.detail || 'Upload failed', 'error'); }
    finally { setAttachLoading(false); }
  };

  const deleteAttachment = async (mediaId) => {
    if (!confirm('Delete this attachment?')) return;
    try {
      await api.delete(`/media/${mediaId}`);
      if (addToast) addToast('Success', 'Attachment deleted', 'success');
      fetchAttachments();
    } catch (e) { if (addToast) addToast('Error', e.response?.data?.detail || 'Delete failed', 'error'); }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (filename) => {
    const ext = (filename ?? '').split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return '🖼';
    if (['pdf'].includes(ext)) return '📄';
    if (['doc', 'docx'].includes(ext)) return '📝';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
    if (['zip', 'rar', '7z'].includes(ext)) return '📦';
    return '📎';
  };

  const canDelete = user?.role === 'admin' || user?.role === 'cco' || task.created_by === user?.id;
  const canDeleteAttachment = user?.role === 'admin' || user?.role === 'cco';
  const completedSubtasks = subtasks.filter(s => s.status === 'completed').length;

  // Dropdown styles
  const propSelect = "w-full px-2 py-1.5 text-sm border-0 bg-transparent rounded-md hover:bg-gray-100 focus:bg-white focus:ring-2 focus:ring-gray-900/10 cursor-pointer appearance-none";

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl mx-4 w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-start justify-between flex-shrink-0">
          <div className="flex-1 min-w-0 mr-4">
            {!loading && !editingTitle ? (
              <h3 className="text-lg font-semibold text-gray-900 cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1 py-0.5"
                onClick={() => { setTitleDraft(task.title ?? ''); setEditingTitle(true); }}>
                {task.title ?? 'Untitled Task'}
              </h3>
            ) : editingTitle ? (
              <input ref={titleRef} value={titleDraft} onChange={e => setTitleDraft(e.target.value)}
                onBlur={saveTitle} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveTitle(); } }}
                className="text-lg font-semibold text-gray-900 w-full border-b-2 border-gray-900 outline-none bg-transparent px-1 -mx-1 py-0.5" />
            ) : <h3 className="text-lg font-semibold text-gray-400">Loading...</h3>}
            {!loading && <span className="text-xs text-gray-400 ml-1">{task.task_id ?? ''}</span>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {canDelete && !loading && (
              <button onClick={handleDelete} disabled={submitting} title="Delete task"
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            )}
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {loading ? <div className="p-12 text-center text-gray-400">Loading task details...</div> : (
          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col md:flex-row">
              {/* LEFT — Main Content */}
              <div className="flex-1 p-6 space-y-5 md:border-r border-gray-100 min-w-0">
                {/* Description */}
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase mb-1.5">Description</div>
                  {!editingDesc ? (
                    <div className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap cursor-pointer hover:bg-gray-100 min-h-[60px] transition-colors"
                      onClick={() => { setDescDraft(task.description ?? ''); setEditingDesc(true); }}>
                      {task.description || <span className="text-gray-400 italic">Click to add a description...</span>}
                    </div>
                  ) : (
                    <div>
                      <textarea value={descDraft} onChange={e => setDescDraft(e.target.value)} rows={4} autoFocus
                        className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 resize-none" />
                      <div className="flex gap-2 mt-1.5">
                        <button onClick={saveDescription} className="px-3 py-1 text-xs bg-gray-900 text-white rounded-md hover:bg-gray-800">Save</button>
                        <button onClick={() => setEditingDesc(false)} className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* CRM Link */}
                {task.crm_entity_type && task.crm_entity_id && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-400 text-xs">Linked:</span>
                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-medium">{task.crm_entity_type} {task.crm_entity_id}</span>
                  </div>
                )}

                {/* Subtasks */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-medium text-gray-400 uppercase">
                      Subtasks {subtasks.length > 0 && <span className="text-gray-300 ml-1">{completedSubtasks}/{subtasks.length}</span>}
                    </div>
                  </div>
                  {subtasks.length > 0 && (
                    <div className="mb-2">
                      <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${subtasks.length > 0 ? (completedSubtasks / subtasks.length * 100) : 0}%` }} />
                      </div>
                    </div>
                  )}
                  <div className="space-y-0.5 mb-2">
                    {subtasks.map((st, i) => (
                      <div key={st.id ?? i} className="flex items-center gap-2.5 py-1.5 px-2 rounded-md hover:bg-gray-50 group transition-colors">
                        <button onClick={() => toggleSubtask(st)} disabled={submitting}
                          className={`w-[18px] h-[18px] rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${st.status === 'completed' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-gray-400'}`}>
                          {st.status === 'completed' && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                        </button>
                        <span className={`text-sm flex-1 ${st.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-700'}`}>{st.title ?? 'Subtask'}</span>
                        <span className="text-[10px] text-gray-400 group-hover:hidden">{st.assignee_name ?? 'Unassigned'}</span>
                        <select className="hidden group-hover:inline-block w-28 text-[10px] text-gray-500 bg-white border border-gray-200 rounded px-1 py-0.5 cursor-pointer focus:outline-none"
                          value={st.assignee_id ?? ''} onChange={e => {
                            const fd = new FormData(); fd.append('assignee_id', e.target.value);
                            api.put(`/tasks/${st.id}`, fd).then(() => onUpdated()).catch(() => { if (addToast) addToast('Error', 'Failed to reassign subtask', 'error'); });
                          }}>
                          <option value="">Unassigned</option>
                          {(reps ?? []).map(r => <option key={r.id} value={r.id}>{r.name ?? r.rep_id}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input type="text" placeholder="Add a subtask..." value={newSubtask} onChange={e => setNewSubtask(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubtask(); } }}
                      className="flex-1 px-3 py-1.5 text-sm border border-dashed border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-solid" />
                    <select value={newSubtaskAssignee} onChange={e => setNewSubtaskAssignee(e.target.value)}
                      className="w-32 px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 bg-white text-gray-600">
                      <option value="">Assignee</option>
                      {(reps ?? []).map(r => <option key={r.id} value={r.id}>{r.name ?? r.rep_id}</option>)}
                    </select>
                    {newSubtask.trim() && (
                      <button onClick={addSubtask} disabled={submitting}
                        className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50">Add</button>
                    )}
                  </div>
                </div>

                {/* Tabbed: Comments / Activity / Attachments */}
                <div>
                  <div className="flex gap-1 border-b mb-3">
                    {[{ id: 'comments', label: `Comments (${comments.length})` }, { id: 'activity', label: 'Activity' }, { id: 'attachments', label: `Attachments (${attachments.length})` }].map(tab => (
                      <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${activeTab === tab.id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  {activeTab === 'comments' && (
                    <div>
                      <div className="flex gap-2 mb-3">
                        <input type="text" placeholder="Write a comment..." value={commentText} onChange={e => setCommentText(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment(); } }}
                          className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
                        <button onClick={addComment} disabled={!commentText.trim() || submitting}
                          className="px-3 py-2 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50">Post</button>
                      </div>
                      {comments.length > 0 ? (
                        <div className="space-y-2 max-h-56 overflow-y-auto">
                          {comments.map((c, i) => (
                            <div key={c.id ?? i} className="bg-gray-50 rounded-lg p-3">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-medium text-gray-700">{c.author_name ?? c.rep_name ?? 'User'}</span>
                                <span className="text-[10px] text-gray-400">{fmtDateTime(c.created_at)}</span>
                              </div>
                              <div className="text-sm text-gray-600">{c.content ?? c.text ?? ''}</div>
                            </div>
                          ))}
                        </div>
                      ) : <div className="text-xs text-gray-400 text-center py-4">No comments yet</div>}
                    </div>
                  )}
                  {activeTab === 'activity' && (
                    <div className="max-h-56 overflow-y-auto">
                      {activities.length > 0 ? activities.map((a, i) => (
                        <div key={a.id ?? i} className="flex gap-3 py-2 text-xs border-b border-gray-50 last:border-0">
                          <span className="text-gray-400 whitespace-nowrap flex-shrink-0">{fmtDateTime(a.created_at ?? a.timestamp)}</span>
                          <span className="text-gray-600">{a.description ?? a.action ?? 'Activity'}</span>
                        </div>
                      )) : <div className="text-xs text-gray-400 text-center py-4">No activity yet</div>}
                    </div>
                  )}
                  {activeTab === 'attachments' && (
                    <div>
                      <input type="file" ref={fileInputRef} className="hidden" onChange={e => { if (e.target.files?.[0]) { uploadAttachment(e.target.files[0]); e.target.value = ''; } }} />
                      <button onClick={() => fileInputRef.current?.click()} disabled={attachLoading}
                        className="mb-3 px-3 py-2 text-xs font-medium border border-dashed border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 text-gray-500 w-full transition-colors disabled:opacity-50">
                        {attachLoading ? 'Uploading...' : '+ Upload File'}
                      </button>
                      {attachments.length > 0 ? (
                        <div className="space-y-1.5 max-h-56 overflow-y-auto">
                          {attachments.map(att => (
                            <div key={att.id} className="flex items-center gap-2 py-2 px-2.5 rounded-lg hover:bg-gray-50 group transition-colors">
                              <span className="text-sm flex-shrink-0">{getFileIcon(att.filename ?? att.file_name)}</span>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-gray-700 truncate">{att.filename ?? att.file_name ?? 'File'}</div>
                                <div className="text-[10px] text-gray-400">{formatFileSize(att.file_size ?? att.size)} {att.uploaded_by_name ? `by ${att.uploaded_by_name}` : ''}</div>
                              </div>
                              <a href={att.url ?? att.file_url ?? `/api/media/${att.id}/download`} target="_blank" rel="noopener noreferrer"
                                className="p-1 text-gray-400 hover:text-blue-600 transition-colors" title="Download"
                                onClick={e => e.stopPropagation()}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                              </a>
                              {canDeleteAttachment && (
                                <button onClick={() => deleteAttachment(att.id)}
                                  className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all" title="Delete">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : <div className="text-xs text-gray-400 text-center py-4">{attachLoading ? 'Loading...' : 'No attachments yet'}</div>}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT — Properties Sidebar */}
              <div className="md:w-64 flex-shrink-0 p-5 space-y-4 bg-gray-50/50">
                {/* Status */}
                <div>
                  <div className="text-[10px] font-medium text-gray-400 uppercase mb-1">Status</div>
                  <select value={task.status ?? 'pending'} onChange={e => updateField('status', e.target.value)} disabled={submitting}
                    className={`${propSelect} font-medium ${STATUS_STYLES[task.status] ?? ''}`}>
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="on_hold">On Hold</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                {/* Assignee */}
                <div>
                  <div className="text-[10px] font-medium text-gray-400 uppercase mb-1">Assignee</div>
                  <select value={task.assignee_id ?? ''} onChange={e => updateField('assignee_id', e.target.value)} disabled={submitting}
                    className={propSelect}>
                    <option value="">Unassigned</option>
                    {(reps ?? []).map(r => <option key={r.id} value={r.id}>{r.name ?? r.rep_id}</option>)}
                  </select>
                </div>
                {/* Collaborators */}
                <div>
                  <div className="text-[10px] font-medium text-gray-400 uppercase mb-1">Collaborators</div>
                  <div className="space-y-1 mb-1.5">
                    {(task.collaborators ?? []).map(c => (
                      <div key={c.id ?? c.rep_id} className="flex items-center justify-between group px-2 py-1 rounded-md hover:bg-gray-100">
                        <span className="text-sm text-gray-600 truncate">{c.name ?? c.rep_id ?? 'Unknown'}</span>
                        <button onClick={() => {
                          const updatedIds = (task.collaborators ?? []).filter(x => (x.id ?? x.rep_id) !== (c.id ?? c.rep_id)).map(x => x.id ?? x.rep_id);
                          const fd = new FormData(); fd.append('collaborator_ids', JSON.stringify(updatedIds));
                          api.put(`/tasks/${taskId}`, fd).then(() => onUpdated()).catch(() => { if (addToast) addToast('Error', 'Failed to remove collaborator', 'error'); });
                        }} disabled={submitting}
                          className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs ml-1">&times;</button>
                      </div>
                    ))}
                    {(task.collaborators ?? []).length === 0 && <div className="text-xs text-gray-400 px-2 py-1">None</div>}
                  </div>
                  <select value="" onChange={e => {
                    if (!e.target.value) return;
                    const currentIds = (task.collaborators ?? []).map(c => c.id ?? c.rep_id);
                    const updatedIds = [...currentIds, e.target.value];
                    const fd = new FormData(); fd.append('collaborator_ids', JSON.stringify(updatedIds));
                    api.put(`/tasks/${taskId}`, fd).then(() => onUpdated()).catch(() => { if (addToast) addToast('Error', 'Failed to add collaborator', 'error'); });
                  }} disabled={submitting} className={`${propSelect} text-xs`}>
                    <option value="">Add...</option>
                    {(reps ?? []).filter(r => r.id !== (task.assignee_id ?? '') && !(task.collaborators ?? []).some(c => (c.id ?? c.rep_id) === r.id)).map(r => (
                      <option key={r.id} value={r.id}>{r.name ?? r.rep_id}</option>
                    ))}
                  </select>
                </div>
                {/* Due Date */}
                <div>
                  <div className="text-[10px] font-medium text-gray-400 uppercase mb-1">Due Date</div>
                  <input type="date" value={task.due_date ? task.due_date.substring(0, 10) : ''}
                    onChange={e => updateField('due_date', e.target.value)} disabled={submitting}
                    className={`${propSelect} ${isOverdue(task) ? 'text-red-600 font-medium' : ''}`} />
                </div>
                {/* Priority */}
                <div>
                  <div className="text-[10px] font-medium text-gray-400 uppercase mb-1">Priority</div>
                  <select value={task.priority ?? 'medium'} onChange={e => updateField('priority', e.target.value)} disabled={submitting}
                    className={propSelect}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                {/* Department */}
                <div>
                  <div className="text-[10px] font-medium text-gray-400 uppercase mb-1">Department</div>
                  <select value={task.department ?? ''} onChange={e => updateField('department', e.target.value)} disabled={submitting}
                    className={propSelect}>
                    <option value="">None</option>
                    {DEPARTMENTS.map(d => <option key={d} value={d.toLowerCase()}>{d}</option>)}
                  </select>
                </div>
                {/* Type (read-only) */}
                <div>
                  <div className="text-[10px] font-medium text-gray-400 uppercase mb-1">Type</div>
                  <div className="px-2 py-1.5 text-sm text-gray-600 capitalize">{(task.type ?? task.task_type ?? 'general').replace(/_/g, ' ')}</div>
                </div>
                {/* Created By (read-only) */}
                <div>
                  <div className="text-[10px] font-medium text-gray-400 uppercase mb-1">Created By</div>
                  <div className="px-2 py-1.5 text-sm text-gray-600">{task.creator_name ?? task.created_by_name ?? 'N/A'}</div>
                </div>
                {/* Created (read-only) */}
                <div>
                  <div className="text-[10px] font-medium text-gray-400 uppercase mb-1">Created</div>
                  <div className="px-2 py-1.5 text-sm text-gray-500">{fmtDate(task.created_at)}</div>
                </div>
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
