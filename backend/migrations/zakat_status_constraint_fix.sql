ALTER TABLE zakat_records DROP CONSTRAINT IF EXISTS zakat_records_status_check;
ALTER TABLE zakat_records
  ADD CONSTRAINT zakat_records_status_check
  CHECK (status IN ('active','pending','approved','rejected','disbursed','cancelled'));