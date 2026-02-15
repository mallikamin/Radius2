import React, { useState, useRef, useEffect, useCallback } from 'react';
import ChatMessage from './ChatMessage';

const MAX_MESSAGES = 100;
const QUICK_ACTIONS = [
  { label: 'Available plots', query: 'Show me available plots' },
  { label: 'My tasks', query: 'Show my tasks' },
  { label: 'Task dashboard', query: 'Show task dashboard summary' },
  { label: 'Customer list', query: 'List all customers' },
];

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-3">
      <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}

function ChatIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
      <path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.29 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.68-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97zM6.75 8.25a.75.75 0 01.75-.75h9a.75.75 0 010 1.5h-9a.75.75 0 01-.75-.75zm.75 2.25a.75.75 0 000 1.5H12a.75.75 0 000-1.5H7.5z" clipRule="evenodd" />
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M5 10a.75.75 0 01.75-.75h8.5a.75.75 0 010 1.5h-8.5A.75.75 0 015 10z" clipRule="evenodd" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
    </svg>
  );
}

export default function ChatWidget({ api, user }) {
  const [isOpen, setIsOpen] = useState(false);
  const welcomeMessage = {
    role: 'assistant',
    content: '**Welcome to ORBIT Assistant!**\n\nI can help you query CRM data, check inventory, review tasks, and more.\n\nTry a quick action below or type your question.',
    timestamp: new Date(),
  };
  const [messages, setMessages] = useState([welcomeMessage]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const prevUserRef = useRef(user?.rep_id);

  // F17: Clear chat history on user switch
  useEffect(() => {
    if (user?.rep_id && prevUserRef.current && user.rep_id !== prevUserRef.current) {
      setMessages([{ ...welcomeMessage, timestamp: new Date() }]);
      setInput('');
    }
    prevUserRef.current = user?.rep_id;
  }, [user?.rep_id]);

  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // F12: Escape key closes chat
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen]);

  const sendQuery = useCallback(async (queryText) => {
    const trimmed = (queryText ?? '').trim();
    if (!trimmed || isLoading) return;

    const userMessage = {
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage].slice(-MAX_MESSAGES));
    setInput('');
    setIsLoading(true);

    try {
      const fd = new FormData();
      fd.append('query', trimmed);
      const res = await api.post('/voice/query', fd);
      const data = res.data ?? {};
      const responseText = data.response_text ?? 'No response received.';

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: responseText,
          timestamp: new Date(),
        },
      ].slice(-MAX_MESSAGES));
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      let errorMsg = 'Sorry, something went wrong. Please try again.';
      if (status === 401) {
        errorMsg = 'Session expired. Please log in again.';
      } else if (status === 404) {
        errorMsg = 'Voice query endpoint not found. The voice agent may not be running.';
      } else if (detail) {
        errorMsg = `Error: ${detail}`;
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: errorMsg,
          timestamp: new Date(),
        },
      ].slice(-MAX_MESSAGES));
    } finally {
      setIsLoading(false);
    }
  }, [api, isLoading]);

  const handleSubmit = (e) => {
    e.preventDefault();
    sendQuery(input);
  };

  const handleQuickAction = (query) => {
    sendQuery(query);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendQuery(input);
    }
  };

  // Floating button (collapsed state)
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-[55] w-14 h-14 bg-gray-900 hover:bg-gray-800 text-white rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
        aria-label="Open ORBIT Assistant"
        title="ORBIT Assistant"
      >
        <ChatIcon />
      </button>
    );
  }

  // Expanded chat panel
  return (
    <div
      className="fixed bottom-6 right-6 z-[55] w-[400px] h-[500px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
      role="dialog"
      aria-label="ORBIT Assistant chat"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-xs font-bold">
            OA
          </div>
          <div>
            <h3 className="text-sm font-semibold leading-tight">ORBIT Assistant</h3>
            <p className="text-[11px] text-gray-400 leading-tight">
              {user?.name ? `Helping ${user.name}` : 'CRM Voice & Text Assistant'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Minimize chat"
            title="Minimize"
          >
            <MinimizeIcon />
          </button>
          <button
            onClick={handleClose}
            className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Close chat"
            title="Close"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 bg-white">
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}
        {isLoading && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick actions */}
      {messages.length <= 1 && !isLoading && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5 shrink-0">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              onClick={() => handleQuickAction(action.query)}
              disabled={isLoading}
              className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition-colors disabled:opacity-50"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <form onSubmit={handleSubmit} className="px-3 py-2.5 border-t border-gray-200 bg-gray-50 shrink-0">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask ORBIT anything..."
            disabled={isLoading}
            className="flex-1 text-sm px-3 py-2 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 placeholder:text-gray-400"
            aria-label="Type your message"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-xl transition-colors disabled:cursor-not-allowed shrink-0"
            aria-label="Send message"
            title="Send"
          >
            <SendIcon />
          </button>
        </div>
      </form>
    </div>
  );
}
