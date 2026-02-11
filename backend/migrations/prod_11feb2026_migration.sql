-- ============================================================
-- ORBIT CRM - Production Migration: Prod11022026
-- Date: 2026-02-11
-- Target: Office Server (sitara_crm_db, port 5435)
-- Purpose: Upgrade from Prod30012026 -> Prod11022026
--
-- SAFE TO RUN MULTIPLE TIMES (fully idempotent)
-- DOES NOT DELETE OR MODIFY EXISTING DATA
--
-- Run with:
--   docker exec -i sitara_crm_db psql -U sitara -d sitara_crm < prod_11feb2026_migration.sql
-- ============================================================

BEGIN;

-- ============================================================
-- 0. EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. CORE TABLES (ensure all exist)
-- ============================================================

-- Customers
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

-- Brokers
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

-- Projects
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    description TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Company Reps
CREATE TABLE IF NOT EXISTS company_reps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rep_id VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    mobile VARCHAR(20),
    email VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inventory
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transactions
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

-- Installments
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

-- Interactions
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

-- Campaigns
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

-- Leads
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

-- Receipts
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

-- Receipt Allocations
CREATE TABLE IF NOT EXISTS receipt_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_id UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    installment_id UUID NOT NULL REFERENCES installments(id),
    amount DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Creditors
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

-- Payments
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id VARCHAR(20) UNIQUE NOT NULL,
    payment_type VARCHAR(50) NOT NULL,
    payee_type VARCHAR(50),
    broker_id UUID REFERENCES brokers(id) ON DELETE SET NULL,
    company_rep_id UUID REFERENCES company_reps(id) ON DELETE SET NULL,
    creditor_id UUID REFERENCES creditors(id) ON DELETE SET NULL,
    transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    amount DECIMAL(15,2) NOT NULL,
    payment_method VARCHAR(50),
    reference_number VARCHAR(100),
    payment_date DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    approved_by_rep_id UUID REFERENCES company_reps(id),
    status VARCHAR(20) DEFAULT 'completed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment Allocations
CREATE TABLE IF NOT EXISTS payment_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL REFERENCES transactions(id),
    amount DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Media Files
CREATE TABLE IF NOT EXISTS media_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_id VARCHAR(20) UNIQUE NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_type VARCHAR(50),
    file_size BIGINT,
    uploaded_by_rep_id UUID REFERENCES company_reps(id),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 2. AUTH COLUMNS ON COMPANY_REPS (added in earlier release)
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_reps' AND column_name='password_hash') THEN
        ALTER TABLE company_reps ADD COLUMN password_hash VARCHAR(255);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_reps' AND column_name='role') THEN
        ALTER TABLE company_reps ADD COLUMN role VARCHAR(50) DEFAULT 'user';
    END IF;
END $$;

-- ============================================================
-- 3. VECTOR COLUMNS ON EXISTING TABLES
-- ============================================================
DO $$
BEGIN
    -- Projects: vector fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='map_pdf_base64') THEN
        ALTER TABLE projects ADD COLUMN map_pdf_base64 TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='map_name') THEN
        ALTER TABLE projects ADD COLUMN map_name VARCHAR(255);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='map_size') THEN
        ALTER TABLE projects ADD COLUMN map_size JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='vector_metadata') THEN
        ALTER TABLE projects ADD COLUMN vector_metadata JSONB;
    END IF;

    -- Inventory: vector fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory' AND column_name='plot_coordinates') THEN
        ALTER TABLE inventory ADD COLUMN plot_coordinates JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory' AND column_name='plot_offset') THEN
        ALTER TABLE inventory ADD COLUMN plot_offset JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory' AND column_name='is_manual_plot') THEN
        ALTER TABLE inventory ADD COLUMN is_manual_plot VARCHAR(10) DEFAULT 'false';
    END IF;
END $$;

