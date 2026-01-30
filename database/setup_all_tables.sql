-- Radius CRM - Complete Database Setup (All Tables)
-- Run this to create/update all tables

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- CUSTOMERS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    mobile VARCHAR(20) UNIQUE NOT NULL,
    address TEXT,
    cnic VARCHAR(20),
    email VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers(mobile);
CREATE SEQUENCE IF NOT EXISTS customer_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_customer_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.customer_id IS NULL THEN
        NEW.customer_id := 'CUST-' || LPAD(nextval('customer_id_seq')::TEXT, 4, '0');
    END IF;
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customer_id ON customers;
CREATE TRIGGER trg_customer_id BEFORE INSERT ON customers FOR EACH ROW EXECUTE FUNCTION generate_customer_id();

-- =============================================
-- BROKERS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS brokers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    broker_id VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    mobile VARCHAR(20) UNIQUE NOT NULL,
    cnic VARCHAR(20),
    email VARCHAR(255),
    company VARCHAR(255),
    address TEXT,
    commission_rate DECIMAL(5,2) DEFAULT 2.00,
    bank_name VARCHAR(100),
    bank_account VARCHAR(50),
    bank_iban VARCHAR(50),
    notes TEXT,
    status VARCHAR(20) DEFAULT 'active',
    linked_customer_id UUID REFERENCES customers(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_brokers_mobile ON brokers(mobile);
CREATE INDEX IF NOT EXISTS idx_brokers_status ON brokers(status);
CREATE SEQUENCE IF NOT EXISTS broker_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_broker_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.broker_id IS NULL THEN
        NEW.broker_id := 'BRK-' || LPAD(nextval('broker_id_seq')::TEXT, 4, '0');
    END IF;
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_broker_id ON brokers;
CREATE TRIGGER trg_broker_id BEFORE INSERT ON brokers FOR EACH ROW EXECUTE FUNCTION generate_broker_id();

-- =============================================
-- PROJECTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    description TEXT,
    status VARCHAR(20) DEFAULT 'active',
    -- Vector Map fields (for InventoryMapViewer feature)
    map_pdf_base64 TEXT,
    map_name VARCHAR(255),
    map_size JSONB,
    vector_metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE SEQUENCE IF NOT EXISTS project_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_project_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.project_id IS NULL THEN
        NEW.project_id := 'PRJ-' || LPAD(nextval('project_id_seq')::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_project_id ON projects;
CREATE TRIGGER trg_project_id BEFORE INSERT ON projects FOR EACH ROW EXECUTE FUNCTION generate_project_id();

-- =============================================
-- COMPANY REPS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS company_reps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rep_id VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    mobile VARCHAR(20),
    email VARCHAR(255),
    password_hash VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE SEQUENCE IF NOT EXISTS rep_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_rep_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.rep_id IS NULL THEN
        NEW.rep_id := 'REP-' || LPAD(nextval('rep_id_seq')::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rep_id ON company_reps;
CREATE TRIGGER trg_rep_id BEFORE INSERT ON company_reps FOR EACH ROW EXECUTE FUNCTION generate_rep_id();

-- =============================================
-- INVENTORY TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inventory_id VARCHAR(20) UNIQUE NOT NULL,
    project_id UUID NOT NULL REFERENCES projects(id),
    unit_number VARCHAR(50) NOT NULL,
    unit_type VARCHAR(50) DEFAULT 'plot',
    block VARCHAR(50),
    area_marla DECIMAL(10,2) NOT NULL,
    rate_per_marla DECIMAL(15,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'available',
    factor_details TEXT,
    notes TEXT,
    -- Vector Map fields (plot coordinates for map rendering)
    plot_coordinates JSONB,
    plot_offset JSONB,
    is_manual_plot VARCHAR(10) DEFAULT 'false',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_project ON inventory(project_id);
CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory(status);
CREATE SEQUENCE IF NOT EXISTS inventory_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_inventory_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.inventory_id IS NULL THEN
        NEW.inventory_id := 'INV-' || LPAD(nextval('inventory_id_seq')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventory_id ON inventory;
CREATE TRIGGER trg_inventory_id BEFORE INSERT ON inventory FOR EACH ROW EXECUTE FUNCTION generate_inventory_id();

-- =============================================
-- TRANSACTIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id VARCHAR(20) UNIQUE NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(id),
    broker_id UUID REFERENCES brokers(id),
    project_id UUID NOT NULL REFERENCES projects(id),
    inventory_id UUID NOT NULL REFERENCES inventory(id),
    company_rep_id UUID REFERENCES company_reps(id),
    broker_commission_rate DECIMAL(5,2) DEFAULT 2.00,
    unit_number VARCHAR(50) NOT NULL,
    block VARCHAR(50),
    area_marla DECIMAL(10,2) NOT NULL,
    rate_per_marla DECIMAL(15,2) NOT NULL,
    total_value DECIMAL(15,2) NOT NULL,
    installment_cycle VARCHAR(20) DEFAULT 'bi-annual',
    num_installments INTEGER DEFAULT 4,
    first_due_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    notes TEXT,
    booking_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_project ON transactions(project_id);
CREATE SEQUENCE IF NOT EXISTS transaction_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_transaction_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.transaction_id IS NULL THEN
        NEW.transaction_id := 'TXN-' || LPAD(nextval('transaction_id_seq')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transaction_id ON transactions;
CREATE TRIGGER trg_transaction_id BEFORE INSERT ON transactions FOR EACH ROW EXECUTE FUNCTION generate_transaction_id();

-- =============================================
-- INSTALLMENTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS installments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES transactions(id),
    installment_number INTEGER NOT NULL,
    due_date DATE NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    amount_paid DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_installments_transaction ON installments(transaction_id);

-- =============================================
-- INTERACTIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interaction_id VARCHAR(20) UNIQUE NOT NULL,
    company_rep_id UUID NOT NULL REFERENCES company_reps(id),
    customer_id UUID REFERENCES customers(id),
    broker_id UUID REFERENCES brokers(id),
    interaction_type VARCHAR(20) NOT NULL,
    status VARCHAR(50),
    notes TEXT,
    next_follow_up DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_interactions_rep ON interactions(company_rep_id);
CREATE INDEX IF NOT EXISTS idx_interactions_created ON interactions(created_at DESC);
CREATE SEQUENCE IF NOT EXISTS interaction_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_interaction_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.interaction_id IS NULL THEN
        NEW.interaction_id := 'INT-' || LPAD(nextval('interaction_id_seq')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_interaction_id ON interactions;
CREATE TRIGGER trg_interaction_id BEFORE INSERT ON interactions FOR EACH ROW EXECUTE FUNCTION generate_interaction_id();

-- =============================================
-- CAMPAIGNS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    source VARCHAR(50),
    start_date DATE,
    end_date DATE,
    budget DECIMAL(15,2),
    status VARCHAR(20) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE SEQUENCE IF NOT EXISTS campaign_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_campaign_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.campaign_id IS NULL THEN
        NEW.campaign_id := 'CMP-' || LPAD(nextval('campaign_id_seq')::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_campaign_id ON campaigns;
CREATE TRIGGER trg_campaign_id BEFORE INSERT ON campaigns FOR EACH ROW EXECUTE FUNCTION generate_campaign_id();

-- =============================================
-- LEADS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id VARCHAR(20) UNIQUE NOT NULL,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    assigned_rep_id UUID REFERENCES company_reps(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    mobile VARCHAR(20),
    email VARCHAR(255),
    source_details TEXT,
    status VARCHAR(50) DEFAULT 'new',
    lead_type VARCHAR(20) DEFAULT 'prospect',
    converted_customer_id UUID REFERENCES customers(id),
    converted_broker_id UUID REFERENCES brokers(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_rep ON leads(assigned_rep_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE SEQUENCE IF NOT EXISTS lead_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_lead_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.lead_id IS NULL THEN
        NEW.lead_id := 'LEAD-' || LPAD(nextval('lead_id_seq')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lead_id ON leads;
CREATE TRIGGER trg_lead_id BEFORE INSERT ON leads FOR EACH ROW EXECUTE FUNCTION generate_lead_id();

-- =============================================
-- RECEIPTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_id VARCHAR(20) UNIQUE NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(id),
    transaction_id UUID REFERENCES transactions(id),
    amount DECIMAL(15,2) NOT NULL,
    payment_method VARCHAR(50),
    reference_number VARCHAR(100),
    payment_date DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    created_by_rep_id UUID REFERENCES company_reps(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_receipts_customer ON receipts(customer_id);
CREATE INDEX IF NOT EXISTS idx_receipts_transaction ON receipts(transaction_id);
CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts(payment_date DESC);
CREATE SEQUENCE IF NOT EXISTS receipt_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_receipt_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.receipt_id IS NULL THEN
        NEW.receipt_id := 'RCP-' || LPAD(nextval('receipt_id_seq')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_receipt_id ON receipts;
CREATE TRIGGER trg_receipt_id BEFORE INSERT ON receipts FOR EACH ROW EXECUTE FUNCTION generate_receipt_id();

-- =============================================
-- RECEIPT ALLOCATIONS TABLE
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
-- UPDATE TIMESTAMP FUNCTION
-- =============================================
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update triggers
DROP TRIGGER IF EXISTS trg_customers_updated ON customers;
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_brokers_updated ON brokers;
CREATE TRIGGER trg_brokers_updated BEFORE UPDATE ON brokers FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_campaigns_updated ON campaigns;
CREATE TRIGGER trg_campaigns_updated BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_leads_updated ON leads;
CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- =============================================
-- VERIFY ALL TABLES
-- =============================================
SELECT 'All tables created successfully!' as status;
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
