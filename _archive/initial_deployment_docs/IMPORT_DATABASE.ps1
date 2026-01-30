# Import Database to New Sitara CRM Deployment
# Run this AFTER docker compose up -d --build

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Sitara CRM - Database Import" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Find backup file
$backupFiles = Get-ChildItem -Path . -Filter "sitara_backup_*.sql" | Sort-Object LastWriteTime -Descending
if ($backupFiles.Count -eq 0) {
    $backupFiles = Get-ChildItem -Path . -Filter "*.sql" | Where-Object { $_.Name -like "*backup*" }
}

if ($backupFiles.Count -eq 0) {
    Write-Host "ERROR: No backup file found!" -ForegroundColor Red
    Write-Host "Please place your backup.sql file in this directory" -ForegroundColor Yellow
    Write-Host "Or specify the file: .\IMPORT_DATABASE.ps1 path\to\backup.sql" -ForegroundColor Yellow
    exit 1
}

$BACKUP_FILE = $backupFiles[0].Name
Write-Host "Found backup file: $BACKUP_FILE" -ForegroundColor Green
Write-Host ""

# Check if containers are running
Write-Host "Checking containers..." -ForegroundColor Yellow
$dbStatus = docker compose ps --format "{{.Name}} {{.Status}}" | Select-String "sitara_crm_db"
if (-not $dbStatus) {
    Write-Host "ERROR: Database container not running!" -ForegroundColor Red
    Write-Host "Run 'docker compose up -d' first" -ForegroundColor Yellow
    exit 1
}
Write-Host "  Database container: Running" -ForegroundColor Green
Write-Host ""

# Wait for database to be ready
Write-Host "Waiting for database to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Import data
Write-Host "Importing data from $BACKUP_FILE..." -ForegroundColor Yellow
Write-Host "This may take a few minutes for large databases..." -ForegroundColor Cyan
Write-Host ""

try {
    # Copy backup file to container
    docker cp $BACKUP_FILE sitara_crm_db:/tmp/backup.sql

    # Run import
    docker exec sitara_crm_db psql -U sitara -d sitara_crm -f /tmp/backup.sql

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "SUCCESS: Database imported!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
}
catch {
    Write-Host "ERROR during import: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Try manual import:" -ForegroundColor Yellow
    Write-Host "  docker cp backup.sql sitara_crm_db:/tmp/" -ForegroundColor White
    Write-Host "  docker exec sitara_crm_db psql -U sitara -d sitara_crm -f /tmp/backup.sql" -ForegroundColor White
}

Write-Host ""
Write-Host "Verify at: http://localhost:8081" -ForegroundColor Cyan
Write-Host ""
