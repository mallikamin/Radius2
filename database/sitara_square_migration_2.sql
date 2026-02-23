-- =============================================================
-- Sitara Square (PRJ-0001) Data Migration — Batch 2
-- Generated from: Sitara Square Inventory Updating 2.xlsx
-- Date: 2026-02-23
-- Transactions: 12 (shops 5,10,19,20,21,24,28,33,34,36,45,C6)
-- New customers: 11 | Existing brokers: 3 | New brokers: 2
-- =============================================================

BEGIN;

DO $$
DECLARE
  prj_uuid UUID;
  -- Customers (all new)
  cust_0 UUID;   -- Muhammad Shehzad (03003939213) — Shop 5
  cust_1 UUID;   -- Bilal Aslam (03326768200) — Shop 10
  cust_2 UUID;   -- Muhammed Fayaz (03017068558) — Shop 19
  cust_3 UUID;   -- Amna Asif (03424021021) — Shop 20
  cust_4 UUID;   -- Imran Mujahid (03006664321) — Shop 21
  cust_5 UUID;   -- Rizwan Ali Ashraf (03008669557) — Shop 24
  cust_6 UUID;   -- Shehryar Zafar (03338921455) — Shop 28
  cust_7 UUID;   -- Fahad Farooq (03006600000) — Shops 33, 34
  cust_8 UUID;   -- Sheikh Saleem (03008275695) — Shop 36
  cust_9 UUID;   -- M. Abdullah (03026264333) — Shop 45
  cust_10 UUID;  -- Hammad Ali (03226056106) — Shop C6
  -- Brokers
  brk_0 UUID;   -- Shehzad Akram (03218661120) — EXISTING
  brk_1 UUID;   -- Malik Asif (03227861900) — EXISTING
  brk_2 UUID;   -- Affaq Khan (03009667787) — NEW
  brk_3 UUID;   -- Ali Akbar (03008669557) — EXISTING
  brk_4 UUID;   -- Waqar (03216607232) — NEW
  -- Working vars
  inv_uuid UUID;
  txn_uuid UUID;
  inst_amount NUMERIC(15,2);
  remaining NUMERIC(15,2);
  paid_this NUMERIC(15,2);
