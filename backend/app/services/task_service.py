"""
Task Service for ORBIT CRM.
Handles task creation, assignment, delegation, status updates, and notifications.
Ported from voice-agent — converted async→sync, User→CompanyRep.
Uses ORBIT's existing create_notification() helper.
"""
import re
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, date, timedelta
import uuid as uuid_lib

from sqlalchemy.orm import Session
from sqlalchemy import func, or_

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
                    linked_customer_id=None, linked_project_id=None):
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
                    category="task", entity_type="task", entity_id=task.task_id
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
                category="task", entity_type="task", entity_id=task.task_id
            )
        elif pending_assignment:
            # Notify admins
            admins = db.query(CompanyRep).filter(CompanyRep.role.in_(["admin", "cco"])).all()
            for admin in admins:
                create_notification(
                    db, admin.rep_id, "pending_assignment",
                    f"Pending task: {task.title}",
                    f"Needs assignment. Original: {original_assignee_text}",
                    category="task", entity_type="task", entity_id=task.task_id
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
        query = db.query(Task)

        if user_id:
            user_uuid = user_id if isinstance(user_id, uuid_lib.UUID) else uuid_lib.UUID(str(user_id))
            if assignee_only:
                query = query.filter(Task.assignee_id == user_uuid)
            elif current_rep_id:
                visible = self._get_visible_user_ids(db, current_rep_id)
                if visible is not None:  # None means see all
                    query = query.filter(
                        or_(
                            Task.assignee_id.in_(visible),
                            Task.created_by.in_(visible),
                        )
                    )
            elif role in ("admin",):
                pass  # Fallback: admin sees all
            else:
                query = query.filter(
                    or_(Task.assignee_id == user_uuid, Task.created_by == user_uuid)
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
        """Get tasks assigned to current user."""
        from app.main import Task
        self._normalize_task_types_once(db)
        user_uuid = user_id if isinstance(user_id, uuid_lib.UUID) else uuid_lib.UUID(str(user_id))
        return db.query(Task).filter(Task.assignee_id == user_uuid).order_by(Task.created_at.desc()).all()

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

    def _notify_task_stakeholders(self, db, task, actor_uuid, title, message):
        """Notify all task stakeholders (creator, assignee, delegator) except the person who made the change."""
        from app.main import CompanyRep, create_notification

        notified = set()
        stakeholder_ids = [task.created_by, task.assignee_id]
        if hasattr(task, 'delegated_by') and task.delegated_by:
            stakeholder_ids.append(task.delegated_by)

        for uid in stakeholder_ids:
            if uid and uid != actor_uuid and uid not in notified:
                notified.add(uid)
                rep = db.query(CompanyRep).filter(CompanyRep.id == uid).first()
                if rep:
                    create_notification(
                        db, rep.rep_id, "task_updated", title, message,
                        category="task", entity_type="task", entity_id=task.task_id
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

        # Notify assignee if different from commenter
        if task.assignee_id and task.assignee_id != author_uuid:
            assignee = db.query(CompanyRep).filter(CompanyRep.id == task.assignee_id).first()
            if assignee:
                author = db.query(CompanyRep).filter(CompanyRep.id == author_uuid).first()
                create_notification(
                    db, assignee.rep_id, "task_commented",
                    f"Comment on: {task.title}",
                    f"{author.name if author else 'Someone'}: {content[:80]}",
                    category="task", entity_type="task", entity_id=task.task_id
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

        query = db.query(Task)

        # Hierarchy-based filtering
        if current_rep_id:
            visible = self._get_visible_user_ids(db, current_rep_id)
            if visible is not None:
                query = query.filter(
                    or_(Task.assignee_id.in_(visible), Task.created_by.in_(visible))
                )
        elif user_id and role not in ("admin",):
            user_uuid = user_id if isinstance(user_id, uuid_lib.UUID) else uuid_lib.UUID(str(user_id))
            query = query.filter(or_(Task.assignee_id == user_uuid, Task.created_by == user_uuid))

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
