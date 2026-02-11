# Stop Sitara CRM Containers
Write-Host "Stopping Sitara CRM containers..." -ForegroundColor Yellow
docker compose down
Write-Host "All containers stopped." -ForegroundColor Green
Write-Host "To start again: docker compose up -d" -ForegroundColor Cyan
