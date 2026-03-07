Write-Host ""
Write-Host "========================================" -ForegroundColor Red
Write-Host "  RESET Orbit CRM Demo" -ForegroundColor Red
Write-Host "  This will WIPE all demo data!" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Red
Write-Host ""

$confirm = Read-Host "Type 'RESET' to confirm"
if ($confirm -ne "RESET") {
    Write-Host "Cancelled." -ForegroundColor Yellow
    exit 0
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# Stop containers
Write-Host ""
Write-Host "[1/4] Stopping demo containers..." -ForegroundColor Yellow
docker compose -f docker-compose.demo.yml down 2>&1 | Out-Null

# Remove volume
Write-Host "[2/4] Removing demo volume..." -ForegroundColor Yellow
docker volume rm orbit_demo_postgres 2>&1 | Out-Null

# Recreate volume
Write-Host "[3/4] Recreating volume..." -ForegroundColor Yellow
docker volume create orbit_demo_postgres | Out-Null

# Restart with fresh seed
Write-Host "[4/4] Starting fresh demo..." -ForegroundColor Yellow
Write-Host ""
& "$scriptDir\START_DEMO.ps1"
