import React from 'react';

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

export default function ChatMessage({ message }) {
  const { role = 'assistant', content = '', timestamp } = message || {};
  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-blue-600 text-white rounded-br-md'
            : 'bg-gray-100 text-gray-800 rounded-bl-md'
        }`}
      >
        <div className="space-y-0.5">{parseMarkdown(content)}</div>
        {timestamp && (
          <div
            className={`text-[10px] mt-1.5 ${
              isUser ? 'text-blue-200' : 'text-gray-400'
            } text-right`}
          >
            {formatTime(timestamp)}
          </div>
        )}
      </div>
    </div>
  );
}
