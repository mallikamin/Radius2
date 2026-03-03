import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import VectorMap from './components/Vector/VectorMap';
import OrphanTrackingPanel from './components/OrphanTrackingPanel';
import TasksView from './components/Tasks/TasksView';
import EntityTaskWidget from './components/Tasks/EntityTaskWidget';
import ChatWidget from './components/Voice/ChatWidget';
import PhoneInput from './components/PhoneInput';
import { fetchLookupValues, LOOKUP_KEYS } from './utils/lookupValues';
import { SBL_LOGO_BASE64 } from './sblLogo';

const api = axios.create({ baseURL: '/api' });
const formatCurrency = (n) => new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(n || 0);
const emptyEnhancedLead = {
  name: '', mobile: '', email: '', assigned_rep_id: '', lead_type: 'prospect', notes: '',
  source: '', source_other: '', occupation: '', occupation_other: '',
  interested_project_id: '', interested_project_other: '', area: '', city: '',
  additional_mobiles: ['', '', '', ''], country_code: '+92'
};

const INTERACTION_TYPE_OPTIONS = [
  { value: 'call', label: 'Call' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'meeting', label: 'Meeting' }
];

const INTERACTION_STATUS_OPTIONS = {
  call: [
    { value: 'Connected', label: 'Connected' },
    { value: 'Attempted', label: 'Attempted' }
  ],
  whatsapp: [
    { value: 'WhatsApp Call', label: 'WhatsApp Call' },
    { value: 'WhatsApp Message', label: 'WhatsApp Message' }
  ],
  meeting: [
    { value: 'Arrange', label: 'Arrange' },
    { value: 'Done @ Site Office', label: 'Done @ Site Office' },
    { value: 'Done @ Client Office', label: 'Done @ Client Office' },
    { value: 'Done @ Head Office/Inhouse', label: 'Done @ Head Office/Inhouse' }
  ]
};

const getInteractionStatusOptions = (interactionType) =>
  INTERACTION_STATUS_OPTIONS[interactionType] || [];

const getDefaultInteractionStatus = (interactionType) =>
  getInteractionStatusOptions(interactionType)[0]?.value || '';

const formatInteractionType = (interactionType, status) => {
  if (interactionType === 'whatsapp' && status) return status;
  if (interactionType === 'meeting' && status) return `Meeting - ${status}`;
  if (interactionType === 'call') return 'Call';
  return interactionType || '-';
};

const getTemperatureBadgeClass = (temperature) => {
  const value = String(temperature || '').toLowerCase();
  if (value === 'hot') return 'bg-red-100 text-red-700';
  if (value === 'mild') return 'bg-amber-100 text-amber-700';
  if (value === 'cold') return 'bg-blue-100 text-blue-700';
  return 'bg-gray-100 text-gray-600';
};

// ============================================
// AUTHENTICATION - LOGIN VIEW
// ============================================
function LoginView({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('username', username);
      formData.append('password', password);
      const res = await api.post('/auth/login', formData);
      localStorage.setItem('token', res.data.access_token);
      api.defaults.headers.common['Authorization'] = `Bearer ${res.data.access_token}`;
      let userPayload = res.data.user;
      // Ensure rep_type is populated even if login response is partial.
      if (!Object.prototype.hasOwnProperty.call(userPayload || {}, 'rep_type')) {
        try {
          const meRes = await api.get('/auth/me');
          userPayload = meRes.data;
        } catch (e2) {
          // Fallback to login payload.
        }
      }
      localStorage.setItem('user', JSON.stringify(userPayload));
      onLogin(userPayload);
    } catch (e) {
      setError(e.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Orbit <span className="text-gray-400 font-normal text-2xl">- SBL CRM</span></h1>
        <p className="text-gray-600 mb-8">Sign in to your account</p>
        
        {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username / Email / Mobile</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="Enter your rep_id (e.g., REP-0002)"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="Enter your password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white py-2 px-4 rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        
        <p className="mt-6 text-xs text-gray-500 text-center">
          First time? Use your rep_id as username and any password
        </p>
      </div>
    </div>
  );
}

// ============================================
// ROLE HELPER
// ============================================
function getUserRole() {
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) return JSON.parse(userStr).role || 'user';
  } catch (e) {}
  return 'user';
}

function downloadCSV(data, filename) {
  if (!data || !data.length) return;
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];
  for (const row of data) {
    csvRows.push(headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(','));
  }
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  window.URL.revokeObjectURL(url);
}

// ============================================
// MAIN APP
// ============================================
export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('projects');
  const [taskDeepLink, setTaskDeepLink] = useState(null);
  const [zakatDeepLink, setZakatDeepLink] = useState(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [toasts, setToasts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  
  // Expose setActiveTab for Vector navigation
  useEffect(() => {
    window.setActiveTab = setActiveTab;
    return () => {
      window.setActiveTab = null;
    };
  }, []);
  
  // Check for existing login on mount - MUST be before any conditional returns
  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) {
      try {
        const userData = JSON.parse(savedUser);
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        // Verify token is still valid
        api.get('/auth/me').then(res => {
          setUser(res.data);
          setCheckingAuth(false);
        }).catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setCheckingAuth(false);
        });
      } catch (e) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setCheckingAuth(false);
      }
    } else {
      setCheckingAuth(false);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
  };

  // CSV download helper for duplicate reports
  // Toast system
  const addToast = (title, message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, title, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  };
  useEffect(() => { window.showToast = addToast; return () => { window.showToast = null; }; }, []);

  // Notification polling (every 30s when logged in)
  useEffect(() => {
    if (!user) return;
    const fetchNotifs = async () => {
      try {
        const res = await api.get('/notifications/unread');
        setNotifications(res.data.notifications || []);
        setUnreadCount(res.data.count || 0);
        // Show toast for new notifications
        const lastCheck = parseInt(localStorage.getItem('lastNotifCheck') || '0');
        const newOnes = (res.data.notifications || []).filter(n => new Date(n.created_at + 'Z').getTime() > lastCheck);
        newOnes.slice(0, 3).forEach(n => addToast(n.title, n.message || '', n.type === 'search_alert' ? 'warning' : 'info'));
        localStorage.setItem('lastNotifCheck', String(Date.now()));
      } catch (e) {
        if (e.response?.status === 401) {
          handleLogout();
          addToast('Session Expired', 'Please log in again', 'warning');
        }
      }
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const markNotifRead = async (nid) => {
    try { await api.post(`/notifications/${nid}/read`); setNotifications(prev => prev.filter(n => n.id !== nid)); setUnreadCount(prev => Math.max(0, prev - 1)); } catch (e) { /* silent */ }
  };
  const openAuthReport = async (url) => {
    try {
      const res = await api.get(url, { responseType: 'text' });
      const win = window.open('', '_blank');
      if (win) { win.document.write(res.data); win.document.close(); }
    } catch (e) { console.error('Failed to open report:', e); }
  };
  const handleNotifClick = (n) => {
    markNotifRead(n.id);
    setShowNotifPanel(false);
    const extractTaskId = (text) => {
      const m = String(text || '').match(/\bTASK-\d+\b/i);
      return m ? m[0].toUpperCase() : null;
    };
    if (n.type === 'task_report') {
      // entity_type === "report", entity_id is the media record id
      // For personal reports: /tasks/daily-report/{rep_id}
      // For org reports: /tasks/daily-report/org
      // The notification data or entity_id may contain the rep_id
      const repId = n.data?.rep_id || user?.rep_id;
      if (repId) openAuthReport(`/tasks/daily-report/${repId}`);
      return;
    }

    const isTaskNotification =
      ['task', 'subtask', 'micro_task'].includes(n.entity_type || '') ||
      (n.category || '').toLowerCase() === 'task' ||
      String(n.type || '').startsWith('task_') ||
      String(n.type || '') === 'pending_assignment';

    if (isTaskNotification) {
      const parsedTaskId = extractTaskId(n.data?.task_id || n.entity_id || n.title || n.message);
      const deepLink = {
        taskId: n.data?.task_id || (n.entity_type === 'task' ? n.entity_id : null) || parsedTaskId,
        subtaskId: n.data?.subtask_id || (n.entity_type === 'subtask' ? n.entity_id : null),
        microTaskId: n.data?.micro_task_id || (n.entity_type === 'micro_task' ? n.entity_id : null),
      };
      // Micro-task notifications may only provide micro_task_id in entity_id.
      if (!deepLink.taskId && n.entity_type === 'micro_task') {
        deepLink.microTaskId = deepLink.microTaskId || n.entity_id;
      }
      setTaskDeepLink(deepLink);
      setActiveTab('tasks');
      if (!deepLink.taskId && !deepLink.subtaskId && !deepLink.microTaskId) {
        addToast('Notification', 'Opened Tasks. Could not resolve exact item from this notification.', 'info');
      }
      return;
    }

    const isZakatNotification =
      (n.entity_type || '') === 'zakat' ||
      (n.category || '').toLowerCase() === 'zakat' ||
      String(n.type || '').startsWith('zakat_');

    if (isZakatNotification) {
      let status = '';
      const type = String(n.type || '').toLowerCase();
      if (type === 'zakat_approval_required') status = 'pending';
      else if (type === 'zakat_disbursement_approval_required') status = 'funds_pending';
      else if (type === 'zakat_ready_for_disbursement') status = 'ready_for_disbursement';
      else if (type === 'zakat_approved') status = 'approved';
      else if (type === 'zakat_rejected') status = 'rejected';
      else if (type === 'zakat_disbursement_postponed') status = 'funds_pending';

      setZakatDeepLink({
        entityId: n.entity_id || null,
        zakatId: n.data?.zakat_id || null,
        statusFilter: status,
        ts: Date.now(),
      });
      setActiveTab('zakat');
      return;
    }
  };
  const markAllRead = async () => {
    try { await api.post('/notifications/read-all'); setNotifications([]); setUnreadCount(0); } catch (e) { /* silent */ }
  };


  // Close dropdowns when clicking outside - MUST be before conditional returns
  useEffect(() => {
    if (!showMoreMenu && !showNotifPanel) return;

    const handleClickOutside = (event) => {
      const target = event.target;
      if (showMoreMenu) {
        const menuElement = document.querySelector('.more-menu-container');
        const buttonElement = document.querySelector('.more-menu-button');
        if (menuElement && buttonElement && !menuElement.contains(target) && !buttonElement.contains(target)) {
          setShowMoreMenu(false);
        }
      }
      if (showNotifPanel) {
        const notifPanel = target.closest('[data-notif-panel]');
        if (!notifPanel) setShowNotifPanel(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMoreMenu, showNotifPanel]);

  // Role-based access control
  const ZAKAT_ALLOWED_REPS = ['REP-0002', 'REP-0010', 'REP-0011', 'REP-0012', 'REP-0013'];
  const hasZakatAccess = (u) => {
    if (!u) return false;
    return ZAKAT_ALLOWED_REPS.includes(u.rep_id || '');
  };

  const canAccess = (tabId) => {
    if (!user) return false;
    const role = user.role || 'user';
    const repType = user.rep_type || null;
    const repId = user.rep_id || '';
    
    // Admin can access everything
    if (role === 'admin') return true;
    
    // Role-based access rules
    const roleAccess = {
      admin: ['dashboard', 'projects', 'inventory', 'transactions', 'receipts', 'payments', 'reports', 'interactions', 'customers', 'brokers', 'campaigns', 'tasks', 'media', 'vector', 'eoi', 'zakat', 'settings'],
      director: ['dashboard', 'projects', 'inventory', 'transactions', 'receipts', 'payments', 'reports', 'interactions', 'customers', 'brokers', 'campaigns', 'tasks', 'media', 'vector', 'settings'],
      cco: ['dashboard', 'projects', 'inventory', 'transactions', 'receipts', 'payments', 'reports', 'interactions', 'customers', 'brokers', 'campaigns', 'tasks', 'media', 'vector', 'eoi', 'settings'],
      coo: ['dashboard', 'projects', 'inventory', 'transactions', 'receipts', 'payments', 'reports', 'interactions', 'customers', 'brokers', 'campaigns', 'tasks', 'media', 'vector', 'eoi', 'settings'],
      manager: ['dashboard', 'projects', 'inventory', 'transactions', 'receipts', 'payments', 'reports', 'interactions', 'customers', 'brokers', 'tasks', 'media', 'vector'],
      creator: ['dashboard', 'projects', 'inventory', 'transactions', 'receipts', 'payments', 'reports', 'interactions', 'customers', 'brokers', 'campaigns', 'tasks', 'media', 'vector'],
      user: ['customers', 'tasks', 'interactions', 'dashboard', 'transactions', 'receipts'],
      viewer: ['dashboard', 'projects', 'inventory', 'transactions', 'receipts', 'tasks', 'media', 'vector']
    };
    
    if (tabId === 'zakat') return hasZakatAccess(user);

    const allowedByRole = roleAccess[role]?.includes(tabId) || false;
    if (!allowedByRole) return false;

    // Rep-type specific visibility overlay.
    if (repType === 'direct_rep') {
      const blocked = ['payments'];
      return !blocked.includes(tabId);
    }
    if (repType === 'indirect_rep') {
      const blocked = ['payments'];
      return !blocked.includes(tabId);
    }
    return true;
  };
  
  // Team-based focused headers
  const TEAM_HEADER_CONFIG = {
    // Zakat/Finance team
    finance: {
      members: ['REP-0002', 'REP-0010', 'REP-0011', 'REP-0012', 'REP-0013'],
      primaryIds: ['zakat', 'tasks', 'reports', 'dashboard'],
    },
    // Operations team: COO Hassan Danish, Ahsan Ejaz (Director Land), Sarosh Javed (CEO)
    operations: {
      members: ['REP-0003', 'REP-0004', 'REP-0009'],
      primaryIds: ['eoi', 'tasks', 'inventory', 'transactions', 'vector', 'dashboard', 'reports'],
    },
    // CCO: Syed Faisal
    cco: {
      members: ['REP-0008'],
      primaryIds: ['eoi', 'reports', 'dashboard', 'customers', 'campaigns'],
    },
  };

  // Determine which team config applies to current user
  const userTeam = Object.entries(TEAM_HEADER_CONFIG).find(([_, cfg]) => cfg.members.includes(user?.rep_id))?.[1] ?? null;

  // Primary tabs - always visible in header
  const allPrimaryTabs = [
    { id: 'zakat', label: 'Zakat' },
    { id: 'customers', label: 'Customers & Leads' },
    { id: 'campaigns', label: 'Campaigns' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'interactions', label: 'Interactions' },
    { id: 'reports', label: 'Reports' },
    { id: 'vector', label: 'Vector' },
    { id: 'dashboard', label: 'Analytics' }
  ];

  // More menu items - icon grid
  const defaultMoreTabs = [
    { id: 'projects', label: 'Projects', icon: '\u{1F3D7}' },
    { id: 'inventory', label: 'Inventory', icon: '\u{1F4E6}' },
    { id: 'transactions', label: 'Transactions', icon: '\u{1F4B1}' },
    { id: 'receipts', label: 'Receipts', icon: '\u{1F4C4}' },
    { id: 'payments', label: 'Payments', icon: '\u{1F4B8}' },
    { id: 'eoi', label: 'EOI Collection', icon: '\u{1F4DD}' },
    { id: 'media', label: 'Media Library', icon: '\u{1F4F7}' }
  ];

  // Icon map for tabs that can appear in either primary or more menu
  const TAB_ICONS = { zakat: '\u{1FA99}', customers: '\u{1F465}', campaigns: '\u{1F4E3}', interactions: '\u{1F4DE}', vector: '\u{1F5FA}', inventory: '\u{1F4E6}', transactions: '\u{1F4B1}', tasks: '\u{2705}', reports: '\u{1F4CA}', dashboard: '\u{1F4C8}', eoi: '\u{1F4DD}' };

  // All known tabs (primary + more) for team-based selection
  const allKnownTabs = [...allPrimaryTabs, ...defaultMoreTabs];

  // Team members: promoted tabs go to header, demoted tabs go to More menu
  const primaryTabs = (userTeam
    ? userTeam.primaryIds.map(id => allKnownTabs.find(t => t.id === id)).filter(Boolean)
    : allPrimaryTabs
  ).filter(tab => canAccess(tab.id));

  const teamExtraTabs = userTeam
    ? allKnownTabs.filter(tab => !userTeam.primaryIds.includes(tab.id) && allPrimaryTabs.some(p => p.id === tab.id)).map(tab => ({ ...tab, icon: TAB_ICONS[tab.id] || '\u{1F4CB}' }))
    : [];
  const teamFilteredMoreTabs = userTeam
    ? defaultMoreTabs.filter(tab => !userTeam.primaryIds.includes(tab.id))
    : defaultMoreTabs;
  const moreTabs = [...teamExtraTabs, ...teamFilteredMoreTabs].filter(tab => canAccess(tab.id));

  // All tabs for reference
  const allTabs = [...primaryTabs, ...moreTabs];
  if (canAccess('settings')) allTabs.push({ id: 'settings', label: 'Settings' });

  useEffect(() => {
    if (activeTab !== 'projects') return;
    // Redirect to user's team default tab, or EOI as global fallback
    if (userTeam) {
      setActiveTab(userTeam.primaryIds[0]);
    } else if (hasZakatAccess(user)) {
      setActiveTab('zakat');
    } else if (canAccess('eoi')) {
      setActiveTab('eoi');
    }
  }, [user, activeTab]);
  
  // Show loading while checking auth, then show login if not authenticated
  // ALL HOOKS MUST BE ABOVE THIS POINT
  if (checkingAuth) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-600">Loading...</div></div>;
  }
  
  if (!user) {
    return <LoginView onLogin={setUser} />;
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">Orbit <span className="text-gray-400 font-normal">-</span> <span className="text-gray-500 font-medium text-base">SBL CRM</span></h1>
          <nav className="flex items-center gap-2">
            <div className="text-sm text-gray-600 mr-2">
              {user.name} <span className="text-gray-400">({user.role})</span>
            </div>
            {/* Notification Bell */}
            <div className="relative" data-notif-panel>
              <button onClick={() => setShowNotifPanel(!showNotifPanel)}
                className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center font-medium">{unreadCount > 9 ? '9+' : unreadCount}</span>
                )}
              </button>
              {showNotifPanel && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <span className="font-semibold text-sm text-gray-900">Notifications</span>
                    {unreadCount > 0 && <button onClick={markAllRead} className="text-xs text-blue-600 hover:text-blue-800">Mark all read</button>}
                  </div>
                  <div className="overflow-y-auto max-h-72">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-gray-400">No new notifications</div>
                    ) : notifications.map(n => (
                      <div key={n.id} onClick={() => handleNotifClick(n)}
                        className="px-4 py-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                        <div className="text-sm font-medium text-gray-900">{n.title}</div>
                        {n.message && <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</div>}
                        <div className="text-xs text-gray-400 mt-1">{new Date(n.created_at).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            >
              Logout
            </button>
            {/* Primary tabs */}
            <div className="flex gap-1">
              {primaryTabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}>
                  {tab.label}
                </button>
              ))}
            </div>
            
            {/* More menu dropdown - icon grid */}
            {moreTabs.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className={`more-menu-button px-3 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${showMoreMenu || moreTabs.some(t => t.id === activeTab) ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}>
                More
              </button>

              {showMoreMenu && (
                <div className="more-menu-container absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 p-3 z-50">
                  <div className="grid grid-cols-2 gap-1">
                    {moreTabs.map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => { setActiveTab(tab.id); setShowMoreMenu(false); }}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors ${activeTab === tab.id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                        <span className="text-base">{tab.icon}</span>
                        <span className="font-medium">{tab.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            )}
            
            {/* Settings button - admin/cco only */}
            {canAccess('settings') && (
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${activeTab === 'settings' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}>
              Settings
            </button>
            )}
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'dashboard' && <DashboardView />}
        {activeTab === 'projects' && <ProjectsView />}
        {activeTab === 'inventory' && <InventoryView />}
        {activeTab === 'transactions' && <TransactionsView />}
        {activeTab === 'receipts' && <ReceiptsView />}
        {activeTab === 'payments' && <PaymentsView />}
        {activeTab === 'reports' && <ReportsView />}
        {activeTab === 'interactions' && <InteractionsView />}
        {activeTab === 'customers' && <CustomersView />}
        {activeTab === 'campaigns' && <CampaignsView />}
        {activeTab === 'media' && <MediaView />}
        {activeTab === 'tasks' && <TasksView
          api={api}
          user={user}
          addToast={addToast}
          setActiveTab={setActiveTab}
          deepLink={taskDeepLink}
          onDeepLinkHandled={() => setTaskDeepLink(null)}
        />}
        {activeTab === 'zakat' && <ZakatView deepLink={zakatDeepLink} />}
        {activeTab === 'eoi' && <EOICollectionView />}
        {activeTab === 'vector' && <VectorView />}
        {activeTab === 'settings' && <SettingsView />}
      </main>
      {/* Voice Chat Widget */}
      {user && <ChatWidget api={api} user={user} />}
      {/* Toast Container */}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-3 rounded-lg shadow-lg border text-sm animate-slide-in ${
            t.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
            t.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
            t.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
            'bg-blue-50 border-blue-200 text-blue-800'
          }`}>
            <div className="font-medium">{t.title}</div>
            {t.message && <div className="text-xs mt-0.5 opacity-80">{t.message}</div>}
          </div>
        ))}
      </div>
      <style>{`@keyframes slide-in { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } } .animate-slide-in { animation: slide-in 0.3s ease-out; }`}</style>
    </div>
  );
}

// ============================================
// PROJECTS VIEW
// ============================================
function ProjectsView() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [form, setForm] = useState({ name: '', location: '', description: '' });
  const [searchTerm, setSearchTerm] = useState('');

  // Filter projects by search term
  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.project_id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => { loadProjects(); }, []);
  const loadProjects = async () => {
    try { const res = await api.get('/projects'); setProjects(res.data); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try { await api.post('/projects', form); setShowModal(false); setForm({ name: '', location: '', description: '' }); loadProjects(); }
    catch (e) { alert(e.response?.data?.detail || 'Error'); }
  };

  const handleProjectClick = async (projectId) => {
    try {
      const res = await api.get(`/projects/${projectId}`);
      setSelectedProject(res.data);
      setShowDetailModal(true);
    } catch (e) {
      console.error('Error loading project details:', e);
      alert('Error loading project details');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold text-gray-900">Projects</h2>
          <p className="text-sm text-gray-500 mt-1">Overview of all projects</p></div>
        <button onClick={() => setShowModal(true)} className="bg-gray-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-800">Add Project</button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search projects by name, location, or ID..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {loading ? <Loader /> : projects.length === 0 ? <Empty msg="No projects yet" /> : filteredProjects.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border p-12 text-center">
          <div className="text-gray-400 mb-2">No projects match "{searchTerm}"</div>
          <button onClick={() => setSearchTerm('')} className="text-sm text-blue-600 hover:text-blue-800">Clear search</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map(p => (
            <div 
              key={p.id} 
              onClick={() => handleProjectClick(p.id)}
              className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
            >
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="text-xs font-mono text-gray-400">{p.project_id}</div>
                    <div className="text-lg font-semibold text-gray-900">{p.name}</div>
                    <div className="text-sm text-gray-500">{p.location}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div><div className="text-xs text-gray-400">Available</div><div className="text-xl font-semibold text-green-600">{p.stats?.available || 0}</div></div>
                  <div><div className="text-xs text-gray-400">Sold</div><div className="text-xl font-semibold text-blue-600">{p.stats?.sold || 0}</div></div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><div className="text-xs text-gray-400">Total Units</div><div className="font-medium">{p.stats?.total_units || 0}</div></div>
                  <div><div className="text-xs text-gray-400">Avg Rate</div><div className="font-medium">{formatCurrency(p.stats?.avg_rate)}</div></div>
                </div>
              </div>
              <div className="bg-gray-50 px-5 py-3 border-t border-gray-100">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Value</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(p.stats?.total_value)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title="Add Project" onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Name" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            <Input label="Location" value={form.location} onChange={e => setForm({...form, location: e.target.value})} />
            <Input label="Description" value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg">Create</button>
            </div>
          </form>
        </Modal>
      )}

      {showDetailModal && selectedProject && (
        <Modal title={`Project: ${selectedProject.name}`} onClose={() => { setShowDetailModal(false); setSelectedProject(null); }}>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Project ID</label>
                <div className="text-sm text-gray-900">{selectedProject.project_id}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
                <div className="text-sm text-gray-900">{selectedProject.location || '-'}</div>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                <div className="text-sm text-gray-900">{selectedProject.description || '-'}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                <div className="text-sm text-gray-900">{selectedProject.status || 'active'}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Inventory Units</label>
                <div className="text-sm text-gray-900">{selectedProject.inventory?.length || 0}</div>
              </div>
            </div>

            <div className="border-t pt-4">
              <EntityTaskWidget
                api={api}
                entityType="project"
                entityId={selectedProject.id}
                compact
              />
            </div>

            {/* Media Attachments */}
            <div className="border-t pt-4">
              <MediaManager 
                entityType="project" 
                entityId={selectedProject.id || selectedProject.project_id}
                onUpload={() => {}}
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================
// INVENTORY VIEW
// ============================================
function InventoryView() {
  const [inventory, setInventory] = useState([]);
  const [projects, setProjects] = useState([]);
  const [summary, setSummary] = useState(null);
  const [filter, setFilter] = useState({ project_id: '', status: '' });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showSellModal, setShowSellModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [form, setForm] = useState({ project_id: '', unit_number: '', unit_type: 'plot', block: '', area_marla: '', rate_per_marla: '', factor_details: '', notes: '' });
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);

  // Search filters - exact match fields
  const [unitNumber, setUnitNumber] = useState('');
  const [searchBlock, setSearchBlock] = useState('');
  const [areaMin, setAreaMin] = useState('');
  const [areaMax, setAreaMax] = useState('');
  const [rateMin, setRateMin] = useState('');
  const [rateMax, setRateMax] = useState('');

  // Get unique blocks from inventory for dropdown
  const uniqueBlocks = [...new Set(inventory.map(i => i.block).filter(Boolean))].sort();

  // Filter inventory - exact match for unit number
  const filteredInventory = inventory.filter(item => {
    // Unit number - EXACT match (case-insensitive)
    if (unitNumber && item.unit_number?.toLowerCase() !== unitNumber.toLowerCase()) return false;
    // Block filter - exact match
    if (searchBlock && item.block !== searchBlock) return false;
    // Area range filter
    if (areaMin && parseFloat(item.area_marla) < parseFloat(areaMin)) return false;
    if (areaMax && parseFloat(item.area_marla) > parseFloat(areaMax)) return false;
    // Rate range filter
    if (rateMin && parseFloat(item.rate_per_marla) < parseFloat(rateMin)) return false;
    if (rateMax && parseFloat(item.rate_per_marla) > parseFloat(rateMax)) return false;
    return true;
  });

  const clearAllFilters = () => {
    setUnitNumber('');
    setSearchBlock('');
    setAreaMin('');
    setAreaMax('');
    setRateMin('');
    setRateMax('');
    setFilter({ project_id: '', status: '' });
  };

  const hasActiveFilters = unitNumber || searchBlock || areaMin || areaMax || rateMin || rateMax || filter.project_id || filter.status;

  useEffect(() => { loadData(); }, [filter]);
  const loadData = async () => {
    try {
      const [invRes, projRes, sumRes] = await Promise.all([
        api.get('/inventory', { params: filter }),
        api.get('/projects'),
        api.get('/inventory/summary')
      ]);
      setInventory(invRes.data);
      setProjects(projRes.data);
      setSummary(sumRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try { await api.post('/inventory', form); setShowModal(false); setForm({ project_id: '', unit_number: '', unit_type: 'plot', block: '', area_marla: '', rate_per_marla: '', factor_details: '', notes: '' }); loadData(); }
    catch (e) { alert(e.response?.data?.detail || 'Error'); }
  };

  const handleImport = async () => {
    if (!importFile) return;
    const fd = new FormData(); fd.append('file', importFile);
    try { const res = await api.post('/inventory/bulk-import', fd); setImportResult(res.data); setImportFile(null); loadData(); }
    catch (e) { setImportResult({ success: 0, errors: [e.message] }); }
  };

  const openSellModal = (item) => { setSelectedItem(item); setShowSellModal(true); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold text-gray-900">Inventory</h2>
          <p className="text-sm text-gray-500 mt-1">{inventory.length} units</p></div>
        <button onClick={() => setShowModal(true)} className="bg-gray-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-800">Add Unit</button>
      </div>

      {summary && (
        <div className="grid grid-cols-3 gap-4">
          <SummaryCard label="Total Projects" value={summary.total_projects} />
          <SummaryCard label="Available Units" value={summary.total_available} sub={formatCurrency(summary.available_value)} />
          <SummaryCard label="Sold Units" value={summary.total_sold} sub={formatCurrency(summary.sold_value)} />
        </div>
      )}

      {/* Search & Filters Panel */}
      {/* Search Filters */}
      <div className="bg-white rounded-2xl shadow-sm border p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 items-end">
          {/* Unit # - Exact Match */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Unit #</label>
            <input
              type="text"
              placeholder="Exact unit#"
              value={unitNumber}
              onChange={e => setUnitNumber(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
          {/* Project */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Project</label>
            <select value={filter.project_id} onChange={e => setFilter({...filter, project_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {/* Block */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Block</label>
            <select value={searchBlock} onChange={e => setSearchBlock(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">All Blocks</option>
              {uniqueBlocks.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select value={filter.status} onChange={e => setFilter({...filter, status: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">All Status</option>
              <option value="available">Available</option>
              <option value="sold">Sold</option>
              <option value="reserved">Reserved</option>
            </select>
          </div>
          {/* Area Range */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Area (Marla)</label>
            <div className="flex items-center gap-1">
              <input type="number" placeholder="Min" value={areaMin} onChange={e => setAreaMin(e.target.value)} className="w-full border rounded-lg px-2 py-2 text-sm" step="0.5" min="0" />
              <span className="text-gray-400 text-xs">to</span>
              <input type="number" placeholder="Max" value={areaMax} onChange={e => setAreaMax(e.target.value)} className="w-full border rounded-lg px-2 py-2 text-sm" step="0.5" min="0" />
            </div>
          </div>
          {/* Rate Range */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Rate/Marla</label>
            <div className="flex items-center gap-1">
              <input type="number" placeholder="Min" value={rateMin} onChange={e => setRateMin(e.target.value)} className="w-full border rounded-lg px-2 py-2 text-sm" step="10000" min="0" />
              <span className="text-gray-400 text-xs">to</span>
              <input type="number" placeholder="Max" value={rateMax} onChange={e => setRateMax(e.target.value)} className="w-full border rounded-lg px-2 py-2 text-sm" step="10000" min="0" />
            </div>
          </div>
          {/* Clear Button */}
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button onClick={clearAllFilters} className="px-3 py-2 text-sm text-red-600 hover:text-red-800 font-medium whitespace-nowrap">
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* Quick Presets & Results */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          <div className="flex gap-2">
            <button onClick={() => { setAreaMin('5'); setAreaMax('7'); setFilter({...filter, status: 'available'}); }} className="px-3 py-1 text-xs bg-blue-50 text-blue-700 rounded-full hover:bg-blue-100">5-7 Marla Available</button>
            <button onClick={() => { setAreaMin('10'); setAreaMax(''); setFilter({...filter, status: 'available'}); }} className="px-3 py-1 text-xs bg-blue-50 text-blue-700 rounded-full hover:bg-blue-100">10+ Marla Available</button>
          </div>
          {hasActiveFilters && (
            <div className="text-sm text-gray-600">
              <span className="font-medium">{filteredInventory.length}</span> of {inventory.length} units
            </div>
          )}
        </div>
      </div>

      {loading ? <Loader /> : inventory.length === 0 ? <Empty msg="No inventory" /> : filteredInventory.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border p-12 text-center">
          <div className="text-gray-400 mb-2">No plots match your search criteria</div>
          <button onClick={clearAllFilters} className="text-sm text-blue-600 hover:text-blue-800">Clear all filters</button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">ID</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Project</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Unit</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Block</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4">Area</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4">Rate/Marla</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4">Total</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-6 py-4">Status</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4">Action</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {filteredInventory.map(i => (
                <tr key={i.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-mono text-gray-500">{i.inventory_id}</td>
                  <td className="px-6 py-4 text-sm">{i.project_name}</td>
                  <td className="px-6 py-4 text-sm font-medium">{i.unit_number}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{i.block || 'â€”'}</td>
                  <td className="px-6 py-4 text-sm text-right">{i.area_marla} M</td>
                  <td className="px-6 py-4 text-sm text-right">{formatCurrency(i.rate_per_marla)}</td>
                  <td className="px-6 py-4 text-sm text-right font-medium">{formatCurrency(i.total_value)}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${i.status === 'available' ? 'bg-green-50 text-green-700' : i.status === 'sold' ? 'bg-blue-50 text-blue-700' : 'bg-yellow-50 text-yellow-700'}`}>{i.status}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {i.status === 'available' && <button onClick={() => openSellModal(i)} className="text-sm text-blue-600 hover:text-blue-800 font-medium">Sell</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BulkImport entity="inventory" onImport={handleImport} importFile={importFile} setImportFile={setImportFile} importResult={importResult} />

      {showModal && (
        <Modal title="Add Unit" onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="block text-xs font-medium text-gray-500 mb-1">Project *</label>
              <select required value={form.project_id} onChange={e => setForm({...form, project_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">Select Project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Unit Number" required value={form.unit_number} onChange={e => setForm({...form, unit_number: e.target.value})} />
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                <select value={form.unit_type} onChange={e => setForm({...form, unit_type: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="plot">Plot</option><option value="shop">Shop</option><option value="house">House</option><option value="flat">Flat</option>
                </select>
              </div>
            </div>
            <Input label="Block" value={form.block} onChange={e => setForm({...form, block: e.target.value})} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Area (Marla)" type="number" step="0.01" required value={form.area_marla} onChange={e => setForm({...form, area_marla: e.target.value})} />
              <Input label="Rate/Marla" type="number" required value={form.rate_per_marla} onChange={e => setForm({...form, rate_per_marla: e.target.value})} />
            </div>
            <Input label="Factor Details" value={form.factor_details} onChange={e => setForm({...form, factor_details: e.target.value})} />
            <Input label="Notes" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg">Create</button>
            </div>
          </form>
        </Modal>
      )}

      {showSellModal && selectedItem && <SellModal item={selectedItem} onClose={() => setShowSellModal(false)} onSuccess={() => { setShowSellModal(false); loadData(); }} />}
    </div>
  );
}

// ============================================
// SELL MODAL (Create Transaction)
// ============================================
function SellModal({ item, onClose, onSuccess }) {
  const [customers, setCustomers] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [reps, setReps] = useState([]);
  const [form, setForm] = useState({
    customer_id: '', broker_id: '', company_rep_id: '',
    area_marla: item.area_marla, rate_per_marla: item.rate_per_marla,
    broker_commission_rate: 2, installment_cycle: 'bi-annual', num_installments: 4,
    first_due_date: '', booking_date: new Date().toISOString().split('T')[0], notes: ''
  });

  useEffect(() => {
    api.get('/customers').then(r => setCustomers(r.data));
    api.get('/brokers').then(r => setBrokers(r.data));
    api.get('/company-reps').then(r => setReps(r.data));
  }, []);

  const totalValue = (parseFloat(form.area_marla) || 0) * (parseFloat(form.rate_per_marla) || 0);
  const commission = totalValue * (parseFloat(form.broker_commission_rate) || 0) / 100;

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/transactions', { ...form, inventory_id: item.id });
      onSuccess();
    } catch (e) { alert(e.response?.data?.detail || 'Error'); }
  };

  return (
    <Modal title={`Sell ${item.unit_number}`} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><span className="text-gray-500">Project:</span> <span className="font-medium">{item.project_name}</span></div>
            <div><span className="text-gray-500">Unit:</span> <span className="font-medium">{item.unit_number}</span></div>
            <div><span className="text-gray-500">Block:</span> <span className="font-medium">{item.block || 'â€”'}</span></div>
          </div>
        </div>

        <EntityTaskWidget
          api={api}
          entityType="inventory"
          entityId={item.id}
          compact
        />

        <div><label className="block text-xs font-medium text-gray-500 mb-1">Customer *</label>
          <select required value={form.customer_id} onChange={e => setForm({...form, customer_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="">Select Customer</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.mobile})</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Broker</label>
            <select value={form.broker_id} onChange={e => { setForm({...form, broker_id: e.target.value, broker_commission_rate: brokers.find(b => b.id === e.target.value)?.commission_rate || 2}); }} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">No Broker</option>
              {brokers.map(b => <option key={b.id} value={b.id}>{b.name} ({b.commission_rate}%)</option>)}
            </select>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Company Rep</label>
            <select value={form.company_rep_id} onChange={e => setForm({...form, company_rep_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Select Rep</option>
              {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Input label="Area (Marla)" type="number" step="0.01" value={form.area_marla} onChange={e => setForm({...form, area_marla: e.target.value})} />
          <Input label="Rate/Marla" type="number" value={form.rate_per_marla} onChange={e => setForm({...form, rate_per_marla: e.target.value})} />
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Total Value</label>
            <div className="px-3 py-2 bg-gray-100 rounded-lg text-sm font-semibold">{formatCurrency(totalValue)}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Input label="Commission %" type="number" step="0.1" value={form.broker_commission_rate} onChange={e => setForm({...form, broker_commission_rate: e.target.value})} />
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Commission Amount</label>
            <div className="px-3 py-2 bg-gray-100 rounded-lg text-sm">{formatCurrency(commission)}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Installment Cycle</label>
            <select value={form.installment_cycle} onChange={e => setForm({...form, installment_cycle: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option>
              <option value="bi-annual">Bi-Annual</option><option value="annual">Annual</option>
            </select>
          </div>
          <Input label="# Installments" type="number" value={form.num_installments} onChange={e => setForm({...form, num_installments: e.target.value})} />
          <Input label="First Due Date" type="date" required value={form.first_due_date} onChange={e => setForm({...form, first_due_date: e.target.value})} />
        </div>

        <Input label="Booking Date" type="date" value={form.booking_date} onChange={e => setForm({...form, booking_date: e.target.value})} />
        <Input label="Notes" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />

        <div className="flex justify-end gap-3 pt-4 border-t">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
          <button type="submit" className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create Transaction</button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================
// TRANSACTIONS VIEW
// ============================================
function TransactionsView() {
  const [transactions, setTransactions] = useState([]);
  const [projects, setProjects] = useState([]);
  const [summary, setSummary] = useState(null);
  const [filter, setFilter] = useState({ project_id: '' });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedBroker, setSelectedBroker] = useState(null);
  const [customerDetails, setCustomerDetails] = useState(null);
  const [brokerDetails, setBrokerDetails] = useState(null);

  // Search filters - separate fields for precision
  const [customerName, setCustomerName] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [txnId, setTxnId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Filter transactions - exact match for unit# and txn ID, partial for customer
  const filteredTransactions = transactions.filter(t => {
    // Customer name - partial match (for discovery)
    if (customerName && !t.customer_name?.toLowerCase().includes(customerName.toLowerCase())) return false;
    // Unit number - EXACT match
    if (unitNumber && t.unit_number?.toLowerCase() !== unitNumber.toLowerCase()) return false;
    // Transaction ID - EXACT match (or starts with for partial ID entry)
    if (txnId && !t.transaction_id?.toLowerCase().startsWith(txnId.toLowerCase())) return false;
    // Status filter
    if (statusFilter && t.status !== statusFilter) return false;
    return true;
  });

  const clearFilters = () => {
    setCustomerName('');
    setUnitNumber('');
    setTxnId('');
    setStatusFilter('');
    setFilter({ project_id: '' });
  };

  const hasActiveFilters = customerName || unitNumber || txnId || statusFilter || filter.project_id;

  const loadCustomerDetails = async (customerId) => {
    try {
      const res = await api.get(`/customers/${customerId}/details`);
      setCustomerDetails(res.data);
      setSelectedCustomer(customerId);
    } catch (e) { alert('Error loading customer details'); }
  };

  const loadBrokerDetails = async (brokerId) => {
    try {
      const res = await api.get(`/brokers/${brokerId}/details`);
      setBrokerDetails(res.data);
      setSelectedBroker(brokerId);
    } catch (e) { alert('Error loading broker details'); }
  };

  useEffect(() => { loadData(); }, [filter]);
  const loadData = async () => {
    try {
      // Only pass params if they have values
      const params = {};
      if (filter.project_id) params.project_id = filter.project_id;
      
      const [txnRes, projRes, sumRes] = await Promise.all([
        api.get('/transactions'),
        api.get('/projects'),
        api.get('/transactions/summary', { params })
      ]);
      let txns = txnRes.data || [];
      if (filter.project_id) {
        const proj = projRes.data.find(p => p.id === filter.project_id);
        if (proj) txns = txns.filter(t => t.project_name === proj.name);
      }
      setTransactions(txns);
      setProjects(projRes.data || []);
      setSummary(sumRes.data);
    } catch (e) { console.error(e); setSummary({ total_transactions: 0, total_value: 0, this_month_count: 0, this_month_value: 0 }); }
    finally { setLoading(false); }
  };

  const handleImport = async () => {
    if (!importFile) return;
    const fd = new FormData(); fd.append('file', importFile);
    try { const res = await api.post('/transactions/bulk-import', fd); setImportResult(res.data); setImportFile(null); loadData(); }
    catch (e) { setImportResult({ success: 0, errors: [e.message] }); }
  };

  const viewDetails = async (t) => {
    try { const res = await api.get(`/transactions/${t.id}`); setSelectedTxn(res.data); }
    catch (e) { alert('Error loading details'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold text-gray-900">Transactions</h2>
          <p className="text-sm text-gray-500 mt-1">{transactions.length} sales</p></div>
        <button onClick={() => setShowModal(true)} className="bg-gray-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-800">Add Transaction</button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Total Transactions" value={summary.total_transactions} />
          <SummaryCard label="Total Value" value={formatCurrency(summary.total_value)} />
          <SummaryCard label="This Month" value={summary.this_month_count} />
          <SummaryCard label="This Month Value" value={formatCurrency(summary.this_month_value)} />
        </div>
      )}

      {/* Search Filters */}
      <div className="bg-white rounded-2xl shadow-sm border p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
          {/* Customer Name - partial match */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Customer</label>
            <input
              type="text"
              placeholder="Search name..."
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
          {/* Unit # - exact match */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Unit #</label>
            <input
              type="text"
              placeholder="Exact unit#"
              value={unitNumber}
              onChange={e => setUnitNumber(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
          {/* Transaction ID - exact/prefix match */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Transaction ID</label>
            <input
              type="text"
              placeholder="TX-001..."
              value={txnId}
              onChange={e => setTxnId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
          {/* Project */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Project</label>
            <select value={filter.project_id} onChange={e => setFilter({...filter, project_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          {/* Clear */}
          <div className="flex items-center">
            {hasActiveFilters && (
              <button onClick={clearFilters} className="px-3 py-2 text-sm text-red-600 hover:text-red-800 font-medium">
                Clear All
              </button>
            )}
          </div>
        </div>
        {hasActiveFilters && (
          <div className="mt-3 pt-3 border-t text-sm text-gray-600">
            <span className="font-medium">{filteredTransactions.length}</span> of {transactions.length} transactions
          </div>
        )}
      </div>

      {loading ? <Loader /> : transactions.length === 0 ? <Empty msg="No transactions yet" /> : filteredTransactions.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border p-12 text-center">
          <div className="text-gray-400 mb-2">No transactions match your search</div>
          <button onClick={clearFilters} className="text-sm text-blue-600 hover:text-blue-800">Clear filters</button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">ID</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Customer</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Project / Unit</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4">Total Value</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4">Paid</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4">Balance</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-6 py-4">Status</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4">Action</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {filteredTransactions.map(t => (
                <tr key={t.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => viewDetails(t)}>
                  <td className="px-6 py-4 text-sm font-mono text-gray-500">{t.transaction_id}</td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium">
                      {t.customer_id ? (
                        <button onClick={(e) => { e.stopPropagation(); loadCustomerDetails(t.customer_id); }} className="text-blue-600 hover:text-blue-800 hover:underline">
                          {t.customer_name}
                        </button>
                      ) : (
                        t.customer_name
                      )}
                    </div>
                    {t.broker_name && t.broker_id && (
                      <div className="text-xs text-gray-400">
                        via <button onClick={() => loadBrokerDetails(t.broker_id)} className="text-blue-600 hover:text-blue-800 hover:underline">{t.broker_name}</button>
                      </div>
                    )}
                    {t.broker_name && !t.broker_id && (
                      <div className="text-xs text-gray-400">via {t.broker_name}</div>
                    )}
                  </td>
                  <td className="px-6 py-4"><div className="text-sm">{t.project_name}</div><div className="text-xs text-gray-500">{t.unit_number}</div></td>
                  <td className="px-6 py-4 text-sm text-right font-medium">{formatCurrency(t.total_value)}</td>
                  <td className="px-6 py-4 text-sm text-right text-green-600">{formatCurrency(t.total_paid)}</td>
                  <td className="px-6 py-4 text-sm text-right text-amber-600">{formatCurrency(t.balance)}</td>
                  <td className="px-6 py-4 text-center"><span className={`px-2 py-1 rounded-full text-xs font-medium ${t.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{t.status}</span></td>
                  <td className="px-6 py-4 text-right"><button onClick={(e) => { e.stopPropagation(); viewDetails(t); }} className="text-sm text-blue-600 hover:text-blue-800">View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BulkImport entity="transactions" onImport={handleImport} importFile={importFile} setImportFile={setImportFile} importResult={importResult} />

      {showModal && <NewTransactionModal onClose={() => setShowModal(false)} onSuccess={() => { setShowModal(false); loadData(); }} />}
      {selectedTxn && <TransactionDetailModal txn={selectedTxn} onClose={() => setSelectedTxn(null)} onUpdate={loadData} />}
      
      {selectedCustomer && customerDetails && (
        <CustomerDetailModal 
          customer={customerDetails} 
          onClose={() => { setSelectedCustomer(null); setCustomerDetails(null); }} 
        />
      )}
      
      {selectedBroker && brokerDetails && (
        <BrokerDetailModal 
          broker={brokerDetails} 
          onClose={() => { setSelectedBroker(null); setBrokerDetails(null); }} 
        />
      )}
    </div>
  );
}

// ============================================
// NEW TRANSACTION MODAL (Searchable, Scalable)
// ============================================
function NewTransactionModal({ onClose, onSuccess }) {
  const [projects, setProjects] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [reps, setReps] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedInv, setSelectedInv] = useState(null);
  const [projectSearch, setProjectSearch] = useState('');
  const [unitSearch, setUnitSearch] = useState('');
  const [form, setForm] = useState({
    customer_id: '', broker_id: '', company_rep_id: '',
    area_marla: '', rate_per_marla: '',
    broker_commission_rate: 2, installment_cycle: 'bi-annual', num_installments: 4,
    first_due_date: '', booking_date: new Date().toISOString().split('T')[0], notes: ''
  });

  useEffect(() => {
    Promise.all([
      api.get('/projects'),
      api.get('/inventory/available'),
      api.get('/customers'),
      api.get('/brokers'),
      api.get('/company-reps')
    ]).then(([projRes, invRes, custRes, brkRes, repRes]) => {
      setProjects(projRes.data);
      setInventory(invRes.data);
      setCustomers(custRes.data);
      setBrokers(brkRes.data);
      setReps(repRes.data);
    });
  }, []);

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(projectSearch.toLowerCase()) &&
    inventory.some(i => i.project_id === p.id)
  );

  const filteredUnits = inventory.filter(i => 
    i.project_id === selectedProject &&
    (i.unit_number.toLowerCase().includes(unitSearch.toLowerCase()) || 
     (i.block && i.block.toLowerCase().includes(unitSearch.toLowerCase())))
  );

  const selectProject = (projectId) => {
    setSelectedProject(projectId);
    setSelectedInv(null);
    setUnitSearch('');
  };

  const selectUnit = (inv) => {
    setSelectedInv(inv);
    setForm({...form, area_marla: inv.area_marla, rate_per_marla: inv.rate_per_marla});
  };

  const totalValue = (parseFloat(form.area_marla) || 0) * (parseFloat(form.rate_per_marla) || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedInv) { alert('Select a unit'); return; }
    if (!form.customer_id) { alert('Select a customer'); return; }
    try {
      await api.post('/transactions', { ...form, inventory_id: selectedInv.id });
      onSuccess();
    } catch (e) { alert(e.response?.data?.detail || 'Error'); }
  };

  return (
    <Modal title="New Transaction" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Project Selection */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Project *</label>
            <input type="text" placeholder="Search projects..." value={projectSearch}
              onChange={e => setProjectSearch(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm mb-2" />
            <div className="border rounded-lg max-h-32 overflow-y-auto">
              {filteredProjects.length === 0 ? (
                <div className="p-3 text-sm text-gray-400 text-center">No projects with available units</div>
              ) : filteredProjects.map(p => (
                <button key={p.id} type="button" onClick={() => selectProject(p.id)}
                  className={`w-full text-left px-3 py-2 text-sm border-b last:border-0 ${selectedProject === p.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`}>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-gray-500">{inventory.filter(i => i.project_id === p.id).length} units available</div>
                </button>
              ))}
            </div>
          </div>

          {/* Unit Selection */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Unit *</label>
            <input type="text" placeholder="Search units..." value={unitSearch}
              onChange={e => setUnitSearch(e.target.value)}
              disabled={!selectedProject}
              className="w-full border rounded-lg px-3 py-2 text-sm mb-2 disabled:bg-gray-100" />
            <div className="border rounded-lg max-h-32 overflow-y-auto">
              {!selectedProject ? (
                <div className="p-3 text-sm text-gray-400 text-center">Select a project first</div>
              ) : filteredUnits.length === 0 ? (
                <div className="p-3 text-sm text-gray-400 text-center">No matching units</div>
              ) : filteredUnits.map(i => (
                <button key={i.id} type="button" onClick={() => selectUnit(i)}
                  className={`w-full text-left px-3 py-2 text-sm border-b last:border-0 ${selectedInv?.id === i.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`}>
                  <div className="font-medium">{i.unit_number} {i.block && `(${i.block})`}</div>
                  <div className="text-xs text-gray-500">{i.area_marla} Marla â€¢ {formatCurrency(i.rate_per_marla)}/M</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {selectedInv && (
          <>
            <div className="bg-blue-50 rounded-lg p-3 text-sm">
              <span className="font-medium">Selected:</span> {selectedInv.project_name} - {selectedInv.unit_number} 
              ({selectedInv.area_marla} Marla @ {formatCurrency(selectedInv.rate_per_marla)}/M = {formatCurrency(selectedInv.total_value)})
            </div>

            <div><label className="block text-xs font-medium text-gray-500 mb-1">Customer *</label>
              <select required value={form.customer_id} onChange={e => setForm({...form, customer_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">Select Customer</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.mobile})</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Broker</label>
                <select value={form.broker_id} onChange={e => setForm({...form, broker_id: e.target.value, broker_commission_rate: brokers.find(b => b.id === e.target.value)?.commission_rate || 2})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">No Broker</option>
                  {brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Company Rep</label>
                <select value={form.company_rep_id} onChange={e => setForm({...form, company_rep_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Select Rep</option>
                  {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Input label="Area (Marla)" type="number" step="0.01" value={form.area_marla} onChange={e => setForm({...form, area_marla: e.target.value})} />
              <Input label="Rate/Marla" type="number" value={form.rate_per_marla} onChange={e => setForm({...form, rate_per_marla: e.target.value})} />
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Total</label>
                <div className="px-3 py-2 bg-gray-100 rounded-lg text-sm font-semibold">{formatCurrency(totalValue)}</div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <Input label="Commission %" type="number" step="0.1" value={form.broker_commission_rate} onChange={e => setForm({...form, broker_commission_rate: e.target.value})} />
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Cycle</label>
                <select value={form.installment_cycle} onChange={e => setForm({...form, installment_cycle: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option>
                  <option value="bi-annual">Bi-Annual</option><option value="annual">Annual</option>
                </select>
              </div>
              <Input label="# Installments" type="number" value={form.num_installments} onChange={e => setForm({...form, num_installments: e.target.value})} />
              <Input label="First Due" type="date" required value={form.first_due_date} onChange={e => setForm({...form, first_due_date: e.target.value})} />
            </div>
          </>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
          <button type="submit" disabled={!selectedInv} className="px-6 py-2 text-sm bg-gray-900 text-white rounded-lg disabled:bg-gray-300">Create</button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================
// TRANSACTION DETAIL MODAL
// ============================================
function TransactionDetailModal({ txn, onClose, onUpdate }) {
  const [installments, setInstallments] = useState(txn.installments || []);
  const customerName = txn.customer_name || txn.customer?.name || 'â€”';
  const brokerName = txn.broker_name || txn.broker?.name || 'â€”';
  const projectName = txn.project_name || txn.project?.name || 'â€”';

  const updateInstallment = async (inst, field, value) => {
    try {
      await api.put(`/installments/${inst.id}`, { [field]: value });
      const res = await api.get(`/transactions/${txn.id}`);
      setInstallments(res.data.installments);
      onUpdate();
    } catch (e) { alert('Error updating'); }
  };

  return (
    <Modal title={`Transaction ${txn.transaction_id}`} onClose={onClose} wide>
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-6">
          <div><div className="text-xs text-gray-400">Customer</div><div className="font-medium">{customerName}</div></div>
          <div><div className="text-xs text-gray-400">Broker</div><div className="font-medium">{brokerName}</div></div>
          <div><div className="text-xs text-gray-400">Project / Unit</div><div className="font-medium">{projectName} - {txn.unit_number}</div></div>
          <div><div className="text-xs text-gray-400">Total Value</div><div className="font-semibold text-lg">{formatCurrency(txn.total_value)}</div></div>
        </div>

        <div className="border-t pt-4">
          <h4 className="text-sm font-semibold mb-3">Installments</h4>
          <table className="w-full text-sm">
            <thead><tr className="border-b">
              <th className="text-left py-2">#</th>
              <th className="text-left py-2">Due Date</th>
              <th className="text-right py-2">Amount</th>
              <th className="text-right py-2">Paid</th>
              <th className="text-right py-2">Balance</th>
              <th className="text-center py-2">Status</th>
            </tr></thead>
            <tbody>
              {installments.map(i => (
                <tr key={i.id} className="border-b">
                  <td className="py-2">{i.number}</td>
                  <td className="py-2"><input type="date" value={i.due_date} onChange={e => updateInstallment(i, 'due_date', e.target.value)} className="border rounded px-2 py-1 text-sm" /></td>
                  <td className="py-2 text-right"><input type="number" value={i.amount} onChange={e => updateInstallment(i, 'amount', e.target.value)} className="border rounded px-2 py-1 text-sm w-28 text-right" /></td>
                  <td className="py-2 text-right"><input type="number" value={i.amount_paid} onChange={e => updateInstallment(i, 'amount_paid', e.target.value)} className="border rounded px-2 py-1 text-sm w-28 text-right" /></td>
                  <td className="py-2 text-right font-medium">{formatCurrency(i.balance)}</td>
                  <td className="py-2 text-center"><span className={`px-2 py-1 rounded-full text-xs ${i.status === 'paid' ? 'bg-green-100 text-green-700' : i.status === 'partial' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100'}`}>{i.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t pt-4">
          <EntityTaskWidget
            api={api}
            entityType="transaction"
            entityId={txn.id}
            compact
          />
        </div>

        {/* Media Attachments */}
        <div className="border-t pt-4">
          <MediaManager 
            entityType="transaction" 
            entityId={txn.id || txn.transaction_id}
            onUpload={() => {}}
          />
        </div>
      </div>
    </Modal>
  );
}

// ============================================
// CUSTOMERS VIEW
// ============================================
function CustomersView() {
  const [subTab, setSubTab] = useState('pipeline');
  const role = getUserRole();
  const isAdminLike = ['admin', 'cco', 'manager'].includes(role);
  const canViewBrokerSubTab = role !== 'viewer';

  // Unified search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState('mobile');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);

  const handleUnifiedSearch = async () => {
    if (!searchQuery || searchQuery.length < 2) return;
    setSearching(true);
    try {
      const res = await api.get(`/search/unified?q=${encodeURIComponent(searchQuery)}&search_type=${searchType}`);
      setSearchResults(res.data.results);
    } catch (e) { console.error(e); }
    finally { setSearching(false); }
  };

  return (
    <div className="space-y-6">
      {/* Header with search */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Customers & Leads</h2>
          <p className="text-sm text-gray-500 mt-1">Unified customer and lead management</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={searchType} onChange={e => setSearchType(e.target.value)}
            className="px-3 py-2 text-sm border rounded-lg bg-white">
            <option value="mobile">Mobile</option>
            <option value="name">Name</option>
          </select>
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleUnifiedSearch()}
            placeholder="Search customers & leads..."
            className="px-3 py-2 text-sm border rounded-lg w-64" />
          <button onClick={handleUnifiedSearch} disabled={searching}
            className="bg-gray-900 text-white px-4 py-2 text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50">
            {searching ? '...' : 'Search'}
          </button>
        </div>
      </div>

      {/* Search Results Panel */}
      {searchResults && (
        <div className="bg-white rounded-2xl shadow-sm border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Search Results ({searchResults.length})</h3>
            <button onClick={() => setSearchResults(null)} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
          </div>
          {searchResults.length === 0 ? (
            <p className="text-sm text-gray-400">No matches found</p>
          ) : (
            <div className="space-y-2">
              {searchResults.map((r, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${r.type === 'customer' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                      {r.type}
                    </span>
                    <div>
                      <div className="text-sm font-medium">{r.name}</div>
                      <div className="text-xs text-gray-500">{r.entity_id} {r.mobile && `| ${r.mobile}`}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    {r.owner_rep && <div className="text-xs text-gray-500">Assigned to: <span className="font-medium">{r.owner_rep}</span></div>}
                    {r.pipeline_stage && <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">{r.pipeline_stage}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button onClick={() => setSubTab('pipeline')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${subTab === 'pipeline' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
          Leads
        </button>
        <button onClick={() => setSubTab('customers')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${subTab === 'customers' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
          Customers
        </button>
        {canViewBrokerSubTab && (
          <button onClick={() => setSubTab('brokers')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${subTab === 'brokers' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            Brokers
          </button>
        )}
      </div>

      {subTab === 'pipeline' && <PipelineView />}
      {subTab === 'customers' && <CustomerTableView />}
      {canViewBrokerSubTab && subTab === 'brokers' && <BrokersView />}
    </div>
  );
}

// ============================================
// LEADS VIEW (Lead Pipeline)
// ============================================
function PipelineView() {
  const [pipelineData, setPipelineData] = useState(null);
  const [stages, setStages] = useState([]);
  const [projects, setProjects] = useState([]);
  const [lookupValues, setLookupValues] = useState({
    [LOOKUP_KEYS.CUSTOMER_SOURCE]: [],
    [LOOKUP_KEYS.CUSTOMER_OCCUPATION]: []
  });
  const [activeStage, setActiveStage] = useState('all');
  const [loading, setLoading] = useState(true);
  const [repFilter, setRepFilter] = useState('');
  const [reps, setReps] = useState([]);
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [assignRepId, setAssignRepId] = useState('');
  const [showLeadDetail, setShowLeadDetail] = useState(null);
  const [logTarget, setLogTarget] = useState(null);
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [leadSubView, setLeadSubView] = useState('main');
  const [leadFollowupMap, setLeadFollowupMap] = useState({});
  const [newLeadForm, setNewLeadForm] = useState(emptyEnhancedLead);
  const [leadSearch, setLeadSearch] = useState('');
  const [leadSearchInput, setLeadSearchInput] = useState('');
  const [leadPage, setLeadPage] = useState(1);
  const [leadPageSize] = useState(50);
  const role = getUserRole();
  const isAdminLike = ['admin', 'cco', 'manager'].includes(role);

  useEffect(() => { loadPipeline(); loadReps(); loadLeadMeta(); }, [repFilter, activeStage, leadSearch, leadPage]);
  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => { setLeadSearch(leadSearchInput); setLeadPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [leadSearchInput]);
  const loadPipeline = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (repFilter) params.append('rep_id', repFilter);
      if (leadSearch) params.append('search', leadSearch);
      if (activeStage && activeStage !== 'all') params.append('stage', activeStage);
      params.append('page', leadPage);
      params.append('page_size', leadPageSize);
      const [res, intRes] = await Promise.all([
        api.get(`/leads/pipeline?${params}`),
        api.get('/interactions', { params: { limit: 500 } }).catch(() => ({ data: [] }))
      ]);
      setPipelineData(res.data);
      const nextMap = {};
      (intRes.data || []).forEach((interaction) => {
        if (!interaction?.lead_id) return;
        const leadKey = interaction.lead_id;
        const prev = nextMap[leadKey] || {};
        const currentCreated = interaction.created_at ? new Date(interaction.created_at).getTime() : 0;
        const prevCreated = prev.lastInteractionAt ? new Date(prev.lastInteractionAt).getTime() : 0;
        const isNewer = currentCreated >= prevCreated;
        nextMap[leadKey] = {
          lastInteractionAt: isNewer ? interaction.created_at : prev.lastInteractionAt,
          nextFollowUp: isNewer ? interaction.next_follow_up : prev.nextFollowUp
        };
      });
      setLeadFollowupMap(nextMap);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  const loadReps = async () => {
    try { const res = await api.get('/company-reps'); setReps(res.data); } catch (e) { /* silent */ }
  };
  const loadLeadMeta = async () => {
    try {
      const [projRes, stgRes, lookupRes] = await Promise.all([
        api.get('/projects').catch(() => ({ data: [] })),
        api.get('/pipeline-stages').catch(() => ({ data: [] })),
        fetchLookupValues(api, [LOOKUP_KEYS.CUSTOMER_SOURCE, LOOKUP_KEYS.CUSTOMER_OCCUPATION])
      ]);
      setProjects(projRes.data || []);
      setStages(stgRes.data || []);
      setLookupValues(lookupRes);
    } catch (e) {
      console.error(e);
    }
  };

  const handleBulkAssign = async () => {
    if (!selectedLeads.length || !assignRepId) return;
    try {
      await api.post('/leads/bulk-assign', { lead_ids: selectedLeads, rep_id: assignRepId });
      if (window.showToast) window.showToast('Leads Assigned', `${selectedLeads.length} leads assigned`, 'success');
      setSelectedLeads([]); setAssignRepId(''); loadPipeline();
    } catch (e) { if (window.showToast) window.showToast('Error', e.response?.data?.detail || 'Assignment failed', 'error'); }
  };

  const handleStageChange = async (leadId, newStage) => {
    const terminalStages = allStages.filter(s => s.is_terminal).map(s => s.stage);
    if (terminalStages.includes(newStage)) {
      if (!confirm(`Moving to "${newStage}" will remove this lead from the active pipeline. Continue?`)) return;
    }
    try {
      await api.put(`/leads/${leadId}/stage`, { stage: newStage });
      loadPipeline();
    } catch (e) { if (window.showToast) window.showToast('Error', e.response?.data?.detail || 'Failed', 'error'); }
  };
  const handleAddLead = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...newLeadForm,
        additional_mobiles: (newLeadForm.additional_mobiles || []).map(v => String(v || '').trim()).filter(Boolean)
      };
      await api.post('/leads', payload);
      setShowAddLeadModal(false);
      setNewLeadForm(emptyEnhancedLead);
      loadPipeline();
      if (window.showToast) window.showToast('Lead Created', 'Lead added to pipeline', 'success');
    } catch (e2) {
      if (window.showToast) window.showToast('Error', e2.response?.data?.detail || 'Failed to create lead', 'error');
    }
  };
  const updateMobile = (index, value) => {
    const mobiles = [...(newLeadForm.additional_mobiles || ['', '', '', ''])];
    mobiles[index] = value;
    setNewLeadForm({...newLeadForm, additional_mobiles: mobiles});
  };

  const allStages = pipelineData?.pipeline || [];
  const displayLeads = pipelineData?.leads || [];
  const filteredTotal = pipelineData?.filtered_total || 0;
  const totalPages = pipelineData?.total_pages || 1;

  return (
    <div className="space-y-4">
      {/* Filters row */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => setShowAddLeadModal(true)} className="px-3 py-2 text-sm rounded-lg bg-gray-900 text-white hover:bg-gray-800">+ Add Lead</button>
        {isAdminLike && (
          <select value={repFilter} onChange={e => { setRepFilter(e.target.value); setLeadPage(1); setLoading(true); }}
            className="px-3 py-2 text-sm border rounded-lg bg-white">
            <option value="">All Reps</option>
            {reps.map(r => <option key={r.id} value={r.rep_id}>{r.name}</option>)}
          </select>
        )}
        {/* Bulk assign */}
        {isAdminLike && selectedLeads.length > 0 && (
          <div className="flex items-center gap-2 ml-auto bg-blue-50 px-3 py-1.5 rounded-lg">
            <span className="text-sm text-blue-700 font-medium">{selectedLeads.length} selected</span>
            <select value={assignRepId} onChange={e => setAssignRepId(e.target.value)}
              className="px-2 py-1 text-sm border rounded bg-white">
              <option value="">Assign to...</option>
              {reps.map(r => <option key={r.id} value={r.rep_id}>{r.name}</option>)}
            </select>
            <button onClick={handleBulkAssign} disabled={!assignRepId}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">Assign</button>
            <button onClick={() => setSelectedLeads([])} className="text-xs text-blue-500 hover:text-blue-700">Clear</button>
          </div>
        )}
      </div>

      {/* Stage tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2">
        <button onClick={() => { setActiveStage('all'); setLeadPage(1); }}
          className={`px-3 py-1.5 text-sm font-medium rounded-full whitespace-nowrap transition-all ${activeStage === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          All ({pipelineData?.total || 0})
        </button>
        {allStages.map(s => (
          <button key={s.stage} onClick={() => { setActiveStage(s.stage); setLeadPage(1); }}
            className={`px-3 py-1.5 text-sm font-medium rounded-full whitespace-nowrap transition-all flex items-center gap-1.5 ${activeStage === s.stage ? 'text-white' : 'text-gray-600 hover:bg-gray-200'}`}
            style={activeStage === s.stage ? { backgroundColor: s.color } : { backgroundColor: '#f3f4f6' }}>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }}></span>
            {s.stage} ({s.count})
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <input type="text" placeholder="Search leads by name, mobile, ID, email..." value={leadSearchInput}
            onChange={e => setLeadSearchInput(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 pl-9 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400" />
          <svg className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
        <span className="text-xs text-gray-500">{filteredTotal} leads{leadSearch ? ` matching "${leadSearch}"` : ''}</span>
      </div>

      <div>
        {loading ? <Loader /> : displayLeads.length === 0 ? <Empty msg="No leads found for selected view" /> : (
          <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {isAdminLike && <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Select</th>}
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Lead ID</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Lead Name</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Last Interaction</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Source</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Allocated To</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {displayLeads.map(lead => {
                  const stageInfo = allStages.find(s => s.stage === lead.pipeline_stage);
                  const contactNumbers = [lead.mobile, ...(lead.additional_mobiles || [])].filter(Boolean);
                  const lastInteractionAt = leadFollowupMap[lead.lead_id]?.lastInteractionAt;
                  const lastInteractionText = lastInteractionAt
                    ? new Date(lastInteractionAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
                    : lead.days_since_contact !== null
                      ? `${lead.days_since_contact}d ago`
                      : 'No interaction';
                  return (
                    <tr key={lead.id} className="hover:bg-gray-50">
                      {isAdminLike && (
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={selectedLeads.includes(lead.id)}
                            onChange={e => setSelectedLeads(prev => e.target.checked ? [...prev, lead.id] : prev.filter(x => x !== lead.id))}
                            className="rounded" />
                        </td>
                      )}
                      <td className="px-4 py-3 text-sm font-mono text-gray-600">{lead.lead_id}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => setShowLeadDetail(lead)} className="text-left">
                          <div className="text-sm font-medium text-gray-900 hover:text-blue-600">{lead.name}</div>
                          <div className="text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">
                            {contactNumbers.length > 0 && <span>{contactNumbers.join(' | ')}</span>}
                            {lead.temperature && (
                              <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-medium ${getTemperatureBadgeClass(lead.temperature)}`}>
                                {lead.temperature}
                              </span>
                            )}
                          </div>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{lastInteractionText}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{lead.source || lead.campaign_name || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{lead.assigned_rep || 'Unassigned'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => setLogTarget({
                              id: lead.id,
                              entity_type: 'lead',
                              name: lead.name,
                              mobile: lead.mobile,
                              additional_mobiles: lead.additional_mobiles || [],
                              temperature: lead.temperature,
                              defaultRepId: lead.assigned_rep_id || ''
                            })}
                            className="py-1 px-2 text-xs border rounded-lg hover:bg-blue-50 text-blue-600"
                          >
                            Log
                          </button>
                          <select value={lead.pipeline_stage} onChange={e => handleStageChange(lead.id, e.target.value)}
                            className="px-2 py-1 text-xs border rounded-lg bg-white"
                            style={{ borderColor: stageInfo?.color || '#d1d5db' }}>
                            {allStages.map(s => <option key={s.stage} value={s.stage}>{s.stage}</option>)}
                          </select>
                          {role === 'admin' && (
                            <button onClick={() => { if (confirm(`Delete lead "${lead.name}"?`)) api.delete(`/leads/${lead.id}`).then(() => loadPipeline()).catch(e => window.showToast?.('Error', e.response?.data?.detail || 'Delete failed', 'error')); }}
                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete lead">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-3 px-1">
            <span className="text-xs text-gray-500">
              Page {leadPage} of {totalPages} ({filteredTotal} leads)
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setLeadPage(1)} disabled={leadPage <= 1}
                className="px-2 py-1 text-xs border rounded hover:bg-gray-50 disabled:opacity-30">First</button>
              <button onClick={() => setLeadPage(p => Math.max(1, p - 1))} disabled={leadPage <= 1}
                className="px-2 py-1 text-xs border rounded hover:bg-gray-50 disabled:opacity-30">Prev</button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pg;
                if (totalPages <= 5) pg = i + 1;
                else if (leadPage <= 3) pg = i + 1;
                else if (leadPage >= totalPages - 2) pg = totalPages - 4 + i;
                else pg = leadPage - 2 + i;
                return (
                  <button key={pg} onClick={() => setLeadPage(pg)}
                    className={`px-2.5 py-1 text-xs border rounded ${pg === leadPage ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'}`}>{pg}</button>
                );
              })}
              <button onClick={() => setLeadPage(p => Math.min(totalPages, p + 1))} disabled={leadPage >= totalPages}
                className="px-2 py-1 text-xs border rounded hover:bg-gray-50 disabled:opacity-30">Next</button>
              <button onClick={() => setLeadPage(totalPages)} disabled={leadPage >= totalPages}
                className="px-2 py-1 text-xs border rounded hover:bg-gray-50 disabled:opacity-30">Last</button>
            </div>
          </div>
        )}
      </div>

      {/* Lead Detail Modal */}
      {logTarget && (
        <QuickLogModal
          entity={logTarget}
          defaultRepId={logTarget.defaultRepId}
          onClose={() => setLogTarget(null)}
          onSuccess={() => {
            setLogTarget(null);
            loadPipeline();
            if (window.showToast) window.showToast('Logged', 'Interaction recorded', 'success');
          }}
        />
      )}
      {showLeadDetail && <LeadDetailModal lead={showLeadDetail} onClose={() => { setShowLeadDetail(null); loadPipeline(); }}
        stages={allStages} reps={reps} />}
      {showAddLeadModal && (
        <Modal title="Add Lead" onClose={() => setShowAddLeadModal(false)}>
          <form onSubmit={handleAddLead} className="space-y-4">
            <Input label="Name" required value={newLeadForm.name} onChange={e => setNewLeadForm({...newLeadForm, name: e.target.value})} />
            <div className="grid grid-cols-2 gap-4">
              <PhoneInput label="Mobile" value={newLeadForm.mobile} onChange={value => setNewLeadForm({...newLeadForm, mobile: value})} />
              <Input label="Email" type="email" value={newLeadForm.email} onChange={e => setNewLeadForm({...newLeadForm, email: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Additional Mobile 1" value={newLeadForm.additional_mobiles[0] || ''} onChange={e => updateMobile(0, e.target.value)} />
              <Input label="Additional Mobile 2" value={newLeadForm.additional_mobiles[1] || ''} onChange={e => updateMobile(1, e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Additional Mobile 3" value={newLeadForm.additional_mobiles[2] || ''} onChange={e => updateMobile(2, e.target.value)} />
              <Input label="Additional Mobile 4" value={newLeadForm.additional_mobiles[3] || ''} onChange={e => updateMobile(3, e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
                <select value={newLeadForm.source} onChange={e => setNewLeadForm({...newLeadForm, source: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">Select source</option>
                  {(lookupValues[LOOKUP_KEYS.CUSTOMER_SOURCE] || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Occupation</label>
                <select value={newLeadForm.occupation} onChange={e => setNewLeadForm({...newLeadForm, occupation: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">Select occupation</option>
                  {(lookupValues[LOOKUP_KEYS.CUSTOMER_OCCUPATION] || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
            </div>
            {newLeadForm.source === 'Other' && <Input label="Source (Other)" value={newLeadForm.source_other} onChange={e => setNewLeadForm({...newLeadForm, source_other: e.target.value})} />}
            {newLeadForm.occupation === 'Other' && <Input label="Occupation (Other)" value={newLeadForm.occupation_other} onChange={e => setNewLeadForm({...newLeadForm, occupation_other: e.target.value})} />}
            <div className="grid grid-cols-2 gap-4">
              <Input label="Area" value={newLeadForm.area} onChange={e => setNewLeadForm({...newLeadForm, area: e.target.value})} />
              <Input label="City" value={newLeadForm.city} onChange={e => setNewLeadForm({...newLeadForm, city: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Interested Project</label>
                <select value={newLeadForm.interested_project_id} onChange={e => setNewLeadForm({...newLeadForm, interested_project_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">Select project</option>
                  <option value="other">Other</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Assign to Rep</label>
                <select value={newLeadForm.assigned_rep_id} onChange={e => setNewLeadForm({...newLeadForm, assigned_rep_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">Unassigned</option>
                  {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>
            {newLeadForm.interested_project_id === 'other' && (
              <Input label="Interested Project (Other)" value={newLeadForm.interested_project_other} onChange={e => setNewLeadForm({...newLeadForm, interested_project_other: e.target.value})} />
            )}
            <Input label="Notes" value={newLeadForm.notes} onChange={e => setNewLeadForm({...newLeadForm, notes: e.target.value})} />
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowAddLeadModal(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg">Create</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ============================================
// LEAD DETAIL MODAL
// ============================================
function LeadDetailModal({ lead, onClose, stages, reps }) {
  const [interactions, setInteractions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLogForm, setShowLogForm] = useState(false);
  const [logForm, setLogForm] = useState({ interaction_type: 'call', status: getDefaultInteractionStatus('call'), notes: '', next_follow_up: '', contact_number: '' });
  const [currentStage, setCurrentStage] = useState(lead.pipeline_stage);
  const role = getUserRole();
  const isAdminLike = ['admin', 'cco', 'manager'].includes(role);
  const canRunSyncActions = ['admin', 'director', 'cco', 'coo', 'manager'].includes(role);
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const contactNumbers = [lead.mobile, ...(lead.additional_mobiles || [])].filter(Boolean);

  useEffect(() => { loadInteractions(); }, []);
  const loadInteractions = async () => {
    try { const res = await api.get(`/interactions?lead_id=${lead.lead_id}&limit=50`); setInteractions(res.data); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleStageChange = async (newStage) => {
    const terminalStages = stages.filter(s => s.is_terminal).map(s => s.stage);
    if (terminalStages.includes(newStage)) {
      if (!confirm(`Moving to "${newStage}" will remove this lead from the active pipeline. Continue?`)) return;
    }
    try {
      await api.put(`/leads/${lead.id}/stage`, { stage: newStage });
      setCurrentStage(newStage);
      if (window.showToast) window.showToast('Stage Updated', `Lead moved to ${newStage}`, 'success');
    } catch (e) { if (window.showToast) window.showToast('Error', e.response?.data?.detail || 'Failed', 'error'); }
  };

  const handleLogInteraction = async (e) => {
    e.preventDefault();
    try {
      await api.post('/interactions', {
        company_rep_id: currentUser.id,
        lead_id: lead.lead_id,
        interaction_type: logForm.interaction_type,
        status: logForm.status || null,
        notes: logForm.notes,
        contact_number: logForm.contact_number || null,
        next_follow_up: logForm.next_follow_up || null
      });
      setShowLogForm(false); setLogForm({ interaction_type: 'call', status: getDefaultInteractionStatus('call'), notes: '', next_follow_up: '', contact_number: '' });
      loadInteractions();
      if (window.showToast) window.showToast('Logged', 'Interaction recorded', 'success');
    } catch (e) { if (window.showToast) window.showToast('Error', e.response?.data?.detail || 'Failed', 'error'); }
  };

  const handleConvert = async (convertTo) => {
    if (!confirm(`Sync "${lead.name}" to ${convertTo} database?`)) return;
    try {
      const res = await api.post(`/leads/${lead.id}/convert`, { convert_to: convertTo });
      const msg = res.data.linked_existing
        ? `Linked to existing ${convertTo} (${res.data.entity_id})`
        : `New ${convertTo} created (${res.data.entity_id})`;
      if (window.showToast) window.showToast('Synced', msg, 'success');
      onClose(); // Refresh pipeline
    } catch (e) { if (window.showToast) window.showToast('Error', e.response?.data?.detail || 'Failed', 'error'); }
  };

  const handleRequestAssignment = async () => {
    const reason = prompt('Why do you want this lead assigned to you?');
    if (reason === null) return;
    try {
      await api.post(`/leads/${lead.id}/request-assignment`, { reason });
      if (window.showToast) window.showToast('Requested', 'Assignment request submitted', 'success');
    } catch (e) { if (window.showToast) window.showToast('Error', e.response?.data?.detail || 'Failed', 'error'); }
  };

  const handleRequestCustomerSync = async () => {
    const reason = prompt('Why do you want to sync this lead to Customer DB?');
    if (reason === null) return;
    try {
      await api.post(`/leads/${lead.id}/request-customer-sync`, { reason });
      if (window.showToast) window.showToast('Requested', 'Customer sync request submitted for approval', 'success');
    } catch (e) {
      if (window.showToast) window.showToast('Error', e.response?.data?.detail || 'Failed', 'error');
    }
  };

  return (
    <Modal title={`Lead: ${lead.name}`} onClose={onClose} wide>
      <div className="space-y-5">
        {/* Lead info */}
        <div className="grid grid-cols-2 gap-3 bg-gray-50 p-4 rounded-lg text-sm">
          <div><span className="text-xs text-gray-500 block">Lead ID</span><span className="font-mono">{lead.lead_id}</span></div>
          <div><span className="text-xs text-gray-500 block">Mobile</span>{contactNumbers.length ? contactNumbers.join(' | ') : 'N/A'}</div>
          <div><span className="text-xs text-gray-500 block">Email</span>{lead.email || 'N/A'}</div>
          <div><span className="text-xs text-gray-500 block">Campaign</span>{lead.campaign_name || 'Direct'}</div>
          <div><span className="text-xs text-gray-500 block">Assigned Rep</span>{lead.assigned_rep || 'Unassigned'}</div>
          <div><span className="text-xs text-gray-500 block">Temperature</span>{lead.temperature ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getTemperatureBadgeClass(lead.temperature)}`}>{lead.temperature}</span> : 'N/A'}</div>
          <div><span className="text-xs text-gray-500 block">Created</span>{new Date(lead.created_at).toLocaleDateString()}</div>
        </div>

        {/* Lead stage selector */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2">Lead Stage</label>
          <div className="flex gap-1 flex-wrap">
            {stages.map(s => (
              <button key={s.stage} onClick={() => handleStageChange(s.stage)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${currentStage === s.stage ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                style={currentStage === s.stage ? { backgroundColor: s.color } : {}}>
                {s.stage}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowLogForm(!showLogForm)}
            className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800">
            Log Interaction
          </button>
          {canRunSyncActions && lead.converted_customer_id ? (
            <span className="px-3 py-1.5 text-sm bg-green-50 text-green-700 rounded-lg border border-green-200">Synced to Customer DB</span>
          ) : canRunSyncActions ? (
            <button onClick={() => handleConvert('customer')}
              className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
              Sync to Customer DB
            </button>
          ) : null}
          {!canRunSyncActions && !lead.converted_customer_id && role !== 'viewer' && (
            <button onClick={handleRequestCustomerSync}
              className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
              Request Sync to Customer
            </button>
          )}
          {canRunSyncActions && lead.converted_broker_id ? (
            <span className="px-3 py-1.5 text-sm bg-purple-50 text-purple-700 rounded-lg border border-purple-200">Synced to Broker DB</span>
          ) : canRunSyncActions ? (
            <button onClick={() => handleConvert('broker')}
              className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700">
              Sync to Broker DB
            </button>
          ) : null}
          {role !== 'viewer' && lead.assigned_rep_id !== currentUser.rep_id && (
            <button onClick={handleRequestAssignment}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Request Assignment
            </button>
          )}
        </div>

        {/* Log interaction form */}
        {showLogForm && (
          <form onSubmit={handleLogInteraction} className="bg-blue-50 p-4 rounded-lg space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <select value={logForm.interaction_type} onChange={e => setLogForm({...logForm, interaction_type: e.target.value, status: getDefaultInteractionStatus(e.target.value)})}
                className="px-3 py-2 text-sm border rounded-lg bg-white">
                {INTERACTION_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select value={logForm.status} onChange={e => setLogForm({...logForm, status: e.target.value})}
                className="px-3 py-2 text-sm border rounded-lg bg-white">
                {getInteractionStatusOptions(logForm.interaction_type).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div>
              <input type="date" value={logForm.next_follow_up} onChange={e => setLogForm({...logForm, next_follow_up: e.target.value})}
                className="px-3 py-2 text-sm border rounded-lg" placeholder="Follow-up date" />
            </div>
            {contactNumbers.length > 1 && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Spoke On Number (Optional)</label>
                <select value={logForm.contact_number} onChange={e => setLogForm({...logForm, contact_number: e.target.value})}
                  className="w-full px-3 py-2 text-sm border rounded-lg bg-white">
                  <option value="">Select number</option>
                  {contactNumbers.map(num => <option key={num} value={num}>{num}</option>)}
                </select>
              </div>
            )}
            <textarea value={logForm.notes} onChange={e => setLogForm({...logForm, notes: e.target.value})}
              placeholder="Notes..." rows={2} className="w-full px-3 py-2 text-sm border rounded-lg" />
            <div className="flex gap-2">
              <button type="submit" className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg">Save</button>
              <button type="button" onClick={() => setShowLogForm(false)} className="px-3 py-1.5 text-sm text-gray-600">Cancel</button>
            </div>
          </form>
        )}

        {/* Interaction history */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Interaction History</h4>
          {loading ? <Loader /> : interactions.length === 0 ? (
            <p className="text-sm text-gray-400">No interactions yet</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {interactions.map(i => (
                <div key={i.id} className="flex items-start gap-3 p-2 bg-gray-50 rounded-lg text-sm">
                  <span className={`px-2 py-0.5 text-xs rounded-full font-medium mt-0.5 ${
                    i.interaction_type === 'call' ? 'bg-green-100 text-green-700' :
                    i.interaction_type === 'whatsapp' ? 'bg-emerald-100 text-emerald-700' :
                    i.interaction_type === 'meeting' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>{formatInteractionType(i.interaction_type, i.status)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-gray-700">{i.notes || 'No notes'}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {i.rep_name} | {new Date(i.created_at).toLocaleString()}
                      {i.next_follow_up && ` | Follow-up: ${i.next_follow_up}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ============================================
// CUSTOMER TABLE VIEW (sub-tab of Customers & Leads)
// ============================================
function CustomerTableView() {
  const emptyCustomerForm = {
    name: '', mobile: '', address: '', cnic: '', email: '',
    source: '', source_other: '', occupation: '', occupation_other: '',
    interested_project_id: '', interested_project_other: '', area: '', city: '',
    country_code: '+92', notes: '', additional_mobiles: ['', '', '', '']
  };
  const [customers, setCustomers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [lookupValues, setLookupValues] = useState({
    [LOOKUP_KEYS.CUSTOMER_SOURCE]: [],
    [LOOKUP_KEYS.CUSTOMER_OCCUPATION]: []
  });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyCustomerForm);
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [showDetail, setShowDetail] = useState(null);
  const [logTarget, setLogTarget] = useState(null); // for quick interaction logging
  const role = getUserRole();
  const canCreateCustomers = role !== 'user';

  useEffect(() => { loadCustomers(); }, []);
  const loadCustomers = async () => {
    try {
      const [custRes, projRes, lookupRes] = await Promise.all([
        api.get('/customers'),
        api.get('/projects').catch(() => ({ data: [] })),
        fetchLookupValues(api, [LOOKUP_KEYS.CUSTOMER_SOURCE, LOOKUP_KEYS.CUSTOMER_OCCUPATION])
      ]);
      setCustomers(custRes.data || []);
      setProjects(projRes.data || []);
      setLookupValues(lookupRes);
    }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canCreateCustomers && !editing) {
      if (window.showToast) window.showToast('Access Restricted', 'Sales reps can add leads only.', 'warning');
      return;
    }
    try {
      const payload = {
        ...form,
        additional_mobiles: (form.additional_mobiles || []).map(v => String(v || '').trim()).filter(Boolean)
      };
      const res = editing ? await api.put(`/customers/${editing.id}`, payload) : await api.post('/customers', payload);
      if (res.data?.warnings?.length) {
        if (window.showToast) res.data.warnings.forEach(w => window.showToast('Duplicate Warning', w, 'warning'));
      }
      setShowModal(false); setEditing(null); setForm(emptyCustomerForm); loadCustomers();
    } catch (e) {
      if (window.showToast) window.showToast('Error', e.response?.data?.detail || 'Error', 'error');
      else alert(e.response?.data?.detail || 'Error');
    }
  };

  const handleDelete = async (c) => {
    const role = getUserRole();
    if (role === 'creator') { if (window.showToast) window.showToast('Error', 'Creator role cannot delete records', 'error'); return; }
    if (role === 'admin') {
      if (!confirm(`Delete "${c.name}"?`)) return;
      try { await api.delete(`/customers/${c.id}`); loadCustomers(); }
      catch (e) { if (window.showToast) window.showToast('Error', e.response?.data?.detail || 'Error', 'error'); }
    } else {
      const reason = prompt(`Request deletion of "${c.name}"?\nProvide a reason:`);
      if (reason === null) return;
      try {
        const res = await api.delete(`/customers/${c.id}`, { data: { reason } });
        if (res.data.pending) {
          if (window.showToast) window.showToast('Submitted', `Deletion request ${res.data.request_id} submitted`, 'info');
        } else { loadCustomers(); }
      } catch (e) { if (window.showToast) window.showToast('Error', e.response?.data?.detail || 'Error', 'error'); }
    }
  };

  const openEdit = (c) => {
    const additionalMobiles = [...(c.additional_mobiles || []), '', '', '', ''].slice(0, 4);
    setEditing(c);
    setForm({
      name: c.name || '',
      mobile: c.mobile || '',
      address: c.address || '',
      cnic: c.cnic || '',
      email: c.email || '',
      source: c.source || '',
      source_other: c.source_other || '',
      occupation: c.occupation || '',
      occupation_other: c.occupation_other || '',
      interested_project_id: c.interested_project_id || '',
      interested_project_other: c.interested_project_other || '',
      area: c.area || '',
      city: c.city || '',
      country_code: c.country_code || '+92',
      notes: c.notes || '',
      additional_mobiles: additionalMobiles
    });
    setShowModal(true);
  };

  const handleImport = async () => {
    if (!canCreateCustomers) return;
    if (!importFile) return;
    const fd = new FormData(); fd.append('file', importFile);
    try { const res = await api.post('/customers/bulk-import', fd); setImportResult(res.data); setImportFile(null); loadCustomers(); }
    catch (e) { setImportResult({ success: 0, errors: [e.message] }); }
  };

  const viewDetail = async (c) => {
    try { const res = await api.get(`/customers/${c.id}/details`); setShowDetail(res.data); }
    catch (e) { console.error(e); }
  };
  const updateMobile = (index, value) => {
    const mobiles = [...(form.additional_mobiles || ['', '', '', ''])];
    mobiles[index] = value;
    setForm({...form, additional_mobiles: mobiles});
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{customers.length} customers</p>
        {canCreateCustomers ? (
          <button onClick={() => { setEditing(null); setForm(emptyCustomerForm); setShowModal(true); }}
            className="bg-gray-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-800">Add Customer</button>
        ) : (
          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">Sales reps can add leads only</span>
        )}
      </div>

      {loading ? <Loader /> : customers.length === 0 ? <Empty msg="No customers" /> : (
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">ID</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Name</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Mobile</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Source</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">City</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">CNIC</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {customers.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-mono text-gray-500">{c.customer_id}</td>
                  <td className="px-6 py-4 cursor-pointer" onClick={() => viewDetail(c)}>
                    <div className="text-sm font-medium text-blue-600 hover:text-blue-800">{c.name}</div>
                    {c.email && <div className="text-xs text-gray-400">{c.email}</div>}
                  </td>
                  <td className="px-6 py-4 text-sm">{c.mobile}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{c.source || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{c.city || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{c.cnic || '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => setLogTarget({ id: c.id, entity_type: 'customer', name: c.name, mobile: c.mobile })}
                      className="text-gray-400 hover:text-blue-600 mr-3" title="Log Interaction">Log</button>
                    <button onClick={() => openEdit(c)} className="text-gray-400 hover:text-gray-600 mr-3">Edit</button>
                    {getUserRole() !== 'creator' && (
                      <button onClick={() => handleDelete(c)} className="text-gray-400 hover:text-red-500">{getUserRole() === 'admin' ? 'Delete' : 'Request Delete'}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canCreateCustomers && (
        <BulkImport entity="customers" onImport={handleImport} importFile={importFile} setImportFile={setImportFile} importResult={importResult} />
      )}

      {showModal && (
        <Modal title={editing ? 'Edit Customer' : 'Add Customer'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Name" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            <PhoneInput label="Mobile" required value={form.mobile} onChange={value => setForm({...form, mobile: value})} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Additional Mobile 1" value={form.additional_mobiles[0] || ''} onChange={e => updateMobile(0, e.target.value)} />
              <Input label="Additional Mobile 2" value={form.additional_mobiles[1] || ''} onChange={e => updateMobile(1, e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Additional Mobile 3" value={form.additional_mobiles[2] || ''} onChange={e => updateMobile(2, e.target.value)} />
              <Input label="Additional Mobile 4" value={form.additional_mobiles[3] || ''} onChange={e => updateMobile(3, e.target.value)} />
            </div>
            <Input label="CNIC" value={form.cnic} onChange={e => setForm({...form, cnic: e.target.value})} />
            <Input label="Email" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
                <select value={form.source} onChange={e => setForm({...form, source: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">Select source</option>
                  {(lookupValues[LOOKUP_KEYS.CUSTOMER_SOURCE] || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Occupation</label>
                <select value={form.occupation} onChange={e => setForm({...form, occupation: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">Select occupation</option>
                  {(lookupValues[LOOKUP_KEYS.CUSTOMER_OCCUPATION] || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
            </div>
            {form.source === 'Other' && <Input label="Source (Other)" value={form.source_other} onChange={e => setForm({...form, source_other: e.target.value})} />}
            {form.occupation === 'Other' && <Input label="Occupation (Other)" value={form.occupation_other} onChange={e => setForm({...form, occupation_other: e.target.value})} />}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Interested Project</label>
                <select value={form.interested_project_id} onChange={e => setForm({...form, interested_project_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">Select project</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <Input label="Interested Project (Other)" value={form.interested_project_other} onChange={e => setForm({...form, interested_project_other: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Area" value={form.area} onChange={e => setForm({...form, area: e.target.value})} />
              <Input label="City" value={form.city} onChange={e => setForm({...form, city: e.target.value})} />
            </div>
            <Input label="Address" value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
            <Input label="Notes" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg">{editing ? 'Update' : 'Create'}</button>
            </div>
          </form>
          {editing && (
            <div className="border-t pt-4 mt-4">
              <MediaManager
                entityType="customer"
                entityId={editing.id || editing.customer_id}
                onUpload={() => {}}
              />
            </div>
          )}
        </Modal>
      )}

      {showDetail && <CustomerDetailModal customer={showDetail} onClose={() => setShowDetail(null)} />}

      {logTarget && (
        <QuickLogModal
          entity={logTarget}
          onClose={() => setLogTarget(null)}
          onSuccess={() => { setLogTarget(null); if (window.showToast) window.showToast('Logged', 'Interaction recorded', 'success'); }}
        />
      )}
    </div>
  );
}

// ============================================
// BROKERS VIEW
// ============================================
function BrokersView() {
  const [brokers, setBrokers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', mobile: '', company: '', commission_rate: 2 });
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [logTarget, setLogTarget] = useState(null);

  useEffect(() => { loadData(); }, []);
  const loadData = async () => {
    try {
      const [bRes, sRes] = await Promise.all([api.get('/brokers'), api.get('/brokers/summary')]);
      setBrokers(bRes.data); setSummary(sRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) { await api.put(`/brokers/${editing.id}`, form); }
      else { await api.post('/brokers', form); }
      setShowModal(false); setEditing(null); setForm({ name: '', mobile: '', company: '', commission_rate: 2 }); loadData();
    } catch (e) { alert(e.response?.data?.detail || 'Error'); }
  };

  const handleDelete = async (b) => {
    const role = getUserRole();
    if (role === 'creator') { alert('Creator role cannot delete records.'); return; }
    if (role === 'admin') {
      if (!confirm(`Delete "${b.name}"?`)) return;
      try { await api.delete(`/brokers/${b.id}`); loadData(); }
      catch (e) { alert(e.response?.data?.detail || 'Error'); }
    } else {
      const reason = prompt(`Request deletion of "${b.name}"?\nProvide a reason:`);
      if (reason === null) return;
      try {
        const res = await api.delete(`/brokers/${b.id}`, { data: { reason } });
        if (res.data.pending) {
          alert(`Deletion request submitted (${res.data.request_id}). An admin will review it.`);
        } else { loadData(); }
      } catch (e) { alert(e.response?.data?.detail || 'Error'); }
    }
  };

  const openEdit = (b) => { setEditing(b); setForm({ name: b.name, mobile: b.mobile, company: b.company || '', commission_rate: b.commission_rate }); setShowModal(true); };

  const handleImport = async () => {
    if (!importFile) return;
    const fd = new FormData(); fd.append('file', importFile);
    try { const res = await api.post('/brokers/bulk-import', fd); setImportResult(res.data); setImportFile(null); loadData(); }
    catch (e) { setImportResult({ success: 0, errors: [e.message] }); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold text-gray-900">Brokers</h2><p className="text-sm text-gray-500 mt-1">Partner network</p></div>
        <button onClick={() => { setEditing(null); setForm({ name: '', mobile: '', company: '', commission_rate: 2 }); setShowModal(true); }} className="bg-gray-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-800">Add Broker</button>
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard label="Total Brokers" value={summary.total_brokers} />
            <SummaryCard label="Active Brokers" value={summary.active_brokers} />
            <SummaryCard label="Total Deals" value={summary.total_deals} />
            <SummaryCard label="Total Deal Value" value={formatCurrency(summary.total_deals_value)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl shadow-sm border p-5">
              <div className="text-xs font-medium text-gray-400 uppercase mb-3">This Month</div>
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-3xl font-semibold text-gray-900">{summary.deals_this_month}</div>
                  <div className="text-sm text-gray-500">Deals</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold text-green-600">{formatCurrency(summary.deals_this_month_value)}</div>
                  <div className="text-sm text-gray-500">Value</div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border p-5">
              <div className="text-xs font-medium text-gray-400 uppercase mb-3">Top Performers</div>
              {summary.top_performers?.length > 0 ? (
                <div className="space-y-2">
                  {summary.top_performers.slice(0, 3).map((tp, idx) => (
                    <div key={tp.broker_id} className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-yellow-100 text-yellow-700' : idx === 1 ? 'bg-gray-100 text-gray-600' : 'bg-orange-100 text-orange-700'}`}>{idx + 1}</span>
                        <span className="text-sm font-medium">{tp.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{formatCurrency(tp.total_value)}</div>
                        <div className="text-xs text-gray-400">{tp.deal_count} deals</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-400">No deals yet</div>
              )}
            </div>
          </div>
        </>
      )}

      {loading ? <Loader /> : brokers.length === 0 ? <Empty msg="No brokers" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {brokers.map(b => (
            <div key={b.id} className="bg-white rounded-2xl shadow-sm border p-5">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="text-xs font-mono text-gray-400">{b.broker_id}</div>
                  <div className="font-semibold">{b.name}</div>
                  {b.company && <div className="text-sm text-gray-500">{b.company}</div>}
                </div>
                <span className={`px-2 py-1 rounded-full text-xs ${b.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100'}`}>{b.status}</span>
              </div>
              <div className="text-sm text-gray-600 mb-3">{b.mobile}</div>
              <div className="flex justify-between text-sm border-t pt-3">
                <span className="text-gray-400">Commission</span>
                <span className="font-medium">{b.commission_rate}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Deals</span>
                <span className="font-medium">{b.stats.total_deals}</span>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setLogTarget({ id: b.id, entity_type: 'broker', name: b.name, mobile: b.mobile })}
                  className="py-2 px-3 text-sm border rounded-lg hover:bg-blue-50 text-blue-600" title="Log Interaction">Log</button>
                <button onClick={() => openEdit(b)} className="flex-1 py-2 text-sm border rounded-lg hover:bg-gray-50">Edit</button>
                {getUserRole() !== 'creator' && (
                  <button onClick={() => handleDelete(b)} className="py-2 px-4 text-sm text-red-500 border rounded-lg hover:bg-red-50">{getUserRole() === 'admin' ? 'Delete' : 'Request Delete'}</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <BulkImport entity="brokers" onImport={handleImport} importFile={importFile} setImportFile={setImportFile} importResult={importResult} />

      {showModal && (
        <Modal title={editing ? 'Edit Broker' : 'Add Broker'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Name" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            <Input label="Mobile" required value={form.mobile} onChange={e => setForm({...form, mobile: e.target.value})} />
            <Input label="Company" value={form.company} onChange={e => setForm({...form, company: e.target.value})} />
            <Input label="Commission %" type="number" step="0.1" value={form.commission_rate} onChange={e => setForm({...form, commission_rate: parseFloat(e.target.value)})} />
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg">{editing ? 'Update' : 'Create'}</button>
            </div>
          </form>
          {editing && (
            <div className="border-t pt-4 mt-4">
              <MediaManager
                entityType="broker"
                entityId={editing.id || editing.broker_id}
                onUpload={() => {}}
              />
            </div>
          )}
        </Modal>
      )}

      {logTarget && (
        <QuickLogModal
          entity={logTarget}
          onClose={() => setLogTarget(null)}
          onSuccess={() => { setLogTarget(null); if (window.showToast) window.showToast('Logged', 'Interaction recorded', 'success'); }}
        />
      )}
    </div>
  );
}

// ============================================
// RECEIPTS VIEW (McKinsey-style)
// ============================================
function ReceiptsView() {
  const [receipts, setReceipts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [reps, setReps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerTransactions, setCustomerTransactions] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [form, setForm] = useState({
    customer_id: '', transaction_id: '', amount: '',
    payment_method: 'cash', reference_number: '', payment_date: new Date().toISOString().split('T')[0],
    notes: '', created_by_rep_id: '', allocations: []
  });

  // Search & Filter state for receipts list - separate fields for precision
  const [customerFilter, setCustomerFilter] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [receiptIdFilter, setReceiptIdFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Filter receipts - exact match for unit#, partial for customer
  const filteredReceipts = receipts.filter(r => {
    // Customer name - partial match
    if (customerFilter && !r.customer_name?.toLowerCase().includes(customerFilter.toLowerCase())) return false;
    // Unit number - EXACT match
    if (unitFilter && r.unit_number?.toLowerCase() !== unitFilter.toLowerCase()) return false;
    // Receipt ID - prefix match
    if (receiptIdFilter && !r.receipt_id?.toLowerCase().startsWith(receiptIdFilter.toLowerCase())) return false;
    // Payment method filter
    if (methodFilter && r.payment_method !== methodFilter) return false;
    // Date range filter
    if (dateFrom && r.payment_date < dateFrom) return false;
    if (dateTo && r.payment_date > dateTo) return false;
    return true;
  });

  const clearFilters = () => {
    setCustomerFilter('');
    setUnitFilter('');
    setReceiptIdFilter('');
    setMethodFilter('');
    setDateFrom('');
    setDateTo('');
  };

  const hasActiveFilters = customerFilter || unitFilter || receiptIdFilter || methodFilter || dateFrom || dateTo;

  useEffect(() => { loadData(); }, []);
  const loadData = async () => {
    try {
      const [rcpRes, sumRes, custRes, repRes] = await Promise.all([
        api.get('/receipts', { params: { limit: 50 } }).catch(() => ({ data: [] })),
        api.get('/receipts/summary').catch(() => ({ data: { total_receipts: 0, total_amount: 0, today_count: 0, today_amount: 0, month_count: 0, month_amount: 0, by_method: {} } })),
        api.get('/customers').catch(() => ({ data: [] })),
        api.get('/company-reps').catch(() => ({ data: [] }))
      ]);
      setReceipts(rcpRes.data || []);
      setSummary(sumRes.data);
      setCustomers(custRes.data || []);
      setReps(repRes.data || []);
    } catch (e) { 
      console.error(e); 
      setSummary({ total_receipts: 0, total_amount: 0, today_count: 0, today_amount: 0, month_count: 0, month_amount: 0, by_method: {} });
    }
    finally { setLoading(false); }
  };

  const selectCustomer = async (customer) => {
    setSelectedCustomer(customer);
    setForm({...form, customer_id: customer.id, transaction_id: '', allocations: []});
    try {
      const res = await api.get(`/receipts/customer/${customer.id}/transactions`);
      setCustomerTransactions(res.data || []);
    } catch (e) { setCustomerTransactions([]); }
  };

  const selectTransaction = (txn) => {
    setForm({...form, transaction_id: txn.id, allocations: []});
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.customer_id) { alert('Select a customer'); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { alert('Enter valid amount'); return; }
    try {
      await api.post('/receipts', form);
      setShowModal(false);
      setForm({ customer_id: '', transaction_id: '', amount: '', payment_method: 'cash', reference_number: '', payment_date: new Date().toISOString().split('T')[0], notes: '', created_by_rep_id: '', allocations: [] });
      setSelectedCustomer(null);
      setCustomerTransactions([]);
      setCustomerSearch('');
      loadData();
    } catch (e) { alert(e.response?.data?.detail || 'Error'); }
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.mobile.includes(customerSearch) ||
    c.customer_id.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const selectedTxn = customerTransactions.find(t => t.id === form.transaction_id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold text-gray-900">Receipts</h2>
          <p className="text-sm text-gray-500 mt-1">Payment collection & allocation</p></div>
        <button onClick={() => setShowModal(true)} className="bg-gray-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-800">Record Receipt</button>
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard label="Total Receipts" value={summary.total_receipts} />
            <SummaryCard label="Total Collected" value={formatCurrency(summary.total_amount)} />
            <SummaryCard label="Today" value={summary.today_count} sub={formatCurrency(summary.today_amount)} />
            <SummaryCard label="This Month" value={summary.month_count} sub={formatCurrency(summary.month_amount)} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white rounded-xl border p-4">
              <div className="text-xs text-gray-400 uppercase">Cash</div>
              <div className="text-lg font-semibold text-green-600">{formatCurrency(summary.by_method?.cash || 0)}</div>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <div className="text-xs text-gray-400 uppercase">Cheque</div>
              <div className="text-lg font-semibold text-blue-600">{formatCurrency(summary.by_method?.cheque || 0)}</div>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <div className="text-xs text-gray-400 uppercase">Bank Transfer</div>
              <div className="text-lg font-semibold text-purple-600">{formatCurrency(summary.by_method?.bank_transfer || 0)}</div>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <div className="text-xs text-gray-400 uppercase">Online</div>
              <div className="text-lg font-semibold text-orange-600">{formatCurrency(summary.by_method?.online || 0)}</div>
            </div>
          </div>
        </>
      )}

      {/* Search Filters */}
      <div className="bg-white rounded-2xl shadow-sm border p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 items-end">
          {/* Customer - partial match */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Customer</label>
            <input
              type="text"
              placeholder="Search name..."
              value={customerFilter}
              onChange={e => setCustomerFilter(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
          {/* Unit # - exact match */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Unit #</label>
            <input
              type="text"
              placeholder="Exact unit#"
              value={unitFilter}
              onChange={e => setUnitFilter(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
          {/* Receipt ID - prefix match */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Receipt ID</label>
            <input
              type="text"
              placeholder="RCP-001..."
              value={receiptIdFilter}
              onChange={e => setReceiptIdFilter(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
          {/* Method */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Method</label>
            <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">All Methods</option>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="online">Online</option>
            </select>
          </div>
          {/* From Date */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          {/* To Date */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          {/* Clear */}
          <div className="flex items-center">
            {hasActiveFilters && (
              <button onClick={clearFilters} className="px-3 py-2 text-sm text-red-600 hover:text-red-800 font-medium">
                Clear All
              </button>
            )}
          </div>
        </div>
        {hasActiveFilters && (
          <div className="mt-3 pt-3 border-t flex items-center justify-between text-sm">
            <div className="text-gray-600">
              <span className="font-medium">{filteredReceipts.length}</span> receipts found
            </div>
            <div className="text-gray-600">
              Total: <span className="font-semibold text-green-600">{formatCurrency(filteredReceipts.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0))}</span>
            </div>
          </div>
        )}
      </div>

      {loading ? <Loader /> : receipts.length === 0 ? <Empty msg="No receipts recorded" /> : filteredReceipts.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border p-12 text-center">
          <div className="text-gray-400 mb-2">No receipts match your search</div>
          <button onClick={clearFilters} className="text-sm text-blue-600 hover:text-blue-800">Clear filters</button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Receipt</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Customer</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Project / Unit</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4">Amount</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-6 py-4">Method</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Date</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {filteredReceipts.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => { setSelectedReceipt(r); setShowDetailModal(true); }}>
                  <td className="px-6 py-4">
                    <div className="text-sm font-mono text-gray-900">{r.receipt_id}</div>
                    {r.reference_number && <div className="text-xs text-gray-400">Ref: {r.reference_number}</div>}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium">{r.customer_name}</div>
                    <div className="text-xs text-gray-400">{r.customer_id}</div>
                  </td>
                  <td className="px-6 py-4">
                    {r.project_name ? (
                      <><div className="text-sm">{r.project_name}</div><div className="text-xs text-gray-500">{r.unit_number}</div></>
                    ) : <span className="text-sm text-gray-400">-</span>}
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-semibold text-green-600">{formatCurrency(r.amount)}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      r.payment_method === 'cash' ? 'bg-green-50 text-green-700' :
                      r.payment_method === 'cheque' ? 'bg-blue-50 text-blue-700' :
                      r.payment_method === 'bank_transfer' ? 'bg-purple-50 text-purple-700' : 'bg-orange-50 text-orange-700'
                    }`}>{r.payment_method}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{r.payment_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title="Record Receipt" onClose={() => { setShowModal(false); setSelectedCustomer(null); setCustomerTransactions([]); setCustomerSearch(''); }} wide>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Customer Selection */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Customer *</label>
              <input type="text" placeholder="Search by name, mobile or ID..." value={customerSearch}
                onChange={e => { setCustomerSearch(e.target.value); setSelectedCustomer(null); }}
                className="w-full border rounded-lg px-3 py-2 text-sm mb-2" />
              {customerSearch && !selectedCustomer && (
                <div className="border rounded-lg max-h-32 overflow-y-auto">
                  {filteredCustomers.length === 0 ? (
                    <div className="p-3 text-sm text-gray-400 text-center">No customers found</div>
                  ) : filteredCustomers.slice(0, 5).map(c => (
                    <button key={c.id} type="button" onClick={() => { selectCustomer(c); setCustomerSearch(c.name); }}
                      className="w-full text-left px-3 py-2 text-sm border-b last:border-0 hover:bg-gray-50">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-gray-500">{c.customer_id} â€¢ {c.mobile}</div>
                    </button>
                  ))}
                </div>
              )}
              {selectedCustomer && (
                <div className="bg-blue-50 rounded-lg p-3 text-sm">
                  <span className="font-medium">Selected:</span> {selectedCustomer.name} ({selectedCustomer.mobile})
                </div>
              )}
            </div>

            {/* Transaction Selection (for multi-purchase customers) */}
            {selectedCustomer && customerTransactions.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Allocate to Transaction</label>
                <div className="border rounded-lg max-h-40 overflow-y-auto">
                  {customerTransactions.map(t => (
                    <button key={t.id} type="button" onClick={() => selectTransaction(t)}
                      className={`w-full text-left px-3 py-2 text-sm border-b last:border-0 ${form.transaction_id === t.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-medium">{t.project_name} - {t.unit_number}</div>
                          <div className="text-xs text-gray-500">{t.transaction_id}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-amber-600">{formatCurrency(t.balance)}</div>
                          <div className="text-xs text-gray-400">pending</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Show pending installments if transaction selected */}
            {selectedTxn && (
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs font-medium text-gray-500 mb-2">Pending Installments</div>
                <div className="space-y-1">
                  {selectedTxn.installments.map(i => (
                    <div key={i.id} className="flex justify-between text-sm">
                      <span>#{i.number} - Due {i.due_date}</span>
                      <span className="text-amber-600">{formatCurrency(i.balance)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Input label="Amount *" type="number" required value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} />
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Payment Method</label>
                <select value={form.payment_method} onChange={e => setForm({...form, payment_method: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="cash">ðŸ’µ Cash</option>
                  <option value="cheque">ðŸ“ Cheque</option>
                  <option value="bank_transfer">ðŸ¦ Bank Transfer</option>
                  <option value="online">ðŸ’³ Online</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Reference # (Cheque/Transaction ID)" value={form.reference_number} onChange={e => setForm({...form, reference_number: e.target.value})} />
              <Input label="Payment Date" type="date" value={form.payment_date} onChange={e => setForm({...form, payment_date: e.target.value})} />
            </div>

            <div><label className="block text-xs font-medium text-gray-500 mb-1">Received By</label>
              <select value={form.created_by_rep_id} onChange={e => setForm({...form, created_by_rep_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">Select Rep</option>
                {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>

            <Input label="Notes" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button type="button" onClick={() => { setShowModal(false); setSelectedCustomer(null); setCustomerTransactions([]); setCustomerSearch(''); }} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button type="submit" className="px-6 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">Record Receipt</button>
            </div>
          </form>
        </Modal>
      )}

      {showDetailModal && selectedReceipt && (
        <ReceiptDetailModal 
          receipt={selectedReceipt} 
          onClose={() => { setShowDetailModal(false); setSelectedReceipt(null); }} 
        />
      )}
    </div>
  );
}

// ============================================
// RECEIPT DETAIL MODAL
// ============================================
function ReceiptDetailModal({ receipt, onClose }) {
  return (
    <Modal title={`Receipt: ${receipt.receipt_id}`} onClose={onClose} wide>
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Receipt ID</label>
            <div className="text-sm text-gray-900">{receipt.receipt_id}</div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Customer</label>
            <div className="text-sm text-gray-900">{receipt.customer_name || '-'}</div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Project / Unit</label>
            <div className="text-sm text-gray-900">
              {receipt.project_name ? `${receipt.project_name} - ${receipt.unit_number}` : '-'}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Amount</label>
            <div className="text-sm font-semibold text-green-600">{formatCurrency(receipt.amount)}</div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Payment Method</label>
            <div className="text-sm">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                receipt.payment_method === 'cash' ? 'bg-green-50 text-green-700' :
                receipt.payment_method === 'cheque' ? 'bg-blue-50 text-blue-700' :
                receipt.payment_method === 'bank_transfer' ? 'bg-purple-50 text-purple-700' : 'bg-orange-50 text-orange-700'
              }`}>{receipt.payment_method}</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Payment Date</label>
            <div className="text-sm text-gray-900">{receipt.payment_date || '-'}</div>
          </div>
          {receipt.reference_number && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Reference Number</label>
              <div className="text-sm text-gray-900">{receipt.reference_number}</div>
            </div>
          )}
          {receipt.notes && (
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
              <div className="text-sm text-gray-900">{receipt.notes}</div>
            </div>
          )}
        </div>

        {/* Media Attachments */}
        <div className="border-t pt-4">
          <MediaManager 
            entityType="receipt" 
            entityId={receipt.id || receipt.receipt_id}
            onUpload={() => {}}
          />
        </div>
      </div>
    </Modal>
  );
}

// ============================================
// EOI COLLECTION VIEW â€” Expression of Interest
// ============================================
function EOICollectionView() {
  const [eois, setEois] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [projects, setProjects] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [inventoryList, setInventoryList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEoi, setEditingEoi] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedEoi, setSelectedEoi] = useState(null);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [convertingEoi, setConvertingEoi] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState('');

  // Filters
  const [partyFilter, setPartyFilter] = useState('');
  const [brokerFilter, setBrokerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [eoiIdFilter, setEoiIdFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [drilldownFilter, setDrilldownFilter] = useState(null);

  // Form
  const emptyForm = {
    party_name: '', party_mobile: '', party_cnic: '',
    broker_name: '', broker_id: '',
    amount: '', marlas: '',
    payment_method: '', reference_number: '', payment_received: false,
    eoi_date: new Date().toISOString().split('T')[0],
    eoi_time: new Date().toTimeString().slice(0, 5),
    notes: '', project_id: ''
  };
  const [form, setForm] = useState(emptyForm);

  // Convert form
  const emptyConvertForm = {
    customer_id: '', inventory_id: '', broker_id: '',
    area_marla: '', rate_per_marla: '', num_installments: 4,
    first_due_date: '', installment_cycle: 'quarterly',
    broker_commission_rate: '', unit_number: '', block: '',
    notes: ''
  };
  const [convertForm, setConvertForm] = useState(emptyConvertForm);
  const [customerSearch, setCustomerSearch] = useState('');

  const role = getUserRole();
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => { loadProjects(); }, []);
  useEffect(() => { if (selectedProjectId) loadData(); }, [selectedProjectId]);

  const loadProjects = async () => {
    try {
      const res = await api.get('/projects');
      const list = res.data || [];
      setProjects(list);
      const sgb = list.find(p => p.name?.toLowerCase().includes('grand bazaar'));
      if (sgb) setSelectedProjectId(sgb.id);
      else if (list.length) setSelectedProjectId(list[0].id);
    } catch (e) { console.error(e); }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [eoiRes, dashRes, brkRes, custRes] = await Promise.all([
        api.get('/eoi', { params: { project_id: selectedProjectId, limit: 500 } }).catch(() => ({ data: { items: [] } })),
        api.get('/eoi/dashboard', { params: { project_id: selectedProjectId } }).catch(() => ({ data: null })),
        api.get('/brokers').catch(() => ({ data: [] })),
        api.get('/customers').catch(() => ({ data: [] }))
      ]);
      setEois(eoiRes.data?.items || eoiRes.data || []);
      setDashboard(dashRes.data);
      setBrokers(brkRes.data || []);
      setCustomers(custRes.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadProjectInventory = async (projectId) => {
    try {
      const res = await api.get('/inventory', { params: { project_id: projectId, status: 'available', limit: 200 } });
      setInventoryList(res.data || []);
    } catch (e) { setInventoryList([]); }
  };

  // Client-side filtering
  const filteredEois = eois.filter(e => {
    if (partyFilter && !e.party_name?.toLowerCase().includes(partyFilter.toLowerCase())) return false;
    if (brokerFilter && !(e.broker_name || 'Direct').toLowerCase().includes(brokerFilter.toLowerCase())) return false;
    if (statusFilter && e.status !== statusFilter) return false;
    if (eoiIdFilter && !e.eoi_id?.toLowerCase().startsWith(eoiIdFilter.toLowerCase())) return false;
    if (dateFrom && e.eoi_date < dateFrom) return false;
    if (dateTo && e.eoi_date > dateTo) return false;
    if (drilldownFilter) {
      if (drilldownFilter.status && e.status !== drilldownFilter.status) return false;
      if (drilldownFilter.broker_name !== undefined) {
        const bn = e.broker_name || 'Direct';
        if (bn !== drilldownFilter.broker_name) return false;
      }
      if (drilldownFilter.slab) {
        const m = parseFloat(e.marlas) || 0;
        if (drilldownFilter.slab === '3-5' && (m < 3 || m > 5)) return false;
        if (drilldownFilter.slab === '5-8' && (m < 5 || m > 8)) return false;
        if (drilldownFilter.slab === '8+' && m < 8) return false;
        if (drilldownFilter.slab === 'Unknown' && m > 0) return false;
      }
    }
    return true;
  });

  const clearFilters = () => {
    setPartyFilter(''); setBrokerFilter(''); setStatusFilter('');
    setEoiIdFilter(''); setDateFrom(''); setDateTo('');
    setDrilldownFilter(null);
  };
  const hasActiveFilters = partyFilter || brokerFilter || statusFilter || eoiIdFilter || dateFrom || dateTo || drilldownFilter;

  // Create / Edit
  const openCreate = () => {
    setEditingEoi(null);
    setForm({ ...emptyForm, project_id: selectedProjectId, eoi_time: new Date().toTimeString().slice(0, 5) });
    setShowModal(true);
  };
  const openEdit = (eoi) => {
    setEditingEoi(eoi);
    setForm({
      party_name: eoi.party_name || '', party_mobile: eoi.party_mobile || '',
      party_cnic: eoi.party_cnic || '', broker_name: eoi.broker_name || '',
      broker_id: eoi.broker_id || eoi.broker_uuid || '',
      amount: eoi.amount || '', marlas: eoi.marlas || '',
      payment_method: eoi.payment_method || 'cash',
      reference_number: eoi.reference_number || '', payment_received: !!eoi.payment_received,
      eoi_date: eoi.eoi_date || new Date().toISOString().split('T')[0],
      eoi_time: eoi.created_at ? eoi.created_at.slice(11, 16) : '',
      notes: eoi.notes || '', project_id: eoi.project_uuid || eoi.project_id || selectedProjectId
    });
    setShowModal(true);
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!form.party_name) { window.showToast?.('Error', 'Customer name is required', 'error'); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { window.showToast?.('Error', 'Enter valid amount', 'error'); return; }
    if (form.payment_received && !form.payment_method) { window.showToast?.('Error', 'Select payment mode when payment is received', 'error'); return; }
    try {
      const payload = { ...form };
      // Resolve broker_id from name if needed
      if (!payload.broker_id && payload.broker_name) {
        const match = brokers.find(b => b.name?.toLowerCase() === payload.broker_name.toLowerCase());
        if (match) payload.broker_id = match.broker_id || match.id;
      }
      delete payload.eoi_time;
      if (!payload.project_id) payload.project_id = selectedProjectId;
      // Use project entity_id for API
      const proj = projects.find(p => p.id === payload.project_id);
      if (proj?.project_id) payload.project_id = proj.project_id;

      if (editingEoi) {
        await api.put(`/eoi/${editingEoi.id || editingEoi.eoi_id}`, payload);
        window.showToast?.('Updated', 'EOI updated successfully', 'success');
      } else {
        await api.post('/eoi', payload);
        window.showToast?.('Created', 'EOI recorded successfully', 'success');
      }
      setShowModal(false); setEditingEoi(null); setForm(emptyForm);
      loadData();
    } catch (e) {
      window.showToast?.('Error', e.response?.data?.detail || 'Failed to save EOI', 'error');
    }
  };

  // Status actions
  const handleCancel = async (eoi) => {
    const reason = prompt(`Cancel EOI ${eoi.eoi_id} for ${eoi.party_name}?\nEnter reason (optional):`);
    if (reason === null) return;
    try {
      await api.post(`/eoi/${eoi.id || eoi.eoi_id}/cancel`, { reason });
      window.showToast?.('Cancelled', 'EOI cancelled', 'success');
      loadData();
    } catch (e) { window.showToast?.('Error', e.response?.data?.detail || 'Failed', 'error'); }
  };
  const handleRefund = async (eoi) => {
    const reason = prompt(`Mark EOI ${eoi.eoi_id} as refunded?\nEnter reason (optional):`);
    if (reason === null) return;
    try {
      await api.post(`/eoi/${eoi.id || eoi.eoi_id}/refund`, { reason });
      window.showToast?.('Refunded', 'EOI marked as refunded', 'success');
      loadData();
    } catch (e) { window.showToast?.('Error', e.response?.data?.detail || 'Failed', 'error'); }
  };

  // Convert
  const openConvert = (eoi) => {
    setConvertingEoi(eoi);
    setConvertForm({
      ...emptyConvertForm,
      area_marla: eoi.marlas || '',
      unit_number: eoi.unit_number || '',
      broker_id: eoi.broker_id || eoi.broker_uuid || '',
      notes: `Converted from ${eoi.eoi_id}`
    });
    setCustomerSearch(eoi.party_name || '');
    loadProjectInventory(eoi.project_uuid || eoi.project_id || selectedProjectId);
    setShowConvertModal(true);
  };
  const handleConvert = async (ev) => {
    ev.preventDefault();
    if (!convertForm.customer_id) { window.showToast?.('Error', 'Select a customer', 'error'); return; }
    if (!convertForm.rate_per_marla) { window.showToast?.('Error', 'Rate per marla required', 'error'); return; }
    try {
      const res = await api.post(`/eoi/${convertingEoi.id || convertingEoi.eoi_id}/convert`, convertForm);
      window.showToast?.('Converted', `EOI converted â†’ ${res.data?.transaction?.transaction_id || 'Transaction created'}`, 'success');
      setShowConvertModal(false); setConvertingEoi(null); setConvertForm(emptyConvertForm);
      loadData();
    } catch (e) { window.showToast?.('Error', e.response?.data?.detail || 'Conversion failed', 'error'); }
  };

  // Export CSV
  const handleExport = () => {
    const data = filteredEois.map(e => ({
      'EOI ID': e.eoi_id, 'Customer Name': e.party_name,
      'Contact No': e.party_mobile || '', 'CNIC': e.party_cnic || '',
      'Dealing Through': e.broker_name || 'Direct', 'Amount (PKR)': e.amount,
      'Marlas': e.marlas || '',
      'Payment Received': e.payment_received ? 'Yes' : 'No',
      'Payment Received Time': e.payment_received_at ? new Date(String(e.payment_received_at).endsWith('Z') ? e.payment_received_at : e.payment_received_at + 'Z').toLocaleString('en-PK', { timeZone: 'Asia/Karachi' }) : '',
      'Method': e.payment_method || '', 'Reference': e.reference_number || '',
      'Date': e.eoi_date, 'EOI Created Time': e.created_at ? new Date(String(e.created_at).endsWith('Z') ? e.created_at : e.created_at + 'Z').toLocaleString('en-PK', { timeZone: 'Asia/Karachi' }) : '',
      'Status': e.status, 'Notes': e.notes || ''
    }));
    downloadCSV(data, `eoi_collection_${new Date().toISOString().split('T')[0]}.csv`);
  };

  // PDF Acknowledgment Slip â€” Sitara Grand Bazaar
  const generateEOIPDF = (eoi) => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pw = 210; // page width
    const teal = [21, 71, 81]; // #154751 dark teal brand color
    const black = [30, 30, 30];
    const gray = [120, 120, 120];
    const lightGray = [200, 200, 200];
    let y = 20;

    // --- SBL Logo (square, high quality) ---
    try { doc.addImage(SBL_LOGO_BASE64, 'JPEG', 15, 10, 28, 28); } catch (e) { /* logo load fail â€” skip */ }

    // Helper: draw a clear checkmark inside a box
    const drawCheck = (x, yc, size) => {
      doc.setDrawColor(21, 71, 81);
      doc.setLineWidth(0.6);
      // Short stroke down-right, then long stroke up-right (classic âœ“)
      doc.line(x + size * 0.15, yc + size * 0.5, x + size * 0.4, yc + size * 0.75);
      doc.line(x + size * 0.4, yc + size * 0.75, x + size * 0.85, yc + size * 0.2);
    };

    // --- Header text ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(...teal);
    doc.text('SITARA GRAND BAZAAR', pw / 2 + 10, 28, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...gray);
    doc.text('EOI ACKNOWLEDGMENT SLIP', pw / 2 + 10, 36, { align: 'center' });

    y = 50;
    // --- Serial number ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...black);
    doc.text(`Serial No: ${eoi.eoi_id}`, 20, y);
    doc.text(`Date: ${eoi.eoi_date || '-'}`, pw - 20, y, { align: 'right' });

    y += 6;
    doc.setDrawColor(...lightGray);
    doc.setLineWidth(0.5);
    doc.line(20, y, pw - 20, y); // separator

    // --- Helper: field row ---
    const fieldRow = (label, value, x, yPos, width) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...gray);
      doc.text(label, x, yPos);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...black);
      doc.text(String(value || '-'), x, yPos + 5.5);
      // Underline
      doc.setDrawColor(...lightGray);
      doc.setLineWidth(0.3);
      doc.line(x, yPos + 7, x + width, yPos + 7);
    };

    y += 10;
    // Row 1: Customer Name + CNIC
    fieldRow('Customer Name', eoi.party_name, 20, y, 80);
    fieldRow('CNIC', eoi.party_cnic, 112, y, 78);

    y += 18;
    // Row 2: Contact No + Dealing Through
    fieldRow('Contact No', eoi.party_mobile, 20, y, 80);
    fieldRow('Dealing Through', eoi.broker_name || 'Direct', 112, y, 78);

    y += 24;
    // --- Payment section ---
    doc.setDrawColor(...lightGray);
    doc.setLineWidth(0.3);
    doc.rect(20, y - 3, pw - 40, 40, 'S');

    // Payment received/not received
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...black);
    doc.text('Payment:', 25, y + 5);
    // Checkboxes
    const isReceived = !!eoi.payment_received;
    const cbSize = 3.5;
    // Received
    doc.rect(52, y + 1.5, cbSize, cbSize, 'S');
    if (isReceived) { drawCheck(52, y + 1.5, cbSize); }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('Received', 57.5, y + 5);
    // Not Received
    doc.rect(76, y + 1.5, cbSize, cbSize, 'S');
    if (!isReceived) { drawCheck(76, y + 1.5, cbSize); }
    doc.setFont('helvetica', 'normal');
    doc.text('Not Received', 81.5, y + 5);

    // Mode checkboxes
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Mode:', 108, y + 5);
    const modes = [
      { key: 'cheque', label: 'Cheque', x: 122 },
      { key: 'cash', label: 'Cash', x: 144 },
      { key: 'bank_transfer', label: 'Bank Transfer', x: 160 },
    ];
    modes.forEach(m => {
      doc.rect(m.x, y + 1.5, cbSize, cbSize, 'S');
      if (isReceived && (eoi.payment_method || '').toLowerCase() === m.key) {
        drawCheck(m.x, y + 1.5, cbSize);
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(m.label, m.x + 5, y + 5);
    });

    // Amount row
    const ay = y + 16;
    const fmtAmt = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(parseFloat(eoi.amount) || 0);
    fieldRow('Amount (PKR)', `Rs. ${fmtAmt}`, 25, ay, 50);
    fieldRow('Txn/Cheque No', eoi.reference_number, 85, ay, 50);
    fieldRow('Marlas', eoi.marlas || '-', 145, ay, 40);

    y += 48;
    // --- Datetime Stamps ---
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...gray);
    const fmtDT = (ts) => { if (!ts) return '-'; try { const d = new Date(String(ts).endsWith('Z') ? ts : ts + 'Z'); return d.toLocaleString('en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' }); } catch { return ts; } };
    doc.text(`EOI Created: ${fmtDT(eoi.created_at)}`, 20, y);
    doc.text(`Payment Received: ${eoi.payment_received_at ? fmtDT(eoi.payment_received_at) : 'Pending'}`, 112, y);

    y += 8;
    // --- Disclaimer ---
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(150, 50, 50);
    doc.text('Disclaimer: This slip confirms receipt of EOI only and does not constitute unit allocation. Allocation subject to company approval.', 20, y);

    y += 14;
    // --- Authorized Signatory ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...black);
    doc.text('Authorized Signatory:', 20, y);
    doc.setDrawColor(...lightGray);
    doc.line(65, y + 1, 120, y + 1);

    y += 20;
    // --- Footer: IBAN ---
    doc.setDrawColor(...teal);
    doc.setLineWidth(0.8);
    doc.line(20, y, pw - 20, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...teal);
    doc.text('SITARA BUILDERS (PVT) LTD', 20, y);
    doc.setFont('helvetica', 'normal');
    doc.text('|  IBAN: PK89FAYS3597499000006331  |  Faysal Bank Ltd', 72, y);

    doc.save(`EOI_Acknowledgment_${eoi.eoi_id}.pdf`);
  };

  const getStatusBadge = (status) => {
    const s = { active: 'bg-emerald-50 text-emerald-700', converted: 'bg-blue-50 text-blue-700', cancelled: 'bg-red-50 text-red-700', refunded: 'bg-amber-50 text-amber-700' };
    return s[status] || 'bg-gray-50 text-gray-700';
  };
  const getMethodBadge = (m) => {
    const s = { cash: 'bg-green-50 text-green-700', cheque: 'bg-blue-50 text-blue-700', bank_transfer: 'bg-purple-50 text-purple-700', online: 'bg-orange-50 text-orange-700' };
    return s[m] || 'bg-gray-50 text-gray-600';
  };

  const formatTimestamp = (ts) => {
    if (!ts) return '-';
    try { const d = new Date(String(ts).endsWith('Z') ? ts : ts + 'Z'); return d.toLocaleString('en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' }); } catch { return ts; }
  };

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const sum = dashboard?.summary;
  const sb = sum?.status_breakdown || {};
  const filteredCustomers = customers.filter(c =>
    c.name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.mobile?.includes(customerSearch) ||
    c.customer_id?.toLowerCase().includes(customerSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">EOI Collection</h2>
          <p className="text-sm text-gray-500 mt-1">
            {selectedProject?.name || 'Select Project'} â€” Expression of Interest tracking
          </p>
        </div>
        <div className="flex items-center gap-3">
          {projects.length > 1 && (
            <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm">
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button onClick={handleExport} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 text-gray-700">Export CSV</button>
          <button onClick={openCreate} className="bg-gray-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-800">Record EOI</button>
        </div>
      </div>

      {/* Dashboard Summary Cards */}
      {sum && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white rounded-2xl shadow-sm border p-5 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => { clearFilters(); }}>
              <div className="text-xs font-medium text-gray-400 uppercase">Total EOIs</div>
              <div className="mt-2 text-2xl font-semibold text-gray-900">{sum.total_eois_count}</div>
              <div className="text-sm text-gray-500 mt-1">{formatCurrency(sum.total_eois_amount)}</div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border p-5 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setDrilldownFilter({ status: 'active' })}>
              <div className="text-xs font-medium text-emerald-500 uppercase">Active</div>
              <div className="mt-2 text-2xl font-semibold text-emerald-600">{sb.active?.count || 0}</div>
              <div className="text-sm text-gray-500 mt-1">{formatCurrency(sb.active?.amount || 0)}</div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border p-5 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setDrilldownFilter({ status: 'converted' })}>
              <div className="text-xs font-medium text-blue-500 uppercase">Converted</div>
              <div className="mt-2 text-2xl font-semibold text-blue-600">{sb.converted?.count || 0}</div>
              <div className="text-sm text-gray-500 mt-1">{formatCurrency(sb.converted?.amount || 0)}</div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border p-5 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setDrilldownFilter({ status: 'cancelled' })}>
              <div className="text-xs font-medium text-red-500 uppercase">Cancelled</div>
              <div className="mt-2 text-2xl font-semibold text-red-600">{(sb.cancelled?.count || 0) + (sb.refunded?.count || 0)}</div>
              <div className="text-sm text-gray-500 mt-1">{formatCurrency((sb.cancelled?.amount || 0) + (sb.refunded?.amount || 0))}</div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border p-5">
              <div className="text-xs font-medium text-gray-400 uppercase">Total Area</div>
              <div className="mt-2 text-2xl font-semibold text-gray-900">{(sum.total_marlas || 0).toFixed(1)} <span className="text-sm font-normal text-gray-400">Marla</span></div>
              <div className="text-sm text-gray-500 mt-1">Avg {sum.total_eois_count ? formatCurrency(sum.total_eois_amount / sum.total_eois_count) : 0}/EOI</div>
            </div>
          </div>

          {/* Broker Leaderboard + Marla Slabs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Broker Leaderboard */}
            {dashboard?.leaderboard?.brokers?.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Broker Leaderboard</h3>
                <div className="space-y-2">
                  {dashboard.leaderboard.brokers.map((b, i) => (
                    <div key={i}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => setDrilldownFilter({ broker_name: b.broker_name || 'Direct' })}>
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-200 text-gray-700' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-50 text-gray-500'
                        }`}>{i + 1}</div>
                        <div>
                          <div className="text-sm font-medium">{b.broker_name || 'Direct'}</div>
                          <div className="text-xs text-gray-400">{b.count} EOIs</div>
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-green-600">{formatCurrency(b.amount)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Marla Slab Breakdown */}
            {dashboard?.marlas_slabs?.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">By Area (Marlas)</h3>
                <div className="space-y-3">
                  {dashboard.marlas_slabs.filter(s => s.count > 0).map((s, i) => {
                    const maxCount = Math.max(...dashboard.marlas_slabs.map(x => x.count), 1);
                    const pct = (s.count / maxCount) * 100;
                    return (
                      <div key={i} className="cursor-pointer hover:bg-gray-50 p-3 rounded-lg transition-colors"
                        onClick={() => setDrilldownFilter({ slab: s.slab })}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium">{s.slab} Marla</span>
                          <span className="text-gray-500">{s.count} EOIs &middot; {formatCurrency(s.amount)}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div className="bg-gray-900 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Drilldown banner */}
      {drilldownFilter && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 flex items-center justify-between">
          <span className="text-sm text-blue-700">
            Filtered: {drilldownFilter.status && `Status = ${drilldownFilter.status}`}
            {drilldownFilter.broker_name !== undefined && `Broker = ${drilldownFilter.broker_name}`}
            {drilldownFilter.slab && `Area = ${drilldownFilter.slab} Marla`}
          </span>
          <button onClick={() => setDrilldownFilter(null)} className="text-sm text-blue-600 hover:text-blue-800 font-medium">Clear</button>
        </div>
      )}

      {/* Search Filters */}
      <div className="bg-white rounded-2xl shadow-sm border p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Customer Name</label>
            <input type="text" placeholder="Search name..." value={partyFilter} onChange={e => setPartyFilter(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Broker</label>
            <input type="text" placeholder="Search broker..." value={brokerFilter} onChange={e => setBrokerFilter(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">EOI ID</label>
            <input type="text" placeholder="EOI-001..." value={eoiIdFilter} onChange={e => setEoiIdFilter(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="converted">Converted</option>
              <option value="cancelled">Cancelled</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex items-center">
            {hasActiveFilters && (
              <button onClick={clearFilters} className="px-3 py-2 text-sm text-red-600 hover:text-red-800 font-medium">Clear All</button>
            )}
          </div>
        </div>
        {hasActiveFilters && (
          <div className="mt-3 pt-3 border-t flex items-center justify-between text-sm">
            <div className="text-gray-600"><span className="font-medium">{filteredEois.length}</span> EOIs found</div>
            <div className="text-gray-600">Total: <span className="font-semibold text-green-600">{formatCurrency(filteredEois.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0))}</span></div>
          </div>
        )}
      </div>

      {/* EOI Table */}
      {loading ? <Loader /> : eois.length === 0 ? <Empty msg="No EOIs recorded yet" /> : filteredEois.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border p-12 text-center">
          <div className="text-gray-400 mb-2">No EOIs match your filters</div>
          <button onClick={clearFilters} className="text-sm text-blue-600 hover:text-blue-800">Clear filters</button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">EOI</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Customer</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Broker</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4">Amount</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4">Marlas</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-6 py-4">Status</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-6 py-4">Paid</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Recorded</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4"></th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {filteredEois.map(e => (
                <tr key={e.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => { setSelectedEoi(e); setShowDetailModal(true); }}>
                  <td className="px-6 py-4">
                    <div className="text-sm font-mono text-gray-900">{e.eoi_id}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium">{e.party_name}</div>
                    {e.party_mobile && <div className="text-xs text-gray-400">{e.party_mobile}</div>}
                  </td>
                  <td className="px-6 py-4 text-sm">{e.broker_name || <span className="text-gray-400">Direct</span>}</td>
                  <td className="px-6 py-4 text-right text-sm font-semibold text-green-600">{formatCurrency(e.amount)}</td>
                  <td className="px-6 py-4 text-right text-sm">{e.marlas || '-'}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(e.status)}`}>{e.status}</span>
                  </td>
                  <td className="px-6 py-4 text-center text-lg">
                    {e.payment_received
                      ? <span className="text-emerald-600" title="Payment Received">â˜‘</span>
                      : <span className="text-red-400" title="Payment Not Received">â˜</span>}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-600">{e.eoi_date}</div>
                    <div className="text-xs text-gray-400">{e.created_at ? formatTimestamp(e.created_at) : ''}</div>
                  </td>
                  <td className="px-6 py-4 text-right" onClick={ev => ev.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => generateEOIPDF(e)} className="px-2 py-1 text-xs text-teal-600 hover:text-teal-800 hover:bg-teal-50 rounded" title="Download PDF">PDF</button>
                      {e.status === 'active' && (
                        <>
                          <button onClick={() => openEdit(e)} className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded">Edit</button>
                          <button onClick={() => openConvert(e)} className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded">Convert</button>
                          <button onClick={() => handleCancel(e)} className="px-2 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded">Cancel</button>
                        </>
                      )}
                      {e.status === 'cancelled' && (
                        <button onClick={() => handleRefund(e)} className="px-2 py-1 text-xs text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded">Refund</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <Modal title={editingEoi ? `Edit ${editingEoi.eoi_id}` : 'Record New EOI'} onClose={() => { setShowModal(false); setEditingEoi(null); }} wide>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Customer Name" required value={form.party_name} onChange={e => setForm({...form, party_name: e.target.value})} />
              <Input label="Contact No" value={form.party_mobile} onChange={e => setForm({...form, party_mobile: e.target.value})} placeholder="03XX-XXXXXXX" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="CNIC" value={form.party_cnic} onChange={e => setForm({...form, party_cnic: e.target.value})} placeholder="XXXXX-XXXXXXX-X" />
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Broker</label>
                <input type="text" placeholder="Broker name (leave empty for direct)" value={form.broker_name}
                  onChange={e => setForm({...form, broker_name: e.target.value, broker_id: ''})}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                  list="eoi-broker-suggestions" />
                <datalist id="eoi-broker-suggestions">
                  {brokers.map(b => <option key={b.id} value={b.name}>{b.broker_id}</option>)}
                </datalist>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Amount (PKR)" type="number" required value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} />
              <Input label="Marlas" type="number" step="0.01" value={form.marlas} onChange={e => setForm({...form, marlas: e.target.value})} />
            </div>
            <div className="grid grid-cols-5 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Payment Method</label>
                <select value={form.payment_method} onChange={e => setForm({...form, payment_method: e.target.value})} className={`w-full border rounded-lg px-3 py-2 text-sm ${form.payment_received && !form.payment_method ? 'border-red-300' : ''}`}>
                  <option value="">â€” Select â€”</option>
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="online">Online</option>
                </select>
              </div>
              <Input label="Reference #" value={form.reference_number} onChange={e => setForm({...form, reference_number: e.target.value})} />
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Payment Received</label>
                <button type="button" onClick={() => setForm({...form, payment_received: !form.payment_received})}
                  className={`w-full border rounded-lg px-3 py-2 text-sm font-medium transition-colors ${form.payment_received ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-red-50 text-red-600 border-red-200'}`}>
                  {form.payment_received ? 'â˜‘ Received' : 'â˜ Not Received'}
                </button>
              </div>
              <Input label="EOI Date" type="date" value={form.eoi_date} onChange={e => setForm({...form, eoi_date: e.target.value})} />
              <Input label="Time" type="time" value={form.eoi_time} onChange={e => setForm({...form, eoi_time: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
              <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <button type="button" onClick={() => { setShowModal(false); setEditingEoi(null); }} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button type="submit" className="px-6 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800">
                {editingEoi ? 'Update EOI' : 'Record EOI'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedEoi && (
        <Modal title={`EOI: ${selectedEoi.eoi_id}`} onClose={() => { setShowDetailModal(false); setSelectedEoi(null); }} wide>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Customer Name</label>
                <div className="text-sm text-gray-900 font-medium">{selectedEoi.party_name}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Contact No</label>
                <div className="text-sm text-gray-900">{selectedEoi.party_mobile || '-'}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">CNIC</label>
                <div className="text-sm text-gray-900">{selectedEoi.party_cnic || '-'}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Broker</label>
                <div className="text-sm text-gray-900">{selectedEoi.broker_name || 'Direct'}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Amount</label>
                <div className="text-sm font-semibold text-green-600">{formatCurrency(selectedEoi.amount)}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Marlas</label>
                <div className="text-sm text-gray-900">{selectedEoi.marlas || '-'}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Payment Method</label>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getMethodBadge(selectedEoi.payment_method)}`}>{selectedEoi.payment_method || '-'}</span>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Reference #</label>
                <div className="text-sm text-gray-900">{selectedEoi.reference_number || '-'}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Payment Received</label>
                <span className={`text-xl ${selectedEoi.payment_received ? 'text-emerald-600' : 'text-red-400'}`}>
                  {selectedEoi.payment_received ? 'â˜‘' : 'â˜'} <span className="text-sm text-gray-600">{selectedEoi.payment_received ? 'Received' : 'Not Received'}</span>
                </span>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(selectedEoi.status)}`}>{selectedEoi.status}</span>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">EOI Date</label>
                <div className="text-sm text-gray-900">{selectedEoi.eoi_date}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Recorded At</label>
                <div className="text-sm text-gray-900">{formatTimestamp(selectedEoi.created_at)}</div>
              </div>
              {selectedEoi.updated_at && selectedEoi.updated_at !== selectedEoi.created_at && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Last Updated</label>
                  <div className="text-sm text-gray-900">{formatTimestamp(selectedEoi.updated_at)}</div>
                </div>
              )}
              {selectedEoi.created_by_name && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Created By</label>
                  <div className="text-sm text-gray-900">{selectedEoi.created_by_name}</div>
                </div>
              )}
            </div>
            {selectedEoi.notes && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                <div className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{selectedEoi.notes}</div>
              </div>
            )}
            {/* Attachments */}
            <div className="border-t pt-4">
              <MediaManager
                entityType="eoi"
                entityId={selectedEoi.id || selectedEoi.eoi_id}
                onUpload={() => {}}
              />
            </div>
            {/* Actions */}
            {selectedEoi.status === 'active' && (
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button onClick={() => generateEOIPDF(selectedEoi)} className="px-4 py-2 text-sm text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-50">Download PDF</button>
                <button onClick={() => { setShowDetailModal(false); openEdit(selectedEoi); }} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">Edit</button>
                <button onClick={() => { setShowDetailModal(false); openConvert(selectedEoi); }} className="px-4 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">Convert to Transaction</button>
                <button onClick={() => { handleCancel(selectedEoi); setShowDetailModal(false); }} className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50">Cancel EOI</button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Convert to Transaction Modal */}
      {showConvertModal && convertingEoi && (
        <Modal title={`Convert ${convertingEoi.eoi_id} to Transaction`} onClose={() => { setShowConvertModal(false); setConvertingEoi(null); }} wide>
          <div className="bg-blue-50 rounded-lg p-3 mb-4 text-sm text-blue-700">
            Converting EOI for <strong>{convertingEoi.party_name}</strong> â€” {formatCurrency(convertingEoi.amount)} token will become the first receipt against the new transaction.
          </div>
          <form onSubmit={handleConvert} className="space-y-4">
            {/* Customer Selection */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Customer *</label>
              <input type="text" placeholder="Search by name, mobile or ID..." value={customerSearch}
                onChange={e => { setCustomerSearch(e.target.value); setConvertForm({...convertForm, customer_id: ''}); }}
                className="w-full border rounded-lg px-3 py-2 text-sm mb-2" />
              {customerSearch && !convertForm.customer_id && (
                <div className="border rounded-lg max-h-32 overflow-y-auto">
                  {filteredCustomers.length === 0 ? (
                    <div className="p-3 text-sm text-gray-400 text-center">No customers found â€” create one first in Customers tab</div>
                  ) : filteredCustomers.slice(0, 5).map(c => (
                    <button key={c.id} type="button" onClick={() => { setConvertForm({...convertForm, customer_id: c.customer_id || c.id}); setCustomerSearch(c.name); }}
                      className="w-full text-left px-3 py-2 text-sm border-b last:border-0 hover:bg-gray-50">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-gray-500">{c.customer_id} &middot; {c.mobile}</div>
                    </button>
                  ))}
                </div>
              )}
              {convertForm.customer_id && <div className="bg-blue-50 rounded-lg p-2 text-sm">Selected: {customerSearch}</div>}
            </div>
            {/* Inventory Selection */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Inventory Unit (optional)</label>
              <select value={convertForm.inventory_id} onChange={e => setConvertForm({...convertForm, inventory_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">No specific unit</option>
                {inventoryList.map(inv => (
                  <option key={inv.id} value={inv.inventory_id || inv.id}>{inv.unit_number} â€” {inv.block || ''} ({inv.area_marla} marla)</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Area (Marla)" type="number" step="0.01" required value={convertForm.area_marla} onChange={e => setConvertForm({...convertForm, area_marla: e.target.value})} />
              <Input label="Rate per Marla (PKR)" type="number" required value={convertForm.rate_per_marla} onChange={e => setConvertForm({...convertForm, rate_per_marla: e.target.value})} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Input label="# Installments" type="number" value={convertForm.num_installments} onChange={e => setConvertForm({...convertForm, num_installments: parseInt(e.target.value) || 4})} />
              <Input label="First Due Date" type="date" value={convertForm.first_due_date} onChange={e => setConvertForm({...convertForm, first_due_date: e.target.value})} />
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Installment Cycle</label>
                <select value={convertForm.installment_cycle} onChange={e => setConvertForm({...convertForm, installment_cycle: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="bi-annual">Bi-Annual</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Input label="Unit #" value={convertForm.unit_number} onChange={e => setConvertForm({...convertForm, unit_number: e.target.value})} />
              <Input label="Block" value={convertForm.block} onChange={e => setConvertForm({...convertForm, block: e.target.value})} />
              <Input label="Broker Commission %" type="number" step="0.1" value={convertForm.broker_commission_rate} onChange={e => setConvertForm({...convertForm, broker_commission_rate: e.target.value})} />
            </div>
            <Input label="Notes" value={convertForm.notes} onChange={e => setConvertForm({...convertForm, notes: e.target.value})} />
            {convertForm.rate_per_marla && convertForm.area_marla && (
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Value:</span>
                  <span className="font-semibold">{formatCurrency(parseFloat(convertForm.rate_per_marla) * parseFloat(convertForm.area_marla))}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-gray-500">EOI Token (auto-receipt):</span>
                  <span className="font-semibold text-green-600">{formatCurrency(convertingEoi.amount)}</span>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <button type="button" onClick={() => { setShowConvertModal(false); setConvertingEoi(null); }} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button type="submit" className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Convert to Transaction</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ============================================
// ZAKAT VIEW
// ============================================
function ZakatView({ deepLink = null }) {
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const APPROVER_REPS = ['REP-0009', 'REP-0010'];
  const FUNDS_APPROVER_REPS = ['REP-0010', 'REP-0002'];
  const DISBURSER_REPS = ['REP-0002', 'REP-0011', 'REP-0012', 'REP-0013'];
  const CANCELLER_REPS = ['REP-0002', 'REP-0009', 'REP-0010'];

  const [rows, setRows] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [reps, setReps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [selected, setSelected] = useState(null);
  const [showDisburse, setShowDisburse] = useState(false);
  const [disbursing, setDisbursing] = useState(null);
  const [showApprove, setShowApprove] = useState(false);
  const [approving, setApproving] = useState(null);
  const [showFundsApprove, setShowFundsApprove] = useState(false);
  const [fundsApproving, setFundsApproving] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const categories = ['medical', 'education', 'hardship', 'other'];
  const paymentMethods = ['bank_transfer', 'cash', 'online'];

  const emptyForm = {
    beneficiary_id: '', beneficiary_name: '', beneficiary_cnic: '', beneficiary_mobile: '', beneficiary_address: '',
    amount: '', category: 'medical', purpose: '', approval_reference: '', notes: '',
  };
  const [form, setForm] = useState(emptyForm);
  const [beneficiarySearch, setBeneficiarySearch] = useState('');
  const [createBeneficiary, setCreateBeneficiary] = useState(false);
  const [disburseForm, setDisburseForm] = useState({
    amount: '', disbursed_by: '', payment_method: 'bank_transfer', reference_number: '', receipt_number: '',
    disbursement_date: new Date().toISOString().split('T')[0], notes: '',
  });
  const [approveForm, setApproveForm] = useState({ action: 'approve', approved_amount: '', close_case: false, notes: '' });
  const [fundsApproveForm, setFundsApproveForm] = useState({ action: 'approve', notes: '' });

  const canApprove = APPROVER_REPS.includes(currentUser.rep_id || '');
  const canFundsApprove = FUNDS_APPROVER_REPS.includes(currentUser.rep_id || '');
  const canDisburse = DISBURSER_REPS.includes(currentUser.rep_id || '');
  const canCancel = CANCELLER_REPS.includes(currentUser.rep_id || '');

  useEffect(() => { load(); }, []);
  const load = async () => {
    setLoading(true);
    try {
      const [listRes, dashRes, benRes, repRes] = await Promise.all([
        api.get('/zakat', { params: { limit: 500 } }).catch(() => ({ data: { items: [] } })),
        api.get('/zakat/dashboard').catch(() => ({ data: null })),
        api.get('/zakat/beneficiaries', { params: { limit: 300 } }).catch(() => ({ data: { items: [] } })),
        api.get('/company-reps').catch(() => ({ data: [] })),
      ]);
      setRows(listRes.data?.items || listRes.data || []);
      setDashboard(dashRes.data || null);
      setBeneficiaries(benRes.data?.items || benRes.data || []);
      setReps(repRes.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const filteredRows = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (q) {
      const hay = `${r.zakat_id || ''} ${r.beneficiary_name || ''} ${r.beneficiary_cnic || ''} ${r.beneficiary_mobile || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (statusFilter) {
      if (statusFilter === 'funds_pending' && !['pending', 'postponed'].includes(r.disbursement_approval_status || 'pending')) return false;
      else if (statusFilter === 'funds_approved' && (r.disbursement_approval_status || '') !== 'approved') return false;
      else if (statusFilter === 'ready_for_disbursement' && !(r.can_disburse === true)) return false;
      else if (!['funds_pending', 'funds_approved', 'ready_for_disbursement'].includes(statusFilter) && (r.approval_status || r.status) !== statusFilter) return false;
    }
    if (categoryFilter && r.category !== categoryFilter) return false;
    const rowDate = (r.disbursement_date || (r.created_at || '').slice(0, 10));
    if (dateFrom && rowDate < dateFrom) return false;
    if (dateTo && rowDate > dateTo) return false;
    return true;
  });

  const beneficiaryOptions = beneficiaries.filter((b) => {
    const q = beneficiarySearch.trim().toLowerCase();
    if (!q) return true;
    return `${b.name || ''} ${b.mobile || ''} ${b.cnic || ''} ${b.beneficiary_id || ''}`.toLowerCase().includes(q);
  });
  const disburserReps = reps.filter(r => DISBURSER_REPS.includes(r.rep_id));

  useEffect(() => {
    if (!deepLink) return;
    if (deepLink.statusFilter) setStatusFilter(deepLink.statusFilter);
    if (deepLink.zakatId) setSearch(deepLink.zakatId);
    if (deepLink.entityId || deepLink.zakatId) {
      const hit = rows.find((r) =>
        (deepLink.entityId && String(r.id) === String(deepLink.entityId)) ||
        (deepLink.zakatId && String(r.zakat_id) === String(deepLink.zakatId))
      );
      if (hit) {
        setSelected(hit);
        setShowDetail(true);
      }
    }
  }, [deepLink, rows]);

  const openCreate = () => {
    setEditing(null);
    setCreateBeneficiary(false);
    setBeneficiarySearch('');
    setForm(emptyForm);
    setShowModal(true);
  };
  const openEdit = (r) => {
    if ((r.approval_status || 'pending') !== 'pending') return window.showToast?.('Locked', 'Post-approval records cannot be edited', 'warning');
    setEditing(r);
    setForm({
      beneficiary_id: r.beneficiary_id || '', beneficiary_name: r.beneficiary_name || '',
      beneficiary_cnic: r.beneficiary_cnic || '', beneficiary_mobile: r.beneficiary_mobile || '', beneficiary_address: r.beneficiary_address || '',
      amount: r.amount || '', category: r.category || 'medical', purpose: r.purpose || '', approval_reference: r.approval_reference || '',
      notes: r.notes || '',
    });
    setShowModal(true);
  };

  const saveRecord = async (e) => {
    e.preventDefault();
    if (!form.beneficiary_name && !form.beneficiary_id) return window.showToast?.('Error', 'Beneficiary is required', 'error');
    if (!form.amount || parseFloat(form.amount) <= 0) return window.showToast?.('Error', 'Valid amount is required', 'error');
    try {
      const payload = { ...form, amount: parseFloat(form.amount) };
      if (editing) {
        await api.put(`/zakat/${editing.id || editing.zakat_id}`, payload);
        window.showToast?.('Updated', 'Zakat request updated', 'success');
      } else {
        await api.post('/zakat', payload);
        window.showToast?.('Created', 'Zakat request submitted for CEO/CFO approval', 'success');
      }
      setShowModal(false);
      setEditing(null);
      setForm(emptyForm);
      load();
    } catch (err) {
      window.showToast?.('Error', err.response?.data?.detail || 'Failed to save', 'error');
    }
  };

  const openApprove = (r, action = 'approve') => {
    setApproving(r);
    setApproveForm({
      action,
      approved_amount: action === 'approve' ? (r.approved_amount || r.amount || '') : '',
      close_case: Boolean(r.case_status === 'closed'),
      notes: '',
    });
    setShowApprove(true);
  };

  const submitApproval = async (e) => {
    e.preventDefault();
    try {
      const payload = { action: approveForm.action, notes: approveForm.notes || '' };
      if (approveForm.action === 'approve') {
        payload.approved_amount = parseFloat(approveForm.approved_amount || 0);
        payload.close_case = Boolean(approveForm.close_case);
      }
      await api.post(`/zakat/${approving.id || approving.zakat_id}/approve`, payload);
      window.showToast?.('Saved', approveForm.action === 'reject' ? 'Zakat request rejected' : 'Approval saved', 'success');
      setShowApprove(false);
      setApproving(null);
      load();
    } catch (err) {
      window.showToast?.('Error', err.response?.data?.detail || 'Failed to save approval', 'error');
    }
  };

  const openFundsApprove = (r, action = 'approve') => {
    setFundsApproving(r);
    setFundsApproveForm({ action, notes: '' });
    setShowFundsApprove(true);
  };

  const submitFundsApproval = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/zakat/${fundsApproving.id || fundsApproving.zakat_id}/approve-disbursement`, {
        action: fundsApproveForm.action,
        notes: fundsApproveForm.notes || '',
      });
      window.showToast?.('Saved', fundsApproveForm.action === 'approve' ? 'Ready for disbursement approved' : 'Disbursement postponed', 'success');
      setShowFundsApprove(false);
      setFundsApproving(null);
      load();
    } catch (err) {
      window.showToast?.('Error', err.response?.data?.detail || 'Failed to update disbursement approval', 'error');
    }
  };

  const cancelRecord = async (r) => {
    const reason = prompt(`Cancel ${r.zakat_id}? Enter reason (optional):`);
    if (reason === null) return;
    try {
      await api.post(`/zakat/${r.id || r.zakat_id}/cancel`, { reason });
      window.showToast?.('Cancelled', 'Zakat record cancelled', 'success');
      load();
    } catch (err) { window.showToast?.('Error', err.response?.data?.detail || 'Failed to cancel', 'error'); }
  };

  const disburseRecord = async (e) => {
    e.preventDefault();
    if (!disburseForm.amount || parseFloat(disburseForm.amount) <= 0) {
      return window.showToast?.('Error', 'Disbursed amount is required', 'error');
    }
    try {
      await api.post(`/zakat/${disbursing.id || disbursing.zakat_id}/disburse`, {
        ...disburseForm,
        amount: parseFloat(disburseForm.amount),
      });
      window.showToast?.('Saved', 'Disbursement installment recorded', 'success');
      setShowDisburse(false);
      setDisbursing(null);
      setDisburseForm({ amount: '', disbursed_by: '', payment_method: 'bank_transfer', reference_number: '', receipt_number: '', disbursement_date: new Date().toISOString().split('T')[0], notes: '' });
      load();
    } catch (err) { window.showToast?.('Error', err.response?.data?.detail || 'Failed to disburse', 'error'); }
  };

  const exportCsv = () => downloadCSV(filteredRows.map((r) => ({
    'Zakat ID': r.zakat_id,
    'Date': r.disbursement_date || (r.created_at || '').slice(0, 10),
    'Beneficiary': r.beneficiary_name,
    'CNIC': r.beneficiary_cnic || '',
    'Mobile': r.beneficiary_mobile || '',
    'Requested Amount (PKR)': r.requested_amount || r.amount || 0,
    'Approved Amount (PKR)': r.approved_amount || 0,
    'Disbursed Amount (PKR)': r.disbursed_total || 0,
    'Remaining (PKR)': r.remaining_amount || 0,
    'Approval Status': r.approval_status || '',
    'Case Status': r.case_status || '',
    'Status': r.status || '',
  })), `zakat_register_${new Date().toISOString().split('T')[0]}.csv`);

  const summary = dashboard?.summary || {};
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold text-gray-900">Zakat Approval & Disbursement Register</h2><p className="text-sm text-gray-500 mt-1">Requests require CEO/CFO case approval, then CFO disbursement approval, before installments.</p></div>
        <div className="flex items-center gap-3"><button onClick={exportCsv} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 text-gray-700">Export CSV</button><button onClick={openCreate} className="bg-gray-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-800">New Zakat Request</button></div>
      </div>

      {summary && <div className="grid grid-cols-2 md:grid-cols-8 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border p-5"><div className="text-xs text-gray-400 uppercase">Requests</div><div className="mt-2 text-2xl font-semibold">{summary.requested_total_count || 0}</div><div className="text-sm text-gray-500">{formatCurrency(summary.requested_total_value || 0)}</div></div>
        <div className="bg-white rounded-2xl shadow-sm border p-5"><div className="text-xs text-blue-500 uppercase">Approved</div><div className="mt-2 text-2xl font-semibold text-blue-600">{summary.approved_total_count || 0}</div><div className="text-sm text-gray-500">{formatCurrency(summary.approved_total_value || 0)}</div></div>
        <div className="bg-white rounded-2xl shadow-sm border p-5"><div className="text-xs text-purple-500 uppercase">Pending CFO</div><div className="mt-2 text-2xl font-semibold text-purple-600">{summary.funds_pending_count || 0}</div><div className="text-sm text-gray-500">{formatCurrency(summary.funds_pending_value || 0)}</div></div>
        <div className="bg-white rounded-2xl shadow-sm border p-5"><div className="text-xs text-sky-500 uppercase">CFO Approved</div><div className="mt-2 text-2xl font-semibold text-sky-600">{summary.funds_approved_count || 0}</div><div className="text-sm text-gray-500">{formatCurrency(summary.funds_approved_value || 0)}</div></div>
        <div className="bg-white rounded-2xl shadow-sm border p-5"><div className="text-xs text-indigo-500 uppercase">Ready to Disburse</div><div className="mt-2 text-2xl font-semibold text-indigo-600">{summary.ready_for_disbursement_count || 0}</div><div className="text-sm text-gray-500">{formatCurrency(summary.ready_for_disbursement_value || 0)}</div></div>
        <div className="bg-white rounded-2xl shadow-sm border p-5"><div className="text-xs text-emerald-500 uppercase">Disbursed</div><div className="mt-2 text-2xl font-semibold text-emerald-600">{summary.disbursed_total_count || 0}</div><div className="text-sm text-gray-500">{formatCurrency(summary.disbursed_total_value || 0)}</div></div>
        <div className="bg-white rounded-2xl shadow-sm border p-5"><div className="text-xs text-amber-500 uppercase">Pending</div><div className="mt-2 text-2xl font-semibold text-amber-600">{summary.pending_count || 0}</div><div className="text-sm text-gray-500">{formatCurrency(summary.pending_value || 0)}</div></div>
        <div className="bg-white rounded-2xl shadow-sm border p-5"><div className="text-xs text-indigo-500 uppercase">Open Cases</div><div className="mt-2 text-2xl font-semibold text-indigo-600">{summary.open_cases_count || 0}</div><div className="text-sm text-gray-500">{formatCurrency(summary.open_cases_value || 0)}</div></div>
        <div className="bg-white rounded-2xl shadow-sm border p-5"><div className="text-xs text-gray-500 uppercase">Closed Cases</div><div className="mt-2 text-2xl font-semibold text-gray-700">{summary.closed_cases_count || 0}</div><div className="text-sm text-gray-500">{formatCurrency(summary.closed_cases_value || 0)}</div></div>
      </div>}

      <div className="bg-white rounded-2xl shadow-sm border p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 items-end">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Search</label><input value={search} onChange={e => setSearch(e.target.value)} placeholder="ZKT / Name / CNIC" className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Approval Status</label><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">All</option><option value="pending">Pending CEO/CFO</option><option value="approved">Approved (Stage 1)</option><option value="funds_pending">Pending CFO Disbursement Approval</option><option value="funds_approved">CFO Approved</option><option value="ready_for_disbursement">Ready for Disbursement</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option></select></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Category</label><select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">All</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">From</label><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">To</label><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div><button onClick={() => { setSearch(''); setStatusFilter(''); setCategoryFilter(''); setDateFrom(''); setDateTo(''); }} className="px-3 py-2 text-sm text-red-600 hover:text-red-800 font-medium">Clear</button></div>
        </div>
      </div>

      {loading ? <Loader /> : rows.length === 0 ? <Empty msg="No zakat records yet" /> : filteredRows.length === 0 ? <Empty msg="No records match current filters" /> : (
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <table className="w-full"><thead><tr className="border-b border-gray-100"><th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Zakat</th><th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Beneficiary</th><th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4">Requested</th><th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4">Approved</th><th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4">Disbursed</th><th className="text-center text-xs font-medium text-gray-500 uppercase px-6 py-4">Status</th><th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4"></th></tr></thead>
            <tbody className="divide-y divide-gray-50">{filteredRows.map((r) => <tr key={r.id || r.zakat_id} className="hover:bg-gray-50 cursor-pointer" onClick={() => { setSelected(r); setShowDetail(true); }}>
              <td className="px-6 py-4"><div className="text-sm font-mono text-gray-900">{r.zakat_id}</div><div className="text-xs text-gray-400">{(r.created_at || '').slice(0, 10) || '-'}</div></td>
              <td className="px-6 py-4"><div className="text-sm font-medium">{r.beneficiary_name}</div><div className="text-xs text-gray-400">{r.beneficiary_mobile || '-'}</div></td>
              <td className="px-6 py-4 text-right text-sm font-semibold">{formatCurrency(r.requested_amount || r.amount || 0)}</td>
              <td className="px-6 py-4 text-right text-sm font-semibold text-blue-600">{formatCurrency(r.approved_amount || 0)}</td>
              <td className="px-6 py-4 text-right text-sm font-semibold text-emerald-600">{formatCurrency(r.disbursed_total || 0)}</td>
              <td className="px-6 py-4 text-center">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${(r.approval_status || r.status) === 'pending' ? 'bg-amber-50 text-amber-700' : (r.approval_status || r.status) === 'approved' ? 'bg-blue-50 text-blue-700' : (r.approval_status || r.status) === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-700'}`}>{r.approval_status || r.status}</span>
                {(r.approval_status || '') === 'approved' && <div className="mt-1 text-[11px] text-gray-500">{(r.disbursement_approval_status || 'pending') === 'approved' ? 'CFO disbursement approved' : (r.disbursement_approval_status || 'pending') === 'postponed' ? 'CFO postponed' : 'Pending CFO disbursement approval'}</div>}
              </td>
              <td className="px-6 py-4 text-right" onClick={(ev) => ev.stopPropagation()}><div className="flex items-center justify-end gap-1">
                {(r.approval_status || 'pending') === 'pending' && <button onClick={() => openEdit(r)} className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded">Edit</button>}
                {canApprove && (r.approval_status || 'pending') === 'pending' && <button onClick={() => openApprove(r, 'approve')} className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded">Approve</button>}
                {canApprove && (r.approval_status || 'pending') === 'pending' && <button onClick={() => openApprove(r, 'reject')} className="px-2 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded">Reject</button>}
                {canApprove && (r.approval_status || '') === 'approved' && Number(r.disbursement_count || 0) === 0 && <button onClick={() => openApprove(r, 'approve')} className="px-2 py-1 text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded">Revise</button>}
                {canFundsApprove && (r.approval_status || '') === 'approved' && (r.disbursement_approval_status || 'pending') !== 'approved' && <button onClick={() => openFundsApprove(r, 'approve')} className="px-2 py-1 text-xs text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded">Approve Disbursement</button>}
                {canFundsApprove && (r.approval_status || '') === 'approved' && <button onClick={() => openFundsApprove(r, 'postpone')} className="px-2 py-1 text-xs text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded">Postpone</button>}
                {canDisburse && (r.approval_status || '') === 'approved' && (r.disbursement_approval_status || '') === 'approved' && r.can_disburse && <button onClick={() => { setDisbursing(r); setDisburseForm({ ...disburseForm, amount: '', disbursement_date: new Date().toISOString().split('T')[0] }); setShowDisburse(true); }} className="px-2 py-1 text-xs text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded">Disburse</button>}
                {((r.approval_status || 'pending') === 'pending' || canCancel) && (r.status !== 'cancelled') && <button onClick={() => cancelRecord(r)} className="px-2 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded">Cancel</button>}
              </div></td>
            </tr>)}</tbody>
          </table>
        </div>
      )}

      {showModal && <Modal title={editing ? `Edit ${editing.zakat_id}` : 'Record New Zakat'} onClose={() => { setShowModal(false); setEditing(null); }} wide>
        <form onSubmit={saveRecord} className="space-y-4">
          <div className="flex items-center justify-between border-b pb-3"><div className="text-sm font-medium text-gray-700">Beneficiary</div><label className="text-sm flex items-center gap-2"><input type="checkbox" checked={createBeneficiary} onChange={e => setCreateBeneficiary(e.target.checked)} />Create New</label></div>
          {!createBeneficiary && <div>{form.beneficiary_id ? <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-2"><div><div className="text-sm font-medium text-blue-900">{form.beneficiary_name}</div><div className="text-xs text-blue-600">{form.beneficiary_cnic || '-'} · {form.beneficiary_mobile || '-'}</div></div><button type="button" onClick={() => { setForm({ ...form, beneficiary_id: '', beneficiary_name: '', beneficiary_cnic: '', beneficiary_mobile: '', beneficiary_address: '' }); setBeneficiarySearch(''); }} className="text-xs text-red-500 hover:text-red-700 font-medium">Clear</button></div> : <><input type="text" placeholder="Search beneficiary by name, CNIC, mobile..." value={beneficiarySearch} onChange={e => setBeneficiarySearch(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm mb-2" />{beneficiarySearch && <div className="border rounded-lg max-h-40 overflow-y-auto">{beneficiaryOptions.length === 0 ? <div className="px-3 py-2 text-sm text-gray-400">No matches</div> : beneficiaryOptions.slice(0, 6).map((b) => <button key={b.id || b.beneficiary_id} type="button" onClick={() => { setForm({ ...form, beneficiary_id: b.beneficiary_id || b.id, beneficiary_name: b.name || '', beneficiary_cnic: b.cnic || '', beneficiary_mobile: b.mobile || '', beneficiary_address: b.address || '' }); setBeneficiarySearch(''); }} className="w-full text-left px-3 py-2 text-sm border-b last:border-0 hover:bg-gray-50"><div className="font-medium">{b.name}</div><div className="text-xs text-gray-500">{b.beneficiary_id || '-'} · {b.mobile || '-'}</div></button>)}</div>}</>}</div>}
          <div className="grid grid-cols-2 gap-4"><Input label="Beneficiary Name" required value={form.beneficiary_name} onChange={e => setForm({ ...form, beneficiary_name: e.target.value })} /><Input label="CNIC" value={form.beneficiary_cnic} onChange={e => setForm({ ...form, beneficiary_cnic: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4"><Input label="Mobile" value={form.beneficiary_mobile} onChange={e => setForm({ ...form, beneficiary_mobile: e.target.value })} /><Input label="Requested Amount (PKR)" type="number" required value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
          <Input label="Address" value={form.beneficiary_address} onChange={e => setForm({ ...form, beneficiary_address: e.target.value })} />
          <div className="grid grid-cols-2 gap-4"><div><label className="block text-xs font-medium text-gray-500 mb-1">Category</label><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">{categories.map(c => <option key={c} value={c}>{c}</option>)}</select></div><Input label="Approval Reference" value={form.approval_reference} onChange={e => setForm({ ...form, approval_reference: e.target.value })} /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Purpose</label><textarea value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Notes</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={() => { setShowModal(false); setEditing(null); }} className="px-4 py-2 text-sm text-gray-600">Cancel</button><button type="submit" className="px-6 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800">{editing ? 'Update Request' : 'Submit Request'}</button></div>
        </form>
      </Modal>}

      {showApprove && approving && <Modal title={`${approveForm.action === 'reject' ? 'Reject' : 'Approve'} ${approving.zakat_id}`} onClose={() => { setShowApprove(false); setApproving(null); }} wide>
        <form onSubmit={submitApproval} className="space-y-4">
          {approveForm.action === 'approve' && <div className="grid grid-cols-2 gap-4"><Input label="Requested Amount (PKR)" value={approving.requested_amount || approving.amount || 0} disabled /><Input label="Approved Amount (PKR)" type="number" required value={approveForm.approved_amount} onChange={e => setApproveForm({ ...approveForm, approved_amount: e.target.value })} /></div>}
          {approveForm.action === 'approve' && <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={approveForm.close_case} onChange={e => setApproveForm({ ...approveForm, close_case: e.target.checked })} />Close case now</label>}
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Notes</label><textarea value={approveForm.notes} onChange={e => setApproveForm({ ...approveForm, notes: e.target.value })} rows={3} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={() => { setShowApprove(false); setApproving(null); }} className="px-4 py-2 text-sm text-gray-600">Cancel</button><button type="submit" className={`px-6 py-2 text-sm text-white rounded-lg ${approveForm.action === 'reject' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>{approveForm.action === 'reject' ? 'Confirm Rejection' : 'Confirm Approval'}</button></div>
        </form>
      </Modal>}

      {showFundsApprove && fundsApproving && <Modal title={`${fundsApproveForm.action === 'postpone' ? 'Postpone' : 'Approve'} Disbursement: ${fundsApproving.zakat_id}`} onClose={() => { setShowFundsApprove(false); setFundsApproving(null); }} wide>
        <form onSubmit={submitFundsApproval} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Approved Amount (PKR)" value={fundsApproving.approved_amount || 0} disabled />
            <Input label="Remaining (PKR)" value={fundsApproving.remaining_amount || 0} disabled />
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Notes</label><textarea value={fundsApproveForm.notes} onChange={e => setFundsApproveForm({ ...fundsApproveForm, notes: e.target.value })} rows={3} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={() => { setShowFundsApprove(false); setFundsApproving(null); }} className="px-4 py-2 text-sm text-gray-600">Cancel</button><button type="submit" className={`px-6 py-2 text-sm text-white rounded-lg ${fundsApproveForm.action === 'postpone' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-purple-600 hover:bg-purple-700'}`}>{fundsApproveForm.action === 'postpone' ? 'Confirm Postpone' : 'Approve for Disbursement'}</button></div>
        </form>
      </Modal>}

      {showDetail && selected && <Modal title={`Zakat: ${selected.zakat_id}`} onClose={() => { setShowDetail(false); setSelected(null); }} wide>
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium text-gray-500 mb-1">Beneficiary</label><div className="text-sm font-medium">{selected.beneficiary_name}</div></div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1">CNIC</label><div className="text-sm">{selected.beneficiary_cnic || '-'}</div></div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1">Requested Amount</label><div className="text-sm font-semibold">{formatCurrency(selected.requested_amount || selected.amount || 0)}</div></div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1">Approved Amount</label><div className="text-sm font-semibold text-blue-600">{formatCurrency(selected.approved_amount || 0)}</div></div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1">Disbursed Total</label><div className="text-sm font-semibold text-emerald-600">{formatCurrency(selected.disbursed_total || 0)}</div></div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1">Remaining</label><div className="text-sm">{formatCurrency(selected.remaining_amount || 0)}</div></div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1">Approval Status</label><div className="text-sm">{selected.approval_status || '-'}</div></div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1">Case Status</label><div className="text-sm">{selected.case_status || '-'}</div></div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1">Disbursement Approval</label><div className="text-sm">{selected.disbursement_approval_status || 'pending'}</div></div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1">Disbursement Approved By</label><div className="text-sm">{selected.disbursement_approved_by_name || '-'}</div></div>
          </div>
          <div className="border-t pt-4"><MediaManager entityType="zakat" entityId={selected.id || selected.zakat_id} onUpload={() => {}} /></div>
        </div>
      </Modal>}

      {showDisburse && disbursing && <Modal title={`Disburse ${disbursing.zakat_id}`} onClose={() => { setShowDisburse(false); setDisbursing(null); }} wide>
        <form onSubmit={disburseRecord} className="space-y-4">
          <div className="grid grid-cols-3 gap-4"><Input label="Remaining (PKR)" value={disbursing.remaining_amount || 0} disabled /><Input label="Disburse Amount (PKR)" type="number" required value={disburseForm.amount} onChange={e => setDisburseForm({ ...disburseForm, amount: e.target.value })} /><Input label="Date" type="date" value={disburseForm.disbursement_date} onChange={e => setDisburseForm({ ...disburseForm, disbursement_date: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4"><div><label className="block text-xs font-medium text-gray-500 mb-1">Disbursed By</label><select value={disburseForm.disbursed_by} onChange={e => setDisburseForm({ ...disburseForm, disbursed_by: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">Current user</option>{disburserReps.map(r => <option key={r.id} value={r.rep_id}>{r.name} ({r.rep_id})</option>)}</select></div><div><label className="block text-xs font-medium text-gray-500 mb-1">Payment Method</label><select value={disburseForm.payment_method} onChange={e => setDisburseForm({ ...disburseForm, payment_method: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">{paymentMethods.map(m => <option key={m} value={m}>{m}</option>)}</select></div></div>
          <div className="grid grid-cols-2 gap-4"><Input label="Reference #" value={disburseForm.reference_number} onChange={e => setDisburseForm({ ...disburseForm, reference_number: e.target.value })} /><Input label="Receipt #" value={disburseForm.receipt_number} onChange={e => setDisburseForm({ ...disburseForm, receipt_number: e.target.value })} /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Notes</label><textarea value={disburseForm.notes} onChange={e => setDisburseForm({ ...disburseForm, notes: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
          <div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={() => { setShowDisburse(false); setDisbursing(null); }} className="px-4 py-2 text-sm text-gray-600">Cancel</button><button type="submit" className="px-6 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Record Disbursement</button></div>
        </form>
      </Modal>}
    </div>
  );
}
// ============================================
// INTERACTIONS VIEW (McKinsey-style dashboard)
// ============================================
function InteractionsView() {
  const [interactions, setInteractions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [reps, setReps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    company_rep_id: '', interaction_type: 'call', status: getDefaultInteractionStatus('call'), notes: '', next_follow_up: '', contact_number: ''
  });
  const [selectedEntityType, setSelectedEntityType] = useState('customer');
  const [selectedEntity, setSelectedEntity] = useState(null);
  const interactionContactOptions = selectedEntity
    ? [selectedEntity.mobile, ...(selectedEntity.additional_mobiles || [])].filter(Boolean)
    : [];

  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => { loadData(); }, []);
  const loadData = async () => {
    try {
      const [intRes, sumRes, repRes] = await Promise.all([
        api.get('/interactions', { params: { limit: 50 } }),
        api.get('/interactions/summary'),
        api.get('/company-reps')
      ]);
      setInteractions(intRes.data);
      setSummary(sumRes.data);
      setReps(repRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedEntity) { alert('Please select a contact'); return; }
    try {
      const payload = {
        company_rep_id: form.company_rep_id,
        interaction_type: form.interaction_type,
        status: form.status || null,
        notes: form.notes || null,
        contact_number: form.contact_number || null,
        next_follow_up: form.next_follow_up || null
      };
      if (selectedEntityType === 'customer') payload.customer_id = selectedEntity.id;
      else if (selectedEntityType === 'broker') payload.broker_id = selectedEntity.id;
      else if (selectedEntityType === 'lead') payload.lead_id = selectedEntity.id;

      await api.post('/interactions', payload);
      if (window.showToast) window.showToast('Interaction Logged', `${form.interaction_type} with ${selectedEntity.name} recorded`, 'success');
      setShowModal(false);
      setForm({ company_rep_id: '', interaction_type: 'call', status: getDefaultInteractionStatus('call'), notes: '', next_follow_up: '', contact_number: '' });
      setSelectedEntity(null);
      setSelectedEntityType('customer');
      loadData();
    } catch (e) { alert(e.response?.data?.detail || 'Error'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold text-gray-900">Interactions</h2>
          <p className="text-sm text-gray-500 mt-1">Track rep communications</p></div>
        <button onClick={() => {
          setForm({
            company_rep_id: currentUser.id || '',
            interaction_type: 'call',
            status: getDefaultInteractionStatus('call'),
            notes: '',
            next_follow_up: '',
            contact_number: ''
          });
          setSelectedEntity(null);
          setSelectedEntityType('customer');
          setShowModal(true);
        }} className="bg-gray-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-800">Log Interaction</button>
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard label="Total Interactions" value={summary.total_interactions} />
            <SummaryCard label="Total Calls" value={summary.total_calls} />
            <SummaryCard label="Legacy Messages" value={summary.total_messages} />
            <SummaryCard label="WhatsApp" value={summary.total_whatsapp} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl shadow-sm border p-5">
              <div className="text-xs font-medium text-gray-400 uppercase">Today</div>
              <div className="mt-2 text-3xl font-semibold text-gray-900">{summary.today}</div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border p-5">
              <div className="text-xs font-medium text-gray-400 uppercase">This Week</div>
              <div className="mt-2 text-3xl font-semibold text-gray-900">{summary.this_week}</div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border p-5">
              <div className="text-xs font-medium text-gray-400 uppercase">This Month</div>
              <div className="mt-2 text-3xl font-semibold text-gray-900">{summary.this_month}</div>
            </div>
          </div>
          {summary.pending_followups > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="text-sm font-medium text-amber-800">âš ï¸ {summary.pending_followups} pending follow-ups due</div>
            </div>
          )}
        </>
      )}

      {loading ? <Loader /> : interactions.length === 0 ? <Empty msg="No interactions logged" /> : (
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">ID</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Rep</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Contact</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-6 py-4">Type</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Status</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Follow-up</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Date & Time</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {interactions.map(i => (
                <tr key={i.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-mono text-gray-500">{i.interaction_id}</td>
                  <td className="px-6 py-4 text-sm">{i.rep_name}</td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium">{i.customer_name || i.broker_name || i.lead_name || '-'}</div>
                    <div className="text-xs text-gray-400">{i.customer_id ? 'Customer' : i.broker_id ? 'Broker' : i.lead_id ? 'Lead' : '-'}</div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      i.interaction_type === 'call' ? 'bg-blue-50 text-blue-700' :
                      i.interaction_type === 'whatsapp' ? 'bg-green-50 text-green-700' :
                      i.interaction_type === 'meeting' ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-100'
                    }`}>{formatInteractionType(i.interaction_type, i.status)}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{i.status || '-'}</td>
                  <td className="px-6 py-4 text-sm">{i.next_follow_up || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{new Date(i.created_at + (i.created_at.endsWith('Z') ? '' : 'Z')).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title="Log Interaction" onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="block text-xs font-medium text-gray-500 mb-1">Company Rep *</label>
              <select required value={form.company_rep_id} onChange={e => setForm({...form, company_rep_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">Select Rep</option>
                {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>

            <EntitySearchSelect
              value={selectedEntity}
              onChange={(entity) => {
                setSelectedEntity(entity);
                setForm(f => ({ ...f, contact_number: '' }));
              }}
              entityType={selectedEntityType}
              onEntityTypeChange={(t) => {
                setSelectedEntityType(t);
                setForm(f => ({ ...f, contact_number: '' }));
              }}
              showTypeSelector={true}
            />
            {selectedEntity?.temperature && (
              <div className="text-xs text-gray-600">
                Temperature: <span className={`px-2 py-0.5 rounded-full font-medium ${getTemperatureBadgeClass(selectedEntity.temperature)}`}>{selectedEntity.temperature}</span>
              </div>
            )}

            {interactionContactOptions.length > 1 && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Spoke On Number (Optional)</label>
                <select value={form.contact_number} onChange={e => setForm({...form, contact_number: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">Select number</option>
                  {interactionContactOptions.map(num => <option key={num} value={num}>{num}</option>)}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Type *</label>
                <select required value={form.interaction_type} onChange={e => setForm({...form, interaction_type: e.target.value, status: getDefaultInteractionStatus(e.target.value)})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  {INTERACTION_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                  {getInteractionStatusOptions(form.interaction_type).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </div>
            <Input label="Notes" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
            <Input label="Next Follow-up" type="date" value={form.next_follow_up} onChange={e => setForm({...form, next_follow_up: e.target.value})} />
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button type="submit" disabled={!selectedEntity} className={`px-4 py-2 text-sm rounded-lg ${selectedEntity ? 'bg-gray-900 text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}>Log</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ============================================
// CAMPAIGNS VIEW (Lead Management)
// ============================================
function CampaignsView() {
  const [campaigns, setCampaigns] = useState([]);
  const [leads, setLeads] = useState([]);
  const [projects, setProjects] = useState([]);
  const [lookupValues, setLookupValues] = useState({
    [LOOKUP_KEYS.CUSTOMER_SOURCE]: [],
    [LOOKUP_KEYS.CUSTOMER_OCCUPATION]: []
  });
  const [summary, setSummary] = useState(null);
  const [reps, setReps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [campaignForm, setCampaignForm] = useState({ name: '', source: 'facebook', start_date: '', budget: '', notes: '' });
  const [leadForm, setLeadForm] = useState(emptyEnhancedLead);
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [stages, setStages] = useState([]);
  const [campaignSubTab, setCampaignSubTab] = useState('campaigns');

  useEffect(() => { loadData(); }, []);
  const loadData = async () => {
    try {
      const [cmpRes, sumRes, repRes, stgRes, projRes, lookupRes] = await Promise.all([
        api.get('/campaigns').catch(() => ({ data: [] })),
        api.get('/campaigns/summary').catch(() => ({ data: { total_campaigns: 0, active_campaigns: 0, total_leads: 0, converted_leads: 0, total_budget: 0, conversion_rate: 0 } })),
        api.get('/company-reps').catch(() => ({ data: [] })),
        api.get('/pipeline-stages').catch(() => ({ data: [] })),
        api.get('/projects').catch(() => ({ data: [] })),
        fetchLookupValues(api, [LOOKUP_KEYS.CUSTOMER_SOURCE, LOOKUP_KEYS.CUSTOMER_OCCUPATION])
      ]);
      setCampaigns(cmpRes.data || []);
      setSummary(sumRes.data);
      setReps(repRes.data || []);
      setStages(stgRes.data || []);
      setProjects(projRes.data || []);
      setLookupValues(lookupRes);
    } catch (e) { console.error(e); setSummary({ total_campaigns: 0, active_campaigns: 0, total_leads: 0, converted_leads: 0, total_budget: 0, conversion_rate: 0 }); }
    finally { setLoading(false); }
  };

  const loadLeads = async (campaign) => {
    setSelectedCampaign(campaign);
    try {
      const res = await api.get('/leads', { params: { campaign_id: campaign.id } });
      setLeads(res.data || []);
    } catch (e) { console.error(e); setLeads([]); }
  };

  const handleCampaignSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/campaigns', campaignForm);
      setShowCampaignModal(false);
      setCampaignForm({ name: '', source: 'facebook', start_date: '', budget: '', notes: '' });
      loadData();
    } catch (e) { alert(e.response?.data?.detail || 'Error'); }
  };

  const handleLeadSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...leadForm,
        campaign_id: selectedCampaign?.id,
        additional_mobiles: (leadForm.additional_mobiles || []).map(v => String(v || '').trim()).filter(Boolean)
      };
      await api.post('/leads', payload);
      setShowLeadModal(false);
      setLeadForm(emptyEnhancedLead);
      if (selectedCampaign) loadLeads(selectedCampaign);
      loadData();
      if (window.showToast) window.showToast('Success', 'Lead created successfully', 'success');
    } catch (e) {
      if (e.response?.status === 409 && e.response?.data?.detail?.duplicate) {
        const dup = e.response.data.detail.duplicate;
        const repInfo = dup.assigned_rep ? ` | Assigned to: ${dup.assigned_rep}` : '';
        if (window.showToast) window.showToast('Duplicate Mobile', `Already exists as ${dup.type} ${dup.entity_id} â€” ${dup.name}${repInfo}`, 'error');
        // Keep modal open so user can correct mobile
      } else {
        alert(e.response?.data?.detail?.message || e.response?.data?.detail || 'Error');
      }
    }
  };

  const handleImport = async () => {
    if (!importFile || !selectedCampaign) return;
    const fd = new FormData(); fd.append('file', importFile);
    try {
      const res = await api.post(`/leads/bulk-import?campaign_id=${selectedCampaign.id}`, fd);
      setImportResult(res.data);
      setImportFile(null);
      loadLeads(selectedCampaign);
      loadData();
    } catch (e) { setImportResult({ success: 0, errors: [e.message] }); }
  };

  const updateLeadStage = async (lead, stage) => {
    try {
      await api.put(`/leads/${lead.id}/stage`, { stage });
      if (selectedCampaign) loadLeads(selectedCampaign);
      loadData();
    } catch (e) { if (window.showToast) window.showToast('Error', e.response?.data?.detail || 'Failed to update stage', 'error'); }
  };

  const assignRep = async (lead, repId) => {
    try {
      await api.put(`/leads/${lead.id}`, { assigned_rep_id: repId || null });
      if (selectedCampaign) loadLeads(selectedCampaign);
    } catch (e) { alert('Error assigning rep'); }
  };

  const syncLeadToDB = async (lead, convertTo) => {
    if (!confirm(`Sync "${lead.name}" to ${convertTo} database? This will create or link a ${convertTo} record.`)) return;
    try {
      const res = await api.post(`/leads/${lead.id}/convert`, { convert_to: convertTo });
      if (selectedCampaign) loadLeads(selectedCampaign);
      loadData();
      const msg = res.data.linked_existing
        ? `Linked to existing ${convertTo} (${res.data.entity_id})`
        : `New ${convertTo} created (${res.data.entity_id})`;
      if (window.showToast) window.showToast('Synced', msg, 'success');
    } catch (e) { if (window.showToast) window.showToast('Error', e.response?.data?.detail || 'Sync failed', 'error'); }
  };
  const updateMobile = (index, value) => {
    const mobiles = [...(leadForm.additional_mobiles || ['', '', '', ''])];
    mobiles[index] = value;
    setLeadForm({...leadForm, additional_mobiles: mobiles});
  };
  const role = getUserRole();
  const deleteLead = async (lead) => {
    if (!confirm(`Delete lead "${lead.name}" (${lead.lead_id})? This cannot be undone.`)) return;
    try {
      await api.delete(`/leads/${lead.id}`);
      if (selectedCampaign) loadLeads(selectedCampaign);
      if (window.showToast) window.showToast('Deleted', `Lead ${lead.lead_id} deleted`, 'success');
    } catch (e) { if (window.showToast) window.showToast('Error', e.response?.data?.detail || 'Delete failed', 'error'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold text-gray-900">Campaigns</h2>
          <p className="text-sm text-gray-500 mt-1">Manage ad campaigns and leads</p></div>
        {campaignSubTab === 'campaigns' && (
          <button onClick={() => setShowCampaignModal(true)} className="bg-gray-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-800">New Campaign</button>
        )}
      </div>

      {/* Sub-tabs: Campaigns | Analytics */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button onClick={() => setCampaignSubTab('campaigns')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${campaignSubTab === 'campaigns' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          Campaigns
        </button>
        <button onClick={() => setCampaignSubTab('analytics')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${campaignSubTab === 'analytics' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          Analytics
        </button>
      </div>

      {campaignSubTab === 'analytics' && <CampaignAnalytics />}

      {campaignSubTab === 'campaigns' && (
      <>
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Total Campaigns" value={summary.total_campaigns} />
          <SummaryCard label="Active" value={summary.active_campaigns} />
          <SummaryCard label="Total Leads" value={summary.total_leads} />
          <SummaryCard label="Conversion Rate" value={`${summary.conversion_rate}%`} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Campaigns List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-sm border p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Campaigns</h3>
            {loading ? <Loader /> : campaigns.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No campaigns</div>
            ) : (
              <div className="space-y-2">
                {campaigns.map(c => (
                  <button key={c.id} onClick={() => loadLeads(c)}
                    className={`w-full text-left p-3 rounded-lg border ${selectedCampaign?.id === c.id ? 'bg-blue-50 border-blue-500' : 'hover:bg-gray-50'}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-sm">{c.name}</div>
                        <div className="text-xs text-gray-500">{c.source} â€¢ {c.start_date}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${c.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100'}`}>{c.status}</span>
                    </div>
                    <div className="flex gap-4 mt-2 text-xs">
                      <span className="text-gray-500">Leads: <strong>{c.lead_stats.total}</strong></span>
                      <span className="text-green-600">Converted: <strong>{c.lead_stats.converted}</strong></span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Leads for Selected Campaign */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">
                {selectedCampaign ? `Leads - ${selectedCampaign.name}` : 'Select a campaign'}
              </h3>
              {selectedCampaign && (
                <button onClick={() => setShowLeadModal(true)} className="text-sm text-blue-600 hover:text-blue-800">+ Add Lead</button>
              )}
            </div>
            
            {selectedCampaign && (
              <div className="flex items-center gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
                <input type="file" accept=".csv" onChange={e => setImportFile(e.target.files[0])} className="text-xs" />
                {importFile && <button onClick={handleImport} className="text-sm bg-gray-900 text-white px-3 py-1 rounded">Import</button>}
                <a href="#" onClick={async (e) => { e.preventDefault(); const res = await api.get('/leads/template/download', { responseType: 'blob' }); const url = window.URL.createObjectURL(new Blob([res.data])); const a = document.createElement('a'); a.href = url; a.download = 'leads_template.csv'; a.click(); }} className="text-xs text-gray-500 hover:text-gray-700">Download Template</a>
              </div>
            )}
            
            {importResult && (
              <div className="mb-4 space-y-2">
                {importResult.success > 0 && (
                  <div className="p-3 rounded-lg text-sm bg-green-50 text-green-700">
                    Imported {importResult.success} lead{importResult.success > 1 ? 's' : ''} successfully
                  </div>
                )}
                {importResult.errors?.length > 0 && (
                  <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700">
                    <div className="font-medium">{importResult.errors.length} error{importResult.errors.length > 1 ? 's' : ''}</div>
                    <ul className="mt-1 ml-4 list-disc text-xs max-h-24 overflow-y-auto">
                      {importResult.errors.slice(0, 10).map((err, i) => <li key={i}>{err}</li>)}
                      {importResult.errors.length > 10 && <li className="font-medium">...and {importResult.errors.length - 10} more</li>}
                    </ul>
                  </div>
                )}
                {importResult.duplicates?.length > 0 && (
                  <div className="p-3 rounded-lg text-sm bg-amber-50 text-amber-700 border border-amber-200">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{importResult.duplicates.length} duplicate{importResult.duplicates.length > 1 ? 's' : ''} skipped</span>
                      <button onClick={() => downloadCSV(importResult.duplicates.map(d => ({
                        'Row': d.row, 'Uploaded Name': d.uploaded_name, 'Uploaded Mobile': d.uploaded_mobile,
                        'System Type': d.system_type, 'System ID': d.system_entity_id,
                        'System Name': d.system_name, 'System Mobile': d.system_mobile,
                        'Assigned Rep': d.system_assigned_rep
                      })), 'duplicate-leads-report.csv')} className="px-3 py-1 bg-amber-600 text-white text-xs rounded hover:bg-amber-700">
                        Download CSV
                      </button>
                    </div>
                  </div>
                )}
                {importResult.success === 0 && !importResult.errors?.length && !importResult.duplicates?.length && (
                  <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700">Import failed</div>
                )}
              </div>
            )}

            {!selectedCampaign ? (
              <div className="text-center py-12 text-gray-400 text-sm">â† Select a campaign to view leads</div>
            ) : leads.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">No leads in this campaign</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b">
                    <th className="text-left py-2 px-2 text-xs text-gray-500">Lead</th>
                    <th className="text-left py-2 px-2 text-xs text-gray-500">Contact</th>
                    <th className="text-left py-2 px-2 text-xs text-gray-500">Rep</th>
                    <th className="text-left py-2 px-2 text-xs text-gray-500">Type</th>
                    <th className="text-left py-2 px-2 text-xs text-gray-500">Source</th>
                    <th className="text-left py-2 px-2 text-xs text-gray-500">City</th>
                    <th className="text-left py-2 px-2 text-xs text-gray-500">Stage</th>
                    <th className="text-right py-2 px-2 text-xs text-gray-500">Sync</th>
                    {role === 'admin' && <th className="text-right py-2 px-2 text-xs text-gray-500"></th>}
                  </tr></thead>
                  <tbody>
                    {leads.map(l => (
                      <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 px-2">
                          <div className="font-medium">{l.name}</div>
                          <div className="text-xs text-gray-400">{l.lead_id}</div>
                        </td>
                        <td className="py-2 px-2 text-gray-600">{l.mobile || l.email || '-'}</td>
                        <td className="py-2 px-2">
                          <select value={l.rep_id || ''} onChange={e => assignRep(l, e.target.value)} className="text-xs rounded px-1 py-0.5 border">
                            <option value="">Unassigned</option>
                            {reps.map(r => <option key={r.rep_id} value={r.rep_id}>{r.name}</option>)}
                          </select>
                        </td>
                        <td className="py-2 px-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${
                            l.lead_type === 'customer' ? 'bg-blue-50 text-blue-700' :
                            l.lead_type === 'broker' ? 'bg-purple-50 text-purple-700' : 'bg-gray-100'
                          }`}>{l.lead_type || 'prospect'}</span>
                        </td>
                        <td className="py-2 px-2 text-gray-600">{l.source || '-'}</td>
                        <td className="py-2 px-2 text-gray-600">{l.city || '-'}</td>
                        <td className="py-2 px-2">
                          <select value={l.pipeline_stage || 'New'} onChange={e => updateLeadStage(l, e.target.value)}
                            className="text-xs rounded px-2 py-1 border"
                            style={{ borderColor: (stages.find(s => s.name === l.pipeline_stage) || {}).color || '#d1d5db' }}>
                            {stages.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                          </select>
                        </td>
                        <td className="py-2 px-2 text-right">
                          {l.converted_customer_id ? (
                            <span className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded-full">Synced: Customer</span>
                          ) : l.converted_broker_id ? (
                            <span className="text-xs px-2 py-1 bg-purple-50 text-purple-700 rounded-full">Synced: Broker</span>
                          ) : (
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => syncLeadToDB(l, 'customer')} className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100" title="Sync to Customer DB">Sync Customer</button>
                              <button onClick={() => syncLeadToDB(l, 'broker')} className="text-xs px-2 py-1 bg-purple-50 text-purple-600 rounded hover:bg-purple-100" title="Sync to Broker DB">Sync Broker</button>
                            </div>
                          )}
                        </td>
                        {role === 'admin' && (
                          <td className="py-2 px-2 text-right">
                            <button onClick={() => deleteLead(l)} className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded" title="Delete lead">Delete</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
      </>
      )}

      {showCampaignModal && (
        <Modal title="New Campaign" onClose={() => setShowCampaignModal(false)}>
          <form onSubmit={handleCampaignSubmit} className="space-y-4">
            <Input label="Campaign Name" required value={campaignForm.name} onChange={e => setCampaignForm({...campaignForm, name: e.target.value})} />
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
                <select value={campaignForm.source} onChange={e => setCampaignForm({...campaignForm, source: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="facebook">Facebook</option>
                  <option value="google">Google</option>
                  <option value="instagram">Instagram</option>
                  <option value="referral">Referral</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <Input label="Start Date" type="date" value={campaignForm.start_date} onChange={e => setCampaignForm({...campaignForm, start_date: e.target.value})} />
            </div>
            <Input label="Budget (PKR)" type="number" value={campaignForm.budget} onChange={e => setCampaignForm({...campaignForm, budget: e.target.value})} />
            <Input label="Notes" value={campaignForm.notes} onChange={e => setCampaignForm({...campaignForm, notes: e.target.value})} />
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setShowCampaignModal(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg">Create</button>
            </div>
          </form>
        </Modal>
      )}

      {showLeadModal && (
        <Modal title="Add Lead" onClose={() => setShowLeadModal(false)}>
          <form onSubmit={handleLeadSubmit} className="space-y-4">
            <Input label="Name" required value={leadForm.name} onChange={e => setLeadForm({...leadForm, name: e.target.value})} />
            <div className="grid grid-cols-2 gap-4">
              <PhoneInput label="Mobile" value={leadForm.mobile} onChange={value => setLeadForm({...leadForm, mobile: value})} />
              <Input label="Email" type="email" value={leadForm.email} onChange={e => setLeadForm({...leadForm, email: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Additional Mobile 1" value={leadForm.additional_mobiles[0] || ''} onChange={e => updateMobile(0, e.target.value)} />
              <Input label="Additional Mobile 2" value={leadForm.additional_mobiles[1] || ''} onChange={e => updateMobile(1, e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Additional Mobile 3" value={leadForm.additional_mobiles[2] || ''} onChange={e => updateMobile(2, e.target.value)} />
              <Input label="Additional Mobile 4" value={leadForm.additional_mobiles[3] || ''} onChange={e => updateMobile(3, e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Lead Type</label>
                <select value={leadForm.lead_type} onChange={e => setLeadForm({...leadForm, lead_type: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="prospect">Prospect</option>
                  <option value="customer">Potential Customer</option>
                  <option value="broker">Potential Broker</option>
                </select>
              </div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Assign to Rep</label>
                <select value={leadForm.assigned_rep_id} onChange={e => setLeadForm({...leadForm, assigned_rep_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Unassigned</option>
                  {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
                <select value={leadForm.source} onChange={e => setLeadForm({...leadForm, source: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">Select source</option>
                  {(lookupValues[LOOKUP_KEYS.CUSTOMER_SOURCE] || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Occupation</label>
                <select value={leadForm.occupation} onChange={e => setLeadForm({...leadForm, occupation: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">Select occupation</option>
                  {(lookupValues[LOOKUP_KEYS.CUSTOMER_OCCUPATION] || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
            </div>
            {leadForm.source === 'Other' && <Input label="Source (Other)" value={leadForm.source_other} onChange={e => setLeadForm({...leadForm, source_other: e.target.value})} />}
            {leadForm.occupation === 'Other' && <Input label="Occupation (Other)" value={leadForm.occupation_other} onChange={e => setLeadForm({...leadForm, occupation_other: e.target.value})} />}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Interested Project</label>
                <select value={leadForm.interested_project_id} onChange={e => setLeadForm({...leadForm, interested_project_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">Select project</option>
                  <option value="other">Other</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {leadForm.interested_project_id === 'other' ? (
                <Input label="Interested Project (Other)" value={leadForm.interested_project_other} onChange={e => setLeadForm({...leadForm, interested_project_other: e.target.value})} />
              ) : <div />}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Area" value={leadForm.area} onChange={e => setLeadForm({...leadForm, area: e.target.value})} />
              <Input label="City" value={leadForm.city} onChange={e => setLeadForm({...leadForm, city: e.target.value})} />
            </div>
            <Input label="Notes" value={leadForm.notes} onChange={e => setLeadForm({...leadForm, notes: e.target.value})} />
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setShowLeadModal(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg">Add</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ============================================
// CAMPAIGN ANALYTICS COMPONENT
// ============================================
function CampaignAnalytics() {
  const [metrics, setMetrics] = useState(null);
  const [repData, setRepData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [funnelView, setFunnelView] = useState('bar');
  const [campaignFilter, setCampaignFilter] = useState('');
  const [campaigns, setCampaigns] = useState([]);
  const [drilldownFilters, setDrilldownFilters] = useState(null);

  useEffect(() => { loadAnalytics(); }, []);

  const loadAnalytics = async (campId) => {
    setLoading(true);
    try {
      const params = campId ? `?campaign_id=${campId}` : '';
      const [mRes, rRes, cRes] = await Promise.all([
        api.get(`/analytics/campaign-metrics${params}`).catch(() => ({ data: null })),
        api.get(`/analytics/rep-performance${params}`).catch(() => ({ data: null })),
        api.get('/campaigns').catch(() => ({ data: [] }))
      ]);
      setMetrics(mRes.data);
      setRepData(rRes.data);
      setCampaigns(cRes.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleFilterChange = (val) => {
    setCampaignFilter(val);
    loadAnalytics(val || undefined);
  };

  if (loading) return <Loader />;
  if (!metrics) return <div className="text-center py-12 text-gray-400">No analytics data available</div>;

  const funnelData = (metrics.funnel || []).filter(s => s.count > 0);
  const funnelMax = funnelData.length > 0 ? Math.max(...funnelData.map(s => s.count)) : 1;

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex items-center gap-4">
        <select value={campaignFilter} onChange={e => handleFilterChange(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">All Campaigns</option>
          {campaigns.map(c => <option key={c.id} value={c.campaign_id}>{c.name}</option>)}
        </select>
      </div>

      {/* Overall KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Total Leads" value={metrics.overall?.total_leads} />
        <SummaryCard label="Converted" value={metrics.overall?.converted} />
        <SummaryCard label="Conversion Rate" value={`${metrics.overall?.conversion_rate}%`} />
        <SummaryCard label="Revenue Generated" value={formatCurrency(metrics.overall?.total_revenue_attributed)} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Active Leads" value={metrics.overall?.active} />
        <SummaryCard label="Lost" value={metrics.overall?.lost} />
        <SummaryCard label="Avg Days to Convert" value={metrics.overall?.avg_days_to_conversion || 'N/A'} />
        <SummaryCard label="Overall ROI" value={`${metrics.overall?.overall_roi || 0}%`} />
      </div>

      {/* Conversion Funnel */}
      {funnelData.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Conversion Funnel</h3>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              {[{id:'trapezoid',label:'Funnel'},{id:'bar',label:'Bar'},{id:'kanban',label:'Kanban'}].map(v => (
                <button key={v.id} onClick={() => setFunnelView(v.id)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${funnelView === v.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>{v.label}</button>
              ))}
            </div>
          </div>

          {/* Trapezoid Funnel */}
          {funnelView === 'trapezoid' && (
            <div className="flex flex-col items-center gap-1">
              {funnelData.map((s, i) => {
                const widthPct = Math.max(20, (s.count / funnelMax) * 100);
                return (
                  <div key={s.stage} onClick={() => s.count > 0 && setDrilldownFilters({ stage: s.stage, campaign_id: campaignFilter || undefined })}
                    className="relative flex items-center justify-center text-white text-sm font-medium rounded-md transition-all cursor-pointer hover:opacity-90"
                    style={{ width: `${widthPct}%`, height: '44px', backgroundColor: s.color || '#6B7280', minWidth: '120px' }}>
                    <span>{s.stage}: {s.count}</span>
                    {i > 0 && <span className="absolute -top-3 right-2 text-xs text-gray-500">{s.pct_of_previous}% from prev</span>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Horizontal Bar */}
          {funnelView === 'bar' && (
            <div className="space-y-3">
              {funnelData.map(s => (
                <div key={s.stage} className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 rounded-lg p-1 -m-1 transition-colors"
                  onClick={() => s.count > 0 && setDrilldownFilters({ stage: s.stage, campaign_id: campaignFilter || undefined })}>
                  <div className="w-28 text-sm font-medium text-gray-700 text-right">{s.stage}</div>
                  <div className="flex-1 h-9 bg-gray-100 rounded-lg overflow-hidden relative">
                    <div className="h-full rounded-lg transition-all" style={{ width: `${s.pct_of_total}%`, backgroundColor: s.color || '#6B7280', minWidth: s.count > 0 ? '24px' : '0' }} />
                    <span className="absolute inset-0 flex items-center px-3 text-xs font-semibold text-gray-900">{s.count} ({s.pct_of_total}%)</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Kanban Cards */}
          {funnelView === 'kanban' && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {funnelData.map((s, i) => (
                <div key={s.stage} className="flex items-center gap-2 flex-shrink-0">
                  <div onClick={() => s.count > 0 && setDrilldownFilters({ stage: s.stage, campaign_id: campaignFilter || undefined })}
                    className="border rounded-xl p-4 min-w-[120px] text-center cursor-pointer hover:shadow-md transition-shadow"
                    style={{ borderColor: s.color || '#6B7280' }}>
                    <div className="text-2xl font-bold" style={{ color: s.color || '#6B7280' }}>{s.count}</div>
                    <div className="text-xs font-medium text-gray-700 mt-1">{s.stage}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{s.pct_of_total}%</div>
                  </div>
                  {i < funnelData.length - 1 && (
                    <div className="text-gray-300 text-lg flex-shrink-0">&rarr;</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Rep Lead Aging Table */}
      {repData?.reps?.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          <h3 className="text-lg font-semibold mb-4">Rep Lead Aging</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-semibold text-gray-700">Rep</th>
                  <th className="text-right p-2 font-semibold text-gray-700">Total</th>
                  <th className="text-right p-2 font-semibold text-gray-700">0-7d</th>
                  <th className="text-right p-2 font-semibold text-gray-700">7-14d</th>
                  <th className="text-right p-2 font-semibold text-gray-700">14d+</th>
                  <th className="text-right p-2 font-semibold text-gray-700">Pending F/U</th>
                  <th className="text-right p-2 font-semibold text-gray-700">Interactions</th>
                </tr>
              </thead>
              <tbody>
                {repData.reps.map(r => (
                  <tr key={r.rep_id} className="border-b hover:bg-gray-50">
                    <td className="p-2">
                      <button onClick={() => setDrilldownFilters({ rep_id: r.rep_id, campaign_id: campaignFilter || undefined })} className="text-left hover:text-blue-600">
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-gray-500">{r.rep_id}</div>
                      </button>
                    </td>
                    <td className="text-right p-2 font-medium cursor-pointer hover:text-blue-600"
                      onClick={() => r.total_assigned > 0 && setDrilldownFilters({ rep_id: r.rep_id, campaign_id: campaignFilter || undefined })}>{r.total_assigned}</td>
                    <td className="text-right p-2 cursor-pointer" onClick={() => r.not_attempted['0_7d'] > 0 && setDrilldownFilters({ rep_id: r.rep_id, aging_bucket: '0_7d', campaign_id: campaignFilter || undefined })}>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.not_attempted['0_7d'] > 0 ? 'bg-green-100 text-green-800 hover:ring-2 hover:ring-green-300' : 'text-gray-400'}`}>{r.not_attempted['0_7d']}</span></td>
                    <td className="text-right p-2 cursor-pointer" onClick={() => r.not_attempted['7_14d'] > 0 && setDrilldownFilters({ rep_id: r.rep_id, aging_bucket: '7_14d', campaign_id: campaignFilter || undefined })}>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.not_attempted['7_14d'] > 0 ? 'bg-yellow-100 text-yellow-800 hover:ring-2 hover:ring-yellow-300' : 'text-gray-400'}`}>{r.not_attempted['7_14d']}</span></td>
                    <td className="text-right p-2 cursor-pointer" onClick={() => r.not_attempted['14d_plus'] > 0 && setDrilldownFilters({ rep_id: r.rep_id, aging_bucket: '14d_plus', campaign_id: campaignFilter || undefined })}>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.not_attempted['14d_plus'] > 0 ? 'bg-red-100 text-red-800 hover:ring-2 hover:ring-red-300' : 'text-gray-400'}`}>{r.not_attempted['14d_plus']}</span></td>
                    <td className="text-right p-2"><span className={r.pending_followups > 0 ? 'text-amber-600 font-semibold' : 'text-gray-400'}>{r.pending_followups}</span></td>
                    <td className="text-right p-2">{r.interactions?.total || 0}</td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="border-t-2 font-semibold bg-gray-50">
                  <td className="p-2">Totals</td>
                  <td className="text-right p-2">{repData.totals?.total_assigned}</td>
                  <td className="text-right p-2">{repData.reps.reduce((s, r) => s + r.not_attempted['0_7d'], 0)}</td>
                  <td className="text-right p-2">{repData.reps.reduce((s, r) => s + r.not_attempted['7_14d'], 0)}</td>
                  <td className="text-right p-2">{repData.reps.reduce((s, r) => s + r.not_attempted['14d_plus'], 0)}</td>
                  <td className="text-right p-2">{repData.totals?.total_pending_followups}</td>
                  <td className="text-right p-2">{repData.reps.reduce((s, r) => s + (r.interactions?.total || 0), 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Source Performance */}
      {metrics.by_source?.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          <h3 className="text-lg font-semibold mb-4">Source Performance</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {metrics.by_source.map(s => (
              <div key={s.source} className="border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-900 capitalize">{s.source}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${s.conversion_rate >= 20 ? 'bg-green-100 text-green-800' : s.conversion_rate >= 10 ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'}`}>{s.conversion_rate}%</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-gray-500">Leads:</span> <span className="font-medium">{s.leads}</span></div>
                  <div><span className="text-gray-500">Converted:</span> <span className="font-medium text-green-600">{s.converted}</span></div>
                  {s.budget > 0 && <div><span className="text-gray-500">Budget:</span> <span className="font-medium">{formatCurrency(s.budget)}</span></div>}
                  {s.cost_per_lead > 0 && <div><span className="text-gray-500">CPL:</span> <span className="font-medium">{formatCurrency(s.cost_per_lead)}</span></div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rep Conversion Table */}
      {repData?.reps?.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          <h3 className="text-lg font-semibold mb-4">Rep Conversion Performance</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-semibold text-gray-700">Rep</th>
                  <th className="text-right p-2 font-semibold text-gray-700">Assigned</th>
                  <th className="text-right p-2 font-semibold text-gray-700">Converted</th>
                  <th className="text-right p-2 font-semibold text-gray-700">Lost</th>
                  <th className="text-right p-2 font-semibold text-gray-700">Active</th>
                  <th className="text-right p-2 font-semibold text-gray-700">Rate</th>
                  <th className="text-right p-2 font-semibold text-gray-700">Avg Response</th>
                  <th className="text-right p-2 font-semibold text-gray-700">Interactions</th>
                </tr>
              </thead>
              <tbody>
                {[...repData.reps].sort((a, b) => b.conversion_rate - a.conversion_rate).map(r => (
                  <tr key={r.rep_id} className="border-b hover:bg-gray-50">
                    <td className="p-2"><div className="font-medium">{r.name}</div></td>
                    <td className="text-right p-2">{r.total_assigned}</td>
                    <td className="text-right p-2 text-green-600 font-medium">{r.converted}</td>
                    <td className="text-right p-2 text-red-600">{r.lost}</td>
                    <td className="text-right p-2">{r.active}</td>
                    <td className="text-right p-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${r.conversion_rate >= 30 ? 'bg-green-100 text-green-800' : r.conversion_rate >= 15 ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'}`}>{r.conversion_rate}%</span>
                    </td>
                    <td className="text-right p-2">{r.avg_response_days !== null ? `${r.avg_response_days}d` : '-'}</td>
                    <td className="text-right p-2 text-gray-600">{r.interactions?.total || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Campaign Comparison Table */}
      {metrics.by_campaign?.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          <h3 className="text-lg font-semibold mb-4">Campaign Comparison</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-semibold text-gray-700">Campaign</th>
                  <th className="text-left p-2 font-semibold text-gray-700">Source</th>
                  <th className="text-right p-2 font-semibold text-gray-700">Leads</th>
                  <th className="text-right p-2 font-semibold text-gray-700">Converted</th>
                  <th className="text-right p-2 font-semibold text-gray-700">Lost</th>
                  <th className="text-right p-2 font-semibold text-gray-700">Rate</th>
                  <th className="text-right p-2 font-semibold text-gray-700">Budget</th>
                  <th className="text-right p-2 font-semibold text-gray-700">Revenue</th>
                  <th className="text-right p-2 font-semibold text-gray-700">ROI</th>
                </tr>
              </thead>
              <tbody>
                {metrics.by_campaign.map(c => (
                  <tr key={c.campaign_id} className="border-b hover:bg-gray-50">
                    <td className="p-2">
                      <button onClick={() => { if (window.setActiveTab) window.setActiveTab('campaigns'); }} className="text-left hover:text-blue-600">
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-gray-500">{c.campaign_id}</div>
                      </button>
                    </td>
                    <td className="p-2 capitalize">{c.source}</td>
                    <td className="text-right p-2">{c.leads}</td>
                    <td className="text-right p-2 text-green-600 font-medium">{c.converted}</td>
                    <td className="text-right p-2 text-red-600">{c.lost}</td>
                    <td className="text-right p-2">{c.conversion_rate}%</td>
                    <td className="text-right p-2">{formatCurrency(c.budget)}</td>
                    <td className="text-right p-2 font-medium">{formatCurrency(c.revenue_generated)}</td>
                    <td className="text-right p-2"><span className={c.roi > 0 ? 'text-green-600 font-semibold' : c.roi < 0 ? 'text-red-600' : 'text-gray-500'}>{c.roi}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Drilldown Modal */}
      {drilldownFilters && (
        <AnalyticsLeadDrilldown filters={drilldownFilters} onClose={() => setDrilldownFilters(null)} />
      )}
    </div>
  );
}

// ============================================
// PAYMENTS VIEW (Outgoing Payments - Commissions, Incentives, Creditors)
// ============================================
function PaymentsView() {
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [brokers, setBrokers] = useState([]);
  const [reps, setReps] = useState([]);
  const [creditors, setCreditors] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [filter, setFilter] = useState({ payment_type: '', status: '', broker_id: '', rep_id: '', creditor_id: '' });
  const [form, setForm] = useState({
    payment_type: 'broker_commission', payee_type: 'broker',
    broker_id: '', company_rep_id: '', creditor_id: '', transaction_id: '',
    amount: '', payment_method: 'bank_transfer', reference_number: '',
    payment_date: new Date().toISOString().split('T')[0], notes: '',
    approved_by_rep_id: '', status: 'completed', allocations: []
  });

  // Search state
  // Search filters - separate fields for precision
  const [paymentIdFilter, setPaymentIdFilter] = useState('');
  const [referenceFilter, setReferenceFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Filter payments - prefix match for IDs
  const filteredPayments = payments.filter(p => {
    // Payment ID - prefix match
    if (paymentIdFilter && !p.payment_id?.toLowerCase().startsWith(paymentIdFilter.toLowerCase())) return false;
    // Reference number - prefix match
    if (referenceFilter && !p.reference_number?.toLowerCase().startsWith(referenceFilter.toLowerCase())) return false;
    // Date range filter
    if (dateFrom && p.payment_date < dateFrom) return false;
    if (dateTo && p.payment_date > dateTo) return false;
    return true;
  });

  const clearAllFilters = () => {
    setPaymentIdFilter('');
    setReferenceFilter('');
    setDateFrom('');
    setDateTo('');
    setFilter({ payment_type: '', status: '', broker_id: '', rep_id: '', creditor_id: '' });
  };

  const hasActiveFilters = paymentIdFilter || referenceFilter || dateFrom || dateTo || filter.payment_type || filter.status || filter.broker_id || filter.rep_id || filter.creditor_id;

  useEffect(() => { loadData(); }, [filter]);
  const loadData = async () => {
    try {
      const params = {};
      if (filter.payment_type) params.payment_type = filter.payment_type;
      if (filter.status) params.status = filter.status;
      if (filter.broker_id) params.broker_id = filter.broker_id;
      if (filter.rep_id) params.rep_id = filter.rep_id;
      if (filter.creditor_id) params.creditor_id = filter.creditor_id;

      const [payRes, sumRes, brkRes, repRes, crdRes] = await Promise.all([
        api.get('/payments', { params }).catch(() => ({ data: [] })),
        api.get('/payments/summary').catch(() => ({ data: { total_payments: 0, total_amount: 0, today_count: 0, today_amount: 0, month_count: 0, month_amount: 0, by_type: {}, pending_count: 0, pending_amount: 0 } })),
        api.get('/brokers').catch(() => ({ data: [] })),
        api.get('/company-reps').catch(() => ({ data: [] })),
        api.get('/creditors').catch(() => ({ data: [] }))
      ]);
      setPayments(payRes.data || []);
      setSummary(sumRes.data);
      setBrokers(brkRes.data || []);
      setReps(repRes.data || []);
      setCreditors(crdRes.data || []);
    } catch (e) {
      console.error(e);
      setSummary({ total_payments: 0, total_amount: 0, today_count: 0, today_amount: 0, month_count: 0, month_amount: 0, by_type: {}, pending_count: 0, pending_amount: 0 });
    }
    finally { setLoading(false); }
  };

  const loadTransactions = async (brokerId) => {
    if (!brokerId) return;
    try {
      const broker = brokers.find(b => b.id === brokerId || b.broker_id === brokerId);
      if (broker) {
        const res = await api.get(`/brokers/${broker.broker_id}`);
        const txnIds = res.data.transactions?.map(t => t.transaction_id) || [];
        const allTxns = await api.get('/transactions');
        setTransactions(allTxns.data.filter(t => txnIds.includes(t.transaction_id)) || []);
      }
    } catch (e) { setTransactions([]); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || parseFloat(form.amount) <= 0) { alert('Enter valid amount'); return; }
    if (form.payment_type === 'broker_commission' && !form.broker_id) { alert('Select broker'); return; }
    if (form.payment_type === 'rep_incentive' && !form.company_rep_id) { alert('Select company rep'); return; }
    if (form.payment_type === 'creditor' && !form.creditor_id) { alert('Select creditor'); return; }
    
    try {
      await api.post('/payments', form);
      setShowModal(false);
      setForm({
        payment_type: 'broker_commission', payee_type: 'broker',
        broker_id: '', company_rep_id: '', creditor_id: '', transaction_id: '',
        amount: '', payment_method: 'bank_transfer', reference_number: '',
        payment_date: new Date().toISOString().split('T')[0], notes: '',
        approved_by_rep_id: '', status: 'completed', allocations: []
      });
      setTransactions([]);
      loadData();
    } catch (e) { alert(e.response?.data?.detail || 'Error'); }
  };

  const updatePaymentType = (type) => {
    setForm({
      ...form,
      payment_type: type,
      payee_type: type === 'broker_commission' ? 'broker' : type === 'rep_incentive' ? 'company_rep' : type === 'creditor' ? 'creditor' : 'beneficiary',
      broker_id: type === 'broker_commission' ? form.broker_id : '',
      company_rep_id: type === 'rep_incentive' ? form.company_rep_id : '',
      creditor_id: type === 'creditor' ? form.creditor_id : '',
      transaction_id: ''
    });
    if (type === 'broker_commission' && form.broker_id) {
      loadTransactions(form.broker_id);
    } else {
      setTransactions([]);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold text-gray-900">Payments</h2>
          <p className="text-sm text-gray-500 mt-1">Commission payments, incentives & creditor payments</p></div>
        <button onClick={() => setShowModal(true)} className="bg-gray-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-800">Record Payment</button>
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard label="Total Payments" value={summary.total_payments} />
            <SummaryCard label="Total Paid" value={formatCurrency(summary.total_amount)} />
            <SummaryCard label="Today" value={summary.today_count} sub={formatCurrency(summary.today_amount)} />
            <SummaryCard label="This Month" value={summary.month_count} sub={formatCurrency(summary.month_amount)} />
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border p-4">
              <div className="text-xs text-gray-400 uppercase">Broker Commissions</div>
              <div className="text-lg font-semibold text-blue-600">{formatCurrency(summary.by_type?.broker_commission || 0)}</div>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <div className="text-xs text-gray-400 uppercase">Rep Incentives</div>
              <div className="text-lg font-semibold text-purple-600">{formatCurrency(summary.by_type?.rep_incentive || 0)}</div>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <div className="text-xs text-gray-400 uppercase">Creditor Payments</div>
              <div className="text-lg font-semibold text-orange-600">{formatCurrency(summary.by_type?.creditor || 0)}</div>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <div className="text-xs text-gray-400 uppercase">Zakat Payments</div>
              <div className="text-lg font-semibold text-emerald-700">{formatCurrency(summary.by_type?.zakat || 0)}</div>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <div className="text-xs text-gray-400 uppercase">Pending</div>
              <div className="text-lg font-semibold text-amber-600">{formatCurrency(summary.pending_amount || 0)}</div>
              <div className="text-xs text-gray-500 mt-1">{summary.pending_count} payments</div>
            </div>
          </div>
        </>
      )}

      {/* Search & Filters */}
      <div className="bg-white rounded-xl border p-4 space-y-4">
        {/* Search Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          {/* Payment ID - prefix match */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Payment ID</label>
            <input
              type="text"
              placeholder="PAY-001..."
              value={paymentIdFilter}
              onChange={e => setPaymentIdFilter(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
          {/* Reference - prefix match */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Reference #</label>
            <input
              type="text"
              placeholder="Ref number..."
              value={referenceFilter}
              onChange={e => setReferenceFilter(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From Date</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To Date</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="flex justify-end">
          {hasActiveFilters && (
            <button onClick={clearAllFilters} className="px-3 py-2 text-sm text-red-600 hover:text-red-800 font-medium">
              Clear All
            </button>
          )}
        </div>

        {/* Filter Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-3 border-t">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Payment Type</label>
            <select value={filter.payment_type} onChange={e => setFilter({...filter, payment_type: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">All Types</option>
              <option value="broker_commission">Broker Commission</option>
              <option value="rep_incentive">Rep Incentive</option>
              <option value="creditor">Creditor</option>
              <option value="zakat">Zakat</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select value={filter.status} onChange={e => setFilter({...filter, status: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">All Status</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Broker</label>
            <select value={filter.broker_id} onChange={e => setFilter({...filter, broker_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">All Brokers</option>
              {brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Rep</label>
            <select value={filter.rep_id} onChange={e => setFilter({...filter, rep_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">All Reps</option>
              {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Creditor</label>
            <select value={filter.creditor_id} onChange={e => setFilter({...filter, creditor_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">All Creditors</option>
              {creditors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {/* Results Summary */}
        {hasActiveFilters && (
          <div className="pt-3 border-t flex items-center justify-between text-sm">
            <div className="text-gray-600">
              <span className="font-medium">{filteredPayments.length}</span> payments found
            </div>
            <div className="text-gray-600">
              Total: <span className="font-semibold text-red-600">{formatCurrency(filteredPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0))}</span>
            </div>
          </div>
        )}
      </div>

      {loading ? <Loader /> : payments.length === 0 ? <Empty msg="No payments recorded" /> : filteredPayments.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border p-12 text-center">
          <div className="text-gray-400 mb-2">No payments match your search</div>
          <button onClick={clearAllFilters} className="text-sm text-blue-600 hover:text-blue-800">Clear all filters</button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Payment</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Payee</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Type</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-4">Amount</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-6 py-4">Method</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-4">Date</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase px-6 py-4">Status</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {filteredPayments.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => { setSelectedPayment(p); setShowDetailModal(true); }}>
                  <td className="px-6 py-4">
                    <div className="text-sm font-mono text-gray-900">{p.payment_id}</div>
                    {p.reference_number && <div className="text-xs text-gray-400">Ref: {p.reference_number}</div>}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium">{p.broker_name || p.rep_name || p.creditor_name || '-'}</div>
                    <div className="text-xs text-gray-400">{p.broker_id || p.rep_id || p.creditor_id || ''}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      p.payment_type === 'broker_commission' ? 'bg-blue-50 text-blue-700' :
                      p.payment_type === 'rep_incentive' ? 'bg-purple-50 text-purple-700' :
                      p.payment_type === 'creditor' ? 'bg-orange-50 text-orange-700' :
                      p.payment_type === 'zakat' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100'
                    }`}>{p.payment_type.replace('_', ' ')}</span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-semibold text-red-600">{formatCurrency(p.amount)}</td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-xs text-gray-600">{p.payment_method || '-'}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{p.payment_date}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      p.status === 'completed' ? 'bg-green-50 text-green-700' :
                      p.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100'
                    }`}>{p.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title="Record Payment" onClose={() => { setShowModal(false); setTransactions([]); }} wide>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="block text-xs font-medium text-gray-500 mb-1">Payment Type *</label>
              <select required value={form.payment_type} onChange={e => updatePaymentType(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="broker_commission">Broker Commission</option>
                <option value="rep_incentive">Rep Incentive</option>
                <option value="creditor">Creditor Payment</option>
                <option value="zakat">Zakat Payment</option>
                <option value="other">Other</option>
              </select>
            </div>

            {form.payment_type === 'broker_commission' && (
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Broker *</label>
                <select required value={form.broker_id} onChange={e => { setForm({...form, broker_id: e.target.value}); loadTransactions(e.target.value); }} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Select Broker</option>
                  {brokers.map(b => <option key={b.id} value={b.id}>{b.name} ({b.broker_id})</option>)}
                </select>
              </div>
            )}

            {form.payment_type === 'rep_incentive' && (
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Company Rep *</label>
                <select required value={form.company_rep_id} onChange={e => setForm({...form, company_rep_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Select Rep</option>
                  {reps.map(r => <option key={r.id} value={r.id}>{r.name} ({r.rep_id})</option>)}
                </select>
              </div>
            )}

            {form.payment_type === 'creditor' && (
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Creditor *</label>
                <select required value={form.creditor_id} onChange={e => setForm({...form, creditor_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Select Creditor</option>
                  {creditors.map(c => <option key={c.id} value={c.id}>{c.name} ({c.creditor_id})</option>)}
                </select>
              </div>
            )}

            {form.payment_type === 'broker_commission' && transactions.length > 0 && (
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Allocate to Transaction (Optional)</label>
                <select value={form.transaction_id} onChange={e => setForm({...form, transaction_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">No specific transaction</option>
                  {transactions.map(t => <option key={t.id} value={t.id}>{t.transaction_id} - {t.project_name} ({formatCurrency(t.total_value)})</option>)}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Input label="Amount *" type="number" required value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} />
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Payment Method</label>
                <select value={form.payment_method} onChange={e => setForm({...form, payment_method: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="cash">ðŸ’µ Cash</option>
                  <option value="cheque">ðŸ“ Cheque</option>
                  <option value="bank_transfer">ðŸ¦ Bank Transfer</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Reference #" value={form.reference_number} onChange={e => setForm({...form, reference_number: e.target.value})} />
              <Input label="Payment Date" type="date" value={form.payment_date} onChange={e => setForm({...form, payment_date: e.target.value})} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Approved By</label>
                <select value={form.approved_by_rep_id} onChange={e => setForm({...form, approved_by_rep_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Select Rep</option>
                  {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="completed">âœ… Completed</option>
                  <option value="pending">â³ Pending</option>
                  <option value="cancelled">âŒ Cancelled</option>
                </select>
              </div>
            </div>

            <Input label="Notes" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button type="button" onClick={() => { setShowModal(false); setTransactions([]); }} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button type="submit" className="px-6 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">Record Payment</button>
            </div>
          </form>
        </Modal>
      )}

      {showDetailModal && selectedPayment && (
        <PaymentDetailModal 
          payment={selectedPayment} 
          onClose={() => { setShowDetailModal(false); setSelectedPayment(null); }} 
        />
      )}
    </div>
  );
}

// ============================================
// PAYMENT DETAIL MODAL
// ============================================
function PaymentDetailModal({ payment, onClose }) {
  return (
    <Modal title={`Payment: ${payment.payment_id}`} onClose={onClose} wide>
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Payment ID</label>
            <div className="text-sm text-gray-900">{payment.payment_id}</div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Payment Type</label>
            <div className="text-sm text-gray-900">{payment.payment_type?.replace('_', ' ') || '-'}</div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Payee</label>
            <div className="text-sm text-gray-900">{payment.broker_name || payment.rep_name || payment.creditor_name || '-'}</div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Amount</label>
            <div className="text-sm font-semibold text-red-600">{formatCurrency(payment.amount)}</div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Payment Method</label>
            <div className="text-sm text-gray-900">{payment.payment_method || '-'}</div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <div className="text-sm">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                payment.status === 'completed' ? 'bg-green-50 text-green-700' :
                payment.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100'
              }`}>{payment.status}</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Payment Date</label>
            <div className="text-sm text-gray-900">{payment.payment_date || '-'}</div>
          </div>
          {payment.reference_number && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Reference Number</label>
              <div className="text-sm text-gray-900">{payment.reference_number}</div>
            </div>
          )}
          {payment.notes && (
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
              <div className="text-sm text-gray-900">{payment.notes}</div>
            </div>
          )}
        </div>

        {/* Media Attachments */}
        <div className="border-t pt-4">
          <MediaManager 
            entityType="payment" 
            entityId={payment.id || payment.payment_id}
            onUpload={() => {}}
          />
        </div>
      </div>
    </Modal>
  );
}

// ============================================
// DASHBOARD VIEW
// ============================================
function StaleLeadsCard() {
  const [staleCount, setStaleCount] = useState(null);
  useEffect(() => {
    api.get('/leads/stale').then(res => setStaleCount(res.data.length)).catch(() => {});
  }, []);
  if (staleCount === null || staleCount === 0) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:bg-amber-100 transition-colors"
      onClick={() => { if (window.setActiveTab) window.setActiveTab('customers'); }}>
      <div>
        <div className="text-sm font-medium text-amber-800">Stale Leads</div>
        <div className="text-xs text-amber-600">Leads with no interaction in 60+ days</div>
      </div>
      <div className="text-2xl font-bold text-amber-700">{staleCount}</div>
    </div>
  );
}

function TasksDashboardMini() {
  const [taskSummary, setTaskSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/tasks/reports/summary')
      .then(res => setTaskSummary(res.data))
      .catch(() => setTaskSummary(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader />;
  if (!taskSummary) return <div className="text-center py-12 text-gray-400">No task data available</div>;

  const s = taskSummary;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Total Tasks" value={s.total || 0} />
        <SummaryCard label="Pending" value={s.by_status?.pending || 0} />
        <SummaryCard label="In Progress" value={s.by_status?.in_progress || 0} />
        <SummaryCard label="Completed" value={s.by_status?.completed || 0} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Overdue" value={s.overdue || 0} />
        <SummaryCard label="Due Today" value={s.due_today || 0} />
        <SummaryCard label="Urgent" value={s.by_priority?.urgent || 0} />
        <SummaryCard label="High Priority" value={s.by_priority?.high || 0} />
      </div>
      {s.by_department && Object.keys(s.by_department).length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          <h3 className="text-lg font-semibold mb-4">Tasks by Department</h3>
          <div className="space-y-2">
            {Object.entries(s.by_department).map(([dept, count]) => (
              <div key={dept} className="flex items-center gap-3">
                <div className="w-28 text-sm font-medium text-gray-700 text-right">{dept}</div>
                <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden relative">
                  <div className="h-full bg-blue-500 rounded-lg transition-all" style={{ width: `${s.total ? (count / s.total * 100) : 0}%`, minWidth: count > 0 ? '20px' : '0' }} />
                  <span className="absolute inset-0 flex items-center px-3 text-xs font-semibold">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardView() {
  const role = getUserRole();
  const isSalesRoleView = ['user', 'manager'].includes(role);
  const isGlobalRoleView = ['admin', 'director', 'cco', 'coo', 'creator', 'viewer'].includes(role);
  const [summary, setSummary] = useState(null);
  const [customerStats, setCustomerStats] = useState([]);
  const [projectStats, setProjectStats] = useState([]);
  const [brokerStats, setBrokerStats] = useState([]);
  const [topReceivables, setTopReceivables] = useState([]);
  const [projectInventory, setProjectInventory] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedBroker, setSelectedBroker] = useState(null);
  const [customerDetails, setCustomerDetails] = useState(null);
  const [brokerDetails, setBrokerDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dashSubTab, setDashSubTab] = useState('overview');
  // Enrichment states
  const [brokerSummary, setBrokerSummary] = useState(null);
  const [txnSummary, setTxnSummary] = useState(null);
  const [receiptSummary, setReceiptSummary] = useState(null);
  const [revenueTrends, setRevenueTrends] = useState([]);
  const [campaignMetrics, setCampaignMetrics] = useState(null);
  const [campaignMetricsLoading, setCampaignMetricsLoading] = useState(false);
  const [salesKpis, setSalesKpis] = useState(null);
  const [dashDrilldownFilters, setDashDrilldownFilters] = useState(null);

  useEffect(() => { loadData(); }, []);
  const loadData = async () => {
    try {
      const [sumRes, custRes, projRes, brkRes, recRes, invRes, brkSumRes, txnSumRes, rcptSumRes, trendRes] = await Promise.all([
        api.get('/dashboard/summary').catch(() => ({ data: null })),
        api.get('/dashboard/customer-stats').catch(() => ({ data: [] })),
        api.get('/dashboard/project-stats').catch(() => ({ data: [] })),
        api.get('/dashboard/broker-stats').catch(() => ({ data: [] })),
        api.get('/dashboard/top-receivables?limit=10').catch(() => ({ data: [] })),
        api.get('/dashboard/project-inventory').catch(() => ({ data: [] })),
        api.get('/brokers/summary').catch(() => ({ data: null })),
        api.get('/transactions/summary').catch(() => ({ data: null })),
        api.get('/receipts/summary').catch(() => ({ data: null })),
        api.get('/dashboard/revenue-trends').catch(() => ({ data: [] }))
      ]);
      setSummary(sumRes.data);
      setCustomerStats(custRes.data || []);
      setProjectStats(projRes.data || []);
      setBrokerStats(brkRes.data || []);
      setTopReceivables(recRes.data || []);
      setProjectInventory(invRes.data || []);
      setBrokerSummary(brkSumRes.data);
      setTxnSummary(txnSumRes.data);
      setReceiptSummary(rcptSumRes.data);
      setRevenueTrends(trendRes.data || []);
      const salesRes = await api.get('/dashboard/sales-kpis').catch(() => ({ data: null }));
      setSalesKpis(salesRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // Load campaign metrics on-demand
  useEffect(() => {
    if (dashSubTab === 'campaigns' && !campaignMetrics && !campaignMetricsLoading) {
      setCampaignMetricsLoading(true);
      api.get('/analytics/campaign-metrics')
        .then(res => setCampaignMetrics(res.data))
        .catch(() => setCampaignMetrics(null))
        .finally(() => setCampaignMetricsLoading(false));
    }
  }, [dashSubTab]);

  const loadCustomerDetails = async (customerId) => {
    try {
      const res = await api.get(`/customers/${customerId}/details`);
      setCustomerDetails(res.data);
      setSelectedCustomer(customerId);
    } catch (e) { alert('Error loading customer details'); }
  };

  const loadBrokerDetails = async (brokerId) => {
    try {
      const res = await api.get(`/brokers/${brokerId}/details`);
      setBrokerDetails(res.data);
      setSelectedBroker(brokerId);
    } catch (e) { alert('Error loading broker details'); }
  };

  const topBroker = brokerStats.length > 0 ? [...brokerStats].sort((a, b) => b.total_sale_value - a.total_sale_value)[0] : null;

  const dashMiniTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'receivables', label: 'Receivables' },
    { id: 'sales', label: 'Sales' },
    { id: 'brokers', label: 'Brokers' },
    { id: 'projects', label: 'Projects & Inventory' },
    { id: 'campaigns', label: 'Campaigns' },
    { id: 'tasks', label: 'Tasks' }
  ];

  // Revenue trends max for scaling
  const trendMax = revenueTrends.length > 0 ? Math.max(...revenueTrends.map(d => Math.max(d.receipts || 0, d.payments || 0)), 1) : 1;

  if (!isGlobalRoleView && !isSalesRoleView) {
    return <div className="text-center py-12 text-gray-400">No dashboard view configured for role: {role}</div>;
  }

  if (loading) return <Loader />;

  if (isSalesRoleView) {
    const tokensValue = salesKpis?.tokens ?? 'N/A';
    const partialDownPaymentsValue = salesKpis?.partial_down_payments ?? 'N/A';
    const closedWonValue = salesKpis?.closed_won_cases ?? 'N/A';
    const achievedRevenueValue = salesKpis?.achieved_revenue ?? summary?.financials?.total_received ?? 'N/A';
    const soldUnits = salesKpis?.project_units_sold;
    const targetUnits = salesKpis?.project_units_target;
    const unitTargetDisplay = (soldUnits !== undefined && targetUnits !== undefined) ? `${soldUnits}/${targetUnits}` : 'N/A';
    const unitTargetSub = salesKpis?.project_units_target_achievement_pct !== undefined
      ? `${salesKpis.project_units_target_achievement_pct}% achieved`
      : 'Awaiting target endpoint data';

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Analytics Engine</h2>
          <p className="text-sm text-gray-500 mt-1">Role-scoped sales dashboard</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <SummaryCard label="Tokens" value={typeof tokensValue === 'number' ? formatCurrency(tokensValue) : tokensValue} sub={salesKpis ? undefined : 'Fallback mode'} />
          <SummaryCard label="Partial Down Payments" value={typeof partialDownPaymentsValue === 'number' ? formatCurrency(partialDownPaymentsValue) : partialDownPaymentsValue} sub={salesKpis ? undefined : 'Fallback mode'} />
          <SummaryCard label="Closed Won Cases" value={closedWonValue} />
          <SummaryCard label="Achieved Revenue" value={typeof achievedRevenueValue === 'number' ? formatCurrency(achievedRevenueValue) : achievedRevenueValue} />
          <SummaryCard label="Project Unit/Target" value={unitTargetDisplay} sub={unitTargetSub} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">Analytics Engine</h2>
        <p className="text-sm text-gray-500 mt-1">Comprehensive system overview & analytics</p>
      </div>

      {/* Mini-tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit flex-wrap">
        {dashMiniTabs.map(t => (
          <button key={t.id} onClick={() => setDashSubTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${dashSubTab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {summary && (
        <>
          {/* ====== OVERVIEW TAB ====== */}
          {dashSubTab === 'overview' && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <SummaryCard label="Total Customers" value={summary.customers?.total} />
                <SummaryCard label="Total Transactions" value={summary.transactions?.total} />
                <SummaryCard label="Total Sale Value" value={formatCurrency(summary.financials?.total_sale)} />
                <SummaryCard label="Total Received" value={formatCurrency(summary.financials?.total_received)} />
              </div>
              {['admin', 'cco', 'manager'].includes(getUserRole()) && <StaleLeadsCard />}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <SummaryCard label="This Month Sale" value={formatCurrency(summary.transactions?.this_month_value)} />
                <SummaryCard label="Active Projects" value={summary.projects?.active} />
                <SummaryCard label="Available Inventory" value={summary.inventory?.available} sub={`${summary.inventory?.total} total units`} />
                <SummaryCard label="Active Brokers" value={summary.brokers?.active} />
              </div>
              {/* Quick outstanding summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                  <div className="text-xs font-medium text-red-600 uppercase mb-1">Total Overdue</div>
                  <div className="text-2xl font-bold text-red-700">{formatCurrency(summary.financials?.total_overdue || 0)}</div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                  <div className="text-xs font-medium text-blue-600 uppercase mb-1">Future Receivable</div>
                  <div className="text-2xl font-bold text-blue-700">{formatCurrency(summary.financials?.future_receivable || 0)}</div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                  <div className="text-xs font-medium text-gray-600 uppercase mb-1">Total Outstanding</div>
                  <div className="text-2xl font-bold text-gray-900">{formatCurrency(summary.financials?.total_outstanding)}</div>
                </div>
              </div>
            </>
          )}

          {/* ====== RECEIVABLES TAB ====== */}
          {dashSubTab === 'receivables' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
                  <div className="text-xs font-medium text-red-600 uppercase mb-1">Total Overdue</div>
                  <div className="text-2xl font-bold text-red-700">{formatCurrency(summary.financials?.total_overdue || 0)}</div>
                  <div className="text-xs text-red-500 mt-1">Installments due on or before today</div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
                  <div className="text-xs font-medium text-blue-600 uppercase mb-1">Future Receivable</div>
                  <div className="text-2xl font-bold text-blue-700">{formatCurrency(summary.financials?.future_receivable || 0)}</div>
                  <div className="text-xs text-blue-500 mt-1">Not due yet</div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5">
                  <div className="text-xs font-medium text-gray-600 uppercase mb-1">Total Outstanding</div>
                  <div className="text-2xl font-bold text-gray-900">{formatCurrency(summary.financials?.total_outstanding)}</div>
                  <div className="text-xs text-gray-500 mt-1">Sale: {formatCurrency(summary.financials?.total_sale)} | Received: {formatCurrency(summary.financials?.total_received)}</div>
                </div>
              </div>
              {topReceivables.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border p-6">
                  <h3 className="text-lg font-semibold mb-4">Top Receivables by Customer</h3>
                  <div className="space-y-3">
                    {topReceivables.map(c => (
                      <div key={c.customer_id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex justify-between items-start mb-3">
                          <button onClick={() => loadCustomerDetails(c.customer_id)} className="text-left hover:text-blue-600 transition-colors">
                            <div className="font-semibold text-gray-900">{c.customer_name}</div>
                            <div className="text-xs text-gray-500">{c.customer_id} {c.mobile && `\u2022 ${c.mobile}`}</div>
                          </button>
                          <div className="text-right">
                            <div className="font-semibold text-gray-900">{formatCurrency(c.total_outstanding)}</div>
                            <div className="text-xs text-gray-500">{c.transaction_count} transactions</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3 pt-3 border-t">
                          <div>
                            <div className="text-xs text-gray-500 mb-1">Overdue</div>
                            <div className="text-sm font-semibold text-red-600">{formatCurrency(c.overdue)}</div>
                            <div className="text-xs text-gray-400">{c.overdue_installments?.length || 0} installments</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500 mb-1">Future Receivable</div>
                            <div className="text-sm font-semibold text-blue-600">{formatCurrency(c.future_receivable)}</div>
                            <div className="text-xs text-gray-400">{c.future_installments?.length || 0} installments</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500 mb-1">Total Sale</div>
                            <div className="text-sm font-semibold text-gray-900">{formatCurrency(c.total_sale)}</div>
                            <div className="text-xs text-gray-400">{formatCurrency(c.total_received)} received</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ====== SALES TAB ====== */}
          {dashSubTab === 'sales' && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <SummaryCard label="Total Sale Value" value={formatCurrency(summary.financials?.total_sale)} />
                <SummaryCard label="This Month Sale" value={formatCurrency(summary.transactions?.this_month_value)} />
                <SummaryCard label="Total Received" value={formatCurrency(summary.financials?.total_received)} />
                {receiptSummary && <SummaryCard label="This Month Received" value={formatCurrency(receiptSummary.month_amount)} />}
              </div>
              {txnSummary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <SummaryCard label="Total Transactions" value={txnSummary.total_transactions} />
                  <SummaryCard label="This Month Txns" value={txnSummary.this_month_count} />
                  {receiptSummary && <SummaryCard label="Today Receipts" value={receiptSummary.today_count} sub={formatCurrency(receiptSummary.today_amount)} />}
                  {receiptSummary && <SummaryCard label="By Cash" value={formatCurrency(receiptSummary.by_method?.cash || 0)} />}
                </div>
              )}
              {/* Revenue Trends Chart */}
              {revenueTrends.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border p-6">
                  <h3 className="text-lg font-semibold mb-4">Revenue Trends (Last 90 Days)</h3>
                  <div className="flex items-end gap-px h-48 overflow-x-auto">
                    {revenueTrends.slice(-60).map((d, i) => (
                      <div key={i} className="flex flex-col items-center flex-shrink-0" style={{ width: `${Math.max(100 / Math.min(revenueTrends.length, 60), 1.5)}%` }}>
                        <div className="w-full flex flex-col items-center gap-px" style={{ height: '180px' }}>
                          <div className="w-full flex items-end justify-center gap-0.5" style={{ height: '180px' }}>
                            <div className="bg-green-400 rounded-t" title={`Receipts: ${formatCurrency(d.receipts)}`}
                              style={{ width: '45%', height: `${Math.max((d.receipts / trendMax) * 100, 1)}%`, minHeight: '2px' }} />
                            <div className="bg-red-300 rounded-t" title={`Payments: ${formatCurrency(d.payments)}`}
                              style={{ width: '45%', height: `${Math.max((d.payments / trendMax) * 100, 1)}%`, minHeight: '2px' }} />
                          </div>
                        </div>
                        {i % Math.max(Math.floor(revenueTrends.slice(-60).length / 8), 1) === 0 && (
                          <div className="text-xs text-gray-400 mt-1 transform -rotate-45 origin-top-left whitespace-nowrap">{d.date?.slice(5)}</div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-400 rounded inline-block" /> Receipts</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-300 rounded inline-block" /> Payments</span>
                  </div>
                </div>
              )}
              {/* Top Customers by Sale Value */}
              {customerStats.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border p-6">
                  <h3 className="text-lg font-semibold mb-4">Top Customers by Sale Value</h3>
                  <div className="space-y-2">
                    {[...customerStats].sort((a, b) => b.total_sale - a.total_sale).slice(0, 10).map(c => (
                      <div key={c.customer_id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                        <button onClick={() => loadCustomerDetails(c.customer_id)} className="text-left hover:text-blue-600 transition-colors">
                          <div className="font-medium">{c.name}</div>
                          <div className="text-xs text-gray-500">{c.customer_id}</div>
                        </button>
                        <div className="text-right">
                          <div className="font-semibold">{formatCurrency(c.total_sale)}</div>
                          <div className="text-xs text-gray-500">{c.transaction_count} transactions</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ====== BROKERS TAB ====== */}
          {dashSubTab === 'brokers' && (
            <>
              {brokerSummary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <SummaryCard label="Total Brokers" value={brokerSummary.total_brokers} />
                  <SummaryCard label="Active Brokers" value={brokerSummary.active_brokers} />
                  <SummaryCard label="Total Commission" value={formatCurrency(brokerSummary.total_commission_owed)} />
                  <SummaryCard label="Total Deal Value" value={formatCurrency(brokerSummary.total_deals_value)} />
                </div>
              )}
              {brokerSummary && (
                <div className="grid grid-cols-2 gap-4">
                  <SummaryCard label="Deals This Month" value={brokerSummary.deals_this_month} sub={formatCurrency(brokerSummary.deals_this_month_value)} />
                  <SummaryCard label="Top Performers" value={brokerSummary.top_performers?.length || 0} />
                </div>
              )}
              {topBroker && (
                <div className="bg-white rounded-2xl shadow-sm border p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Top Broker Performance</h3>
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded">#1</span>
                  </div>
                  <div className="space-y-4">
                    <button onClick={() => loadBrokerDetails(topBroker.broker_id)} className="text-left w-full hover:bg-gray-50 p-2 rounded-lg transition-colors">
                      <div className="font-semibold text-gray-900">{topBroker.name}</div>
                      <div className="text-xs text-gray-500">{topBroker.broker_id} {topBroker.mobile && `\u2022 ${topBroker.mobile}`}</div>
                    </button>
                    <div className="grid grid-cols-2 gap-3 pt-3 border-t">
                      <div><div className="text-xs text-gray-500">Total Sales</div><div className="text-lg font-semibold">{formatCurrency(topBroker.total_sale_value)}</div></div>
                      <div><div className="text-xs text-gray-500">Transactions</div><div className="text-lg font-semibold">{topBroker.total_transactions}</div></div>
                      <div><div className="text-xs text-gray-500">Commission Rate</div><div className="text-lg font-semibold">{topBroker.commission?.rate}%</div></div>
                      <div><div className="text-xs text-gray-500">Commission Earned</div><div className="text-lg font-semibold text-green-600">{formatCurrency(topBroker.commission?.total_earned)}</div></div>
                    </div>
                  </div>
                </div>
              )}
              {/* All brokers ranked */}
              {brokerStats.length > 1 && (
                <div className="bg-white rounded-2xl shadow-sm border p-6">
                  <h3 className="text-lg font-semibold mb-4">Broker Rankings</h3>
                  <div className="space-y-2">
                    {[...brokerStats].sort((a, b) => b.total_sale_value - a.total_sale_value).map((b, i) => (
                      <div key={b.broker_id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-yellow-100 text-yellow-800' : i === 1 ? 'bg-gray-200 text-gray-700' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>{i + 1}</span>
                          <button onClick={() => loadBrokerDetails(b.broker_id)} className="text-left hover:text-blue-600">
                            <div className="font-medium">{b.name}</div>
                            <div className="text-xs text-gray-500">{b.broker_id}</div>
                          </button>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">{formatCurrency(b.total_sale_value)}</div>
                          <div className="text-xs text-gray-500">{b.total_transactions} deals</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ====== PROJECTS & INVENTORY TAB ====== */}
          {dashSubTab === 'projects' && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <SummaryCard label="Active Projects" value={summary.projects?.active} sub={`${summary.projects?.total} total`} />
                <SummaryCard label="Total Inventory" value={summary.inventory?.total} />
                <SummaryCard label="Available" value={summary.inventory?.available} />
                <SummaryCard label="Sold" value={summary.inventory?.sold} />
              </div>
              {projectInventory.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border p-6">
                  <h3 className="text-lg font-semibold mb-4">Project-Wise Inventory Analysis</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-3 font-semibold text-gray-700">Project</th>
                          <th className="text-right p-3 font-semibold text-gray-700">Total</th>
                          <th className="text-right p-3 font-semibold text-gray-700">Available</th>
                          <th className="text-right p-3 font-semibold text-gray-700">Sold</th>
                          <th className="text-right p-3 font-semibold text-gray-700">Marlas</th>
                          <th className="text-right p-3 font-semibold text-gray-700">Total Value</th>
                          <th className="text-right p-3 font-semibold text-gray-700">Utilization</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projectInventory.map(p => (
                          <tr key={p.project_id} className="border-b hover:bg-gray-50">
                            <td className="p-3"><div className="font-medium">{p.name}</div><div className="text-xs text-gray-500">{p.location || ''}</div></td>
                            <td className="text-right p-3">{p.summary.total_units}</td>
                            <td className="text-right p-3 text-green-600 font-medium">{p.summary.available_units}</td>
                            <td className="text-right p-3 text-blue-600 font-medium">{p.summary.sold_units}</td>
                            <td className="text-right p-3">{p.area.total_marlas.toFixed(1)}</td>
                            <td className="text-right p-3 font-medium">{formatCurrency(p.value.total_value)}</td>
                            <td className="text-right p-3">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${p.summary.utilization_rate >= 80 ? 'bg-green-100 text-green-800' : p.summary.utilization_rate >= 50 ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>{p.summary.utilization_rate.toFixed(1)}%</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {projectStats.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border p-6">
                  <h3 className="text-lg font-semibold mb-4">Project Performance</h3>
                  <div className="space-y-2">
                    {[...projectStats].sort((a, b) => b.financials.total_sale - a.financials.total_sale).slice(0, 10).map(p => (
                      <div key={p.project_id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <div><div className="font-medium">{p.name}</div><div className="text-xs text-gray-500">{p.project_id}</div></div>
                        <div className="text-right"><div className="font-semibold">{formatCurrency(p.financials.total_sale)}</div><div className="text-xs text-gray-500">{p.transaction_count} transactions</div></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ====== CAMPAIGNS TAB (mini analytics summary) ====== */}
          {dashSubTab === 'campaigns' && (
            <>
              {campaignMetricsLoading && <Loader />}
              {campaignMetrics && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <SummaryCard label="Total Leads" value={campaignMetrics.overall?.total_leads} />
                    <SummaryCard label="Converted" value={campaignMetrics.overall?.converted} />
                    <SummaryCard label="Conversion Rate" value={`${campaignMetrics.overall?.conversion_rate}%`} />
                    <SummaryCard label="Revenue Attributed" value={formatCurrency(campaignMetrics.overall?.total_revenue_attributed)} />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <SummaryCard label="Active Leads" value={campaignMetrics.overall?.active} />
                    <SummaryCard label="Lost" value={campaignMetrics.overall?.lost} />
                    <SummaryCard label="Avg Days to Convert" value={campaignMetrics.overall?.avg_days_to_conversion} />
                    <SummaryCard label="ROI" value={`${campaignMetrics.overall?.overall_roi}%`} />
                  </div>
                  {/* Mini funnel */}
                  {campaignMetrics.funnel?.length > 0 && (
                    <div className="bg-white rounded-2xl shadow-sm border p-6">
                      <h3 className="text-lg font-semibold mb-4">Conversion Funnel</h3>
                      <div className="space-y-2">
                        {campaignMetrics.funnel.filter(s => s.count > 0).map((s, i) => (
                          <div key={s.stage} className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 rounded-lg p-1 -m-1 transition-colors"
                            onClick={() => s.count > 0 && setDashDrilldownFilters({ stage: s.stage })}>
                            <div className="w-28 text-sm font-medium text-gray-700 text-right">{s.stage}</div>
                            <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden relative">
                              <div className="h-full rounded-lg transition-all" style={{ width: `${s.pct_of_total}%`, backgroundColor: s.color || '#6B7280', minWidth: s.count > 0 ? '20px' : '0' }} />
                              <span className="absolute inset-0 flex items-center px-3 text-xs font-semibold">{s.count} ({s.pct_of_total}%)</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Campaign comparison */}
                  {campaignMetrics.by_campaign?.length > 0 && (
                    <div className="bg-white rounded-2xl shadow-sm border p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">Campaign Comparison</h3>
                        <button onClick={() => { if (window.setActiveTab) window.setActiveTab('campaigns'); }} className="text-sm text-blue-600 hover:text-blue-800">View Full Analytics &rarr;</button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b">
                            <th className="text-left p-2 font-semibold text-gray-700">Campaign</th>
                            <th className="text-right p-2 font-semibold text-gray-700">Leads</th>
                            <th className="text-right p-2 font-semibold text-gray-700">Converted</th>
                            <th className="text-right p-2 font-semibold text-gray-700">Rate</th>
                            <th className="text-right p-2 font-semibold text-gray-700">Revenue</th>
                            <th className="text-right p-2 font-semibold text-gray-700">ROI</th>
                          </tr></thead>
                          <tbody>
                            {campaignMetrics.by_campaign.slice(0, 8).map(c => (
                              <tr key={c.campaign_id} className="border-b hover:bg-gray-50">
                                <td className="p-2"><div className="font-medium">{c.name}</div><div className="text-xs text-gray-500">{c.source}</div></td>
                                <td className="text-right p-2">{c.leads}</td>
                                <td className="text-right p-2 text-green-600 font-medium">{c.converted}</td>
                                <td className="text-right p-2">{c.conversion_rate}%</td>
                                <td className="text-right p-2 font-medium">{formatCurrency(c.revenue_generated)}</td>
                                <td className="text-right p-2"><span className={c.roi > 0 ? 'text-green-600' : 'text-red-600'}>{c.roi}%</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
              {!campaignMetricsLoading && !campaignMetrics && (
                <div className="text-center py-12 text-gray-400">No campaign analytics data available</div>
              )}
            </>
          )}

          {/* ====== TASKS MINI-TAB ====== */}
          {dashSubTab === 'tasks' && (
            <TasksDashboardMini />
          )}
        </>
      )}

      {selectedCustomer && customerDetails && (
        <CustomerDetailModal customer={customerDetails} onClose={() => { setSelectedCustomer(null); setCustomerDetails(null); }} />
      )}
      {selectedBroker && brokerDetails && (
        <BrokerDetailModal broker={brokerDetails} onClose={() => { setSelectedBroker(null); setBrokerDetails(null); }} />
      )}
      {dashDrilldownFilters && (
        <AnalyticsLeadDrilldown filters={dashDrilldownFilters} onClose={() => setDashDrilldownFilters(null)} />
      )}
    </div>
  );
}

// ============================================
// REPORTS VIEW
// ============================================
function ReportsView() {
  const [customers, setCustomers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedBroker, setSelectedBroker] = useState(null);
  const [customerReport, setCustomerReport] = useState(null);
  const [projectReport, setProjectReport] = useState(null);
  const [brokerReport, setBrokerReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState('customer');
  const [expandedTransactions, setExpandedTransactions] = useState(new Set());
  const [expandedInventory, setExpandedInventory] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [brokerSearch, setBrokerSearch] = useState('');

  useEffect(() => { loadData(); }, []);
  const loadData = async () => {
    try {
      const [custRes, projRes, brkRes] = await Promise.all([
        api.get('/customers').catch(() => ({ data: [] })),
        api.get('/projects').catch(() => ({ data: [] })),
        api.get('/brokers').catch(() => ({ data: [] }))
      ]);
      setCustomers(custRes.data || []);
      setProjects(projRes.data || []);
      setBrokers(brkRes.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadCustomerReport = async (customerId) => {
    try {
      setLoading(true);
      const res = await api.get(`/reports/customers/detailed/${customerId}`);
      setCustomerReport(res.data);
      setSelectedCustomer(customerId);
    } catch (e) { 
      alert('Error loading report: ' + (e.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  const loadProjectReport = async (projectId) => {
    try {
      setLoading(true);
      const res = await api.get(`/reports/projects/${projectId}`);
      setProjectReport(res.data);
      setSelectedProject(projectId);
    } catch (e) { 
      alert('Error loading report: ' + (e.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  const loadBrokerReport = async (brokerId) => {
    try {
      setLoading(true);
      const res = await api.get(`/reports/brokers/${brokerId}`);
      setBrokerReport(res.data);
      setSelectedBroker(brokerId);
    } catch (e) { 
      alert('Error loading report: ' + (e.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async (type, id) => {
    try {
      let url = '';
      if (type === 'customer') url = `/api/reports/customers/pdf/${id}`;
      else if (type === 'project') url = `/api/reports/projects/pdf/${id}`;
      else if (type === 'broker') url = `/api/reports/brokers/pdf/${id}`;
      
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${type}_${id}_report.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (e) { alert('Error downloading PDF'); }
  };

  const downloadExcel = async (type) => {
    try {
      let url = '';
      if (type === 'customer') url = '/api/reports/customers/excel';
      else if (type === 'project') url = '/api/reports/projects/excel';
      else if (type === 'broker') url = '/api/reports/brokers/excel';
      
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${type}s_report.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (e) { alert('Error downloading Excel'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-semibold text-gray-900">Reports & Analytics</h2>
          <p className="text-sm text-gray-500 mt-1">Generate detailed reports and exports</p></div>
      </div>

      {/* Report Type Selector */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex gap-2">
          <button onClick={() => setReportType('customer')} className={`px-4 py-2 rounded-lg text-sm font-medium ${reportType === 'customer' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}>
            Customer Reports
          </button>
          <button onClick={() => setReportType('project')} className={`px-4 py-2 rounded-lg text-sm font-medium ${reportType === 'project' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}>
            Project Reports
          </button>
          <button onClick={() => setReportType('broker')} className={`px-4 py-2 rounded-lg text-sm font-medium ${reportType === 'broker' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}>
            Broker Reports
          </button>
        </div>
      </div>

      {reportType === 'customer' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border p-4">
              <h3 className="text-sm font-medium text-gray-600 mb-2">Select Customer</h3>
              <input type="text" placeholder="Search name or ID..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-xs mb-2 focus:outline-none focus:ring-1 focus:ring-gray-400" />
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {customers.filter(c => {
                  if (!customerSearch.trim()) return true;
                  const q = customerSearch.toLowerCase();
                  return (c.name || '').toLowerCase().includes(q) || (c.customer_id || '').toLowerCase().includes(q) || (c.mobile || '').includes(q);
                }).map(c => (
                  <button key={c.id} onClick={() => loadCustomerReport(c.id)}
                    className={`w-full text-left p-2 rounded text-xs ${selectedCustomer === c.id ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'}`}>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-gray-500">{c.customer_id}</div>
                  </button>
                ))}
              </div>
              <button onClick={() => downloadExcel('customer')} className="mt-3 w-full px-3 py-2 bg-gray-800 text-white rounded text-xs font-medium hover:bg-gray-900">
                Export All (Excel)
              </button>
            </div>

            {customerReport ? (
              <div className="lg:col-span-3 space-y-4">
                {/* Report Header */}
                <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-lg border border-gray-700 p-6 text-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-2xl font-bold mb-1">{customerReport.report_header?.title || 'Customer Detailed Financial Report'}</h2>
                      <div className="text-sm text-gray-300">
                        Generated via <span className="font-semibold text-white">ORBIT</span>
                        {customerReport.report_header?.generated_at && (
                          <span className="ml-4">â€¢ {new Date(customerReport.report_header.generated_at).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => downloadPDF('customer', customerReport.customer.customer_id)} 
                      className="px-4 py-2 bg-white text-gray-900 rounded text-sm font-medium hover:bg-gray-100">
                      Export PDF
                    </button>
                  </div>
                </div>

                {/* Customer Info Header */}
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">{customerReport.customer.name}</h3>
                      <div className="text-sm text-gray-600 mt-1">
                        {customerReport.customer.customer_id} â€¢ {customerReport.customer.mobile}
                        {customerReport.customer.email && ` â€¢ ${customerReport.customer.email}`}
                      </div>
                      {customerReport.customer.address && (
                        <div className="text-sm text-gray-500 mt-1">{customerReport.customer.address}</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Financial Summary Cards */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Total Sale</div>
                    <div className="text-2xl font-semibold text-gray-900">{formatCurrency(customerReport.financials.total_sale)}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Total Received</div>
                    <div className="text-2xl font-semibold text-green-700">{formatCurrency(customerReport.financials.total_received)}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Overdue</div>
                    <div className="text-2xl font-semibold text-red-600">{formatCurrency(customerReport.financials.overdue)}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Future Receivable</div>
                    <div className="text-2xl font-semibold text-blue-600">{formatCurrency(customerReport.financials.future_receivable)}</div>
                  </div>
                </div>

                {/* Transactions Table */}
                <div className="bg-white rounded-lg border">
                  <div className="p-4 border-b">
                    <h4 className="font-semibold text-gray-900">Transactions ({customerReport.transactions.length})</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Transaction ID</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Project</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Unit</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Area (Marla)</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Total Value</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Received</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Balance</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {customerReport.transactions.map((txn, idx) => (
                          <React.Fragment key={idx}>
                            <tr className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-mono text-xs">{txn.transaction_id}</td>
                              <td className="px-4 py-3">{txn.project_name || '-'}</td>
                              <td className="px-4 py-3">{txn.unit_number || '-'}</td>
                              <td className="px-4 py-3 text-right">{txn.area_marla.toFixed(2)}</td>
                              <td className="px-4 py-3 text-right font-medium">{formatCurrency(txn.total_value)}</td>
                              <td className="px-4 py-3 text-right text-green-700">{formatCurrency(txn.received)}</td>
                              <td className="px-4 py-3 text-right">{formatCurrency(txn.balance)}</td>
                              <td className="px-4 py-3">
                                <button onClick={() => {
                                  const newExpanded = new Set(expandedTransactions);
                                  if (newExpanded.has(idx)) newExpanded.delete(idx);
                                  else newExpanded.add(idx);
                                  setExpandedTransactions(newExpanded);
                                }} className="text-gray-600 hover:text-gray-900">
                                  {expandedTransactions.has(idx) ? 'â–¼' : 'â–¶'}
                                </button>
                              </td>
                            </tr>
                            {expandedTransactions.has(idx) && txn.installments && (
                              <tr>
                                <td colSpan="8" className="px-4 py-3 bg-gray-50">
                                  <div className="text-xs">
                                    <div className="font-semibold mb-2">Installments:</div>
                                    <table className="w-full">
                                      <thead>
                                        <tr className="border-b">
                                          <th className="text-left py-1">#</th>
                                          <th className="text-left py-1">Due Date</th>
                                          <th className="text-right py-1">Amount</th>
                                          <th className="text-right py-1">Paid</th>
                                          <th className="text-right py-1">Balance</th>
                                          <th className="text-left py-1">Status</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {txn.installments.map((inst, i) => (
                                          <tr key={i} className={inst.is_overdue ? 'text-red-600' : ''}>
                                            <td className="py-1">{inst.number}</td>
                                            <td className="py-1">{inst.due_date}</td>
                                            <td className="text-right py-1">{formatCurrency(inst.amount)}</td>
                                            <td className="text-right py-1">{formatCurrency(inst.paid)}</td>
                                            <td className="text-right py-1 font-medium">{formatCurrency(inst.balance)}</td>
                                            <td className="py-1">
                                              <span className={`px-2 py-0.5 rounded text-xs ${inst.is_overdue ? 'bg-red-100 text-red-700' : 'bg-gray-100'}`}>
                                                {inst.status}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Interactions History */}
                <div className="bg-white rounded-lg border">
                  <div className="p-4 border-b">
                    <h4 className="font-semibold text-gray-900">Interactions History ({customerReport.interactions.total_count})</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Date & Time</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Rep</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Notes</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Next Follow-up</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {customerReport.interactions.history.map((interaction, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-xs">{new Date((interaction.date || interaction.created_at) + (String(interaction.date || interaction.created_at).endsWith('Z') ? '' : 'Z')).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td>
                            <td className="px-4 py-3">{interaction.type}</td>
                            <td className="px-4 py-3">{interaction.rep_name || '-'}</td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded text-xs bg-gray-100">{interaction.status}</span>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600">{interaction.notes || '-'}</td>
                            <td className="px-4 py-3 text-xs">{interaction.next_follow_up ? new Date(interaction.next_follow_up).toLocaleDateString() : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Installment Schedule */}
                {customerReport.installment_schedule && customerReport.installment_schedule.length > 0 && (
                  <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                    <div className="p-4 border-b border-gray-200 bg-gray-50">
                      <h4 className="font-semibold text-gray-900">Complete Installment Schedule</h4>
                      <p className="text-xs text-gray-600 mt-1">All installments with due dates, balances, and receipt allocations</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">#</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Project</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Due Date</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Amount</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Paid</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Balance</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Days Outstanding</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Receipts</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {customerReport.installment_schedule.map((inst, idx) => (
                            <tr key={idx} className={`hover:bg-gray-50 ${inst.is_overdue ? 'bg-red-50' : ''}`}>
                              <td className="px-4 py-3 font-medium">{inst.number}</td>
                              <td className="px-4 py-3 text-xs text-gray-600">{inst.project_name || '-'}</td>
                              <td className="px-4 py-3">{inst.due_date ? new Date(inst.due_date).toLocaleDateString() : '-'}</td>
                              <td className="px-4 py-3 text-right">{formatCurrency(inst.amount)}</td>
                              <td className="px-4 py-3 text-right text-green-700">{formatCurrency(inst.paid)}</td>
                              <td className={`px-4 py-3 text-right font-medium ${inst.is_overdue ? 'text-red-600' : 'text-gray-900'}`}>
                                {formatCurrency(inst.balance)}
                              </td>
                              <td className={`px-4 py-3 text-right ${inst.days_outstanding > 0 ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                                {inst.days_outstanding !== null ? `${inst.days_outstanding} days` : '-'}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded text-xs ${
                                  inst.is_overdue ? 'bg-red-100 text-red-700' : 
                                  inst.status === 'paid' ? 'bg-green-100 text-green-700' : 
                                  'bg-gray-100 text-gray-700'
                                }`}>
                                  {inst.status}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {inst.receipt_allocations && inst.receipt_allocations.length > 0 ? (
                                  <div className="text-xs">
                                    {inst.receipt_allocations.map((rec, rIdx) => (
                                      <div key={rIdx} className="text-gray-600">
                                        {rec.receipt_id}: {formatCurrency(rec.amount)}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-xs">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Unallocated Receipts */}
                {customerReport.unallocated_receipts && customerReport.unallocated_receipts.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <h4 className="font-semibold text-amber-900 mb-3">Unallocated Receipts</h4>
                    <p className="text-xs text-amber-700 mb-3">These receipts need to be allocated to installments</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-amber-100 border-b border-amber-200">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-amber-900">Receipt ID</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-amber-900">Payment Date</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-amber-900">Method</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-amber-900">Total Amount</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-amber-900">Allocated</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-amber-900">Unallocated</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-200">
                          {customerReport.unallocated_receipts.map((rec, idx) => (
                            <tr key={idx} className="hover:bg-amber-100">
                              <td className="px-4 py-2 font-mono text-xs">{rec.receipt_id}</td>
                              <td className="px-4 py-2 text-xs">{rec.payment_date ? new Date(rec.payment_date).toLocaleDateString() : '-'}</td>
                              <td className="px-4 py-2 text-xs">{rec.payment_method || '-'}</td>
                              <td className="px-4 py-2 text-right font-medium">{formatCurrency(rec.total_amount)}</td>
                              <td className="px-4 py-2 text-right text-green-700">{formatCurrency(rec.allocated_amount)}</td>
                              <td className="px-4 py-2 text-right font-semibold text-amber-700">{formatCurrency(rec.unallocated_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Receipts Summary */}
                {customerReport.receipts && (
                  <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                    <h4 className="font-semibold text-gray-900 mb-3">Receipts Summary</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-gray-600">Total Receipts: <span className="font-semibold">{customerReport.receipts.total_count}</span></div>
                        <div className="text-gray-600 mt-1">Total Amount: <span className="font-semibold">{formatCurrency(customerReport.receipts.total_amount)}</span></div>
                      </div>
                      <div>
                        <div className="text-gray-600 mb-1">By Payment Method:</div>
                        {Object.entries(customerReport.receipts.by_method || {}).map(([method, amount]) => (
                          <div key={method} className="text-xs text-gray-600">
                            {method}: {formatCurrency(amount)}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="lg:col-span-3 bg-white rounded-lg border p-12 text-center text-gray-400">
                {loading ? 'Loading report...' : 'Select a customer to view detailed report'}
              </div>
            )}
          </div>
        </div>
      )}

      {reportType === 'project' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border p-4">
              <h3 className="text-sm font-medium text-gray-600 mb-2">Select Project</h3>
              <input type="text" placeholder="Search name or ID..." value={projectSearch} onChange={e => setProjectSearch(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-xs mb-2 focus:outline-none focus:ring-1 focus:ring-gray-400" />
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {projects.filter(p => {
                  if (!projectSearch.trim()) return true;
                  const q = projectSearch.toLowerCase();
                  return (p.name || '').toLowerCase().includes(q) || (p.project_id || '').toLowerCase().includes(q);
                }).map(p => (
                  <button key={p.id} onClick={() => loadProjectReport(p.id)}
                    className={`w-full text-left p-2 rounded text-xs ${selectedProject === p.id ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'}`}>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-gray-500">{p.project_id}</div>
                  </button>
                ))}
              </div>
              <button onClick={() => downloadExcel('project')} className="mt-3 w-full px-3 py-2 bg-gray-800 text-white rounded text-xs font-medium hover:bg-gray-900">
                Export All (Excel)
              </button>
            </div>

            {projectReport ? (
              <div className="lg:col-span-3 space-y-4">
                {/* Report Header */}
                <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-lg border border-gray-700 p-6 text-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-2xl font-bold mb-1">{projectReport.report_header?.title || 'Project Financial Report'}</h2>
                      <div className="text-sm text-gray-300">
                        Generated via <span className="font-semibold text-white">ORBIT</span>
                        {projectReport.report_header?.generated_at && (
                          <span className="ml-4">â€¢ {new Date(projectReport.report_header.generated_at).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => downloadPDF('project', projectReport.project.project_id)} 
                      className="px-4 py-2 bg-white text-gray-900 rounded text-sm font-medium hover:bg-gray-100">
                      Export PDF
                    </button>
                  </div>
                </div>

                {/* Project Info Header */}
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">{projectReport.project.name}</h3>
                      <div className="text-sm text-gray-600 mt-1">
                        {projectReport.project.project_id} â€¢ {projectReport.project.location}
                      </div>
                      {projectReport.project.description && (
                        <div className="text-sm text-gray-500 mt-2">{projectReport.project.description}</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Financial Summary Cards */}
                <div className="grid grid-cols-5 gap-4">
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Total Sale</div>
                    <div className="text-xl font-semibold text-gray-900">{formatCurrency(projectReport.financials.total_sale)}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Total Received</div>
                    <div className="text-xl font-semibold text-green-700">{formatCurrency(projectReport.financials.total_received)}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Overdue</div>
                    <div className="text-xl font-semibold text-red-600">{formatCurrency(projectReport.financials.overdue)}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Future Receivable</div>
                    <div className="text-xl font-semibold text-blue-600">{formatCurrency(projectReport.financials.future_receivable)}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Outstanding</div>
                    <div className="text-xl font-semibold text-gray-900">{formatCurrency(projectReport.financials.outstanding)}</div>
                  </div>
                </div>

                {/* Inventory Summary */}
                <div className="bg-white rounded-lg border p-4">
                  <h4 className="font-semibold text-gray-900 mb-3">Inventory Summary</h4>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600">Total Units: <span className="font-semibold">{projectReport.inventory.total_units}</span></div>
                      <div className="text-gray-600 mt-1">Available: <span className="font-semibold text-green-700">{projectReport.inventory.available_units}</span></div>
                      <div className="text-gray-600 mt-1">Sold: <span className="font-semibold">{projectReport.inventory.sold_units}</span></div>
                    </div>
                    <div>
                      <div className="text-gray-600">Total Marlas: <span className="font-semibold">{projectReport.inventory.total_marlas.toFixed(2)}</span></div>
                      <div className="text-gray-600 mt-1">Available: <span className="font-semibold text-green-700">{projectReport.inventory.available_marlas.toFixed(2)}</span></div>
                      <div className="text-gray-600 mt-1">Sold: <span className="font-semibold">{projectReport.inventory.sold_marlas.toFixed(2)}</span></div>
                    </div>
                    <div>
                      <div className="text-gray-600">Total Value: <span className="font-semibold">{formatCurrency(projectReport.inventory.total_value)}</span></div>
                      <div className="text-gray-600 mt-1">Available Value: <span className="font-semibold text-green-700">{formatCurrency(projectReport.inventory.available_value)}</span></div>
                      <div className="text-gray-600 mt-1">Sold Value: <span className="font-semibold">{formatCurrency(projectReport.inventory.sold_value)}</span></div>
                    </div>
                  </div>
                </div>

                {/* Marla-wise Breakdown */}
                {projectReport.inventory.marla_wise_breakdown && (
                  <div className="bg-white rounded-lg border">
                    <div className="p-4 border-b flex items-center justify-between">
                      <h4 className="font-semibold text-gray-900">Marla-wise Inventory Breakdown</h4>
                      <button onClick={() => setExpandedInventory(!expandedInventory)} className="text-xs text-gray-600 hover:text-gray-900">
                        {expandedInventory ? 'Hide' : 'Show'} Details
                      </button>
                    </div>
                    {expandedInventory && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Marla Range</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Total Units</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Available</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Sold</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Total Marlas</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Total Value</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Available Value</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Sold Value</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {projectReport.inventory.marla_wise_breakdown.map((range, idx) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-4 py-3 font-medium">{range.range}</td>
                                <td className="px-4 py-3 text-right">{range.total_units}</td>
                                <td className="px-4 py-3 text-right text-green-700">{range.available_units}</td>
                                <td className="px-4 py-3 text-right">{range.sold_units}</td>
                                <td className="px-4 py-3 text-right">{range.total_marlas.toFixed(2)}</td>
                                <td className="px-4 py-3 text-right">{formatCurrency(range.total_value)}</td>
                                <td className="px-4 py-3 text-right text-green-700">{formatCurrency(range.available_value)}</td>
                                <td className="px-4 py-3 text-right">{formatCurrency(range.sold_value)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Inventory Details */}
                <div className="bg-white rounded-lg border">
                  <div className="p-4 border-b">
                    <h4 className="font-semibold text-gray-900">Inventory Details ({projectReport.inventory.details.length})</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Unit Number</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Block</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Area (Marla)</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Rate/Marla</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Total Value</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {projectReport.inventory.details.map((item, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3">{item.unit_number || '-'}</td>
                            <td className="px-4 py-3">{item.unit_type || '-'}</td>
                            <td className="px-4 py-3">{item.block || '-'}</td>
                            <td className="px-4 py-3 text-right">{item.area_marla.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(item.rate_per_marla)}</td>
                            <td className="px-4 py-3 text-right font-medium">{formatCurrency(item.total_value)}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded text-xs ${item.status === 'available' ? 'bg-green-100 text-green-700' : 'bg-gray-100'}`}>
                                {item.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Customer-wise Top Receivables */}
                {projectReport.customer_receivables && projectReport.customer_receivables.length > 0 && (
                  <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                    <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                      <h4 className="font-semibold text-gray-900 text-lg">Customer-wise Top Receivables</h4>
                      <p className="text-xs text-gray-600 mt-1">Grouped by customer with installment schedules - For CFO/COO Review</p>
                    </div>
                    <div className="divide-y divide-gray-200">
                      {projectReport.customer_receivables.map((customer, idx) => (
                        <div key={idx} className="p-4 hover:bg-gray-50">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h5 className="font-semibold text-gray-900">{customer.customer_name}</h5>
                              <div className="text-xs text-gray-600 mt-1">
                                {customer.customer_id} â€¢ {customer.mobile}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-gray-600">Total Outstanding</div>
                              <div className="text-lg font-bold text-red-600">{formatCurrency(customer.total_outstanding)}</div>
                              <div className="text-xs text-gray-500 mt-1">
                                Overdue: {formatCurrency(customer.total_overdue)} â€¢ Future: {formatCurrency(customer.total_future)}
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead className="bg-gray-100 border-b">
                                <tr>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-700">#</th>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Unit</th>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Due Date</th>
                                  <th className="px-3 py-2 text-right font-semibold text-gray-700">Amount</th>
                                  <th className="px-3 py-2 text-right font-semibold text-gray-700">Paid</th>
                                  <th className="px-3 py-2 text-right font-semibold text-gray-700">Balance</th>
                                  <th className="px-3 py-2 text-right font-semibold text-gray-700">Days Outstanding</th>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-700">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {customer.installments.map((inst, iIdx) => (
                                  <tr key={iIdx} className={inst.is_overdue ? 'bg-red-50' : ''}>
                                    <td className="px-3 py-2">{inst.installment_number}</td>
                                    <td className="px-3 py-2 text-gray-600">{inst.unit_number || '-'}</td>
                                    <td className="px-3 py-2">{inst.due_date ? new Date(inst.due_date).toLocaleDateString() : '-'}</td>
                                    <td className="px-3 py-2 text-right">{formatCurrency(inst.amount)}</td>
                                    <td className="px-3 py-2 text-right text-green-700">{formatCurrency(inst.paid)}</td>
                                    <td className={`px-3 py-2 text-right font-medium ${inst.is_overdue ? 'text-red-600' : 'text-gray-900'}`}>
                                      {formatCurrency(inst.balance)}
                                    </td>
                                    <td className={`px-3 py-2 text-right ${inst.days_outstanding > 0 ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                                      {inst.days_outstanding !== null ? `${inst.days_outstanding} days` : '-'}
                                    </td>
                                    <td className="px-3 py-2">
                                      <span className={`px-2 py-0.5 rounded text-xs ${
                                        inst.is_overdue ? 'bg-red-100 text-red-700' : 
                                        'bg-gray-100 text-gray-700'
                                      }`}>
                                        {inst.is_overdue ? 'Overdue' : 'Pending'}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Transactions Table */}
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                  <div className="p-4 border-b border-gray-200">
                    <h4 className="font-semibold text-gray-900">All Transactions ({projectReport.transactions.length})</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Transaction ID</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Customer</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Broker</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Unit</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Area (Marla)</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Total Value</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Received</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {projectReport.transactions.map((txn, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono text-xs">{txn.transaction_id}</td>
                            <td className="px-4 py-3">{txn.customer_name || '-'}</td>
                            <td className="px-4 py-3">{txn.broker_name || '-'}</td>
                            <td className="px-4 py-3">{txn.unit_number || '-'}</td>
                            <td className="px-4 py-3 text-right">{txn.area_marla.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right font-medium">{formatCurrency(txn.total_value)}</td>
                            <td className="px-4 py-3 text-right text-green-700">{formatCurrency(txn.received)}</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(txn.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="lg:col-span-3 bg-white rounded-lg border p-12 text-center text-gray-400">
                {loading ? 'Loading report...' : 'Select a project to view detailed report'}
              </div>
            )}
          </div>
        </div>
      )}

      {reportType === 'broker' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border p-4">
              <h3 className="text-sm font-medium text-gray-600 mb-2">Select Broker</h3>
              <input type="text" placeholder="Search name or ID..." value={brokerSearch} onChange={e => setBrokerSearch(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-xs mb-2 focus:outline-none focus:ring-1 focus:ring-gray-400" />
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {brokers.filter(b => {
                  if (!brokerSearch.trim()) return true;
                  const q = brokerSearch.toLowerCase();
                  return (b.name || '').toLowerCase().includes(q) || (b.broker_id || '').toLowerCase().includes(q) || (b.mobile || '').includes(q);
                }).map(b => (
                  <button key={b.id} onClick={() => loadBrokerReport(b.id)}
                    className={`w-full text-left p-2 rounded text-xs ${selectedBroker === b.id ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'}`}>
                    <div className="font-medium">{b.name}</div>
                    <div className="text-gray-500">{b.broker_id}</div>
                  </button>
                ))}
              </div>
              <button onClick={() => downloadExcel('broker')} className="mt-3 w-full px-3 py-2 bg-gray-800 text-white rounded text-xs font-medium hover:bg-gray-900">
                Export All (Excel)
              </button>
            </div>

            {brokerReport ? (
              <div className="lg:col-span-3 space-y-4">
                {/* Report Header */}
                <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-lg border border-gray-700 p-6 text-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-2xl font-bold mb-1">{brokerReport.report_header?.title || 'Broker Detailed Report'}</h2>
                      <div className="text-sm text-gray-300">
                        Generated via <span className="font-semibold text-white">ORBIT</span>
                        {brokerReport.report_header?.generated_at && (
                          <span className="ml-4">â€¢ {new Date(brokerReport.report_header.generated_at).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => downloadPDF('broker', brokerReport.broker.broker_id)} 
                      className="px-4 py-2 bg-white text-gray-900 rounded text-sm font-medium hover:bg-gray-100">
                      Export PDF
                    </button>
                  </div>
                </div>

                {/* Broker Info Header */}
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">{brokerReport.broker.name}</h3>
                      <div className="text-sm text-gray-600 mt-1">
                        {brokerReport.broker.broker_id} â€¢ {brokerReport.broker.mobile}
                        {brokerReport.broker.email && ` â€¢ ${brokerReport.broker.email}`}
                      </div>
                      {brokerReport.broker.company && (
                        <div className="text-sm text-gray-500 mt-1">Company: {brokerReport.broker.company}</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Commission Summary Cards */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Total Commission Earned</div>
                    <div className="text-2xl font-semibold text-gray-900">{formatCurrency(brokerReport.commission.total_earned)}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Total Commission Paid</div>
                    <div className="text-2xl font-semibold text-green-700">{formatCurrency(brokerReport.commission.total_paid)}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Pending Commission</div>
                    <div className="text-2xl font-semibold text-amber-600">{formatCurrency(brokerReport.commission.pending)}</div>
                  </div>
                </div>

                {/* Financial Summary Cards */}
                <div className="grid grid-cols-5 gap-4">
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Total Sale Value</div>
                    <div className="text-xl font-semibold text-gray-900">{formatCurrency(brokerReport.financials.total_sale_value)}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Total Received</div>
                    <div className="text-xl font-semibold text-green-700">{formatCurrency(brokerReport.financials.total_received)}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Due</div>
                    <div className="text-xl font-semibold text-red-600">{formatCurrency(brokerReport.financials.due)}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Future Receivable</div>
                    <div className="text-xl font-semibold text-blue-600">{formatCurrency(brokerReport.financials.future_receivable)}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4">
                    <div className="text-xs text-gray-600 mb-1">Transactions</div>
                    <div className="text-xl font-semibold text-gray-900">{brokerReport.financials.total_transactions}</div>
                  </div>
                </div>

                {/* Transactions Table */}
                <div className="bg-white rounded-lg border">
                  <div className="p-4 border-b">
                    <h4 className="font-semibold text-gray-900">Transactions ({brokerReport.transactions.length})</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Transaction ID</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Customer</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Project</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Unit</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Sale Value</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Commission Rate</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Commission Earned</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Commission Paid</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Commission Pending</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {brokerReport.transactions.map((txn, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono text-xs">{txn.transaction_id}</td>
                            <td className="px-4 py-3">{txn.customer_name || '-'}</td>
                            <td className="px-4 py-3">{txn.project_name || '-'}</td>
                            <td className="px-4 py-3">{txn.unit_number || '-'}</td>
                            <td className="px-4 py-3 text-right font-medium">{formatCurrency(txn.total_value)}</td>
                            <td className="px-4 py-3 text-right">{txn.commission_rate.toFixed(2)}%</td>
                            <td className="px-4 py-3 text-right font-medium">{formatCurrency(txn.commission_earned)}</td>
                            <td className="px-4 py-3 text-right text-green-700">{formatCurrency(txn.commission_paid)}</td>
                            <td className="px-4 py-3 text-right text-amber-600 font-medium">{formatCurrency(txn.commission_pending)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Payment History */}
                {brokerReport.payments && brokerReport.payments.length > 0 && (
                  <div className="bg-white rounded-lg border">
                    <div className="p-4 border-b">
                      <h4 className="font-semibold text-gray-900">Commission Payment History ({brokerReport.payments.length})</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Payment ID</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Date</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Transaction ID</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Amount</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Method</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Approved By</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Reference</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {brokerReport.payments.map((payment, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-mono text-xs">{payment.payment_id}</td>
                              <td className="px-4 py-3 text-xs">{payment.payment_date ? new Date(payment.payment_date).toLocaleDateString() : '-'}</td>
                              <td className="px-4 py-3 font-mono text-xs">{payment.transaction_id || '-'}</td>
                              <td className="px-4 py-3 text-right font-medium">{formatCurrency(payment.amount)}</td>
                              <td className="px-4 py-3">{payment.payment_method || '-'}</td>
                              <td className="px-4 py-3">{payment.approved_by || '-'}</td>
                              <td className="px-4 py-3 text-xs text-gray-600">{payment.reference_number || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Interactions History */}
                {brokerReport.interactions && brokerReport.interactions.history && brokerReport.interactions.history.length > 0 && (
                  <div className="bg-white rounded-lg border">
                    <div className="p-4 border-b">
                      <h4 className="font-semibold text-gray-900">Interactions History ({brokerReport.interactions.total_count})</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Date & Time</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Type</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Rep</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Notes</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Next Follow-up</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {brokerReport.interactions.history.map((interaction, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-xs">{new Date((interaction.date || interaction.created_at) + (String(interaction.date || interaction.created_at).endsWith('Z') ? '' : 'Z')).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td>
                              <td className="px-4 py-3">{interaction.type}</td>
                              <td className="px-4 py-3">{interaction.rep_name || '-'}</td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-0.5 rounded text-xs bg-gray-100">{interaction.status}</span>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-600">{interaction.notes || '-'}</td>
                              <td className="px-4 py-3 text-xs">{interaction.next_follow_up ? new Date(interaction.next_follow_up).toLocaleDateString() : '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="lg:col-span-3 bg-white rounded-lg border p-12 text-center text-gray-400">
                {loading ? 'Loading report...' : 'Select a broker to view detailed report'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// SETTINGS VIEW (Company Reps)
// ============================================
function SettingsView() {
  const [reps, setReps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', mobile: '', email: '', role: 'user', rep_type: '', title: '', reports_to: '', password: '' });
  const [settingsTab, setSettingsTab] = useState('reps');
  const [deletionRequests, setDeletionRequests] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [delReqFilter, setDelReqFilter] = useState('pending');
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const canReviewLeadSyncRequests =
    ['admin', 'cco', 'director', 'coo'].includes(currentUser.role) ||
    ['REP-0014', 'REP-0015', 'REP-0008'].includes(currentUser.rep_id);
  const canViewOrgNotifications =
    ['admin', 'cco', 'director', 'coo'].includes(currentUser.role) ||
    ['REP-0014', 'REP-0015', 'REP-0008'].includes(currentUser.rep_id);

  useEffect(() => { loadReps(); loadPendingCount(); }, []);
  useEffect(() => { if (settingsTab === 'deletion-requests') loadDeletionRequests(); }, [settingsTab, delReqFilter]);

  const loadReps = async () => {
    try { const res = await api.get('/company-reps'); setReps(res.data); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadDeletionRequests = async () => {
    try {
      const params = delReqFilter ? `?status=${delReqFilter}` : '';
      const res = await api.get(`/deletion-requests${params}`);
      setDeletionRequests(res.data);
    } catch (e) { console.error(e); }
  };

  const loadPendingCount = async () => {
    try {
      const res = await api.get('/deletion-requests/pending-count');
      setPendingCount(res.data.count);
    } catch (e) { console.error(e); }
  };

  const handleApproveDeletion = async (reqId) => {
    if (!confirm('Approve this deletion request? The record will be permanently deleted.')) return;
    try {
      await api.post(`/deletion-requests/${reqId}/approve`);
      loadDeletionRequests();
      loadPendingCount();
    } catch (e) { alert(e.response?.data?.detail || 'Error approving request'); }
  };

  const handleRejectDeletion = async (reqId) => {
    const reason = prompt('Reason for rejection:');
    if (reason === null) return;
    try {
      await api.post(`/deletion-requests/${reqId}/reject`, { reason });
      loadDeletionRequests();
      loadPendingCount();
    } catch (e) { alert(e.response?.data?.detail || 'Error rejecting request'); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) { await api.put(`/company-reps/${editing.id}`, form); }
      else { await api.post('/company-reps', form); }
      setShowModal(false); setEditing(null); setForm({ name: '', mobile: '', email: '', role: 'user', rep_type: '', title: '', reports_to: '', password: '' }); loadReps();
    } catch (e) { alert(e.response?.data?.detail || 'Error'); }
  };

  const handleDelete = async (r) => {
    const role = getUserRole();
    if (role === 'creator') { alert('Creator role cannot delete records.'); return; }
    if (role === 'admin') {
      if (!confirm(`Delete "${r.name}"?`)) return;
      try { await api.delete(`/company-reps/${r.id}`); loadReps(); }
      catch (e) { alert(e.response?.data?.detail || 'Error'); }
    } else {
      const reason = prompt(`Request deletion of "${r.name}"?\nProvide a reason:`);
      if (reason === null) return;
      try {
        const res = await api.delete(`/company-reps/${r.id}`, { data: { reason } });
        if (res.data.pending) {
          alert(`Deletion request submitted (${res.data.request_id}). An admin will review it.`);
        } else { loadReps(); }
      } catch (e) { alert(e.response?.data?.detail || 'Error'); }
    }
  };

  const openEdit = (r) => { setEditing(r); setForm({ name: r.name, mobile: r.mobile || '', email: r.email || '', role: r.role || 'user', rep_type: r.rep_type || '', title: r.title || '', reports_to: r.reports_to || '', password: '' }); setShowModal(true); };

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-semibold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-500 mt-1">Manage system configuration</p></div>

      {/* Settings Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setSettingsTab('reps')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            settingsTab === 'reps' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Company Reps
        </button>
        <button
          onClick={() => setSettingsTab('project-linking')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            settingsTab === 'project-linking' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Project Linking
        </button>
        {['admin', 'cco'].includes(getUserRole()) && (
          <>
            <button
              onClick={() => setSettingsTab('deletion-requests')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                settingsTab === 'deletion-requests' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Deletion Requests {pendingCount > 0 && <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">{pendingCount}</span>}
            </button>
            <button onClick={() => setSettingsTab('pipeline-stages')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${settingsTab === 'pipeline-stages' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              Lead Stages
            </button>
            <button onClick={() => setSettingsTab('lead-assignments')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${settingsTab === 'lead-assignments' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              Lead Assignments
            </button>
            <button onClick={() => setSettingsTab('search-audit')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${settingsTab === 'search-audit' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              Search Audit
            </button>
            <button onClick={() => setSettingsTab('lookup-values')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${settingsTab === 'lookup-values' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              Lookup Values
            </button>
          </>
        )}
        {canReviewLeadSyncRequests && (
          <button onClick={() => setSettingsTab('lead-sync-requests')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${settingsTab === 'lead-sync-requests' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            Lead Sync Requests
          </button>
        )}
        {canViewOrgNotifications && (
          <button onClick={() => setSettingsTab('notifications')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${settingsTab === 'notifications' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            Notifications
          </button>
        )}
      </div>

      {settingsTab === 'project-linking' && (
        <div className="bg-white rounded-2xl shadow-sm border">
          <OrphanTrackingPanel />
        </div>
      )}

      {settingsTab === 'deletion-requests' && (
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Deletion Requests</h3>
              <p className="text-sm text-gray-500">Review and approve or reject deletion requests from team members</p>
            </div>
            <div className="flex gap-2">
              {['pending', 'approved', 'rejected', ''].map(status => (
                <button
                  key={status || 'all'}
                  onClick={() => setDelReqFilter(status)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg ${
                    delReqFilter === status
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {status === '' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {deletionRequests.length === 0 ? (
            <div className="text-center py-8 text-gray-400">No {delReqFilter || ''} deletion requests</div>
          ) : (
            <div className="divide-y">
              {deletionRequests.map(req => (
                <div key={req.id} className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-gray-400">{req.request_id}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          req.status === 'pending' ? 'bg-yellow-50 text-yellow-700' :
                          req.status === 'approved' ? 'bg-green-50 text-green-700' :
                          'bg-red-50 text-red-700'
                        }`}>{req.status}</span>
                        <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">{req.entity_type}</span>
                      </div>
                      <div className="font-medium text-gray-900">{req.entity_name || `${req.entity_type} #${req.entity_id}`}</div>
                      <div className="text-sm text-gray-500 mt-1">
                        Requested by <span className="font-medium">{req.requested_by_name || req.requested_by}</span>
                        {req.requested_at && <span> on {new Date(req.requested_at).toLocaleDateString()}</span>}
                      </div>
                      {req.reason && <div className="text-sm text-gray-600 mt-1 bg-gray-50 p-2 rounded">Reason: {req.reason}</div>}
                      {req.status !== 'pending' && req.reviewed_by && (
                        <div className="text-xs text-gray-400 mt-2">
                          {req.status === 'approved' ? 'Approved' : 'Rejected'} by {req.reviewed_by}
                          {req.reviewed_at && <span> on {new Date(req.reviewed_at).toLocaleDateString()}</span>}
                          {req.rejection_reason && <span className="block text-gray-500 mt-1">Rejection reason: {req.rejection_reason}</span>}
                        </div>
                      )}
                    </div>
                    {req.status === 'pending' && (
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => handleApproveDeletion(req.id)}
                          className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleRejectDeletion(req.id)}
                          className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {settingsTab === 'pipeline-stages' && <PipelineStagesSettings />}
      {settingsTab === 'lead-assignments' && <LeadAssignmentsSettings />}
      {settingsTab === 'search-audit' && <SearchAuditSettings />}
      {settingsTab === 'lookup-values' && <LookupValuesSettings />}
      {settingsTab === 'lead-sync-requests' && canReviewLeadSyncRequests && <LeadSyncRequestsSettings />}
      {settingsTab === 'notifications' && canViewOrgNotifications && <OrgNotificationsSettings />}

      {settingsTab === 'reps' && (
      <div className="bg-white rounded-2xl shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Company Representatives</h3>
            <p className="text-sm text-gray-500">Sales reps that handle transactions</p>
          </div>
          <button onClick={() => { setEditing(null); setForm({ name: '', mobile: '', email: '', role: 'user', rep_type: '', title: '', reports_to: '', password: '' }); setShowModal(true); }}
            className="bg-gray-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-800">Add Rep</button>
        </div>

        {loading ? <Loader /> : reps.length === 0 ? (
          <div className="text-center py-8 text-gray-400">No company reps added yet</div>
        ) : (
          <div className="divide-y">
            {reps.map(r => (
              <div key={r.id} className="py-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-400">{r.rep_id}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${r.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">{r.role || 'user'}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${r.rep_type ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>{r.rep_type || 'non-sales'}</span>
                  </div>
                  <div className="font-medium text-gray-900">{r.name}</div>
                  <div className="text-sm text-gray-500">{r.mobile} {r.email && `â€¢ ${r.email}`} {r.title && `â€¢ ${r.title}`}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(r)} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">Edit</button>
                  {getUserRole() !== 'creator' && (
                    <button onClick={() => handleDelete(r)} className="px-3 py-1.5 text-sm text-red-500 border rounded-lg hover:bg-red-50">{getUserRole() === 'admin' ? 'Delete' : 'Request Delete'}</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {showModal && (
          <Modal title={editing ? 'Edit Company Rep' : 'Add Company Rep'} onClose={() => setShowModal(false)}>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input label="Name" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
              <Input label="Mobile" value={form.mobile} onChange={e => setForm({...form, mobile: e.target.value})} />
              <Input label="Email" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rep Type</label>
                  <select value={form.rep_type || ''} onChange={e => setForm({...form, rep_type: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-gray-900">
                    <option value="">None (Non-sales)</option>
                    <option value="direct_rep">Direct</option>
                    <option value="indirect_rep">Indirect</option>
                    <option value="both">Both</option>
                  </select>
                </div>
                <Input label="Title" value={form.title || ''} onChange={e => setForm({...form, title: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reports To</label>
                <select value={form.reports_to || ''} onChange={e => setForm({...form, reports_to: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-gray-900">
                  <option value="">None</option>
                  {reps.filter(r => !editing || r.id !== editing.id).map(r => <option key={r.id} value={r.rep_id || r.id}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select value={form.role || 'user'} onChange={e => setForm({...form, role: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-gray-900">
                  <option value="admin">Admin</option>
                  <option value="cco">CCO</option>
                  <option value="manager">Manager</option>
                  <option value="creator">Creator</option>
                  <option value="user">User</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <Input label="Password" type="password" value={form.password || ''} onChange={e => setForm({...form, password: e.target.value})} placeholder={editing ? 'Leave blank to keep current' : 'Set password'} />
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg">{editing ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </Modal>
        )}
      </div>
      )}
    </div>
  );
}

function LeadSyncRequestsSettings() {
  const [requests, setRequests] = useState([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState([]);
  const [bulkLeadIds, setBulkLeadIds] = useState('');
  const [bulkSyncing, setBulkSyncing] = useState(false);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const query = statusFilter ? `?status=${statusFilter}` : '';
      const res = await api.get(`/lead-sync-requests${query}`);
      setRequests(res.data || []);
      setSelected([]);
    } catch (e) {
      if (window.showToast) window.showToast('Error', e.response?.data?.detail || 'Failed to load sync requests', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRequests(); }, [statusFilter]);

  const handleReview = async (req, action) => {
    try {
      await api.post(`/lead-sync-requests/${req.id || req.request_id}/review`, { action });
      if (window.showToast) window.showToast('Success', `Request ${action}d`, 'success');
      loadRequests();
    } catch (e) {
      if (window.showToast) window.showToast('Error', e.response?.data?.detail || 'Action failed', 'error');
    }
  };

  const handleBulkReview = async (action) => {
    if (!selected.length) return;
    try {
      await api.post('/lead-sync-requests/bulk-review', { request_ids: selected, action });
      if (window.showToast) window.showToast('Success', `Bulk ${action} completed`, 'success');
      loadRequests();
    } catch (e) {
      if (window.showToast) window.showToast('Error', e.response?.data?.detail || 'Bulk review failed', 'error');
    }
  };

  const handleBulkDirectSync = async () => {
    const leadIds = (bulkLeadIds || '')
      .split(/[\n,\s]+/)
      .map(x => x.trim())
      .filter(Boolean);
    if (!leadIds.length) return;
    setBulkSyncing(true);
    try {
      const res = await api.post('/leads/bulk-sync-customers', { lead_ids: leadIds });
      if (window.showToast) {
        window.showToast(
          'Bulk Sync Complete',
          `${res.data.synced || 0} synced, ${res.data.linked_existing || 0} linked existing, ${res.data.failed || 0} failed`,
          'success'
        );
      }
      setBulkLeadIds('');
      loadRequests();
    } catch (e) {
      if (window.showToast) window.showToast('Error', e.response?.data?.detail || 'Bulk customer sync failed', 'error');
    } finally {
      setBulkSyncing(false);
    }
  };

  const toggleSelect = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const pendingRows = requests.filter(r => r.status === 'pending');

  return (
    <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Lead Sync Requests</h3>
          <p className="text-sm text-gray-500">Approve/reject rep requests and run direct bulk sync from leads to customers.</p>
        </div>
        <div className="flex gap-2">
          {['pending', 'approved', 'rejected', ''].map(status => (
            <button
              key={status || 'all'}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg ${
                statusFilter === status ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {status === '' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
        <div className="text-sm font-medium text-emerald-900 mb-2">Direct Bulk Sync (Admin/Approver Utility)</div>
        <p className="text-xs text-emerald-800 mb-3">Paste Lead IDs (example: LEAD-0001, LEAD-0002). This syncs immediately without waiting for requests.</p>
        <div className="flex gap-2">
          <textarea
            value={bulkLeadIds}
            onChange={e => setBulkLeadIds(e.target.value)}
            placeholder="LEAD-0001, LEAD-0002"
            rows={2}
            className="flex-1 px-3 py-2 text-sm border rounded-lg bg-white"
          />
          <button
            onClick={handleBulkDirectSync}
            disabled={bulkSyncing}
            className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            {bulkSyncing ? 'Syncing...' : 'Bulk Sync Leads'}
          </button>
        </div>
      </div>

      {statusFilter === 'pending' && pendingRows.length > 0 && (
        <div className="flex gap-2">
          <button onClick={() => setSelected(pendingRows.map(r => r.id || r.request_id))}
            className="px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-50">
            Select All Pending
          </button>
          <button onClick={() => handleBulkReview('approve')}
            disabled={!selected.length}
            className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
            Bulk Approve
          </button>
          <button onClick={() => handleBulkReview('reject')}
            disabled={!selected.length}
            className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
            Bulk Reject
          </button>
        </div>
      )}

      {loading ? (
        <Loader />
      ) : requests.length === 0 ? (
        <div className="text-center py-8 text-gray-400">No {statusFilter || ''} lead sync requests</div>
      ) : (
        <div className="divide-y">
          {requests.map(req => {
            const rowId = req.id || req.request_id;
            return (
              <div key={rowId} className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-gray-400">{req.request_id}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        req.status === 'pending' ? 'bg-yellow-50 text-yellow-700' :
                        req.status === 'approved' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                      }`}>{req.status}</span>
                    </div>
                    <div className="font-medium text-gray-900">{req.lead_code} - {req.lead_name}</div>
                    <div className="text-sm text-gray-500">
                      Requested by {req.requester_name || req.requester_rep_id} {req.created_at ? `on ${new Date(req.created_at).toLocaleString()}` : ''}
                    </div>
                    {req.reason && <div className="text-sm text-gray-600 mt-1 bg-gray-50 p-2 rounded">Reason: {req.reason}</div>}
                    {req.status !== 'pending' && (
                      <div className="text-xs text-gray-400 mt-2">
                        Reviewed by {req.reviewer_name || req.reviewer_rep_id || 'N/A'} {req.reviewed_at ? `on ${new Date(req.reviewed_at).toLocaleString()}` : ''}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {req.status === 'pending' && (
                      <input
                        type="checkbox"
                        checked={selected.includes(rowId)}
                        onChange={() => toggleSelect(rowId)}
                        className="h-4 w-4"
                      />
                    )}
                    {req.status === 'pending' && (
                      <>
                        <button onClick={() => handleReview(req, 'approve')}
                          className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
                          Approve
                        </button>
                        <button onClick={() => handleReview(req, 'reject')}
                          className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OrgNotificationsSettings() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [repFilter, setRepFilter] = useState('');
  const [reps, setReps] = useState([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');

  const loadReps = async () => {
    try {
      const res = await api.get('/company-reps');
      setReps(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadFeed = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '300');
      if (repFilter) params.set('rep_id', repFilter);
      if (unreadOnly) params.set('unread_only', 'true');
      if (categoryFilter) params.set('category', categoryFilter);
      const res = await api.get(`/notifications/org-feed?${params.toString()}`);
      setItems(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch (e) {
      if (window.showToast) window.showToast('Error', e.response?.data?.detail || 'Failed to load notifications', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadReps(); }, []);
  useEffect(() => { loadFeed(); }, [repFilter, unreadOnly, categoryFilter]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Organization Notifications</h3>
          <p className="text-sm text-gray-500">Complete notifications list across users for admin/director leadership review.</p>
        </div>
        <button onClick={loadFeed} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">Refresh</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <select value={repFilter} onChange={e => setRepFilter(e.target.value)} className="px-3 py-2 text-sm border rounded-lg bg-white">
          <option value="">All recipients</option>
          {reps.map(r => <option key={r.rep_id || r.id} value={r.rep_id}>{r.name} ({r.rep_id})</option>)}
        </select>
        <input value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          placeholder="Category filter (e.g. sync_request)"
          className="px-3 py-2 text-sm border rounded-lg" />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)} />
          Unread only
        </label>
        <div className="text-sm text-gray-500 flex items-center justify-end">Showing {items.length} of {total}</div>
      </div>

      {loading ? (
        <Loader />
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-gray-400">No notifications found for selected filters</div>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left">Time</th>
                <th className="px-3 py-2 text-left">Recipient</th>
                <th className="px-3 py-2 text-left">Title</th>
                <th className="px-3 py-2 text-left">Message</th>
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map(n => (
                <tr key={n.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-xs">{new Date(n.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2 text-xs">
                    <div className="font-medium">{n.recipient_name || '-'}</div>
                    <div className="text-gray-500">{n.recipient_rep_id}</div>
                  </td>
                  <td className="px-3 py-2">{n.title}</td>
                  <td className="px-3 py-2 text-gray-600 max-w-md">{n.message || '-'}</td>
                  <td className="px-3 py-2 text-xs">{n.category || '-'}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${n.is_read ? 'bg-gray-100 text-gray-600' : 'bg-blue-50 text-blue-700'}`}>
                      {n.is_read ? 'Read' : 'Unread'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================
// MEDIA LIBRARY VIEW
// ============================================
function MediaView() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [fileTypeFilter, setFileTypeFilter] = useState('');

  useEffect(() => {
    loadFiles();
  }, [search, entityTypeFilter, fileTypeFilter]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (entityTypeFilter) params.append('entity_type', entityTypeFilter);
      if (fileTypeFilter) params.append('file_type', fileTypeFilter);
      
      const res = await api.get(`/media/library?${params.toString()}`);
      setFiles(res.data.files || []);
    } catch (e) {
      console.error('Error loading media:', e);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (fileId) => {
    const role = getUserRole();
    if (role === 'creator') { alert('Creator role cannot delete records.'); return; }
    if (role === 'admin') {
      if (!confirm('Delete this file?')) return;
      try {
        await api.delete(`/media/${fileId}`);
        loadFiles();
      } catch (e) { alert(e.response?.data?.detail || 'Error deleting file'); }
    } else {
      const reason = prompt('Request deletion of this file?\nProvide a reason:');
      if (reason === null) return;
      try {
        const res = await api.delete(`/media/${fileId}`, { data: { reason } });
        if (res.data.pending) {
          alert(`Deletion request submitted (${res.data.request_id}). An admin will review it.`);
        } else { loadFiles(); }
      } catch (e) { alert(e.response?.data?.detail || 'Error deleting file'); }
    }
  };

  const handleDownload = (fileId, fileName) => {
    window.open(`/api/media/${fileId}/download`, '_blank');
  };

  const getFileIcon = (fileType) => {
    switch (fileType) {
      case 'pdf': return 'ðŸ“„';
      case 'image': return 'ðŸ–¼ï¸';
      case 'video': return 'ðŸŽ¥';
      case 'audio': return 'ðŸŽµ';
      default: return 'ðŸ“Ž';
    }
  };

  const getEntityTypeLabel = (type) => {
    const labels = {
      project: 'Project',
      customer: 'Customer',
      broker: 'Broker',
      interaction: 'Interaction',
      receipt: 'Receipt',
      payment: 'Payment'
    };
    return labels[type] || type;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Media Library</h2>
          <p className="text-sm text-gray-500 mt-1">Manage all uploaded files and attachments</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              placeholder="Search files..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Entity Type</label>
            <select
              value={entityTypeFilter}
              onChange={(e) => setEntityTypeFilter(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              <option value="">All Types</option>
              <option value="project">Project</option>
              <option value="customer">Customer</option>
              <option value="broker">Broker</option>
              <option value="interaction">Interaction</option>
              <option value="receipt">Receipt</option>
              <option value="payment">Payment</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">File Type</label>
            <select
              value={fileTypeFilter}
              onChange={(e) => setFileTypeFilter(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              <option value="">All Files</option>
              <option value="image">Images</option>
              <option value="pdf">PDFs</option>
              <option value="video">Videos</option>
              <option value="audio">Audio</option>
              <option value="document">Documents</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setSearch('');
                setEntityTypeFilter('');
                setFileTypeFilter('');
              }}
              className="w-full px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md border"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Files List */}
      {loading ? (
        <div className="bg-white rounded-xl border p-8 text-center">
          <div className="text-gray-400">Loading media files...</div>
        </div>
      ) : files.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center">
          <div className="text-gray-400">No media files found</div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">File</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uploaded</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {files.map((file) => (
                  <tr key={file.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getFileIcon(file.file_type)}</span>
                        <span className="text-sm text-gray-900">{file.file_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">
                        {getEntityTypeLabel(file.entity_type)} #{file.entity_id}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">{file.description || '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-500">
                        {file.created_at ? new Date(file.created_at).toLocaleDateString() : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleDownload(file.file_id, file.file_name)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          Download
                        </button>
                        {getUserRole() !== 'creator' && (
                          <button
                            onClick={() => handleDelete(file.file_id)}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                          >
                            {getUserRole() === 'admin' ? 'Delete' : 'Request Delete'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// MEDIA MANAGER COMPONENT
// ============================================
function MediaManager({ entityType, entityId, onUpload }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (entityId) loadFiles();
  }, [entityType, entityId]);

  const loadFiles = async () => {
    try {
      const res = await api.get(`/media/${entityType}/${entityId}`);
      setFiles(res.data || []);
    } catch (e) { console.error(e); }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('entity_type', entityType);
      formData.append('entity_id', entityId);
      if (description) formData.append('description', description);
      await api.post('/media/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setUploadFile(null);
      setDescription('');
      setShowUpload(false);
      loadFiles();
      if (onUpload) onUpload();
    } catch (e) { alert('Error uploading file'); }
    finally { setUploading(false); }
  };

  const handleDelete = async (fileId) => {
    const role = getUserRole();
    if (role === 'creator') { alert('Creator role cannot delete records.'); return; }
    if (role === 'admin') {
      if (!confirm('Delete this file?')) return;
      try {
        await api.delete(`/media/${fileId}`);
        loadFiles();
      } catch (e) { alert(e.response?.data?.detail || 'Error deleting file'); }
    } else {
      const reason = prompt('Request deletion of this file?\nProvide a reason:');
      if (reason === null) return;
      try {
        const res = await api.delete(`/media/${fileId}`, { data: { reason } });
        if (res.data.pending) {
          alert(`Deletion request submitted (${res.data.request_id}). An admin will review it.`);
        } else { loadFiles(); }
      } catch (e) { alert(e.response?.data?.detail || 'Error deleting file'); }
    }
  };

  const handleDownload = (fileId, fileName) => {
    window.open(`/api/media/${fileId}/download`, '_blank');
  };

  if (!entityId) return null;

  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold">Attachments</h4>
        <button onClick={() => setShowUpload(!showUpload)} className="text-xs text-blue-600 hover:text-blue-800">
          {showUpload ? 'Cancel' : '+ Upload'}
        </button>
      </div>

      {showUpload && (
        <form onSubmit={handleUpload} className="mb-4 p-3 bg-gray-50 rounded-lg">
          <input type="file" onChange={e => setUploadFile(e.target.files[0])} className="mb-2 text-sm" required />
          <input type="text" placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} className="w-full border rounded px-2 py-1 text-sm mb-2" />
          <button type="submit" disabled={uploading} className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50">
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </form>
      )}

      {files.length === 0 ? (
        <div className="text-xs text-gray-400 text-center py-4">No files attached</div>
      ) : (
        <div className="space-y-2">
          {files.map(f => (
            <div key={f.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-gray-500">
                  {f.file_type === 'pdf' ? 'ðŸ“„' : f.file_type === 'image' ? 'ðŸ–¼ï¸' : f.file_type === 'video' ? 'ðŸŽ¥' : f.file_type === 'audio' ? 'ðŸŽµ' : 'ðŸ“Ž'}
                </span>
                <span className="truncate">{f.file_name}</span>
                {f.description && <span className="text-xs text-gray-400">({f.description})</span>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleDownload(f.file_id, f.file_name)} className="text-blue-600 hover:text-blue-800 text-xs">
                  Download
                </button>
                {getUserRole() !== 'creator' && (
                  <button onClick={() => handleDelete(f.file_id)} className="text-red-600 hover:text-red-800 text-xs">
                    {getUserRole() === 'admin' ? 'Delete' : 'Request Delete'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// DETAIL MODALS
// ============================================
// ============================================
// SETTINGS: PIPELINE STAGES MANAGEMENT
// ============================================
function PipelineStagesSettings() {
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', display_order: 99, color: '#6B7280', is_terminal: false });

  useEffect(() => { loadStages(); }, []);
  const loadStages = async () => {
    try { const res = await api.get('/pipeline-stages'); setStages(res.data); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/pipeline-stages', form);
      setShowForm(false); setForm({ name: '', display_order: 99, color: '#6B7280', is_terminal: false }); loadStages();
    } catch (e) { if (window.showToast) window.showToast('Error', e.response?.data?.detail || 'Failed', 'error'); }
  };

  const handleDelete = async (s) => {
    if (!confirm(`Delete stage "${s.name}"?`)) return;
    try { await api.delete(`/pipeline-stages/${s.id}`); loadStages(); }
    catch (e) { if (window.showToast) window.showToast('Error', e.response?.data?.detail || 'Failed', 'error'); }
  };

  const handleReorder = async (s, direction) => {
    const idx = stages.findIndex(st => st.id === s.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= stages.length) return;
    try {
      await api.put(`/pipeline-stages/${s.id}`, { display_order: stages[swapIdx].display_order });
      await api.put(`/pipeline-stages/${stages[swapIdx].id}`, { display_order: s.display_order });
      loadStages();
    } catch (e) { console.error(e); }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Lead Stages</h3>
          <p className="text-sm text-gray-500">Configure lead pipeline stages</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="bg-gray-900 text-white px-4 py-2 text-sm rounded-lg hover:bg-gray-800">
          {showForm ? 'Cancel' : 'Add Stage'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-gray-50 p-4 rounded-lg mb-4 flex items-end gap-3 flex-wrap">
          <Input label="Name" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
          <Input label="Order" type="number" value={form.display_order} onChange={e => setForm({...form, display_order: parseInt(e.target.value)})} />
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Color</label>
            <input type="color" value={form.color} onChange={e => setForm({...form, color: e.target.value})} className="h-9 w-16 border rounded-lg cursor-pointer" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_terminal} onChange={e => setForm({...form, is_terminal: e.target.checked})} />
            Terminal
          </label>
          <button type="submit" className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg">Create</button>
        </form>
      )}

      {loading ? <Loader /> : (
        <div className="space-y-2">
          {stages.map((s, i) => (
            <div key={s.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <span className="w-4 h-4 rounded-full" style={{ backgroundColor: s.color }}></span>
                <span className="font-medium text-sm">{s.name}</span>
                <span className="text-xs text-gray-400">#{s.display_order}</span>
                {s.is_terminal && <span className="px-2 py-0.5 text-xs bg-gray-200 text-gray-600 rounded-full">Terminal</span>}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => handleReorder(s, 'up')} disabled={i === 0} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">^</button>
                <button onClick={() => handleReorder(s, 'down')} disabled={i === stages.length - 1} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">v</button>
                <button onClick={() => handleDelete(s)} className="p-1 text-red-400 hover:text-red-600 ml-2">Del</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// SETTINGS: LEAD ASSIGNMENT REQUESTS
// ============================================
function LeadAssignmentsSettings() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');

  useEffect(() => { loadRequests(); }, [filter]);
  const loadRequests = async () => {
    setLoading(true);
    try { const res = await api.get(`/lead-assignment-requests?status=${filter}`); setRequests(res.data); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleReview = async (reqId, action) => {
    try {
      await api.post(`/lead-assignment-requests/${reqId}/review`, { action });
      if (window.showToast) window.showToast('Done', `Request ${action}d`, 'success');
      loadRequests();
    } catch (e) { if (window.showToast) window.showToast('Error', e.response?.data?.detail || 'Failed', 'error'); }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Lead Assignment Requests</h3>
          <p className="text-sm text-gray-500">Review assignment requests from sales reps</p>
        </div>
        <div className="flex gap-1">
          {['pending', 'approved', 'rejected'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg ${filter === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? <Loader /> : requests.length === 0 ? (
        <div className="text-center py-8 text-gray-400">No {filter} requests</div>
      ) : (
        <div className="divide-y">
          {requests.map(r => (
            <div key={r.id} className="py-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-mono text-gray-400">{r.request_id}</span>
                  <span className="font-medium text-sm">{r.lead_name}</span>
                  <span className="text-xs text-gray-400">({r.lead_id})</span>
                </div>
                <div className="text-xs text-gray-500">
                  Requested by <span className="font-medium">{r.requested_by}</span>
                  {r.reason && <span> â€” {r.reason}</span>}
                  <span className="ml-2 text-gray-400">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              {r.status === 'pending' && (
                <div className="flex gap-2">
                  <button onClick={() => handleReview(r.id, 'approve')} className="px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">Approve</button>
                  <button onClick={() => handleReview(r.id, 'reject')} className="px-3 py-1 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">Reject</button>
                </div>
              )}
              {r.status !== 'pending' && (
                <span className={`px-2 py-1 text-xs rounded-full ${r.status === 'approved' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{r.status}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// SETTINGS: SEARCH AUDIT LOG
// ============================================
function SearchAuditSettings() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadLogs(); }, []);
  const loadLogs = async () => {
    try { const res = await api.get('/search-log?limit=100'); setLogs(res.data); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Search Audit Log</h3>
        <p className="text-sm text-gray-500">Cross-rep search activity â€” when a rep searches for another rep's customer/lead</p>
      </div>

      {loading ? <Loader /> : logs.length === 0 ? (
        <div className="text-center py-8 text-gray-400">No search activity recorded yet</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Searcher</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Query</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Matched</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Owner Rep</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {logs.map(l => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{l.searcher_rep_id}</td>
                  <td className="px-4 py-3">{l.search_query}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs bg-gray-100 rounded">{l.search_type}</span></td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${l.matched_entity_type === 'customer' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                      {l.matched_entity_type}
                    </span>
                    <span className="ml-1">{l.matched_entity_name}</span>
                    <span className="text-xs text-gray-400 ml-1">({l.matched_entity_id})</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{l.owner_rep_id}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{new Date(l.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================
// SETTINGS: LOOKUP VALUES
// ============================================
function LookupValuesSettings() {
  const [category, setCategory] = useState(LOOKUP_KEYS.CUSTOMER_SOURCE);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [value, setValue] = useState('');
  const [editingId, setEditingId] = useState(null);

  useEffect(() => { loadValues(); }, [category]);
  const loadValues = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/lookup-values?category=${encodeURIComponent(category)}`);
      const rows = Array.isArray(res.data) ? res.data : (res.data?.items || []);
      setItems(rows);
    } catch (e) {
      console.error(e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    try {
      if (editingId) {
        await api.put(`/lookup-values/${editingId}`, { label: value.trim() });
      } else {
        await api.post('/lookup-values', { category, label: value.trim() });
      }
      setValue('');
      setEditingId(null);
      loadValues();
    } catch (e2) {
      alert(e2.response?.data?.detail || 'Failed to save lookup value');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this lookup value?')) return;
    try {
      await api.delete(`/lookup-values/${id}`);
      loadValues();
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to delete lookup value');
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Lookup Values</h3>
        <p className="text-sm text-gray-500">Manage admin-controlled dropdown options for customer and lead forms.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
            <option value={LOOKUP_KEYS.CUSTOMER_SOURCE}>Customer Source</option>
            <option value={LOOKUP_KEYS.CUSTOMER_OCCUPATION}>Customer Occupation</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="Add new value"
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
            />
            <button type="submit" className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg">{editingId ? 'Update' : 'Add'}</button>
            {editingId && <button type="button" onClick={() => { setEditingId(null); setValue(''); }} className="px-4 py-2 text-sm border rounded-lg">Cancel</button>}
          </form>
        </div>
      </div>
      {loading ? <Loader /> : (
        <div className="divide-y rounded-lg border bg-white">
          {items.length === 0 ? (
            <div className="p-4 text-sm text-gray-400">No values configured.</div>
          ) : items.map((row) => (
            <div key={row.id || row.label} className="p-3 flex items-center justify-between">
              <span className="text-sm">{row.label}</span>
              <div className="flex gap-2">
                <button onClick={() => { setEditingId(row.id); setValue(row.label || ''); }} className="text-sm px-2 py-1 border rounded">Edit</button>
                <button onClick={() => handleDelete(row.id)} className="text-sm px-2 py-1 border rounded text-red-600">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomerDetailModal({ customer, onClose }) {
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const installments = customer.installments || { overdue: [], future: [], paid: [] };
  const receipts = Array.isArray(customer.receipts) ? customer.receipts : [];
  const interactions = Array.isArray(customer.interactions) ? customer.interactions : [];
  const transactionProgress = Array.isArray(customer.transaction_progress) ? customer.transaction_progress : [];
  const financials = {
    total_sale: customer.financials?.total_sale || 0,
    total_received: customer.financials?.total_received || 0,
    total_overdue: customer.financials?.total_overdue ?? customer.financials?.overdue ?? 0,
    future_receivable: customer.financials?.future_receivable || 0,
  };
  const getClassificationBadge = (cls) => {
    if (cls === 'TOKEN_MONEY') return 'bg-amber-100 text-amber-700';
    if (cls === 'PARTIAL_DOWN_PAYMENT') return 'bg-blue-100 text-blue-700';
    if (cls === 'DOWN_PAYMENT_COMPLETED') return 'bg-emerald-100 text-emerald-700';
    return 'bg-gray-100 text-gray-600';
  };

  return (
    <Modal title={`Customer Details: ${customer.customer?.name || 'Unknown'}`} onClose={onClose} wide>
      <div className="space-y-6 max-h-[80vh] overflow-y-auto">
        {/* Personal Details */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Personal Information</h3>
          <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
            <div>
              <div className="text-xs text-gray-500">Customer ID</div>
              <div className="font-medium">{customer.customer.customer_id}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Mobile</div>
              <div className="font-medium">{customer.customer.mobile}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Email</div>
              <div className="font-medium">{customer.customer.email || 'N/A'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">CNIC</div>
              <div className="font-medium">{customer.customer.cnic || 'N/A'}</div>
            </div>
            <div className="col-span-2">
              <div className="text-xs text-gray-500">Address</div>
              <div className="font-medium">{customer.customer.address || 'N/A'}</div>
            </div>
          </div>
        </div>

        {/* Financial Summary */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Financial Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-xs text-blue-600 mb-1">Total Sale</div>
              <div className="text-lg font-semibold text-blue-900">{formatCurrency(financials.total_sale)}</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-xs text-green-600 mb-1">Total Received</div>
              <div className="text-lg font-semibold text-green-900">{formatCurrency(financials.total_received)}</div>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <div className="text-xs text-red-600 mb-1">Total Overdue</div>
              <div className="text-lg font-semibold text-red-900">{formatCurrency(financials.total_overdue)}</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="text-xs text-purple-600 mb-1">Future Receivable</div>
              <div className="text-lg font-semibold text-purple-900">{formatCurrency(financials.future_receivable)}</div>
            </div>
          </div>
        </div>

        {/* Compact Unit Progress (additive block; keeps existing modal sections) */}
        {transactionProgress.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Unit Progress Snapshot</h3>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-2 font-semibold">Unit</th>
                    <th className="text-left p-2 font-semibold">Project</th>
                    <th className="text-left p-2 font-semibold">Down Payment Stage</th>
                    <th className="text-right p-2 font-semibold">Installments</th>
                    <th className="text-right p-2 font-semibold">Paid %</th>
                    <th className="text-right p-2 font-semibold">Paid / Total</th>
                  </tr>
                </thead>
                <tbody>
                  {transactionProgress.map((tp, idx) => (
                    <tr key={tp.transaction_uuid || idx} className="border-t hover:bg-gray-50">
                      <td className="p-2">
                        <div className="font-medium">{tp.unit_number || 'N/A'}</div>
                        <div className="text-xs text-gray-500">{tp.transaction_id || '-'}</div>
                      </td>
                      <td className="p-2">{tp.project_name || 'N/A'}</td>
                      <td className="p-2">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getClassificationBadge(tp.classification)}`}>
                          {tp.classification === 'TOKEN_MONEY' ? 'Token Money'
                            : tp.classification === 'PARTIAL_DOWN_PAYMENT' ? 'Partial Down Payment'
                            : tp.classification === 'DOWN_PAYMENT_COMPLETED' ? 'Down Payment Completed'
                            : 'Unknown'}
                        </span>
                        {tp.classification_error && (
                          <div className="text-xs text-red-600 mt-1">Classification unavailable</div>
                        )}
                      </td>
                      <td className="text-right p-2">
                        <div className="font-medium">
                          {tp.installments_paid || 0} Paid / {tp.installments_overdue || 0} Overdue / {tp.installments_pending || 0} Pending
                        </div>
                        <div className="text-xs text-gray-500">Total: {tp.installments_total || 0}</div>
                      </td>
                      <td className="text-right p-2">
                        <div className="font-medium">{Number(tp.paid_percent || 0).toFixed(2)}%</div>
                        {tp.threshold_percent !== null && tp.threshold_percent !== undefined && (
                          <div className="text-xs text-gray-500">x: {Number(tp.threshold_percent).toFixed(2)}%</div>
                        )}
                      </td>
                      <td className="text-right p-2 font-medium">
                        {formatCurrency(tp.cumulative_paid || 0)} / {formatCurrency(tp.total_value || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Overdue Installments */}
        {installments.overdue.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-red-700 uppercase mb-3">Overdue Installments ({installments.overdue.length})</h3>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-red-50">
                  <tr>
                    <th className="text-left p-2 font-semibold text-red-700">Project</th>
                    <th className="text-left p-2 font-semibold text-red-700">Unit</th>
                    <th className="text-right p-2 font-semibold text-red-700">Due Date</th>
                    <th className="text-right p-2 font-semibold text-red-700">Amount</th>
                    <th className="text-right p-2 font-semibold text-red-700">Paid</th>
                    <th className="text-right p-2 font-semibold text-red-700">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {installments.overdue.map((inst, idx) => (
                    <tr key={idx} className="border-t hover:bg-red-50">
                      <td className="p-2">{inst.project_name || 'N/A'}</td>
                      <td className="p-2">{inst.unit_number || 'N/A'}</td>
                      <td className="text-right p-2">{formatDate(inst.due_date)}</td>
                      <td className="text-right p-2">{formatCurrency(inst.amount)}</td>
                      <td className="text-right p-2">{formatCurrency(inst.amount_paid)}</td>
                      <td className="text-right p-2 font-semibold text-red-700">{formatCurrency(inst.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Future Installments */}
        {installments.future.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-blue-700 uppercase mb-3">Future Installments ({installments.future.length})</h3>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-blue-50">
                  <tr>
                    <th className="text-left p-2 font-semibold text-blue-700">Project</th>
                    <th className="text-left p-2 font-semibold text-blue-700">Unit</th>
                    <th className="text-right p-2 font-semibold text-blue-700">Due Date</th>
                    <th className="text-right p-2 font-semibold text-blue-700">Amount</th>
                    <th className="text-right p-2 font-semibold text-blue-700">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {installments.future.map((inst, idx) => (
                    <tr key={idx} className="border-t hover:bg-blue-50">
                      <td className="p-2">{inst.project_name || 'N/A'}</td>
                      <td className="p-2">{inst.unit_number || 'N/A'}</td>
                      <td className="text-right p-2">{formatDate(inst.due_date)}</td>
                      <td className="text-right p-2">{formatCurrency(inst.amount)}</td>
                      <td className="text-right p-2 font-semibold text-blue-700">{formatCurrency(inst.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Receipts */}
        {receipts.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Receipts ({receipts.length})</h3>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-2 font-semibold">Receipt ID</th>
                    <th className="text-right p-2 font-semibold">Date</th>
                    <th className="text-right p-2 font-semibold">Amount</th>
                    <th className="text-left p-2 font-semibold">Method</th>
                    <th className="text-left p-2 font-semibold">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r, idx) => (
                    <tr key={idx} className="border-t hover:bg-gray-50">
                      <td className="p-2">{r.receipt_id}</td>
                      <td className="text-right p-2">{formatDate(r.payment_date)}</td>
                      <td className="text-right p-2 font-medium">{formatCurrency(r.amount)}</td>
                      <td className="p-2">{r.payment_method || 'N/A'}</td>
                      <td className="p-2">{r.reference_number || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Interactions */}
        {interactions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Recent Interactions ({interactions.length})</h3>
            <div className="space-y-2">
              {interactions.map((i, idx) => (
                <div key={idx} className="border rounded-lg p-3 bg-gray-50">
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-medium">{i.interaction_type}</div>
                    <div className="text-xs text-gray-500">{formatDate(i.created_at)}</div>
                  </div>
                  <div className="text-sm text-gray-600">{i.notes || 'No notes'}</div>
                  {i.rep_name && <div className="text-xs text-gray-500 mt-1">By: {i.rep_name}</div>}
                  {i.next_follow_up && <div className="text-xs text-blue-600 mt-1">Next follow-up: {formatDate(i.next_follow_up)}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Linked Tasks</h3>
          <EntityTaskWidget
            api={api}
            entityType="customer"
            entityId={customer.customer.id}
            compact
          />
        </div>

        {/* Customer Documents */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Documents</h3>
          <MediaManager entityType="customer" entityId={customer.customer.id} />
        </div>
      </div>
    </Modal>
  );
}

function BrokerDetailModal({ broker, onClose }) {
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <Modal title={`Broker Details: ${broker.broker.name}`} onClose={onClose} wide>
      <div className="space-y-6 max-h-[80vh] overflow-y-auto">
        {/* Personal Details */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Personal Information</h3>
          <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
            <div>
              <div className="text-xs text-gray-500">Broker ID</div>
              <div className="font-medium">{broker.broker.broker_id}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Mobile</div>
              <div className="font-medium">{broker.broker.mobile}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Email</div>
              <div className="font-medium">{broker.broker.email || 'N/A'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Company</div>
              <div className="font-medium">{broker.broker.company || 'N/A'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Commission Rate</div>
              <div className="font-medium">{broker.broker.commission_rate}%</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Status</div>
              <div className="font-medium">{broker.broker.status}</div>
            </div>
          </div>
        </div>

        {/* Performance Summary */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Performance Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-xs text-blue-600 mb-1">Total Sales</div>
              <div className="text-lg font-semibold text-blue-900">{formatCurrency(broker.performance.total_sale_value)}</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-xs text-green-600 mb-1">Commission Earned</div>
              <div className="text-lg font-semibold text-green-900">{formatCurrency(broker.performance.commission.total_earned)}</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="text-xs text-purple-600 mb-1">Commission Paid</div>
              <div className="text-lg font-semibold text-purple-900">{formatCurrency(broker.performance.commission.total_paid)}</div>
            </div>
            <div className="bg-orange-50 p-4 rounded-lg">
              <div className="text-xs text-orange-600 mb-1">Pending</div>
              <div className="text-lg font-semibold text-orange-900">{formatCurrency(broker.performance.commission.pending)}</div>
            </div>
          </div>
        </div>

        {/* Brokered Transactions */}
        {broker.brokered_transactions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Brokered Transactions ({broker.brokered_transactions.length})</h3>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-2 font-semibold">Transaction ID</th>
                    <th className="text-left p-2 font-semibold">Project</th>
                    <th className="text-left p-2 font-semibold">Customer</th>
                    <th className="text-right p-2 font-semibold">Sale Value</th>
                    <th className="text-right p-2 font-semibold">Commission</th>
                    <th className="text-right p-2 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {broker.brokered_transactions.map((t, idx) => (
                    <tr key={idx} className="border-t hover:bg-gray-50">
                      <td className="p-2">{t.transaction_id}</td>
                      <td className="p-2">{t.project_name || 'N/A'}</td>
                      <td className="p-2">{t.customer_name || 'N/A'}</td>
                      <td className="text-right p-2">{formatCurrency(t.total_value)}</td>
                      <td className="text-right p-2 font-medium text-green-600">{formatCurrency(t.commission_amount)} ({t.commission_rate}%)</td>
                      <td className="text-right p-2">{formatDate(t.booking_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Commission Payments */}
        {broker.payments.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Commission Payments ({broker.payments.length})</h3>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-2 font-semibold">Payment ID</th>
                    <th className="text-right p-2 font-semibold">Date</th>
                    <th className="text-right p-2 font-semibold">Amount</th>
                    <th className="text-left p-2 font-semibold">Method</th>
                    <th className="text-left p-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {broker.payments.map((p, idx) => (
                    <tr key={idx} className="border-t hover:bg-gray-50">
                      <td className="p-2">{p.payment_id}</td>
                      <td className="text-right p-2">{formatDate(p.payment_date)}</td>
                      <td className="text-right p-2 font-medium">{formatCurrency(p.amount)}</td>
                      <td className="p-2">{p.payment_method || 'N/A'}</td>
                      <td className="p-2">
                        <span className={`px-2 py-1 rounded text-xs ${
                          p.status === 'completed' ? 'bg-green-100 text-green-800' :
                          p.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Interactions */}
        {broker.interactions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Recent Interactions ({broker.interactions.length})</h3>
            <div className="space-y-2">
              {broker.interactions.map((i, idx) => (
                <div key={idx} className="border rounded-lg p-3 bg-gray-50">
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-medium">{i.interaction_type}</div>
                    <div className="text-xs text-gray-500">{formatDate(i.created_at)}</div>
                  </div>
                  <div className="text-sm text-gray-600">{i.notes || 'No notes'}</div>
                  {i.rep_name && <div className="text-xs text-gray-500 mt-1">By: {i.rep_name}</div>}
                  {i.next_follow_up && <div className="text-xs text-blue-600 mt-1">Next follow-up: {formatDate(i.next_follow_up)}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ============================================
// ANALYTICS LEAD DRILLDOWN MODAL
// ============================================
function AnalyticsLeadDrilldown({ filters, onClose }) {
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortCol, setSortCol] = useState('lead_id');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    if (filters) loadDrilldown();
  }, [filters]);

  const loadDrilldown = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.stage) params.set('stage', filters.stage);
      if (filters.aging_bucket) params.set('aging_bucket', filters.aging_bucket);
      if (filters.rep_id) params.set('rep_id', filters.rep_id);
      if (filters.campaign_id) params.set('campaign_id', filters.campaign_id);
      if (filters.source) params.set('source', filters.source);
      const res = await api.get(`/analytics/leads/drilldown?${params}`);
      setLeads(res.data.leads || []);
      setTotal(res.data.total || 0);
    } catch (e) {
      console.error('Drilldown error:', e);
      setError('Unable to load lead details. The analytics drilldown service may be temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format) => {
    try {
      const params = new URLSearchParams();
      if (filters.stage) params.set('stage', filters.stage);
      if (filters.aging_bucket) params.set('aging_bucket', filters.aging_bucket);
      if (filters.rep_id) params.set('rep_id', filters.rep_id);
      if (filters.campaign_id) params.set('campaign_id', filters.campaign_id);
      if (filters.source) params.set('source', filters.source);
      params.set('export_format', format);
      const res = await api.get(`/analytics/leads/drilldown?${params}`, { responseType: 'blob' });
      const ext = format === 'csv' ? 'csv' : 'xlsx';
      const blob = new Blob([res.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads_drilldown.${ext}`;
      a.click();
      window.URL.revokeObjectURL(url);
      window.showToast?.('Export', `Downloaded ${format.toUpperCase()} successfully`, 'success');
    } catch (e) {
      console.error('Export error:', e);
      window.showToast?.('Export Error', 'Failed to export data', 'error');
    }
  };

  const sorted = [...leads].sort((a, b) => {
    const av = a[sortCol] ?? '', bv = b[sortCol] ?? '';
    if (typeof av === 'number') return sortDir === 'asc' ? av - bv : bv - av;
    return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const filterLabel = [
    filters.stage && `Stage: ${filters.stage}`,
    filters.aging_bucket && `Aging: ${filters.aging_bucket.replace(/_/g, ' ').replace('d plus', 'd+')}`,
    filters.rep_id && `Rep: ${filters.rep_id}`,
    filters.campaign_id && `Campaign: ${filters.campaign_id}`,
    filters.source && `Source: ${filters.source}`,
  ].filter(Boolean).join(' | ') || 'All Leads';

  const tempColors = { hot: 'bg-red-100 text-red-700', mild: 'bg-yellow-100 text-yellow-700', cold: 'bg-blue-100 text-blue-700' };
  const SortIcon = ({ col }) => sortCol === col ? (sortDir === 'asc' ? ' \u2191' : ' \u2193') : '';

  return (
    <Modal title="Lead Drilldown" onClose={onClose} wide>
      <div className="space-y-4">
        {/* Filter pills + Export */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-500">Filters:</span>
            <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium">{filterLabel}</span>
            <span className="text-sm text-gray-400">({total} leads)</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => handleExport('csv')}
              className="px-3 py-1.5 text-xs font-medium border rounded-lg hover:bg-gray-50 transition-colors">
              Export CSV
            </button>
            <button onClick={() => handleExport('excel')}
              className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
              Export Excel
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? <Loader /> : error ? (
          <div className="text-center py-8">
            <div className="text-gray-400 text-sm mb-2">{error}</div>
            <button onClick={loadDrilldown} className="text-xs text-blue-600 hover:underline">Retry</button>
          </div>
        ) : leads.length === 0 ? (
          <Empty message="No leads match the selected filters" />
        ) : (
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b">
                  {[
                    { key: 'lead_id', label: 'Lead ID' },
                    { key: 'name', label: 'Name' },
                    { key: 'mobile', label: 'Mobile' },
                    { key: 'pipeline_stage', label: 'Stage' },
                    { key: 'status', label: 'Status' },
                    { key: 'source', label: 'Source' },
                    { key: 'assigned_rep', label: 'Rep' },
                    { key: 'temperature', label: 'Temp' },
                    { key: 'days_since_creation', label: 'Age (days)' },
                    { key: 'campaign', label: 'Campaign' },
                  ].map(c => (
                    <th key={c.key} onClick={() => toggleSort(c.key)}
                      className="text-left p-2 font-semibold text-gray-700 cursor-pointer hover:text-gray-900 select-none whitespace-nowrap">
                      {c.label}<SortIcon col={c.key} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(l => (
                  <tr key={l.lead_id} className="border-b hover:bg-gray-50">
                    <td className="p-2 font-mono text-xs">{l.lead_id}</td>
                    <td className="p-2 font-medium">{l.name}</td>
                    <td className="p-2 text-gray-600">{l.mobile}</td>
                    <td className="p-2"><span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100">{l.pipeline_stage}</span></td>
                    <td className="p-2 capitalize">{l.status}</td>
                    <td className="p-2 capitalize text-gray-600">{l.source}</td>
                    <td className="p-2">{l.assigned_rep}</td>
                    <td className="p-2">{l.temperature && <span className={`px-2 py-0.5 rounded text-xs font-medium ${tempColors[l.temperature] || 'bg-gray-100'}`}>{l.temperature}</span>}</td>
                    <td className="p-2 text-right">{l.days_since_creation ?? '-'}</td>
                    <td className="p-2 text-gray-600 text-xs">{l.campaign}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ============================================
// SHARED COMPONENTS
// ============================================

// EntitySearchSelect â€” type-first async search for customers/brokers/leads
// Used by InteractionsView, InteractionLogModal, and per-row quick log actions
function EntitySearchSelect({ value, onChange, entityType, onEntityTypeChange, disabled, showTypeSelector = true }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const PAGE_SIZE = 15;

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Reset when entity type changes
  useEffect(() => {
    setQuery(''); setResults([]); setOffset(0); setOpen(false);
    if (value) onChange(null);
  }, [entityType]);

  const searchTargets = async (q, newOffset = 0, append = false) => {
    if (!q || q.length < 2 || !entityType) return;
    setLoading(true);
    try {
      const res = await api.get('/interactions/targets/search', {
        params: { entity_type: entityType, q, limit: PAGE_SIZE, offset: newOffset }
      });
      const data = res.data || [];
      if (append) setResults(prev => [...prev, ...data]);
      else setResults(data);
      setHasMore(data.length === PAGE_SIZE);
      setOffset(newOffset);
      if (!append) setHighlightIdx(0);
    } catch (e) { console.error('Search failed:', e); }
    finally { setLoading(false); }
  };

  const handleInputChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    if (value) onChange(null); // clear selection when typing
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length >= 2) {
      setOpen(true);
      debounceRef.current = setTimeout(() => searchTargets(q), 300);
    } else {
      setResults([]); setOpen(false);
    }
  };

  const handleSelect = (item) => {
    onChange(item);
    setQuery(item.name);
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[highlightIdx]) {
      e.preventDefault();
      handleSelect(results[highlightIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const loadMore = () => {
    if (!loading && hasMore) searchTargets(query, offset + PAGE_SIZE, true);
  };

  const typeLabels = { customer: 'Customer', broker: 'Broker', lead: 'Lead' };
  const typeColors = {
    customer: 'bg-blue-100 text-blue-700',
    broker: 'bg-amber-100 text-amber-700',
    lead: 'bg-purple-100 text-purple-700'
  };

  return (
    <div className="space-y-2">
      {showTypeSelector && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Contact Type *</label>
          <div className="flex gap-2">
            {['customer', 'broker', 'lead'].map(t => (
              <button key={t} type="button" disabled={disabled}
                onClick={() => onEntityTypeChange && onEntityTypeChange(t)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${
                  entityType === t
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                {typeLabels[t]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div ref={wrapperRef} className="relative">
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Search {typeLabels[entityType] || 'Contact'} *
        </label>
        <div className="relative">
          <input ref={inputRef} type="text" value={query} onChange={handleInputChange}
            onFocus={() => { if (results.length > 0 && !value) setOpen(true); }}
            onKeyDown={handleKeyDown} disabled={disabled || !entityType}
            placeholder={entityType ? `Search by name, mobile, or ID...` : 'Select type first'}
            className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 pr-8 ${
              value ? 'border-green-300 bg-green-50' : ''
            } ${(!entityType || disabled) ? 'bg-gray-50 cursor-not-allowed' : ''}`} />
          {loading && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
            </div>
          )}
          {value && !loading && (
            <button type="button" onClick={() => { onChange(null); setQuery(''); setResults([]); inputRef.current?.focus(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">&times;</button>
          )}
        </div>

        {/* Selected value chip */}
        {value && (
          <div className="mt-1 flex items-center gap-2 px-2 py-1 bg-gray-50 rounded-lg border text-sm">
            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${typeColors[entityType] || 'bg-gray-100'}`}>
              {typeLabels[entityType]}
            </span>
            <span className="font-medium">{value.name}</span>
            {value.mobile && <span className="text-gray-400">| {value.mobile}</span>}
            {value.city && <span className="text-gray-400">| {value.city}</span>}
            {value.source && <span className="text-gray-400">| {value.source}</span>}
            {value.company && <span className="text-gray-400">| {value.company}</span>}
          </div>
        )}

        {/* Dropdown results */}
        {open && !value && (
          <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {results.length === 0 && !loading && query.length >= 2 && (
              <div className="p-3 text-sm text-gray-400 text-center">No results found</div>
            )}
            {results.map((item, idx) => (
              <button key={item.id} type="button"
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setHighlightIdx(idx)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                  idx === highlightIdx ? 'bg-gray-100' : 'hover:bg-gray-50'
                }`}>
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${typeColors[entityType] || 'bg-gray-100'}`}>
                  {typeLabels[entityType]}
                </span>
                <span className="font-medium truncate">{item.name}</span>
                <span className="text-gray-400 shrink-0">
                  {item.city || item.source || item.company || ''}
                </span>
                {item.mobile && <span className="text-gray-400 ml-auto shrink-0 font-mono text-xs">{item.mobile}</span>}
              </button>
            ))}
            {hasMore && (
              <button type="button" onClick={loadMore} disabled={loading}
                className="w-full py-2 text-xs text-gray-500 hover:text-gray-700 border-t text-center">
                {loading ? 'Loading...' : 'Load more results'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// QuickLogModal â€” lightweight interaction log from per-row actions (Customers, Brokers, Pipeline)
// entity: { id, entity_type, name, mobile?, additional_mobiles? }
function QuickLogModal({ entity, defaultRepId = '', onClose, onSuccess }) {
  const [reps, setReps] = useState([]);
  const [form, setForm] = useState({
    company_rep_id: '', interaction_type: 'call', status: getDefaultInteractionStatus('call'), notes: '', next_follow_up: '', contact_number: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const contactOptions = [entity.mobile, ...(entity.additional_mobiles || [])].filter(Boolean);

  useEffect(() => {
    const repId = defaultRepId || currentUser.id || '';
    setForm(f => ({ ...f, company_rep_id: repId }));
    api.get('/company-reps').then(r => setReps(r.data)).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        company_rep_id: form.company_rep_id,
        interaction_type: form.interaction_type,
        status: form.status || null,
        notes: form.notes || null,
        contact_number: form.contact_number || null,
        next_follow_up: form.next_follow_up || null
      };
      if (entity.entity_type === 'customer') payload.customer_id = entity.id;
      else if (entity.entity_type === 'broker') payload.broker_id = entity.id;
      else if (entity.entity_type === 'lead') payload.lead_id = entity.id;

      await api.post('/interactions', payload);
      if (window.showToast) window.showToast('Interaction Logged', `${form.interaction_type} with ${entity.name} recorded`, 'success');
      if (onSuccess) onSuccess();
    } catch (e) {
      alert(e.response?.data?.detail || 'Error logging interaction');
    }
    finally { setSubmitting(false); }
  };

  const role = getUserRole();
  const canChangeRep = ['admin', 'cco', 'manager'].includes(role);

  return (
    <Modal title={`Log Interaction â€” ${entity.name}`} onClose={onClose}>
      <div className="mb-3 flex items-center gap-2">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          entity.entity_type === 'customer' ? 'bg-blue-100 text-blue-700' :
          entity.entity_type === 'broker' ? 'bg-amber-100 text-amber-700' :
          'bg-purple-100 text-purple-700'
        }`}>{entity.entity_type}</span>
        <span className="text-sm font-medium">{entity.name}</span>
        {contactOptions.length > 0 && <span className="text-sm text-gray-400">| {contactOptions.join(' | ')}</span>}
        {entity.temperature && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getTemperatureBadgeClass(entity.temperature)}`}>{entity.temperature}</span>}
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        {canChangeRep ? (
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Rep</label>
            <select value={form.company_rep_id} onChange={e => setForm({...form, company_rep_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Select Rep</option>
              {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        ) : (
          <div className="text-xs text-gray-500">Rep: <span className="font-medium">{currentUser.name || 'You'}</span></div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Type *</label>
            <select required value={form.interaction_type} onChange={e => setForm({...form, interaction_type: e.target.value, status: getDefaultInteractionStatus(e.target.value)})} className="w-full border rounded-lg px-3 py-2 text-sm">
              {INTERACTION_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
              {getInteractionStatusOptions(form.interaction_type).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>
        {contactOptions.length > 1 && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Spoke On Number (Optional)</label>
            <select value={form.contact_number} onChange={e => setForm({...form, contact_number: e.target.value})}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">Select number</option>
              {contactOptions.map(num => <option key={num} value={num}>{num}</option>)}
            </select>
          </div>
        )}
        <div><label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
          <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
            rows={2} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            placeholder="Call notes..." />
        </div>
        <Input label="Next Follow-up" type="date" value={form.next_follow_up} onChange={e => setForm({...form, next_follow_up: e.target.value})} />
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
          <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg disabled:opacity-50">
            {submitting ? 'Logging...' : 'Log'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SummaryCard({ label, value, sub }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border p-5">
      <div className="text-xs font-medium text-gray-400 uppercase">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
      {sub && <div className="text-sm text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className={`bg-white rounded-2xl shadow-xl mx-4 max-h-[90vh] overflow-y-auto ${wide ? 'w-full max-w-2xl' : 'w-full max-w-lg'}`}>
        <div className="p-5 border-b flex justify-between items-center sticky top-0 bg-white rounded-t-2xl">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Input({ label, required, ...props }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label} {required && <span className="text-red-400">*</span>}</label>
      <input {...props} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
    </div>
  );
}

function Loader() { return <div className="p-12 text-center text-gray-400">Loading...</div>; }
function Empty({ msg }) { return <div className="bg-white rounded-2xl shadow-sm border p-12 text-center text-gray-400">{msg}</div>; }

function BulkImport({ entity, onImport, importFile, setImportFile, importResult }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border p-6">
      <h3 className="text-sm font-semibold mb-4">Bulk Import</h3>
      <div className="flex items-center gap-4">
        <button onClick={async () => {
          const res = await api.get(`/${entity}/template/download`, { responseType: 'blob' });
          const url = window.URL.createObjectURL(new Blob([res.data]));
          const a = document.createElement('a'); a.href = url; a.download = `${entity}_template.csv`; a.click();
        }} className="text-sm text-gray-600 hover:text-gray-900 underline">Download Template</button>
        <input type="file" accept=".csv" onChange={e => setImportFile(e.target.files[0])} className="text-sm" />
        {importFile && <button onClick={onImport} className="bg-gray-900 text-white px-3 py-1.5 text-sm rounded-lg">Import</button>}
      </div>
      {importResult && (
        <div className={`mt-4 p-3 rounded-lg text-sm ${importResult.success > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {importResult.success > 0 ? `âœ“ Imported ${importResult.success}` : 'Import failed'}
          {importResult.errors?.length > 0 && <div className="mt-1 text-xs">{importResult.errors.slice(0, 3).join(', ')}</div>}
        </div>
      )}
    </div>
  );
}

// ============================================
// VECTOR VIEW
// ============================================
function VectorView() {
  // Use the new VectorMap component for full Vector functionality
  return <VectorMap />;
}

// ============================================
// VECTOR MAP EDITOR COMPONENT - FULL FEATURED
// ============================================
function VectorMapEditor({ project, onClose, onUpdate }) {
  const [projectData, setProjectData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [annotations, setAnnotations] = useState([]);
  const [labels, setLabels] = useState([]);
  const [shapes, setShapes] = useState([]);
  const [plots, setPlots] = useState([]);
  const [pdfPages, setPdfPages] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [scale, setScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState('select'); // select, pan, addPlot, brush, rectangle, circle, text
  const [selectedItem, setSelectedItem] = useState(null);
  const [showAnnotationModal, setShowAnnotationModal] = useState(false);
  const [editingAnnotation, setEditingAnnotation] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [drawingStart, setDrawingStart] = useState(null);
  const [tempShape, setTempShape] = useState(null);

  useEffect(() => {
    loadProjectData();
  }, [project.id]);

  useEffect(() => {
    if (projectData?.map_pdf_base64) {
      loadPDF();
    }
  }, [projectData]);

  useEffect(() => {
    if (canvasRef.current && pdfPages.length > 0) {
      drawCanvas();
    }
  }, [pdfPages, currentPage, scale, panOffset, annotations, labels, shapes, plots, tool, selectedItem, tempShape]);

  const loadProjectData = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/vector/projects/${project.id}`);
      const data = res.data;
      setProjectData(data);
      
      const [annosRes, labelsRes, shapesRes] = await Promise.all([
        api.get(`/vector/projects/${project.id}/annotations`).catch(() => ({ data: [] })),
        api.get(`/vector/projects/${project.id}/labels`).catch(() => ({ data: [] })),
        api.get(`/vector/projects/${project.id}/shapes`).catch(() => ({ data: [] }))
      ]);
      
      setAnnotations(annosRes.data || []);
      setLabels(labelsRes.data || []);
      setShapes(shapesRes.data || []);
      
      if (data.vector_metadata?.plots) {
        setPlots(data.vector_metadata.plots);
      }
    } catch (e) {
      alert('Error loading project: ' + (e.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  const loadPDF = async () => {
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
      
      const base64 = projectData.map_pdf_base64;
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      const pages = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        pages.push(page);
      }
      setPdfPages(pages);
    } catch (e) {
      console.error('Error loading PDF:', e);
      alert('Error loading PDF: ' + e.message);
    }
  };

  const drawCanvas = async () => {
    const canvas = canvasRef.current;
    if (!canvas || pdfPages.length === 0) return;
    
    const ctx = canvas.getContext('2d');
    const page = pdfPages[currentPage];
    const viewport = page.getViewport({ scale: scale });
    
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(panOffset.x, panOffset.y);
    
    // Draw PDF page
    const renderContext = {
      canvasContext: ctx,
      viewport: viewport
    };
    await page.render(renderContext).promise;
    
    // Draw plots
    plots.forEach(plot => {
      if (plot.x !== undefined && plot.y !== undefined) {
        const isSelected = selectedItem?.type === 'plot' && selectedItem.data.id === plot.id;
        ctx.strokeStyle = isSelected ? '#ef4444' : '#3b82f6';
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.strokeRect(plot.x * scale, plot.y * scale, (plot.w || 50) * scale, (plot.h || 50) * scale);
        if (plot.n) {
          ctx.fillStyle = isSelected ? '#ef4444' : '#3b82f6';
          ctx.font = `${12 * scale}px Arial`;
          ctx.fillText(plot.n, plot.x * scale + 5, plot.y * scale + 15);
        }
      }
    });
    
    // Draw shapes
    shapes.forEach(shape => {
      ctx.strokeStyle = shape.color || '#000000';
      ctx.lineWidth = 2;
      if (shape.type === 'rectangle') {
        ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
      } else if (shape.type === 'circle') {
        ctx.beginPath();
        ctx.arc(shape.x + shape.width/2, shape.y + shape.height/2, Math.min(shape.width, shape.height)/2, 0, 2 * Math.PI);
        ctx.stroke();
      }
    });
    
    // Draw labels
    labels.forEach(label => {
      ctx.fillStyle = label.color || '#000000';
      ctx.font = `${(label.size || 12) * scale}px Arial`;
      ctx.fillText(label.text || '', label.x, label.y);
    });
    
    // Draw annotations
    annotations.forEach(anno => {
      if (anno.plot_ids && anno.plot_ids.length > 0) {
        const plotIds = anno.plot_ids;
        plotIds.forEach(plotId => {
          const plot = plots.find(p => p.id === plotId);
          if (plot && plot.x !== undefined) {
            ctx.fillStyle = anno.color || '#ff0000';
            ctx.font = `${(anno.font_size || 12) * scale}px Arial`;
            const text = anno.note || '';
            const x = plot.x * scale + (plot.w || 50) * scale / 2;
            const y = plot.y * scale - 10;
            ctx.fillText(text, x, y);
          }
        });
      }
    });
    
    // Draw temp shape while drawing
    if (tempShape && drawingStart) {
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      if (tool === 'rectangle') {
        ctx.strokeRect(
          Math.min(drawingStart.x, tempShape.x),
          Math.min(drawingStart.y, tempShape.y),
          Math.abs(tempShape.x - drawingStart.x),
          Math.abs(tempShape.y - drawingStart.y)
        );
      } else if (tool === 'circle') {
        const radius = Math.sqrt(
          Math.pow(tempShape.x - drawingStart.x, 2) + 
          Math.pow(tempShape.y - drawingStart.y, 2)
        );
        ctx.beginPath();
        ctx.arc(drawingStart.x, drawingStart.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    
    ctx.restore();
  };

  const handleCanvasMouseDown = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - panOffset.x;
    const y = e.clientY - rect.top - panOffset.y;
    
    if (tool === 'pan') {
      setIsDragging(true);
      setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    } else if (tool === 'addPlot' || tool === 'rectangle' || tool === 'circle') {
      setDrawingStart({ x, y });
      setTempShape({ x, y });
    } else if (tool === 'select') {
      // Check if clicking on a plot
      const clickedPlot = plots.find(p => {
        const px = p.x * scale;
        const py = p.y * scale;
        return x >= px && x <= px + (p.w || 50) * scale && y >= py && y <= py + (p.h || 50) * scale;
      });
      if (clickedPlot) {
        setSelectedItem({ type: 'plot', data: clickedPlot });
      } else {
        // Check if clicking on a shape
        const clickedShape = shapes.find(s => {
          if (s.type === 'rectangle') {
            return x >= s.x && x <= s.x + s.width && y >= s.y && y <= s.y + s.height;
          } else if (s.type === 'circle') {
            const centerX = s.x + s.width / 2;
            const centerY = s.y + s.height / 2;
            const radius = Math.min(s.width, s.height) / 2;
            const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
            return dist <= radius;
          }
          return false;
        });
        if (clickedShape) {
          setSelectedItem({ type: 'shape', data: clickedShape });
        } else {
          setSelectedItem(null);
        }
      }
    }
  };

  const handleCanvasMouseMove = (e) => {
    if (isDragging && tool === 'pan') {
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;
      setPanOffset({ x: newX, y: newY });
    } else if (drawingStart && (tool === 'addPlot' || tool === 'rectangle' || tool === 'circle')) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - panOffset.x;
      const y = e.clientY - rect.top - panOffset.y;
      setTempShape({ x, y });
    }
  };

  const handleCanvasMouseUp = async (e) => {
    if (isDragging) {
      setIsDragging(false);
    } else if (tool === 'text') {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - panOffset.x;
      const y = e.clientY - rect.top - panOffset.y;
      const text = prompt('Enter text label:');
      if (text) {
        await saveLabel({ text, x, y, size: 12, color: '#000000' });
        saveHistory();
      }
    } else if (drawingStart && tempShape) {
      if (tool === 'addPlot') {
        const plotNum = prompt('Plot number:');
        if (plotNum) {
          const newPlot = {
            id: Date.now().toString(),
            n: plotNum,
            x: Math.min(drawingStart.x, tempShape.x) / scale,
            y: Math.min(drawingStart.y, tempShape.y) / scale,
            w: Math.abs(tempShape.x - drawingStart.x) / scale,
            h: Math.abs(tempShape.y - drawingStart.y) / scale
          };
          const updatedPlots = [...plots, newPlot];
          setPlots(updatedPlots);
          await savePlots(updatedPlots);
          saveHistory();
        }
      } else if (tool === 'rectangle' || tool === 'circle') {
        const newShape = {
          type: tool === 'rectangle' ? 'rectangle' : 'circle',
          x: Math.min(drawingStart.x, tempShape.x),
          y: Math.min(drawingStart.y, tempShape.y),
          width: Math.abs(tempShape.x - drawingStart.x),
          height: Math.abs(tempShape.y - drawingStart.y),
          color: '#000000'
        };
        await saveShape(newShape);
        saveHistory();
      }
      setDrawingStart(null);
      setTempShape(null);
    }
  };

  const savePlots = async (plotsToSave) => {
    if (!projectData) return;
    try {
      const metadata = { ...projectData.vector_metadata, plots: plotsToSave };
      const formData = new FormData();
      formData.append('vector_metadata', JSON.stringify(metadata));
      await api.put(`/vector/projects/${project.id}`, formData);
      setProjectData({ ...projectData, vector_metadata: metadata });
    } catch (e) {
      console.error('Error saving plots:', e);
    }
  };

  const saveShape = async (shape) => {
    try {
      const formData = new FormData();
      formData.append('shape_id', Date.now().toString());
      formData.append('type', shape.type);
      formData.append('x', shape.x);
      formData.append('y', shape.y);
      formData.append('width', shape.width);
      formData.append('height', shape.height);
      formData.append('color', shape.color);
      const res = await api.post(`/vector/projects/${project.id}/shapes`, formData);
      setShapes([...shapes, res.data]);
    } catch (e) {
      alert('Error saving shape: ' + (e.response?.data?.detail || e.message));
    }
  };

  const saveLabel = async (label) => {
    try {
      const formData = new FormData();
      formData.append('label_id', Date.now().toString());
      formData.append('text', label.text);
      formData.append('x', label.x);
      formData.append('y', label.y);
      formData.append('size', label.size || 12);
      formData.append('color', label.color || '#000000');
      const res = await api.post(`/vector/projects/${project.id}/labels`, formData);
      setLabels([...labels, res.data]);
    } catch (e) {
      alert('Error saving label: ' + (e.response?.data?.detail || e.message));
    }
  };

  const saveHistory = () => {
    const state = { annotations, labels, shapes, plots };
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(state);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevState = history[historyIndex - 1];
      setAnnotations(prevState.annotations);
      setLabels(prevState.labels);
      setShapes(prevState.shapes);
      setPlots(prevState.plots);
      setHistoryIndex(historyIndex - 1);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setAnnotations(nextState.annotations);
      setLabels(nextState.labels);
      setShapes(nextState.shapes);
      setPlots(nextState.plots);
      setHistoryIndex(historyIndex + 1);
    }
  };

  const handleAddAnnotation = () => {
    if (selectedItem && selectedItem.type === 'plot') {
      setEditingAnnotation({ plot_ids: [selectedItem.data.id], plot_nums: [selectedItem.data.n] });
      setShowAnnotationModal(true);
    } else {
      alert('Please select a plot first');
    }
  };

  const handleSaveAnnotation = async (annoData) => {
    try {
      const formData = new FormData();
      formData.append('annotation_id', editingAnnotation?.id || Date.now().toString());
      formData.append('note', annoData.note || '');
      formData.append('category', annoData.category || '');
      formData.append('color', annoData.color || '#ff0000');
      formData.append('font_size', annoData.fontSize || 12);
      formData.append('plot_ids', JSON.stringify(annoData.plotIds || []));
      formData.append('plot_nums', JSON.stringify(annoData.plotNums || []));
      
      if (editingAnnotation?.id) {
        await api.put(`/vector/projects/${project.id}/annotations/${editingAnnotation.id}`, formData);
        setAnnotations(annotations.map(a => a.id === editingAnnotation.id ? { ...a, ...annoData } : a));
      } else {
        const res = await api.post(`/vector/projects/${project.id}/annotations`, formData);
        setAnnotations([...annotations, res.data]);
      }
      setShowAnnotationModal(false);
      setEditingAnnotation(null);
      saveHistory();
    } catch (e) {
      alert('Error saving annotation: ' + (e.response?.data?.detail || e.message));
    }
  };

  const handleExport = async (format) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    if (format === 'image') {
      const link = document.createElement('a');
      link.download = `${project.name}_map.png`;
      link.href = canvas.toDataURL();
      link.click();
    } else if (format === 'pdf') {
      // Export as PDF using canvas
      alert('PDF export coming soon - use image export for now');
    }
  };

  if (loading) return <Loader />;

  if (!projectData) {
    return (
      <Modal title="Vector Map Editor" onClose={onClose}>
        <div className="p-6 text-center">
          <p className="text-gray-600 mb-4">Project data not found</p>
          <button onClick={onClose} className="bg-gray-900 text-white px-4 py-2 rounded-lg">Close</button>
        </div>
      </Modal>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full h-full max-w-[95vw] max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold">Vector Map Editor - {project.name}</h3>
            <div className="text-xs text-gray-500 mt-1">
              Plots: {plots.length} | Annotations: {annotations.length} | Labels: {labels.length} | Shapes: {shapes.length}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>

        {/* Toolbar */}
        <div className="p-3 border-b bg-gray-50 flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 border-r pr-2">
            <button
              onClick={() => setTool('select')}
              className={`px-3 py-1.5 text-xs rounded ${tool === 'select' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-100'}`}
              title="Select"
            >
              â†– Select
            </button>
            <button
              onClick={() => setTool('pan')}
              className={`px-3 py-1.5 text-xs rounded ${tool === 'pan' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-100'}`}
              title="Pan"
            >
              âœ‹ Pan
            </button>
            <button
              onClick={() => setTool('addPlot')}
              className={`px-3 py-1.5 text-xs rounded ${tool === 'addPlot' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-100'}`}
              title="Add Plot"
            >
              â–¢ Plot
            </button>
            <button
              onClick={() => setTool('rectangle')}
              className={`px-3 py-1.5 text-xs rounded ${tool === 'rectangle' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-100'}`}
              title="Rectangle"
            >
              â–­ Rect
            </button>
            <button
              onClick={() => setTool('circle')}
              className={`px-3 py-1.5 text-xs rounded ${tool === 'circle' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-100'}`}
              title="Circle"
            >
              â—‹ Circle
            </button>
            <button
              onClick={() => setTool('text')}
              className={`px-3 py-1.5 text-xs rounded ${tool === 'text' ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-100'}`}
              title="Text Label"
            >
              A Text
            </button>
          </div>
          
          <div className="flex gap-1 border-r pr-2">
            <button
              onClick={handleAddAnnotation}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
              title="Add Annotation"
            >
              ðŸ“ Annotate
            </button>
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="px-3 py-1.5 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
              title="Undo"
            >
              â†¶ Undo
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="px-3 py-1.5 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
              title="Redo"
            >
              â†· Redo
            </button>
          </div>

          <div className="flex gap-1 border-r pr-2">
            <button
              onClick={() => setScale(Math.max(0.5, scale - 0.1))}
              className="px-3 py-1.5 text-xs bg-white hover:bg-gray-100 rounded"
            >
              âˆ’
            </button>
            <span className="px-3 py-1.5 text-xs">{Math.round(scale * 100)}%</span>
            <button
              onClick={() => setScale(Math.min(3, scale + 0.1))}
              className="px-3 py-1.5 text-xs bg-white hover:bg-gray-100 rounded"
            >
              +
            </button>
          </div>

          {pdfPages.length > 1 && (
            <div className="flex gap-1 border-r pr-2">
              <button
                onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                disabled={currentPage === 0}
                className="px-3 py-1.5 text-xs bg-white hover:bg-gray-100 rounded disabled:opacity-50"
              >
                â€¹ Prev
              </button>
              <span className="px-3 py-1.5 text-xs">{currentPage + 1} / {pdfPages.length}</span>
              <button
                onClick={() => setCurrentPage(Math.min(pdfPages.length - 1, currentPage + 1))}
                disabled={currentPage === pdfPages.length - 1}
                className="px-3 py-1.5 text-xs bg-white hover:bg-gray-100 rounded disabled:opacity-50"
              >
                Next â€º
              </button>
            </div>
          )}

          <div className="flex gap-1">
            {selectedItem && (
              <button
                onClick={async () => {
                  if (confirm('Delete selected item?')) {
                    if (selectedItem.type === 'plot') {
                      const updatedPlots = plots.filter(p => p.id !== selectedItem.data.id);
                      setPlots(updatedPlots);
                      await savePlots(updatedPlots);
                      setSelectedItem(null);
                      saveHistory();
                    }
                  }
                }}
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                title="Delete Selected"
              >
                ðŸ—‘ï¸ Delete
              </button>
            )}
            <button
              onClick={() => handleExport('image')}
              className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700"
              title="Export as Image"
            >
              ðŸ’¾ Export
            </button>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 overflow-auto bg-gray-100 p-4" ref={containerRef}>
          {!projectData.map_pdf_base64 ? (
            <div className="p-8 text-center bg-yellow-50 rounded-lg">
              <p className="text-yellow-800 mb-4">âš ï¸ No map PDF uploaded for this project</p>
              <label className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg cursor-pointer hover:bg-blue-700">
                Upload Map PDF
                <input
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                      const base64 = event.target.result.split(',')[1];
                      const formData = new FormData();
                      formData.append('map_name', file.name);
                      formData.append('map_pdf_base64', base64);
                      await api.put(`/vector/projects/${project.id}`, formData);
                      await loadProjectData();
                      await onUpdate();
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            </div>
          ) : (
            <div className="relative inline-block">
              <canvas
                ref={canvasRef}
                className="border border-gray-300 bg-white cursor-crosshair"
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={() => {
                  setIsDragging(false);
                  setDrawingStart(null);
                  setTempShape(null);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Annotation Modal */}
      {showAnnotationModal && (
        <AnnotationEditor
          annotation={editingAnnotation}
          plots={plots}
          onSave={handleSaveAnnotation}
          onClose={() => {
            setShowAnnotationModal(false);
            setEditingAnnotation(null);
          }}
        />
      )}
    </div>
  );
}

// Annotation Editor Component
function AnnotationEditor({ annotation, plots, onSave, onClose }) {
  const [note, setNote] = useState(annotation?.note || '');
  const [category, setCategory] = useState(annotation?.category || '');
  const [color, setColor] = useState(annotation?.color || '#ff0000');
  const [fontSize, setFontSize] = useState(annotation?.font_size || 12);
  const [plotIds, setPlotIds] = useState(annotation?.plot_ids || []);
  const [plotNums, setPlotNums] = useState(annotation?.plot_nums || []);

  const handleSave = () => {
    onSave({
      note,
      category,
      color,
      fontSize,
      plotIds,
      plotNums
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h3 className="text-lg font-semibold mb-4">Edit Annotation</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Note</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <input
              type="text"
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Color</label>
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="w-full h-10 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Font Size</label>
              <input
                type="number"
                value={fontSize}
                onChange={e => setFontSize(parseInt(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg"
                min="8"
                max="72"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Linked Plots</label>
            <div className="text-xs text-gray-600">
              {plotNums.length > 0 ? plotNums.join(', ') : 'No plots linked'}
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          <button
            onClick={handleSave}
            className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800"
          >
            Save
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

