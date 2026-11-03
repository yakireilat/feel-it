# Competitive review (November 2026)

Based on web research; many sources are vendor or competitor blogs, so prices are indicative.

## Landscape

| | What they offer | Price (as reported) | Takeaway |
|---|---|---|---|
| **Podium** (US) | Missed-call text-back, reviews, webchat, shared inbox, payments, "AI Employee" answering leads 24/7 | ~$399–599/mo, AI Employee and phone priced separately | The benchmark, but SMS-first, English, expensive |
| **Birdeye** (US) | AI drafts review replies, a person approves; review requests across 200+ sites | Sales-only pricing; users complain about cost and confusing pricing | Same human-in-the-loop model as ours. Published ₪ pricing is an edge |
| **Standalone text-back** (BeepBack, etc.) | Missed-call text-back only | $20–100/mo | Commodity on its own: sell the bundle and the results |
| **Gambot / Automatix** (Israel) | WhatsApp bot platforms | ₪179/mo self-serve / from ₪500/mo managed | Direct local competition; post-pilot pricing should land around ₪200–500/mo |
| **Booking apps** (e.g. Timing) | Online booking + WhatsApp reminders | — | Don't build reminders; integrate and take visit data from them |
| **Hebrew AI receptionists** | AI answers calls in Hebrew | ₪29–179/mo | Crowded and cheap: partner or resell, don't build |

**Our edge:** WhatsApp-first, Hebrew, Shabbat-aware, local, transparent pricing, a monitored service with a human team.

## Risks and what we did

| Risk | Status |
|---|---|
| Israeli anti-spam law (Amendment 40): advertising needs explicit consent, up to ₪1,000 per message | Opt-out (`הסר`/`stop`) enforced on every customer message. Win-back offers will need opt-in. Confirm details with a lawyer |
| Google bans asking only happy customers for reviews | Review requests go to every customer; never add a filter |
| WhatsApp per-message pricing (since July 2025); templates needed for business-initiated messages | Removed the unverified "tens of shekels" claim from the page; owner pings via template; check Meta's Israeli rate card before quoting |
| Failed sends were dropped | Retries with backoff for temporary failures |
| Owner updates outside WhatsApp's 24h window would fail | Owner gets one template ping; updates delivered on reply |

## What we built from this review

- Engine: incoming WhatsApp webhook (opt-out, owner approvals with `1`, customer replies forwarded to the owner), retries, tracked booking links and "recovered customers (₪)" in the digest, Google Business Profile review polling and reply posting, Shabbat hold for missed-call replies, batch visit import.
- Landing page: live demo section, "Why Feel It", FAQ, accessibility statement and skip link, optional city, team cards, privacy-friendly analytics with conversion events.

## Sources

- [Quo: missed call text back software](https://www.quo.com/blog/missed-call-text-back-software/)
- [Carly: Podium AI Employee pricing](https://www.usecarly.com/blog/podium-ai/)
- [Prospeo: Podium pricing](https://prospeo.io/s/podium-pricing-reviews-pros-and-cons)
- [Software Advice: Birdeye](https://www.softwareadvice.com/reputation-management/birdeye-profile/)
- [GetApp: Birdeye reviews](https://www.getapp.com/marketing-software/a/birdeye/reviews/)
- [Achiya Automation: Israeli WhatsApp bot providers 2026](https://achiya-automation.com/en/blog/whatsapp-bot-providers-israel-2026/)
- [Achiya Automation: AI phone answering in Israel](https://achiya-automation.com/en/blog/ai-phone-answering-israel/)
- [G2: Timing](https://www.g2.com/products/timing-timing/reviews)
- [Meta: WhatsApp Business Platform pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- [Protocol: Israeli spam law](https://protocol.co.il/spam-law/)
- [ReviewTrackers: is review gating allowed on Google](https://www.reviewtrackers.com/review-gating-google/)
