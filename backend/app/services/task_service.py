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
ROLE_KEYWORDS = {
    'coo': 'cco', 'chief operating officer': 'cco',
    'cfo': 'admin', 'chief financial officer': 'admin',
    'finance': 'admin', 'sales manager': 'manager',
    'manager': 'manager', 'sales rep': 'user',
    'salesman': 'user', 'sales': 'user',
    'consultant': 'user', 'accountant': 'admin',
    'accounts': 'admin', 'admin': 'admin',
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


class TaskEntityExtractor:
    """Extract task-related entities from voice/text commands."""

    def extract(self, text: str) -> Dict[str, Any]:
        text_lower = text.lower()
        entities = {
            'assignee_name': None, 'assignee_role': None,
            'task_title': None, 'priority': 'medium',
            'task_type': 'general', 'due_date': None,
            'project': None, 'block': None,
            'unit_number': None, 'customer_name': None,
        }

        # Extract role/assignee
        for keyword, role in ROLE_KEYWORDS.items():
            if keyword in text_lower:
                entities['assignee_role'] = role
                break

        # Extract name
        name_patterns = [
            r'assign\s+(?:a\s+)?(?:task\s+)?(?:to|for)\s+(\w+(?:\s+\w+)?)',
            r'task\s+(?:for|to)\s+(\w+(?:\s+\w+)?)',
            r'assign\s+(\w+)(?:\s*:)',
        ]
        for pattern in name_patterns:
            match = re.search(pattern, text_lower)
            if match:
                potential_name = match.group(1).strip()
                skip_words = {'a', 'the', 'this', 'that', 'task', 'tasks'}
                if potential_name not in ROLE_KEYWORDS and potential_name not in skip_words:
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

        # Extract task title
        entities['task_title'] = self._extract_task_title(text)

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

    def _extract_task_title(self, text: str) -> str:
        title = text
        prefixes = [
            r'^assign\s+(?:to\s+)?(?:\w+\s+)?',
            r'^task\s+(?:for|to)\s+(?:\w+\s+)?[:\-]?\s*',
            r'^remind\s+(?:\w+\s+)?(?:to\s+)?',
        ]
        for prefix in prefixes:
            title = re.sub(prefix, '', title, flags=re.IGNORECASE)
        title = title.strip(' :-')
        if title:
            title = title[0].upper() + title[1:]
        return title if title else "New Task"


class TaskService:
    """Service for task management — sync SQLAlchemy, uses ORBIT models."""

    def __init__(self):
        self.entity_extractor = TaskEntityExtractor()

    def create_task(self, db: Session, creator_id, title, description=None,
                    task_type="general", priority="medium", assignee_id=None,
                    due_date=None, department=None,
                    linked_inventory_id=None, linked_transaction_id=None,
                    linked_customer_id=None, linked_project_id=None):
        """Create a task via direct API."""
        from app.main import Task, CompanyRep, create_notification

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

        entities = self.entity_extractor.extract(text)

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

        task_type = entities['task_type']
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

    def get_tasks(self, db: Session, user_id=None, role=None, status=None,
                  priority=None, department=None, task_type=None, search=None,
                  assignee_only=False, limit=50, offset=0):
        """Get tasks with filters."""
        from app.main import Task
        query = db.query(Task)

        if user_id:
            user_uuid = user_id if isinstance(user_id, uuid_lib.UUID) else uuid_lib.UUID(str(user_id))
            if assignee_only:
                query = query.filter(Task.assignee_id == user_uuid)
            elif role in ("admin", "cco"):
                pass  # Admin/CCO see all
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
            query = query.filter(Task.task_type == task_type)
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(Task.title.ilike(search_term), Task.task_id.ilike(search_term))
            )

        return query.order_by(Task.created_at.desc()).offset(offset).limit(limit).all()

    def get_my_tasks(self, db: Session, user_id):
        """Get tasks assigned to current user."""
        from app.main import Task
        user_uuid = user_id if isinstance(user_id, uuid_lib.UUID) else uuid_lib.UUID(str(user_id))
        return db.query(Task).filter(Task.assignee_id == user_uuid).order_by(Task.created_at.desc()).all()

    def update_task_status(self, db: Session, task_id, new_status: str, user_id,
                           completion_notes: Optional[str] = None):
        """Update task status with validation."""
        from app.main import Task, CompanyRep, create_notification

        task = self._find_task(db, task_id)
        if not task:
            raise ValueError("Task not found")

        valid_statuses = STATUS_CONFIG.get(task.task_type, STATUS_CONFIG["general"])
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

        # Notify creator if different user
        if task.created_by != user_uuid:
            creator = db.query(CompanyRep).filter(CompanyRep.id == task.created_by).first()
            if creator:
                create_notification(
                    db, creator.rep_id, "task_updated",
                    f"Task updated: {task.title}",
                    f"Status changed to {new_status}",
                    category="task", entity_type="task", entity_id=task.task_id
                )

        db.commit()
        return task

    def complete_task(self, db: Session, task_id, user_id, notes: Optional[str] = None):
        """Mark task as complete."""
        task = self._find_task(db, task_id)
        if not task:
            raise ValueError("Task not found")

        terminal = "completed"
        valid_statuses = STATUS_CONFIG.get(task.task_type, STATUS_CONFIG["general"])
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
        if new_assignee:
            create_notification(
                db, new_assignee.rep_id, "task_delegated",
                f"Task delegated: {task.title}",
                f"Task has been delegated to you",
                category="task", entity_type="task", entity_id=task.task_id
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

    def get_task_summary(self, db: Session, user_id=None, role=None):
        """Get task dashboard summary (flat structure for frontend)."""
        from app.main import Task

        query = db.query(Task)

        # Role-based filtering
        if user_id and role not in ("admin", "cco"):
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
