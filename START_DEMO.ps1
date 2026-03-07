Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ORBIT CRM - Demo Environment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Ensure we're in the right directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# Step 1: Create volume if it doesn't exist
Write-Host "[1/4] Checking Docker volume..." -ForegroundColor Yellow
$volumeExists = docker volume ls --format "{{.Name}}" | Select-String -Pattern "^orbit_demo_postgres$"
if (-not $volumeExists) {
    Write-Host "  Creating orbit_demo_postgres volume..." -ForegroundColor Gray
    docker volume create orbit_demo_postgres | Out-Null
    Write-Host "  Volume created." -ForegroundColor Green
} else {
    Write-Host "  Volume already exists." -ForegroundColor Green
}

# Step 2: Start containers
Write-Host "[2/4] Starting demo containers..." -ForegroundColor Yellow
docker compose -f docker-compose.demo.yml up -d --build 2>&1 | ForEach-Object {
    if ($_ -match "error|Error|ERROR") {
        Write-Host "  $_" -ForegroundColor Red
    }
}
Write-Host "  Containers starting..." -ForegroundColor Green

# Step 3: Wait for DB to be healthy
Write-Host "[3/4] Waiting for database..." -ForegroundColor Yellow
$maxRetries = 30
$retry = 0
do {
    Start-Sleep -Seconds 2
    $retry++
    $health = docker inspect --format="{{.State.Health.Status}}" orbit_demo_db 2>$null
    Write-Host "  Attempt $retry/$maxRetries - DB status: $health" -ForegroundColor Gray
} while ($health -ne "healthy" -and $retry -lt $maxRetries)

if ($health -ne "healthy") {
    Write-Host "  ERROR: Database failed to become healthy after $maxRetries attempts" -ForegroundColor Red
    Write-Host "  Check logs: docker compose -f docker-compose.demo.yml logs db" -ForegroundColor Yellow
    exit 1
}
Write-Host "  Database is healthy!" -ForegroundColor Green

# Step 4: Seed if empty
Write-Host "[4/4] Checking if seed data is needed..." -ForegroundColor Yellow
$repCount = docker exec orbit_demo_db psql -U sitara -d sitara_crm -t -c "SELECT COUNT(*) FROM company_reps;" 2>$null
$repCount = $repCount.Trim()

if ([int]$repCount -eq 0) {
    Write-Host "  Empty database detected. Seeding demo data..." -ForegroundColor Gray

    # Read and pipe the seed file
    Get-Content -Path "database/demo_seed.sql" -Raw | docker exec -i orbit_demo_db psql -U sitara -d sitara_crm 2>&1 | ForEach-Object {
        if ($_ -match "ERROR") {
            Write-Host "  SEED ERROR: $_" -ForegroundColor Red
        }
    }

    # Verify seed
    $customerCount = (docker exec orbit_demo_db psql -U sitara -d sitara_crm -t -c "SELECT COUNT(*) FROM customers;").Trim()
    $leadCount = (docker exec orbit_demo_db psql -U sitara -d sitara_crm -t -c "SELECT COUNT(*) FROM leads;").Trim()
    $txnCount = (docker exec orbit_demo_db psql -U sitara -d sitara_crm -t -c "SELECT COUNT(*) FROM transactions;").Trim()

    Write-Host "  Seeded: $repCount reps, $customerCount customers, $leadCount leads, $txnCount transactions" -ForegroundColor Green
} else {
    Write-Host "  Database already has data ($repCount reps). Skipping seed." -ForegroundColor Green
}

# Wait for API
Write-Host ""
Write-Host "Waiting for API to be ready..." -ForegroundColor Yellow
$retry = 0
do {
    Start-Sleep -Seconds 3
    $retry++
    $apiHealth = docker inspect --format="{{.State.Health.Status}}" orbit_demo_api 2>$null
} while ($apiHealth -ne "healthy" -and $retry -lt 20)

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  DEMO READY!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  URL:      http://localhost:5191" -ForegroundColor White
Write-Host "  API Docs: http://localhost:8011/docs" -ForegroundColor White
Write-Host "  DB:       localhost:5441 (sitara/sitara_demo_2026)" -ForegroundColor White
Write-Host ""
Write-Host "  Login:    REP-0001 (Admin - Demo Client)" -ForegroundColor Cyan
Write-Host "            Password: set on first login" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Stop:     .\STOP_DEMO.ps1" -ForegroundColor Gray
Write-Host "  Reset:    .\RESET_DEMO.ps1" -ForegroundColor Gray
Write-Host ""
