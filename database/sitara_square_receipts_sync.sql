-- =============================================================
-- Sitara Square (PRJ-0001) — Receipts Sync
-- Creates Receipt + ReceiptAllocation records to match
-- the amount_paid already set on installments
-- =============================================================

BEGIN;

DO $$
DECLARE
  prj_uuid UUID;
  rec RECORD;
  inst RECORD;
  receipt_uuid UUID;
  remaining NUMERIC(15,2);
  alloc_amount NUMERIC(15,2);
  receipt_count INT := 0;
  alloc_count INT := 0;
BEGIN
  SELECT id INTO prj_uuid FROM projects WHERE project_id = 'PRJ-0001';

  -- Loop through all Sitara Square transactions that have payments
  FOR rec IN
    SELECT t.id as txn_id, t.customer_id, t.first_due_date,
           SUM(i.amount_paid) as total_paid
    FROM transactions t
    JOIN installments i ON i.transaction_id = t.id
    WHERE t.project_id = prj_uuid
    GROUP BY t.id, t.customer_id, t.first_due_date
    HAVING SUM(i.amount_paid) > 0
  LOOP
    -- Create one Receipt per transaction for the total paid amount
    INSERT INTO receipts (customer_id, transaction_id, amount, payment_method, payment_date, notes)
    VALUES (
      rec.customer_id,
      rec.txn_id,
      rec.total_paid,
      'bank_transfer',
      rec.first_due_date,
      'Historical payment - imported from Sitara Square Excel data (21 Feb 2026)'
    ) RETURNING id INTO receipt_uuid;
    receipt_count := receipt_count + 1;

    -- Allocate receipt across installments in order
    remaining := rec.total_paid;

    FOR inst IN
      SELECT id, amount_paid
      FROM installments
      WHERE transaction_id = rec.txn_id AND amount_paid > 0
      ORDER BY installment_number
    LOOP
      alloc_amount := LEAST(remaining, inst.amount_paid);
      IF alloc_amount > 0 THEN
        INSERT INTO receipt_allocations (receipt_id, installment_id, amount)
        VALUES (receipt_uuid, inst.id, alloc_amount);
        alloc_count := alloc_count + 1;
        remaining := remaining - alloc_amount;
      END IF;
    END LOOP;

  END LOOP;

  RAISE NOTICE 'Created % receipts and % allocations', receipt_count, alloc_count;
END $$;

-- Verification
SELECT 'Receipts' as entity, COUNT(*) as count FROM receipts
WHERE transaction_id IN (SELECT id FROM transactions WHERE project_id = (SELECT id FROM projects WHERE project_id = 'PRJ-0001'));

SELECT r.receipt_id, c.name as customer, r.amount, r.payment_method, r.payment_date
FROM receipts r
JOIN customers c ON r.customer_id = c.id
WHERE r.transaction_id IN (SELECT id FROM transactions WHERE project_id = (SELECT id FROM projects WHERE project_id = 'PRJ-0001'))
ORDER BY r.receipt_id;

COMMIT;