-- ============================================================
-- 4. VECTOR TABLES
-- ============================================================
CREATE TABLE IF NOT EXISTS vector_projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    map_name VARCHAR(255),
    map_pdf_base64 TEXT,
    map_size JSONB,
    linked_project_id UUID REFERENCES projects(id),
    vector_metadata JSONB,
    system_branches JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vector_annotations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES vector_projects(id) ON DELETE CASCADE,
    annotation_id VARCHAR(100) NOT NULL,
    note TEXT,
    category VARCHAR(100),
    color VARCHAR(50),
    font_size INTEGER,
    rotation INTEGER DEFAULT 0,
    plot_ids JSONB,
    plot_nums JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vector_shapes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES vector_projects(id) ON DELETE CASCADE,
    shape_id VARCHAR(100) NOT NULL,
    type VARCHAR(50),
    x INTEGER,
    y INTEGER,
    width INTEGER,
    height INTEGER,
    color VARCHAR(50),
    data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vector_labels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES vector_projects(id) ON DELETE CASCADE,
    label_id VARCHAR(100) NOT NULL,
    text TEXT,
    x INTEGER,
    y INTEGER,
    size INTEGER,
    color VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vector_legend (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL UNIQUE REFERENCES vector_projects(id) ON DELETE CASCADE,
    visible VARCHAR(10) DEFAULT 'true',
    minimized VARCHAR(10) DEFAULT 'false',
    position VARCHAR(50),
    manual_entries JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vector_branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES vector_projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP,
    anno_count INTEGER,
    data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vector_creator_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES vector_projects(id) ON DELETE CASCADE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    note TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vector_change_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES vector_projects(id) ON DELETE CASCADE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    action TEXT,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vector_project_backups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES vector_projects(id) ON DELETE CASCADE,
    backup_data JSONB NOT NULL,
    created_by UUID REFERENCES company_reps(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vector_backup_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    frequency VARCHAR(100) DEFAULT '0 2 * * *',
    enabled VARCHAR(10) DEFAULT 'true',
    last_run TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vector_reconciliation (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES vector_projects(id) ON DELETE CASCADE,
    linked_project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    sync_status VARCHAR(50),
    discrepancies JSONB,
    last_sync_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 5. NEW: DELETION REQUESTS TABLE (Feb 11 release)
--    Soft-delete approval workflow for all entities
-- ============================================================
CREATE TABLE IF NOT EXISTS deletion_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id VARCHAR(20) UNIQUE NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    entity_name VARCHAR(255),
    requested_by UUID REFERENCES company_reps(id),
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    reviewed_by UUID REFERENCES company_reps(id),
    reviewed_at TIMESTAMP,
    rejection_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_status ON deletion_requests(status);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_entity ON deletion_requests(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_requested_by ON deletion_requests(requested_by);

-- ============================================================
-- 6. ALL SEQUENCES (safe - IF NOT EXISTS)
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS customer_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS broker_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS project_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS rep_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS inventory_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS transaction_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS interaction_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS campaign_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS lead_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS receipt_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS creditor_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS payment_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS media_file_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS deletion_request_id_seq START 1;

-- ============================================================
-- 7. ALL TRIGGER FUNCTIONS (CREATE OR REPLACE = safe)
-- ============================================================

CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

CREATE OR REPLACE FUNCTION generate_project_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.project_id IS NULL THEN
        NEW.project_id := 'PRJ-' || LPAD(nextval('project_id_seq')::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_rep_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.rep_id IS NULL THEN
        NEW.rep_id := 'REP-' || LPAD(nextval('rep_id_seq')::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_inventory_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.inventory_id IS NULL THEN
        NEW.inventory_id := 'INV-' || LPAD(nextval('inventory_id_seq')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_transaction_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.transaction_id IS NULL THEN
        NEW.transaction_id := 'TXN-' || LPAD(nextval('transaction_id_seq')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_interaction_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.interaction_id IS NULL THEN
        NEW.interaction_id := 'INT-' || LPAD(nextval('interaction_id_seq')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_campaign_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.campaign_id IS NULL THEN
        NEW.campaign_id := 'CMP-' || LPAD(nextval('campaign_id_seq')::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_lead_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.lead_id IS NULL THEN
        NEW.lead_id := 'LEAD-' || LPAD(nextval('lead_id_seq')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_receipt_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.receipt_id IS NULL THEN
        NEW.receipt_id := 'RCP-' || LPAD(nextval('receipt_id_seq')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_creditor_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.creditor_id IS NULL THEN
        NEW.creditor_id := 'CRD-' || LPAD(nextval('creditor_id_seq')::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_payment_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.payment_id IS NULL THEN
        NEW.payment_id := 'PAY-' || LPAD(nextval('payment_id_seq')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_media_file_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.file_id IS NULL THEN
        NEW.file_id := 'MED-' || LPAD(nextval('media_file_id_seq')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_deletion_request_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.request_id IS NULL THEN
        NEW.request_id := 'DEL-' || LPAD(nextval('deletion_request_id_seq')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 8. ALL TRIGGERS (DROP + CREATE = idempotent)
-- ============================================================

-- ID generation triggers
DROP TRIGGER IF EXISTS trg_customer_id ON customers;
CREATE TRIGGER trg_customer_id BEFORE INSERT ON customers FOR EACH ROW EXECUTE FUNCTION generate_customer_id();

DROP TRIGGER IF EXISTS trg_broker_id ON brokers;
CREATE TRIGGER trg_broker_id BEFORE INSERT ON brokers FOR EACH ROW EXECUTE FUNCTION generate_broker_id();

DROP TRIGGER IF EXISTS trg_project_id ON projects;
CREATE TRIGGER trg_project_id BEFORE INSERT ON projects FOR EACH ROW EXECUTE FUNCTION generate_project_id();

DROP TRIGGER IF EXISTS trg_rep_id ON company_reps;
CREATE TRIGGER trg_rep_id BEFORE INSERT ON company_reps FOR EACH ROW EXECUTE FUNCTION generate_rep_id();

DROP TRIGGER IF EXISTS trg_inventory_id ON inventory;
CREATE TRIGGER trg_inventory_id BEFORE INSERT ON inventory FOR EACH ROW EXECUTE FUNCTION generate_inventory_id();

DROP TRIGGER IF EXISTS trg_transaction_id ON transactions;
CREATE TRIGGER trg_transaction_id BEFORE INSERT ON transactions FOR EACH ROW EXECUTE FUNCTION generate_transaction_id();

DROP TRIGGER IF EXISTS trg_interaction_id ON interactions;
CREATE TRIGGER trg_interaction_id BEFORE INSERT ON interactions FOR EACH ROW EXECUTE FUNCTION generate_interaction_id();

DROP TRIGGER IF EXISTS trg_campaign_id ON campaigns;
CREATE TRIGGER trg_campaign_id BEFORE INSERT ON campaigns FOR EACH ROW EXECUTE FUNCTION generate_campaign_id();

DROP TRIGGER IF EXISTS trg_lead_id ON leads;
CREATE TRIGGER trg_lead_id BEFORE INSERT ON leads FOR EACH ROW EXECUTE FUNCTION generate_lead_id();

DROP TRIGGER IF EXISTS trg_receipt_id ON receipts;
CREATE TRIGGER trg_receipt_id BEFORE INSERT ON receipts FOR EACH ROW EXECUTE FUNCTION generate_receipt_id();

DROP TRIGGER IF EXISTS trg_creditor_id ON creditors;
CREATE TRIGGER trg_creditor_id BEFORE INSERT ON creditors FOR EACH ROW EXECUTE FUNCTION generate_creditor_id();

DROP TRIGGER IF EXISTS trg_payment_id ON payments;
CREATE TRIGGER trg_payment_id BEFORE INSERT ON payments FOR EACH ROW EXECUTE FUNCTION generate_payment_id();

DROP TRIGGER IF EXISTS trg_media_file_id ON media_files;
CREATE TRIGGER trg_media_file_id BEFORE INSERT ON media_files FOR EACH ROW EXECUTE FUNCTION generate_media_file_id();

DROP TRIGGER IF EXISTS trg_deletion_request_id ON deletion_requests;
CREATE TRIGGER trg_deletion_request_id BEFORE INSERT ON deletion_requests FOR EACH ROW EXECUTE FUNCTION generate_deletion_request_id();

-- Update timestamp triggers
DROP TRIGGER IF EXISTS trg_customers_updated ON customers;
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_brokers_updated ON brokers;
CREATE TRIGGER trg_brokers_updated BEFORE UPDATE ON brokers FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_campaigns_updated ON campaigns;
CREATE TRIGGER trg_campaigns_updated BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_leads_updated ON leads;
CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ============================================================
-- 9. KEY INDEXES (all IF NOT EXISTS)
-- ============================================================

-- Customers
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers(mobile);
CREATE INDEX IF NOT EXISTS idx_customers_customer_id ON customers(customer_id);

-- Brokers
CREATE INDEX IF NOT EXISTS idx_brokers_mobile ON brokers(mobile);
CREATE INDEX IF NOT EXISTS idx_brokers_status ON brokers(status);
CREATE INDEX IF NOT EXISTS idx_brokers_linked_customer_id ON brokers(linked_customer_id);

-- Projects
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- Company Reps
CREATE INDEX IF NOT EXISTS idx_company_reps_status ON company_reps(status);

-- Inventory
CREATE INDEX IF NOT EXISTS idx_inventory_project ON inventory(project_id);
CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory(status);
CREATE INDEX IF NOT EXISTS idx_inventory_project_status ON inventory(project_id, status);

-- Transactions
CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_broker ON transactions(broker_id);
CREATE INDEX IF NOT EXISTS idx_transactions_project ON transactions(project_id);
CREATE INDEX IF NOT EXISTS idx_transactions_inventory ON transactions(inventory_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_booking_date ON transactions(booking_date);

-- Installments
CREATE INDEX IF NOT EXISTS idx_installments_transaction ON installments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_installments_status ON installments(status);
CREATE INDEX IF NOT EXISTS idx_installments_due_date ON installments(due_date);

-- Interactions
CREATE INDEX IF NOT EXISTS idx_interactions_rep ON interactions(company_rep_id);
CREATE INDEX IF NOT EXISTS idx_interactions_created ON interactions(created_at DESC);

-- Campaigns
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);

-- Leads
CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_rep ON leads(assigned_rep_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

-- Receipts
CREATE INDEX IF NOT EXISTS idx_receipts_customer ON receipts(customer_id);
CREATE INDEX IF NOT EXISTS idx_receipts_transaction ON receipts(transaction_id);
CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts(payment_date DESC);

-- Receipt Allocations
CREATE INDEX IF NOT EXISTS idx_alloc_receipt ON receipt_allocations(receipt_id);
CREATE INDEX IF NOT EXISTS idx_alloc_installment ON receipt_allocations(installment_id);

-- Creditors
CREATE INDEX IF NOT EXISTS idx_creditors_status ON creditors(status);

-- Payments
CREATE INDEX IF NOT EXISTS idx_payments_broker ON payments(broker_id);
CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(payment_type);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- Payment Allocations
CREATE INDEX IF NOT EXISTS idx_payment_alloc_payment ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_alloc_transaction ON payment_allocations(transaction_id);

-- Media
CREATE INDEX IF NOT EXISTS idx_media_entity ON media_files(entity_type, entity_id);

-- Vector
CREATE INDEX IF NOT EXISTS idx_vector_projects_linked ON vector_projects(linked_project_id);
CREATE INDEX IF NOT EXISTS idx_vector_annotations_project ON vector_annotations(project_id);
CREATE INDEX IF NOT EXISTS idx_vector_shapes_project ON vector_shapes(project_id);
CREATE INDEX IF NOT EXISTS idx_vector_labels_project ON vector_labels(project_id);
CREATE INDEX IF NOT EXISTS idx_vector_branches_project ON vector_branches(project_id);
CREATE INDEX IF NOT EXISTS idx_vector_reconciliation_project ON vector_reconciliation(project_id);

-- ============================================================
-- 10. SYNC SEQUENCES TO EXISTING DATA
--     If tables already have rows, advance sequences past them
-- ============================================================
DO $$
DECLARE
    max_val INTEGER;
BEGIN
    -- Customer sequence
    SELECT COALESCE(MAX(CAST(REPLACE(customer_id, 'CUST-', '') AS INTEGER)), 0) INTO max_val FROM customers WHERE customer_id LIKE 'CUST-%';
    IF max_val > 0 THEN PERFORM setval('customer_id_seq', max_val); END IF;

    -- Broker sequence
    SELECT COALESCE(MAX(CAST(REPLACE(broker_id, 'BRK-', '') AS INTEGER)), 0) INTO max_val FROM brokers WHERE broker_id LIKE 'BRK-%';
    IF max_val > 0 THEN PERFORM setval('broker_id_seq', max_val); END IF;

    -- Project sequence
    SELECT COALESCE(MAX(CAST(REPLACE(project_id, 'PRJ-', '') AS INTEGER)), 0) INTO max_val FROM projects WHERE project_id LIKE 'PRJ-%';
    IF max_val > 0 THEN PERFORM setval('project_id_seq', max_val); END IF;

    -- Rep sequence
    SELECT COALESCE(MAX(CAST(REPLACE(rep_id, 'REP-', '') AS INTEGER)), 0) INTO max_val FROM company_reps WHERE rep_id LIKE 'REP-%';
    IF max_val > 0 THEN PERFORM setval('rep_id_seq', max_val); END IF;

    -- Inventory sequence
    SELECT COALESCE(MAX(CAST(REPLACE(inventory_id, 'INV-', '') AS INTEGER)), 0) INTO max_val FROM inventory WHERE inventory_id LIKE 'INV-%';
    IF max_val > 0 THEN PERFORM setval('inventory_id_seq', max_val); END IF;

    -- Transaction sequence
    SELECT COALESCE(MAX(CAST(REPLACE(transaction_id, 'TXN-', '') AS INTEGER)), 0) INTO max_val FROM transactions WHERE transaction_id LIKE 'TXN-%';
    IF max_val > 0 THEN PERFORM setval('transaction_id_seq', max_val); END IF;

    -- Interaction sequence
    SELECT COALESCE(MAX(CAST(REPLACE(interaction_id, 'INT-', '') AS INTEGER)), 0) INTO max_val FROM interactions WHERE interaction_id LIKE 'INT-%';
    IF max_val > 0 THEN PERFORM setval('interaction_id_seq', max_val); END IF;

    -- Campaign sequence
    SELECT COALESCE(MAX(CAST(REPLACE(campaign_id, 'CMP-', '') AS INTEGER)), 0) INTO max_val FROM campaigns WHERE campaign_id LIKE 'CMP-%';
    IF max_val > 0 THEN PERFORM setval('campaign_id_seq', max_val); END IF;

    -- Lead sequence
    SELECT COALESCE(MAX(CAST(REPLACE(lead_id, 'LEAD-', '') AS INTEGER)), 0) INTO max_val FROM leads WHERE lead_id LIKE 'LEAD-%';
    IF max_val > 0 THEN PERFORM setval('lead_id_seq', max_val); END IF;

    -- Receipt sequence
    SELECT COALESCE(MAX(CAST(REPLACE(receipt_id, 'RCP-', '') AS INTEGER)), 0) INTO max_val FROM receipts WHERE receipt_id LIKE 'RCP-%';
    IF max_val > 0 THEN PERFORM setval('receipt_id_seq', max_val); END IF;

    -- Creditor sequence
    SELECT COALESCE(MAX(CAST(REPLACE(creditor_id, 'CRD-', '') AS INTEGER)), 0) INTO max_val FROM creditors WHERE creditor_id LIKE 'CRD-%';
    IF max_val > 0 THEN PERFORM setval('creditor_id_seq', max_val); END IF;

    -- Payment sequence
    SELECT COALESCE(MAX(CAST(REPLACE(payment_id, 'PAY-', '') AS INTEGER)), 0) INTO max_val FROM payments WHERE payment_id LIKE 'PAY-%';
    IF max_val > 0 THEN PERFORM setval('payment_id_seq', max_val); END IF;

    -- Media sequence
    SELECT COALESCE(MAX(CAST(REPLACE(file_id, 'MED-', '') AS INTEGER)), 0) INTO max_val FROM media_files WHERE file_id LIKE 'MED-%';
    IF max_val > 0 THEN PERFORM setval('media_file_id_seq', max_val); END IF;

    -- Deletion request sequence
    SELECT COALESCE(MAX(CAST(REPLACE(request_id, 'DEL-', '') AS INTEGER)), 0) INTO max_val FROM deletion_requests WHERE request_id LIKE 'DEL-%';
    IF max_val > 0 THEN PERFORM setval('deletion_request_id_seq', max_val); END IF;
END $$;

-- ============================================================
-- 11. CREATE NEW USERS (if they don't exist)
--     password_hash = NULL means they set password on first login
-- ============================================================

-- Ensure Admin user exists (REP-0002)
INSERT INTO company_reps (rep_id, name, mobile, email, role, status)
VALUES ('REP-0002', 'Admin', NULL, NULL, 'admin', 'active')
ON CONFLICT (rep_id) DO UPDATE SET role = 'admin';

-- HD user (REP-0003)
INSERT INTO company_reps (rep_id, name, mobile, email, role, status)
VALUES ('REP-0003', 'HD', NULL, NULL, 'creator', 'active')
ON CONFLICT (rep_id) DO NOTHING;

-- AhsanEjaz user (REP-0004)
INSERT INTO company_reps (rep_id, name, mobile, email, role, status)
VALUES ('REP-0004', 'AhsanEjaz', NULL, NULL, 'creator', 'active')
ON CONFLICT (rep_id) DO NOTHING;

-- Advance rep sequence past existing reps
DO $$
DECLARE max_val INTEGER;
BEGIN
    SELECT COALESCE(MAX(CAST(REPLACE(rep_id, 'REP-', '') AS INTEGER)), 0) INTO max_val FROM company_reps WHERE rep_id LIKE 'REP-%';
    IF max_val > 0 THEN PERFORM setval('rep_id_seq', max_val); END IF;
END $$;

-- ============================================================
-- 12. VERIFICATION
-- ============================================================
SELECT '=== MIGRATION COMPLETE ===' AS status;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

SELECT 'Total tables: ' || COUNT(*) AS info
FROM information_schema.tables
WHERE table_schema = 'public';

SELECT rep_id, name, role, status,
       CASE WHEN password_hash IS NULL THEN 'NOT SET (will set on first login)' ELSE 'SET' END AS password_status
FROM company_reps
ORDER BY rep_id;

COMMIT;
