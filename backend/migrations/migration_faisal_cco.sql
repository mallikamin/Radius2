-- ============================================
-- Migration: CRM-FaisalCCO-12thFebChanges
-- Date: Feb 12, 2026
-- Branch: CRM-FaisalCCO-12thFebChanges (from Prod11022026)
--
-- Features: Notification system, lead pipeline stages,
--           search audit, lead assignment workflow,
--           duplicate detection, CCO role, customer docs
--
-- SAFE: All statements are idempotent (IF NOT EXISTS / IF EXISTS)
-- NOTE: notifications table already exists (from TARS migration)
--       — we ADD a data JSONB column, keep existing structure
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

BEGIN;

-- ============================================
-- 1. NOTIFICATIONS TABLE — adapt existing
-- Existing columns: id(SERIAL), notification_id, user_rep_id(VARCHAR),
--   title, message, type, category, entity_type, entity_id,
--   is_read, created_at, read_at
-- We add: data JSONB for flexible payloads
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    notification_id VARCHAR(20) UNIQUE,
    user_rep_id VARCHAR(20) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT,
    type VARCHAR(50) DEFAULT 'info',
    category VARCHAR(50),
    entity_type VARCHAR(50),
    entity_id VARCHAR(50),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP
);

-- Add data column if it doesn't exist (for our new features)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';

