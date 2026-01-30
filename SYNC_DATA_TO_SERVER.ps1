# Sync Local Data to Server
# Run this on your LAPTOP to create a data export file
# Then send the file to IT guy to import on server

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Sitara CRM - Export Data for Server" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$exportFile = "C:\Users\Malik\Desktop\sitara_data_sync_$(Get-Date -Format 'yyyy-MM-dd_HHmm').sql"

Write-Host "Exporting data from local database..." -ForegroundColor Yellow

# Export all data tables
docker exec sitara_v3_db pg_dump -U sitara -d sitara_crm --data-only `
  --table=customers `
  --table=brokers `
  --table=projects `
  --table=inventory `
  --table=transactions `
  --table=installments `
  --table=receipts `
  --table=interactions `
  --table=company_reps `
  --table=campaigns `
  --table=leads `
  > $exportFile

if (Test-Path $exportFile) {
    $size = [math]::Round((Get-Item $exportFile).Length / 1KB, 2)
    Write-Host ""
    Write-Host "SUCCESS! Data exported." -ForegroundColor Green
    Write-Host "File: $exportFile" -ForegroundColor Cyan
    Write-Host "Size: $size KB" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Send this file to IT guy with these instructions:" -ForegroundColor Yellow
    Write-Host "------------------------------------------------" -ForegroundColor Yellow
    Write-Host "1. Place file in SitaraCRM folder on server" -ForegroundColor White
    Write-Host "2. Run: .\IMPORT_DATA_SYNC.ps1" -ForegroundColor White
    Write-Host "------------------------------------------------" -ForegroundColor Yellow
} else {
    Write-Host "ERROR: Export failed!" -ForegroundColor Red
}
Write-Host ""
pause
