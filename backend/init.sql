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
