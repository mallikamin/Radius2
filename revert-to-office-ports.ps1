# Revert to Office Server Ports
Write-Host "Reverting to Office Server ports..." -ForegroundColor Yellow

$composeFile = "docker-compose.yml"
$backupFile = "docker-compose.yml.office-backup"

docker compose down

if (Test-Path $backupFile) {
    Copy-Item $backupFile $composeFile -Force
    Write-Host "Restored from backup" -ForegroundColor Cyan
} else {
    $content = Get-Content $composeFile -Raw
    $content = $content -replace '"5436:5432"', '"5435:5432"'
    $content = $content -replace '"8002:8000"', '"8001:8000"'
    $content = $content -replace '"8082:80"', '"8081:80"'
    Set-Content $composeFile $content -NoNewline
}

Write-Host ""
Write-Host "Office Server Ports:" -ForegroundColor Green
Write-Host "  PostgreSQL: 5435" -ForegroundColor Green
Write-Host "  API:        8001" -ForegroundColor Green
Write-Host "  Frontend:   8081" -ForegroundColor Green
Write-Host ""
Write-Host "Run: docker compose up -d --build" -ForegroundColor Yellow
Write-Host "Access: http://localhost:8081" -ForegroundColor Cyan
