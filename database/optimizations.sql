-- Radius CRM - Database Optimizations for Scale
-- Run this after all phase SQL files

-- =============================================
-- COMPOSITE INDEXES FOR COMMON QUERIES
-- =============================================

-- Customer transactions lookup
CREATE INDEX IF NOT EXISTS idx_transactions_customer_date ON transactions(customer_id, booking_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_project_status ON transactions(project_id, status);

-- Installment queries (overdue calculations)
CREATE INDEX IF NOT EXISTS idx_installments_due_status ON installments(due_date, status) WHERE status != 'paid';
CREATE INDEX IF NOT EXISTS idx_installments_transaction_due ON installments(transaction_id, due_date);

-- Receipt queries
CREATE INDEX IF NOT EXISTS idx_receipts_customer_date ON receipts(customer_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_transaction_date ON receipts(transaction_id, payment_date DESC);

-- Payment queries
CREATE INDEX IF NOT EXISTS idx_payments_broker_type_date ON payments(broker_id, payment_type, payment_date DESC) WHERE broker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_rep_type_date ON payments(company_rep_id, payment_type, payment_date DESC) WHERE company_rep_id IS NOT NULL;

-- Interaction queries
CREATE INDEX IF NOT EXISTS idx_interactions_customer_date ON interactions(customer_id, created_at DESC) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_interactions_broker_date ON interactions(broker_id, created_at DESC) WHERE broker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_interactions_rep_date ON interactions(company_rep_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_followup ON interactions(next_follow_up) WHERE next_follow_up IS NOT NULL;

-- Inventory queries
CREATE INDEX IF NOT EXISTS idx_inventory_project_status ON inventory(project_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_status_value ON inventory(status, (area_marla * rate_per_marla) DESC);

-- Media queries
CREATE INDEX IF NOT EXISTS idx_media_entity_created ON media_files(entity_type, entity_id, created_at DESC);

-- =============================================
-- FULL-TEXT SEARCH INDEXES (if needed)
-- =============================================

-- Customer name/mobile search
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm ON customers USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_mobile_trgm ON customers USING gin(mobile gin_trgm_ops);

-- Note: Requires pg_trgm extension
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =============================================
-- MATERIALIZED VIEWS FOR COMPLEX AGGREGATIONS
-- =============================================

-- Customer financial summary (refresh periodically)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_customer_financials AS
SELECT 
    c.id as customer_id,
    c.customer_id as customer_code,
    c.name,
    COUNT(DISTINCT t.id) as total_transactions,
    COALESCE(SUM(t.total_value), 0) as total_sale_value,
    COALESCE(SUM(i.amount_paid), 0) as total_received,
    COALESCE(SUM(t.total_value), 0) - COALESCE(SUM(i.amount_paid), 0) as outstanding
FROM customers c
LEFT JOIN transactions t ON t.customer_id = c.id
LEFT JOIN installments i ON i.transaction_id = t.id
GROUP BY c.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_customer_financials_id ON mv_customer_financials(customer_id);

-- Project financial summary
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_project_financials AS
SELECT 
    p.id as project_id,
    p.project_id as project_code,
    p.name,
    COUNT(DISTINCT inv.id) FILTER (WHERE inv.status = 'available') as available_units,
    COUNT(DISTINCT inv.id) FILTER (WHERE inv.status = 'sold') as sold_units,
    COUNT(DISTINCT t.id) as total_transactions,
    COALESCE(SUM(t.total_value), 0) as total_sale_value,
    COALESCE(SUM(i.amount_paid), 0) as total_received
FROM projects p
LEFT JOIN inventory inv ON inv.project_id = p.id
LEFT JOIN transactions t ON t.project_id = p.id
LEFT JOIN installments i ON i.transaction_id = t.id
GROUP BY p.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_project_financials_id ON mv_project_financials(project_id);

-- Broker commission summary
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_broker_commission AS
SELECT 
    b.id as broker_id,
    b.broker_id as broker_code,
    b.name,
    COUNT(DISTINCT t.id) as total_transactions,
    COALESCE(SUM(t.total_value), 0) as total_sale_value,
    COALESCE(SUM(t.total_value * t.broker_commission_rate / 100), 0) as total_commission_earned,
    COALESCE(SUM(pay.amount), 0) as total_commission_paid
FROM brokers b
LEFT JOIN transactions t ON t.broker_id = b.id
LEFT JOIN payments pay ON pay.broker_id = b.id AND pay.payment_type = 'broker_commission' AND pay.status = 'completed'
GROUP BY b.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_broker_commission_id ON mv_broker_commission(broker_id);

-- =============================================
-- REFRESH FUNCTION FOR MATERIALIZED VIEWS
-- =============================================

CREATE OR REPLACE FUNCTION refresh_financial_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_customer_financials;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_project_financials;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_broker_commission;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- CONNECTION POOLING VERIFICATION
-- =============================================

-- Note: Connection pooling is configured in SQLAlchemy engine
-- Verify with: SHOW max_connections;
-- Recommended: max_connections = 100, pool_size = 20

-- =============================================
-- QUERY PERFORMANCE MONITORING
-- =============================================

-- Enable query statistics (if not already enabled)
-- ALTER SYSTEM SET track_io_timing = on;
-- ALTER SYSTEM SET track_functions = all;
-- SELECT pg_reload_conf();

-- =============================================
-- VACUUM AND ANALYZE
-- =============================================

-- Run periodically to maintain performance
-- VACUUM ANALYZE customers;
-- VACUUM ANALYZE transactions;
-- VACUUM ANALYZE installments;
-- VACUUM ANALYZE receipts;
-- VACUUM ANALYZE payments;

-- =============================================
-- VERIFY INDEXES
-- =============================================

SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('customers', 'transactions', 'installments', 'receipts', 'payments', 'interactions', 'inventory', 'media_files')
ORDER BY tablename, indexname;

