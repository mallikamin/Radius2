-- Add authentication columns to company_reps table
-- Run this SQL script to add password_hash and role columns

ALTER TABLE company_reps 
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255),
ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';

-- Update existing users to have default role
UPDATE company_reps SET role = 'user' WHERE role IS NULL;

-- Create a default admin user (password: admin123)
-- Replace 'REP-00001' with an actual rep_id from your database
-- INSERT INTO company_reps (rep_id, name, password_hash, role, status)
-- VALUES ('REP-00001', 'Admin User', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYqJ5q5q5q5u', 'admin', 'active')
-- ON CONFLICT (rep_id) DO UPDATE SET role = 'admin', password_hash = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYqJ5q5q5q5u';

-- Note: The password hash above is for 'admin123'
-- To generate a new password hash, use Python:
-- from passlib.context import CryptContext
-- pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
-- print(pwd_context.hash("your_password"))

