# Stop all Orbit containers (both local and prod)
Write-Host "Stopping Orbit containers..." -ForegroundColor Yellow
docker compose -f docker-compose.yml -f docker-compose.prod.yml down 2>$null
docker compose down 2>$null
Write-Host "Stopped." -ForegroundColor Green
