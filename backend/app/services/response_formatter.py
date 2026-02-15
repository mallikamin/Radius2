"""
Response Formatter for ORBIT CRM Voice Query Pipeline.
Formats query results into readable text responses.
"""
from typing import List, Dict, Any
from decimal import Decimal
import logging

from app.services.intent_classifier import IntentType, DomainType, IntentResult
from app.services.entity_extractor import ExtractedEntities
from app.services.db_executor import QueryResult

logger = logging.getLogger(__name__)


class ResponseFormatter:
    """Format query results into natural language responses."""

    def format_response(self, intent: IntentResult, entities: ExtractedEntities, result: QueryResult) -> str:
        if intent.intent == IntentType.OUT_OF_SCOPE:
            return "This query is outside my scope. Please try a CRM-related question about plots, customers, transactions, or tasks."

        if not result.success:
            return f"I encountered an issue: {result.error}. Please try rephrasing your query."

        if not result.data or result.row_count == 0:
            return self._format_no_results(intent, entities)

        if intent.intent == IntentType.READ:
            return self._format_read_response(intent.domain, entities, result)
        elif intent.intent == IntentType.REPORT:
            return self._format_report_response(intent.domain, entities, result)
        elif intent.intent == IntentType.ANALYTICS:
            return self._format_analytics_response(intent.domain, entities, result)
        elif intent.intent == IntentType.CREATE:
            return self._format_create_response(entities, result)
        else:
            return self._format_generic_response(result)

    def _format_no_results(self, intent: IntentResult, entities: ExtractedEntities) -> str:
        context_parts = []
        if entities.project:
            context_parts.append(f"project '{entities.project}'")
        if entities.block:
            context_parts.append(f"block '{entities.block}'")
        if entities.unit_number:
            context_parts.append(f"unit #{entities.unit_number}")
        context = " in ".join(context_parts) if context_parts else "the specified criteria"
        return f"No records found for {context}. Please verify the details and try again."

    def _format_read_response(self, domain, entities, result):
        data = result.data
        if domain == DomainType.INVENTORY:
            return self._format_inventory_response(entities, data)
        elif domain == DomainType.TRANSACTION:
            return self._format_transaction_response(data)
        elif domain == DomainType.PROJECT:
            return self._format_project_response(data)
        elif domain == DomainType.BLOCK:
            return self._format_block_response(data)
        elif domain == DomainType.CUSTOMER:
            return self._format_customer_response(data)
        elif domain == DomainType.BROKER:
            return self._format_broker_response(data)
        else:
            return self._format_generic_response(result)

    def _format_inventory_response(self, entities, data):
        if len(data) == 1:
            item = data[0]
            r = f"**{item.get('unit_type', 'Unit')} #{item.get('unit_number')}**\n"
            r += f"- Project: {item.get('project_name')}\n"
            r += f"- Block: {item.get('block_name')}\n"
            r += f"- Area: {item.get('area_marla')} marla\n"
            r += f"- Status: {item.get('status', item.get('current_status'))}\n"
            if item.get('rate_per_marla'):
                r += f"- Price: PKR {self._format_currency(item['rate_per_marla'])}/marla\n"
            if item.get('transaction_number'):
                r += f"\n**Transaction History:**\n"
                r += f"- Transaction: {item.get('transaction_number')}\n"
                r += f"- Booking Date: {item.get('booking_date')}\n"
                r += f"- Customer: {item.get('customer_name')}\n"
                r += f"- Amount: PKR {self._format_currency(item.get('total_value'))}\n"
            return r
        else:
            r = f"Found {len(data)} units:\n\n"
            for item in data[:10]:
                r += f"- #{item.get('unit_number')} ({item.get('block_name')}, {item.get('project_name')}): "
                r += f"{item.get('area_marla')} marla, {item.get('status')}\n"
            if len(data) > 10:
                r += f"\n... and {len(data) - 10} more."
            return r

    def _format_project_response(self, data):
        r = f"**Projects ({len(data)} total):**\n\n"
        for p in data:
            r += f"**{p.get('name')}** ({p.get('project_id', '')})\n"
            r += f"- Location: {p.get('location', 'N/A')}\n"
            r += f"- Blocks: {p.get('block_count', 0)} | Units: {p.get('unit_count', 0)}\n\n"
        return r

    def _format_block_response(self, data):
        r = f"**Blocks ({len(data)} total):**\n\n"
        for b in data:
            r += f"**{b.get('block_name')}** - {b.get('project_name')}\n"
            r += f"- Total: {b.get('inventory_count', 0)} | Available: {b.get('available_count', 0)} | Sold: {b.get('sold_count', 0)}\n\n"
        return r

    def _format_customer_response(self, data):
        if len(data) == 1:
            c = data[0]
            r = f"**Customer: {c.get('name')}**\n"
            r += f"- CNIC: {c.get('cnic', 'N/A')}\n"
            r += f"- Phone: {c.get('mobile', 'N/A')}\n"
            r += f"- Transactions: {c.get('transaction_count', 0)}\n"
            if c.get('total_investment'):
                r += f"- Total Investment: PKR {self._format_currency(c['total_investment'])}\n"
            return r
        r = f"**Customers ({len(data)} found):**\n\n"
        for c in data[:10]:
            txn_count = c.get('transaction_count', 0)
            details = c.get('mobile', 'N/A')
            if txn_count and txn_count > 0:
                details += f" | {txn_count} unit(s)"
            r += f"- **{c.get('name')}**: {details}\n"
        if len(data) > 10:
            r += f"\n... and {len(data) - 10} more."
        return r

    def _format_broker_response(self, data):
        if len(data) == 1:
            b = data[0]
            r = f"**Broker: {b.get('name')}**\n"
            r += f"- Company: {b.get('company', 'N/A')}\n"
            r += f"- Phone: {b.get('mobile', 'N/A')}\n"
            r += f"- Commission Rate: {b.get('commission_rate', 0)}%\n"
            r += f"- Transactions: {b.get('transaction_count', 0)}\n"
            return r
        r = f"**Brokers ({len(data)} found):**\n\n"
        for b in data[:10]:
            r += f"- **{b.get('name')}** ({b.get('company', 'N/A')}): {b.get('mobile', 'N/A')}\n"
        return r

    def _format_transaction_response(self, data):
        if len(data) == 1:
            txn = data[0]
            txn_id = txn.get('transaction_number') or txn.get('transaction_id')
            r = f"**Transaction {txn_id}**\n"
            r += f"- Unit: #{txn.get('unit_number')} ({txn.get('block_name')}, {txn.get('project_name')})\n"
            r += f"- Customer: {txn.get('customer_name')}\n"
            r += f"- Total Value: PKR {self._format_currency(txn.get('total_value'))}\n"
            r += f"- Status: {txn.get('status')}\n"
            return r
        r = f"Found {len(data)} transactions:\n\n"
        for txn in data[:10]:
            txn_id = txn.get('transaction_number') or txn.get('transaction_id')
            r += f"- {txn_id}: #{txn.get('unit_number')} ({txn.get('project_name')}) - "
            r += f"**{txn.get('customer_name', 'N/A')}** - PKR {self._format_currency(txn.get('total_value'))}\n"
        if len(data) > 10:
            r += f"\n... and {len(data) - 10} more."
        return r

    def _format_report_response(self, domain, entities, result):
        if domain == DomainType.RECEIVABLES:
            return self._format_receivables_report(entities, result.data)
        elif domain == DomainType.CUSTOMER:
            return self._format_customer_sales_report(entities, result.data)
        elif domain == DomainType.BLOCK:
            return self._format_block_sales_report(entities, result.data)
        else:
            return self._format_generic_response(result)

    def _format_customer_sales_report(self, entities, data):
        if not data:
            return "No sales data found."
        project_filter = f" - {entities.project}" if entities.project else ""
        r = f"**Customer-wise Sales Report{project_filter}**\n\n"
        total_amount = Decimal(0)
        for row in data:
            amount = Decimal(str(row.get('total_amount', 0)))
            received = Decimal(str(row.get('amount_received', 0)))
            pending = Decimal(str(row.get('amount_pending', 0)))
            total_amount += amount
            r += f"**{row.get('customer_name')}** ({row.get('customer_phone', 'N/A')})\n"
            r += f"- Units: {row.get('total_units', 0)} | Value: PKR {self._format_currency(amount)}\n"
            r += f"- Received: PKR {self._format_currency(received)} | Pending: PKR {self._format_currency(pending)}\n\n"
        r += f"---\n**Total: PKR {self._format_currency(total_amount)}**"
        return r

    def _format_block_sales_report(self, entities, data):
        if not data:
            return "No sales data found."
        project_filter = f" - {entities.project}" if entities.project else ""
        r = f"**Block-wise Sales Report{project_filter}**\n\n"
        for row in data:
            r += f"**{row.get('project_name')} - {row.get('block_name')}**\n"
            r += f"- Total: {row.get('total_units', 0)} | Sold: {row.get('sold_units', 0)} | Available: {row.get('available_units', 0)}\n\n"
        return r

    def _format_receivables_report(self, entities, data):
        r = "**Expected Receivables**\n\n"
        total_outstanding = Decimal(0)
        for row in data:
            outstanding = Decimal(str(row.get('outstanding', 0)))
            total_outstanding += outstanding
            r += f"**{row.get('project_name')}:**\n"
            r += f"- Outstanding: PKR {self._format_currency(outstanding)}\n"
            r += f"- Pending: {row.get('pending_count', 0)} | Overdue: {row.get('overdue_count', 0)}\n\n"
        r += f"---\n**Total Outstanding: PKR {self._format_currency(total_outstanding)}**"
        return r

    def _format_analytics_response(self, domain, entities, result):
        if domain == DomainType.CUSTOMER:
            return self._format_customer_portfolio(entities, result.data)
        elif domain == DomainType.INVENTORY:
            return self._format_inventory_summary(entities, result.data)
        else:
            return self._format_generic_response(result)

    def _format_customer_portfolio(self, entities, data):
        if not data:
            name = entities.customer_name or "the specified customer"
            return f"No portfolio data found for {name}."
        first = data[0]
        r = f"**Portfolio: {first.get('customer_name')}** ({first.get('customer_id', '')})\n"
        r += f"Phone: {first.get('mobile', 'N/A')}\n\n"
        grand_total = Decimal(0)
        grand_balance = Decimal(0)
        for row in data:
            total_value = Decimal(str(row.get('total_value', 0) or 0))
            balance = Decimal(str(row.get('balance', 0) or 0))
            grand_total += total_value
            grand_balance += balance
            r += f"**{row.get('unit_type', 'Unit')} #{row.get('unit_number')}** - {row.get('project_name')}, {row.get('block_name')}\n"
            r += f"- Value: PKR {self._format_currency(total_value)} | Balance: PKR {self._format_currency(balance)}\n\n"
        r += f"---\n**{len(data)} unit(s) | Total: PKR {self._format_currency(grand_total)} | Balance: PKR {self._format_currency(grand_balance)}**"
        return r

    def _format_inventory_summary(self, entities, data):
        r = "**Inventory Summary**\n\n"
        for row in data:
            r += f"**{row.get('project_name')} - {row.get('block_name')}:**\n"
            r += f"- Total: {row.get('total_units', 0)} | Available: {row.get('available', 0)} | Sold: {row.get('sold', 0)}\n\n"
        return r

    def format_task_dashboard(self, summary: Dict) -> str:
        # get_task_summary returns flat dict, not nested
        s = summary if isinstance(summary, dict) else {}
        r = "**Task Dashboard**\n\n"
        r += f"- Total: **{s.get('total', 0)}** | Completed: **{s.get('completed', 0)}** | In Progress: **{s.get('in_progress', 0)}**\n"
        r += f"- Pending Assignment: **{s.get('pending_assignment', 0)}** | Overdue: **{s.get('overdue', 0)}** | Due Today: **{s.get('due_today', 0)}**\n"
        by_dept = s.get("by_department", {})
        if by_dept:
            r += "\n**By Department:**\n"
            for dept, count in by_dept.items():
                r += f"- {dept}: {count}\n"
        by_priority = s.get("by_priority", {})
        if by_priority:
            r += "\n**By Priority:**\n"
            for prio, count in by_priority.items():
                r += f"- {prio.capitalize()}: {count}\n"
        return r

    def _format_create_response(self, entities, result):
        if result.data and len(result.data) > 0:
            item = result.data[0]
            r = f"Found unit #{entities.unit_number} in {entities.project}\n"
            r += f"- Area: {item.get('area_marla')} marla | Status: {item.get('status')}\n"
            return r
        return f"Could not find available unit #{entities.unit_number} in {entities.project}."

    def _format_generic_response(self, result):
        if not result.data:
            return "No data found."
        r = f"Found {result.row_count} records:\n\n"
        for row in result.data[:5]:
            r += "- " + ", ".join(f"{k}: {v}" for k, v in list(row.items())[:5]) + "\n"
        if result.row_count > 5:
            r += f"\n... and {result.row_count - 5} more."
        return r

    def _format_currency(self, amount) -> str:
        if amount is None:
            return "0"
        try:
            val = Decimal(str(amount))
            if val >= 10000000:
                return f"{val / 10000000:.2f} Crore"
            elif val >= 100000:
                return f"{val / 100000:.2f} Lakh"
            else:
                return f"{val:,.0f}"
        except Exception:
            return str(amount)

    def format_error(self, error: str) -> str:
        return f"I encountered an issue: {error}. Please try again or rephrase your query."


response_formatter = ResponseFormatter()
