-- ============================================
-- Radius CRM v3 - Phase 7: Buybacks & Plot History
-- Run after existing schema is in place
-- ============================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- BUYBACKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS buybacks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    buyback_id VARCHAR(20) UNIQUE NOT NULL,

    -- Links to original records
    original_transaction_id UUID NOT NULL REFERENCES transactions(id),
    inventory_id UUID NOT NULL REFERENCES inventory(id),
    original_customer_id UUID NOT NULL REFERENCES customers(id),

    -- Financial details
    original_sale_price DECIMAL(15,2) NOT NULL,
    buyback_price DECIMAL(15,2) NOT NULL,
    buyback_profit_rate DECIMAL(5,2) DEFAULT 5.00,
    reinventory_price DECIMAL(15,2) NOT NULL,
    reinventory_markup_rate DECIMAL(5,2) DEFAULT 2.00,
    original_commission_amount DECIMAL(15,2) DEFAULT 0,

    -- Costing
    company_cost_auto DECIMAL(15,2),
    company_cost_manual DECIMAL(15,2),
    company_cost_override VARCHAR(10) DEFAULT 'false',

    -- Settlement
    settlement_type VARCHAR(30) DEFAULT 'full',  -- full, partial, settlement
    settlement_amount DECIMAL(15,2),
    amount_paid_to_customer DECIMAL(15,2) DEFAULT 0,

    -- Metadata
    reason TEXT,
    notes TEXT,

    -- Status & Workflow
    status VARCHAR(20) DEFAULT 'pending',  -- pending, approved, in_progress, completed, cancelled
    initiated_by_rep_id UUID REFERENCES company_reps(id),
    approved_by_rep_id UUID REFERENCES company_reps(id),
    approved_at TIMESTAMP,

    -- Dates
    buyback_date DATE DEFAULT CURRENT_DATE,
    completion_date DATE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for buybacks
CREATE INDEX IF NOT EXISTS idx_buybacks_transaction ON buybacks(original_transaction_id);
CREATE INDEX IF NOT EXISTS idx_buybacks_inventory ON buybacks(inventory_id);
CREATE INDEX IF NOT EXISTS idx_buybacks_customer ON buybacks(original_customer_id);
CREATE INDEX IF NOT EXISTS idx_buybacks_status ON buybacks(status);
CREATE INDEX IF NOT EXISTS idx_buybacks_date ON buybacks(buyback_date DESC);

