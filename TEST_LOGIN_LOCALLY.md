# Step-by-Step: Test User Logins Locally

## Step 1: Install Authentication Dependencies

### Option A: If using Docker (Recommended)
```bash
cd C:\Users\Malik\Desktop\radius2
docker-compose exec backend pip install python-jose[cryptography] passlib[bcrypt]
docker-compose restart backend
```

### Option B: If running backend locally
```bash
cd C:\Users\Malik\Desktop\radius2\backend
pip install python-jose[cryptography] passlib[bcrypt]
```

**Verify installation:**
```bash
docker-compose exec backend pip list | grep -E "jose|passlib"
# Should show: python-jose and passlib
```

---

## Step 2: Run Database Migration

### Connect to your database and add auth columns:

**Option A: Using Docker:**
```bash
docker-compose exec db psql -U sitara -d sitara_crm
```

**Option B: Using local PostgreSQL:**
```bash
psql -U sitara -d sitara_crm -h localhost -p 5434
```

**Then run these SQL commands:**
```sql
-- Add authentication columns
ALTER TABLE company_reps 
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255),
ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';

-- Set default role for existing users
UPDATE company_reps SET role = 'user' WHERE role IS NULL;

-- Verify columns were added
\d company_reps

-- Exit psql
\q
```

**Or run the SQL file directly:**
```bash
docker-compose exec -T db psql -U sitara -d sitara_crm < backend/add_auth_columns.sql
```

---

## Step 3: Create Test Users

### Check existing users:
```bash
docker-compose exec db psql -U sitara -d sitara_crm -c "SELECT rep_id, name, email, role FROM company_reps LIMIT 5;"
```

### Create your first admin user:

**Option A: Update existing user to admin:**
```sql
-- Replace 'REP-00001' with an actual rep_id from your database
UPDATE company_reps SET role = 'admin' WHERE rep_id = 'REP-00001';
```

**Option B: Create new test user via SQL:**
```sql
INSERT INTO company_reps (rep_id, name, email, mobile, role, status)
VALUES ('TEST-ADMIN', 'Test Admin', 'admin@test.com', '1234567890', 'admin', 'active');
```

**Option C: Create via API (after backend is running):**
```bash
# First, you'll need to temporarily allow unauthenticated user creation
# Or use the login endpoint which auto-creates password on first login
```

---

## Step 4: Restart Backend

```bash
docker-compose restart backend
```

**Check backend logs:**
```bash
docker-compose logs backend --tail 50
```

**Verify backend is running:**
```bash
curl http://localhost:8002/api/health
# Should return JSON with status
```

---

## Step 5: Test Login via API

### Test 1: First-time login (no password set)

```bash
curl -X POST http://localhost:8002/api/auth/login \
  -F "username=REP-00001" \
  -F "password=anypassword123"
```

**Expected response:**
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer",
  "user": {
    "id": "...",
    "rep_id": "REP-00001",
    "name": "User Name",
    "email": "user@example.com",
    "role": "admin"
  }
}
```

**Save the token for next test:**
```bash
# Copy the access_token from response
export TOKEN="your-token-here"
```

### Test 2: Login with existing password

```bash
curl -X POST http://localhost:8002/api/auth/login \
  -F "username=REP-00001" \
  -F "password=anypassword123"
```

Should return same response with new token.

### Test 3: Get current user info

```bash
curl -X GET http://localhost:8002/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

**Expected response:**
```json
{
  "id": "...",
  "rep_id": "REP-00001",
  "name": "User Name",
  "email": "user@example.com",
  "role": "admin",
  "mobile": "1234567890"
}
```

### Test 4: Test invalid login

```bash
curl -X POST http://localhost:8002/api/auth/login \
  -F "username=REP-00001" \
  -F "password=wrongpassword"
```

**Expected response:**
```json
{
  "detail": "Invalid username or password"
}
```

---

## Step 6: Test Login in Browser

### 1. Open Frontend
```bash
# Make sure frontend is running
docker-compose up frontend

# Or if already running, just open:
http://localhost:5174
```