-- Ensure indexes exist (idempotent)
CREATE INDEX IF NOT EXISTS idx_notifications_unread
    ON notifications(user_rep_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_user
    ON notifications(user_rep_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created
    ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_category
    ON notifications(category);
CREATE INDEX IF NOT EXISTS idx_notifications_entity
    ON notifications(entity_type, entity_id);

-- Ensure sequence and trigger exist
CREATE SEQUENCE IF NOT EXISTS notification_id_seq START 1;

-- Sync sequence to max existing ID to avoid conflicts
DO $$
DECLARE max_id INTEGER;
BEGIN
    SELECT COALESCE(MAX(CAST(REPLACE(notification_id, 'NTF-', '') AS INTEGER)), 0) INTO max_id
    FROM notifications WHERE notification_id LIKE 'NTF-%';
    IF max_id > 0 THEN
        PERFORM setval('notification_id_seq', max_id);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION generate_notification_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.notification_id IS NULL THEN
        NEW.notification_id := 'NTF-' || LPAD(nextval('notification_id_seq')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notification_id ON notifications;
CREATE TRIGGER trg_notification_id BEFORE INSERT ON notifications
    FOR EACH ROW WHEN (NEW.notification_id IS NULL)
    EXECUTE FUNCTION generate_notification_id();

-- ============================================
-- 2. SEARCH LOG TABLE (new)
-- ============================================
CREATE TABLE IF NOT EXISTS search_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    searcher_rep_id VARCHAR(20) NOT NULL,
    search_query VARCHAR(255) NOT NULL,
    search_type VARCHAR(50),
    matched_entity_type VARCHAR(50),
    matched_entity_id VARCHAR(50),
    matched_entity_name VARCHAR(255),
    owner_rep_id VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_search_log_searcher
    ON search_log(searcher_rep_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_log_owner
    ON search_log(owner_rep_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_log_created
    ON search_log(created_at DESC);

-- ============================================
-- 3. LEAD ASSIGNMENT REQUESTS TABLE (new)
-- ============================================
CREATE TABLE IF NOT EXISTS lead_assignment_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id VARCHAR(20) UNIQUE,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    requested_by UUID REFERENCES company_reps(id) ON DELETE SET NULL,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    reviewed_by UUID REFERENCES company_reps(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE SEQUENCE IF NOT EXISTS lead_assignment_request_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_lead_assignment_request_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.request_id IS NULL THEN
        NEW.request_id := 'LAR-' || LPAD(nextval('lead_assignment_request_id_seq')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lead_assignment_request_id ON lead_assignment_requests;
CREATE TRIGGER trg_lead_assignment_request_id BEFORE INSERT ON lead_assignment_requests
    FOR EACH ROW WHEN (NEW.request_id IS NULL)
    EXECUTE FUNCTION generate_lead_assignment_request_id();

CREATE INDEX IF NOT EXISTS idx_lar_status ON lead_assignment_requests(status);
CREATE INDEX IF NOT EXISTS idx_lar_lead ON lead_assignment_requests(lead_id);
CREATE INDEX IF NOT EXISTS idx_lar_requested_by ON lead_assignment_requests(requested_by);

-- ============================================
-- 4. PIPELINE STAGES TABLE (new)
-- ============================================
CREATE TABLE IF NOT EXISTS pipeline_stages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    display_order INTEGER NOT NULL,
    color VARCHAR(20) DEFAULT '#6B7280',
    is_terminal BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed default stages (skip if already exist)
INSERT INTO pipeline_stages (name, display_order, color, is_terminal) VALUES
    ('New', 1, '#3B82F6', FALSE),
    ('Contacted', 2, '#8B5CF6', FALSE),
    ('Interested', 3, '#F59E0B', FALSE),
    ('Site Visit', 4, '#10B981', FALSE),
    ('Negotiation', 5, '#EC4899', FALSE),
    ('Won', 6, '#22C55E', TRUE),
    ('Lost', 7, '#EF4444', TRUE)
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- 5. ALTER LEADS TABLE — add pipeline columns
-- ============================================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipeline_stage VARCHAR(100) DEFAULT 'New';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMP;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_stale BOOLEAN DEFAULT FALSE;

-- Data migration: map existing status to pipeline_stage for any existing leads
UPDATE leads SET pipeline_stage = CASE
    WHEN status = 'new' THEN 'New'
    WHEN status = 'contacted' THEN 'Contacted'
    WHEN status = 'qualified' THEN 'Interested'
    WHEN status = 'converted' THEN 'Won'
    WHEN status = 'lost' THEN 'Lost'
    ELSE 'New'
END
WHERE (pipeline_stage = 'New' OR pipeline_stage IS NULL) AND status != 'new';

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage ON leads(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_leads_is_stale ON leads(is_stale) WHERE is_stale = TRUE;
CREATE INDEX IF NOT EXISTS idx_leads_rep_pipeline ON leads(assigned_rep_id, pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_leads_last_contacted ON leads(last_contacted_at);

-- ============================================
-- 6. ALTER INTERACTIONS TABLE — add lead_id
-- ============================================
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;

-- Safely update CHECK constraint (drop old, add new with lead_id)
ALTER TABLE interactions DROP CONSTRAINT IF EXISTS chk_interaction_target;
ALTER TABLE interactions ADD CONSTRAINT chk_interaction_target
    CHECK (customer_id IS NOT NULL OR broker_id IS NOT NULL OR lead_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_interactions_lead ON interactions(lead_id);

-- ============================================
-- 7. HEALTH CHECK — verify all tables and columns
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
        RAISE EXCEPTION 'notifications table not found';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'search_log') THEN
        RAISE EXCEPTION 'search_log table not created';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lead_assignment_requests') THEN
        RAISE EXCEPTION 'lead_assignment_requests table not created';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pipeline_stages') THEN
        RAISE EXCEPTION 'pipeline_stages table not created';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'data') THEN
        RAISE EXCEPTION 'notifications.data column not added';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'pipeline_stage') THEN
        RAISE EXCEPTION 'leads.pipeline_stage column not added';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'last_contacted_at') THEN
        RAISE EXCEPTION 'leads.last_contacted_at column not added';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'interactions' AND column_name = 'lead_id') THEN
        RAISE EXCEPTION 'interactions.lead_id column not added';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_interaction_target') THEN
        RAISE EXCEPTION 'chk_interaction_target constraint not updated';
    END IF;

    RAISE NOTICE '=== Migration PASSED — all tables, columns, and constraints verified ===';
END $$;

-- ============================================
-- 8. CREATE CCO USER — Syed Faisal (idempotent)
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM company_reps WHERE name = 'Syed Faisal') THEN
        INSERT INTO company_reps (id, rep_id, name, role, status, password_hash, created_at)
        VALUES (
            uuid_generate_v4(),
            'REP-' || LPAD(nextval('rep_id_seq')::TEXT, 4, '0'),
            'Syed Faisal',
            'cco',
            'active',
            '$2b$12$RGBfenYPQ1A1nUyNsxphTOvvwMwzMtCaJwen9MBHYQjBqYZQT5Z7.',
            CURRENT_TIMESTAMP
        );
        RAISE NOTICE 'CCO user Syed Faisal created';
    ELSE
        -- Ensure role is cco even if user exists
        UPDATE company_reps SET role = 'cco' WHERE name = 'Syed Faisal' AND role != 'cco';
        RAISE NOTICE 'CCO user Syed Faisal already exists';
    END IF;
END $$;

COMMIT;
