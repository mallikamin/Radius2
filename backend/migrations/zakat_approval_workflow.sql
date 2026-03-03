ALTER TABLE zakat_records
ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS approved_amount NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS approved_by_rep_id UUID REFERENCES company_reps(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS approval_decision VARCHAR(20),
ADD COLUMN IF NOT EXISTS approval_notes TEXT,
ADD COLUMN IF NOT EXISTS case_status VARCHAR(20) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS disbursement_approval_status VARCHAR(20) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS disbursement_approved_by_rep_id UUID REFERENCES company_reps(id),
ADD COLUMN IF NOT EXISTS disbursement_approved_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS disbursement_approval_notes TEXT;

ALTER TABLE zakat_records DROP CONSTRAINT IF EXISTS zakat_records_status_check;
ALTER TABLE zakat_records
ADD CONSTRAINT zakat_records_status_check
CHECK (status IN ('active','pending','approved','rejected','disbursed','cancelled'));

CREATE TABLE IF NOT EXISTS zakat_disbursements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zakat_record_id UUID NOT NULL REFERENCES zakat_records(id) ON DELETE CASCADE,
    amount NUMERIC(15,2) NOT NULL,
    disbursed_by_rep_id UUID REFERENCES company_reps(id) ON DELETE SET NULL,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    payment_method VARCHAR(50),
    reference_number VARCHAR(100),
    receipt_number VARCHAR(100),
    notes TEXT,
    disbursement_date DATE,
    disbursed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_zakat_disbursements_zakat_record_id ON zakat_disbursements(zakat_record_id);
