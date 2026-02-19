"""
Task Service for ORBIT CRM.
Handles task creation, assignment, delegation, status updates, and notifications.
Ported from voice-agent — converted async→sync, User→CompanyRep.
Uses ORBIT's existing create_notification() helper.
"""
import re
import html as html_mod
import logging
import pathlib
from typing import Optional, List, Dict, Any
from datetime import datetime, date, timedelta
import uuid as uuid_lib

from sqlalchemy.orm import Session
from sqlalchemy import func, or_, text

logger = logging.getLogger(__name__)
_task_type_normalization_done = False

# ============== Status Configuration per Task Type ==============
STATUS_CONFIG = {
    "general": ["pending", "in_progress", "completed", "on_hold", "cancelled"],
    "follow_up": ["pending", "in_progress", "completed", "cancelled"],
    "documentation": ["pending", "in_progress", "completed"],
    "meeting": ["pending", "in_progress", "completed", "cancelled"],
    "inventory": ["pending", "in_progress", "completed"],
    "transaction": ["pending", "in_progress", "completed"],
    "customer": ["pending", "in_progress", "completed"],
    "report": ["pending", "in_progress", "completed"],
    "approval": ["pending", "in_progress", "completed", "on_hold"],
    "sales": ["pending", "contacted", "qualified", "negotiation", "completed", "cancelled"],
    "collection": ["pending", "contacted", "promised", "completed", "cancelled"],
    "site_visit": ["pending", "confirmed", "completed", "cancelled"],
    "legal": ["pending", "in_progress", "completed"],
    "recovery": ["pending", "contacted", "promised", "in_progress", "completed", "cancelled"],
    "reconciliation": ["pending", "in_progress", "completed"],
}

TERMINAL_STATUSES = ["completed", "cancelled"]

DEPARTMENT_TASK_TYPES = {
    "Sales": ["sales", "follow_up", "site_visit", "customer"],
    "Recovery": ["recovery", "collection", "follow_up", "customer"],
    "Finance": ["approval", "report", "documentation", "legal", "reconciliation"],
    "Operations": ["inventory", "transaction", "documentation", "general"],
}

TASK_TYPE_DEPARTMENT = {
    "sales": "Sales", "site_visit": "Sales",
    "collection": "Recovery", "recovery": "Recovery",
    "approval": "Finance", "legal": "Finance", "reconciliation": "Finance",
    "inventory": "Operations", "transaction": "Operations",
}

DEFAULT_STATUS = {task_type: statuses[0] for task_type, statuses in STATUS_CONFIG.items()}

# Role keywords for entity extraction
# Maps job titles to CRM role for fallback assignment
ROLE_KEYWORDS = {
    'ceo': 'admin', 'chief executive': 'admin',
    'coo': 'admin', 'chief operating officer': 'admin',
    'cfo': 'admin', 'chief financial officer': 'admin',
    'cco': 'cco', 'chief commercial officer': 'cco',
    'finance': 'admin', 'accounts': 'admin', 'accountant': 'admin',
    'sales manager': 'manager', 'manager': 'manager',
    'sales rep': 'user', 'salesman': 'user',
    'sales': 'user', 'consultant': 'user',
    'admin': 'admin',
}

# Maps title/name aliases to actual CRM user names for precise assignment
TITLE_TO_NAME = {
    # ── Sarosh Javed (CEO, REP-0009) ──
    'ceo': 'Sarosh Javed', 'chief executive': 'Sarosh Javed', 'chief executive officer': 'Sarosh Javed',
    'sarosh': 'Sarosh Javed', 'sarosh javed': 'Sarosh Javed',
    'sarush': 'Sarosh Javed', 'saroosh': 'Sarosh Javed', 'surosh': 'Sarosh Javed',
    'saroj': 'Sarosh Javed', 'srosh': 'Sarosh Javed', 'sarish': 'Sarosh Javed',
    # ── Jawad Saleem (CFO, REP-0010) ──
    'cfo': 'Jawad Saleem', 'chief financial officer': 'Jawad Saleem',
    'jawad': 'Jawad Saleem', 'jawad saleem': 'Jawad Saleem',
    'javad': 'Jawad Saleem', 'javed saleem': 'Jawad Saleem', 'jawwad': 'Jawad Saleem',
    'jawaid': 'Jawad Saleem', 'javaid': 'Jawad Saleem', 'jawaad': 'Jawad Saleem',
    'jawed': 'Jawad Saleem', 'javid': 'Jawad Saleem',
    # ── Hassan Danish (COO, REP-0003) ──
    'coo': 'Hassan Danish', 'chief operating officer': 'Hassan Danish',
    'hassan': 'Hassan Danish', 'hassan danish': 'Hassan Danish', 'hd': 'Hassan Danish',
    'hasan': 'Hassan Danish', 'haasan': 'Hassan Danish', 'hussan': 'Hassan Danish',
    'hassaan': 'Hassan Danish', 'husan': 'Hassan Danish', 'danish': 'Hassan Danish',
    # ── Syed Faisal (CCO, REP-0008) ──
    'cco': 'Syed Faisal', 'chief commercial officer': 'Syed Faisal',
    'faisal': 'Syed Faisal', 'syed faisal': 'Syed Faisal',
    'faizel': 'Syed Faisal', 'faisaal': 'Syed Faisal', 'faizal': 'Syed Faisal',
    'faysal': 'Syed Faisal', 'faisol': 'Syed Faisal', 'fesal': 'Syed Faisal',
    'phaisal': 'Syed Faisal', 'faisl': 'Syed Faisal',
    # ── Malik Amin (System Admin, REP-0002) ──
    'admin': 'Malik Amin', 'system admin': 'Malik Amin',
    'malik': 'Malik Amin', 'malik amin': 'Malik Amin', 'amin': 'Malik Amin',
    'malick': 'Malik Amin', 'malek': 'Malik Amin', 'maalik': 'Malik Amin',
    'ameen': 'Malik Amin', 'amein': 'Malik Amin',
    # ── Afaaq (Finance, REP-0013) ──
    'afaaq': 'Afaaq', 'afaq': 'Afaaq', 'afak': 'Afaaq', 'affaq': 'Afaaq',
    'afaak': 'Afaaq', 'afack': 'Afaaq', 'afaakh': 'Afaaq', 'afaaque': 'Afaaq',
    'afaque': 'Afaaq', 'afac': 'Afaaq', 'affak': 'Afaaq', 'aafaq': 'Afaaq',
    # ── Luqman (Consultant, REP-0011) ──
    'luqman': 'Luqman', 'lukman': 'Luqman', 'luqmaan': 'Luqman',
    'lookman': 'Luqman', 'luqmon': 'Luqman', 'luckman': 'Luqman',
    'lukhman': 'Luqman', 'loqman': 'Luqman', 'lukmon': 'Luqman',
    # ── Mujtaba (Cash, REP-0012) ──
    'mujtaba': 'Mujtaba', 'mujteba': 'Mujtaba', 'mojtaba': 'Mujtaba',
    'mujtba': 'Mujtaba', 'mujtabah': 'Mujtaba', 'majtaba': 'Mujtaba',
    'mushtaba': 'Mujtaba', 'mujtuba': 'Mujtaba', 'mojteba': 'Mujtaba',
    # ── Waqar (Sales, REP-0001) ──
    'waqar': 'Waqar', 'wakar': 'Waqar', 'waqas': 'Waqar',
    'wakaar': 'Waqar', 'vaqar': 'Waqar', 'waqaar': 'Waqar',
    'waker': 'Waqar', 'vakar': 'Waqar', 'wuqar': 'Waqar',
    # ── Ahsan Ejaz (Director Land, REP-0004) ──
    'ahsan': 'Ahsan Ejaz', 'ahsan ejaz': 'Ahsan Ejaz', 'ehsan': 'Ahsan Ejaz',
    'ahsen': 'Ahsan Ejaz', 'ahsaan': 'Ahsan Ejaz', 'ihsan': 'Ahsan Ejaz',
    'axan': 'Ahsan Ejaz', 'ejaz': 'Ahsan Ejaz', 'aijaz': 'Ahsan Ejaz',
    'ehsaan': 'Ahsan Ejaz', 'ahson': 'Ahsan Ejaz',
    # ── Iram Riaz (Director Project Sales, REP-0014) ──
    'iram riaz': 'Iram Riaz', 'irum riaz': 'Iram Riaz', 'airam riaz': 'Iram Riaz',
    'eram riaz': 'Iram Riaz', 'riaz': 'Iram Riaz',
    'director iram': 'Iram Riaz', 'director project sales': 'Iram Riaz',
    # ── Imran Younas (Director Project Sales, REP-0015) ──
    'imran': 'Imran Younas', 'imran younas': 'Imran Younas', 'imraan': 'Imran Younas',
    'emran': 'Imran Younas', 'imren': 'Imran Younas', 'umran': 'Imran Younas',
    'younas': 'Imran Younas', 'yunas': 'Imran Younas', 'younus': 'Imran Younas',
    # ── Samia Rashid (Sr. Manager, REP-0016) ──
    'samia': 'Samia Rashid', 'samia rashid': 'Samia Rashid', 'saamia': 'Samia Rashid',
    'samiya': 'Samia Rashid', 'sumia': 'Samia Rashid', 'samea': 'Samia Rashid',
    'rashid': 'Samia Rashid', 'rasheed': 'Samia Rashid',
    # ── Syed Naeem Abbass Zaidi (Sr. Manager, REP-0017) ──
    'naeem': 'Syed Naeem Abbass Zaidi', 'syed naeem': 'Syed Naeem Abbass Zaidi',
    'naeem zaidi': 'Syed Naeem Abbass Zaidi', 'nayeem': 'Syed Naeem Abbass Zaidi',
    'naim': 'Syed Naeem Abbass Zaidi', 'neem': 'Syed Naeem Abbass Zaidi',
    'naeem abbas': 'Syed Naeem Abbass Zaidi', 'naeem abbass': 'Syed Naeem Abbass Zaidi',
    # ── Syed Ali Zaib Zaidi (Sr. Manager, REP-0018) ──
    'ali zaib': 'Syed Ali Zaib Zaidi', 'syed ali zaib': 'Syed Ali Zaib Zaidi',
    'ali zaidi': 'Syed Ali Zaib Zaidi', 'ali zeb': 'Syed Ali Zaib Zaidi',
    'alizaib': 'Syed Ali Zaib Zaidi', 'ali zab': 'Syed Ali Zaib Zaidi',
    'ali zaib zaidi': 'Syed Ali Zaib Zaidi',
    # ── Iram Aslam (Sr. Manager, REP-0019) ──
    'iram aslam': 'Iram Aslam', 'irum aslam': 'Iram Aslam', 'airam aslam': 'Iram Aslam',
    'eram aslam': 'Iram Aslam', 'aslam': 'Iram Aslam',
    'manager iram': 'Iram Aslam',
}

# Ambiguous first-name variants that need context-aware resolution
# Maps variant → list of possible full names
AMBIGUOUS_NAMES = {
    'iram': ['Iram Riaz', 'Iram Aslam'],
    'irum': ['Iram Riaz', 'Iram Aslam'],
    'airam': ['Iram Riaz', 'Iram Aslam'],
    'eram': ['Iram Riaz', 'Iram Aslam'],
}

# Org hierarchy for disambiguation: rep_name → { reports_to, role_level }
# role_level: higher number = more senior (used for CCO/Director→Manager routing)
REP_HIERARCHY = {
    'Syed Faisal':       {'reports_to': None,          'role_level': 4, 'title': 'CCO'},
    'Iram Riaz':         {'reports_to': 'Syed Faisal', 'role_level': 3, 'title': 'Director'},
    'Imran Younas':      {'reports_to': 'Syed Faisal', 'role_level': 3, 'title': 'Director'},
    'Waqar':             {'reports_to': 'Iram Riaz',   'role_level': 2, 'title': 'Sales'},
    'Samia Rashid':      {'reports_to': 'Iram Riaz',   'role_level': 2, 'title': 'Manager'},
    'Syed Naeem Abbass Zaidi': {'reports_to': 'Iram Riaz', 'role_level': 2, 'title': 'Manager'},
    'Syed Ali Zaib Zaidi':     {'reports_to': 'Imran Younas', 'role_level': 2, 'title': 'Manager'},
    'Iram Aslam':        {'reports_to': 'Imran Younas', 'role_level': 2, 'title': 'Manager'},
}

PRIORITY_KEYWORDS = {
    'urgent': 'urgent', 'asap': 'urgent', 'immediately': 'urgent',
    'high priority': 'high', 'important': 'high',
    'low priority': 'low', 'whenever': 'low',
}

