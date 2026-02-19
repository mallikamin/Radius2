import React, { useState } from 'react';

export default function AddSubtaskForm({ taskId, api, reps = [], addToast, onCreated }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    assignee_id: '',
    due_date: '',
    priority: 'medium',
  });

  const reset = () => {
    setForm({ title: '', description: '', assignee_id: '', due_date: '', priority: 'medium' });
    setOpen(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('title', form.title.trim());
      if (form.description.trim()) fd.append('description', form.description.trim());
      if (form.assignee_id) fd.append('assignee_id', form.assignee_id);
      if (form.due_date) fd.append('due_date', form.due_date);
      if (form.priority) fd.append('priority', form.priority);
      await api.post(`/tasks/${taskId}/subtasks`, fd);
      if (onCreated) onCreated();
      reset();
    } catch (e2) {
      if (addToast) addToast('Error', e2.response?.data?.detail || 'Failed to create subtask', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add subtask
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
      <input
        value={form.title}
        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        placeholder="Subtask title *"
        className="w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10"
        required
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <select
          value={form.assignee_id}
          onChange={(e) => setForm((f) => ({ ...f, assignee_id: e.target.value }))}
          className="px-3 py-2 text-sm border rounded-lg bg-white"
        >
          <option value="">Assign to...</option>
          {reps.map((r) => <option key={r.id} value={r.id}>{r.name ?? r.rep_id}</option>)}
        </select>
        <input
          type="date"
          value={form.due_date}
          onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
          className="px-3 py-2 text-sm border rounded-lg bg-white"
        />
        <select
          value={form.priority}
          onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
          className="px-3 py-2 text-sm border rounded-lg bg-white"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </div>
      <textarea
        value={form.description}
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        placeholder="Description (optional)"
        rows={2}
        className="w-full px-3 py-2 text-sm border rounded-lg bg-white resize-none focus:outline-none focus:ring-2 focus:ring-gray-900/10"
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={reset} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
        <button type="submit" disabled={submitting} className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg disabled:opacity-50">
          {submitting ? 'Creating...' : 'Create Subtask'}
        </button>
      </div>
    </form>
  );
}
