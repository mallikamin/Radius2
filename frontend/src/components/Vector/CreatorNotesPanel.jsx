import React, { useState, useEffect } from 'react';

export default function CreatorNotesPanel({ vectorState }) {
  const [noteText, setNoteText] = useState('');
  const [draftKey] = useState(`vector_notes_draft_${vectorState.projectName || 'default'}`);

  // Load draft from localStorage
  useEffect(() => {
    const draft = localStorage.getItem(draftKey);
    if (draft) {
      setNoteText(draft);
    }
  }, [draftKey]);

  // Auto-save draft
  useEffect(() => {
    const timer = setTimeout(() => {
      if (noteText.trim()) {
        localStorage.setItem(draftKey, noteText);
      } else {
        localStorage.removeItem(draftKey);
      }
    }, 500); // Debounce 500ms

    return () => clearTimeout(timer);
  }, [noteText, draftKey]);

  const handleSaveNote = () => {
    if (!noteText || !noteText.trim()) {
      alert('Please enter a note');
      return;
    }

    vectorState.addCreatorNote(noteText);
    setNoteText('');
    localStorage.removeItem(draftKey);
  };

  const handleClearNote = () => {
    if (confirm('Clear the current note?')) {
      setNoteText('');
      localStorage.removeItem(draftKey);
    }
  };

  const handleDeleteNote = (noteId) => {
    if (confirm('Delete this note?')) {
      vectorState.removeCreatorNote(noteId);
    }
  };

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-semibold">
          Creator Notes ({vectorState.creatorNotes.length})
        </h3>
      </div>

      {/* Add Note */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-700">Add Note</label>
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Enter your note here..."
          className="w-full px-2 py-1 text-xs border border-gray-300 rounded resize-none"
          rows="4"
        />
        <div className="flex gap-2">
          <button
            onClick={handleSaveNote}
            className="flex-1 px-3 py-2 text-xs bg-green-600 text-white rounded hover:bg-green-700"
          >
            Save Note
          </button>
          <button
            onClick={handleClearNote}
            className="px-3 py-2 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Clear
          </button>
        </div>
        {noteText.trim() && (
          <div className="text-xs text-gray-500">
            Draft auto-saved
          </div>
        )}
      </div>

      {/* Notes List */}
      <div className="max-h-96 overflow-y-auto border border-gray-200 rounded p-2 space-y-2">
        {vectorState.creatorNotes.length === 0 ? (
          <div className="text-xs text-gray-500 text-center py-4">
            No notes yet. Add a note above.
          </div>
        ) : (
          vectorState.creatorNotes.map(note => (
            <div
              key={note.id}
              className="p-2 bg-gray-50 rounded text-xs hover:bg-gray-100"
            >
              <div className="flex items-start justify-between mb-1">
                <div className="flex-1">
                  <div className="text-gray-700 whitespace-pre-wrap">{note.text}</div>
                  <div className="text-gray-500 text-xs mt-1">
                    {formatDate(note.timestamp)}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteNote(note.id)}
                  className="ml-2 px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                  title="Delete"
                >
                  ×
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Instructions */}
      <div className="text-xs text-gray-500 border-t border-gray-200 pt-3">
        <div className="font-medium mb-1">Instructions:</div>
        <ol className="list-decimal list-inside space-y-1">
          <li>Enter your note in the textarea above</li>
          <li>Click Save Note to add it</li>
          <li>Drafts are auto-saved locally</li>
          <li>View all notes in the list below</li>
        </ol>
      </div>
    </div>
  );
}

