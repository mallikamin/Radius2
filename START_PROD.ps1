# Start Orbit in PRODUCTION mode
# Ports: 5435 (DB), 8001 (API), 8081 (Frontend via nginx)

Write-Host "Starting Orbit in PRODUCTION mode..." -ForegroundColor Cyan
Write-Host "Ports: DB=5435, API=8001, Frontend=8081" -ForegroundColor Yellow
Write-Host ""

# Build frontend first
Write-Host "Building frontend..." -ForegroundColor Yellow
Push-Location frontend
npm run build
Pop-Location

Write-Host ""
Write-Host "Starting containers..." -ForegroundColor Yellow
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

Write-Host ""
Write-Host "Production URLs:" -ForegroundColor Green
Write-Host "  Frontend: http://localhost:8081" -ForegroundColor White
Write-Host "  API:      http://localhost:8001/api" -ForegroundColor White
Write-Host "  Database: localhost:5435" -ForegroundColor White
