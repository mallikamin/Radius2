# Sitara CRM - Setup Verification Script
# Run this script to verify deployment is ready

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Sitara CRM - Setup Verification" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$basePath = $PWD

# Check required files
Write-Host "Checking required files..." -ForegroundColor Yellow

$requiredFiles = @(
    "database\init.sql",
    "backend\app\main.py",
    "backend\requirements.txt",
    "backend\Dockerfile",
    "frontend\dist\index.html",
    "nginx\default.conf",
    "docker-compose.yml"
)

$allFilesExist = $true
foreach ($file in $requiredFiles) {
    $filePath = Join-Path $basePath $file
    if (Test-Path $filePath) {
        Write-Host "  [OK] $file" -ForegroundColor Green
    } else {
        Write-Host "  [X] $file - MISSING!" -ForegroundColor Red
        $allFilesExist = $false
    }
}

Write-Host ""

if (-not $allFilesExist) {
    Write-Host "ERROR: Some required files are missing!" -ForegroundColor Red
    exit 1
}

# Check Docker
Write-Host "Checking Docker..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version
    Write-Host "  [OK] Docker installed: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "  [X] Docker is not installed or not in PATH" -ForegroundColor Red
    exit 1
}

# Check ports
Write-Host "Checking port availability..." -ForegroundColor Yellow
$ports = @(8081, 8001, 5435)
foreach ($port in $ports) {
    $inUse = netstat -an | Select-String ":$port\s"
    if ($inUse) {
        Write-Host "  [!] Port $port may be in use" -ForegroundColor Yellow
    } else {
        Write-Host "  [OK] Port $port available" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Setup verification complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Sitara CRM Ports:" -ForegroundColor Yellow
Write-Host "  Frontend:   http://localhost:8081" -ForegroundColor Cyan
Write-Host "  API:        http://localhost:8001" -ForegroundColor Cyan
Write-Host "  Database:   localhost:5435" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. docker compose up -d --build" -ForegroundColor White
Write-Host "  2. Wait 30 seconds for database init" -ForegroundColor White
Write-Host "  3. Open http://localhost:8081" -ForegroundColor White
Write-Host ""
