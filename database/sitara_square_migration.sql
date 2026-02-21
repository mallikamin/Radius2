-- =============================================================
-- Sitara Square (PRJ-0001) Data Migration
-- Generated from: Sitara Square inventory updating.xlsx
-- Date: 2026-02-21
-- =============================================================

BEGIN;

DO $$
DECLARE
  prj_uuid UUID;
  cust_0 UUID;  -- Raja Dawood (03008666660)
  cust_1 UUID;  -- Muhammad Shehzad Barkat (03218667080)
  cust_2 UUID;  -- Muhammed Nadeem (03219669571)
  cust_3 UUID;  -- Mubeen Ijaz (03008668828)
  cust_4 UUID;  -- Malik Asif (03227861900)
  cust_5 UUID;  -- Nusrat Asjid (03334957181)
  cust_6 UUID;  -- Asif Yousaf (03217680150)
  cust_7 UUID;  -- Zunara Qadeer (03318887721)
  cust_8 UUID;  -- M. Zahid Javed (03218662498)
  cust_9 UUID;  -- Shahid Majeed (03008660050)
  cust_10 UUID;  -- Umair Riaz (03217705050)
  cust_11 UUID;  -- Seth Iftikhar (03008663800)
  cust_12 UUID;  -- Faisal Toheed (03008666625)
  cust_13 UUID;  -- Jahangir Magoo (03008662000)
  cust_14 UUID;  -- Bashir Ud Din Ahmed (+447729599594)
  cust_15 UUID;  -- Imran Goreja (03218664066)
  cust_16 UUID;  -- Azhar Jameel (03219661312)
  cust_17 UUID;  -- Adnan Pervaiz (03005813902)
  cust_18 UUID;  -- Ali Akbar (03008669557)
  brk_0 UUID;  -- Shehzad Akram (03218661120)
  brk_1 UUID;  -- Ahmed Babar (03218667080)
  brk_2 UUID;  -- Bilawal Tariq (03016089605)
  brk_3 UUID;  -- Malik Asif (03227861900)
  brk_4 UUID;  -- Waleed Bin Adil (03006611171)
  brk_5 UUID;  -- Qamar Hameed (03007664656)
  brk_6 UUID;  -- Asad Dogar (03237625152)
  brk_7 UUID;  -- Bilal Saud (03008663472)
  brk_8 UUID;  -- Ali Akbar (03008669557)
  brk_9 UUID;  -- Shafiqur Rehman (03008661007)
  brk_10 UUID;  -- Umer Saleem (03008654141)
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

  -- ============ Step 2: Update Inventory Rates ============
  UPDATE inventory SET rate_per_marla = 12825000.00, updated_at = NOW() WHERE project_id = prj_uuid AND unit_number = '11';
  UPDATE inventory SET rate_per_marla = 12825000.00, updated_at = NOW() WHERE project_id = prj_uuid AND unit_number = '12';
  UPDATE inventory SET rate_per_marla = 12800000.00, updated_at = NOW() WHERE project_id = prj_uuid AND unit_number = '13';

  -- ============ Step 3: Create / Lookup Customers ============
  -- Existing: Raja Dawood (03008666660) = CUST-0007
  SELECT id INTO cust_0 FROM customers WHERE mobile = '03008666660';

  -- New: Muhammad Shehzad Barkat (03218667080)
  INSERT INTO customers (name, mobile, country_code, interested_project_id) VALUES ('Muhammad Shehzad Barkat', '03218667080', '+92', prj_uuid) RETURNING id INTO cust_1;

  -- New: Muhammed Nadeem (03219669571)
  INSERT INTO customers (name, mobile, country_code, interested_project_id) VALUES ('Muhammed Nadeem', '03219669571', '+92', prj_uuid) RETURNING id INTO cust_2;

  -- New: Mubeen Ijaz (03008668828)
  INSERT INTO customers (name, mobile, country_code, interested_project_id) VALUES ('Mubeen Ijaz', '03008668828', '+92', prj_uuid) RETURNING id INTO cust_3;

  -- New: Malik Asif (03227861900)
  INSERT INTO customers (name, mobile, country_code, interested_project_id) VALUES ('Malik Asif', '03227861900', '+92', prj_uuid) RETURNING id INTO cust_4;

  -- New: Nusrat Asjid (03334957181)
  INSERT INTO customers (name, mobile, country_code, interested_project_id) VALUES ('Nusrat Asjid', '03334957181', '+92', prj_uuid) RETURNING id INTO cust_5;

  -- New: Asif Yousaf (03217680150)
  INSERT INTO customers (name, mobile, country_code, interested_project_id) VALUES ('Asif Yousaf', '03217680150', '+92', prj_uuid) RETURNING id INTO cust_6;

  -- New: Zunara Qadeer (03318887721)
  INSERT INTO customers (name, mobile, country_code, interested_project_id) VALUES ('Zunara Qadeer', '03318887721', '+92', prj_uuid) RETURNING id INTO cust_7;

  -- New: M. Zahid Javed (03218662498)
  INSERT INTO customers (name, mobile, country_code, interested_project_id) VALUES ('M. Zahid Javed', '03218662498', '+92', prj_uuid) RETURNING id INTO cust_8;

  -- New: Shahid Majeed (03008660050)
  INSERT INTO customers (name, mobile, country_code, interested_project_id) VALUES ('Shahid Majeed', '03008660050', '+92', prj_uuid) RETURNING id INTO cust_9;

  -- New: Umair Riaz (03217705050)
  INSERT INTO customers (name, mobile, country_code, interested_project_id) VALUES ('Umair Riaz', '03217705050', '+92', prj_uuid) RETURNING id INTO cust_10;

  -- New: Seth Iftikhar (03008663800)
  INSERT INTO customers (name, mobile, country_code, interested_project_id) VALUES ('Seth Iftikhar', '03008663800', '+92', prj_uuid) RETURNING id INTO cust_11;

  -- New: Faisal Toheed (03008666625)
  INSERT INTO customers (name, mobile, country_code, interested_project_id) VALUES ('Faisal Toheed', '03008666625', '+92', prj_uuid) RETURNING id INTO cust_12;

  -- New: Jahangir Magoo (03008662000)
  INSERT INTO customers (name, mobile, country_code, notes, interested_project_id) VALUES ('Jahangir Magoo', '03008662000', '+92', 'Kashmir Venture', prj_uuid) RETURNING id INTO cust_13;

  -- New: Bashir Ud Din Ahmed (+447729599594)
  INSERT INTO customers (name, mobile, country_code, interested_project_id) VALUES ('Bashir Ud Din Ahmed', '+447729599594', '+44', prj_uuid) RETURNING id INTO cust_14;

  -- New: Imran Goreja (03218664066)
  INSERT INTO customers (name, mobile, country_code, interested_project_id) VALUES ('Imran Goreja', '03218664066', '+92', prj_uuid) RETURNING id INTO cust_15;

  -- Existing: Azhar Jameel (03219661312) = CUST-0010
  SELECT id INTO cust_16 FROM customers WHERE mobile = '03219661312';

  -- New: Adnan Pervaiz (03005813902)
  INSERT INTO customers (name, mobile, country_code, interested_project_id) VALUES ('Adnan Pervaiz', '03005813902', '+92', prj_uuid) RETURNING id INTO cust_17;

  -- New: Ali Akbar (03008669557)
  INSERT INTO customers (name, mobile, country_code, interested_project_id) VALUES ('Ali Akbar', '03008669557', '+92', prj_uuid) RETURNING id INTO cust_18;

  -- ============ Step 4: Create / Lookup Brokers ============
  -- Existing: Shehzad Akram (03218661120) = BRK-0006
  -- Normalize existing broker mobile (stored with space)
  UPDATE brokers SET mobile = '03218661120' WHERE broker_id = 'BRK-0006' AND mobile = '0321 8661120';
  SELECT id INTO brk_0 FROM brokers WHERE broker_id = 'BRK-0006';

  -- New: Ahmed Babar (03218667080)
  INSERT INTO brokers (name, mobile) VALUES ('Ahmed Babar', '03218667080') RETURNING id INTO brk_1;

  -- New: Bilawal Tariq (03016089605)
  INSERT INTO brokers (name, mobile) VALUES ('Bilawal Tariq', '03016089605') RETURNING id INTO brk_2;

  -- New: Malik Asif (03227861900)
  INSERT INTO brokers (name, mobile) VALUES ('Malik Asif', '03227861900') RETURNING id INTO brk_3;

  -- New: Waleed Bin Adil (03006611171)
  INSERT INTO brokers (name, mobile) VALUES ('Waleed Bin Adil', '03006611171') RETURNING id INTO brk_4;

  -- New: Qamar Hameed (03007664656)
  INSERT INTO brokers (name, mobile) VALUES ('Qamar Hameed', '03007664656') RETURNING id INTO brk_5;

  -- New: Asad Dogar (03237625152)
  INSERT INTO brokers (name, mobile) VALUES ('Asad Dogar', '03237625152') RETURNING id INTO brk_6;

  -- New: Bilal Saud (03008663472)
  INSERT INTO brokers (name, mobile, notes) VALUES ('Bilal Saud', '03008663472', 'Also known as Dani Bhai') RETURNING id INTO brk_7;

  -- New: Ali Akbar (03008669557)
  INSERT INTO brokers (name, mobile) VALUES ('Ali Akbar', '03008669557') RETURNING id INTO brk_8;

  -- New: Shafiqur Rehman (03008661007)
  INSERT INTO brokers (name, mobile) VALUES ('Shafiqur Rehman', '03008661007') RETURNING id INTO brk_9;

  -- New: Umer Saleem (03008654141)
  INSERT INTO brokers (name, mobile) VALUES ('Umer Saleem', '03008654141') RETURNING id INTO brk_10;

  -- ============ Step 5: Transactions + Installments ============
  -- Transaction: Raja Dawood -> Shop 1
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '1';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 1';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status) VALUES (cust_0, brk_0, prj_uuid, inv_uuid, '1', 15.0, 15000000.0, 225000000.0, 'bi-annual', 4, '2025-01-18', '2025-01-18', 'active') RETURNING id INTO txn_uuid;

  inst_amount := 56250000.0;
  remaining := 70050000.0;

  -- Installment 1: due 2025-01-18
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 1, '2025-01-18', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-07-17
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 2, '2025-07-17', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-01-13
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 3, '2026-01-13', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-07-12
  paid_this := LEAST(remaining, (225000000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 4, '2026-07-12', (225000000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (225000000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- Transaction: Raja Dawood -> Shop 2
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '2';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 2';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status) VALUES (cust_0, brk_0, prj_uuid, inv_uuid, '2', 4.43, 13500000.0, 59804999.99999999, 'bi-annual', 4, '2025-01-20', '2025-01-20', 'active') RETURNING id INTO txn_uuid;

  inst_amount := 14951250.0;
  remaining := 14950000.0;

  -- Installment 1: due 2025-01-20
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 1, '2025-01-20', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-07-19
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 2, '2025-07-19', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-01-15
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 3, '2026-01-15', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-07-14
  paid_this := LEAST(remaining, (59804999.99999999 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 4, '2026-07-14', (59804999.99999999 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (59804999.99999999 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- Transaction: Muhammad Shehzad Barkat -> Shop 3
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '3';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 3';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status) VALUES (cust_1, brk_1, prj_uuid, inv_uuid, '3', 4.0, 13500000.0, 54000000.0, 'bi-annual', 4, '2025-01-01', '2025-01-01', 'active') RETURNING id INTO txn_uuid;

  inst_amount := 13500000.0;
  remaining := 54000000.0;

  -- Installment 1: due 2025-01-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 1, '2025-01-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-07-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 2, '2025-07-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-01-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 3, '2026-01-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-07-01
  paid_this := LEAST(remaining, (54000000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 4, '2026-07-01', (54000000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (54000000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- Transaction: Muhammad Shehzad Barkat -> Shop 4
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '4';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 4';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status) VALUES (cust_1, brk_1, prj_uuid, inv_uuid, '4', 5.0, 13500000.0, 67500000.0, 'bi-annual', 4, '2025-01-01', '2025-01-01', 'active') RETURNING id INTO txn_uuid;

  inst_amount := 16875000.0;
  remaining := 67500000.0;

  -- Installment 1: due 2025-01-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 1, '2025-01-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-07-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 2, '2025-07-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-01-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 3, '2026-01-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-07-01
  paid_this := LEAST(remaining, (67500000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 4, '2026-07-01', (67500000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (67500000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- Transaction: Muhammed Nadeem -> Shop 6
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '6';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 6';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status) VALUES (cust_2, brk_0, prj_uuid, inv_uuid, '6', 6.19, 13500000.0, 83565000.0, 'bi-annual', 4, '2025-02-26', '2025-02-26', 'active') RETURNING id INTO txn_uuid;

  inst_amount := 20891250.0;
  remaining := 41782500.0;

  -- Installment 1: due 2025-02-26
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 1, '2025-02-26', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-08-25
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 2, '2025-08-25', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-02-21
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 3, '2026-02-21', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-08-20
  paid_this := LEAST(remaining, (83565000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 4, '2026-08-20', (83565000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (83565000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- Transaction: Mubeen Ijaz -> Shop 7
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '7';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 7';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status) VALUES (cust_3, brk_2, prj_uuid, inv_uuid, '7', 6.18, 13500000.0, 83430000.0, 'bi-annual', 4, '2025-01-25', '2025-01-25', 'active') RETURNING id INTO txn_uuid;

  inst_amount := 20857500.0;
  remaining := 40857500.0;

  -- Installment 1: due 2025-01-25
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 1, '2025-01-25', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-07-24
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 2, '2025-07-24', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-01-20
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 3, '2026-01-20', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-07-19
  paid_this := LEAST(remaining, (83430000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 4, '2026-07-19', (83430000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (83430000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- Transaction: Malik Asif -> Shop 8
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '8';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 8';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status) VALUES (cust_4, brk_3, prj_uuid, inv_uuid, '8', 6.16, 13500000.0, 83160000.0, 'bi-annual', 4, '2025-02-20', '2025-02-20', 'active') RETURNING id INTO txn_uuid;

  inst_amount := 20790000.0;
  remaining := 22749800.0;

  -- Installment 1: due 2025-02-20
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 1, '2025-02-20', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-08-19
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 2, '2025-08-19', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-02-15
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 3, '2026-02-15', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-08-14
  paid_this := LEAST(remaining, (83160000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 4, '2026-08-14', (83160000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (83160000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- Transaction: Nusrat Asjid -> Shop 9
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '9';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 9';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status) VALUES (cust_5, brk_3, prj_uuid, inv_uuid, '9', 6.15, 13500000.0, 83025000.0, 'bi-annual', 4, '2025-01-20', '2025-01-20', 'active') RETURNING id INTO txn_uuid;

  inst_amount := 20756250.0;
  remaining := 33556250.0;

  -- Installment 1: due 2025-01-20
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 1, '2025-01-20', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-07-19
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 2, '2025-07-19', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-01-15
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 3, '2026-01-15', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-07-14
  paid_this := LEAST(remaining, (83025000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 4, '2026-07-14', (83025000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (83025000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- Transaction: Asif Yousaf -> Shop 11
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '11';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 11';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status) VALUES (cust_6, brk_4, prj_uuid, inv_uuid, '11', 6.12, 12825000.0, 78489000.0, 'bi-annual', 4, '2025-10-15', '2025-10-15', 'active') RETURNING id INTO txn_uuid;

  inst_amount := 19622250.0;
  remaining := 39244500.0;

  -- Installment 1: due 2025-10-15
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 1, '2025-10-15', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2026-01-15
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 2, '2026-01-15', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-11-15
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 3, '2026-11-15', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2027-05-15
  paid_this := LEAST(remaining, (78489000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 4, '2027-05-15', (78489000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (78489000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- Transaction: Asif Yousaf -> Shop 12
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '12';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 12';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status) VALUES (cust_6, brk_4, prj_uuid, inv_uuid, '12', 6.1, 12825000.0, 78232500.0, 'bi-annual', 4, '2025-10-22', '2025-10-22', 'active') RETURNING id INTO txn_uuid;

  inst_amount := 19558125.0;
  remaining := 39116250.0;

  -- Installment 1: due 2025-10-22
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 1, '2025-10-22', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2026-01-15
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 2, '2026-01-15', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-11-15
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 3, '2026-11-15', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2027-05-15
  paid_this := LEAST(remaining, (78232500.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 4, '2027-05-15', (78232500.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (78232500.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- Transaction: Zunara Qadeer -> Shop 13
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '13';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 13';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status) VALUES (cust_7, brk_5, prj_uuid, inv_uuid, '13', 6.09, 12800000.0, 77952000.0, 'bi-annual', 4, '2025-11-05', '2025-11-05', 'active') RETURNING id INTO txn_uuid;

  inst_amount := 19488000.0;
  remaining := 38975000.0;

  -- Installment 1: due 2025-11-05
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 1, '2025-11-05', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2026-05-04
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 2, '2026-05-04', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-10-31
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 3, '2026-10-31', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2027-04-29
  paid_this := LEAST(remaining, (77952000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 4, '2027-04-29', (77952000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (77952000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- Transaction: M. Zahid Javed -> Shop 14
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '14';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 14';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status) VALUES (cust_8, brk_6, prj_uuid, inv_uuid, '14', 6.07, 13500000.0, 81945000.0, 'bi-annual', 4, '2025-06-23', '2025-06-23', 'active') RETURNING id INTO txn_uuid;

  inst_amount := 20486250.0;
  remaining := 20486250.0;

  -- Installment 1: due 2025-06-23
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 1, '2025-06-23', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-12-20
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 2, '2025-12-20', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-06-18
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 3, '2026-06-18', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-12-15
  paid_this := LEAST(remaining, (81945000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 4, '2026-12-15', (81945000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (81945000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- Transaction: Shahid Majeed -> Shop 16
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '16';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 16';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status) VALUES (cust_9, brk_7, prj_uuid, inv_uuid, '16', 6.04, 13500000.0, 81540000.0, 'bi-annual', 4, '2025-01-25', '2025-01-25', 'active') RETURNING id INTO txn_uuid;

  inst_amount := 20385000.0;
  remaining := 12500000.0;

  -- Installment 1: due 2025-01-25
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 1, '2025-01-25', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-07-24
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 2, '2025-07-24', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-01-20
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 3, '2026-01-20', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-07-19
  paid_this := LEAST(remaining, (81540000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 4, '2026-07-19', (81540000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (81540000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- Transaction: Umair Riaz -> Shop 18
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '18';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 18';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status) VALUES (cust_10, brk_3, prj_uuid, inv_uuid, '18', 6.01, 13500000.0, 81135000.0, 'bi-annual', 4, '2025-07-07', '2025-07-07', 'active') RETURNING id INTO txn_uuid;

  inst_amount := 20283750.0;
  remaining := 20544375.0;

  -- Installment 1: due 2025-07-07
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 1, '2025-07-07', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2026-01-03
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 2, '2026-01-03', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-07-02
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 3, '2026-07-02', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-12-29
  paid_this := LEAST(remaining, (81135000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 4, '2026-12-29', (81135000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (81135000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- Transaction: Seth Iftikhar -> Shop 22
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '22';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 22';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status) VALUES (cust_11, brk_8, prj_uuid, inv_uuid, '22', 6.26, 13500000.0, 84510000.0, 'bi-annual', 4, '2025-01-01', '2025-01-01', 'active') RETURNING id INTO txn_uuid;

  inst_amount := 21127500.0;
  remaining := 84510000.0;

  -- Installment 1: due 2025-01-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 1, '2025-01-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-07-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 2, '2025-07-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-01-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 3, '2026-01-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-07-01
  paid_this := LEAST(remaining, (84510000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 4, '2026-07-01', (84510000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (84510000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- Transaction: Seth Iftikhar -> Shop 23
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '23';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 23';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status) VALUES (cust_11, brk_8, prj_uuid, inv_uuid, '23', 6.31, 13500000.0, 85185000.0, 'bi-annual', 4, '2025-01-01', '2025-01-01', 'active') RETURNING id INTO txn_uuid;

  inst_amount := 21296250.0;
  remaining := 85185000.0;

  -- Installment 1: due 2025-01-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 1, '2025-01-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-07-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 2, '2025-07-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-01-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 3, '2026-01-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-07-01
  paid_this := LEAST(remaining, (85185000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 4, '2026-07-01', (85185000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (85185000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- Transaction: Faisal Toheed -> Shop 25
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '25';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 25';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status) VALUES (cust_12, brk_6, prj_uuid, inv_uuid, '25', 6.32, 13500000.0, 85320000.0, 'bi-annual', 4, '2025-01-22', '2025-01-22', 'active') RETURNING id INTO txn_uuid;

  inst_amount := 21330000.0;
  remaining := 21330000.0;

  -- Installment 1: due 2025-01-22
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 1, '2025-01-22', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-07-21
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 2, '2025-07-21', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-01-17
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 3, '2026-01-17', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-07-16
  paid_this := LEAST(remaining, (85320000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 4, '2026-07-16', (85320000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (85320000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- Transaction: Jahangir Magoo -> Shop 29
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '29';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 29';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status) VALUES (cust_13, brk_9, prj_uuid, inv_uuid, '29', 6.06, 13500000.0, 81810000.0, 'bi-annual', 4, '2025-07-30', '2025-07-30', 'active') RETURNING id INTO txn_uuid;

  inst_amount := 20452500.0;
  remaining := 52552500.0;

  -- Installment 1: due 2025-07-30
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 1, '2025-07-30', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-07-31
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 2, '2025-07-31', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-07-30
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 3, '2026-07-30', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-07-30
  paid_this := LEAST(remaining, (81810000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 4, '2026-07-30', (81810000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (81810000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- Transaction: Jahangir Magoo -> Shop 30
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '30';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 30';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status) VALUES (cust_13, brk_9, prj_uuid, inv_uuid, '30', 6.0, 13500000.0, 81000000.0, 'bi-annual', 4, '2025-07-30', '2025-07-30', 'active') RETURNING id INTO txn_uuid;

  inst_amount := 20250000.0;
  remaining := 52147500.0;

  -- Installment 1: due 2025-07-30
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 1, '2025-07-30', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-07-31
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 2, '2025-07-31', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-07-30
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 3, '2026-07-30', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-07-30
  paid_this := LEAST(remaining, (81000000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 4, '2026-07-30', (81000000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (81000000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- Transaction: Seth Iftikhar -> Shop 31
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '31';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 31';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status) VALUES (cust_11, brk_8, prj_uuid, inv_uuid, '31', 5.93, 13500000.0, 80055000.0, 'bi-annual', 4, '2025-01-01', '2025-01-01', 'active') RETURNING id INTO txn_uuid;

  inst_amount := 20013750.0;
  remaining := 80055000.0;

  -- Installment 1: due 2025-01-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 1, '2025-01-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-07-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 2, '2025-07-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-01-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 3, '2026-01-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-07-01
  paid_this := LEAST(remaining, (80055000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 4, '2026-07-01', (80055000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (80055000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- Transaction: Seth Iftikhar -> Shop 32
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '32';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 32';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status) VALUES (cust_11, brk_8, prj_uuid, inv_uuid, '32', 5.87, 13500000.0, 79245000.0, 'bi-annual', 4, '2025-01-01', '2025-01-01', 'active') RETURNING id INTO txn_uuid;

  inst_amount := 19811250.0;
  remaining := 79245000.0;

  -- Installment 1: due 2025-01-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 1, '2025-01-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-07-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 2, '2025-07-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-01-01
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 3, '2026-01-01', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-07-01
  paid_this := LEAST(remaining, (79245000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 4, '2026-07-01', (79245000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (79245000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- Transaction: Bashir Ud Din Ahmed -> Shop 35
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '35';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 35';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status) VALUES (cust_14, brk_10, prj_uuid, inv_uuid, '35', 4.92, 13500000.0, 66420000.0, 'bi-annual', 4, '2025-04-05', '2025-04-05', 'active') RETURNING id INTO txn_uuid;

  inst_amount := 16605000.0;
  remaining := 16500000.0;

  -- Installment 1: due 2025-04-05
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 1, '2025-04-05', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-10-02
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 2, '2025-10-02', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-03-31
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 3, '2026-03-31', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-09-27
  paid_this := LEAST(remaining, (66420000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 4, '2026-09-27', (66420000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (66420000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- Transaction: Imran Goreja -> Shop 37
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '37';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 37';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status) VALUES (cust_15, brk_3, prj_uuid, inv_uuid, '37', 4.64, 13500000.0, 62639999.99999999, 'bi-annual', 4, '2025-09-25', '2025-09-25', 'active') RETURNING id INTO txn_uuid;

  inst_amount := 15660000.0;
  remaining := 15660000.0;

  -- Installment 1: due 2025-09-25
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 1, '2025-09-25', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2026-03-24
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 2, '2026-03-24', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-09-20
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 3, '2026-09-20', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2027-03-19
  paid_this := LEAST(remaining, (62639999.99999999 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 4, '2027-03-19', (62639999.99999999 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (62639999.99999999 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- Transaction: Azhar Jameel -> Shop 38
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '38';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 38';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status) VALUES (cust_16, brk_3, prj_uuid, inv_uuid, '38', 4.5, 13500000.0, 60750000.0, 'bi-annual', 4, '2025-02-04', '2025-02-04', 'active') RETURNING id INTO txn_uuid;

  inst_amount := 15187500.0;
  remaining := 15187500.0;

  -- Installment 1: due 2025-02-04
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 1, '2025-02-04', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-08-03
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 2, '2025-08-03', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-01-30
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 3, '2026-01-30', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-07-29
  paid_this := LEAST(remaining, (60750000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 4, '2026-07-29', (60750000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (60750000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- Transaction: Azhar Jameel -> Shop 39
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '39';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 39';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status) VALUES (cust_16, brk_3, prj_uuid, inv_uuid, '39', 4.36, 13500000.0, 58860000.00000001, 'bi-annual', 4, '2025-02-04', '2025-02-04', 'active') RETURNING id INTO txn_uuid;

  inst_amount := 14715000.0;
  remaining := 14639892.0;

  -- Installment 1: due 2025-02-04
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 1, '2025-02-04', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-08-03
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 2, '2025-08-03', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-01-30
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 3, '2026-01-30', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-07-29
  paid_this := LEAST(remaining, (58860000.00000001 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 4, '2026-07-29', (58860000.00000001 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (58860000.00000001 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- Transaction: Adnan Pervaiz -> Shop 44
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '44';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 44';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status) VALUES (cust_17, brk_3, prj_uuid, inv_uuid, '44', 4.01, 13500000.0, 54135000.0, 'bi-annual', 4, '2025-02-13', '2025-02-13', 'active') RETURNING id INTO txn_uuid;

  inst_amount := 13533750.0;
  remaining := 23533750.0;

  -- Installment 1: due 2025-02-13
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 1, '2025-02-13', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-08-13
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 2, '2025-08-13', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-02-09
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 3, '2026-02-09', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-08-08
  paid_this := LEAST(remaining, (54135000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 4, '2026-08-08', (54135000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (54135000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- Transaction: Ali Akbar -> Shop 46
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '46';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 46';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status) VALUES (cust_18, brk_8, prj_uuid, inv_uuid, '46', 2.97, 13500000.0, 40095000.0, 'bi-annual', 4, '2025-01-20', '2025-01-20', 'active') RETURNING id INTO txn_uuid;

  inst_amount := 10023750.0;
  remaining := 15000000.0;

  -- Installment 1: due 2025-01-20
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 1, '2025-01-20', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-07-19
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 2, '2025-07-19', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-01-15
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 3, '2026-01-15', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-07-14
  paid_this := LEAST(remaining, (40095000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 4, '2026-07-14', (40095000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (40095000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  -- Transaction: Ali Akbar -> Shop 47
  SELECT id INTO inv_uuid FROM inventory WHERE project_id = prj_uuid AND unit_number = '47';
  IF inv_uuid IS NULL THEN
    RAISE EXCEPTION 'Inventory not found for shop 47';
  END IF;

  INSERT INTO transactions (customer_id, broker_id, project_id, inventory_id, unit_number, area_marla, rate_per_marla, total_value, installment_cycle, num_installments, first_due_date, booking_date, status) VALUES (cust_18, brk_8, prj_uuid, inv_uuid, '47', 2.64, 13500000.0, 35640000.0, 'bi-annual', 4, '2025-01-20', '2025-01-20', 'active') RETURNING id INTO txn_uuid;

  inst_amount := 8910000.0;
  remaining := 10000000.0;

  -- Installment 1: due 2025-01-20
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 1, '2025-01-20', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 2: due 2025-07-19
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 2, '2025-07-19', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 3: due 2026-01-15
  paid_this := LEAST(remaining, inst_amount);
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 3, '2026-01-15', inst_amount, paid_this, CASE WHEN paid_this >= inst_amount THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  -- Installment 4: due 2026-07-14
  paid_this := LEAST(remaining, (35640000.0 - 3 * inst_amount));
  INSERT INTO installments (transaction_id, installment_number, due_date, amount, amount_paid, status) VALUES (txn_uuid, 4, '2026-07-14', (35640000.0 - 3 * inst_amount), paid_this, CASE WHEN paid_this >= (35640000.0 - 3 * inst_amount) THEN 'paid' ELSE 'pending' END);
  remaining := remaining - paid_this;

  UPDATE inventory SET status = 'sold', updated_at = NOW() WHERE id = inv_uuid;

  RAISE NOTICE 'Migration complete: 28 transactions created';
END $$;

-- ============ Verification Queries ============
SELECT 'Customers' as entity, COUNT(*) as count FROM customers;
SELECT 'Brokers' as entity, COUNT(*) as count FROM brokers;
SELECT 'Transactions' as entity, COUNT(*) as count FROM transactions WHERE project_id = (SELECT id FROM projects WHERE project_id = 'PRJ-0001');
SELECT 'Sold Inventory' as entity, COUNT(*) as count FROM inventory WHERE project_id = (SELECT id FROM projects WHERE project_id = 'PRJ-0001') AND status = 'sold';
SELECT t.transaction_id, c.name as customer, i.unit_number as shop, t.total_value, SUM(inst.amount_paid) as total_paid FROM transactions t JOIN customers c ON t.customer_id = c.id JOIN inventory i ON t.inventory_id = i.id LEFT JOIN installments inst ON inst.transaction_id = t.id WHERE t.project_id = (SELECT id FROM projects WHERE project_id = 'PRJ-0001') GROUP BY t.transaction_id, c.name, i.unit_number, t.total_value ORDER BY i.unit_number::int;

COMMIT;