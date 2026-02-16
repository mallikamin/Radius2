-- Phase 9: Enhanced CRM — Lookup Values, Customer/Lead Enhancements, Rep Isolation
-- Run on ORBIT CRM database (port 5440 local, 5435 prod)
-- All statements are idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING)

-- ============================================
-- 1. LOOKUP VALUES TABLE (admin-managed dropdowns)
-- ============================================
CREATE TABLE IF NOT EXISTS lookup_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(50) NOT NULL,
    label VARCHAR(255) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 99,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lookup_values_cat_label
    ON lookup_values(category, label);
CREATE INDEX IF NOT EXISTS idx_lookup_values_category
    ON lookup_values(category);

-- Seed customer_source defaults
INSERT INTO lookup_values (category, label, sort_order) VALUES
    ('customer_source', 'Personal', 1),
    ('customer_source', 'Walk-in', 2),
    ('customer_source', 'Social Media', 3),
    ('customer_source', 'Event', 4),
    ('customer_source', 'Referral', 5),
    ('customer_source', 'Other', 99)
ON CONFLICT (category, label) DO NOTHING;

-- Seed customer_occupation defaults
INSERT INTO lookup_values (category, label, sort_order) VALUES
    ('customer_occupation', 'Businessman', 1),
    ('customer_occupation', 'Private Job', 2),
    ('customer_occupation', 'Public Job', 3),
    ('customer_occupation', 'Professional', 4),
    ('customer_occupation', 'Other', 99)
ON CONFLICT (category, label) DO NOTHING;

-- ============================================
-- 2. CUSTOMER TABLE ENHANCEMENTS (12 new columns)
-- ============================================
ALTER TABLE customers ADD COLUMN IF NOT EXISTS additional_mobiles JSONB DEFAULT '[]';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS source VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS source_other TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS occupation VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS occupation_other TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS interested_project_id UUID REFERENCES projects(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS interested_project_other TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS area TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS country_code VARCHAR(5) DEFAULT '+92';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS assigned_rep_id UUID REFERENCES company_reps(id);

CREATE INDEX IF NOT EXISTS idx_customers_assigned_rep ON customers(assigned_rep_id);
CREATE INDEX IF NOT EXISTS idx_customers_additional_mobiles ON customers USING GIN (additional_mobiles);

-- ============================================
-- 3. LEAD TABLE ENHANCEMENTS (11 new columns)
-- ============================================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS additional_mobiles JSONB DEFAULT '[]';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source VARCHAR(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_other TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS occupation VARCHAR(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS occupation_other TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS interested_project_id UUID REFERENCES projects(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS interested_project_other TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS area TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS country_code VARCHAR(5) DEFAULT '+92';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_leads_additional_mobiles ON leads USING GIN (additional_mobiles);

-- ============================================
-- 4. COMPANY REPS: rep_type for data isolation
-- ============================================
-- Values: 'direct', 'indirect', 'both', or NULL (NULL = legacy, no isolation)
ALTER TABLE company_reps ADD COLUMN IF NOT EXISTS rep_type VARCHAR(20);

-- ============================================
-- 5. BROKERS: assigned_rep_id for indirect rep ownership
-- ============================================
ALTER TABLE brokers ADD COLUMN IF NOT EXISTS assigned_rep_id UUID REFERENCES company_reps(id);

CREATE INDEX IF NOT EXISTS idx_brokers_assigned_rep ON brokers(assigned_rep_id);
