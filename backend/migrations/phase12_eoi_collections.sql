BEGIN;

CREATE TABLE IF NOT EXISTS eoi_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eoi_id VARCHAR(20) UNIQUE NOT NULL,
    project_id UUID NOT NULL REFERENCES projects(id),
    customer_id UUID REFERENCES customers(id),
    broker_id UUID REFERENCES brokers(id),
    party_name VARCHAR(255) NOT NULL,
    party_mobile VARCHAR(20),
    party_cnic VARCHAR(20),
    broker_name VARCHAR(255),
    amount NUMERIC(15,2) NOT NULL,
    marlas NUMERIC(8,2),
    unit_number VARCHAR(50),
    inventory_id UUID REFERENCES inventory(id),
    payment_method VARCHAR(50),
    reference_number VARCHAR(100),
    eoi_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    converted_transaction_id UUID REFERENCES transactions(id),
    created_by UUID REFERENCES company_reps(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_eoi_status CHECK (status IN ('active', 'converted', 'cancelled', 'refunded'))
);

CREATE INDEX IF NOT EXISTS idx_eoi_project_date ON eoi_collections(project_id, eoi_date);
CREATE INDEX IF NOT EXISTS idx_eoi_status ON eoi_collections(status);
CREATE INDEX IF NOT EXISTS idx_eoi_created_by ON eoi_collections(created_by);
CREATE INDEX IF NOT EXISTS idx_eoi_broker_id ON eoi_collections(broker_id);
CREATE INDEX IF NOT EXISTS idx_eoi_converted_txn ON eoi_collections(converted_transaction_id);

COMMIT;
