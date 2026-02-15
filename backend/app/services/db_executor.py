"""Database executor for voice query pipeline - sync SQLAlchemy."""
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import text
from decimal import Decimal
from datetime import date, datetime
import uuid as uuid_mod
import logging

logger = logging.getLogger(__name__)


class QueryResult:
    """Simple result container for query execution."""
    def __init__(self, success=True, data=None, row_count=0, error=None):
        self.success = success
        self.data = data or []
        self.row_count = row_count
        self.error = error


class DatabaseExecutor:
    """Execute database queries safely using sync SQLAlchemy."""

    def execute_query(self, db: Session, query: str, params: Dict[str, Any]) -> QueryResult:
        try:
            logger.debug(f"Executing query: {query[:100]}... with params: {params}")
            result = db.execute(text(query), params)
            rows = result.fetchall()

            if rows:
                columns = result.keys()
                data = [dict(zip(columns, row)) for row in rows]
                data = self._serialize_data(data)
                return QueryResult(success=True, data=data, row_count=len(data))
            else:
                return QueryResult(success=True, data=[], row_count=0)

        except Exception as e:
            logger.error(f"Query execution error: {e}")
            return QueryResult(success=False, error=str(e))

    def _serialize_data(self, data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        serialized = []
        for row in data:
            new_row = {}
            for key, value in row.items():
                if isinstance(value, Decimal):
                    new_row[key] = float(value)
                elif isinstance(value, (date, datetime)):
                    new_row[key] = value.isoformat()
                elif isinstance(value, uuid_mod.UUID):
                    new_row[key] = str(value)
                else:
                    new_row[key] = value
            serialized.append(new_row)
        return serialized


db_executor = DatabaseExecutor()
