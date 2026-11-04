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
    missedCall.js     text the caller on WhatsApp (open/closed text, cooldown, optional Shabbat hold, tracked link)
    reviews.js        review requests after visits (delay, send window, no Shabbat), AI reply drafts, owner approval
    googleReviews.js  poll Google Business Profile for new reviews
    inbound.js        incoming WhatsApp: opt-out/opt-in, owner commands, customer replies forwarded to the owner
    outbox.js         retries after temporary failures, messages held for a send window
    digest.js         evening summary: missed calls, clicks, recovered customers (₪), reviews, anomalies
  whatsapp.js         WhatsApp Cloud API (dry-run when no token)
  google.js           Google Business Profile API client
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

Other routes:

| Endpoint | Purpose |
|---|---|
| `GET/POST /webhooks/whatsapp` | Meta webhook for incoming messages (verified with `WHATSAPP_VERIFY_TOKEN`, signed with `WHATSAPP_APP_SECRET`) |
| `GET /r/:client/:token` | Tracked booking link from a missed-call message; counts the click (ignoring link-preview bots) and redirects |

`POST /hooks/:client/visit` also accepts `{ "visits": [ ... ] }`, so a day's appointments can be sent in one batch from a booking app export, Google Sheets, or Make/Zapier.

### WhatsApp commands

| Who | Sends | What happens |
|---|---|---|
| Customer | `הסר` / `stop` | Opted out of every automated message for that business, with a confirmation; `התחל` opts back in |
| Customer | anything else | Forwarded to the owner with a one-tap `wa.me` link to answer personally |
| Owner | `1` | Posts the latest AI-drafted review reply to Google (or returns it to post manually if Google isn't connected) |
| Owner | `תגובה: <text>` | Posts the owner's own wording instead |
| Owner | `סיכום` | Sends today's digest now |

Admin (Bearer `ADMIN_TOKEN`): `GET /admin/health` (per-client events, errors, outbox), `GET /admin/:client/digest` (preview), `POST /admin/:client/digest` (send now). `GET /health` is public and returns only `ok`.

### Onboarding a client

1. Copy `clients/demo-barber.json` → `clients/<id>.json`, then fill in hours, booking link, Google review link, and owner phone.
2. Add `SECRET_<ID>` to `.env` and point their phone/booking systems at the webhooks.
3. Optional per client: `whatsappPhoneNumberId` (the client's own WhatsApp number, also used to route incoming messages), `avgTicket` (₪ per visit, shows the value of recovered customers in the digest), `missedCall.sendWindow` (e.g. hold replies during Shabbat until it ends), and `google` (`accountId`, `locationId`, `refreshTokenEnv`) to fetch reviews and post approved replies.
4. **WhatsApp templates:** a missed-call caller and a review request are business-initiated messages, so the live WhatsApp API needs **approved templates** for them. Create them in Meta Business Manager, then set `missedCall.templateOpen` / `templateClosed` / `reviews.template` (`{ "name": "...", "language": "he" }`) in the client file. Free text, which is the default, only works in dry-run or inside the 24h reply window.
   The owner needs one more template, `ownerTemplate` (one parameter: the business name, e.g. "יש לך עדכונים חדשים מ-{{1}}. השיבו להודעה כדי לקבל אותם."). When the owner hasn't written in 24h, updates wait and the owner gets that single ping; their reply delivers everything waiting.
5. Run in dry-run for a day and check `/admin/health` before going live.

### Design notes (from the plan)

- **Monitoring is the product:** every failure is stored per client and pinged to `OPS_PHONE` (at most once an hour per issue).
- **Human in the loop:** AI only *drafts* review replies. The owner approves and posts them.
- **Privacy:** data is kept per client, events are purged after `RETENTION_DAYS` (default 180), secrets are kept only in env, and client ids can't be probed via webhooks.
- **Opt-out is enforced in one place:** every message to a customer goes through `ctx.send`, which drops it for anyone who opted out (Israeli anti-spam law). Review requests go to every customer, never only happy ones (Google bans "review gating").
- **Reliability:** temporary WhatsApp failures (5xx, 429, network) retry after 1, 5, 15 and 60 minutes; permanent ones (4xx) are recorded and alerted.
- **Next steps:** SQLite once volumes grow, customer win-back module (needs explicit opt-in: it's advertising), direct booking-app integrations.

See [docs/competitive-review.md](docs/competitive-review.md) for how this compares to Podium, Birdeye and Israeli alternatives.

## Landing page settings

At the top of the script in `landing/index.html`: `TEAM_WHATSAPP` (lead form), `DEMO_PHONE` (live demo section, hidden until set; connect that number to the `feel-it-demo` client), `CITY`, `TEAM` (team cards), and `PLAUSIBLE_DOMAIN` (analytics with events for CTA clicks, demo calls and lead submits). Fill in the accessibility coordinator's details in `landing/accessibility.html`.
