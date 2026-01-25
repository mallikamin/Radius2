-- =============================================
-- PROJECTS TABLE
-- =============================================
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    description TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE SEQUENCE project_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_project_id()
RETURNS TRIGGER AS $$
BEGIN
    NEW.project_id := 'PRJ-' || LPAD(nextval('project_id_seq')::TEXT, 4, '0');
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_project_id
    BEFORE INSERT ON projects
    FOR EACH ROW
    WHEN (NEW.project_id IS NULL)
    EXECUTE FUNCTION generate_project_id();

-- =============================================
-- INVENTORY TABLE
-- =============================================
CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inventory_id VARCHAR(20) UNIQUE NOT NULL,
    project_id UUID REFERENCES projects(id) NOT NULL,
    unit_number VARCHAR(50) NOT NULL,
    unit_type VARCHAR(50) DEFAULT 'plot',
    block VARCHAR(50),
    area_marla DECIMAL(10,2) NOT NULL,
    rate_per_marla DECIMAL(15,2) NOT NULL,
    total_value DECIMAL(15,2) GENERATED ALWAYS AS (area_marla * rate_per_marla) STORED,
    status VARCHAR(20) DEFAULT 'available',
    factor_details TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_inventory_project ON inventory(project_id);
CREATE INDEX idx_inventory_status ON inventory(status);

CREATE SEQUENCE inventory_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_inventory_id()
RETURNS TRIGGER AS $$
BEGIN
    NEW.inventory_id := 'INV-' || LPAD(nextval('inventory_id_seq')::TEXT, 4, '0');
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inventory_id
    BEFORE INSERT ON inventory
    FOR EACH ROW
    WHEN (NEW.inventory_id IS NULL)
    EXECUTE FUNCTION generate_inventory_id();

-- =============================================
-- COMPANY REPS TABLE (for later dashboard)
-- =============================================
CREATE TABLE company_reps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rep_id VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    mobile VARCHAR(20),
    email VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE SEQUENCE rep_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_rep_id()
RETURNS TRIGGER AS $$
BEGIN
    NEW.rep_id := 'REP-' || LPAD(nextval('rep_id_seq')::TEXT, 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rep_id
    BEFORE INSERT ON company_reps
    FOR EACH ROW
    WHEN (NEW.rep_id IS NULL)
    EXECUTE FUNCTION generate_rep_id();

-- =============================================
-- TRANSACTIONS TABLE
-- =============================================
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id VARCHAR(20) UNIQUE NOT NULL,
    
    -- Links
    customer_id UUID REFERENCES customers(id) NOT NULL,
    broker_id UUID REFERENCES brokers(id),
    project_id UUID REFERENCES projects(id) NOT NULL,
    inventory_id UUID REFERENCES inventory(id) NOT NULL,
    company_rep_id UUID REFERENCES company_reps(id),
    
    -- Broker commission (editable per transaction)
    broker_commission_rate DECIMAL(5,2) DEFAULT 2.00,
    
    -- Sale details (copied from inventory at time of sale)
    unit_number VARCHAR(50) NOT NULL,
    block VARCHAR(50),
    area_marla DECIMAL(10,2) NOT NULL,
    rate_per_marla DECIMAL(15,2) NOT NULL,
    total_value DECIMAL(15,2) NOT NULL,
    
    -- Payment schedule
    installment_cycle VARCHAR(20) DEFAULT 'bi-annual',
    num_installments INT DEFAULT 4,
    first_due_date DATE NOT NULL,
    
    -- Status
    status VARCHAR(20) DEFAULT 'active',
    notes TEXT,
    
    booking_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transactions_customer ON transactions(customer_id);
CREATE INDEX idx_transactions_broker ON transactions(broker_id);
CREATE INDEX idx_transactions_project ON transactions(project_id);
CREATE INDEX idx_transactions_inventory ON transactions(inventory_id);
CREATE INDEX idx_transactions_status ON transactions(status);

CREATE SEQUENCE transaction_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_transaction_id()
RETURNS TRIGGER AS $$
BEGIN
    NEW.transaction_id := 'TXN-' || LPAD(nextval('transaction_id_seq')::TEXT, 4, '0');
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transaction_id
    BEFORE INSERT ON transactions
    FOR EACH ROW
    WHEN (NEW.transaction_id IS NULL)
    EXECUTE FUNCTION generate_transaction_id();

-- =============================================
-- INSTALLMENTS TABLE (auto-generated from transactions)
-- =============================================
CREATE TABLE installments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID REFERENCES transactions(id) NOT NULL,
    installment_number INT NOT NULL,
    due_date DATE NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    amount_paid DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_installments_transaction ON installments(transaction_id);
CREATE INDEX idx_installments_due_date ON installments(due_date);
CREATE INDEX idx_installments_status ON installments(status);

-- =============================================
-- TEST DATA
-- =============================================

-- Projects
INSERT INTO projects (name, location, description) VALUES
('DHA Phase 9', 'Lahore', 'Premium residential plots'),
('Bahria Town', 'Lahore', 'Gated community plots'),
('Lake City', 'Lahore', 'Lakefront development');

-- Company Reps
INSERT INTO company_reps (name, mobile) VALUES
('Usman Ali', '0300-5555555'),
('Fatima Khan', '0321-6666666');

-- Inventory (sample)
INSERT INTO inventory (project_id, unit_number, unit_type, block, area_marla, rate_per_marla, notes)
SELECT id, 'Plot-101', 'plot', 'A', 5.00, 2500000, 'Corner plot' FROM projects WHERE name = 'DHA Phase 9'
UNION ALL
SELECT id, 'Plot-102', 'plot', 'A', 7.00, 2400000, NULL FROM projects WHERE name = 'DHA Phase 9'
UNION ALL
SELECT id, 'Plot-103', 'plot', 'B', 10.00, 2300000, 'Park facing' FROM projects WHERE name = 'DHA Phase 9'
UNION ALL
SELECT id, 'Shop-01', 'shop', 'Commercial', 3.00, 5000000, 'Main road' FROM projects WHERE name = 'Bahria Town'
UNION ALL
SELECT id, 'Plot-201', 'plot', 'C', 5.00, 1800000, NULL FROM projects WHERE name = 'Bahria Town';

-- Verify
SELECT 'Projects' as tbl, count(*) FROM projects
UNION ALL SELECT 'Inventory', count(*) FROM inventory
UNION ALL SELECT 'Company Reps', count(*) FROM company_reps;
