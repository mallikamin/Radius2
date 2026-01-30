-- =============================================
-- RADIUS CRM - PHASE 2 TABLES
-- Projects, Inventory, Transactions, Installments
-- =============================================

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
-- COMPANY REPS TABLE (for later dashboard)
-- =============================================
CREATE TABLE company_reps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rep_id VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    mobile VARCHAR(20),
    email VARCHAR(255),
    designation VARCHAR(100),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE SEQUENCE rep_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_rep_id()
RETURNS TRIGGER AS $$
BEGIN
    NEW.rep_id := 'REP-' || LPAD(nextval('rep_id_seq')::TEXT, 4, '0');
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rep_id
    BEFORE INSERT ON company_reps
    FOR EACH ROW
    WHEN (NEW.rep_id IS NULL)
    EXECUTE FUNCTION generate_rep_id();

-- =============================================
-- INVENTORY TABLE
-- =============================================
CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inventory_id VARCHAR(20) UNIQUE NOT NULL,
    project_id UUID REFERENCES projects(id) NOT NULL,
    
    -- Unit details
    unit_number VARCHAR(50) NOT NULL,
    unit_type VARCHAR(50) DEFAULT 'plot',  -- plot, shop, house, flat
    block VARCHAR(50),
    
    -- Size & Value
    area_marla DECIMAL(10,2) NOT NULL,
    rate_per_marla DECIMAL(15,2) NOT NULL,
    total_value DECIMAL(15,2) GENERATED ALWAYS AS (area_marla * rate_per_marla) STORED,
    
    -- Status
    status VARCHAR(20) DEFAULT 'available',  -- available, sold, reserved, hold
    
    -- Extra info
    notes TEXT,
    factor_details TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(project_id, unit_number)
);

CREATE SEQUENCE inventory_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_inventory_id()
RETURNS TRIGGER AS $$
BEGIN
    NEW.inventory_id := 'INV-' || LPAD(nextval('inventory_id_seq')::TEXT, 5, '0');
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inventory_id
    BEFORE INSERT ON inventory
    FOR EACH ROW
    WHEN (NEW.inventory_id IS NULL)
    EXECUTE FUNCTION generate_inventory_id();

CREATE INDEX idx_inventory_project ON inventory(project_id);
CREATE INDEX idx_inventory_status ON inventory(status);

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
    
    -- Denormalized for quick display
    customer_name VARCHAR(255),
    broker_name VARCHAR(255),
    project_name VARCHAR(255),
    unit_number VARCHAR(50),
    
    -- Financials
    area_marla DECIMAL(10,2) NOT NULL,
    rate_per_marla DECIMAL(15,2) NOT NULL,
    total_value DECIMAL(15,2) NOT NULL,
    
    -- Broker commission
    broker_commission_rate DECIMAL(5,2) DEFAULT 2.00,
    broker_commission_amount DECIMAL(15,2) GENERATED ALWAYS AS (total_value * broker_commission_rate / 100) STORED,
    
    -- Installment plan
    installment_cycle VARCHAR(20) DEFAULT 'biannual',  -- monthly, quarterly, biannual, annual, custom
    num_installments INTEGER DEFAULT 4,
    first_due_date DATE NOT NULL,
    
    -- Status
    status VARCHAR(20) DEFAULT 'active',  -- active, completed, cancelled
    
    booking_date DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE SEQUENCE transaction_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_transaction_id()
RETURNS TRIGGER AS $$
BEGIN
    NEW.transaction_id := 'TXN-' || LPAD(nextval('transaction_id_seq')::TEXT, 5, '0');
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transaction_id
    BEFORE INSERT ON transactions
    FOR EACH ROW
    WHEN (NEW.transaction_id IS NULL)
    EXECUTE FUNCTION generate_transaction_id();

CREATE INDEX idx_transactions_customer ON transactions(customer_id);
CREATE INDEX idx_transactions_broker ON transactions(broker_id);
CREATE INDEX idx_transactions_project ON transactions(project_id);
CREATE INDEX idx_transactions_status ON transactions(status);

-- =============================================
-- INSTALLMENTS TABLE
-- =============================================
CREATE TABLE installments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE NOT NULL,
    
    installment_number INTEGER NOT NULL,
    due_date DATE NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    amount_paid DECIMAL(15,2) DEFAULT 0,
    
    status VARCHAR(20) DEFAULT 'pending',  -- pending, partial, paid, overdue
    
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(transaction_id, installment_number)
);

CREATE INDEX idx_installments_transaction ON installments(transaction_id);
CREATE INDEX idx_installments_due_date ON installments(due_date);
CREATE INDEX idx_installments_status ON installments(status);

-- =============================================
-- FUNCTION: Auto-create installments on transaction insert
-- =============================================
CREATE OR REPLACE FUNCTION create_installments()
RETURNS TRIGGER AS $$
DECLARE
    i INTEGER;
    due DATE;
    installment_amount DECIMAL(15,2);
    cycle_months INTEGER;
BEGIN
    -- Calculate installment amount (equal split)
    installment_amount := NEW.total_value / NEW.num_installments;
    
    -- Determine cycle in months
    cycle_months := CASE NEW.installment_cycle
        WHEN 'monthly' THEN 1
        WHEN 'quarterly' THEN 3
        WHEN 'biannual' THEN 6
        WHEN 'annual' THEN 12
        ELSE 6  -- default biannual
    END;
    
    -- Create installments
    FOR i IN 1..NEW.num_installments LOOP
        due := NEW.first_due_date + ((i - 1) * cycle_months * INTERVAL '1 month');
        
        INSERT INTO installments (transaction_id, installment_number, due_date, amount)
        VALUES (NEW.id, i, due, installment_amount);
    END LOOP;
    
    -- Mark inventory as sold
    UPDATE inventory SET status = 'sold', updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.inventory_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_create_installments
    AFTER INSERT ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION create_installments();

-- =============================================
-- UPDATE TRIGGERS
-- =============================================
CREATE TRIGGER trg_projects_updated
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_inventory_updated
    BEFORE UPDATE ON inventory
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_transactions_updated
    BEFORE UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_installments_updated
    BEFORE UPDATE ON installments
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_company_reps_updated
    BEFORE UPDATE ON company_reps
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- =============================================
-- TEST DATA
-- =============================================
-- Projects
INSERT INTO projects (name, location, description) VALUES
('DHA Phase 9', 'DHA Lahore', 'Premium residential plots'),
('Bahria Orchard', 'Raiwind Road', 'Affordable housing scheme'),
('Lake City', 'Raiwind Road', 'Lakefront community');

-- Company Reps
INSERT INTO company_reps (name, mobile, designation) VALUES
('Usman Ghani', '0300-1111111', 'Sales Manager'),
('Fatima Zahra', '0300-2222222', 'Senior Sales');

-- Verify
SELECT 'Projects:' as tbl, count(*) FROM projects
UNION ALL SELECT 'Company Reps:', count(*) FROM company_reps;

\dt