TASK_TYPE_KEYWORDS = {
    'presentation': 'documentation', 'document': 'documentation', 'pdf': 'documentation',
    'report': 'report', 'reconciliation': 'reconciliation', 'reconcile': 'reconciliation',
    'review': 'approval', 'approve': 'approval', 'approval': 'approval',
    'follow up': 'follow_up', 'followup': 'follow_up', 'call': 'follow_up',
    'recovery': 'recovery', 'recover': 'recovery', 'overdue payment': 'recovery',
    'defaulter': 'recovery', 'collection': 'collection', 'collect': 'collection',
}

# ============== Daily Report HTML Template Assets ==============

REPORT_GOOGLE_FONTS = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700'
    '&family=Cormorant+Garamond:wght@300;400;500;600&family=Bebas+Neue'
    '&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">'
)

REPORT_CSS = """
  /* ===== RESET & BASE ===== */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    /* Background layers */
    --bg:             #F7F8FA;
    --surface:        #FFFFFF;
    --surface-alt:    #F1F3F5;
    --surface-hover:  #E9ECF0;

    /* Navy command palette */
    --navy-900:  #0B0F1A;
    --navy-800:  #111827;
    --navy-700:  #1E293B;
    --navy-600:  #334155;
    --navy-500:  #475569;
    --navy-400:  #64748B;
    --navy-300:  #94A3B8;
    --navy-200:  #CBD5E1;
    --navy-100:  #E2E8F0;
    --navy-50:   #F1F5F9;

    /* Semantic */
    --red-600:   #DC2626;
    --red-500:   #EF4444;
    --red-100:   #FEE2E2;
    --red-50:    #FEF2F2;

    --amber-600: #D97706;
    --amber-500: #F59E0B;
    --amber-100: #FEF3C7;
    --amber-50:  #FFFBEB;

    --green-600: #059669;
    --green-500: #10B981;
    --green-100: #D1FAE5;
    --green-50:  #ECFDF5;

    --blue-600:  #2563EB;
    --blue-500:  #3B82F6;
    --blue-100:  #DBEAFE;
    --blue-50:   #EFF6FF;

    --violet-600:#7C3AED;
    --violet-100:#EDE9FE;

    /* Text */
    --text-primary:   #18181B;
    --text-secondary: #52525B;
    --text-tertiary:  #A1A1AA;
    --text-inverse:   #FAFAFA;

    /* Borders & shadows */
    --border:        #E4E4E7;
    --border-light:  #F4F4F5;
    --shadow-sm:     0 1px 2px rgba(0,0,0,0.04);
    --shadow-md:     0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
    --shadow-lg:     0 4px 16px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04);

    /* Spacing */
    --space-xs:  4px;
    --space-sm:  8px;
    --space-md:  16px;
    --space-lg:  24px;
    --space-xl:  40px;
    --space-2xl: 60px;

    /* Radius */
    --radius-sm: 6px;
    --radius-md: 10px;
    --radius-lg: 14px;
  }

  html {
    font-size: 15px;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  body {
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: var(--bg);
    color: var(--text-primary);
    line-height: 1.6;
    padding: 0;
  }

  /* ===== LAYOUT SHELL ===== */
  .page-wrapper {
    max-width: 960px;
    margin: 0 auto;
    padding: var(--space-xl) var(--space-lg);
  }

  /* ===== ANIMATIONS ===== */
  @keyframes fadeInDown {
    from { opacity: 0; transform: translateY(-20px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .animate-header  { animation: fadeInDown 0.5s ease-out both; }
  .animate-cards   { animation: slideUp 0.45s ease-out both; animation-delay: 0.1s; }
  .animate-section { animation: fadeIn 0.5s ease-out both; }
  .stagger-1 { animation-delay: 0.05s; }
  .stagger-2 { animation-delay: 0.10s; }
  .stagger-3 { animation-delay: 0.15s; }
  .stagger-4 { animation-delay: 0.20s; }
  .stagger-5 { animation-delay: 0.25s; }
  .stagger-6 { animation-delay: 0.30s; }

  /* ===== HEADER ===== */
  .report-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-xl);
    padding-bottom: var(--space-lg);
    border-bottom: 2px solid var(--navy-700);
  }

  .header-left { flex: 1; }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: var(--space-md);
  }

  .brand-icon {
    width: 42px;
    height: 42px;
    background: var(--navy-700);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-inverse);
    font-family: 'Bebas Neue', sans-serif;
    font-size: 1.35rem;
    letter-spacing: 1px;
    flex-shrink: 0;
  }

  .brand-text {
    font-family: 'DM Sans', sans-serif;
    font-weight: 700;
    font-size: 1.1rem;
    color: var(--navy-700);
    letter-spacing: 0.5px;
  }

  .brand-sub {
    font-family: 'DM Sans', sans-serif;
    font-weight: 400;
    font-size: 0.7rem;
    color: var(--navy-400);
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-top: 1px;
  }

  .report-title {
    font-family: 'Playfair Display', serif;
    font-size: 1.85rem;
    font-weight: 600;
    color: var(--navy-800);
    letter-spacing: 0.3px;
    line-height: 1.2;
    margin-bottom: 4px;
  }

  .report-date {
    font-family: 'Cormorant Garamond', serif;
    font-size: 1rem;
    color: var(--navy-400);
    font-weight: 400;
    letter-spacing: 0.3px;
  }

  .header-right {
    text-align: right;
    flex-shrink: 0;
    padding-top: 6px;
  }

  .recipient-label {
    font-size: 0.65rem;
    font-weight: 500;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 4px;
  }

  .recipient-name {
    font-family: 'Playfair Display', serif;
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--navy-800);
    margin-bottom: 2px;
  }

  .recipient-role {
    font-size: 0.8rem;
    color: var(--navy-400);
    font-weight: 400;
  }

  .rep-id-badge {
    display: inline-block;
    margin-top: 8px;
    padding: 3px 10px;
    background: var(--navy-50);
    border: 1px solid var(--navy-100);
    border-radius: 4px;
    font-family: 'DM Sans', sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--navy-500);
    letter-spacing: 1px;
  }

  /* ===== SUMMARY CARDS ===== */
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-md);
    margin-bottom: var(--space-xl);
  }

  .summary-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 22px 20px 18px;
    position: relative;
    overflow: hidden;
    box-shadow: var(--shadow-sm);
    transition: box-shadow 0.2s ease, transform 0.2s ease;
  }

  .summary-card:hover {
    box-shadow: var(--shadow-md);
    transform: translateY(-1px);
  }

  .summary-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
  }

  .summary-card.card-total::before    { background: var(--navy-700); }
  .summary-card.card-due::before      { background: var(--amber-500); }
  .summary-card.card-overdue::before  { background: var(--red-500); }
  .summary-card.card-completed::before{ background: var(--green-500); }

  .card-label {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--text-tertiary);
    margin-bottom: 8px;
  }

  .card-value {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 2.6rem;
    line-height: 1;
    letter-spacing: 1px;
    margin-bottom: 4px;
  }

  .card-total .card-value    { color: var(--navy-700); }
  .card-due .card-value      { color: var(--amber-600); }
  .card-overdue .card-value  { color: var(--red-600); }
  .card-completed .card-value{ color: var(--green-600); }

  .card-context {
    font-size: 0.72rem;
    color: var(--text-tertiary);
    font-weight: 400;
  }

  /* ===== SECTION TITLES ===== */
  .section {
    margin-bottom: var(--space-xl);
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: var(--space-lg);
  }

  .section-icon {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.85rem;
    flex-shrink: 0;
  }

  .section-icon.red    { background: var(--red-100);   color: var(--red-600); }
  .section-icon.blue   { background: var(--blue-100);  color: var(--blue-600); }
  .section-icon.green  { background: var(--green-100); color: var(--green-600); }
  .section-icon.violet { background: var(--violet-100); color: var(--violet-600); }

  .section-title {
    font-family: 'Playfair Display', serif;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--navy-800);
    letter-spacing: 0.3px;
  }

  .section-subtitle {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    font-weight: 400;
    margin-top: 1px;
  }

  .section-line {
    flex: 1;
    height: 1px;
    background: var(--border);
    margin-left: 8px;
  }

  /* ===== ATTENTION CARDS ===== */
  .attention-card {
    background: var(--surface);
    border: 1px solid var(--red-100);
    border-left: 4px solid var(--red-500);
    border-radius: var(--radius-md);
    padding: 20px 24px;
    margin-bottom: var(--space-md);
    box-shadow: var(--shadow-sm);
    transition: box-shadow 0.2s ease, border-left-color 0.2s ease;
  }

  .attention-card:hover {
    box-shadow: var(--shadow-md);
    border-left-color: var(--red-600);
  }

  .attention-card.urgent {
    border-left-color: var(--red-600);
    background: var(--red-50);
  }

  .attention-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 10px;
  }

  .attention-id {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--navy-400);
    letter-spacing: 0.5px;
  }

  .attention-title {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--navy-800);
    margin-bottom: 10px;
    line-height: 1.4;
  }

  .attention-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .overdue-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    background: var(--red-100);
    color: var(--red-600);
    border-radius: 20px;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.3px;
  }

  .today-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    background: var(--amber-100);
    color: var(--amber-600);
    border-radius: 20px;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.3px;
  }

  /* ===== BADGES & PILLS ===== */
  .priority-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.62rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    line-height: 1.6;
  }

  .priority-urgent  { background: var(--red-100);   color: var(--red-600); }
  .priority-high    { background: #FEF3C7;          color: #B45309; }
  .priority-medium  { background: var(--blue-100);   color: var(--blue-600); }
  .priority-low     { background: var(--navy-50);    color: var(--navy-500); }

  .status-pill {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 20px;
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.5px;
    white-space: nowrap;
  }

  .status-pending     { background: var(--amber-100); color: var(--amber-600); }
  .status-in-progress { background: var(--blue-100);  color: var(--blue-600); }
  .status-on-hold     { background: var(--navy-50);   color: var(--navy-500); }
  .status-completed   { background: var(--green-100); color: var(--green-600); }

  .meta-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.72rem;
    color: var(--text-secondary);
  }

  .meta-item .dot {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--navy-300);
  }

  /* ===== DATA TABLE ===== */
  .table-wrapper {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
    box-shadow: var(--shadow-sm);
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }

  .data-table thead {
    background: var(--navy-50);
    border-bottom: 2px solid var(--navy-100);
  }

  .data-table th {
    padding: 12px 16px;
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--navy-500);
    text-align: left;
    white-space: nowrap;
  }

  .data-table td {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-light);
    vertical-align: middle;
    color: var(--text-primary);
  }

  .data-table tbody tr {
    transition: background 0.15s ease;
  }

  .data-table tbody tr:hover {
    background: var(--navy-50);
  }

  .data-table tbody tr:last-child td {
    border-bottom: none;
  }

  .task-id-cell {
    font-family: 'DM Sans', sans-serif;
    font-weight: 600;
    font-size: 0.72rem;
    color: var(--navy-500);
    letter-spacing: 0.5px;
  }

  .task-title-cell {
    font-weight: 500;
    color: var(--navy-800);
    max-width: 240px;
    line-height: 1.35;
  }

  .type-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    background: var(--navy-50);
    color: var(--navy-500);
    white-space: nowrap;
  }

  .type-finance    { background: #EDE9FE; color: #6D28D9; }
  .type-operations { background: #DBEAFE; color: #1D4ED8; }
  .type-sales      { background: #D1FAE5; color: #047857; }
  .type-recovery   { background: #FEF3C7; color: #B45309; }

  .dept-cell {
    font-size: 0.72rem;
    color: var(--text-secondary);
  }

  .due-cell {
    font-size: 0.75rem;
    white-space: nowrap;
  }

  .due-overdue {
    color: var(--red-600);
    font-weight: 600;
  }

  .due-today {
    color: var(--amber-600);
    font-weight: 600;
  }

  .due-normal {
    color: var(--text-secondary);
  }

  .assignee-cell {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  /* ===== TIMELINE ===== */
  .timeline-block {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 24px;
    margin-bottom: var(--space-md);
    box-shadow: var(--shadow-sm);
  }

  .timeline-task-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border-light);
  }

  .timeline-task-id {
    font-family: 'DM Sans', sans-serif;
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--navy-400);
    letter-spacing: 0.5px;
    padding: 2px 8px;
    background: var(--navy-50);
    border-radius: 4px;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .timeline-task-title {
    font-family: 'DM Sans', sans-serif;
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--navy-800);
    line-height: 1.4;
  }

  .timeline-task-meta {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }

  .timeline-entries {
    position: relative;
    padding-left: 24px;
  }

  .timeline-entries::before {
    content: '';
    position: absolute;
    left: 7px;
    top: 6px;
    bottom: 6px;
    width: 1.5px;
    background: linear-gradient(to bottom, var(--navy-200), var(--border-light));
    border-radius: 1px;
  }

  .timeline-entry {
    position: relative;
    padding-bottom: 18px;
    padding-left: 12px;
  }

  .timeline-entry:last-child {
    padding-bottom: 0;
  }

  .timeline-entry::before {
    content: '';
    position: absolute;
    left: -20px;
    top: 6px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    border: 2px solid var(--navy-300);
    background: var(--surface);
    z-index: 1;
  }

  .timeline-entry.entry-comment::before  { border-color: var(--blue-500);  background: var(--blue-100); }
  .timeline-entry.entry-status::before   { border-color: var(--green-500); background: var(--green-100); }
  .timeline-entry.entry-assign::before   { border-color: var(--violet-600); background: var(--violet-100); }
  .timeline-entry.entry-created::before  { border-color: var(--navy-400);  background: var(--navy-50); }
  .timeline-entry.entry-priority::before { border-color: var(--amber-500); background: var(--amber-100); }

  .timeline-time {
    font-size: 0.65rem;
    font-weight: 500;
    color: var(--text-tertiary);
    letter-spacing: 0.3px;
    margin-bottom: 3px;
  }

  .timeline-text {
    font-size: 0.8rem;
    color: var(--text-secondary);
    line-height: 1.45;
  }

  .timeline-text strong {
    color: var(--navy-700);
    font-weight: 600;
  }

  .timeline-text .status-change {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .timeline-text .arrow {
    color: var(--text-tertiary);
    font-size: 0.7rem;
  }

  /* ===== FOOTER ===== */
  .report-footer {
    margin-top: var(--space-2xl);
    padding-top: var(--space-lg);
    border-top: 2px solid var(--navy-700);
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }

  .footer-left {}

  .footer-brand {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--navy-500);
    margin-bottom: 4px;
  }

  .footer-meta {
    font-size: 0.68rem;
    color: var(--text-tertiary);
    line-height: 1.6;
  }

  .footer-right {
    text-align: right;
  }

  .footer-confidential {
    font-size: 0.6rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--text-tertiary);
    margin-bottom: 4px;
  }

  .footer-page {
    font-size: 0.65rem;
    color: var(--text-tertiary);
  }

  /* ===== RESPONSIVE ===== */
  @media (max-width: 768px) {
    .page-wrapper {
      padding: var(--space-lg) var(--space-md);
    }

    .report-header {
      flex-direction: column;
      gap: var(--space-md);
    }

    .header-right {
      text-align: left;
    }

    .summary-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .table-wrapper {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    .data-table {
      min-width: 700px;
    }

    .attention-top {
      flex-direction: column;
      gap: 6px;
    }

    .report-footer {
      flex-direction: column;
      gap: var(--space-md);
      align-items: flex-start;
    }

    .footer-right {
      text-align: left;
    }
  }

  @media (max-width: 480px) {
    .summary-grid {
      grid-template-columns: 1fr 1fr;
      gap: var(--space-sm);
    }

    .card-value {
      font-size: 2rem;
    }
  }

  /* ===== PRINT ===== */
  @media print {
    @page {
      size: A4 portrait;
      margin: 18mm 15mm 20mm 15mm;
    }

    html { font-size: 13px; }

    body {
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page-wrapper {
      max-width: 100%;
      padding: 0;
    }

    .summary-card,
    .attention-card,
    .table-wrapper,
    .timeline-block {
      box-shadow: none;
      break-inside: avoid;
    }

    .summary-card:hover,
    .attention-card:hover,
    .data-table tbody tr:hover {
      transform: none;
      box-shadow: none;
      background: transparent;
    }

    .timeline-block {
      page-break-inside: avoid;
    }

    .section {
      page-break-inside: avoid;
    }

    .report-footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 12px 15mm;
      border-top: 1.5px solid var(--navy-700);
      background: #fff;
    }
  }
"""

