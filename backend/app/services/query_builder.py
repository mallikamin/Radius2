"""
Query Builder for ORBIT CRM Voice Query Pipeline.
Builds parameterized SQL from intent + extracted entities.
Uses ORBIT schema: no blocks table, inventory.block is varchar.
"""
import logging
from typing import Dict, Any, Tuple, Optional
from app.services.intent_classifier import IntentType, DomainType, IntentResult
from app.services.entity_extractor import ExtractedEntities

logger = logging.getLogger(__name__)


class QueryBuilder:
    """Build SQL queries from intent and entities — ORBIT CRM schema."""

    QUERY_TEMPLATES = {
        (IntentType.READ, DomainType.PROJECT): """
            SELECT p.id, p.project_id, p.name, p.location, p.description, p.status,
                COUNT(DISTINCT i.block) as block_count, COUNT(DISTINCT i.id) as unit_count
            FROM projects p LEFT JOIN inventory i ON i.project_id = p.id
            WHERE 1=1 {conditions}
            GROUP BY p.id, p.project_id, p.name, p.location, p.description, p.status
            ORDER BY p.name
        """,

        (IntentType.READ, DomainType.BLOCK): """
            SELECT i.block as block_name, p.name as project_name, p.project_id as project_code,
                COUNT(DISTINCT i.id) as inventory_count,
                COUNT(CASE WHEN i.status = 'available' THEN 1 END) as available_count,
                COUNT(CASE WHEN i.status = 'sold' THEN 1 END) as sold_count,
                COUNT(CASE WHEN i.status = 'reserved' THEN 1 END) as reserved_count
            FROM inventory i JOIN projects p ON i.project_id = p.id
            WHERE i.block IS NOT NULL {conditions}
            GROUP BY i.block, p.name, p.project_id ORDER BY p.name, i.block
        """,

        (IntentType.READ, DomainType.CUSTOMER): """
            SELECT c.id, c.customer_id, c.name, c.cnic, c.mobile, c.email, c.address,
                COUNT(DISTINCT t.id) as transaction_count, SUM(t.total_value) as total_investment
            FROM customers c LEFT JOIN transactions t ON t.customer_id = c.id
            LEFT JOIN inventory i ON t.inventory_id = i.id LEFT JOIN projects p ON i.project_id = p.id
            WHERE 1=1 {conditions}
            GROUP BY c.id, c.customer_id, c.name, c.cnic, c.mobile, c.email, c.address
            ORDER BY c.name
        """,

        (IntentType.READ, DomainType.BROKER): """
            SELECT br.id, br.broker_id, br.name, br.company, br.mobile, br.email,
                br.commission_rate, br.status,
                COUNT(DISTINCT t.id) as transaction_count, SUM(t.total_value) as total_sales_value
            FROM brokers br LEFT JOIN transactions t ON t.broker_id = br.id
            LEFT JOIN inventory i ON t.inventory_id = i.id LEFT JOIN projects p ON i.project_id = p.id
            WHERE 1=1 {conditions}
            GROUP BY br.id, br.broker_id, br.name, br.company, br.mobile, br.email, br.commission_rate, br.status
            ORDER BY br.name
        """,

        (IntentType.READ, DomainType.INVENTORY): """
            SELECT i.id, i.inventory_id, i.unit_number, i.unit_type, i.area_marla, i.status,
                i.rate_per_marla, i.block as block_name, p.name as project_name, p.project_id as project_code
            FROM inventory i JOIN projects p ON i.project_id = p.id
            WHERE 1=1 {conditions} ORDER BY i.unit_number
        """,

        (IntentType.READ, "INVENTORY_HISTORY"): """
            SELECT i.unit_number, i.unit_type, i.area_marla, i.status as current_status,
                i.block as block_name, p.name as project_name,
                t.transaction_id as transaction_number, t.booking_date, t.rate_per_marla,
                t.total_value, t.status as transaction_status, c.name as customer_name
            FROM inventory i JOIN projects p ON i.project_id = p.id
            LEFT JOIN transactions t ON t.inventory_id = i.id
            LEFT JOIN customers c ON t.customer_id = c.id
            WHERE 1=1 {conditions} ORDER BY t.booking_date DESC NULLS LAST
        """,

        (IntentType.READ, DomainType.TRANSACTION): """
            SELECT t.transaction_id as transaction_number, t.booking_date,
                t.rate_per_marla, t.area_marla, t.total_value, t.status,
                i.unit_number, i.block as block_name, p.name as project_name,
                c.name as customer_name, c.mobile as customer_phone,
                br.name as broker_name, cr.name as sales_rep_name
            FROM transactions t JOIN inventory i ON t.inventory_id = i.id
            JOIN projects p ON i.project_id = p.id JOIN customers c ON t.customer_id = c.id
            LEFT JOIN brokers br ON t.broker_id = br.id
            LEFT JOIN company_reps cr ON t.company_rep_id = cr.id
            WHERE 1=1 {conditions} ORDER BY t.booking_date DESC
        """,

        (IntentType.REPORT, DomainType.CUSTOMER): """
            SELECT c.name as customer_name, c.mobile as customer_phone,
                COUNT(DISTINCT t.id) as total_transactions, COUNT(DISTINCT i.id) as total_units,
                SUM(i.area_marla) as total_marla, SUM(t.total_value) as total_amount,
                COALESCE((SELECT SUM(r.amount) FROM receipts r WHERE r.customer_id = c.id), 0) as amount_received,
                SUM(t.total_value) - COALESCE((SELECT SUM(r.amount) FROM receipts r WHERE r.customer_id = c.id), 0) as amount_pending,
                STRING_AGG(DISTINCT p.name, ', ') as projects
            FROM customers c JOIN transactions t ON t.customer_id = c.id
            JOIN inventory i ON t.inventory_id = i.id JOIN projects p ON i.project_id = p.id
            WHERE t.status != 'cancelled' {conditions}
            GROUP BY c.id, c.name, c.mobile ORDER BY total_amount DESC
        """,

        (IntentType.REPORT, DomainType.BLOCK): """
            SELECT p.name as project_name, i.block as block_name,
                COUNT(DISTINCT i.id) as total_units,
                COUNT(DISTINCT CASE WHEN i.status = 'sold' THEN i.id END) as sold_units,
                COUNT(DISTINCT CASE WHEN i.status = 'available' THEN i.id END) as available_units,
                SUM(CASE WHEN i.status = 'sold' THEN i.area_marla ELSE 0 END) as sold_marla,
                SUM(CASE WHEN i.status = 'available' THEN i.area_marla ELSE 0 END) as available_marla,
                SUM(t.total_value) as total_sales_value,
                COUNT(DISTINCT t.customer_id) as unique_customers
            FROM inventory i JOIN projects p ON i.project_id = p.id
            LEFT JOIN transactions t ON t.inventory_id = i.id AND t.status != 'cancelled'
            WHERE i.block IS NOT NULL {conditions}
            GROUP BY p.id, p.name, i.block ORDER BY p.name, i.block
        """,

        (IntentType.REPORT, DomainType.RECEIVABLES): """
            SELECT p.name as project_name, COUNT(inst.id) as installment_count,
                SUM(inst.amount) as total_expected, SUM(inst.amount_paid) as total_paid,
                SUM(inst.amount - inst.amount_paid) as outstanding,
                COUNT(CASE WHEN inst.status = 'pending' THEN 1 END) as pending_count,
                COUNT(CASE WHEN inst.status = 'overdue' THEN 1 END) as overdue_count
            FROM installments inst JOIN transactions t ON inst.transaction_id = t.id
            JOIN inventory i ON t.inventory_id = i.id JOIN projects p ON i.project_id = p.id
            WHERE inst.status IN ('pending', 'partial', 'overdue') {conditions}
            GROUP BY p.id, p.name ORDER BY outstanding DESC
        """,

        (IntentType.ANALYTICS, DomainType.CUSTOMER): """
            SELECT c.name as customer_name, c.customer_id, c.mobile, c.cnic,
                p.name as project_name, i.unit_number, i.unit_type, i.block as block_name,
                i.area_marla, i.status as unit_status,
                t.transaction_id as transaction_number, t.booking_date, t.rate_per_marla,
                t.total_value, t.status as transaction_status,
                COALESCE(inst_summary.total_due, 0) as total_due,
                COALESCE(inst_summary.total_paid, 0) as total_paid,
                COALESCE(inst_summary.total_due, 0) - COALESCE(inst_summary.total_paid, 0) as balance,
                COALESCE(inst_summary.pending_count, 0) as pending_installments,
                COALESCE(inst_summary.overdue_count, 0) as overdue_installments
            FROM customers c JOIN transactions t ON t.customer_id = c.id
            JOIN inventory i ON t.inventory_id = i.id JOIN projects p ON i.project_id = p.id
            LEFT JOIN LATERAL (
                SELECT SUM(inst.amount) as total_due, SUM(inst.amount_paid) as total_paid,
                    COUNT(CASE WHEN inst.status = 'pending' THEN 1 END) as pending_count,
                    COUNT(CASE WHEN inst.status = 'overdue' THEN 1 END) as overdue_count
                FROM installments inst WHERE inst.transaction_id = t.id
            ) inst_summary ON true
            WHERE t.status != 'cancelled' {conditions} ORDER BY t.booking_date DESC
        """,

        (IntentType.ANALYTICS, DomainType.INVENTORY): """
            SELECT p.name as project_name, i.block as block_name,
                COUNT(i.id) as total_units, SUM(i.area_marla) as total_marla,
                COUNT(CASE WHEN i.status = 'available' THEN 1 END) as available,
                COUNT(CASE WHEN i.status = 'reserved' THEN 1 END) as reserved,
                COUNT(CASE WHEN i.status = 'sold' THEN 1 END) as sold
            FROM inventory i JOIN projects p ON i.project_id = p.id
            WHERE 1=1 {conditions}
            GROUP BY p.id, p.name, i.block ORDER BY p.name, i.block
        """,

        (IntentType.ANALYTICS, DomainType.FDA_APPROVED): """
            SELECT p.name as project_name, COUNT(i.id) as unit_count,
                SUM(i.area_marla) as total_marla,
                SUM(CASE WHEN i.status = 'available' THEN i.area_marla ELSE 0 END) as available_marla,
                SUM(CASE WHEN i.status = 'sold' THEN i.area_marla ELSE 0 END) as sold_marla
            FROM inventory i JOIN projects p ON i.project_id = p.id
            WHERE 1=1 {conditions}
            GROUP BY p.id, p.name ORDER BY total_marla DESC
        """,

        # === EOI Templates ===
        (IntentType.READ, DomainType.EOI): """
            SELECT e.eoi_id, e.party_name, e.party_mobile, e.party_cnic,
                e.amount, e.marlas, e.unit_number, e.eoi_date, e.status,
                e.payment_method, e.payment_received, e.broker_name, e.notes,
                p.name as project_name, p.project_id as project_code,
                cr.name as recorded_by
            FROM eoi_collections e
            JOIN projects p ON e.project_id = p.id
            LEFT JOIN company_reps cr ON e.created_by = cr.id
            WHERE 1=1 {conditions}
            ORDER BY e.eoi_date DESC
        """,

        (IntentType.REPORT, DomainType.EOI): """
            SELECT p.name as project_name,
                COUNT(e.id) as total_eois,
                COUNT(CASE WHEN e.status = 'active' THEN 1 END) as active_count,
                COUNT(CASE WHEN e.status = 'converted' THEN 1 END) as converted_count,
                COUNT(CASE WHEN e.status = 'cancelled' THEN 1 END) as cancelled_count,
                COUNT(CASE WHEN e.status = 'refunded' THEN 1 END) as refunded_count,
                SUM(e.amount) as total_amount,
                SUM(CASE WHEN e.payment_received THEN e.amount ELSE 0 END) as received_amount,
                SUM(e.marlas) as total_marlas
            FROM eoi_collections e
            JOIN projects p ON e.project_id = p.id
            WHERE 1=1 {conditions}
            GROUP BY p.id, p.name ORDER BY total_eois DESC
        """,

        (IntentType.ANALYTICS, DomainType.EOI): """
            SELECT COUNT(e.id) as total_eois,
                COUNT(CASE WHEN e.status = 'active' THEN 1 END) as active,
                COUNT(CASE WHEN e.status = 'converted' THEN 1 END) as converted,
                COUNT(CASE WHEN e.status = 'cancelled' THEN 1 END) as cancelled,
                SUM(e.amount) as total_amount,
                SUM(e.marlas) as total_marlas
            FROM eoi_collections e
            JOIN projects p ON e.project_id = p.id
            WHERE 1=1 {conditions}
        """,

        # === Zakat Templates ===
        (IntentType.READ, DomainType.ZAKAT): """
            SELECT z.zakat_id, z.beneficiary_name, z.beneficiary_cnic, z.beneficiary_mobile,
                z.amount, z.category, z.purpose, z.status,
                z.approval_status, z.approved_amount, z.case_status,
                z.disbursement_date, z.payment_method,
                cr.name as created_by_name
            FROM zakat_records z
            LEFT JOIN company_reps cr ON z.created_by = cr.id
            WHERE 1=1 {conditions}
            ORDER BY z.created_at DESC
        """,

        (IntentType.REPORT, DomainType.ZAKAT): """
            SELECT z.category,
                COUNT(z.id) as total_cases,
                COUNT(CASE WHEN z.approval_status = 'approved' THEN 1 END) as approved_count,
                COUNT(CASE WHEN z.approval_status = 'pending' THEN 1 END) as pending_count,
                COUNT(CASE WHEN z.approval_status = 'rejected' THEN 1 END) as rejected_count,
                SUM(z.amount) as requested_amount,
                SUM(COALESCE(z.approved_amount, 0)) as approved_amount,
                SUM(CASE WHEN z.case_status = 'closed' THEN COALESCE(z.approved_amount, 0) ELSE 0 END) as disbursed_amount
            FROM zakat_records z
            WHERE 1=1 {conditions}
            GROUP BY z.category ORDER BY total_cases DESC
        """,

        (IntentType.ANALYTICS, DomainType.ZAKAT): """
            SELECT COUNT(z.id) as total_cases,
                COUNT(CASE WHEN z.approval_status = 'approved' THEN 1 END) as approved,
                COUNT(CASE WHEN z.approval_status = 'pending' THEN 1 END) as pending,
                COUNT(CASE WHEN z.case_status = 'closed' THEN 1 END) as closed,
                SUM(z.amount) as total_requested,
                SUM(COALESCE(z.approved_amount, 0)) as total_approved
            FROM zakat_records z
            WHERE 1=1 {conditions}
        """,
    }

    def build(self, intent: IntentResult, entities: ExtractedEntities) -> Tuple[Optional[str], Dict[str, Any]]:
        template_key = (intent.intent, intent.domain)

        if intent.intent == IntentType.READ and intent.domain == DomainType.INVENTORY:
            if entities.unit_number:
                template_key = (IntentType.READ, "INVENTORY_HISTORY")

        template = self.QUERY_TEMPLATES.get(template_key)
        if not template:
            logger.warning(f"No template for intent: {intent.intent}, domain: {intent.domain}")
            return None, {}

        conditions, params = self._build_conditions(intent, entities)
        query = template.format(conditions=conditions)
        return query, params

    def _build_conditions(self, intent: IntentResult, entities: ExtractedEntities) -> Tuple[str, Dict[str, Any]]:
        conditions = []
        params = {}

        if entities.project:
            conditions.append("AND LOWER(p.name) = LOWER(:project_name)")
            params["project_name"] = entities.project

        if entities.block:
            conditions.append("AND LOWER(i.block) ILIKE LOWER(:block_name)")
            params["block_name"] = f"%{entities.block}%"

        if entities.unit_number:
            conditions.append("AND i.unit_number = :unit_number")
            params["unit_number"] = entities.unit_number

        if entities.transaction_number:
            conditions.append("AND t.transaction_id ILIKE :txn_number")
            params["txn_number"] = f"%{entities.transaction_number}%"

        if entities.customer_name:
            conditions.append("AND LOWER(c.name) ILIKE LOWER(:customer_name)")
            params["customer_name"] = f"%{entities.customer_name}%"

        if entities.raw_entities.get("broker_name"):
            broker_name = entities.raw_entities["broker_name"]
            conditions.append("AND (LOWER(br.name) ILIKE LOWER(:broker_name) OR LOWER(br.company) ILIKE LOWER(:broker_name))")
            params["broker_name"] = f"%{broker_name}%"

        if entities.date_range_start and entities.date_range_end:
            if intent.domain == DomainType.RECEIVABLES:
                conditions.append("AND inst.due_date BETWEEN :start_date AND :end_date")
            else:
                conditions.append("AND t.booking_date BETWEEN :start_date AND :end_date")
            params["start_date"] = entities.date_range_start
            params["end_date"] = entities.date_range_end

        if entities.unit_type:
            conditions.append("AND LOWER(i.unit_type) = LOWER(:unit_type)")
            params["unit_type"] = entities.unit_type

        if entities.raw_entities.get("inventory_status"):
            conditions.append("AND LOWER(i.status) = LOWER(:inventory_status)")
            params["inventory_status"] = entities.raw_entities["inventory_status"]

        # EOI conditions
        if entities.raw_entities.get("eoi_id"):
            conditions.append("AND e.eoi_id = :eoi_id")
            params["eoi_id"] = entities.raw_entities["eoi_id"]

        if entities.raw_entities.get("eoi_status"):
            conditions.append("AND LOWER(e.status) = LOWER(:eoi_status)")
            params["eoi_status"] = entities.raw_entities["eoi_status"]

        # Zakat conditions
        if entities.raw_entities.get("zakat_id"):
            conditions.append("AND z.zakat_id = :zakat_id")
            params["zakat_id"] = entities.raw_entities["zakat_id"]

        if entities.raw_entities.get("zakat_category"):
            conditions.append("AND LOWER(z.category) = LOWER(:zakat_category)")
            params["zakat_category"] = entities.raw_entities["zakat_category"]

        if entities.raw_entities.get("beneficiary_name"):
            conditions.append("AND LOWER(z.beneficiary_name) ILIKE LOWER(:beneficiary_name)")
            params["beneficiary_name"] = f"%{entities.raw_entities['beneficiary_name']}%"

        if entities.raw_entities.get("beneficiary_id"):
            conditions.append("AND b.beneficiary_id = :beneficiary_id")
            params["beneficiary_id"] = entities.raw_entities["beneficiary_id"]

        return "\n            ".join(conditions), params


query_builder = QueryBuilder()
