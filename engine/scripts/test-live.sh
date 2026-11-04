#!/usr/bin/env bash
# Live test against a deployed engine, using real WhatsApp messages to your own phone.
#
#   ./scripts/test-live.sh 0538274184 [client-id]
#
# Reads PUBLIC_URL, ADMIN_TOKEN and the client's webhook secret from .env (run it from engine/ on the server).
# Before running: send any message from that phone to the client's WhatsApp number, so WhatsApp's
# 24-hour window is open and free-text messages can reach you without approved templates.
set -euo pipefail
cd "$(dirname "$0")/.."

PHONE=${1:?usage: test-live.sh <phone> [client-id]}
CLIENT=${2:-demo-barber}
env_get() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
BASE=${BASE_URL:-$(env_get PUBLIC_URL)}
ADMIN=$(env_get ADMIN_TOKEN)
SECRET_ENV=$(grep -o '"webhookSecretEnv": *"[A-Z0-9_]*"' "clients/$CLIENT.json" | sed 's/.*"\([A-Z0-9_]*\)"$/\1/')
SECRET=$(env_get "$SECRET_ENV")
[ -n "$BASE" ] && [ -n "$ADMIN" ] && [ -n "$SECRET" ] || { echo "PUBLIC_URL, ADMIN_TOKEN or $SECRET_ENV missing in .env"; exit 1; }

hook() { curl -sS -X POST "$BASE/hooks/$CLIENT/$1" -H "x-webhook-secret: $SECRET" -H 'content-type: application/json' -d "$2"; echo; }
admin() { curl -sS -X "$1" "$BASE/admin/$2" -H "authorization: Bearer $ADMIN" -H 'content-type: application/json' ${3:+-d "$3"}; echo; }
step() { echo; echo "── $1"; }
pause() { [ -n "${NONINTERACTIVE:-}" ] && { echo "   (expect) $1"; return; }; read -r -p "   $1 [Enter] " _ </dev/tty; }

digits() { local d=${1//[^0-9]/}; [[ $d == 0* ]] && d=972${d:1}; echo "$d"; }
OWNER=$(grep -o '"ownerPhone": *"[0-9]*"' "clients/$CLIENT.json" | grep -o '[0-9]\{9,\}')
IS_OWNER=$([ "$(digits "$PHONE")" = "$OWNER" ] && echo 1 || echo 0)
[ "$IS_OWNER" = 1 ] && echo "Note: $PHONE is this client's owner, so it counts as the owner, not a customer. Steps 3-4 need a second phone; they'll be skipped."

step "Health";                       curl -sS "$BASE/health"; echo
step "Reset test state for $PHONE";  admin POST "$CLIENT/test-reset" "{\"phone\":\"$PHONE\"}"

step "1. Missed call"
hook missed-call "{\"from\":\"$PHONE\"}"
pause "You should get a WhatsApp with a booking link. Tap the link, then continue."

step "2. Review alert to the owner (goes to ownerPhone in clients/$CLIENT.json)"
hook review '{"author":"Live Test","rating":2,"text":"Waited too long, but the haircut was great."}'
pause "The owner gets the review and a suggested reply. Reply 1 to it (posts to Google if connected, otherwise returns the text). Continue."

if [ "$IS_OWNER" = 0 ]; then
step "3. Customer message forwarding"
pause "From $PHONE, send the business number any question (e.g. 'יש תור מחר?'). The owner should get it forwarded. Continue."

step "4. Opt-out"
pause "From $PHONE, send: הסר   You should get a removal confirmation. Continue."
hook missed-call "{\"from\":\"$PHONE\",\"at\":\"$(date -u -d '+13 hours' +%FT%TZ)\"}"
echo "   Expect status \"blocked\" above, and no WhatsApp on your phone."
pause "Now send: התחל   to opt back in. Continue."
fi

step "5. Digest preview (clicks from step 1 should show)"
admin GET "$CLIENT/digest"
pause "Owner: send the word סיכום to get it on WhatsApp. Continue."

step "6. Per-client status"
admin GET health

admin POST "$CLIENT/test-reset" "{\"phone\":\"$PHONE\"}" >/dev/null
echo; echo "Done. If a step didn't arrive: docker compose logs --tail=50 engine"