-- Auto-generate BBK-XXXX IDs
CREATE SEQUENCE IF NOT EXISTS buyback_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_buyback_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.buyback_id IS NULL THEN
        NEW.buyback_id := 'BBK-' || LPAD(nextval('buyback_id_seq')::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_buyback_id ON buybacks;
CREATE TRIGGER trg_buyback_id BEFORE INSERT ON buybacks
    FOR EACH ROW EXECUTE FUNCTION generate_buyback_id();

-- ============================================
-- BUYBACK LEDGER TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS buyback_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ledger_id VARCHAR(20) UNIQUE NOT NULL,

    buyback_id UUID NOT NULL REFERENCES buybacks(id) ON DELETE CASCADE,

    -- Entry details
    entry_type VARCHAR(30) NOT NULL,  -- payment_to_customer, adjustment, settlement
    amount DECIMAL(15,2) NOT NULL,

    -- Payment details
    payment_method VARCHAR(50),  -- cash, cheque, bank_transfer
    reference_number VARCHAR(100),
    payment_date DATE DEFAULT CURRENT_DATE,

    notes TEXT,
    created_by_rep_id UUID REFERENCES company_reps(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for buyback_ledger
CREATE INDEX IF NOT EXISTS idx_buyback_ledger_buyback ON buyback_ledger(buyback_id);
CREATE INDEX IF NOT EXISTS idx_buyback_ledger_date ON buyback_ledger(payment_date DESC);

-- Auto-generate BBL-XXXXX IDs
CREATE SEQUENCE IF NOT EXISTS buyback_ledger_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_buyback_ledger_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ledger_id IS NULL THEN
        NEW.ledger_id := 'BBL-' || LPAD(nextval('buyback_ledger_id_seq')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_buyback_ledger_id ON buyback_ledger;
CREATE TRIGGER trg_buyback_ledger_id BEFORE INSERT ON buyback_ledger
    FOR EACH ROW EXECUTE FUNCTION generate_buyback_ledger_id();

-- ============================================
-- PLOT HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS plot_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    inventory_id UUID NOT NULL REFERENCES inventory(id),

    -- Event details
    event_type VARCHAR(30) NOT NULL,  -- initial_listing, sale, buyback, resale, price_change
    event_date DATE NOT NULL,

    -- Ownership tracking
    previous_owner_id UUID REFERENCES customers(id),  -- NULL for initial listing
    new_owner_id UUID REFERENCES customers(id),       -- NULL for buyback (company owns)

    -- Linked records
    transaction_id UUID REFERENCES transactions(id),
    buyback_id UUID REFERENCES buybacks(id),

    -- Financial snapshot at time of event
    price_at_event DECIMAL(15,2),
    rate_per_marla DECIMAL(15,2),

    -- Metadata
    notes TEXT,
    created_by_rep_id UUID REFERENCES company_reps(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for plot_history
CREATE INDEX IF NOT EXISTS idx_plot_history_inventory ON plot_history(inventory_id);
CREATE INDEX IF NOT EXISTS idx_plot_history_date ON plot_history(event_date DESC);
CREATE INDEX IF NOT EXISTS idx_plot_history_event_type ON plot_history(event_type);

-- ============================================
-- ALTER EXISTING TABLES (non-breaking additions)
-- ============================================

-- Add buyback tracking to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS buyback_id UUID REFERENCES buybacks(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_resale VARCHAR(10) DEFAULT 'false';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS resale_commission_rate DECIMAL(5,2);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS original_buyback_id UUID;

-- Add buyback tracking to inventory
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS buyback_count INTEGER DEFAULT 0;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS last_buyback_id UUID REFERENCES buybacks(id);
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS company_cost DECIMAL(15,2);
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS original_listing_price DECIMAL(15,2);

-- ============================================
-- VIEWS FOR REPORTING
-- ============================================

-- Buyback summary by project
CREATE OR REPLACE VIEW v_buyback_summary AS
SELECT
    p.id as project_id,
    p.project_id as project_code,
    p.name as project_name,
    COUNT(DISTINCT b.id) as total_buybacks,
    COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'completed') as completed_buybacks,
    COUNT(DISTINCT b.id) FILTER (WHERE b.status IN ('pending', 'approved', 'in_progress')) as active_buybacks,
    COALESCE(SUM(b.buyback_price) FILTER (WHERE b.status = 'completed'), 0) as total_buyback_value,
    COALESCE(SUM(b.amount_paid_to_customer) FILTER (WHERE b.status = 'completed'), 0) as total_paid_out
FROM projects p
LEFT JOIN inventory inv ON inv.project_id = p.id
LEFT JOIN buybacks b ON b.inventory_id = inv.id
GROUP BY p.id;

-- Plot costing view
CREATE OR REPLACE VIEW v_plot_costing AS
SELECT
    inv.id as inventory_id,
    inv.inventory_id as inventory_code,
    inv.unit_number,
    inv.block,
    p.project_id as project_code,
    p.name as project_name,
    inv.area_marla,
    inv.rate_per_marla,
    inv.status,
    inv.buyback_count,
    inv.company_cost,
    inv.original_listing_price,
    (inv.area_marla * inv.rate_per_marla) as current_value,
    COALESCE(inv.company_cost, inv.original_listing_price, inv.area_marla * inv.rate_per_marla) as net_cost
FROM inventory inv
JOIN projects p ON p.id = inv.project_id;

-- ============================================
-- VERIFICATION
-- ============================================
DO $$
BEGIN
    RAISE NOTICE 'Phase 7 Buyback tables created successfully';
    RAISE NOTICE 'Tables: buybacks, buyback_ledger, plot_history';
    RAISE NOTICE 'Extensions: transactions (4 columns), inventory (4 columns)';
    RAISE NOTICE 'Views: v_buyback_summary, v_plot_costing';
END $$;
