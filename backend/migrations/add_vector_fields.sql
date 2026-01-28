-- ============================================
-- Vector Integration Migration Script
-- Adds Vector-specific fields to existing tables
-- Creates all Vector-specific tables
-- Safe to run multiple times (idempotent)
-- ============================================

-- Add Vector-specific fields to projects table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='map_pdf_base64') THEN
        ALTER TABLE projects ADD COLUMN map_pdf_base64 TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='map_name') THEN
        ALTER TABLE projects ADD COLUMN map_name VARCHAR(255);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='map_size') THEN
        ALTER TABLE projects ADD COLUMN map_size JSONB;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='vector_metadata') THEN
        ALTER TABLE projects ADD COLUMN vector_metadata JSONB;
    END IF;
END $$;

-- Add Vector-specific fields to inventory table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory' AND column_name='plot_coordinates') THEN
        ALTER TABLE inventory ADD COLUMN plot_coordinates JSONB;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory' AND column_name='plot_offset') THEN
        ALTER TABLE inventory ADD COLUMN plot_offset JSONB;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory' AND column_name='is_manual_plot') THEN
        ALTER TABLE inventory ADD COLUMN is_manual_plot VARCHAR(10) DEFAULT 'false';
    END IF;
END $$;

-- Enable UUID extension if not already enabled (for older PostgreSQL versions)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create vector_projects table
CREATE TABLE IF NOT EXISTS vector_projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    map_name VARCHAR(255),
    map_pdf_base64 TEXT,
    map_size JSONB,
    linked_project_id UUID REFERENCES projects(id),
    vector_metadata JSONB,
    system_branches JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create vector_annotations table
CREATE TABLE IF NOT EXISTS vector_annotations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES vector_projects(id) ON DELETE CASCADE,
    annotation_id VARCHAR(100) NOT NULL,
    note TEXT,
    category VARCHAR(100),
    color VARCHAR(50),
    font_size INTEGER,
    rotation INTEGER DEFAULT 0,
    plot_ids JSONB,
    plot_nums JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create vector_shapes table
CREATE TABLE IF NOT EXISTS vector_shapes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES vector_projects(id) ON DELETE CASCADE,
    shape_id VARCHAR(100) NOT NULL,
    type VARCHAR(50),
    x INTEGER,
    y INTEGER,
    width INTEGER,
    height INTEGER,
    color VARCHAR(50),
    data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create vector_labels table
CREATE TABLE IF NOT EXISTS vector_labels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES vector_projects(id) ON DELETE CASCADE,
    label_id VARCHAR(100) NOT NULL,
    text TEXT,
    x INTEGER,
    y INTEGER,
    size INTEGER,
    color VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create vector_legend table
CREATE TABLE IF NOT EXISTS vector_legend (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL UNIQUE REFERENCES vector_projects(id) ON DELETE CASCADE,
    visible VARCHAR(10) DEFAULT 'true',
    minimized VARCHAR(10) DEFAULT 'false',
    position VARCHAR(50),
    manual_entries JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create vector_branches table
CREATE TABLE IF NOT EXISTS vector_branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES vector_projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP,
    anno_count INTEGER,
    data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create vector_creator_notes table
CREATE TABLE IF NOT EXISTS vector_creator_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES vector_projects(id) ON DELETE CASCADE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    note TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create vector_change_log table
CREATE TABLE IF NOT EXISTS vector_change_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES vector_projects(id) ON DELETE CASCADE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    action TEXT,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create vector_project_backups table
CREATE TABLE IF NOT EXISTS vector_project_backups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES vector_projects(id) ON DELETE CASCADE,
    backup_data JSONB NOT NULL,
    created_by UUID REFERENCES company_reps(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create vector_backup_settings table
CREATE TABLE IF NOT EXISTS vector_backup_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    frequency VARCHAR(100) DEFAULT '0 2 * * *',
    enabled VARCHAR(10) DEFAULT 'true',
    last_run TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create vector_reconciliation table
CREATE TABLE IF NOT EXISTS vector_reconciliation (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES vector_projects(id) ON DELETE CASCADE,
    linked_project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    sync_status VARCHAR(50),
    discrepancies JSONB,
    last_sync_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_vector_projects_linked_project_id ON vector_projects(linked_project_id);
CREATE INDEX IF NOT EXISTS idx_vector_annotations_project_id ON vector_annotations(project_id);
CREATE INDEX IF NOT EXISTS idx_vector_shapes_project_id ON vector_shapes(project_id);
CREATE INDEX IF NOT EXISTS idx_vector_labels_project_id ON vector_labels(project_id);
CREATE INDEX IF NOT EXISTS idx_vector_branches_project_id ON vector_branches(project_id);
CREATE INDEX IF NOT EXISTS idx_vector_reconciliation_project_id ON vector_reconciliation(project_id);
CREATE INDEX IF NOT EXISTS idx_vector_reconciliation_linked_project_id ON vector_reconciliation(linked_project_id);

