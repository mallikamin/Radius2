"""
Intent Classifier for ORBIT CRM Voice Query Pipeline.
Rule-based fallback classifier — no LLM dependency for Phase 1.
Ported from voice-agent, adapted for ORBIT.
"""
import re
import logging
from typing import Optional
from enum import Enum

logger = logging.getLogger(__name__)


class IntentType(str, Enum):
    READ = "READ"
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    REPORT = "REPORT"
    ANALYTICS = "ANALYTICS"
    ASSIGN = "ASSIGN"
    UPDATE_STATUS = "UPDATE_STATUS"
    OUT_OF_SCOPE = "OUT_OF_SCOPE"


class DomainType(str, Enum):
    INVENTORY = "INVENTORY"
    TRANSACTION = "TRANSACTION"
    CUSTOMER = "CUSTOMER"
    BROKER = "BROKER"
    PROJECT = "PROJECT"
    BLOCK = "BLOCK"
    INSTALLMENT = "INSTALLMENT"
    RECEIPT = "RECEIPT"
    RECEIVABLES = "RECEIVABLES"
    FDA_APPROVED = "FDA_APPROVED"
    TASK = "TASK"
    USER = "USER"
    NOTIFICATION = "NOTIFICATION"
    EOI = "EOI"
    ZAKAT = "ZAKAT"


class IntentResult:
    """Result of intent classification."""
    def __init__(self, intent: IntentType, domain: DomainType, confidence: float,
                 reason: Optional[str] = None, requires_confirmation: bool = False):
        self.intent = intent
        self.domain = domain
        self.confidence = confidence
        self.reason = reason
        self.requires_confirmation = requires_confirmation

    def to_dict(self):
        return {
            "intent": self.intent.value,
            "domain": self.domain.value,
            "confidence": self.confidence,
            "reason": self.reason
        }


