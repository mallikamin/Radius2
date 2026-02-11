# Export Existing Sitara CRM Database
# Run this on the OLD server to export data

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Sitara CRM - Database Export" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Configuration - UPDATE THESE VALUES
$OLD_HOST = "localhost"
$OLD_PORT = "5440"  # Current dev port - change if different
$OLD_USER = "sitara"
$OLD_DB = "sitara_crm"
$BACKUP_FILE = "sitara_backup_$(Get-Date -Format 'yyyy-MM-dd_HHmmss').sql"

Write-Host "Export Configuration:" -ForegroundColor Yellow
Write-Host "  Host: $OLD_HOST" -ForegroundColor White
Write-Host "  Port: $OLD_PORT" -ForegroundColor White
Write-Host "  User: $OLD_USER" -ForegroundColor White
Write-Host "  Database: $OLD_DB" -ForegroundColor White
Write-Host "  Output: $BACKUP_FILE" -ForegroundColor White
Write-Host ""

# Method 1: If pg_dump is available locally
Write-Host "Attempting export via pg_dump..." -ForegroundColor Yellow
try {
    $env:PGPASSWORD = "sitara123"  # Update password if different
    pg_dump -h $OLD_HOST -p $OLD_PORT -U $OLD_USER -d $OLD_DB -f $BACKUP_FILE
    Write-Host "SUCCESS: Database exported to $BACKUP_FILE" -ForegroundColor Green
}
catch {
    Write-Host "pg_dump not found locally. Trying Docker method..." -ForegroundColor Yellow

    # Method 2: Via Docker container
    try {
        docker exec sitara_v3_db pg_dump -U sitara sitara_crm > $BACKUP_FILE
        Write-Host "SUCCESS: Database exported to $BACKUP_FILE" -ForegroundColor Green
    }
    catch {
        Write-Host "ERROR: Could not export database" -ForegroundColor Red
        Write-Host "Please manually run:" -ForegroundColor Yellow
        Write-Host "  docker exec sitara_v3_db pg_dump -U sitara sitara_crm > backup.sql" -ForegroundColor White
    }
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Copy $BACKUP_FILE to the new server" -ForegroundColor White
Write-Host "  2. Run IMPORT_DATABASE.ps1 on the new server" -ForegroundColor White
Write-Host ""
