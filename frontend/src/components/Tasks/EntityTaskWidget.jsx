import React, { useEffect, useMemo, useState } from 'react';

const PRIORITY_STYLES = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-blue-100 text-blue-700',
  low: 'bg-gray-100 text-gray-600',
};

const entityPathMap = {
  customer: 'customers',
  project: 'projects',
  inventory: 'inventory',
  transaction: 'transactions',
};

export default function EntityTaskWidget({ api, entityType, entityId, setActiveTab, addToast, compact = false }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [reps, setReps] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: '',
    assignee_id: '',
    due_date: '',
    priority: 'medium',
  });

  const endpoint = useMemo(() => {
    const base = entityPathMap[entityType];
    if (!base || !entityId) return null;
    return `/${base}/${entityId}/tasks`;
  }, [entityType, entityId]);

  const loadTasks = async () => {
    if (!endpoint) return;
    setLoading(true);
    try {
      const res = await api.get(endpoint);
      setTasks(res.data?.tasks ?? []);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  const loadReps = async () => {
    try {
      const res = await api.get('/company-reps');
      setReps(res.data ?? []);
    } catch {
      setReps([]);
    }
  };

  useEffect(() => { loadTasks(); }, [endpoint]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (showQuickAdd && reps.length === 0) loadReps(); }, [showQuickAdd]); // eslint-disable-line react-hooks/exhaustive-deps

  const createTask = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setCreating(true);
    try {
      const fd = new FormData();
      fd.append('title', form.title.trim());
      fd.append('type', 'general');
      fd.append('priority', form.priority);
      fd.append('crm_entity_type', entityType);
      fd.append('crm_entity_id', entityId);
      if (form.assignee_id) fd.append('assigned_to', form.assignee_id);
      if (form.due_date) fd.append('due_date', form.due_date);
      await api.post('/tasks', fd);
      setForm({ title: '', assignee_id: '', due_date: '', priority: 'medium' });
      setShowQuickAdd(false);
      loadTasks();
    } catch (e2) {
      if (addToast) addToast('Error', e2.response?.data?.detail || 'Failed to create linked task', 'error');
    } finally {
      setCreating(false);
    }
  };

  const goToTasksTab = () => {
    if (typeof setActiveTab === 'function') {
      setActiveTab('tasks');
      return;
    }
    if (typeof window !== 'undefined' && typeof window.setActiveTab === 'function') {
      window.setActiveTab('tasks');
    }
  };

  return (
    <div className={`border border-gray-200 rounded-lg overflow-hidden ${compact ? '' : 'bg-white'}`}>
      <div className="px-3 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900">Linked Tasks ({tasks.length})</div>
        <button
          type="button"
          onClick={() => setShowQuickAdd((v) => !v)}
          className="text-xs border border-gray-200 bg-white px-2.5 py-1.5 rounded-lg text-gray-600 hover:text-gray-900"
        >
          {showQuickAdd ? 'Close' : 'Add Task'}
        </button>
      </div>

      {showQuickAdd && (
        <form onSubmit={createTask} className="p-3 border-b border-gray-100 bg-gray-50 space-y-2">
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Task title..."
            className="w-full px-3 py-2 text-sm border rounded-lg bg-white"
            required
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <select
              value={form.assignee_id}
              onChange={(e) => setForm((f) => ({ ...f, assignee_id: e.target.value }))}
              className="px-2 py-1.5 text-xs border rounded-lg bg-white"
            >
              <option value="">Assign to...</option>
              {reps.map((r) => <option key={r.id} value={r.id}>{r.name ?? r.rep_id}</option>)}
            </select>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              className="px-2 py-1.5 text-xs border rounded-lg bg-white"
            />
            <select
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              className="px-2 py-1.5 text-xs border rounded-lg bg-white"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowQuickAdd(false)} className="px-3 py-1.5 text-xs text-gray-500">Cancel</button>
            <button type="submit" disabled={creating} className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded-lg disabled:opacity-50">
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      )}

      <div className="divide-y divide-gray-100">
        {loading && <div className="p-3 text-xs text-gray-400">Loading tasks...</div>}
        {!loading && tasks.length === 0 && <div className="p-3 text-xs text-gray-400">No linked tasks yet</div>}
        {tasks.map((t) => (
          <div key={t.id} className="px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] text-gray-400 font-mono">{t.task_id}</div>
                <div className="text-sm text-gray-800 truncate">{t.title}</div>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_STYLES[t.priority] ?? PRIORITY_STYLES.medium}`}>
                {(t.priority ?? 'medium').toUpperCase()}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-[11px] text-gray-500">
              <span>{t.assignee_name ?? 'Unassigned'}</span>
              <span>{t.due_date ? `Due ${t.due_date}` : 'No due date'}</span>
              <span>{t.subtask_completed ?? 0}/{t.subtask_count ?? 0} subtasks</span>
              {(t.micro_task_count ?? 0) > 0 && <span>{t.micro_task_completed ?? 0}/{t.micro_task_count} micro</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="px-3 py-2 bg-gray-50 border-t border-gray-200">
        <button type="button" onClick={goToTasksTab} className="text-xs text-blue-600 hover:text-blue-800">
          View all in Tasks tab
        </button>
      </div>
    </div>
  );
}
