# Authentication Setup Guide

## Quick Setup (5 minutes)

### 1. Install Dependencies
```bash
cd backend
pip install -r requirements.txt
# Or if using Docker:
docker-compose exec backend pip install -r requirements.txt
```

### 2. Run Database Migration
```bash
# Connect to your PostgreSQL database and run:
psql -U sitara -d sitara_crm -f backend/add_auth_columns.sql
```

Or manually:
```sql
ALTER TABLE company_reps 
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255),
ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';

UPDATE company_reps SET role = 'user' WHERE role IS NULL;
```

### 3. Create Admin User
Update an existing user to admin role:
```sql
-- Replace 'REP-00001' with an actual rep_id
UPDATE company_reps SET role = 'admin' WHERE rep_id = 'REP-00001';
```

### 4. Restart Backend
```bash
docker-compose restart backend
# Or if running locally:
uvicorn app.main:app --reload
```

## User Roles & Permissions

### Role Hierarchy:
1. **admin** - Full access to everything
2. **manager** - Can access most features except settings
3. **user** - Standard user, limited access
4. **viewer** - Read-only access

### Access Matrix:

| Feature | Admin | Manager | User | Viewer |
|---------|-------|---------|------|--------|
| Dashboard | ✅ | ✅ | ✅ | ✅ |
| Projects | ✅ | ✅ | ✅ | ✅ |
| Inventory | ✅ | ✅ | ✅ | ✅ |
| Transactions | ✅ | ✅ | ✅ | ✅ |
| Receipts | ✅ | ✅ | ✅ | ✅ |
| Payments | ✅ | ✅ | ❌ | ❌ |
| Reports | ✅ | ✅ | ❌ | ❌ |
| Interactions | ✅ | ✅ | ✅ | ❌ |
| Customers | ✅ | ✅ | ✅ | ❌ |
| Brokers | ✅ | ✅ | ❌ | ❌ |
| Campaigns | ✅ | ✅ | ❌ | ❌ |
| Media Library | ✅ | ✅ | ✅ | ✅ |
| Settings | ✅ | ❌ | ❌ | ❌ |

## First Login

1. Use your `rep_id` as username (e.g., "REP-00001")
2. Enter any password (will be set on first login)
3. After first login, use the same password

## Creating Users

### Via API (Admin only):
```bash
curl -X POST http://localhost:8000/api/company-reps \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "mobile": "1234567890",
    "password": "secure123",
    "role": "user"
  }'
```

### Via Database:
```sql
INSERT INTO company_reps (rep_id, name, email, mobile, role, status)
VALUES ('REP-00010', 'Jane Doe', 'jane@example.com', '9876543210', 'user', 'active');
```

Then user can login with rep_id and set password on first login.

## Security Notes

- Change `SECRET_KEY` in production (backend/app/main.py)
- Use strong passwords
- JWT tokens expire after 24 hours
- Passwords are hashed with bcrypt
- Only admins can create/modify users

## Troubleshooting

**Can't login?**
- Check if user exists in database
- Verify password_hash is NULL (for first login) or correct
- Check user status is 'active'

**Token expired?**
- User will be logged out automatically
- Just login again

**Permission denied?**
- Check user role in database
- Verify role has access to requested feature

