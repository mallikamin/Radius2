# Quick rotation check for annotation 1776313640186
# Usage: .\check_rotation.ps1

$rotation = ssh root@159.65.158.26 "docker exec orbit_db psql -U sitara -d sitara_crm -t -c \"SELECT jsonb_path_query(vector_metadata, '`$.annos[*] ? (@.id == 1776313640186)')->>'rotation' FROM vector_projects WHERE id = 'e5d4d219-57cd-4b85-8b84-d55c661cfa98';\""

$rotation = $rotation.Trim()

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Annotation Rotation Check" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Project: Sitara Grand Bazaar Map" -ForegroundColor White
Write-Host "Annotation ID: 1776313640186" -ForegroundColor White
Write-Host "Annotation Note: Ahmed Hassan" -ForegroundColor White
Write-Host ""
Write-Host "Current Rotation: $rotation°" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
