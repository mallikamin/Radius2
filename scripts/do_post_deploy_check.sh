#!/usr/bin/env bash
set -euo pipefail

# Hygienic post-deploy smoke check.
# Usage:
#   ORBIT_USER="REP-0002" ORBIT_PASSWORD="***" ./scripts/do_post_deploy_check.sh
# Optional:
#   ORBIT_DOMAIN="orbit-voice.duckdns.org"

ORBIT_DOMAIN="${ORBIT_DOMAIN:-orbit-voice.duckdns.org}"
BASE_URL="https://${ORBIT_DOMAIN}"
ORBIT_USER="${ORBIT_USER:-}"
ORBIT_PASSWORD="${ORBIT_PASSWORD:-}"

if [[ -z "${ORBIT_USER}" || -z "${ORBIT_PASSWORD}" ]]; then
  echo "ERROR: ORBIT_USER and ORBIT_PASSWORD must be set."
  exit 1
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

echo "[1/5] Health check (no -k): ${BASE_URL}/api/health"
health_code="$(curl -sS -o "${tmp_dir}/health.json" -w "%{http_code}" "${BASE_URL}/api/health")"
echo "health_status:${health_code}"
if [[ "${health_code}" != "200" ]]; then
  echo "ERROR: health endpoint failed"
  cat "${tmp_dir}/health.json" || true
  exit 1
fi

echo "[2/5] SSL CN check (must match ${ORBIT_DOMAIN})"
cert_subject="$(openssl s_client -connect "${ORBIT_DOMAIN}:443" -servername "${ORBIT_DOMAIN}" </dev/null 2>/dev/null | openssl x509 -noout -subject)"
echo "${cert_subject}"
if [[ "${cert_subject}" != *"CN = ${ORBIT_DOMAIN}"* ]]; then
  echo "ERROR: SSL CN mismatch for ${ORBIT_DOMAIN}"
  exit 1
fi

echo "[3/5] Auth login"
token_response="$(curl -sS -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=${ORBIT_USER}&password=${ORBIT_PASSWORD}")"
TOKEN="$(printf "%s" "${token_response}" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token",""))')"
if [[ -z "${TOKEN}" ]]; then
  echo "ERROR: login failed"
  printf "%s\n" "${token_response}" | head -c 200
  echo
  exit 1
fi
echo "auth:ok"

echo "[4/5] Sales KPI endpoint"
kpi_code="$(curl -sS -o "${tmp_dir}/kpi.json" -w "%{http_code}" -H "Authorization: Bearer ${TOKEN}" "${BASE_URL}/api/dashboard/sales-kpis")"
echo "sales_kpis_status:${kpi_code}"
if [[ "${kpi_code}" != "200" ]]; then
  echo "ERROR: sales-kpis endpoint failed"
  head -c 200 "${tmp_dir}/kpi.json"; echo
  exit 1
fi

echo "[5/5] Drilldown endpoint"
drill_code="$(curl -sS -o "${tmp_dir}/drill.json" -w "%{http_code}" -H "Authorization: Bearer ${TOKEN}" "${BASE_URL}/api/analytics/leads/drilldown?export_format=json")"
echo "drilldown_status:${drill_code}"
if [[ "${drill_code}" != "200" ]]; then
  echo "ERROR: drilldown endpoint failed"
  head -c 200 "${tmp_dir}/drill.json"; echo
  exit 1
fi

echo "POST_DEPLOY_CHECK: PASS"
