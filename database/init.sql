-- Radius CRM v3 - Clean Start
-- Customers & Brokers Tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- CUSTOMERS TABLE
-- =============================================
CREATE TABLE customers (
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

CREATE INDEX idx_customers_mobile ON customers(mobile);

-- Sequence for customer_id generation
CREATE SEQUENCE customer_id_seq START 1;

-- Function to generate customer_id
CREATE OR REPLACE FUNCTION generate_customer_id()
RETURNS TRIGGER AS $$
BEGIN
    NEW.customer_id := 'CUST-' || LPAD(nextval('customer_id_seq')::TEXT, 4, '0');
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_customer_id
    BEFORE INSERT ON customers
    FOR EACH ROW
    WHEN (NEW.customer_id IS NULL)
    EXECUTE FUNCTION generate_customer_id();

-- =============================================
-- BROKERS TABLE
-- =============================================
-- Broker can have same mobile as a customer (same person, different role)
-- Broker mobile must be unique within brokers table only
-- =============================================
CREATE TABLE brokers (
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
    -- Link to customer if same person
    linked_customer_id UUID REFERENCES customers(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_brokers_mobile ON brokers(mobile);
CREATE INDEX idx_brokers_status ON brokers(status);

-- Sequence for broker_id generation
CREATE SEQUENCE broker_id_seq START 1;

-- Function to generate broker_id
CREATE OR REPLACE FUNCTION generate_broker_id()
RETURNS TRIGGER AS $$
BEGIN
    NEW.broker_id := 'BRK-' || LPAD(nextval('broker_id_seq')::TEXT, 4, '0');
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_broker_id
    BEFORE INSERT ON brokers
    FOR EACH ROW
    WHEN (NEW.broker_id IS NULL)
    EXECUTE FUNCTION generate_broker_id();

-- =============================================
-- UPDATE TIMESTAMP TRIGGER (shared)
-- =============================================
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_customers_updated
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_brokers_updated
    BEFORE UPDATE ON brokers
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- =============================================
-- TEST DATA
-- =============================================
INSERT INTO customers (name, mobile, address, cnic, email) VALUES
('Ahmed Khan', '0300-1234567', 'House 1, DHA Phase 5, Lahore', '35201-1234567-1', 'ahmed@email.com'),
('Sara Ali', '0321-9876543', 'Flat 5, Gulberg III, Lahore', '35202-9876543-2', 'sara@email.com'),
('Muhammad Hassan', '0333-5555555', NULL, NULL, NULL);

INSERT INTO brokers (name, mobile, company, commission_rate) VALUES
('Rizwan Properties', '0300-1111111', 'Rizwan Real Estate', 2.5),
('Ali Realtors', '0321-2222222', 'Ali & Sons', 2.0);

-- Ahmed Khan is also a broker (same person, different role)
INSERT INTO brokers (name, mobile, company, commission_rate, linked_customer_id)
SELECT 'Ahmed Khan', '0300-1234567', 'Khan Associates', 1.5, id 
FROM customers WHERE mobile = '0300-1234567';

-- Verify
SELECT 'Customers:' as table_name, customer_id, name, mobile FROM customers
UNION ALL
SELECT 'Brokers:', broker_id, name, mobile FROM brokers;

-- =============================================
-- DATABASE INDEXES FOR OPTIMIZATION
-- =============================================
-- These indexes improve query performance and prevent conflicts
-- Run this section after all tables are created (via SQLAlchemy or manually)

-- Projects table indexes
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at);

-- Company Reps table indexes
CREATE INDEX IF NOT EXISTS idx_company_reps_status ON company_reps(status);

-- Inventory table indexes
CREATE INDEX IF NOT EXISTS idx_inventory_project_id ON inventory(project_id);
CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory(status);
CREATE INDEX IF NOT EXISTS idx_inventory_project_status ON inventory(project_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_created_at ON inventory(created_at);

-- Transactions table indexes (critical for performance)
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_broker_id ON transactions(broker_id);
CREATE INDEX IF NOT EXISTS idx_transactions_project_id ON transactions(project_id);
CREATE INDEX IF NOT EXISTS idx_transactions_inventory_id ON transactions(inventory_id);
CREATE INDEX IF NOT EXISTS idx_transactions_company_rep_id ON transactions(company_rep_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_booking_date ON transactions(booking_date);
CREATE INDEX IF NOT EXISTS idx_transactions_customer_status ON transactions(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_project_status ON transactions(project_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_booking_date_status ON transactions(booking_date, status);

-- Installments table indexes
CREATE INDEX IF NOT EXISTS idx_installments_transaction_id ON installments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_installments_status ON installments(status);
CREATE INDEX IF NOT EXISTS idx_installments_due_date ON installments(due_date);
CREATE INDEX IF NOT EXISTS idx_installments_transaction_status ON installments(transaction_id, status);
CREATE INDEX IF NOT EXISTS idx_installments_due_date_status ON installments(due_date, status);

-- Interactions table indexes
CREATE INDEX IF NOT EXISTS idx_interactions_company_rep_id ON interactions(company_rep_id);
CREATE INDEX IF NOT EXISTS idx_interactions_customer_id ON interactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_interactions_broker_id ON interactions(broker_id);
CREATE INDEX IF NOT EXISTS idx_interactions_status ON interactions(status);
CREATE INDEX IF NOT EXISTS idx_interactions_created_at ON interactions(created_at);
CREATE INDEX IF NOT EXISTS idx_interactions_next_follow_up ON interactions(next_follow_up);
CREATE INDEX IF NOT EXISTS idx_interactions_rep_created ON interactions(company_rep_id, created_at);

-- Campaigns table indexes
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_start_date ON campaigns(start_date);
CREATE INDEX IF NOT EXISTS idx_campaigns_end_date ON campaigns(end_date);
CREATE INDEX IF NOT EXISTS idx_campaigns_status_dates ON campaigns(status, start_date, end_date);

-- Leads table indexes
CREATE INDEX IF NOT EXISTS idx_leads_campaign_id ON leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_rep_id ON leads(assigned_rep_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_lead_type ON leads(lead_type);
CREATE INDEX IF NOT EXISTS idx_leads_converted_customer_id ON leads(converted_customer_id);
CREATE INDEX IF NOT EXISTS idx_leads_converted_broker_id ON leads(converted_broker_id);
CREATE INDEX IF NOT EXISTS idx_leads_status_type ON leads(status, lead_type);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);

-- Receipts table indexes (critical for financial queries)
CREATE INDEX IF NOT EXISTS idx_receipts_customer_id ON receipts(customer_id);
CREATE INDEX IF NOT EXISTS idx_receipts_transaction_id ON receipts(transaction_id);
CREATE INDEX IF NOT EXISTS idx_receipts_payment_date ON receipts(payment_date);
CREATE INDEX IF NOT EXISTS idx_receipts_created_by_rep_id ON receipts(created_by_rep_id);
CREATE INDEX IF NOT EXISTS idx_receipts_customer_date ON receipts(customer_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_receipts_transaction_date ON receipts(transaction_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_receipts_date_range ON receipts(payment_date);

-- Receipt Allocations table indexes
CREATE INDEX IF NOT EXISTS idx_receipt_allocations_receipt_id ON receipt_allocations(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_allocations_installment_id ON receipt_allocations(installment_id);

-- Creditors table indexes
CREATE INDEX IF NOT EXISTS idx_creditors_status ON creditors(status);

-- Payments table indexes (critical for financial queries)
CREATE INDEX IF NOT EXISTS idx_payments_broker_id ON payments(broker_id);
CREATE INDEX IF NOT EXISTS idx_payments_company_rep_id ON payments(company_rep_id);
CREATE INDEX IF NOT EXISTS idx_payments_creditor_id ON payments(creditor_id);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_id ON payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_payment_type ON payments(payment_type);
CREATE INDEX IF NOT EXISTS idx_payments_status_date ON payments(status, payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_type_status ON payments(payment_type, status);

-- Payment Allocations table indexes
CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment_id ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_transaction_id ON payment_allocations(transaction_id);

-- Media Files table indexes
CREATE INDEX IF NOT EXISTS idx_media_files_entity_type_id ON media_files(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_media_files_uploaded_by ON media_files(uploaded_by_rep_id);
CREATE INDEX IF NOT EXISTS idx_media_files_created_at ON media_files(created_at);

-- Additional foreign key indexes (brokers)
CREATE INDEX IF NOT EXISTS idx_brokers_linked_customer_id ON brokers(linked_customer_id);

-- Composite indexes for common dashboard queries
CREATE INDEX IF NOT EXISTS idx_transactions_dashboard ON transactions(booking_date, status, total_value);
CREATE INDEX IF NOT EXISTS idx_receipts_dashboard ON receipts(payment_date, amount);
CREATE INDEX IF NOT EXISTS idx_payments_dashboard ON payments(payment_date, status, amount);
