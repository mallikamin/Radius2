-- Phase 10: Add Sales Team Users (Feb 16, 2026)
-- Faisal CCO team: 2 Directors + 4 Sellers + Waqar reporting update
-- Applied to: Local Dev (5440) + DigitalOcean (orbit_db)

-- Fix rep_id sequence (was out of sync at 8-9, max used = 13)
SELECT setval('rep_id_seq', (SELECT MAX(CAST(SUBSTRING(rep_id FROM 5) AS INTEGER)) FROM company_reps));

-- Directors (report to Faisal CCO = REP-0008)
INSERT INTO company_reps (name, role, status, reports_to, title)
VALUES
  ('Iram Riaz', 'manager', 'active', 'REP-0008', 'Director - Project Sales'),      -- REP-0014
  ('Imran Younas', 'manager', 'active', 'REP-0008', 'Director - Project Sales');    -- REP-0015

-- Sellers under Iram Riaz (REP-0014)
INSERT INTO company_reps (name, role, status, reports_to, title, rep_type)
VALUES
  ('Samia Rashid', 'user', 'active', 'REP-0014', 'Executive Sr. Manager - Project Sales', 'direct_rep'),            -- REP-0016
  ('Syed Naeem Abbass Zaidi', 'user', 'active', 'REP-0014', 'Sr. Manager - Project Sales', 'direct_rep');           -- REP-0017

-- Sellers under Imran Younas (REP-0015)
INSERT INTO company_reps (name, role, status, reports_to, title, rep_type)
VALUES
  ('Syed Ali Zaib Zaidi', 'user', 'active', 'REP-0015', 'Executive Sr. Manager - Project Sales', 'direct_rep'),     -- REP-0018
  ('Iram Aslam', 'user', 'active', 'REP-0015', 'Executive Sr. Manager - Project Sales', 'direct_rep');              -- REP-0019

-- Update Waqar (REP-0001): move from Faisal to Iram Riaz (indirect channel under her)
UPDATE company_reps SET reports_to = 'REP-0014' WHERE rep_id = 'REP-0001';

-- Passwords: first name lowercase (set via passlib bcrypt in application layer)
-- REP-0014: iram | REP-0015: imran | REP-0016: samia
-- REP-0017: naeem | REP-0018: ali | REP-0019: iram
