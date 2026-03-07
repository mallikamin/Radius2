Write-Host ""
Write-Host "Stopping Orbit CRM Demo..." -ForegroundColor Yellow

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

docker compose -f docker-compose.demo.yml down

Write-Host ""
Write-Host "Demo stopped." -ForegroundColor Green
Write-Host "Data is preserved. Run .\START_DEMO.ps1 to resume." -ForegroundColor Gray
Write-Host "Run .\RESET_DEMO.ps1 to wipe and start fresh." -ForegroundColor Gray
Write-Host ""
