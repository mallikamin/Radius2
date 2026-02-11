# Switch to Local Testing Ports
# Use when testing locally to avoid conflicts with office server

Write-Host "Switching to Local Testing ports..." -ForegroundColor Yellow

$composeFile = "docker-compose.yml"
$backupFile = "docker-compose.yml.office-backup"

# Backup office config
if (-not (Test-Path $backupFile)) {
    Copy-Item $composeFile $backupFile
    Write-Host "Created backup: $backupFile" -ForegroundColor Cyan
}

# Stop containers
docker compose down

# Update ports
$content = Get-Content $composeFile -Raw
$content = $content -replace '"5435:5432"', '"5436:5432"'
$content = $content -replace '"8001:8000"', '"8002:8000"'
$content = $content -replace '"8081:80"', '"8082:80"'
Set-Content $composeFile $content -NoNewline

Write-Host ""
Write-Host "Local Testing Ports:" -ForegroundColor Green
Write-Host "  PostgreSQL: 5436" -ForegroundColor Green
Write-Host "  API:        8002" -ForegroundColor Green
Write-Host "  Frontend:   8082" -ForegroundColor Green
Write-Host ""
Write-Host "Run: docker compose up -d --build" -ForegroundColor Yellow
Write-Host "Access: http://localhost:8082" -ForegroundColor Cyan
