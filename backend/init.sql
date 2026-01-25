-- Sitara CRM v3 - Clean Start
-- Customers Table Only

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- CUSTOMERS TABLE
-- =============================================
-- customer_id is auto-generated sequence (CUST-0001, CUST-0002, etc.)
-- mobile is the unique business identifier
-- =============================================

CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    mobile VARCHAR(20) UNIQUE NOT NULL,
    address TEXT,
    cnic VARCHAR(20),
    email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index on mobile for fast lookups
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

-- Trigger to auto-generate customer_id on insert
CREATE TRIGGER trg_customer_id
    BEFORE INSERT ON customers
    FOR EACH ROW
    WHEN (NEW.customer_id IS NULL)
    EXECUTE FUNCTION generate_customer_id();

-- Trigger to update updated_at on update
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

-- =============================================
-- TEST DATA (Optional - comment out if not needed)
-- =============================================
INSERT INTO customers (name, mobile, address, cnic, email) VALUES
('Ahmed Khan', '0300-1234567', 'House 1, DHA Phase 5, Lahore', '35201-1234567-1', 'ahmed@email.com'),
('Sara Ali', '0321-9876543', 'Flat 5, Gulberg III, Lahore', '35202-9876543-2', 'sara@email.com'),
('Muhammad Hassan', '0333-5555555', NULL, NULL, NULL);

-- Verify
SELECT customer_id, name, mobile FROM customers;
