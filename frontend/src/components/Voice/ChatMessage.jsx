import React, { useState } from 'react';

/**
 * Parses simple markdown: **bold**, newlines, and bullet points (- or *).
 * Returns an array of React elements.
 */
function parseMarkdown(text) {
  if (!text) return null;
  const lines = text.split('\n');
  return lines.map((line, li) => {
    const trimmed = line.trim();
    const isBullet = /^[-*]\s+/.test(trimmed);
    const content = isBullet ? trimmed.replace(/^[-*]\s+/, '') : line;

    // Split on **bold** markers
    const parts = content.split(/(\*\*[^*]+\*\*)/g);
    const rendered = parts.map((part, pi) => {
      const boldMatch = part.match(/^\*\*(.+)\*\*$/);
      if (boldMatch) {
        return <strong key={pi} className="font-semibold">{boldMatch[1]}</strong>;
      }
      return <span key={pi}>{part}</span>;
    });

    if (isBullet) {
      return (
        <div key={li} className="flex items-start gap-1.5 ml-1">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-current shrink-0" />
          <span>{rendered}</span>
        </div>
      );
    }

    // Empty lines become spacing
    if (trimmed === '') {
      return <div key={li} className="h-2" />;
    }

    return <div key={li}>{rendered}</div>;
  });
}

function formatTime(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export default function ChatMessage({ message, onFeedback }) {
  const { role = 'assistant', content = '', timestamp, queryId, transcript, sttConfidence, feedbackGiven } = message || {};
  const isUser = role === 'user';
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revisionText, setRevisionText] = useState('');
  const [localFeedback, setLocalFeedback] = useState(feedbackGiven || null);

  const handleApprove = () => {
    if (onFeedback && queryId) {
      onFeedback(queryId, 'THUMBS_UP');
      setLocalFeedback('approved');
    }
  };

  const handleRevise = () => {
    setShowRevisionForm(true);
  };

  const submitRevision = () => {
    if (onFeedback && queryId && revisionText.trim()) {
      onFeedback(queryId, 'THUMBS_DOWN', revisionText.trim());
      setLocalFeedback('revised');
      setShowRevisionForm(false);
      setRevisionText('');
    }
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-blue-600 text-white rounded-br-md'
            : 'bg-gray-100 text-gray-800 rounded-bl-md'
        }`}
      >
        {/* Transcript badge for voice messages */}
        {transcript && isUser && (
          <div className="text-[10px] text-blue-200 mb-1 flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path d="M7.557 2.066A.75.75 0 0 1 8 2.75v10.5a.75.75 0 0 1-1.248.56L3.59 11H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h1.59l3.162-2.81a.75.75 0 0 1 .805-.124ZM12.95 3.05a.75.75 0 1 0-1.06 1.06 5.5 5.5 0 0 1 0 7.78.75.75 0 1 0 1.06 1.06 7 7 0 0 0 0-9.9Z" />
            </svg>
            Voice {sttConfidence ? `(${Math.round(sttConfidence * 100)}%)` : ''}
          </div>
        )}

        <div className="space-y-0.5">{parseMarkdown(content)}</div>

        <div className={`flex items-center justify-between mt-1.5 ${isUser ? '' : ''}`}>
          {timestamp && (
            <div className={`text-[10px] ${isUser ? 'text-blue-200' : 'text-gray-400'}`}>
              {formatTime(timestamp)}
            </div>
          )}

          {/* Feedback buttons for assistant messages with queryId */}
          {!isUser && queryId && !localFeedback && (
            <div className="flex items-center gap-1 ml-2">
              <button
                onClick={handleApprove}
                className="p-1 rounded hover:bg-green-100 text-gray-400 hover:text-green-600 transition-colors"
                title="Good response"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M2.09 15a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1H4v8H2.09ZM5.5 15V7l3.5-4.5c.3-.4.8-.5 1.2-.3.4.2.6.7.5 1.1L10 6h3.5c.6 0 1.1.5 1 1.1l-1 6c-.1.5-.5.9-1 .9H5.5Z" />
                </svg>
              </button>
              <button
                onClick={handleRevise}
                className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500 transition-colors"
                title="Needs improvement"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M13.91 1a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H12V1h1.91ZM10.5 1v8l-3.5 4.5c-.3.4-.8.5-1.2.3-.4-.2-.6-.7-.5-1.1L6 10H2.5c-.6 0-1.1-.5-1-1.1l1-6c.1-.5.5-.9 1-.9H10.5Z" />
                </svg>
              </button>
            </div>
          )}

          {/* Feedback state */}
          {!isUser && localFeedback === 'approved' && (
            <span className="text-[10px] text-green-600 ml-2 flex items-center gap-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" /></svg>
              Approved
            </span>
          )}
          {!isUser && localFeedback === 'revised' && (
            <span className="text-[10px] text-orange-500 ml-2">Feedback sent</span>
          )}
        </div>

        {/* Revision form */}
        {showRevisionForm && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <textarea
              value={revisionText}
              onChange={(e) => setRevisionText(e.target.value)}
              placeholder="What was wrong? What did you expect?"
              className="w-full text-xs p-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
              rows={2}
              autoFocus
            />
            <div className="flex justify-end gap-1.5 mt-1.5">
              <button
                onClick={() => { setShowRevisionForm(false); setRevisionText(''); }}
                className="text-[11px] px-2 py-1 text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={submitRevision}
                disabled={!revisionText.trim()}
                className="text-[11px] px-2.5 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Submit
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
