-- =============================================
-- NOTIFICATIONS TABLE
-- In-app notification system for overdue alerts,
-- deletion requests, and system events
-- =============================================

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

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_rep_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_rep_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_category ON notifications(category);
CREATE INDEX IF NOT EXISTS idx_notifications_entity ON notifications(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- =============================================
-- AUDIT LOG TABLE
-- Full activity/audit log for tracking all
-- CREATE, UPDATE, DELETE operations
-- =============================================

CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_rep_id VARCHAR(20),
    user_name VARCHAR(100),
    action VARCHAR(20),
    entity_type VARCHAR(50),
    entity_id VARCHAR(50),
    entity_name VARCHAR(200),
    changes TEXT,
    ip_address VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_rep_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

-- =============================================
-- VECTOR PROJECTS: Add map_file_path column
-- For filesystem-based PDF storage (Feature #26)
-- =============================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vector_projects') THEN
        ALTER TABLE vector_projects ADD COLUMN IF NOT EXISTS map_file_path VARCHAR(500);
    END IF;
END $$;
