-- Radius CRM - Phase 6: Media Management
-- Run this after phase5_payments.sql

-- =============================================
-- MEDIA FILES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS media_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_id VARCHAR(20) UNIQUE NOT NULL,
    entity_type VARCHAR(50) NOT NULL,  -- transaction, interaction, project, receipt, payment
    entity_id UUID NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_type VARCHAR(50),  -- pdf, excel, image, audio, video, other
    file_size BIGINT,
    uploaded_by_rep_id UUID REFERENCES company_reps(id),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_media_entity ON media_files(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_media_file_id ON media_files(file_id);
CREATE INDEX IF NOT EXISTS idx_media_uploaded_by ON media_files(uploaded_by_rep_id);
CREATE INDEX IF NOT EXISTS idx_media_created_at ON media_files(created_at DESC);

CREATE SEQUENCE IF NOT EXISTS media_file_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_media_file_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.file_id IS NULL THEN
        NEW.file_id := 'MED-' || LPAD(nextval('media_file_id_seq')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_media_file_id ON media_files;
CREATE TRIGGER trg_media_file_id BEFORE INSERT ON media_files FOR EACH ROW EXECUTE FUNCTION generate_media_file_id();

-- Verify table created
SELECT 'Phase 6 media table created:' as info;
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'media_files'
ORDER BY table_name;

