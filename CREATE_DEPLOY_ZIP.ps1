# Create deployment zip for IT guy
# Run this after making changes and testing locally

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Orbit - Create Deployment Package" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Build frontend
Write-Host "Step 1: Building frontend..." -ForegroundColor Yellow
Push-Location frontend
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Frontend build failed!" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host "Frontend built successfully." -ForegroundColor Green
Write-Host ""

# Create temp folder
Write-Host "Step 2: Preparing files..." -ForegroundColor Yellow
$tempDir = "$env:TEMP\orbit_deploy_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
$zipFile = "C:\Users\Malik\Desktop\orbit_deploy_$(Get-Date -Format 'yyyy-MM-dd').zip"

New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

# Copy required files
Copy-Item -Path "backend" -Destination "$tempDir\backend" -Recurse
Copy-Item -Path "database" -Destination "$tempDir\database" -Recurse
Copy-Item -Path "frontend\dist" -Destination "$tempDir\frontend\dist" -Recurse
Copy-Item -Path "media" -Destination "$tempDir\media" -Recurse
Copy-Item -Path "nginx" -Destination "$tempDir\nginx" -Recurse
Copy-Item -Path "docker-compose.yml" -Destination "$tempDir\"
Copy-Item -Path "docker-compose.prod.yml" -Destination "$tempDir\"
Copy-Item -Path "START_PROD.ps1" -Destination "$tempDir\"
Copy-Item -Path "STOP.ps1" -Destination "$tempDir\"
Copy-Item -Path "SYNC_DATA_TO_SERVER.ps1" -Destination "$tempDir\" -ErrorAction SilentlyContinue
Copy-Item -Path "IMPORT_DATA_SYNC.ps1" -Destination "$tempDir\" -ErrorAction SilentlyContinue

# Clean up pycache
Get-ChildItem -Path $tempDir -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force

Write-Host "Files prepared." -ForegroundColor Green
Write-Host ""

# Create zip
Write-Host "Step 3: Creating zip..." -ForegroundColor Yellow
if (Test-Path $zipFile) { Remove-Item $zipFile -Force }
Compress-Archive -Path "$tempDir\*" -DestinationPath $zipFile -Force

# Cleanup
Remove-Item -Path $tempDir -Recurse -Force

$size = [math]::Round((Get-Item $zipFile).Length / 1KB, 2)
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Deployment package created!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "File: $zipFile" -ForegroundColor Cyan
Write-Host "Size: $size KB" -ForegroundColor Cyan
Write-Host ""
Write-Host "Instructions for IT guy:" -ForegroundColor Yellow
Write-Host "  1. Extract to C:\Docker\Orbit" -ForegroundColor White
Write-Host "  2. Run: .\START_PROD.ps1" -ForegroundColor White
Write-Host "  3. Access: http://localhost:8081" -ForegroundColor White
Write-Host ""