# SVG icon constants for section headers
SVG_ATTENTION = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
SVG_TASKLIST = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>'
SVG_TIMELINE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>'
SVG_CLOCK = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'


def _disambiguate_name(variant: str, candidates: list, text_lower: str, creator_name: str = None) -> str:
    """
    Resolve ambiguous first names (e.g., 'iram') using contextual rules:
    1. Self-exclusion: can't assign to yourself
    2. Direct reports: manager assigns to their own subordinate
    3. Hierarchy level: senior assigns to next-level-down peer with that name
    4. Title hints in text: "director iram" vs "manager iram"
    """
    if len(candidates) < 2:
        return candidates[0] if candidates else variant.title()

    # Rule 0: Check for title hints in the text itself
    for candidate in candidates:
        info = REP_HIERARCHY.get(candidate, {})
        title = info.get('title', '').lower()
        if title and title in text_lower:
            return candidate

    # Rule 1: Self-exclusion — if creator is one of the candidates, pick the other
    if creator_name:
        non_self = [c for c in candidates if c != creator_name]
        if len(non_self) == 1:
            return non_self[0]

        # Rule 2: Direct report — if creator is the manager of exactly one candidate
        direct_reports = [c for c in candidates if REP_HIERARCHY.get(c, {}).get('reports_to') == creator_name]
        if len(direct_reports) == 1:
            return direct_reports[0]

        # Rule 3: Hierarchy level — senior person assigns down, not laterally
        creator_info = REP_HIERARCHY.get(creator_name, {})
        creator_level = creator_info.get('role_level', 0)
        if creator_level > 0:
            # From higher level, pick the candidate closest below
            below = [(c, REP_HIERARCHY.get(c, {}).get('role_level', 0)) for c in candidates]
            below_sorted = sorted([b for b in below if b[1] < creator_level], key=lambda x: x[1], reverse=True)
            if len(below_sorted) == 1:
                return below_sorted[0][0]
            # If multiple at same level, pick the one in creator's reporting chain
            if below_sorted:
                for cand, _ in below_sorted:
                    if REP_HIERARCHY.get(cand, {}).get('reports_to') == creator_name:
                        return cand
                return below_sorted[0][0]

    # Fallback: return the more senior candidate (higher role_level)
    ranked = sorted(candidates, key=lambda c: REP_HIERARCHY.get(c, {}).get('role_level', 0), reverse=True)
    return ranked[0]


class TaskEntityExtractor:
    """Extract task-related entities from voice/text commands."""

    def extract(self, text: str, creator_name: str = None) -> Dict[str, Any]:
        text_lower = text.lower()
        entities = {
            'assignee_name': None, 'assignee_role': None,
            'task_title': None, 'priority': 'medium',
            'task_type': 'general', 'due_date': None,
            'project': None, 'block': None,
            'unit_number': None, 'customer_name': None,
        }

        # Extract role/assignee — check title-to-name mapping first
        # Use longest-match-first to prefer "director iram" over "iram"
        sorted_keywords = sorted(TITLE_TO_NAME.keys(), key=len, reverse=True)
        for keyword in sorted_keywords:
            if keyword in text_lower:
                entities['assignee_name'] = TITLE_TO_NAME[keyword]
                break

        # If no exact match, check ambiguous first names with context disambiguation
        if not entities['assignee_name']:
            for variant, candidates in AMBIGUOUS_NAMES.items():
                if variant in text_lower:
                    entities['assignee_name'] = _disambiguate_name(
                        variant, candidates, text_lower, creator_name
                    )
                    break

        # If no title match, check role keywords for fallback
        if not entities['assignee_name']:
            for keyword, role in ROLE_KEYWORDS.items():
                if keyword in text_lower:
                    entities['assignee_role'] = role
                    break

        # Extract name from text (skip if first word is a role/title keyword)
        if not entities['assignee_name']:
            name_patterns = [
                r'assign\s+(?:a\s+)?(?:task\s+)?(?:to|for)\s+(\w+(?:\s+\w+)?)',
                r'task\s+(?:for|to)\s+(\w+(?:\s+\w+)?)',
                r'assign\s+(\w+)(?:\s*:)',
            ]
            skip_words = {'a', 'the', 'this', 'that', 'task', 'tasks'}
            all_title_keys = set(ROLE_KEYWORDS.keys()) | set(TITLE_TO_NAME.keys())
            for pattern in name_patterns:
                match = re.search(pattern, text_lower)
                if match:
                    potential_name = match.group(1).strip()
                    first_word = potential_name.split()[0] if potential_name else ''
                    if first_word in all_title_keys or first_word in skip_words:
                        continue
                    if potential_name not in skip_words:
                        entities['assignee_name'] = potential_name.title()
                        break

        # Extract priority
        for keyword, priority in PRIORITY_KEYWORDS.items():
            if keyword in text_lower:
                entities['priority'] = priority
                break

        # Extract task type
        for keyword, task_type in TASK_TYPE_KEYWORDS.items():
            if keyword in text_lower:
                entities['task_type'] = task_type
                break

        # Extract due date
        entities['due_date'] = self._extract_due_date(text_lower)

        # Extract CRM references
        entities.update(self._extract_crm_references(text))

        # Extract task title (pass assignee name so it can be stripped from title)
        entities['task_title'] = self._extract_task_title(text, assignee_name=entities.get('assignee_name'))

        return entities

    def _extract_due_date(self, text: str) -> Optional[date]:
        today = date.today()
        if 'today' in text:
            return today
        if 'tomorrow' in text:
            return today + timedelta(days=1)
        if 'next week' in text:
            return today + timedelta(weeks=1)
        if 'end of week' in text or 'eow' in text:
            days_until_friday = (4 - today.weekday()) % 7
            return today + timedelta(days=days_until_friday)
        if 'end of month' in text or 'eom' in text:
            if today.month == 12:
                return today.replace(year=today.year + 1, month=1, day=1) - timedelta(days=1)
            return today.replace(month=today.month + 1, day=1) - timedelta(days=1)
        date_patterns = [r'by\s+(\d{1,2})[\/\-](\d{1,2})', r'due\s+(\d{1,2})[\/\-](\d{1,2})']
        for pattern in date_patterns:
            match = re.search(pattern, text)
            if match:
                try:
                    day, month = int(match.group(1)), int(match.group(2))
                    return date(today.year, month, day)
                except (ValueError, TypeError):
                    pass
        return None

    def _extract_crm_references(self, text: str) -> Dict[str, Any]:
        refs = {}
        unit_match = re.search(r'(?:unit|plot|flat|shop)[\s#\-]*(\d+)', text, re.IGNORECASE)
        if unit_match:
            refs['unit_number'] = unit_match.group(1)
        block_match = re.search(r'block[\s\-]*([A-Za-z0-9\-]+)', text, re.IGNORECASE)
        if block_match:
            refs['block'] = block_match.group(1).upper()
        projects = ['sitara villas', 'sitara park city', 'sitara square', 'riaz ul jannah']
        text_lower = text.lower()
        for project in projects:
            if project in text_lower:
                refs['project'] = project.title()
                break
        customer_match = re.search(r'customer\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)', text, re.IGNORECASE)
        if customer_match:
            refs['customer_name'] = customer_match.group(1).title()
        return refs

    def _extract_task_title(self, text: str, assignee_name: str = None) -> str:
        title = text
        # Strip command verbs + "task to <name>" patterns
        prefixes = [
            r'^(?:assign|tell|ask|remind)\s+(?:a\s+)?(?:task\s+)?(?:to|for)\s+',
            r'^(?:assign|tell|ask|remind)\s+',
            r'^task\s+(?:for|to)\s+',
        ]
        for prefix in prefixes:
            title = re.sub(prefix, '', title, flags=re.IGNORECASE)
        # Strip the resolved assignee name + all known aliases from the start
        if assignee_name:
            title = re.sub(r'^' + re.escape(assignee_name) + r'\s*', '', title, flags=re.IGNORECASE)
            for alias, canonical in TITLE_TO_NAME.items():
                if canonical.lower() == assignee_name.lower():
                    title = re.sub(r'^' + re.escape(alias) + r'\s*', '', title, flags=re.IGNORECASE)
        # Strip leading connector words (may appear after name removal)
        title = re.sub(r'^(?:to\s+|for\s+|about\s+|the\s+|needs?\s+to\s+)', '', title, flags=re.IGNORECASE)
        title = title.strip(' :-.')
        if title:
            title = title[0].upper() + title[1:]
        return title if title else "New Task"