### 2. You should see login page

**Login with:**
- **Username:** Your `rep_id` (e.g., "REP-00001" or "TEST-ADMIN")
- **Password:** Any password (on first login) or the password you set

### 3. After login, verify:
- ✅ You see your name and role in header
- ✅ Tabs are visible based on your role
- ✅ You can navigate between tabs
- ✅ Logout button works

---

## Step 7: Test Different Roles

### Create test users with different roles:

```sql
-- Manager user
INSERT INTO company_reps (rep_id, name, email, role, status)
VALUES ('TEST-MGR', 'Test Manager', 'manager@test.com', 'manager', 'active');

-- Regular user
INSERT INTO company_reps (rep_id, name, email, role, status)
VALUES ('TEST-USER', 'Test User', 'user@test.com', 'user', 'active');

-- Viewer (read-only)
INSERT INTO company_reps (rep_id, name, email, role, status)
VALUES ('TEST-VIEW', 'Test Viewer', 'viewer@test.com', 'viewer', 'active');
```

### Test each role:

1. **Logout** from current session
2. **Login** with different user (rep_id)
3. **Verify** tabs shown match role permissions:
   - **Admin:** All tabs visible
   - **Manager:** Most tabs (no Settings)
   - **User:** Limited tabs (no Payments, Reports, Brokers, Campaigns)
   - **Viewer:** Read-only tabs (no Payments, Reports, Interactions, Customers, Brokers, Campaigns)

---

## Step 8: Test Password Change

### Login as any user, then:

```bash
curl -X POST http://localhost:8002/api/auth/change-password \
  -H "Authorization: Bearer $TOKEN" \
  -F "old_password=anypassword123" \
  -F "new_password=newpassword456"
```

**Expected response:**
```json
{
  "message": "Password changed successfully"
}
```

### Test login with new password:
```bash
curl -X POST http://localhost:8002/api/auth/login \
  -F "username=REP-00001" \
  -F "password=newpassword456"
```

Should work! ✅

---

## Step 9: Verify Database

### Check user has password hash:
```sql
SELECT rep_id, name, role, 
       CASE WHEN password_hash IS NULL THEN 'No password' ELSE 'Password set' END as password_status
FROM company_reps;
```

### Check roles:
```sql
SELECT role, COUNT(*) as count 
FROM company_reps 
GROUP BY role;
```

---

## Troubleshooting

### ❌ "Module not found: jose" or "passlib"
**Fix:** Reinstall dependencies
```bash
docker-compose exec backend pip install python-jose[cryptography] passlib[bcrypt]
docker-compose restart backend
```

### ❌ "Column password_hash does not exist"
**Fix:** Run database migration again
```sql
ALTER TABLE company_reps ADD COLUMN password_hash VARCHAR(255);
ALTER TABLE company_reps ADD COLUMN role VARCHAR(50) DEFAULT 'user';
```

### ❌ "Invalid username or password"
**Check:**
- User exists: `SELECT * FROM company_reps WHERE rep_id = 'YOUR_REP_ID';`
- User is active: `status = 'active'`
- For first login, password_hash should be NULL

### ❌ "CORS error" in browser
**Fix:** Check CORS_ORIGINS in backend includes `http://localhost:5174`

### ❌ Login page not showing
**Check:**
- Frontend code has LoginView component
- Browser console for errors
- Network tab for API calls

### ❌ Token expires immediately
**Check:** SECRET_KEY is set and consistent

---

## Quick Test Checklist

- [ ] Dependencies installed
- [ ] Database columns added
- [ ] At least one admin user exists
- [ ] Backend restarted
- [ ] Login API works (curl test)
- [ ] Browser login works
- [ ] User info shows in header
- [ ] Role-based tabs visible
- [ ] Logout works
- [ ] Password change works

---

## Next Steps After Local Testing

Once everything works locally:
1. Test with multiple users simultaneously
2. Test role permissions thoroughly
3. Verify password security (hashed in database)
4. Test token expiration (24 hours)
5. Then deploy to office server

