# Import Synced Data from Laptop
# Run this on SERVER after receiving data file from laptop

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Sitara CRM - Import Data Sync" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Find the sync file
$syncFile = Get-ChildItem -Path . -Filter "sitara_data_sync_*.sql" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $syncFile) {
    Write-Host "ERROR: No sync file found!" -ForegroundColor Red
    Write-Host "Place sitara_data_sync_*.sql file in this folder" -ForegroundColor Yellow
    pause
    exit
}

Write-Host "Found: $($syncFile.Name)" -ForegroundColor Green
Write-Host ""

# Confirm
$confirm = Read-Host "This will UPDATE server data. Continue? (yes/no)"
if ($confirm -ne "yes") {
    Write-Host "Cancelled." -ForegroundColor Yellow
    exit
}

Write-Host ""
Write-Host "Importing data..." -ForegroundColor Yellow

# Copy to container
docker cp $syncFile.Name sitara_crm_db:/tmp/sync.sql

# Disable FK checks, clear existing data, import new data
Write-Host "  Disabling foreign key checks..." -ForegroundColor Cyan
docker exec sitara_crm_db psql -U sitara -d sitara_crm -c "SET session_replication_role = 'replica';"

Write-Host "  Clearing existing data..." -ForegroundColor Cyan
docker exec sitara_crm_db psql -U sitara -d sitara_crm -c "TRUNCATE customers, brokers, projects, inventory, transactions, installments, receipts, interactions, company_reps, campaigns, leads RESTART IDENTITY CASCADE;"

Write-Host "  Importing new data..." -ForegroundColor Cyan
docker exec sitara_crm_db psql -U sitara -d sitara_crm -f /tmp/sync.sql

Write-Host "  Re-enabling foreign key checks..." -ForegroundColor Cyan
docker exec sitara_crm_db psql -U sitara -d sitara_crm -c "SET session_replication_role = 'origin';"

# Fix auth columns
Write-Host "  Setting up authentication..." -ForegroundColor Cyan
docker exec sitara_crm_db psql -U sitara -d sitara_crm -c "ALTER TABLE company_reps ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255); ALTER TABLE company_reps ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';"

# Generate password hash and set it
Write-Host "  Setting admin password..." -ForegroundColor Cyan
$hash = docker exec sitara_crm_api python -c "from passlib.context import CryptContext; print(CryptContext(schemes=['bcrypt']).hash('admin123'))"
docker exec sitara_crm_db psql -U sitara -d sitara_crm -c "UPDATE company_reps SET password_hash = '$hash', role = 'admin' WHERE rep_id = 'REP-0002';"

# Verify
Write-Host ""
Write-Host "Verifying import..." -ForegroundColor Yellow
docker exec sitara_crm_db psql -U sitara -d sitara_crm -c "SELECT 'customers' as tbl, COUNT(*) FROM customers UNION ALL SELECT 'projects', COUNT(*) FROM projects UNION ALL SELECT 'inventory', COUNT(*) FROM inventory UNION ALL SELECT 'transactions', COUNT(*) FROM transactions;"

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Data sync complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Login: REP-0002 / admin123" -ForegroundColor Cyan
pause
