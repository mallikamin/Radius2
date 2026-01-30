# Start Orbit in LOCAL DEV mode
# Ports: 5440 (DB), 8010 (API), 5180 (Frontend)

Write-Host "Starting Orbit in LOCAL DEV mode..." -ForegroundColor Cyan
Write-Host "Ports: DB=5440, API=8010, Frontend=5180" -ForegroundColor Yellow
Write-Host ""

docker compose up -d --build

Write-Host ""
Write-Host "Local Dev URLs:" -ForegroundColor Green
Write-Host "  Frontend: http://localhost:5180" -ForegroundColor White
Write-Host "  API:      http://localhost:8010/api" -ForegroundColor White
Write-Host "  Database: localhost:5440" -ForegroundColor White
