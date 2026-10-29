# feel-it: Tech & AI services for local businesses

A small team offering local businesses (barbers, restaurants, cafes, clubs, clinics) add-on automations that plug into what they already use.
The full plan is in **[docs/plan.md](docs/plan.md)**.

This repo holds the first two pieces, built from the plan's **starter bundle**:

| Folder | What it is |
|---|---|
| [`engine/`](engine) | One reusable backend that serves many clients: **missed call → WhatsApp**, **review engine** (review requests + AI-drafted replies), and the **owner's daily digest** |
| [`landing/`](landing) | Hebrew landing page for testing demand with owners: pitches the bundle, includes a lost-revenue calculator, and sends leads to our WhatsApp |

## Engine

Node 22, a single dependency (`@anthropic-ai/sdk`). Each client is one JSON file in `engine/clients/`, and each client's data lives in its own folder.

```
engine/src/
  index.js            entry: HTTP server + minute scheduler
  server.js           webhooks, health, admin routes
  scheduler.js        outbox + digest per client, retention purge
  app.js              shared context: send helper, error recording, ops alerts
  modules/
    missedCall.js     text the caller on WhatsApp (open/closed text, per-caller cooldown)
    reviews.js        queue review requests after visits (delay, send window, no Shabbat), AI reply drafts to owner
    digest.js         evening summary + anomalies (missed-call spike, low reviews, errors)
  whatsapp.js         WhatsApp Cloud API (dry-run when no token)
  ai.js               Claude review-reply drafts (template fallback without a key)
  store.js            per-client file store
```

### Run it

```bash
cd engine && npm install && npm test
```

```bash
cp .env.example .env   # fill in secrets; leave WHATSAPP_TOKEN empty for dry-run
```

```bash
docker compose up -d --build
```

Local runs without Docker: `SECRET_DEMO_BARBER=dev ADMIN_TOKEN=dev npm start`.

### Webhooks

All need the client's secret: header `x-webhook-secret`, or `?key=` for providers that can't set headers.

| Endpoint | Body | Fed by |
|---|---|---|
| `POST /hooks/:client/missed-call` | `{ "from": "050...", "at"?: ISO }`, or Twilio form fields (`From`, `CallStatus`) | telephony provider's missed-call / status webhook |
| `POST /hooks/:client/visit` | `{ "phone", "name"?, "at"? }` | booking app, POS, Google Sheets/Zapier/Make |
| `POST /hooks/:client/review` | `{ "author", "rating", "text" }` | Google Business Profile notifications / poller |

Admin (Bearer `ADMIN_TOKEN`): `GET /admin/health` (per-client events, errors, outbox), `GET /admin/:client/digest` (preview), `POST /admin/:client/digest` (send now). `GET /health` is public and returns only `ok`.

### Onboarding a client

1. Copy `clients/demo-barber.json` → `clients/<id>.json`, then fill in hours, booking link, Google review link, and owner phone.
2. Add `SECRET_<ID>` to `.env` and point their phone/booking systems at the webhooks.
3. **WhatsApp templates:** a missed-call caller and a review request are business-initiated messages, so the live WhatsApp API needs **approved templates** for them. Create them in Meta Business Manager, then set `missedCall.templateOpen` / `templateClosed` / `reviews.template` (`{ "name": "...", "language": "he" }`) in the client file. Free text, which is the default, only works in dry-run or inside the 24h reply window.
4. Run in dry-run for a day and check `/admin/health` before going live.

### Design notes (from the plan)

- **Monitoring is the product:** every failure is stored per client and pinged to `OPS_PHONE` (at most once an hour per issue).
- **Human in the loop:** AI only *drafts* review replies. The owner approves and posts them.
- **Privacy:** data is kept per client, events are purged after `RETENTION_DAYS` (default 180), secrets are kept only in env, and client ids can't be probed via webhooks.
- **Next steps:** Google Business Profile API (auto-fetch and post replies), owner approval by WhatsApp reply, SQLite once volumes grow, customer win-back module.
