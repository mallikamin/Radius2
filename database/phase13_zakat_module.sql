-- Phase 13: Zakat Disbursement Module
-- Date: 2026-02-27
-- Purpose: Zakat register + beneficiary tracking per Sitara Builders SOP

BEGIN;

-- =============================================
-- 1. Zakat Beneficiaries table
-- =============================================
CREATE TABLE IF NOT EXISTS zakat_beneficiaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    beneficiary_id VARCHAR(20) UNIQUE NOT NULL,            -- ZBN-XXXXX
    name VARCHAR(255) NOT NULL,
    cnic VARCHAR(20),
    mobile VARCHAR(20),
    address TEXT,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'active',                   -- active, inactive
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zakat_ben_status ON zakat_beneficiaries(status);
CREATE INDEX IF NOT EXISTS idx_zakat_ben_cnic ON zakat_beneficiaries(cnic);
CREATE INDEX IF NOT EXISTS idx_zakat_ben_mobile ON zakat_beneficiaries(mobile);

-- =============================================
-- 2. Zakat Records table (the register)
-- =============================================
CREATE TABLE IF NOT EXISTS zakat_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zakat_id VARCHAR(20) UNIQUE NOT NULL,                  -- ZKT-XXXXX
    beneficiary_id UUID REFERENCES zakat_beneficiaries(id),
    -- Denormalized beneficiary snapshot
    beneficiary_name VARCHAR(255) NOT NULL,
    beneficiary_cnic VARCHAR(20),
    beneficiary_mobile VARCHAR(20),
    beneficiary_address TEXT,
    -- Zakat details
    amount NUMERIC(15,2) NOT NULL,
    category VARCHAR(50) NOT NULL,                         -- medical, education, hardship, other
    purpose TEXT,                                           -- brief reason for assistance
    -- CEO Approval
    approval_reference TEXT,                                -- signed note / email / WhatsApp ref
    approved_by VARCHAR(255),                               -- CEO name or reference
    -- Disbursement
    payment_method VARCHAR(50),                             -- bank_transfer, cash, online
    reference_number VARCHAR(100),                          -- cheque#, txn ID, etc.
    receipt_number VARCHAR(100),                            -- physical receipt number
    disbursed_by UUID REFERENCES company_reps(id),          -- rep who physically disbursed
    disbursement_date DATE,                                 -- when actually paid
    -- Status & audit
    status VARCHAR(20) DEFAULT 'active'
        CHECK (status IN ('active', 'disbursed', 'cancelled')),
    notes TEXT,
    payment_id UUID REFERENCES payments(id),                -- auto-created Payment on disburse
    created_by UUID REFERENCES company_reps(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_zakat_beneficiary ON zakat_records(beneficiary_id);
CREATE INDEX IF NOT EXISTS idx_zakat_status ON zakat_records(status);
CREATE INDEX IF NOT EXISTS idx_zakat_category ON zakat_records(category);
CREATE INDEX IF NOT EXISTS idx_zakat_created_by ON zakat_records(created_by);
CREATE INDEX IF NOT EXISTS idx_zakat_disbursed_by ON zakat_records(disbursed_by);
CREATE INDEX IF NOT EXISTS idx_zakat_date ON zakat_records(disbursement_date);

-- =============================================
-- 3. Irfan Saeed (IF NOT EXISTS — already on DO)
-- =============================================
INSERT INTO company_reps (id, rep_id, name, role, title, mobile, status)
SELECT gen_random_uuid(), 'REP-0020', 'Irfan Saeed', 'user', 'Director Internal Audit', '', 'active'
WHERE NOT EXISTS (SELECT 1 FROM company_reps WHERE rep_id = 'REP-0020');

-- =============================================
-- 4. EOI: Add payment_received column
-- =============================================
ALTER TABLE eoi_collections ADD COLUMN IF NOT EXISTS payment_received BOOLEAN DEFAULT FALSE;
ALTER TABLE eoi_collections ADD COLUMN IF NOT EXISTS payment_received_at TIMESTAMP;

COMMIT;
