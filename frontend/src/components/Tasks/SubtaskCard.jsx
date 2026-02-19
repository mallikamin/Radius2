import React, { useCallback, useEffect, useMemo, useState } from 'react';
import MicroTaskList from './MicroTaskList';

const PRIORITY_BADGE = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-blue-100 text-blue-700',
  low: 'bg-gray-100 text-gray-600',
};

export default function SubtaskCard({ subtask, api, reps = [], addToast, onChanged, forceExpanded = false, highlightMicroTaskId = null }) {
  const [expanded, setExpanded] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [localSubtask, setLocalSubtask] = useState(subtask);

  useEffect(() => { setLocalSubtask(subtask); }, [subtask]);
  useEffect(() => {
    if (forceExpanded) setExpanded(true);
  }, [forceExpanded]);

  const progress = useMemo(() => {
    const total = localSubtask?.micro_task_progress?.total ?? localSubtask?.micro_tasks?.length ?? 0;
    const completed = localSubtask?.micro_task_progress?.completed ?? (localSubtask?.micro_tasks ?? []).filter((m) => m.is_completed).length;
    return { total, completed };
  }, [localSubtask]);
  const modifiedAt = localSubtask?.last_modified_at ?? localSubtask?.updated_at ?? localSubtask?.created_at;
  const modifiedBy = localSubtask?.last_modified_by_name ?? localSubtask?.assignee_name ?? localSubtask?.creator_name ?? 'Unknown';

  const loadComments = async () => {
    if (!localSubtask?.id) return;
    setLoadingComments(true);
    try {
      const res = await api.get(`/tasks/${localSubtask.id}/comments`, { params: { scope: 'task' } });
      setComments(res.data ?? []);
    } catch {
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  };

  useEffect(() => { if (expanded) loadComments(); }, [expanded]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateField = async (field, value) => {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append(field, value);
      const res = await api.put(`/tasks/${localSubtask.id}`, fd);
      if (res?.data?.id) setLocalSubtask((prev) => ({ ...prev, ...res.data }));
      if (onChanged) onChanged();
    } catch (e) {
      if (addToast) addToast('Error', e.response?.data?.detail || 'Failed to update subtask', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleComplete = () => {
    updateField('status', localSubtask.status === 'completed' ? 'pending' : 'completed');
  };

  const addComment = async () => {
    const payload = commentText.trim();
    if (!payload) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('content', payload);
      await api.post(`/tasks/${localSubtask.id}/comments`, fd);
      setCommentText('');
      loadComments();
      if (onChanged) onChanged();
    } catch (e) {
      if (addToast) addToast('Error', e.response?.data?.detail || 'Failed to add comment', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSubtask = async () => {
    setSaving(true);
    try {
      await api.delete(`/tasks/${localSubtask.id}`);
      setShowDeleteConfirm(false);
      if (addToast) addToast('Success', 'Subtask deleted successfully', 'success');
      if (onChanged) onChanged();
    } catch (e) {
      if (addToast) addToast('Error', e.response?.data?.detail || 'Failed to delete subtask', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleMicroItemsChange = useCallback((nextItems) => {
    setLocalSubtask((prev) => {
      const total = nextItems.length;
      const completed = nextItems.filter((m) => m.is_completed).length;
      return {
        ...prev,
        micro_tasks: nextItems,
        micro_task_progress: { total, completed },
      };
    });
  }, []);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white" data-subtask-card-id={localSubtask?.id || ''}>
      <div className={`px-3 py-2.5 flex items-center gap-2 ${expanded ? 'bg-gray-50' : ''}`}>
        <button
          type="button"
          onClick={toggleComplete}
          className={`w-4 h-4 rounded border flex items-center justify-center ${
            localSubtask.status === 'completed' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'
          }`}
          disabled={saving}
        >
          {localSubtask.status === 'completed' && (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
        <button type="button" className="text-sm text-gray-700 flex-1 text-left" onClick={() => setExpanded((v) => !v)}>
          {localSubtask.title || 'Subtask'}
        </button>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_BADGE[localSubtask.priority] ?? PRIORITY_BADGE.medium}`}>
          {(localSubtask.priority ?? 'medium').toUpperCase()}
        </span>
        <span className="text-[10px] text-gray-400">{progress.completed}/{progress.total} micro</span>
        <button type="button" className="text-gray-400 hover:text-gray-600" onClick={() => setExpanded((v) => !v)}>
          <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100 space-y-3">
          <div className="pt-2 text-[11px] text-gray-500">
            Last modified: {modifiedAt ? new Date(modifiedAt).toLocaleString() : '-'} by {modifiedBy}
          </div>
          <div className="pt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
            <select
              value={localSubtask.status ?? 'pending'}
              onChange={(e) => updateField('status', e.target.value)}
              className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
              disabled={saving}
            >
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="on_hold">On Hold</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select
              value={localSubtask.assignee_id ?? ''}
              onChange={(e) => updateField('assignee_id', e.target.value)}
              className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
              disabled={saving}
            >
              <option value="">Unassigned</option>
              {reps.map((r) => <option key={r.id} value={r.id}>{r.name ?? r.rep_id}</option>)}
            </select>
            <input
              type="date"
              value={localSubtask.due_date ? localSubtask.due_date.substring(0, 10) : ''}
              onChange={(e) => updateField('due_date', e.target.value)}
              className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg"
              disabled={saving}
            />
            <select
              value={localSubtask.priority ?? 'medium'}
              onChange={(e) => updateField('priority', e.target.value)}
              className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
              disabled={saving}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <MicroTaskList
            subtask={localSubtask}
            highlightMicroTaskId={highlightMicroTaskId}
            api={api}
            reps={reps}
            addToast={addToast}
            onChanged={onChanged}
            onItemsChange={handleMicroItemsChange}
            disabled={saving}
          />

          <div className="rounded-lg border border-gray-200">
            <div className="px-3 py-2 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Comments
            </div>
            <div className="p-3 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addComment(); } }}
                  className="flex-1 px-2.5 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                  placeholder="Write a comment..."
                  disabled={saving}
                />
                <button
                  type="button"
                  onClick={addComment}
                  disabled={!commentText.trim() || saving}
                  className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded-lg disabled:opacity-50"
                >
                  Post
                </button>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-xs text-red-600 hover:text-red-700"
                  disabled={saving}
                >
                  Delete Subtask
                </button>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-2">
                {loadingComments && <div className="text-xs text-gray-400">Loading comments...</div>}
                {!loadingComments && comments.length === 0 && <div className="text-xs text-gray-400">No comments yet</div>}
                {comments.map((c) => (
                  <div key={c.id} className="bg-gray-50 rounded-lg p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] font-medium text-gray-700">{c.author_name ?? 'User'}</div>
                      <div className="text-[10px] text-gray-400">{c.created_at ? new Date(c.created_at).toLocaleString() : '-'}</div>
                    </div>
                    <div className="text-xs text-gray-600 mt-1">{c.content}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-4 space-y-3">
            <h4 className="text-sm font-semibold text-gray-900">Delete Subtask?</h4>
            <p className="text-sm text-gray-600">Are you sure you want to delete this subtask?</p>
            <p className="text-sm text-gray-700 italic">"{localSubtask?.title || 'Untitled subtask'}"</p>
            {((localSubtask?.micro_tasks?.length ?? 0) > 0 || (localSubtask?.comment_count ?? 0) > 0) && (
              <div className="text-sm text-gray-600 mt-2">
                <p>This will also delete:</p>
                <ul className="list-disc list-inside ml-2">
                  {(localSubtask?.micro_tasks?.length ?? 0) > 0 && (
                    <li>{localSubtask.micro_tasks.length} micro-task{localSubtask.micro_tasks.length !== 1 ? 's' : ''}</li>
                  )}
                  {(localSubtask?.comment_count ?? 0) > 0 && (
                    <li>{localSubtask.comment_count} comment{localSubtask.comment_count !== 1 ? 's' : ''}</li>
                  )}
                </ul>
              </div>
            )}
            <p className="text-sm text-gray-600 mt-2">This action cannot be undone.</p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteSubtask}
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                disabled={saving}
              >
                {saving ? 'Deleting...' : 'Delete Subtask'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
