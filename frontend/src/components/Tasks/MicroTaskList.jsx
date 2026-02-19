import React, { useEffect, useMemo, useState } from 'react';

const priorityChip = "text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600";

export default function MicroTaskList({ subtask, api, addToast, reps = [], disabled = false, onChanged, onItemsChange, highlightMicroTaskId = null }) {
  const [items, setItems] = useState(subtask?.micro_tasks ?? []);
  const [newTitle, setNewTitle] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [pendingId, setPendingId] = useState(null);

  useEffect(() => { setItems(subtask?.micro_tasks ?? []); }, [subtask?.micro_tasks]);

  useEffect(() => {
    if (onItemsChange) onItemsChange(items);
  }, [items, onItemsChange]);

  const progress = useMemo(() => {
    const total = items.length;
    const completed = items.filter((m) => m.is_completed).length;
    return { total, completed };
  }, [items]);
  const getModifiedMeta = (mt) => {
    const at = mt?.last_modified_at ?? mt?.updated_at ?? mt?.created_at;
    const by = mt?.last_modified_by_name ?? mt?.completed_by_name ?? mt?.creator_name ?? mt?.assignee_name ?? 'Unknown';
    return { at, by };
  };

  const addMicroTask = async () => {
    const title = newTitle.trim();
    if (!title || disabled) return;
    setPendingId('create');
    try {
      const fd = new FormData();
      fd.append('title', title);
      if (newAssignee) fd.append('assignee_id', newAssignee);
      if (newDueDate) fd.append('due_date', newDueDate);
      const res = await api.post(`/tasks/${subtask.id}/micro-tasks`, fd);
      if (res?.data?.id) {
        setItems((prev) => [...prev, res.data]);
      }
      setNewTitle('');
      setNewAssignee('');
      setNewDueDate('');
    } catch (e) {
      if (addToast) addToast('Error', e.response?.data?.detail || 'Failed to add micro-task', 'error');
    } finally {
      setPendingId(null);
    }
  };

  const toggleComplete = async (mt) => {
    if (disabled) return;
    const scrollY = window.scrollY;
    const next = !mt.is_completed;
    setItems((prev) => prev.map((m) => (m.id === mt.id ? { ...m, is_completed: next } : m)));
    requestAnimationFrame(() => { window.scrollTo(0, scrollY); });
    setPendingId(mt.id);
    try {
      const fd = new FormData();
      fd.append('is_completed', next ? 'true' : 'false');
      const res = await api.put(`/micro-tasks/${mt.id}`, fd);
      if (res?.data?.id) {
        setItems((prev) => prev.map((m) => (m.id === mt.id ? { ...m, ...res.data } : m)));
        requestAnimationFrame(() => { window.scrollTo(0, scrollY); });
      }
    } catch (e) {
      setItems((prev) => prev.map((m) => (m.id === mt.id ? { ...m, is_completed: mt.is_completed } : m)));
      requestAnimationFrame(() => { window.scrollTo(0, scrollY); });
      if (addToast) addToast('Error', e.response?.data?.detail || 'Failed to update micro-task', 'error');
    } finally {
      setPendingId(null);
    }
  };

  const removeMicroTask = async (mtId) => {
    if (disabled || !window.confirm('Delete this micro-task?')) return;
    setPendingId(mtId);
    try {
      await api.delete(`/micro-tasks/${mtId}`);
      setItems((prev) => prev.filter((m) => m.id !== mtId));
    } catch (e) {
      if (addToast) addToast('Error', e.response?.data?.detail || 'Failed to delete micro-task', 'error');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Micro-tasks</div>
        <div className="text-xs text-gray-400">{progress.completed}/{progress.total}</div>
      </div>

      <div className="divide-y divide-gray-100">
        {items.length === 0 && <div className="px-3 py-2 text-xs text-gray-400">No micro-tasks yet</div>}
        {items.map((mt) => {
          const meta = getModifiedMeta(mt);
          return (
          <div
            key={mt.id}
            data-micro-task-id={mt.id}
            className={`px-3 py-2 flex items-center gap-2 ${String(mt.id) === String(highlightMicroTaskId || '') ? 'bg-blue-50' : ''}`}
          >
            <button
              type="button"
              onClick={() => toggleComplete(mt)}
              disabled={disabled || pendingId === mt.id}
              className={`w-4 h-4 rounded border flex items-center justify-center ${
                mt.is_completed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'
              }`}
            >
              {mt.is_completed && (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
            <div className="flex-1 min-w-0">
              <div className={`text-sm ${mt.is_completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>{mt.title}</div>
              <div className="text-[10px] text-gray-400">
                {`Last modified: ${meta.at ? new Date(meta.at).toLocaleString() : '-'} by ${meta.by}`}
              </div>
            </div>
            {mt.assignee_name && <span className={priorityChip}>{mt.assignee_name}</span>}
            {mt.due_date && <span className="text-[10px] text-gray-400">{mt.due_date}</span>}
            <button
              type="button"
              onClick={() => removeMicroTask(mt.id)}
              className="text-gray-300 hover:text-red-500 text-xs"
              disabled={disabled || pendingId === mt.id}
              title="Delete micro-task"
            >
              Delete
            </button>
          </div>
        );})}
      </div>

      <div className="p-3 border-t border-gray-100 space-y-2">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMicroTask(); } }}
          placeholder="Add micro-task..."
          className="w-full px-2.5 py-1.5 text-sm border border-dashed border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10"
          disabled={disabled || pendingId === 'create'}
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={newAssignee}
            onChange={(e) => setNewAssignee(e.target.value)}
            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white text-gray-600"
            disabled={disabled || pendingId === 'create'}
          >
            <option value="">Assignee</option>
            {reps.map((r) => <option key={r.id} value={r.id}>{r.name ?? r.rep_id}</option>)}
          </select>
          <input
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-600"
            disabled={disabled || pendingId === 'create'}
          />
        </div>
      </div>
    </div>
  );
}
