-- Radius CRM v3 - Phase 3: Interactions, Campaigns & Leads
-- Run this after the base tables are created

-- =============================================
-- INTERACTIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interaction_id VARCHAR(20) UNIQUE NOT NULL,
    company_rep_id UUID NOT NULL REFERENCES company_reps(id),
    customer_id UUID REFERENCES customers(id),
    broker_id UUID REFERENCES brokers(id),
    interaction_type VARCHAR(20) NOT NULL,  -- call, message, whatsapp
    status VARCHAR(50),
    notes TEXT,
    next_follow_up DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_interaction_target CHECK (customer_id IS NOT NULL OR broker_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_interactions_rep ON interactions(company_rep_id);
CREATE INDEX IF NOT EXISTS idx_interactions_customer ON interactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_interactions_broker ON interactions(broker_id);
CREATE INDEX IF NOT EXISTS idx_interactions_type ON interactions(interaction_type);
CREATE INDEX IF NOT EXISTS idx_interactions_created ON interactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_followup ON interactions(next_follow_up) WHERE next_follow_up IS NOT NULL;

-- Sequence for interaction_id
CREATE SEQUENCE IF NOT EXISTS interaction_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_interaction_id()
RETURNS TRIGGER AS $$
BEGIN
    NEW.interaction_id := 'INT-' || LPAD(nextval('interaction_id_seq')::TEXT, 5, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_interaction_id ON interactions;
CREATE TRIGGER trg_interaction_id
    BEFORE INSERT ON interactions
    FOR EACH ROW
    WHEN (NEW.interaction_id IS NULL)
    EXECUTE FUNCTION generate_interaction_id();

-- =============================================
-- CAMPAIGNS TABLE (for FB ads, lead sources)
-- =============================================
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    source VARCHAR(50),  -- facebook, google, instagram, referral, etc
    start_date DATE,
    end_date DATE,
    budget DECIMAL(15,2),
    status VARCHAR(20) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_source ON campaigns(source);
CREATE INDEX IF NOT EXISTS idx_campaigns_dates ON campaigns(start_date, end_date);

-- Sequence for campaign_id
CREATE SEQUENCE IF NOT EXISTS campaign_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_campaign_id()
RETURNS TRIGGER AS $$
BEGIN
    NEW.campaign_id := 'CMP-' || LPAD(nextval('campaign_id_seq')::TEXT, 4, '0');
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_campaign_id ON campaigns;
CREATE TRIGGER trg_campaign_id
    BEFORE INSERT ON campaigns
    FOR EACH ROW
    WHEN (NEW.campaign_id IS NULL)
    EXECUTE FUNCTION generate_campaign_id();

CREATE TRIGGER trg_campaigns_updated
    BEFORE UPDATE ON campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- =============================================
-- LEADS TABLE (from campaigns, allocated to reps)
-- =============================================
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id VARCHAR(20) UNIQUE NOT NULL,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    assigned_rep_id UUID REFERENCES company_reps(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    mobile VARCHAR(20),
    email VARCHAR(255),
    source_details TEXT,
    status VARCHAR(50) DEFAULT 'new',  -- new, contacted, qualified, converted, lost
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_rep ON leads(assigned_rep_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_mobile ON leads(mobile) WHERE mobile IS NOT NULL;

-- Sequence for lead_id
CREATE SEQUENCE IF NOT EXISTS lead_id_seq START 1;

CREATE OR REPLACE FUNCTION generate_lead_id()
RETURNS TRIGGER AS $$
BEGIN
    NEW.lead_id := 'LEAD-' || LPAD(nextval('lead_id_seq')::TEXT, 5, '0');
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lead_id ON leads;
CREATE TRIGGER trg_lead_id
    BEFORE INSERT ON leads
    FOR EACH ROW
    WHEN (NEW.lead_id IS NULL)
    EXECUTE FUNCTION generate_lead_id();

CREATE TRIGGER trg_leads_updated
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- =============================================
-- USEFUL VIEWS FOR REPORTING
-- =============================================

-- Campaign performance view
CREATE OR REPLACE VIEW v_campaign_performance AS
SELECT 
    c.campaign_id,
    c.name,
    c.source,
    c.budget,
    c.status,
    c.start_date,
    c.end_date,
    COUNT(l.id) as total_leads,
    COUNT(CASE WHEN l.status = 'new' THEN 1 END) as new_leads,
    COUNT(CASE WHEN l.status = 'contacted' THEN 1 END) as contacted_leads,
    COUNT(CASE WHEN l.status = 'qualified' THEN 1 END) as qualified_leads,
    COUNT(CASE WHEN l.status = 'converted' THEN 1 END) as converted_leads,
    COUNT(CASE WHEN l.status = 'lost' THEN 1 END) as lost_leads,
    ROUND(COUNT(CASE WHEN l.status = 'converted' THEN 1 END)::DECIMAL / NULLIF(COUNT(l.id), 0) * 100, 1) as conversion_rate
FROM campaigns c
LEFT JOIN leads l ON l.campaign_id = c.id
GROUP BY c.id;

-- Rep performance view
CREATE OR REPLACE VIEW v_rep_performance AS
SELECT 
    r.rep_id,
    r.name,
    COUNT(DISTINCT i.id) as total_interactions,
    COUNT(DISTINCT CASE WHEN i.interaction_type = 'call' THEN i.id END) as calls,
    COUNT(DISTINCT CASE WHEN DATE(i.created_at) = CURRENT_DATE THEN i.id END) as today_interactions,
    COUNT(DISTINCT l.id) as assigned_leads,
    COUNT(DISTINCT CASE WHEN l.status = 'converted' THEN l.id END) as converted_leads
FROM company_reps r
LEFT JOIN interactions i ON i.company_rep_id = r.id
LEFT JOIN leads l ON l.assigned_rep_id = r.id
GROUP BY r.id;

-- Verify tables created
SELECT 'Tables created:' as info;
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('interactions', 'campaigns', 'leads')
ORDER BY table_name;