BEGIN

  -- ============ Step 1: Get Project UUID ============
  SELECT id INTO prj_uuid FROM projects WHERE project_id = 'PRJ-0001';
  IF prj_uuid IS NULL THEN
    RAISE EXCEPTION 'PRJ-0001 not found!';
  END IF;

  -- ============ Step 2: Create Inventory for C6 ============
  -- C6 is a commercial unit not in the original inventory
  INSERT INTO inventory (project_id, unit_number, unit_type, area_marla, rate_per_marla, status)
  VALUES (prj_uuid, 'C6', 'commercial', 10.0, 15500000.0, 'available')
  RETURNING id INTO inv_uuid;
  RAISE NOTICE 'Created inventory record for C6: %', inv_uuid;

  -- ============ Step 3: Create Customers ============
  -- All 11 customers are new to the system
  INSERT INTO customers (name, mobile, country_code, interested_project_id)
  VALUES ('Muhammad Shehzad', '03003939213', '+92', prj_uuid) RETURNING id INTO cust_0;

  INSERT INTO customers (name, mobile, country_code, interested_project_id)
  VALUES ('Bilal Aslam', '03326768200', '+92', prj_uuid) RETURNING id INTO cust_1;

  INSERT INTO customers (name, mobile, country_code, interested_project_id)
  VALUES ('Muhammed Fayaz', '03017068558', '+92', prj_uuid) RETURNING id INTO cust_2;

  INSERT INTO customers (name, mobile, country_code, interested_project_id)
  VALUES ('Amna Asif', '03424021021', '+92', prj_uuid) RETURNING id INTO cust_3;

  INSERT INTO customers (name, mobile, country_code, interested_project_id)
  VALUES ('Imran Mujahid', '03006664321', '+92', prj_uuid) RETURNING id INTO cust_4;

  -- Note: Rizwan's mobile matches Ali Akbar (03008669557) — using raw Excel format to avoid unique clash
  -- Stored as '3008669557' (without leading 0) — needs verification/update later
  INSERT INTO customers (name, mobile, country_code, notes, interested_project_id)
  VALUES ('Rizwan Ali Ashraf', '3008669557', '+92', 'Mobile same as Ali Akbar — needs verification', prj_uuid) RETURNING id INTO cust_5;

  INSERT INTO customers (name, mobile, country_code, interested_project_id)
  VALUES ('Shehryar Zafar', '03338921455', '+92', prj_uuid) RETURNING id INTO cust_6;

  INSERT INTO customers (name, mobile, country_code, interested_project_id)
  VALUES ('Fahad Farooq', '03006600000', '+92', prj_uuid) RETURNING id INTO cust_7;

  INSERT INTO customers (name, mobile, country_code, interested_project_id)
  VALUES ('Sheikh Saleem', '03008275695', '+92', prj_uuid) RETURNING id INTO cust_8;

  INSERT INTO customers (name, mobile, country_code, interested_project_id)
  VALUES ('M. Abdullah', '03026264333', '+92', prj_uuid) RETURNING id INTO cust_9;

  INSERT INTO customers (name, mobile, country_code, interested_project_id)
  VALUES ('Hammad Ali', '03226056106', '+92', prj_uuid) RETURNING id INTO cust_10;

  -- ============ Step 4: Lookup Existing Brokers + Create New ============
  -- Existing: Shehzad Akram (03218661120)
  SELECT id INTO brk_0 FROM brokers WHERE mobile = '03218661120';
  IF brk_0 IS NULL THEN
    RAISE EXCEPTION 'Broker Shehzad Akram (03218661120) not found!';
  END IF;

  -- Existing: Malik Asif (03227861900)
  SELECT id INTO brk_1 FROM brokers WHERE mobile = '03227861900';
  IF brk_1 IS NULL THEN
    RAISE EXCEPTION 'Broker Malik Asif (03227861900) not found!';
  END IF;

  -- New: Affaq Khan (03009667787)
  INSERT INTO brokers (name, mobile) VALUES ('Affaq Khan', '03009667787') RETURNING id INTO brk_2;

  -- Existing: Ali Akbar (03008669557)
  SELECT id INTO brk_3 FROM brokers WHERE mobile = '03008669557';
  IF brk_3 IS NULL THEN
    RAISE EXCEPTION 'Broker Ali Akbar (03008669557) not found!';
  END IF;

  -- New: Waqar (03216607232)
  INSERT INTO brokers (name, mobile) VALUES ('Waqar', '03216607232') RETURNING id INTO brk_4;

  -- ============ Step 5: Transactions + Installments ============

  -- ---- Transaction 1: Muhammad Shehzad -> Shop 5 ----
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '5';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 5';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status)
  VALUES (cust_0, brk_0, prj_uuid, inv_uuid, '5', 5.75, 13500000.0, 77625000.0, 'bi-annual', 4, '2025-02-27', '2025-02-27', 'active')
  RETURNING id INTO txn_uuid;

  inst_amount := 19406250.0;  -- 77625000 / 4
  remaining := 38812500.0;

  -- Installment 1: due 2025-02-27
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 1, '2025-02-27', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-08-26
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 2, '2025-08-26', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-02-22
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 3, '2026-02-22', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-08-21
  paid_this := LEAST(remaining, (77625000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 4, '2026-08-21', (77625000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (77625000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- ---- Transaction 2: Bilal Aslam -> Shop 10 ----
  -- No installment dates in Excel — using bi-annual from 2025-01-01
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '10';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 10';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status)
  VALUES (cust_1, brk_1, prj_uuid, inv_uuid, '10', 6.13, 11500000.0, 70495000.0, 'bi-annual', 4, '2025-01-01', '2025-01-01', 'active')
  RETURNING id INTO txn_uuid;

  inst_amount := 17623750.0;  -- 70495000 / 4
  remaining := 40742547.0;

  -- Installment 1: due 2025-01-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 1, '2025-01-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-07-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 2, '2025-07-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-01-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 3, '2026-01-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-07-01
  paid_this := LEAST(remaining, (70495000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 4, '2026-07-01', (70495000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (70495000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- ---- Transaction 3: Muhammed Fayaz -> Shop 19 ----
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '19';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 19';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status)
  VALUES (cust_2, brk_2, prj_uuid, inv_uuid, '19', 62.0, 13300000.0, 824600000.0, 'bi-annual', 4, '2025-12-04', '2025-12-04', 'active')
  RETURNING id INTO txn_uuid;

  inst_amount := 206150000.0;  -- 824600000 / 4
  remaining := 206150000.0;

  -- Installment 1: due 2025-12-04
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 1, '2025-12-04', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2026-06-02
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 2, '2026-06-02', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-11-29
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 3, '2026-11-29', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2027-05-28
  paid_this := LEAST(remaining, (824600000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 4, '2027-05-28', (824600000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (824600000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- ---- Transaction 4: Amna Asif -> Shop 20 (FULLY PAID) ----
  -- No installment dates — using bi-annual from 2025-01-01. Fully paid.
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '20';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 20';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status)
  VALUES (cust_3, brk_1, prj_uuid, inv_uuid, '20', 6.15, 14200000.0, 87330000.0, 'bi-annual', 4, '2025-01-01', '2025-01-01', 'active')
  RETURNING id INTO txn_uuid;

  inst_amount := 21832500.0;  -- 87330000 / 4
  remaining := 87330000.0;

  -- Installment 1: due 2025-01-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 1, '2025-01-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-07-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 2, '2025-07-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-01-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 3, '2026-01-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-07-01
  paid_this := LEAST(remaining, (87330000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 4, '2026-07-01', (87330000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (87330000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- ---- Transaction 5: Imran Mujahid -> Shop 21 (FULLY PAID) ----
  -- No installment dates — using bi-annual from 2025-01-01. Fully paid.
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '21';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 21';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status)
  VALUES (cust_4, brk_1, prj_uuid, inv_uuid, '21', 6.21, 14200000.0, 88182000.0, 'bi-annual', 4, '2025-01-01', '2025-01-01', 'active')
  RETURNING id INTO txn_uuid;

  inst_amount := 22045500.0;  -- 88182000 / 4
  remaining := 88182000.0;

  -- Installment 1: due 2025-01-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 1, '2025-01-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-07-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 2, '2025-07-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-01-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 3, '2026-01-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-07-01
  paid_this := LEAST(remaining, (88182000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 4, '2026-07-01', (88182000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (88182000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- ---- Transaction 6: Rizwan Ali Ashraf -> Shop 24 ----
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '24';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 24';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status)
  VALUES (cust_5, brk_3, prj_uuid, inv_uuid, '24', 6.36, 13500000.0, 85860000.0, 'bi-annual', 4, '2025-01-27', '2025-01-27', 'active')
  RETURNING id INTO txn_uuid;

  inst_amount := 21465000.0;  -- 85860000 / 4
  remaining := 42930000.0;

  -- Installment 1: due 2025-01-27
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 1, '2025-01-27', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-07-26
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 2, '2025-07-26', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-01-22
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 3, '2026-01-22', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-07-21
  paid_this := LEAST(remaining, (85860000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 4, '2026-07-21', (85860000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (85860000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- ---- Transaction 7: Shehryar Zafar -> Shop 28 ----
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '28';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 28';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status)
  VALUES (cust_6, brk_1, prj_uuid, inv_uuid, '28', 6.13, 13500000.0, 82755000.0, 'bi-annual', 4, '2025-01-21', '2025-01-21', 'active')
  RETURNING id INTO txn_uuid;

  inst_amount := 20688750.0;  -- 82755000 / 4
  remaining := 41377500.0;

  -- Installment 1: due 2025-01-21
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 1, '2025-01-21', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-07-20
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 2, '2025-07-20', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-01-16
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 3, '2026-01-16', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-07-16
  paid_this := LEAST(remaining, (82755000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 4, '2026-07-16', (82755000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (82755000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- ---- Transaction 8: Fahad Farooq -> Shop 33 ----
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '33';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 33';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status)
  VALUES (cust_7, brk_3, prj_uuid, inv_uuid, '33', 8.21, 14850000.0, 121918500.0, 'bi-annual', 4, '2026-01-01', '2026-01-01', 'active')
  RETURNING id INTO txn_uuid;

  inst_amount := 30479625.0;  -- 121918500 / 4
  remaining := 60959250.0;

  -- Installment 1: due 2026-01-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 1, '2026-01-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2026-06-30
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 2, '2026-06-30', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-12-27
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 3, '2026-12-27', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2027-06-25
  paid_this := LEAST(remaining, (121918500.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 4, '2027-06-25', (121918500.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (121918500.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- ---- Transaction 9: Fahad Farooq -> Shop 34 (same customer) ----
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '34';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 34';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status)
  VALUES (cust_7, brk_3, prj_uuid, inv_uuid, '34', 5.04, 13500000.0, 68040000.0, 'bi-annual', 4, '2025-01-23', '2025-01-23', 'active')
  RETURNING id INTO txn_uuid;

  inst_amount := 17010000.0;  -- 68040000 / 4
  remaining := 28759500.0;

  -- Installment 1: due 2025-01-23
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 1, '2025-01-23', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-07-22
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 2, '2025-07-22', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-01-18
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 3, '2026-01-18', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-07-17
  paid_this := LEAST(remaining, (68040000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 4, '2026-07-17', (68040000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (68040000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- ---- Transaction 10: Sheikh Saleem -> Shop 36 ----
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '36';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 36';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status)
  VALUES (cust_8, brk_3, prj_uuid, inv_uuid, '36', 4.77, 13300000.0, 63441000.0, 'bi-annual', 4, '2025-09-02', '2025-09-02', 'active')
  RETURNING id INTO txn_uuid;

  inst_amount := 15860250.0;  -- 63441000 / 4
  remaining := 30000000.0;

  -- Installment 1: due 2025-09-02
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 1, '2025-09-02', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2026-03-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 2, '2026-03-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-08-28
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 3, '2026-08-28', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2027-02-24
  paid_this := LEAST(remaining, (63441000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 4, '2027-02-24', (63441000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (63441000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- ---- Transaction 11: M. Abdullah -> Shop 45 ----
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '45';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 45';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status)
  VALUES (cust_9, brk_4, prj_uuid, inv_uuid, '45', 3.23, 15300000.0, 49419000.0, 'bi-annual', 4, '2025-01-23', '2025-01-23', 'active')
  RETURNING id INTO txn_uuid;

  inst_amount := 12354750.0;  -- 49419000 / 4
  remaining := 24709500.0;

  -- Installment 1: due 2025-01-23
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 1, '2025-01-23', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-07-22
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 2, '2025-07-22', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-01-18
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 3, '2026-01-18', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-07-17
  paid_this := LEAST(remaining, (49419000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 4, '2026-07-17', (49419000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (49419000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- ---- Transaction 12: Hammad Ali -> Shop C6 (FULLY PAID, NO BROKER) ----
  -- C6 inventory was created in Step 2. Retrieve it.
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = 'C6';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop C6';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status)
  VALUES (cust_10, NULL, prj_uuid, inv_uuid, 'C6', 10.0, 15500000.0, 155000000.0, 'bi-annual', 4, '2025-01-01', '2025-01-01', 'active')
  RETURNING id INTO txn_uuid;

  inst_amount := 38750000.0;  -- 155000000 / 4
  remaining := 155000000.0;

  -- Installment 1: due 2025-01-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 1, '2025-01-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-07-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 2, '2025-07-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-01-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 3, '2026-01-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-07-01
  paid_this := LEAST(remaining, (155000000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status)
  VALUES (txn_uuid, 4, '2026-07-01', (155000000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (155000000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  RAISE NOTICE 'Migration complete: 12 transactions created (batch 2)';
END $$;

-- ============ Verification Queries ============
SELECT 'Total Customers' as entity, COUNT(*) as count FROM customers;
SELECT 'Total Brokers' as entity, COUNT(*) as count FROM brokers;
SELECT 'PRJ-0001 Transactions' as entity, COUNT(*) as count FROM transactions WHERE project_id = (SELECT id FROM projects WHERE project_id = 'PRJ-0001');
SELECT 'PRJ-0001 Sold Inventory' as entity, COUNT(*) as count FROM inventory WHERE project_id = (SELECT id FROM projects WHERE project_id = 'PRJ-0001') AND status = 'sold';

-- Detail view of batch 2 transactions
SELECT t.transaction_id, c.name as customer, i.unit_number as shop, t.total_value,
       SUM(inst.amount_paid) as total_paid,
       t.total_value - SUM(inst.amount_paid) as outstanding
FROM transactions t
JOIN customers c ON t.customer_id = c.id
JOIN inventory i ON t.inventory_id = i.id
LEFT JOIN installments inst ON inst.transaction_id = t.id
WHERE i.unit_number IN ('5','10','19','20','21','24','28','33','34','36','45','C6')
  AND t.project_id = (SELECT id FROM projects WHERE project_id = 'PRJ-0001')
GROUP BY t.transaction_id, c.name, i.unit_number, t.total_value
ORDER BY CASE WHEN i.unit_number ~ '^\d+$' THEN i.unit_number::int ELSE 999 END;

COMMIT;
