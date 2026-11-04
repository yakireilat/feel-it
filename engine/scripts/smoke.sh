#!/usr/bin/env bash
# Boot the engine in dry-run mode and exercise every webhook end to end.
set -euo pipefail
cd "$(dirname "$0")/.."

export SECRET_DEMO_BARBER=smoke SECRET_FEEL_IT_DEMO=smoke-demo ADMIN_TOKEN=smoke-admin PORT=${PORT:-8099}
export WHATSAPP_VERIFY_TOKEN=smoke-verify WHATSAPP_APP_SECRET=smoke-app-secret PUBLIC_URL=http://localhost:${PORT:-8099}
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
# Missed-call reply carries a tracked link that redirects to the booking page.
LINK=$(grep -o "http://localhost:$PORT/r/[A-Za-z0-9_/-]*" "$LOG" | head -1)
expect '302' "$(curl -s -o /dev/null -w '%{http_code}' "$LINK")"

# Meta webhook: verification handshake, then a signed opt-out message.
expect '^42$' "$(curl -sf "localhost:$PORT/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=smoke-verify&hub.challenge=42")"
BODY='{"entry":[{"changes":[{"value":{"metadata":{"phone_number_id":"100000000000001"},"messages":[{"from":"972501112222","type":"text","text":{"body":"הסר"}}]}}]}]}'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac smoke-app-secret | sed 's/^.* //')"
expect 'unauthorized\|bad signature' "$(curl -s -XPOST "localhost:$PORT/webhooks/whatsapp" -H 'x-hub-signature-256: sha256=bad' -d "$BODY")"
expect '"handled":1' "$(curl -sf -XPOST "localhost:$PORT/webhooks/whatsapp" -H "x-hub-signature-256: $SIG" -d "$BODY")"
expect '"status":"blocked"' "$(curl -sf -XPOST "localhost:$PORT/hooks/demo-barber/missed-call" -H 'x-webhook-secret: smoke' -d '{"from":"050-111-2222","at":"2030-01-01T10:00:00Z"}')"
echo "smoke test passed"
