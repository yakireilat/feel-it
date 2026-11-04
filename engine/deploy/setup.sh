#!/usr/bin/env bash
# One-command server setup for a fresh Ubuntu/Debian VPS (run as root):
#
#   curl -fsSL https://raw.githubusercontent.com/yakireilat/feel-it/main/engine/deploy/setup.sh | bash -s -- engine.example.co.il
#
# Installs Docker, opens the firewall, clones the repo, generates secrets in .env, and starts the engine behind HTTPS.
# Safe to re-run: existing secrets in .env are kept, and the code is updated to the latest of BRANCH.
set -euo pipefail

DOMAIN=${1:-${DOMAIN:-}}
BRANCH=${BRANCH:-main}
DIR=${DIR:-/opt/feel-it}
if [ -z "$DOMAIN" ]; then echo "usage: setup.sh <domain>   (point the domain's DNS A record at this server first)"; exit 1; fi

echo "==> Docker"
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

echo "==> Firewall (SSH, HTTP, HTTPS)"
if command -v ufw >/dev/null; then ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw --force enable >/dev/null; fi

echo "==> Code ($BRANCH)"
if [ -d "$DIR/.git" ]; then git -C "$DIR" fetch -q origin "$BRANCH" && git -C "$DIR" checkout -q "$BRANCH" && git -C "$DIR" reset -q --hard "origin/$BRANCH"
else git clone -q --branch "$BRANCH" https://github.com/yakireilat/feel-it "$DIR"; fi
cd "$DIR/engine"

echo "==> Secrets (.env)"
[ -f .env ] || cp .env.example .env
rand() { openssl rand -hex 24; }
# Set KEY=VALUE only if the key is missing, empty or still the example placeholder.
setdefault() {
  local key=$1 value=$2 current
  current=$(grep -E "^$key=" .env | head -1 | cut -d= -f2- || true)
  if [ -z "$current" ] || [[ "$current" == change-me* ]] || [[ "$current" == pick-any* ]]; then
    if grep -qE "^$key=" .env; then sed -i "s|^$key=.*|$key=$value|" .env; else echo "$key=$value" >> .env; fi
  fi
}
setdefault DOMAIN "$DOMAIN"
setdefault PUBLIC_URL "https://$DOMAIN"
setdefault ADMIN_TOKEN "$(rand)"
setdefault WHATSAPP_VERIFY_TOKEN "$(rand)"
for env in $(grep -ho '"webhookSecretEnv": *"[A-Z0-9_]*"' clients/*.json | sed 's/.*"\([A-Z0-9_]*\)"$/\1/'); do
  setdefault "$env" "$(rand)"
done
chmod 600 .env

echo "==> Start"
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build

echo "==> Waiting for https://$DOMAIN/health (certificate can take a minute)"
for _ in $(seq 60); do curl -sf "https://$DOMAIN/health" >/dev/null && break; sleep 3; done
if curl -sf "https://$DOMAIN/health"; then echo; echo "Engine is live."; else
  echo "Not reachable yet. Check DNS for $DOMAIN, then: docker compose logs caddy engine"; fi

cat <<NEXT

Next steps:
  1. Fill in WhatsApp (and optionally ANTHROPIC_API_KEY) in $DIR/engine/.env, then re-run this script.
  2. Meta webhook:  URL https://$DOMAIN/webhooks/whatsapp   verify token: $(grep '^WHATSAPP_VERIFY_TOKEN=' .env | cut -d= -f2)
  3. Live test:     cd $DIR/engine && ./scripts/test-live.sh <your phone>
NEXT
