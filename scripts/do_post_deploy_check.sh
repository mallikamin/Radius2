#!/usr/bin/env bash
set -euo pipefail
TOKEN=$(curl -sk -X POST "https://orbit-voice.duckdns.org/api/auth/login" -H "Content-Type: application/x-www-form-urlencoded" -d "username=REP-0002&password=admin123" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token",""))')
echo "token_len:${#TOKEN}"
echo -n "sales_kpis_status:"; curl -sk -o /tmp/kpi.json -w "%{http_code}" -H "Authorization: Bearer ${TOKEN}" "https://orbit-voice.duckdns.org/api/dashboard/sales-kpis"; echo
echo -n "drilldown_status:"; curl -sk -o /tmp/drill.json -w "%{http_code}" -H "Authorization: Bearer ${TOKEN}" "https://orbit-voice.duckdns.org/api/analytics/leads/drilldown?export_format=json"; echo
head -c 200 /tmp/kpi.json; echo
head -c 200 /tmp/drill.json; echo
