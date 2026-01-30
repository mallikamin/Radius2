-- ============================================
-- RADIUS CRM v3.1 - DEPLOYMENT CONFIGURATION
-- PostgreSQL Optimization, Backup, and User Roles
-- ============================================

-- ============================================
-- 1. PERFORMANCE INDEXES
-- ============================================

-- Customers indexes
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers(mobile);
CREATE INDEX IF NOT EXISTS idx_customers_customer_id ON customers(customer_id);

-- Brokers indexes
CREATE INDEX IF NOT EXISTS idx_brokers_mobile ON brokers(mobile);
CREATE INDEX IF NOT EXISTS idx_brokers_broker_id ON brokers(broker_id);
CREATE INDEX IF NOT EXISTS idx_brokers_status ON brokers(status);

-- Projects indexes
CREATE INDEX IF NOT EXISTS idx_projects_project_id ON projects(project_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- Inventory indexes
CREATE INDEX IF NOT EXISTS idx_inventory_project_id ON inventory(project_id);
CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory(status);
CREATE INDEX IF NOT EXISTS idx_inventory_inventory_id ON inventory(inventory_id);

-- Transactions indexes
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_broker_id ON transactions(broker_id);
CREATE INDEX IF NOT EXISTS idx_transactions_project_id ON transactions(project_id);
CREATE INDEX IF NOT EXISTS idx_transactions_booking_date ON transactions(booking_date);
CREATE INDEX IF NOT EXISTS idx_transactions_transaction_id ON transactions(transaction_id);

-- Installments indexes
CREATE INDEX IF NOT EXISTS idx_installments_transaction_id ON installments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_installments_due_date ON installments(due_date);
CREATE INDEX IF NOT EXISTS idx_installments_status ON installments(status);

-- Receipts indexes
CREATE INDEX IF NOT EXISTS idx_receipts_customer_id ON receipts(customer_id);
CREATE INDEX IF NOT EXISTS idx_receipts_transaction_id ON receipts(transaction_id);
CREATE INDEX IF NOT EXISTS idx_receipts_payment_date ON receipts(payment_date);

-- Receipt allocations indexes
CREATE INDEX IF NOT EXISTS idx_receipt_allocations_receipt_id ON receipt_allocations(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_allocations_installment_id ON receipt_allocations(installment_id);

-- Payments indexes
CREATE INDEX IF NOT EXISTS idx_payments_broker_id ON payments(broker_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_type ON payments(payment_type);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date);

-- Interactions indexes
CREATE INDEX IF NOT EXISTS idx_interactions_customer_id ON interactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_interactions_broker_id ON interactions(broker_id);
CREATE INDEX IF NOT EXISTS idx_interactions_created_at ON interactions(created_at);

-- ============================================
-- 2. USER ROLES AND PERMISSIONS
-- ============================================

-- Create roles (run as superuser)
DO $$
BEGIN
    -- Admin role - full access
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'crm_admin') THEN
        CREATE ROLE crm_admin LOGIN PASSWORD 'admin_secure_password_change_this';
    END IF;
    
    -- Manager role - read all, write transactions/receipts/payments
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'crm_manager') THEN
        CREATE ROLE crm_manager LOGIN PASSWORD 'manager_secure_password_change_this';
    END IF;
    
    -- Sales rep role - limited access
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'crm_sales') THEN
        CREATE ROLE crm_sales LOGIN PASSWORD 'sales_secure_password_change_this';
    END IF;
    
    -- Accountant role - read all, write receipts/payments
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'crm_accountant') THEN
        CREATE ROLE crm_accountant LOGIN PASSWORD 'accountant_secure_password_change_this';
    END IF;
END
$$;

-- Grant permissions to admin (full access)
GRANT ALL PRIVILEGES ON DATABASE sitara_crm TO crm_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO crm_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO crm_admin;

-- Grant permissions to manager
GRANT CONNECT ON DATABASE sitara_crm TO crm_manager;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO crm_manager;
GRANT INSERT, UPDATE, DELETE ON transactions, installments, receipts, receipt_allocations, payments, interactions TO crm_manager;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO crm_manager;

-- Grant permissions to sales rep
GRANT CONNECT ON DATABASE sitara_crm TO crm_sales;
GRANT SELECT ON customers, brokers, projects, inventory, transactions, installments TO crm_sales;
GRANT INSERT, UPDATE ON customers, interactions, leads TO crm_sales;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO crm_sales;

-- Grant permissions to accountant
GRANT CONNECT ON DATABASE sitara_crm TO crm_accountant;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO crm_accountant;
GRANT INSERT, UPDATE, DELETE ON receipts, receipt_allocations, payments TO crm_accountant;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO crm_accountant;

-- ============================================
-- 3. POSTGRESQL CONFIGURATION RECOMMENDATIONS
-- ============================================

-- Add these to postgresql.conf for better performance:
/*
# Memory settings (adjust based on server RAM)
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 16MB
maintenance_work_mem = 128MB

# Connection settings
max_connections = 50
superuser_reserved_connections = 3

# WAL settings for better write performance
wal_buffers = 16MB
checkpoint_completion_target = 0.9

# Logging
log_destination = 'csvlog'
logging_collector = on
log_directory = 'pg_log'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
log_rotation_age = 1d
log_rotation_size = 100MB

# Query logging (for debugging - disable in production)
log_min_duration_statement = 1000  # Log queries taking > 1 second
*/