class TaskService:
    """Service for task management — sync SQLAlchemy, uses ORBIT models."""

    def __init__(self):
        self.entity_extractor = TaskEntityExtractor()

    def _normalize_task_types_once(self, db: Session):
        """One-time lowercase normalization for legacy task_type values."""
        global _task_type_normalization_done
        if _task_type_normalization_done:
            return
        from app.main import Task
        try:
            db.query(Task).filter(Task.task_type.isnot(None), Task.task_type != func.lower(Task.task_type)).update(
                {Task.task_type: func.lower(Task.task_type)},
                synchronize_session=False
            )
            db.commit()
        except Exception:
            db.rollback()
        _task_type_normalization_done = True

    def create_task(self, db: Session, creator_id, title, description=None,
                    task_type="general", priority="medium", assignee_id=None,
                    due_date=None, department=None,
                    linked_inventory_id=None, linked_transaction_id=None,
                    linked_customer_id=None, linked_project_id=None,
                    parent_task_id=None):
        """Create a task via direct API."""
        from app.main import Task, CompanyRep, create_notification

        task_type = (task_type or "general").lower()
        priority = (priority or "medium").lower()
        resolved_department = department or TASK_TYPE_DEPARTMENT.get(task_type)

        task = Task(
            title=title,
            description=description,
            task_type=task_type,
            department=resolved_department,
            priority=priority,
            status=DEFAULT_STATUS.get(task_type, "pending"),
            assignee_id=assignee_id,
            created_by=creator_id if isinstance(creator_id, uuid_lib.UUID) else uuid_lib.UUID(str(creator_id)),
            due_date=due_date,
            linked_inventory_id=uuid_lib.UUID(linked_inventory_id) if linked_inventory_id else None,
            linked_transaction_id=uuid_lib.UUID(linked_transaction_id) if linked_transaction_id else None,
            linked_customer_id=uuid_lib.UUID(linked_customer_id) if linked_customer_id else None,
            linked_project_id=uuid_lib.UUID(linked_project_id) if linked_project_id else None,
            parent_task_id=parent_task_id,
        )

        db.add(task)
        db.flush()

        # Log activity
        self._log_activity(db, task.id, task.created_by, "created", None, task.title)

        # Notify assignee
        if assignee_id:
            assignee = db.query(CompanyRep).filter(CompanyRep.id == assignee_id).first()
            creator = db.query(CompanyRep).filter(CompanyRep.id == task.created_by).first()
            if assignee:
                create_notification(
                    db, assignee.rep_id, "task_assigned",
                    f"New task: {title}",
                    f"Assigned by {creator.name if creator else 'System'}",
                    category="task", entity_type="task", entity_id=task.task_id,
                    data={"task_id": task.task_id}
                )

        db.commit()
        db.refresh(task)
        return task

    def create_task_from_text(self, db: Session, text: str, creator_id) -> "Task":
        """Create a task from voice/text command."""
        from app.main import Task, CompanyRep, Customer, Project, Inventory, create_notification

        # Resolve creator name for disambiguation context
        creator_uuid = creator_id if isinstance(creator_id, uuid_lib.UUID) else uuid_lib.UUID(str(creator_id))
        creator_rep = db.query(CompanyRep).filter(CompanyRep.id == creator_uuid).first()
        creator_name = creator_rep.name if creator_rep else None

        entities = self.entity_extractor.extract(text, creator_name=creator_name)

        # Find assignee
        assignee = None
        original_assignee_text = None
        pending_assignment = False

        if entities.get('assignee_name'):
            assignee = self._find_rep_by_name(db, entities['assignee_name'])
            if not assignee:
                original_assignee_text = entities['assignee_name']
        if not assignee and entities.get('assignee_role'):
            assignee = self._find_rep_by_role(db, entities['assignee_role'])
            if not assignee:
                original_assignee_text = original_assignee_text or entities['assignee_role']

        if original_assignee_text and not assignee:
            pending_assignment = True

        # Find CRM entities
        linked_inventory_id = None
        linked_project_id = None
        linked_customer_id = None

        if entities.get('unit_number') and entities.get('project'):
            inv = db.query(Inventory).join(Project).filter(
                Inventory.unit_number == entities['unit_number'],
                Project.name.ilike(f"%{entities['project']}%")
            ).first()
            if inv:
                linked_inventory_id = inv.id

        if entities.get('project'):
            proj = db.query(Project).filter(Project.name.ilike(f"%{entities['project']}%")).first()
            if proj:
                linked_project_id = proj.id

        if entities.get('customer_name'):
            cust = db.query(Customer).filter(Customer.name.ilike(f"%{entities['customer_name']}%")).first()
            if cust:
                linked_customer_id = cust.id

        task_type = (entities['task_type'] or "general").lower()
        department = TASK_TYPE_DEPARTMENT.get(task_type)

        task = Task(
            title=entities['task_title'],
            description=text,
            task_type=task_type,
            department=department,
            priority=entities['priority'],
            status=DEFAULT_STATUS.get(task_type, "pending"),
            assignee_id=assignee.id if assignee else None,
            created_by=creator_id if isinstance(creator_id, uuid_lib.UUID) else uuid_lib.UUID(str(creator_id)),
            due_date=entities.get('due_date'),
            linked_inventory_id=linked_inventory_id,
            linked_project_id=linked_project_id,
            linked_customer_id=linked_customer_id,
            pending_assignment=pending_assignment,
            original_assignee_text=original_assignee_text,
        )

        db.add(task)
        db.flush()

        self._log_activity(db, task.id, task.created_by, "created", None, task.title)

        if assignee:
            creator = db.query(CompanyRep).filter(CompanyRep.id == task.created_by).first()
            create_notification(
                db, assignee.rep_id, "task_assigned",
                f"New task: {task.title}",
                f"Assigned by {creator.name if creator else 'System'}",
                category="task", entity_type="task", entity_id=task.task_id,
                data={"task_id": task.task_id}
            )
        elif pending_assignment:
            # Notify admins
            admins = db.query(CompanyRep).filter(CompanyRep.role.in_(["admin", "cco"])).all()
            for admin in admins:
                create_notification(
                    db, admin.rep_id, "pending_assignment",
                    f"Pending task: {task.title}",
                    f"Needs assignment. Original: {original_assignee_text}",
                    category="task", entity_type="task", entity_id=task.task_id,
                    data={"task_id": task.task_id}
                )

        db.commit()
        db.refresh(task)
        logger.info(f"Created task {task.task_id}: {task.title} (pending={pending_assignment})")
        return task

    # Cross-functional visibility: rep_id can also see tasks from these rep_ids' chains
    # COO sees CCO's chain (sales team) in addition to own subordinates
    CROSS_VISIBILITY = {
        'REP-0003': ['REP-0008'],  # COO also sees CCO's chain (Waqar, etc.)
    }

    def _get_visible_user_ids(self, db, current_rep_id):
        """Get all user UUIDs whose tasks the current user can see (hierarchy walk).
        Returns set of UUIDs (all subordinates + self + cross-visibility).
        Returns None = see all tasks (CEO, system admin)."""
        from app.main import CompanyRep
        current = db.query(CompanyRep).filter(CompanyRep.rep_id == current_rep_id).first()
        if not current:
            return set()

        # Top-level admin with no reports_to → sees all (CEO, Malik)
        if current.role == 'admin' and not current.reports_to:
            return None

        # Build map of who reports to whom (rep_id → [CompanyRep])
        all_reps = db.query(CompanyRep).filter(CompanyRep.status == 'active').all()
        children_map = {}
        rep_by_id = {}
        for rep in all_reps:
            rep_by_id[rep.rep_id] = rep
            if rep.reports_to:
                children_map.setdefault(rep.reports_to, []).append(rep)

        def walk_down(start_rep_id, uuids):
            """Recursively collect all subordinate UUIDs."""
            for child in children_map.get(start_rep_id, []):
                uuids.add(child.id)
                walk_down(child.rep_id, uuids)

        # Start with self
        visible_uuids = {current.id}

        # Walk own subordinates
        walk_down(current.rep_id, visible_uuids)

        # Add cross-visibility chains
        for cross_rep_id in self.CROSS_VISIBILITY.get(current.rep_id, []):
            if cross_rep_id in rep_by_id:
                visible_uuids.add(rep_by_id[cross_rep_id].id)
                walk_down(cross_rep_id, visible_uuids)

        return visible_uuids

    def get_tasks(self, db: Session, user_id=None, role=None, status=None,
                  priority=None, department=None, task_type=None, search=None,
                  assignee_only=False, limit=50, offset=0, current_rep_id=None):
        """Get tasks with filters. Uses reporting hierarchy for visibility."""
        from app.main import Task
        self._normalize_task_types_once(db)
        query = db.query(Task).filter(Task.parent_task_id.is_(None))

        if user_id:
            user_uuid = user_id if isinstance(user_id, uuid_lib.UUID) else uuid_lib.UUID(str(user_id))
            if assignee_only:
                query = query.filter(Task.assignee_id == user_uuid)
            elif current_rep_id:
                visible = self._get_visible_user_ids(db, current_rep_id)
                if visible is not None:  # None means see all
                    collab_checks = [
                        Task.collaborator_ids.op('@>')(f'["{str(uid)}"]')
                        for uid in visible
                    ]
                    query = query.filter(
                        or_(
                            Task.assignee_id.in_(visible),
                            Task.created_by.in_(visible),
                            *collab_checks
                        )
                    )
            elif role in ("admin",):
                pass  # Fallback: admin sees all
            else:
                query = query.filter(
                    or_(
                        Task.assignee_id == user_uuid,
                        Task.created_by == user_uuid,
                        Task.collaborator_ids.op('@>')(f'["{str(user_uuid)}"]')
                    )
                )

        if status:
            query = query.filter(Task.status == status)
        if priority:
            query = query.filter(Task.priority == priority)
        if department:
            query = query.filter(Task.department == department)
        if task_type:
            query = query.filter(func.lower(Task.task_type) == task_type.lower())
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(Task.title.ilike(search_term), Task.task_id.ilike(search_term))
            )

        return query.order_by(Task.created_at.desc()).offset(offset).limit(limit).all()

    def get_my_tasks(self, db: Session, user_id):
        """Get tasks assigned to or collaborated by current user."""
        from app.main import Task
        self._normalize_task_types_once(db)
        user_uuid = user_id if isinstance(user_id, uuid_lib.UUID) else uuid_lib.UUID(str(user_id))
        return db.query(Task).filter(
            Task.parent_task_id.is_(None),
            or_(
                Task.assignee_id == user_uuid,
                Task.collaborator_ids.op('@>')(f'["{str(user_uuid)}"]')
            )
        ).order_by(Task.created_at.desc()).all()

    def update_task_status(self, db: Session, task_id, new_status: str, user_id,
                           completion_notes: Optional[str] = None):
        """Update task status with validation."""
        from app.main import Task, CompanyRep, create_notification

        task = self._find_task(db, task_id)
        if not task:
            raise ValueError("Task not found")

        valid_statuses = STATUS_CONFIG.get((task.task_type or "").lower(), STATUS_CONFIG["general"])
        if new_status not in valid_statuses:
            raise ValueError(f"Invalid status '{new_status}' for task type '{task.task_type}'. Valid: {', '.join(valid_statuses)}")

        old_status = task.status
        task.status = new_status

        if new_status in TERMINAL_STATUSES:
            task.completed_at = datetime.utcnow()
            if completion_notes:
                task.completion_notes = completion_notes

        task.updated_at = datetime.utcnow()
        user_uuid = user_id if isinstance(user_id, uuid_lib.UUID) else uuid_lib.UUID(str(user_id))
        self._log_activity(db, task.id, user_uuid, "status_changed", old_status, new_status)

        # Notify ALL stakeholders (creator, assignee, delegator) except the actor
        self._notify_task_stakeholders(
            db, task, user_uuid,
            f"Task updated: {task.title}",
            f"Status changed from {old_status} to {new_status}"
        )

        db.commit()
        return task

    def _notify_task_stakeholders(self, db, task, actor_uuid, title, message, notif_type="task_updated"):
        """Notify all task stakeholders (creator, assignee, delegator, collaborators) except the actor."""
        from app.main import CompanyRep, create_notification
        import uuid as uuid_mod

        notified = set()
        stakeholder_ids = [task.created_by, task.assignee_id]
        if hasattr(task, 'delegated_by') and task.delegated_by:
            stakeholder_ids.append(task.delegated_by)
        # Add collaborators
        for cid in (task.collaborator_ids or []):
            try:
                stakeholder_ids.append(uuid_mod.UUID(cid) if isinstance(cid, str) else cid)
            except (ValueError, AttributeError):
                pass

        for uid in stakeholder_ids:
            if uid and uid != actor_uuid and uid not in notified:
                notified.add(uid)
                rep = db.query(CompanyRep).filter(CompanyRep.id == uid).first()
                if rep:
                    create_notification(
                        db, rep.rep_id, notif_type, title, message,
                        category="task", entity_type="task", entity_id=task.task_id,
                        data={"task_id": task.task_id}
                    )

    def complete_task(self, db: Session, task_id, user_id, notes: Optional[str] = None):
        """Mark task as complete."""
        task = self._find_task(db, task_id)
        if not task:
            raise ValueError("Task not found")

        terminal = "completed"
        valid_statuses = STATUS_CONFIG.get((task.task_type or "").lower(), STATUS_CONFIG["general"])
        for s in TERMINAL_STATUSES:
            if s in valid_statuses:
                terminal = s
                break

        return self.update_task_status(db, task_id, terminal, user_id, notes)

    def delegate_task(self, db: Session, task_id, new_assignee_id, delegator_id):
        """Delegate task to a new assignee."""
        from app.main import Task, CompanyRep, create_notification

        task = self._find_task(db, task_id)
        if not task:
            raise ValueError("Task not found")

        delegator_uuid = delegator_id if isinstance(delegator_id, uuid_lib.UUID) else uuid_lib.UUID(str(delegator_id))
        new_assignee_uuid = new_assignee_id if isinstance(new_assignee_id, uuid_lib.UUID) else uuid_lib.UUID(str(new_assignee_id))

        old_assignee_id = task.assignee_id
        task.assignee_id = new_assignee_uuid
        task.delegated_by = delegator_uuid
        task.pending_assignment = False
        task.original_assignee_text = None
        task.updated_at = datetime.utcnow()

        self._log_activity(db, task.id, delegator_uuid, "delegated",
                           str(old_assignee_id) if old_assignee_id else "Unassigned",
                           str(new_assignee_uuid))

        new_assignee = db.query(CompanyRep).filter(CompanyRep.id == new_assignee_uuid).first()
        assignee_name = new_assignee.name if new_assignee else "Unknown"

        # Notify all stakeholders (including new assignee, old assignee, creator)
        self._notify_task_stakeholders(
            db, task, delegator_uuid,
            f"Task delegated: {task.title}",
            f"Task has been assigned to {assignee_name}"
        )

        db.commit()
        return task

    def add_comment(self, db: Session, task_id, author_id, content: str):
        """Add comment to task."""
        from app.main import TaskComment, Task, CompanyRep, create_notification

        task = self._find_task(db, task_id)
        if not task:
            raise ValueError("Task not found")

        author_uuid = author_id if isinstance(author_id, uuid_lib.UUID) else uuid_lib.UUID(str(author_id))
        comment = TaskComment(
            task_id=task.id,
            author_id=author_uuid,
            content=content,
        )
        db.add(comment)

        self._log_activity(db, task.id, author_uuid, "commented", None, content[:100])

        # Notify ALL stakeholders (creator, assignee, collaborators, delegator) except commenter
        author = db.query(CompanyRep).filter(CompanyRep.id == author_uuid).first()
        self._notify_task_stakeholders(
            db, task, author_uuid,
            f"Comment on: {task.title}",
            f"{author.name if author else 'Someone'}: {content[:80]}",
            notif_type="task_commented"
        )

        db.commit()
        db.refresh(comment)
        return comment

    def get_comments(self, db: Session, task_id, limit=50):
        """Get comments for a task."""
        from app.main import TaskComment
        task = self._find_task(db, task_id)
        if not task:
            raise ValueError("Task not found")
        return db.query(TaskComment).filter(TaskComment.task_id == task.id)\
            .order_by(TaskComment.created_at.desc()).limit(limit).all()

    def get_activities(self, db: Session, task_id, limit=50):
        """Get activity log for a task."""
        from app.main import TaskActivity
        task = self._find_task(db, task_id)
        if not task:
            raise ValueError("Task not found")
        return db.query(TaskActivity).filter(TaskActivity.task_id == task.id)\
            .order_by(TaskActivity.created_at.desc()).limit(limit).all()

    def get_task_summary(self, db: Session, user_id=None, role=None, current_rep_id=None):
        """Get task dashboard summary (flat structure for frontend)."""
        from app.main import Task
        self._normalize_task_types_once(db)

        query = db.query(Task).filter(Task.parent_task_id.is_(None))

        # Hierarchy-based filtering
        if current_rep_id:
            visible = self._get_visible_user_ids(db, current_rep_id)
            if visible is not None:
                collab_checks = [
                    Task.collaborator_ids.op('@>')(f'["{str(uid)}"]')
                    for uid in visible
                ]
                query = query.filter(
                    or_(Task.assignee_id.in_(visible), Task.created_by.in_(visible), *collab_checks)
                )
        elif user_id and role not in ("admin",):
            user_uuid = user_id if isinstance(user_id, uuid_lib.UUID) else uuid_lib.UUID(str(user_id))
            query = query.filter(or_(
                Task.assignee_id == user_uuid,
                Task.created_by == user_uuid,
                Task.collaborator_ids.op('@>')(f'["{str(user_uuid)}"]')
            ))

        all_tasks = query.all()
        today = date.today()

        by_department = {}
        by_type = {}
        by_status = {}
        by_priority = {}
        for t in all_tasks:
            dept = t.department or "Unassigned"
            by_department[dept] = by_department.get(dept, 0) + 1
            by_type[t.task_type] = by_type.get(t.task_type, 0) + 1
            by_status[t.status] = by_status.get(t.status, 0) + 1
            prio = t.priority or "medium"
            by_priority[prio] = by_priority.get(prio, 0) + 1

        return {
            "total": len(all_tasks),
            "completed": sum(1 for t in all_tasks if t.status in TERMINAL_STATUSES),
            "in_progress": sum(1 for t in all_tasks if t.status == "in_progress"),
            "pending_assignment": sum(1 for t in all_tasks if t.pending_assignment),
            "overdue": sum(1 for t in all_tasks if t.due_date and t.due_date < today and t.status not in TERMINAL_STATUSES),
            "due_today": sum(1 for t in all_tasks if t.due_date and t.due_date == today and t.status not in TERMINAL_STATUSES),
            "by_department": by_department,
            "by_type": by_type,
            "by_status": by_status,
            "by_priority": by_priority,
        }

    def get_executive_summary(self, db: Session, current_rep_id: str):
        """Build an organized executive summary grouped by direct reports.
        CEO sees entire org. CFO sees own chain. Each person grouped with their tasks."""
        from app.main import CompanyRep, Task, TaskActivity
        self._normalize_task_types_once(db)

        current = db.query(CompanyRep).filter(CompanyRep.rep_id == current_rep_id).first()
        if not current:
            return {"error": "User not found"}

        all_reps = db.query(CompanyRep).filter(CompanyRep.status == 'active').all()
        rep_by_id = {r.rep_id: r for r in all_reps}
        rep_by_uuid = {r.id: r for r in all_reps}
        children_map = {}
        for r in all_reps:
            if r.reports_to:
                children_map.setdefault(r.reports_to, []).append(r)

        def walk_down_reps(start_rep_id):
            result = []
            for child in children_map.get(start_rep_id, []):
                result.append(child)
                result.extend(walk_down_reps(child.rep_id))
            return result

        # Determine if this is a top-level exec (sees all)
        sees_all = current.role == 'admin' and not current.reports_to

        # Get direct reports for the current user
        direct_reports = children_map.get(current.rep_id, [])

        # For cross-visibility, include those chains as virtual direct reports
        for cross_id in self.CROSS_VISIBILITY.get(current.rep_id, []):
            if cross_id in rep_by_id and rep_by_id[cross_id] not in direct_reports:
                direct_reports.append(rep_by_id[cross_id])

        # If CEO/admin sees all but has no direct reports in DB, use all top-level C-suite
        if sees_all and not direct_reports:
            direct_reports = [r for r in all_reps if r.reports_to == current.rep_id or
                              (r.id != current.id and not r.reports_to and r.role == 'admin')]
            # Also add anyone who reports to CEO
            for r in all_reps:
                if r.reports_to == current.rep_id and r not in direct_reports:
                    direct_reports.append(r)

        # Load all tasks (visible scope)
        all_tasks = db.query(Task).all() if sees_all else None
        if not sees_all:
            visible = self._get_visible_user_ids(db, current_rep_id)
            if visible is None:
                all_tasks = db.query(Task).all()
            else:
                all_tasks = db.query(Task).filter(
                    or_(Task.assignee_id.in_(visible), Task.created_by.in_(visible))
                ).all()

        # Load recent activities (last 48 hours)
        from datetime import datetime, timedelta
        cutoff = datetime.utcnow() - timedelta(hours=48)
        recent_activities = db.query(TaskActivity).filter(
            TaskActivity.created_at >= cutoff
        ).order_by(TaskActivity.created_at.desc()).all()

        # Build activity lookup: task_uuid → [activities]
        activity_by_task = {}
        for a in recent_activities:
            activity_by_task.setdefault(a.task_id, []).append(a)

        # Task lookup by uuid
        task_by_uuid = {t.id: t for t in all_tasks}
        today = date.today()

        def rep_dict(r):
            return {"rep_id": r.rep_id, "name": r.name, "title": r.title or r.role, "id": str(r.id)}

        def task_dict(t):
            assignee = rep_by_uuid.get(t.assignee_id)
            creator = rep_by_uuid.get(t.created_by)
            return {
                "id": str(t.id), "task_id": t.task_id, "title": t.title,
                "status": t.status, "priority": t.priority or "medium",
                "due_date": str(t.due_date) if t.due_date else None,
                "assignee_name": assignee.name if assignee else "Unassigned",
                "creator_name": creator.name if creator else "N/A",
                "overdue": bool(t.due_date and t.due_date < today and t.status not in TERMINAL_STATUSES),
                "created_at": str(t.created_at) if t.created_at else None,
            }

        def activity_dict(a):
            actor = rep_by_uuid.get(a.actor_id)
            t = task_by_uuid.get(a.task_id)
            return {
                "action": a.action, "actor_name": actor.name if actor else "System",
                "task_title": t.title if t else "Unknown",
                "task_id": t.task_id if t else None,
                "old_value": a.old_value, "new_value": a.new_value,
                "created_at": str(a.created_at) if a.created_at else None,
            }

        # Build report for each direct report
        def build_person_report(person):
            """Build summary for one person + their entire subordinate chain."""
            chain_uuids = {person.id}
            for sub in walk_down_reps(person.rep_id):
                chain_uuids.add(sub.id)

            # Tasks assigned BY this person (they created)
            assigned_by = [t for t in all_tasks if t.created_by == person.id and t.assignee_id != person.id]
            # Tasks assigned TO this person
            assigned_to = [t for t in all_tasks if t.assignee_id == person.id]
            # All tasks in this person's chain
            chain_tasks = [t for t in all_tasks if t.assignee_id in chain_uuids or t.created_by in chain_uuids]
            # Recent updates in chain
            chain_activities = []
            for t in chain_tasks:
                chain_activities.extend(activity_by_task.get(t.id, []))
            chain_activities.sort(key=lambda a: a.created_at or datetime.min, reverse=True)

            # Stats
            active_chain = [t for t in chain_tasks if t.status not in TERMINAL_STATUSES]
            return {
                "person": rep_dict(person),
                "subordinates": [rep_dict(s) for s in children_map.get(person.rep_id, [])],
                "assigned_by_them": [task_dict(t) for t in assigned_by[:15]],
                "assigned_to_them": [task_dict(t) for t in assigned_to[:15]],
                "recent_updates": [activity_dict(a) for a in chain_activities[:20]],
                "stats": {
                    "total": len(chain_tasks),
                    "active": len(active_chain),
                    "completed": sum(1 for t in chain_tasks if t.status in TERMINAL_STATUSES),
                    "in_progress": sum(1 for t in chain_tasks if t.status == "in_progress"),
                    "overdue": sum(1 for t in chain_tasks if t.due_date and t.due_date < today and t.status not in TERMINAL_STATUSES),
                    "pending": sum(1 for t in chain_tasks if t.status == "pending"),
                },
            }

        # Your own tasks
        my_assigned_to = [t for t in all_tasks if t.assignee_id == current.id]
        my_created = [t for t in all_tasks if t.created_by == current.id and t.assignee_id != current.id]

        # Org-wide stats
        active_all = [t for t in all_tasks if t.status not in TERMINAL_STATUSES]

        return {
            "user": rep_dict(current),
            "generated_at": str(datetime.utcnow()),
            "your_tasks": {
                "assigned_to_you": [task_dict(t) for t in my_assigned_to[:15]],
                "created_by_you": [task_dict(t) for t in my_created[:20]],
            },
            "direct_reports": [build_person_report(dr) for dr in direct_reports],
            "org_stats": {
                "total": len(all_tasks),
                "active": len(active_all),
                "completed": sum(1 for t in all_tasks if t.status in TERMINAL_STATUSES),
                "overdue": sum(1 for t in all_tasks if t.due_date and t.due_date < today and t.status not in TERMINAL_STATUSES),
                "due_today": sum(1 for t in all_tasks if t.due_date and t.due_date == today and t.status not in TERMINAL_STATUSES),
            },
        }

    def get_valid_statuses(self, task_type: str) -> List[str]:
        return STATUS_CONFIG.get(task_type, STATUS_CONFIG["general"])

    def get_departments_config(self) -> Dict[str, Any]:
        return {
            "departments": list(DEPARTMENT_TASK_TYPES.keys()),
            "department_task_types": DEPARTMENT_TASK_TYPES,
            "task_type_department": TASK_TYPE_DEPARTMENT,
            "status_config": STATUS_CONFIG,
        }

    # ============== Daily Report Generation ==============

    def generate_daily_reports(self, db: Session, target_rep_id: str = None) -> List[Dict[str, Any]]:
        """Generate daily task summary HTML reports.
        If target_rep_id: single user. Otherwise: all active users with assigned tasks.
        Returns list of dicts: [{rep_id, name, file_path, task_count}]
        """
        from app.main import CompanyRep, Task, TaskActivity, MediaFile, create_notification, MEDIA_ROOT

        today = date.today()
        seven_days_ago = today - timedelta(days=7)
        tomorrow = today + timedelta(days=1)

        # 1. Query active reps
        if target_rep_id:
            reps = db.query(CompanyRep).filter(
                CompanyRep.rep_id == target_rep_id,
                CompanyRep.status == 'active'
            ).all()
        else:
            reps = db.query(CompanyRep).filter(CompanyRep.status == 'active').all()

        # Build a name cache for actor lookups
        all_reps = db.query(CompanyRep).filter(CompanyRep.status == 'active').all()
        rep_name_cache = {r.id: r.name for r in all_reps}

        results = []

        for rep in reps:
            # 2. Find all tasks assigned to this rep OR where they are a collaborator
            tasks = db.query(Task).filter(
                or_(
                    Task.assignee_id == rep.id,
                    Task.collaborator_ids.op('@>')(f'["{str(rep.id)}"]')
                )
            ).all()

            if not tasks:
                continue

            # 3. Query TaskActivity for those tasks (last 7 days)
            task_ids = [t.id for t in tasks]
            activities = db.query(TaskActivity).filter(
                TaskActivity.task_id.in_(task_ids),
                TaskActivity.created_at >= datetime.combine(seven_days_ago, datetime.min.time())
            ).order_by(TaskActivity.created_at.desc()).all()

            # Group activities by task
            activities_by_task: Dict[Any, list] = {}
            for act in activities:
                activities_by_task.setdefault(act.task_id, []).append(act)

            # 4. Build HTML report
            html_content = self._build_report_html(
                rep_name=rep.name,
                rep_title=rep.title or rep.role or "",
                rep_id=rep.rep_id,
                report_date=today,
                tomorrow_date=tomorrow,
                tasks=tasks,
                activities_by_task=activities_by_task,
                today=today,
                seven_days_ago=seven_days_ago,
                rep_name_cache=rep_name_cache,
            )

            # 5. Save HTML file to disk
            report_dir = MEDIA_ROOT / "reports" / "daily" / today.isoformat()
            report_dir.mkdir(parents=True, exist_ok=True)
            file_path = report_dir / f"{rep.rep_id}_{today.isoformat()}.html"
            file_path.write_text(html_content, encoding='utf-8')

            # 6. Create MediaFile record
            try:
                file_id_result = db.execute(text("SELECT nextval('media_file_id_seq')")).scalar()
                file_id = f"RPT-{str(file_id_result).zfill(5)}"
            except Exception:
                file_id_result = db.execute(text("SELECT COUNT(*) + 1 FROM media_files")).scalar()
                file_id = f"RPT-{str(file_id_result).zfill(5)}"

            media = MediaFile(
                file_id=file_id,
                entity_type="report",
                entity_id=rep.id,
                file_name=f"Daily_Task_Summary_{rep.rep_id}_{today.isoformat()}.html",
                file_path=str(file_path.resolve()),
                file_type="document",
                file_size=len(html_content.encode('utf-8')),
                uploaded_by_rep_id=None,
                description=f"Daily task summary for {rep.name} - {today.isoformat()}"
            )
            db.add(media)

            # 7. Create notification for the rep
            create_notification(
                db, rep.rep_id, "task_report",
                "Daily Task Summary Ready",
                f"Your task report for {today.strftime('%b %d, %Y')} is available",
                category="task", entity_type="report", entity_id=str(media.id)
            )

            results.append({
                "rep_id": rep.rep_id,
                "name": rep.name,
                "file_path": str(file_path.resolve()),
                "task_count": len(tasks),
            })

        db.commit()
        return results

    # ============== CEO Organizational Overview Report ==============

    def generate_org_report(self, db: Session):
        """Generate organizational bird's-eye view report for CEO.
        Returns dict with {rep_id, name, file_path, task_count} or None.
        """
        from app.main import CompanyRep, Task, TaskActivity, MediaFile, create_notification, MEDIA_ROOT

        today = date.today()
        tomorrow = today + timedelta(days=1)

        # 1. Find CEO: admin with no reports_to, title containing 'CEO'
        top_admins = db.query(CompanyRep).filter(
            CompanyRep.status == 'active',
            CompanyRep.role == 'admin',
            CompanyRep.reports_to.is_(None)
        ).all()

        if not top_admins:
            logger.warning("generate_org_report: no top-level admin found")
            return None

        ceo = None
        for rep in top_admins:
            if rep.title and 'ceo' in rep.title.lower():
                ceo = rep
                break
        if ceo is None:
            ceo = top_admins[0]

        # 2. Load all tasks
        all_tasks = db.query(Task).all()
        if not all_tasks:
            logger.info("generate_org_report: no tasks in system")
            return None

        # 3. Load all active reps
        all_reps = db.query(CompanyRep).filter(CompanyRep.status == 'active').all()
        rep_name_cache = {r.id: r.name for r in all_reps}
        rep_obj_cache = {r.id: r for r in all_reps}

        # 4. Build task lookup by id for activity cross-ref
        task_by_id = {t.id: t for t in all_tasks}

        # 5. Group tasks by department
        departments_order = ["Sales", "Recovery", "Finance", "Operations", "Unassigned"]
        dept_tasks = {d: [] for d in departments_order}
        for t in all_tasks:
            dept = t.department if t.department in dept_tasks else "Unassigned"
            dept_tasks[dept].append(t)

        # 6. For each department, compute stats
        dept_data = []
        for dept_name in departments_order:
            tasks_in_dept = dept_tasks[dept_name]
            if not tasks_in_dept:
                continue  # skip empty departments

            active_tasks = [t for t in tasks_in_dept if t.status not in TERMINAL_STATUSES]
            active_count = len(active_tasks)
            overdue_tasks = [t for t in active_tasks if t.due_date and t.due_date < today]
            overdue_count = len(overdue_tasks)
            completed_today_list = [
                t for t in tasks_in_dept
                if t.status in TERMINAL_STATUSES
                and t.completed_at
                and t.completed_at.date() == today
            ]
            completed_today_count = len(completed_today_list)

            # Attention items: overdue sorted by days overdue DESC, then urgent active (limit 8 total)
            attention_items = []
            for t in sorted(overdue_tasks, key=lambda x: (today - x.due_date).days, reverse=True):
                attention_items.append(t)
            urgent_active = [
                t for t in active_tasks
                if (t.priority or "").lower() == "urgent"
                and t not in overdue_tasks
            ]
            for t in urgent_active:
                attention_items.append(t)
            attention_items = attention_items[:8]

            # Team members: unique assignees in this dept
            assignee_ids = set()
            for t in tasks_in_dept:
                if t.assignee_id:
                    assignee_ids.add(t.assignee_id)

            members = []
            for aid in assignee_ids:
                rep_obj = rep_obj_cache.get(aid)
                if not rep_obj:
                    continue
                member_tasks = [t for t in tasks_in_dept if t.assignee_id == aid]
                member_active = [t for t in member_tasks if t.status not in TERMINAL_STATUSES]
                member_overdue = [t for t in member_active if t.due_date and t.due_date < today]
                member_completed = [
                    t for t in member_tasks
                    if t.status in TERMINAL_STATUSES
                    and t.completed_at
                    and t.completed_at.date() == today
                ]
                members.append({
                    "name": rep_obj.name,
                    "title": rep_obj.title or rep_obj.role or "",
                    "assigned": len(member_tasks),
                    "active": len(member_active),
                    "overdue": len(member_overdue),
                    "completed": len(member_completed),
                })
            # Sort members by overdue DESC, then active DESC
            members.sort(key=lambda m: (-m["overdue"], -m["active"]))

            dept_data.append({
                "name": dept_name,
                "active_count": active_count,
                "overdue_count": overdue_count,
                "completed_today_count": completed_today_count,
                "total_count": len(tasks_in_dept),
                "attention_items": attention_items,
                "members": members,
            })

        # 7. Org-wide stats
        all_active = [t for t in all_tasks if t.status not in TERMINAL_STATUSES]
        org_stats = {
            "total_active": len(all_active),
            "overdue": sum(1 for t in all_active if t.due_date and t.due_date < today),
            "completed_today": sum(
                1 for t in all_tasks
                if t.status in TERMINAL_STATUSES
                and t.completed_at
                and t.completed_at.date() == today
            ),
            "due_today": sum(
                1 for t in all_active if t.due_date and t.due_date == today
            ),
        }

        # 8. Recent activities (last 24 hours)
        cutoff_24h = datetime.combine(today, datetime.min.time()) - timedelta(hours=24)
        recent_activities = db.query(TaskActivity).filter(
            TaskActivity.created_at >= cutoff_24h
        ).order_by(TaskActivity.created_at.desc()).limit(50).all()

        # 9. Build HTML
        html_content = self._build_org_report_html(
            ceo_name=ceo.name,
            ceo_title=ceo.title or "CEO",
            ceo_rep_id=ceo.rep_id,
            report_date=today,
            org_stats=org_stats,
            dept_data=dept_data,
            recent_activities=recent_activities,
            rep_name_cache=rep_name_cache,
            task_by_id=task_by_id,
        )

        # 10. Save HTML file to disk
        report_dir = MEDIA_ROOT / "reports" / "daily" / today.isoformat()
        report_dir.mkdir(parents=True, exist_ok=True)
        file_path = report_dir / f"ORG_{today.isoformat()}.html"
        file_path.write_text(html_content, encoding='utf-8')

        # 11. Create MediaFile record
        try:
            file_id_result = db.execute(text("SELECT nextval('media_file_id_seq')")).scalar()
            file_id = f"RPT-{str(file_id_result).zfill(5)}"
        except Exception:
            file_id_result = db.execute(text("SELECT COUNT(*) + 1 FROM media_files")).scalar()
            file_id = f"RPT-{str(file_id_result).zfill(5)}"

        media = MediaFile(
            file_id=file_id,
            entity_type="report",
            entity_id=ceo.id,
            file_name=f"Org_Task_Overview_{today.isoformat()}.html",
            file_path=str(file_path.resolve()),
            file_type="document",
            file_size=len(html_content.encode('utf-8')),
            uploaded_by_rep_id=None,
            description=f"Organizational task overview for {ceo.name} - {today.isoformat()}"
        )
        db.add(media)

        # 12. Create notification for CEO
        create_notification(
            db, ceo.rep_id, "task_report",
            "Organizational Task Overview Ready",
            f"Your org-wide task report for {today.strftime('%b %d, %Y')} is available",
            category="task", entity_type="org_report", entity_id=str(media.id)
        )

        db.commit()

        logger.info(f"generate_org_report: report generated for {ceo.name} ({ceo.rep_id}), {len(all_tasks)} tasks")

        return {
            "rep_id": ceo.rep_id,
            "name": ceo.name,
            "file_path": str(file_path.resolve()),
            "task_count": len(all_tasks),
        }

    def _build_org_report_html(self, ceo_name: str, ceo_title: str, ceo_rep_id: str,
                                report_date: date, org_stats: Dict,
                                dept_data: list, recent_activities: list,
                                rep_name_cache: Dict, task_by_id: Dict) -> str:
        """Build the full organizational overview HTML report."""
        esc = html_mod.escape
        today = report_date
        tomorrow = today + timedelta(days=1)

        # Format date strings
        date_str = report_date.strftime("%A, %B %d, %Y")
        tomorrow_str = tomorrow.strftime("%A, %B %d, %Y")

        # --- Extra CSS for org report ---
        org_extra_css = """
  /* ===== ORG REPORT ADDITIONS ===== */
  .dept-section { margin-bottom: 32px; }
  .dept-header-bar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 20px; background: var(--navy-50); border: 1px solid var(--navy-100);
    border-radius: var(--radius-md); margin-bottom: 16px;
  }
  .dept-header-bar .dept-name {
    font-family: 'Playfair Display', serif; font-size: 1.1rem; font-weight: 600; color: var(--navy-800);
  }
  .dept-header-bar .dept-stats { display: flex; gap: 8px; }
  .dept-stat-pill {
    padding: 3px 10px; border-radius: 20px; font-size: 0.65rem; font-weight: 600; letter-spacing: 0.3px;
  }
  .dept-stat-pill.active { background: var(--blue-100); color: var(--blue-600); }
  .dept-stat-pill.overdue { background: var(--red-100); color: var(--red-600); }
  .dept-stat-pill.total { background: var(--navy-50); color: var(--navy-500); border: 1px solid var(--navy-200); }
  .workload-table td.overdue-cell { color: var(--red-600); font-weight: 600; }
  .activity-feed { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 20px; }
  .activity-row { padding: 10px 0; border-bottom: 1px solid var(--border-light); display: flex; align-items: baseline; gap: 10px; font-size: 0.8rem; }
  .activity-row:last-child { border-bottom: none; }
  .activity-row .act-time { font-size: 0.65rem; color: var(--text-tertiary); flex-shrink: 0; min-width: 130px; }
  .activity-row .act-text { color: var(--text-secondary); }
  .activity-row .act-text strong { color: var(--navy-700); }
"""

        # --- Build per-department sections ---
        dept_sections_parts = []
        for dept in dept_data:
            dept_name = esc(dept["name"])
            total_count = dept["total_count"]
            active_count = dept["active_count"]
            overdue_count = dept["overdue_count"]

            # Overdue pill (only if > 0)
            overdue_pill = ""
            if overdue_count > 0:
                overdue_pill = f'<span class="dept-stat-pill overdue">{overdue_count} Overdue</span>'

            # Attention cards
            attention_html = ""
            if dept["attention_items"]:
                attention_parts = []
                for t in dept["attention_items"]:
                    if t.due_date and t.due_date < today and t.status not in TERMINAL_STATUSES:
                        days_overdue = (today - t.due_date).days
                        attention_parts.append(
                            self._build_attention_card(t, "overdue", days_overdue, today, esc)
                        )
                    elif (t.priority or "").lower() == "urgent":
                        attention_parts.append(
                            self._build_attention_card(t, "today", 0, today, esc)
                        )
                    else:
                        attention_parts.append(
                            self._build_attention_card(t, "today", 0, today, esc)
                        )
                attention_html = f'<div style="margin-bottom: 16px;">{"".join(attention_parts)}</div>'

            # Team member table
            members_html = ""
            if dept["members"]:
                member_rows = []
                for m in dept["members"]:
                    overdue_style = ' style="color:var(--red-600); font-weight:600"' if m["overdue"] > 0 else ''
                    member_rows.append(
                        f'<tr>'
                        f'<td style="font-weight:500; color:var(--navy-800)">{esc(m["name"])}</td>'
                        f'<td class="dept-cell">{esc(m["title"])}</td>'
                        f'<td>{m["assigned"]}</td>'
                        f'<td>{m["active"]}</td>'
                        f'<td{overdue_style}>{m["overdue"]}</td>'
                        f'<td>{m["completed"]}</td>'
                        f'</tr>'
                    )
                members_html = f"""<div class="table-wrapper" style="margin-bottom: 8px;">
    <table class="data-table">
      <thead>
        <tr><th>Team Member</th><th>Title</th><th>Assigned</th><th>Active</th><th>Overdue</th><th>Completed</th></tr>
      </thead>
      <tbody>
        {"".join(member_rows)}
      </tbody>
    </table>
  </div>"""

            dept_sections_parts.append(f"""<div class="section dept-section animate-section">
  <div class="dept-header-bar">
    <div class="dept-name">{dept_name}</div>
    <div class="dept-stats">
      <span class="dept-stat-pill total">{total_count} Total</span>
      <span class="dept-stat-pill active">{active_count} Active</span>
      {overdue_pill}
    </div>
  </div>
  {attention_html}
  {members_html}
</div>""")

        dept_sections_html = "\n".join(dept_sections_parts)

        # --- Build activity feed rows ---
        activity_rows_parts = []
        if recent_activities:
            for act in recent_activities:
                actor_name = rep_name_cache.get(act.actor_id, "System")
                action_raw = (act.action or "unknown").lower()
                action_display = action_raw.replace("_", " ").capitalize()

                # Look up task title
                task_obj = task_by_id.get(act.task_id)
                task_title = task_obj.title if task_obj else "Unknown Task"

                # Format timestamp (cross-platform safe: no %-I)
                if act.created_at:
                    raw_time = act.created_at.strftime("%I:%M %p").lstrip("0")
                    timestamp_str = f'{act.created_at.strftime("%b %d")} {raw_time}'
                else:
                    timestamp_str = ""

                activity_rows_parts.append(
                    f'<div class="activity-row">'
                    f'<span class="act-time">{esc(timestamp_str)}</span>'
                    f'<span class="act-text"><strong>{esc(actor_name)}</strong> {esc(action_display)}'
                    f' on <strong>{esc(task_title)}</strong></span>'
                    f'</div>'
                )
        else:
            activity_rows_parts.append(
                '<div class="activity-row">'
                '<span class="act-text" style="color: var(--text-tertiary);">No activity recorded in the last 24 hours.</span>'
                '</div>'
            )

        activity_rows_html = "\n      ".join(activity_rows_parts)

        # --- Assemble full HTML ---
        return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Organizational Task Overview &mdash; SBL Orbit</title>
{REPORT_GOOGLE_FONTS}
<style>
{REPORT_CSS}
/* Org report additions */
{org_extra_css}
</style>
</head>
<body>

