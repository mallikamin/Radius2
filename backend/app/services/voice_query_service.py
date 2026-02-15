"""
Voice Query Service for ORBIT CRM.
Orchestrates: classify intent -> extract entities -> build SQL -> execute -> format response.
"""
import time
import logging
from typing import Optional, Dict, Any

from sqlalchemy.orm import Session

from app.services.intent_classifier import intent_classifier, IntentType, DomainType
from app.services.entity_extractor import entity_extractor
from app.services.query_builder import query_builder
from app.services.db_executor import db_executor
from app.services.response_formatter import response_formatter
from app.services.task_service import task_service

logger = logging.getLogger(__name__)


class VoiceQueryService:
    """Orchestrates the voice/text query pipeline."""

    def process_query(self, db: Session, query_text: str, user_rep_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Process a text query through the full pipeline.
        Returns dict with response_text, intent, entities, processing_time_ms, etc.
        """
        start_time = time.time()

        try:
            # Step 1: Classify intent
            intent = intent_classifier.classify(query_text)
            logger.info(f"Intent: {intent.intent.value}/{intent.domain.value} (conf={intent.confidence:.2f})")

            # Step 2: Handle task intents
            if intent.intent == IntentType.ASSIGN and intent.domain == DomainType.TASK:
                return self._handle_task_assignment(db, query_text, user_rep_id, intent, start_time)

            if intent.intent == IntentType.READ and intent.domain == DomainType.TASK:
                return self._handle_task_read(db, user_rep_id, intent, start_time)

            if intent.intent == IntentType.REPORT and intent.domain == DomainType.TASK:
                return self._handle_task_dashboard(db, user_rep_id, intent, start_time)

            if intent.intent == IntentType.UPDATE_STATUS and intent.domain == DomainType.TASK:
                return self._handle_task_status_update(db, query_text, user_rep_id, intent, start_time)

            # Step 3: Extract entities for CRM queries
            entities = entity_extractor.extract(query_text)
            logger.info(f"Entities: {entities.to_dict()}")

            # Step 4: Build SQL query
            sql_query, params = query_builder.build(intent, entities)

            if not sql_query:
                processing_time = (time.time() - start_time) * 1000
                response_text = "I couldn't build a query for that request. Try rephrasing, e.g., 'show available plots in Sitara Villas'."
                qid = self._save_history(db, query_text, intent, None, response_text, False, processing_time, user_rep_id)
                return self._build_response(response_text, intent, entities, processing_time, query_id=qid)

            # Step 5: Execute query
            result = db_executor.execute_query(db, sql_query, params)

            # Step 6: Format response
            response_text = response_formatter.format_response(intent, entities, result)

            processing_time = (time.time() - start_time) * 1000
            qid = self._save_history(db, query_text, intent, sql_query, response_text, result.success, processing_time, user_rep_id)

            return self._build_response(response_text, intent, entities, processing_time, result.data, query_id=qid)

        except Exception as e:
            processing_time = (time.time() - start_time) * 1000
            logger.error(f"Query processing error: {e}", exc_info=True)
            response_text = response_formatter.format_error(str(e))
            return self._build_response(response_text, None, None, processing_time, error=str(e))

    def _handle_task_assignment(self, db, query_text, user_rep_id, intent, start_time):
        """Handle task assignment via voice/text."""
        from app.main import CompanyRep
        processing_time = (time.time() - start_time) * 1000

        if not user_rep_id:
            return self._build_response("Please log in to create tasks.", intent, None, processing_time)

        # Find creator by rep_id
        creator = db.query(CompanyRep).filter(CompanyRep.rep_id == user_rep_id).first()
        if not creator:
            return self._build_response("User not found.", intent, None, processing_time)

        try:
            task = task_service.create_task_from_text(db, query_text, creator.id)
            response_text = f"Task created: **{task.title}** ({task.task_id})\n"
            response_text += f"- Type: {task.task_type} | Priority: {task.priority}\n"
            if task.assignee_id:
                assignee = db.query(CompanyRep).filter(CompanyRep.id == task.assignee_id).first()
                response_text += f"- Assigned to: {assignee.name if assignee else 'Unknown'}\n"
            elif task.pending_assignment:
                response_text += f"- Status: Pending assignment ('{task.original_assignee_text}' not found)\n"
            else:
                response_text += "- Unassigned\n"
            if task.due_date:
                response_text += f"- Due: {task.due_date}\n"

            processing_time = (time.time() - start_time) * 1000
            qid = self._save_history(db, query_text, intent, None, response_text, True, processing_time, user_rep_id)
            return self._build_response(response_text, intent, None, processing_time, query_id=qid)

        except Exception as e:
            processing_time = (time.time() - start_time) * 1000
            logger.error(f"Task creation error: {e}", exc_info=True)
            return self._build_response(f"Failed to create task: {str(e)}", intent, None, processing_time, error=str(e))

    def _handle_task_read(self, db, user_rep_id, intent, start_time):
        """Handle reading tasks."""
        from app.main import CompanyRep
        processing_time = (time.time() - start_time) * 1000

        creator = None
        if user_rep_id:
            creator = db.query(CompanyRep).filter(CompanyRep.rep_id == user_rep_id).first()

        tasks = task_service.get_my_tasks(db, creator.id) if creator else []

        if not tasks:
            response_text = "You have no tasks assigned."
        else:
            response_text = f"**Your Tasks ({len(tasks)}):**\n\n"
            for t in tasks[:10]:
                response_text += f"- [{t.task_id}] **{t.title}** ({t.status}) - {t.priority}\n"
            if len(tasks) > 10:
                response_text += f"\n... and {len(tasks) - 10} more."

        processing_time = (time.time() - start_time) * 1000
        return self._build_response(response_text, intent, None, processing_time)

    def _handle_task_dashboard(self, db, user_rep_id, intent, start_time):
        """Handle task dashboard summary."""
        from app.main import CompanyRep
        processing_time = (time.time() - start_time) * 1000

        creator = None
        role = None
        if user_rep_id:
            creator = db.query(CompanyRep).filter(CompanyRep.rep_id == user_rep_id).first()
            if creator:
                role = creator.role

        summary = task_service.get_task_summary(db, creator.id if creator else None, role)
        response_text = response_formatter.format_task_dashboard(summary)

        processing_time = (time.time() - start_time) * 1000
        return self._build_response(response_text, intent, None, processing_time)

    def _handle_task_status_update(self, db, query_text, user_rep_id, intent, start_time):
        """Handle task status update via voice."""
        processing_time = (time.time() - start_time) * 1000
        response_text = "Task status updates via voice are coming soon. Please use the Tasks tab to update status."
        return self._build_response(response_text, intent, None, processing_time)

    def _build_response(self, response_text, intent=None, entities=None, processing_time=0, data=None, error=None, query_id=None):
        result = {
            "response_text": response_text,
            "processing_time_ms": round(processing_time, 2),
        }
        if query_id:
            result["query_id"] = str(query_id)
        if intent:
            result["intent"] = intent.to_dict()
        if entities:
            result["entities"] = entities.to_dict()
        if data:
            result["data"] = data
        if error:
            result["error"] = error
        return result

    def _save_history(self, db, query_text, intent, sql_query, response_text, success, processing_time, user_rep_id):
        """Save query to history for learning. Returns the history UUID or None."""
        from app.main import QueryHistory
        try:
            history = QueryHistory(
                query_text=query_text,
                intent=intent.intent.value if intent else None,
                domain=intent.domain.value if intent else None,
                confidence=intent.confidence if intent else 0,
                sql_query=sql_query,
                response_text=response_text[:2000] if response_text else None,
                success=success,
                processing_time_ms=processing_time,
                user_rep_id=user_rep_id,
            )
            db.add(history)
            db.commit()
            db.refresh(history)
            return history.id
        except Exception as e:
            logger.warning(f"Failed to save query history: {e}")
            db.rollback()
            return None


voice_query_service = VoiceQueryService()
