-- =============================================
-- DELETION REQUESTS TABLE
-- Soft-delete approval workflow for all entities
-- =============================================

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

-- Sequence for request_id generation (DEL-00001, DEL-00002, ...)
CREATE SEQUENCE IF NOT EXISTS deletion_request_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_deletion_request_id()
RETURNS TRIGGER AS $$
BEGIN
    NEW.request_id := 'DEL-' || LPAD(nextval('deletion_request_id_seq')::TEXT, 5, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deletion_request_id ON deletion_requests;
CREATE TRIGGER trg_deletion_request_id
    BEFORE INSERT ON deletion_requests
    FOR EACH ROW
    WHEN (NEW.request_id IS NULL)
    EXECUTE FUNCTION generate_deletion_request_id();