<div class="page-wrapper">

  <header class="report-header animate-header">
    <div class="header-left">
      <div class="brand">
        <div class="brand-icon">O</div>
        <div><div class="brand-text">SBL Orbit</div></div>
      </div>
      <h1 class="report-title">Organizational Task Overview</h1>
      <div class="report-date">{esc(date_str)}</div>
    </div>
    <div class="header-right">
      <div class="recipient-label">Prepared for</div>
      <div class="recipient-name">{esc(ceo_name)}</div>
      <div class="recipient-role">{esc(ceo_title)}</div>
      <div class="rep-id-badge">{esc(ceo_rep_id)}</div>
    </div>
  </header>

  <div class="summary-grid animate-cards">
    <div class="summary-card card-total stagger-1">
      <div class="card-label">Active Tasks</div>
      <div class="card-value">{org_stats['total_active']}</div>
      <div class="card-context">Across all departments</div>
    </div>
    <div class="summary-card card-due stagger-2">
      <div class="card-label">Due Today</div>
      <div class="card-value">{org_stats['due_today']}</div>
      <div class="card-context">Require action today</div>
    </div>
    <div class="summary-card card-overdue stagger-3">
      <div class="card-label">Overdue</div>
      <div class="card-value">{org_stats['overdue']}</div>
      <div class="card-context">Past deadline</div>
    </div>
    <div class="summary-card card-completed stagger-4">
      <div class="card-label">Completed Today</div>
      <div class="card-value">{org_stats['completed_today']}</div>
      <div class="card-context">Resolved today</div>
    </div>
  </div>

  {dept_sections_html}

  <div class="section animate-section">
    <div class="section-header">
      <div class="section-icon violet">{SVG_TIMELINE}</div>
      <div>
        <div class="section-title">Recent Organization Activity</div>
        <div class="section-subtitle">Updates across all departments in the last 24 hours</div>
      </div>
      <div class="section-line"></div>
    </div>
    <div class="activity-feed">
      {activity_rows_html}
    </div>
  </div>

  <footer class="report-footer animate-section">
    <div class="footer-left">
      <div class="footer-brand">Generated automatically by SBL Orbit Task Engine</div>
      <div class="footer-meta">
        Report period: Last 24 hours<br>
        Next scheduled report: {esc(tomorrow_str)} at 5:30 PM
      </div>
    </div>
    <div class="footer-right">
      <div class="footer-confidential">Internal &middot; Confidential</div>
      <div class="footer-page">SBL Orbit v3</div>
    </div>
  </footer>

