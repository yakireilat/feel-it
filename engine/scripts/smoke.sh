#!/usr/bin/env bash
# Boot the engine in dry-run mode and exercise every webhook end to end.
set -euo pipefail
cd "$(dirname "$0")/.."

export SECRET_DEMO_BARBER=smoke ADMIN_TOKEN=smoke-admin PORT=${PORT:-8099}
export DATA_DIR=$(mktemp -d) WHATSAPP_TOKEN= ANTHROPIC_API_KEY=
LOG=$(mktemp)
node src/index.js >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; echo "--- server log ---"; cat "$LOG"' EXIT

for _ in $(seq 50); do curl -sf "localhost:$PORT/health" >/dev/null && break; sleep 0.2; done

hook() { curl -sf -XPOST "localhost:$PORT/hooks/demo-barber/$1" -H 'x-webhook-secret: smoke' -H 'content-type: application/json' -d "$2"; }
expect() { echo "$2" | grep -q "$1" || { echo "FAIL: expected $1 in $2"; exit 1; }; echo "ok: $2"; }

expect '"status":"messaged"'       "$(hook missed-call '{"from":"050-111-2222"}')"
expect '"reason":"cooldown"'       "$(hook missed-call '{"from":"050-111-2222"}')"
expect '"status":"queued"'         "$(hook visit '{"phone":"052-333-4444","name":"Noa"}')"
expect '"status":"owner_notified"' "$(hook review '{"author":"Avi","rating":2,"text":"long wait"}')"
expect 'unauthorized'             "$(curl -s -XPOST "localhost:$PORT/hooks/demo-barber/visit" -d '{}')"
expect '"outboxPending":1'         "$(curl -sf "localhost:$PORT/admin/health" -H 'authorization: Bearer smoke-admin')"
expect 'סיכום יומי'                 "$(curl -sf "localhost:$PORT/admin/demo-barber/digest" -H 'authorization: Bearer smoke-admin')"
echo "smoke test passed"
