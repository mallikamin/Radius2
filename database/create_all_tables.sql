-- Radius CRM v3 - Complete Database Schema
-- Run this in psql: docker exec -it sitara_v3_db psql -U sitara -d sitara_crm -f /path/to/this/file
-- Or copy-paste into psql session

-- Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- TABLES
-- =============================================

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
    project_id UUID REFERENCES projects(id) NOT NULL,
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
    customer_id UUID REFERENCES customers(id) NOT NULL,
    broker_id UUID REFERENCES brokers(id),
    project_id UUID REFERENCES projects(id) NOT NULL,
    inventory_id UUID REFERENCES inventory(id) NOT NULL,
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

-- Installments (child of transactions - for tracking individual payment schedules)
CREATE TABLE IF NOT EXISTS installments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID REFERENCES transactions(id) NOT NULL,
    installment_number INTEGER NOT NULL,
    due_date DATE NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    amount_paid DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- SEQUENCES
-- =============================================
CREATE SEQUENCE IF NOT EXISTS broker_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS project_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS rep_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS inventory_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS transaction_id_seq START 1;

-- =============================================
-- TRIGGER FUNCTIONS
-- =============================================
CREATE OR REPLACE FUNCTION generate_broker_id() RETURNS TRIGGER AS $$
BEGIN 
    NEW.broker_id := 'BRK-' || LPAD(nextval('broker_id_seq')::TEXT, 4, '0'); 
    RETURN NEW; 
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_project_id() RETURNS TRIGGER AS $$
BEGIN 
    NEW.project_id := 'PRJ-' || LPAD(nextval('project_id_seq')::TEXT, 4, '0'); 
    RETURN NEW; 
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_rep_id() RETURNS TRIGGER AS $$
BEGIN 
    NEW.rep_id := 'REP-' || LPAD(nextval('rep_id_seq')::TEXT, 4, '0'); 
    RETURN NEW; 
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_inventory_id() RETURNS TRIGGER AS $$
BEGIN 
    NEW.inventory_id := 'INV-' || LPAD(nextval('inventory_id_seq')::TEXT, 4, '0'); 
    RETURN NEW; 
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_transaction_id() RETURNS TRIGGER AS $$
BEGIN 
    NEW.transaction_id := 'TXN-' || LPAD(nextval('transaction_id_seq')::TEXT, 4, '0'); 
    RETURN NEW; 
END; $$ LANGUAGE plpgsql;

-- =============================================
-- TRIGGERS
-- =============================================
DROP TRIGGER IF EXISTS trg_broker_id ON brokers;
DROP TRIGGER IF EXISTS trg_project_id ON projects;
DROP TRIGGER IF EXISTS trg_rep_id ON company_reps;
DROP TRIGGER IF EXISTS trg_inventory_id ON inventory;
DROP TRIGGER IF EXISTS trg_transaction_id ON transactions;

CREATE TRIGGER trg_broker_id BEFORE INSERT ON brokers 
    FOR EACH ROW WHEN (NEW.broker_id IS NULL) EXECUTE FUNCTION generate_broker_id();

CREATE TRIGGER trg_project_id BEFORE INSERT ON projects 
    FOR EACH ROW WHEN (NEW.project_id IS NULL) EXECUTE FUNCTION generate_project_id();

CREATE TRIGGER trg_rep_id BEFORE INSERT ON company_reps 
    FOR EACH ROW WHEN (NEW.rep_id IS NULL) EXECUTE FUNCTION generate_rep_id();

CREATE TRIGGER trg_inventory_id BEFORE INSERT ON inventory 
    FOR EACH ROW WHEN (NEW.inventory_id IS NULL) EXECUTE FUNCTION generate_inventory_id();

CREATE TRIGGER trg_transaction_id BEFORE INSERT ON transactions 
    FOR EACH ROW WHEN (NEW.transaction_id IS NULL) EXECUTE FUNCTION generate_transaction_id();

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_brokers_mobile ON brokers(mobile);
CREATE INDEX IF NOT EXISTS idx_brokers_status ON brokers(status);
CREATE INDEX IF NOT EXISTS idx_inventory_project ON inventory(project_id);
CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory(status);
CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_broker ON transactions(broker_id);
CREATE INDEX IF NOT EXISTS idx_installments_transaction ON installments(transaction_id);

-- =============================================
-- VERIFY
-- =============================================
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