</div>

</body>
</html>"""

    def _build_report_html(self, rep_name: str, rep_title: str, rep_id: str,
                           report_date: date, tomorrow_date: date,
                           tasks: list, activities_by_task: Dict,
                           today: date, seven_days_ago: date,
                           rep_name_cache: Dict) -> str:
        """Build the full HTML report string for one user."""
        esc = html_mod.escape

        # --- Compute summary stats ---
        active_tasks = [t for t in tasks if t.status not in TERMINAL_STATUSES]
        total_active = len(active_tasks)
        due_today_tasks = [t for t in active_tasks if t.due_date and t.due_date == today]
        due_today_count = len(due_today_tasks)
        overdue_tasks = [t for t in active_tasks if t.due_date and t.due_date < today]
        overdue_count = len(overdue_tasks)
        completed_7d = len([
            t for t in tasks
            if t.status in TERMINAL_STATUSES
            and t.completed_at
            and t.completed_at.date() >= seven_days_ago
        ])

        # --- Format date string ---
        date_str = report_date.strftime("%A, %B %d, %Y")  # e.g. "Tuesday, February 18, 2026"
        tomorrow_str = tomorrow_date.strftime("%A, %B %d, %Y")

        # --- Build attention items ---
        attention_items = []
        # Overdue first, sorted by days overdue DESC
        for t in sorted(overdue_tasks, key=lambda x: (today - x.due_date).days, reverse=True):
            days = (today - t.due_date).days
            attention_items.append(self._build_attention_card(t, "overdue", days, today, esc))
        # Due today
        for t in due_today_tasks:
            attention_items.append(self._build_attention_card(t, "today", 0, today, esc))

        attention_html = "\n".join(attention_items) if attention_items else '<p style="color: var(--text-tertiary); font-size: 0.85rem;">No overdue or due-today tasks. You\'re on track.</p>'

        # --- Build task table rows ---
        # Sort: overdue first, then due-today, then by due_date ASC, then created_at DESC
        def task_sort_key(t):
            is_overdue = 0 if (t.due_date and t.due_date < today and t.status not in TERMINAL_STATUSES) else 1
            is_due_today = 0 if (t.due_date and t.due_date == today and t.status not in TERMINAL_STATUSES) else 1
            due = t.due_date if t.due_date else date.max
            created = t.created_at if t.created_at else datetime.min
            return (is_overdue, is_due_today, due, -created.timestamp() if isinstance(created, datetime) else 0)

        sorted_tasks = sorted(tasks, key=task_sort_key)
        table_rows = "\n".join(self._build_table_row(t, today, esc) for t in sorted_tasks)

        # --- Build activity timeline ---
        # Only tasks with activities in last 7 days
        timeline_blocks = []
        for t in sorted_tasks:
            task_activities = activities_by_task.get(t.id, [])
            if not task_activities:
                continue
            timeline_blocks.append(
                self._build_timeline_block(t, task_activities, rep_name_cache, esc)
            )
        timeline_html = "\n".join(timeline_blocks) if timeline_blocks else '<p style="color: var(--text-tertiary); font-size: 0.85rem;">No activity recorded in the last 7 days.</p>'

        # --- Assemble full HTML ---
        return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Daily Task Summary &mdash; SBL Orbit</title>
{REPORT_GOOGLE_FONTS}
<style>
{REPORT_CSS}
</style>
</head>
<body>

<div class="page-wrapper">

  <header class="report-header animate-header">
    <div class="header-left">
      <div class="brand">
        <div class="brand-icon">O</div>
        <div>
          <div class="brand-text">SBL Orbit</div>
          <div class="brand-sub"></div>
        </div>
      </div>
      <h1 class="report-title">Daily Task Summary</h1>
      <div class="report-date">{esc(date_str)}</div>
    </div>
    <div class="header-right">
      <div class="recipient-label">Prepared for</div>
      <div class="recipient-name">{esc(rep_name)}</div>
      <div class="recipient-role">{esc(rep_title)}</div>
      <div class="rep-id-badge">{esc(rep_id)}</div>
    </div>
  </header>

  <div class="summary-grid animate-cards">
    <div class="summary-card card-total stagger-1">
      <div class="card-label">Total Active</div>
      <div class="card-value">{total_active}</div>
      <div class="card-context">Assigned tasks</div>
    </div>
    <div class="summary-card card-due stagger-2">
      <div class="card-label">Due Today</div>
      <div class="card-value">{due_today_count}</div>
      <div class="card-context">Require action</div>
    </div>
    <div class="summary-card card-overdue stagger-3">
      <div class="card-label">Overdue</div>
      <div class="card-value">{overdue_count}</div>
      <div class="card-context">Past deadline</div>
    </div>
    <div class="summary-card card-completed stagger-4">
      <div class="card-label">Completed</div>
      <div class="card-value">{completed_7d}</div>
      <div class="card-context">Last 7 days</div>
    </div>
  </div>

  <div class="section animate-section stagger-3">
    <div class="section-header">
      <div class="section-icon red">
        {SVG_ATTENTION}
      </div>
      <div>
        <div class="section-title">Attention Required</div>
        <div class="section-subtitle">Overdue and due-today tasks needing immediate action</div>
      </div>
      <div class="section-line"></div>
    </div>
    {attention_html}
  </div>

  <div class="section animate-section stagger-4">
    <div class="section-header">
      <div class="section-icon blue">
        {SVG_TASKLIST}
      </div>
      <div>
        <div class="section-title">All Assigned Tasks</div>
        <div class="section-subtitle">Complete list of active and recently completed tasks</div>
      </div>
      <div class="section-line"></div>
    </div>

    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Task ID</th>
            <th>Title</th>
            <th>Type</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Department</th>
            <th>Due Date</th>
          </tr>
        </thead>
        <tbody>
          {table_rows}
        </tbody>
      </table>
    </div>
  </div>

  <div class="section animate-section stagger-5">
    <div class="section-header">
      <div class="section-icon violet">
        {SVG_TIMELINE}
      </div>
      <div>
        <div class="section-title">Activity Timeline</div>
        <div class="section-subtitle">Recent progress and updates on active tasks</div>
      </div>
      <div class="section-line"></div>
    </div>
    {timeline_html}
  </div>

  <footer class="report-footer animate-section stagger-6">
    <div class="footer-left">
      <div class="footer-brand">Generated automatically by SBL Orbit Task Engine</div>
      <div class="footer-meta">
        Report period: Last 24 hours<br>
        Next scheduled report: {esc(tomorrow_str)} at 7:00 AM
      </div>
    </div>
    <div class="footer-right">
      <div class="footer-confidential">Internal &middot; Confidential</div>
      <div class="footer-page">SBL Orbit v3</div>
    </div>
  </footer>

</div>

</body>
</html>"""

    def _build_attention_card(self, task, urgency_type: str, days_overdue: int,
                              today: date, esc) -> str:
        """Build a single attention card HTML for an overdue or due-today task."""
        priority = (task.priority or "medium").lower()
        status = (task.status or "pending").lower()
        status_display = status.replace("_", " ").replace("-", " ").title()
        priority_display = priority.title()
        department = html_mod.escape(task.department or "General")
        due_str = task.due_date.strftime("%b %d, %Y") if task.due_date else "No date"

        if urgency_type == "overdue":
            card_class = "attention-card urgent"
            badge_html = f'<div class="overdue-badge">{SVG_CLOCK} {days_overdue} day{"s" if days_overdue != 1 else ""} overdue</div>'
        else:
            card_class = "attention-card"
            badge_html = f'<div class="today-badge">{SVG_CLOCK} Due today</div>'

        priority_css = f"priority-{priority}" if priority in ("urgent", "high", "medium", "low") else "priority-medium"
        status_css = f"status-{status.replace('_', '-')}" if status in ("pending", "in_progress", "on_hold", "completed") else "status-pending"

        return f"""    <div class="{card_class}">
      <div class="attention-top">
        <div class="attention-id">{esc(task.task_id or "")}</div>
        {badge_html}
      </div>
      <div class="attention-title">{esc(task.title or "")}</div>
      <div class="attention-meta">
        <span class="priority-badge {priority_css}">{esc(priority_display)}</span>
        <span class="status-pill {status_css}">{esc(status_display)}</span>
        <span class="meta-item"><span class="dot"></span> Due: {esc(due_str)}</span>
        <span class="meta-item"><span class="dot"></span> {department}</span>
      </div>
    </div>"""

    def _build_table_row(self, task, today: date, esc) -> str:
        """Build a single table row HTML for the task list."""
        priority = (task.priority or "medium").lower()
        status = (task.status or "pending").lower()
        task_type = (task.task_type or "general").lower()
        department = esc(task.department or "General")

        priority_css = f"priority-{priority}" if priority in ("urgent", "high", "medium", "low") else "priority-medium"
        status_css = f"status-{status.replace('_', '-')}" if status in ("pending", "in_progress", "on_hold", "completed") else "status-pending"
        status_display = status.replace("_", " ").replace("-", " ").title()
        priority_display = priority.title()

        # Type badge CSS
        type_css_map = {
            "finance": "type-finance", "approval": "type-finance", "report": "type-finance",
            "legal": "type-finance", "reconciliation": "type-finance", "documentation": "type-finance",
            "operations": "type-operations", "inventory": "type-operations",
            "transaction": "type-operations", "general": "type-operations",
            "sales": "type-sales", "site_visit": "type-sales", "customer": "type-sales",
            "recovery": "type-recovery", "collection": "type-recovery", "follow_up": "type-recovery",
        }
        type_css = type_css_map.get(task_type, "")
        type_display = task_type.replace("_", " ").title()

        # Due date formatting
        if task.due_date:
            is_overdue = task.due_date < today and task.status not in TERMINAL_STATUSES
            is_today = task.due_date == today and task.status not in TERMINAL_STATUSES
            if is_overdue:
                due_css = "due-overdue"
            elif is_today:
                due_css = "due-today"
            else:
                due_css = "due-normal"
            due_display = task.due_date.strftime("%b %d")
        else:
            due_css = "due-normal"
            due_display = "&mdash;"

        return f"""          <tr>
            <td class="task-id-cell">{esc(task.task_id or "")}</td>
            <td class="task-title-cell">{esc(task.title or "")}</td>
            <td><span class="type-badge {type_css}">{esc(type_display)}</span></td>
            <td><span class="priority-badge {priority_css}">{esc(priority_display)}</span></td>
            <td><span class="status-pill {status_css}">{esc(status_display)}</span></td>
            <td class="dept-cell">{department}</td>
            <td class="due-cell {due_css}">{due_display}</td>
          </tr>"""

    def _build_timeline_block(self, task, activities: list, rep_name_cache: Dict, esc) -> str:
        """Build a timeline block for a single task with its activities."""
        priority = (task.priority or "medium").lower()
        status = (task.status or "pending").lower()
        priority_css = f"priority-{priority}" if priority in ("urgent", "high", "medium", "low") else "priority-medium"
        status_css = f"status-{status.replace('_', '-')}" if status in ("pending", "in_progress", "on_hold", "completed") else "status-pending"
        status_display = status.replace("_", " ").replace("-", " ").title()
        priority_display = priority.title()

        entries_html = []
        # Activities already sorted newest first from the query
        for act in activities:
            actor_name = rep_name_cache.get(act.actor_id, "System")
            action = (act.action or "").lower()
            if act.created_at:
                # Cross-platform: avoid %-I (Linux only) — use %I and strip leading zero manually
                raw_time = act.created_at.strftime("%I:%M %p").lstrip("0")
                timestamp = f'{act.created_at.strftime("%b %d, %Y")} &mdash; {raw_time}'
            else:
                timestamp = ""

            # Determine entry CSS class based on action type
            if "commented" in action or "comment" in action:
                entry_class = "entry-comment"
            elif action in ("status_changed", "updated") or "status" in action:
                entry_class = "entry-status"
            elif action in ("assigned", "delegated", "reassigned"):
                entry_class = "entry-assign"
            elif action == "created":
                entry_class = "entry-created"
            elif "priority" in action:
                entry_class = "entry-priority"
            else:
                entry_class = "entry-created"

            # Build the description text
            text_html = self._format_activity_text(act, actor_name, esc)

            entries_html.append(f"""        <div class="timeline-entry {entry_class}">
          <div class="timeline-time">{timestamp}</div>
          <div class="timeline-text">{text_html}</div>
        </div>""")

        entries_joined = "\n".join(entries_html)

        return f"""    <div class="timeline-block">
      <div class="timeline-task-header">
        <span class="timeline-task-id">{esc(task.task_id or "")}</span>
        <div>
          <div class="timeline-task-title">{esc(task.title or "")}</div>
          <div class="timeline-task-meta">
            <span class="priority-badge {priority_css}">{esc(priority_display)}</span>
            <span class="status-pill {status_css}">{esc(status_display)}</span>
          </div>
        </div>
      </div>
      <div class="timeline-entries">
{entries_joined}
      </div>
    </div>"""

    def _format_activity_text(self, activity, actor_name: str, esc) -> str:
        """Format a single activity entry's text content."""
        action = (activity.action or "").lower()
        old_val = activity.old_value or ""
        new_val = activity.new_value or ""

        if action == "commented":
            return f'<strong>{esc(actor_name)}</strong> commented: &ldquo;{esc(new_val)}&rdquo;'
        elif action == "status_changed":
            old_css = f"status-{old_val.replace('_', '-')}" if old_val else "status-pending"
            new_css = f"status-{new_val.replace('_', '-')}" if new_val else "status-pending"
            old_display = esc(old_val.replace("_", " ").title()) if old_val else "Unknown"
            new_display = esc(new_val.replace("_", " ").title()) if new_val else "Unknown"
            return (
                f'<strong>{esc(actor_name)}</strong> changed status: '
                f'<span class="status-change">'
                f'<span class="status-pill {old_css}" style="font-size:0.58rem; padding:1px 7px;">{old_display}</span> '
                f'<span class="arrow">&rarr;</span> '
                f'<span class="status-pill {new_css}" style="font-size:0.58rem; padding:1px 7px;">{new_display}</span>'
                f'</span>'
            )
        elif action in ("assigned", "delegated", "reassigned"):
            return f'<strong>{esc(actor_name)}</strong> {esc(action)} task'
        elif action == "created":
            return f'Task created by <strong>{esc(actor_name)}</strong>'
        elif "priority" in action:
            old_p_css = f"priority-{old_val.lower()}" if old_val else "priority-medium"
            new_p_css = f"priority-{new_val.lower()}" if new_val else "priority-medium"
            return (
                f'<strong>{esc(actor_name)}</strong> changed priority: '
                f'<span class="priority-badge {old_p_css}" style="font-size:0.56rem;">{esc(old_val.title() if old_val else "Medium")}</span> '
                f'<span class="arrow">&rarr;</span> '
                f'<span class="priority-badge {new_p_css}" style="font-size:0.56rem;">{esc(new_val.title() if new_val else "Medium")}</span>'
            )
        else:
            desc = f"{action}: {new_val}" if new_val else action
            return f'<strong>{esc(actor_name)}</strong> {esc(desc)}'

    # ============== Helper Methods ==============

    def _find_task(self, db: Session, task_id):
        """Find task by UUID or TASK-XXXXX id."""
        from app.main import Task
        try:
            task_uuid = uuid_lib.UUID(str(task_id))
            task = db.query(Task).filter(Task.id == task_uuid).first()
            if task:
                return task
        except (ValueError, TypeError):
            pass
        return db.query(Task).filter(Task.task_id == task_id).first()

    def _find_rep_by_name(self, db: Session, name: str):
        """Find company rep by name. Tries exact ILIKE first, then fuzzy if rapidfuzz available."""
        from app.main import CompanyRep
        if not name or not name.strip():
            return None
        # Try direct ILIKE first (no full-table scan)
        rep = db.query(CompanyRep).filter(CompanyRep.name.ilike(f"%{name.strip()}%")).first()
        if rep:
            return rep
        # Fuzzy fallback with rapidfuzz (bounded to 50 reps)
        try:
            from rapidfuzz import fuzz, process
            reps = db.query(CompanyRep).limit(50).all()
            if not reps:
                return None
            choices = {rep.name: rep for rep in reps}
            best = process.extractOne(name, list(choices.keys()), scorer=fuzz.WRatio, score_cutoff=60)
            if best:
                return choices[best[0]]
        except ImportError:
            pass
        return None

    def _find_rep_by_role(self, db: Session, role: str):
        """Find first company rep with given role."""
        from app.main import CompanyRep
        return db.query(CompanyRep).filter(CompanyRep.role == role).first()

    def _log_activity(self, db: Session, task_id, actor_id, action, old_value=None, new_value=None):
        """Log a task activity."""
        from app.main import TaskActivity
        activity = TaskActivity(
            task_id=task_id,
            actor_id=actor_id,
            action=action,
            old_value=old_value,
            new_value=new_value,
        )
        db.add(activity)


task_service = TaskService()
