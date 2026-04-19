#!/bin/bash
# Quick rotation check for annotation 1776313640186

rotation=$(ssh root@159.65.158.26 "docker exec orbit_db psql -U sitara -d sitara_crm -t -c \"SELECT jsonb_path_query(vector_metadata, '$.annos[*] ? (@.id == 1776313640186)')->>'rotation' FROM vector_projects WHERE id = 'e5d4d219-57cd-4b85-8b84-d55c661cfa98';\"")

rotation=$(echo "$rotation" | tr -d ' ')

echo ""
echo "========================================"
echo "Annotation Rotation Check"
echo "========================================"
echo "Project: Sitara Grand Bazaar Map"
echo "Annotation ID: 1776313640186"
echo "Annotation Note: Ahmed Hassan"
echo ""
echo "Current Rotation: ${rotation}°"
echo "========================================"
echo ""
