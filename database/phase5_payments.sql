-- Radius CRM - Phase 5: Payments & Creditors
-- Run this after setup_all_tables.sql

-- =============================================
-- CREDITORS TABLE (for future payment tracking)
-- =============================================
CREATE TABLE IF NOT EXISTS creditors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creditor_id VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    mobile VARCHAR(20),
    company VARCHAR(255),
    bank_name VARCHAR(100),
    bank_account VARCHAR(50),
    bank_iban VARCHAR(50),
    notes TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE SEQUENCE IF NOT EXISTS creditor_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_creditor_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.creditor_id IS NULL THEN
        NEW.creditor_id := 'CRD-' || LPAD(nextval('creditor_id_seq')::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_creditor_id ON creditors;
CREATE TRIGGER trg_creditor_id BEFORE INSERT ON creditors FOR EACH ROW EXECUTE FUNCTION generate_creditor_id();

-- =============================================
-- PAYMENTS TABLE (Outgoing - Commissions, Incentives, Creditor Payments)
-- =============================================
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id VARCHAR(20) UNIQUE NOT NULL,
    payment_type VARCHAR(50) NOT NULL,  -- broker_commission, rep_incentive, creditor, other
    payee_type VARCHAR(50),  -- broker, company_rep, creditor
    broker_id UUID REFERENCES brokers(id) ON DELETE SET NULL,
    company_rep_id UUID REFERENCES company_reps(id) ON DELETE SET NULL,
    creditor_id UUID REFERENCES creditors(id) ON DELETE SET NULL,
    transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    amount DECIMAL(15,2) NOT NULL,
    payment_method VARCHAR(50),  -- cash, cheque, bank_transfer
    reference_number VARCHAR(100),
    payment_date DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    approved_by_rep_id UUID REFERENCES company_reps(id),
    status VARCHAR(20) DEFAULT 'completed',  -- pending, completed, cancelled
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payments_broker ON payments(broker_id);
CREATE INDEX IF NOT EXISTS idx_payments_rep ON payments(company_rep_id);
CREATE INDEX IF NOT EXISTS idx_payments_creditor ON payments(creditor_id);
CREATE INDEX IF NOT EXISTS idx_payments_transaction ON payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(payment_type);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

CREATE SEQUENCE IF NOT EXISTS payment_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_payment_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.payment_id IS NULL THEN
        NEW.payment_id := 'PAY-' || LPAD(nextval('payment_id_seq')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_id ON payments;
CREATE TRIGGER trg_payment_id BEFORE INSERT ON payments FOR EACH ROW EXECUTE FUNCTION generate_payment_id();

-- =============================================
-- PAYMENT ALLOCATIONS TABLE (links payments to transactions)
-- =============================================
CREATE TABLE IF NOT EXISTS payment_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL REFERENCES transactions(id),
    amount DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_alloc_payment ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_alloc_transaction ON payment_allocations(transaction_id);

-- =============================================
-- USEFUL VIEWS FOR REPORTS
-- =============================================

-- Customer financial summary view
CREATE OR REPLACE VIEW v_customer_financials AS
SELECT 
    c.id as customer_id,
    c.customer_id as customer_code,
    c.name,
    c.mobile,
    COUNT(DISTINCT t.id) as total_transactions,
    COALESCE(SUM(t.total_value), 0) as total_sale_value,
    COALESCE(SUM(i.amount_paid), 0) as total_received,
    COALESCE(SUM(t.total_value), 0) - COALESCE(SUM(i.amount_paid), 0) as outstanding
FROM customers c
LEFT JOIN transactions t ON t.customer_id = c.id
LEFT JOIN installments i ON i.transaction_id = t.id
GROUP BY c.id;

-- Project financial summary view
CREATE OR REPLACE VIEW v_project_financials AS
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

-- Broker commission summary view  
CREATE OR REPLACE VIEW v_broker_commission AS
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

-- Verify tables created
SELECT 'Phase 5 tables created:' as info;
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('creditors', 'payments')
ORDER BY table_name;