class IntentClassifier:
    """Rule-based intent classifier for ORBIT CRM queries."""

    def classify(self, query: str, user_role: Optional[str] = None) -> IntentResult:
        query_lower = query.lower()

        # === Task Status Update Detection (highest priority) ===
        if re.search(r"mark\s+(?:task\s+)?(.+?)\s+(?:as\s+)?(done|complete|completed|finished)", query_lower):
            return IntentResult(IntentType.UPDATE_STATUS, DomainType.TASK, 0.9, "mark task done")

        if re.search(r"^complete\s+(?:task\s+)?(.+)", query_lower):
            return IntentResult(IntentType.UPDATE_STATUS, DomainType.TASK, 0.85, "complete task")

        if re.search(r"^finish\s+(?:task\s+)?(.+)", query_lower):
            return IntentResult(IntentType.UPDATE_STATUS, DomainType.TASK, 0.85, "finish task")

        if re.search(r"^start\s+(?:working\s+on\s+)?(?:task\s+)?(.+)", query_lower):
            return IntentResult(IntentType.UPDATE_STATUS, DomainType.TASK, 0.85, "start task")

        # SALES workflow patterns
        if re.search(r"qualify\s+(?:lead\s+)?(.+)", query_lower):
            return IntentResult(IntentType.UPDATE_STATUS, DomainType.TASK, 0.85, "qualify lead")
        if re.search(r"close\s+(?:deal\s+)?(.+?)\s+(?:as\s+)?won", query_lower):
            return IntentResult(IntentType.UPDATE_STATUS, DomainType.TASK, 0.85, "close deal won")
        if re.search(r"close\s+(?:deal\s+)?(.+?)\s+(?:as\s+)?lost", query_lower):
            return IntentResult(IntentType.UPDATE_STATUS, DomainType.TASK, 0.85, "close deal lost")

        # COLLECTION workflow patterns
        if re.search(r"received\s+payment\s+(?:for\s+)?(.+)", query_lower):
            return IntentResult(IntentType.UPDATE_STATUS, DomainType.TASK, 0.85, "payment received")
        if re.search(r"confirm\s+(?:site\s+)?visit\s+(?:for\s+)?(.+)", query_lower):
            return IntentResult(IntentType.UPDATE_STATUS, DomainType.TASK, 0.85, "confirm visit")
        if re.search(r"approve\s+(?:document\s+)?(.+)", query_lower):
            return IntentResult(IntentType.UPDATE_STATUS, DomainType.TASK, 0.85, "approve document")

        # === Implicit Task Assignment ===
        implicit_task_patterns = [
            r"(?:tell|ask|remind|request)\s+(\w+(?:\s+\w+)?)\s+to\s+",
            r"(\w+(?:\s+\w+)?)\s+(?:should|needs?\s+to|must|has\s+to)\s+",
            r"get\s+(\w+(?:\s+\w+)?)\s+to\s+",
            r"have\s+(\w+(?:\s+\w+)?)\s+(?:prepare|review|check|call|send|create|make|do)\s*",
            r"(\w+)\s+ko\s+(?:bolo|kaho|batao)",
            r"(\w+)\s+se\s+(?:kaho|bolo)",
            r"^(coo|cfo|manager|admin|consultant|accountant)\s+(?:prepare|review|check|call|send|create|make|do|arrange)",
        ]
        for pattern in implicit_task_patterns:
            if re.search(pattern, query_lower):
                return IntentResult(IntentType.ASSIGN, DomainType.TASK, 0.80, "implicit task assignment")

        # === Dashboard / Task Summary ===
        dashboard_keywords = ["dashboard", "task summary", "daily summary", "aaj ke tasks",
                              "aaj ka summary", "task report", "task overview", "kaam ka summary"]
        if any(phrase in query_lower for phrase in dashboard_keywords):
            return IntentResult(IntentType.REPORT, DomainType.TASK, 0.85, "task dashboard summary")

        if "my task" in query_lower or "my tasks" in query_lower:
            return IntentResult(IntentType.READ, DomainType.TASK, 0.8, "read my tasks")

        if any(phrase in query_lower for phrase in ["pending task", "open task", "show task", "list task"]):
            return IntentResult(IntentType.READ, DomainType.TASK, 0.8, "read tasks")

        # === Task Assignment (catch-all) ===
        task_keywords = ["assign", "task", "todo", "remind", "follow up", "followup"]
        role_keywords = ["coo", "cfo", "manager", "sales rep", "consultant", "accountant", "admin"]

        if any(word in query_lower for word in task_keywords):
            return IntentResult(IntentType.ASSIGN, DomainType.TASK, 0.85, "task assignment detected")

        if query_lower.startswith("assign "):
            return IntentResult(IntentType.ASSIGN, DomainType.TASK, 0.85, "assign command")

        for role in role_keywords:
            if role in query_lower:
                if not any(q in query_lower for q in ["who is", "show", "find", "contact", "phone"]):
                    return IntentResult(IntentType.ASSIGN, DomainType.TASK, 0.75, f"task for {role}")

        # Notification queries
        if any(word in query_lower for word in ["notification", "notifications", "alerts", "unread"]):
            return IntentResult(IntentType.READ, DomainType.NOTIFICATION, 0.8, "read notifications")

        # === EOI (Expression of Interest) queries ===
        eoi_keywords = ["eoi", "expression of interest", "token money", "token collection"]
        if any(phrase in query_lower for phrase in eoi_keywords):
            if any(word in query_lower for word in ["report", "summary", "wise", "total", "kitna", "kitne"]):
                return IntentResult(IntentType.REPORT, DomainType.EOI, 0.85, "eoi report/summary")
            if any(word in query_lower for word in ["count", "how many", "statistics", "stats"]):
                return IntentResult(IntentType.ANALYTICS, DomainType.EOI, 0.85, "eoi analytics")
            return IntentResult(IntentType.READ, DomainType.EOI, 0.85, "eoi lookup")

        # === Zakat queries ===
        zakat_keywords = ["zakat", "beneficiary", "beneficiaries", "disbursement", "disbursements"]
        if any(word in query_lower for word in zakat_keywords):
            if any(word in query_lower for word in ["report", "summary", "wise", "total", "kitna", "kitne"]):
                return IntentResult(IntentType.REPORT, DomainType.ZAKAT, 0.85, "zakat report/summary")
            if any(word in query_lower for word in ["count", "how many", "statistics", "stats"]):
                return IntentResult(IntentType.ANALYTICS, DomainType.ZAKAT, 0.85, "zakat analytics")
            if "beneficiar" in query_lower:
                return IntentResult(IntentType.READ, DomainType.ZAKAT, 0.85, "zakat beneficiary lookup")
            if "disburse" in query_lower:
                return IntentResult(IntentType.READ, DomainType.ZAKAT, 0.85, "zakat disbursement lookup")
            return IntentResult(IntentType.READ, DomainType.ZAKAT, 0.85, "zakat lookup")

        # === Customer Portfolio ===
        portfolio_keywords = ["portfolio", "all units", "sab units", "sara portfolio",
                              "customer detail", "full detail", "investment detail",
                              "kitna invest", "kitna lagaya", "saari property",
                              "all properties", "customer ka sara", "total holdings"]
        if any(phrase in query_lower for phrase in portfolio_keywords):
            return IntentResult(IntentType.ANALYTICS, DomainType.CUSTOMER, 0.85, "customer portfolio")

        if re.search(r"(?:show|get|find)\s+\w+(?:\s+\w+)?(?:'s|ka|ki|ke)\s+(?:units?|plots?|investment|property|properties|balance)", query_lower):
            return IntentResult(IntentType.ANALYTICS, DomainType.CUSTOMER, 0.8, "possessive customer portfolio")

        # === Report queries ===
        report_keywords = ["report", "wise"]
        if any(word in query_lower for word in report_keywords):
            customer_report_keywords = ["customer", "buyer", "client"]
            if any(word in query_lower for word in customer_report_keywords):
                return IntentResult(IntentType.REPORT, DomainType.CUSTOMER, 0.8, "customer-wise sales report")
            elif any(word in query_lower for word in ["block", "blockwise", "block-wise"]):
                return IntentResult(IntentType.REPORT, DomainType.BLOCK, 0.8, "block-wise sales report")
            elif any(word in query_lower for word in ["broker", "agent"]):
                return IntentResult(IntentType.REPORT, DomainType.BROKER, 0.8, "broker-wise sales report")
            elif "sales" in query_lower:
                return IntentResult(IntentType.REPORT, DomainType.TRANSACTION, 0.7, "sales report")

        # Project listing
        if any(word in query_lower for word in ["project", "projects"]):
            if any(word in query_lower for word in ["list", "all", "show", "what", "which", "our"]):
                return IntentResult(IntentType.READ, DomainType.PROJECT, 0.7, "project listing")

        # Block listing
        if any(word in query_lower for word in ["block", "blocks"]):
            if any(word in query_lower for word in ["list", "all", "show", "what", "which"]):
                return IntentResult(IntentType.READ, DomainType.BLOCK, 0.7, "block listing")

        # Owner/customer queries
        owner_keywords = ["owner", "malik", "kiska", "kiski"]
        customer_keywords = ["customer", "buyer", "client", "kharidar"]

        if any(word in query_lower for word in owner_keywords):
            if any(word in query_lower for word in ["plot", "unit", "flat", "shop", "house", "number"]):
                return IntentResult(IntentType.READ, DomainType.INVENTORY, 0.75, "plot owner lookup")

        if any(word in query_lower for word in customer_keywords + owner_keywords):
            return IntentResult(IntentType.READ, DomainType.CUSTOMER, 0.7, "customer lookup")

        # Broker queries
        if any(word in query_lower for word in ["broker", "agent", "dealer"]):
            return IntentResult(IntentType.READ, DomainType.BROKER, 0.7, "broker lookup")

        # Inventory queries
        inventory_keywords = [
            "plot", "unit", "marla", "kanal", "inventory", "flat", "shop", "house",
            "ghar", "dukan", "makan", "details",
        ]
        if any(word in query_lower for word in inventory_keywords):
            return IntentResult(IntentType.READ, DomainType.INVENTORY, 0.75, "plot/inventory lookup")

        # Contact queries
        if any(word in query_lower for word in ["contact", "phone", "mobile", "cell"]):
            if any(word in query_lower for word in ["broker", "agent", "dealer"]):
                return IntentResult(IntentType.READ, DomainType.BROKER, 0.7, "broker contact")
            else:
                return IntentResult(IntentType.READ, DomainType.CUSTOMER, 0.7, "customer contact")

        # Available inventory
        if "available" in query_lower:
            return IntentResult(IntentType.READ, DomainType.INVENTORY, 0.7, "available inventory")

        # General read queries
        read_keywords = [
            "show", "display", "get", "find", "history", "list", "all", "details",
            "dikhao", "batao", "dekho", "bata", "dikha",
            "kiska", "kiski", "konsa", "konsi", "kya",
            "wala", "wali", "ka", "ki", "ke",
            "status", "available", "sold", "booked",
        ]
        if any(word in query_lower for word in read_keywords):
            if "receivable" in query_lower or "payment" in query_lower:
                return IntentResult(IntentType.REPORT, DomainType.RECEIVABLES, 0.6, "keyword matching")
            elif "fda" in query_lower or "approved" in query_lower:
                return IntentResult(IntentType.ANALYTICS, DomainType.FDA_APPROVED, 0.6, "keyword matching")
            elif "transaction" in query_lower or "txn" in query_lower:
                return IntentResult(IntentType.READ, DomainType.TRANSACTION, 0.6, "transaction lookup")
            else:
                return IntentResult(IntentType.READ, DomainType.INVENTORY, 0.6, "keyword matching")

        if any(word in query_lower for word in ["sold", "sell", "book", "create", "becha"]):
            return IntentResult(IntentType.CREATE, DomainType.TRANSACTION, 0.6, "keyword matching")

        if any(word in query_lower for word in ["total", "sum", "count", "kitne", "kitna"]):
            return IntentResult(IntentType.ANALYTICS, DomainType.INVENTORY, 0.6, "keyword matching")

        # Export queries
        if any(word in query_lower for word in ["export", "excel", "download", "csv"]):
            return IntentResult(IntentType.REPORT, DomainType.INVENTORY, 0.7, "export request")

        # Question detection
        if "?" in query or any(word in query_lower for word in ["what", "which", "how", "is", "are"]):
            return IntentResult(IntentType.READ, DomainType.INVENTORY, 0.4, "question detected")

        # Default
        return IntentResult(IntentType.OUT_OF_SCOPE, DomainType.INVENTORY, 0.3, "no matching keywords")


intent_classifier = IntentClassifier()