-- ============================================
-- 4. BACKUP COMMANDS
-- ============================================

-- Daily backup (add to crontab):
-- 0 2 * * * pg_dump -U sitara -h localhost sitara_crm > /backups/daily/sitara_crm_$(date +\%Y\%m\%d).sql

-- Weekly full backup with compression:
-- 0 3 * * 0 pg_dump -U sitara -h localhost -Fc sitara_crm > /backups/weekly/sitara_crm_$(date +\%Y\%m\%d).dump

-- Monthly schema-only backup:
-- 0 4 1 * * pg_dump -U sitara -h localhost --schema-only sitara_crm > /backups/monthly/sitara_crm_schema_$(date +\%Y\%m).sql

-- Restore from backup:
-- psql -U sitara -d sitara_crm < /backups/daily/sitara_crm_20250125.sql
-- pg_restore -U sitara -d sitara_crm /backups/weekly/sitara_crm_20250125.dump

-- ============================================
-- 5. MAINTENANCE COMMANDS
-- ============================================

-- Run periodically for performance:
VACUUM ANALYZE;

-- Reindex for better query performance:
REINDEX DATABASE sitara_crm;

-- Check table sizes:
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) as total_size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC;

-- ============================================
-- 6. DATA INTEGRITY CHECK
-- ============================================

-- Check for orphaned installments (no transaction)
SELECT i.* FROM installments i
LEFT JOIN transactions t ON i.transaction_id = t.id
WHERE t.id IS NULL;

-- Check for orphaned receipts (no customer)
SELECT r.* FROM receipts r
LEFT JOIN customers c ON r.customer_id = c.id
WHERE c.id IS NULL;

-- Check for allocations without matching installments
SELECT ra.* FROM receipt_allocations ra
LEFT JOIN installments i ON ra.installment_id = i.id
WHERE i.id IS NULL;

-- Verify installment amounts match allocations
SELECT 
    i.id,
    i.amount_paid as recorded_paid,
    COALESCE(SUM(ra.amount), 0) as calculated_paid,
    i.amount_paid - COALESCE(SUM(ra.amount), 0) as difference
FROM installments i
LEFT JOIN receipt_allocations ra ON ra.installment_id = i.id
GROUP BY i.id
HAVING i.amount_paid != COALESCE(SUM(ra.amount), 0);

-- ============================================
-- 7. USEFUL VIEWS
-- ============================================

-- Customer balances view
CREATE OR REPLACE VIEW vw_customer_balances AS
SELECT 
    c.id,
    c.customer_id,
    c.name,
    c.mobile,
    COALESCE(SUM(t.total_value), 0) as total_sale,
    COALESCE(SUM(i.amount_paid), 0) as total_paid,
    COALESCE(SUM(t.total_value), 0) - COALESCE(SUM(i.amount_paid), 0) as balance
FROM customers c
LEFT JOIN transactions t ON t.customer_id = c.id
LEFT JOIN installments i ON i.transaction_id = t.id
GROUP BY c.id, c.customer_id, c.name, c.mobile;

-- Overdue installments view
CREATE OR REPLACE VIEW vw_overdue_installments AS
SELECT 
    c.customer_id,
    c.name as customer_name,
    c.mobile,
    t.transaction_id,
    p.name as project_name,
    t.unit_number,
    i.installment_number,
    i.due_date,
    i.amount,
    COALESCE(i.amount_paid, 0) as paid,
    i.amount - COALESCE(i.amount_paid, 0) as balance,
    CURRENT_DATE - i.due_date as days_overdue
FROM installments i
JOIN transactions t ON i.transaction_id = t.id
JOIN customers c ON t.customer_id = c.id
JOIN projects p ON t.project_id = p.id
WHERE i.due_date < CURRENT_DATE AND i.status != 'paid'
ORDER BY i.due_date;

-- Broker performance view
CREATE OR REPLACE VIEW vw_broker_performance AS
SELECT 
    b.broker_id,
    b.name,
    b.company,
    COUNT(t.id) as total_deals,
    COALESCE(SUM(t.total_value), 0) as total_value,
    COALESCE(SUM(t.total_value * t.broker_commission_rate / 100), 0) as commission_earned,
    COALESCE((SELECT SUM(amount) FROM payments WHERE broker_id = b.id AND payment_type = 'broker_commission' AND status = 'completed'), 0) as commission_paid
FROM brokers b
LEFT JOIN transactions t ON t.broker_id = b.id
GROUP BY b.id, b.broker_id, b.name, b.company;

-- ============================================
-- 8. RECALCULATE INSTALLMENTS FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION recalculate_all_installments() 
RETURNS void AS $$
BEGIN
    -- Reset all installments
    UPDATE installments SET amount_paid = 0, status = 'pending';
    
    -- Recalculate from allocations
    UPDATE installments i SET 
        amount_paid = COALESCE((
            SELECT SUM(ra.amount) 
            FROM receipt_allocations ra 
            WHERE ra.installment_id = i.id
        ), 0);
    
    -- Update statuses
    UPDATE installments SET status = 'paid' WHERE amount_paid >= amount;
    UPDATE installments SET status = 'partial' WHERE amount_paid > 0 AND amount_paid < amount;
END;
$$ LANGUAGE plpgsql;

-- Run with: SELECT recalculate_all_installments();
