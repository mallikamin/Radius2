-- Radius CRM v3 - Phase 4: Receipts & Lead Enhancements
-- Run this after phase3_tables.sql

-- =============================================
-- ENHANCE LEADS TABLE (add conversion tracking)
-- =============================================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_type VARCHAR(20) DEFAULT 'prospect';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_customer_id UUID REFERENCES customers(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_broker_id UUID REFERENCES brokers(id);

CREATE INDEX IF NOT EXISTS idx_leads_type ON leads(lead_type);

-- =============================================
-- RECEIPTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_id VARCHAR(20) UNIQUE NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(id),
    transaction_id UUID REFERENCES transactions(id),
    amount DECIMAL(15,2) NOT NULL,
    payment_method VARCHAR(50),  -- cash, cheque, bank_transfer, online
    reference_number VARCHAR(100),  -- cheque number, transaction ref etc
    payment_date DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    created_by_rep_id UUID REFERENCES company_reps(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_receipts_customer ON receipts(customer_id);
CREATE INDEX IF NOT EXISTS idx_receipts_transaction ON receipts(transaction_id);
CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_method ON receipts(payment_method);

-- Sequence for receipt_id
CREATE SEQUENCE IF NOT EXISTS receipt_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_receipt_id()
RETURNS TRIGGER AS $$
BEGIN
    NEW.receipt_id := 'RCP-' || LPAD(nextval('receipt_id_seq')::TEXT, 5, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_receipt_id ON receipts;
CREATE TRIGGER trg_receipt_id
    BEFORE INSERT ON receipts
    FOR EACH ROW
    WHEN (NEW.receipt_id IS NULL)
    EXECUTE FUNCTION generate_receipt_id();

-- =============================================
-- RECEIPT ALLOCATIONS TABLE (links receipts to installments)
-- =============================================
CREATE TABLE IF NOT EXISTS receipt_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_id UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    installment_id UUID NOT NULL REFERENCES installments(id),
    amount DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alloc_receipt ON receipt_allocations(receipt_id);
CREATE INDEX IF NOT EXISTS idx_alloc_installment ON receipt_allocations(installment_id);

-- =============================================
-- USEFUL VIEWS FOR RECEIPTS
-- =============================================
CREATE OR REPLACE VIEW v_receipt_summary AS
SELECT 
    r.receipt_id,
    r.amount,
    r.payment_method,
    r.payment_date,
    c.customer_id,
    c.name as customer_name,
    t.transaction_id,
    p.name as project_name,
    t.unit_number,
    rep.name as received_by
FROM receipts r
JOIN customers c ON r.customer_id = c.id
LEFT JOIN transactions t ON r.transaction_id = t.id
LEFT JOIN projects p ON t.project_id = p.id
LEFT JOIN company_reps rep ON r.created_by_rep_id = rep.id
ORDER BY r.created_at DESC;

-- Customer balance view
CREATE OR REPLACE VIEW v_customer_balances AS
SELECT 
    c.customer_id,
    c.name,
    c.mobile,
    COUNT(DISTINCT t.id) as total_transactions,
    COALESCE(SUM(t.total_value), 0) as total_value,
    COALESCE(SUM(i.amount_paid), 0) as total_paid,
    COALESCE(SUM(t.total_value), 0) - COALESCE(SUM(i.amount_paid), 0) as balance
FROM customers c
LEFT JOIN transactions t ON t.customer_id = c.id
LEFT JOIN installments i ON i.transaction_id = t.id
GROUP BY c.id;

-- Verify tables created
SELECT 'Phase 4 tables created:' as info;
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('receipts', 'receipt_allocations')
ORDER BY table_name;
