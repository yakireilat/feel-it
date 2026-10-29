# Local Business Tech & AI Services: Plan Notes

## The idea
A small team of friends strong in tech and AI offering services to local businesses:

- New, rebuilt, or cheaper websites and service apps (food places, barbershops, etc.)
- Automations, client support, CRM, analytics
- Everything built and supported with AI agents, hosted on VPS/cloud (e.g. AWS)
- Plan: first deals free (client covers costs only) for portfolio, then charge for support and scale beyond our city

## Strategy decisions & key advice

### Free pilots: make them count
- Take only 2–3 portfolio clients; agree in writing on scope, end date, and post-pilot price before starting
- Collect proof: a before/after metric (bookings, no-shows, reply time), a testimonial, and permission to showcase
- Pick well-known local businesses; they bring referrals
- Make clear who pays hosting and AI API costs during the free phase

### Be flexible, but sell focused
- AI makes building cheap for everyone, so speed is a cost advantage, not a selling point. Clients pay for trust, results, and reliable support.
- Build general, sell specific: a reusable internal engine (components, agent workflows, templates), sold as clear packages per vertical
- One engine, many storefronts: reuse ~80% of the stack across barbers, restaurants, clinics, gyms

### Better entry point: add-ons for businesses that already have a website
- No need to replace anything, value shows up within days
- Integrate with what they already use: POS, booking apps, WhatsApp Business, Google Sheets, invoicing apps
- Start each client with an observation session (~1 hour) to find repetitive pain points

### Running AI-powered support at scale
- Monitoring is the product: health checks and alerts across all clients from day one
- Always keep a human escalation path
- Version and test agent workflows like code; one bad change hits every client
- Data security and privacy are the biggest risk and a real edge if done well (isolate each client's data)

### Hosting & infrastructure
- Static sites and landing pages on free or cheap hosting (Cloudflare Pages, Vercel); VPS only for backends, agents, databases
- Set AWS billing alerts on day one; compare cheaper VPS providers (e.g. Hetzner) for always-on servers
- Infrastructure-as-code (Terraform / Docker Compose) so every client deploys with one command
- Domains registered in the client's name, regular backups, clean handover if a client leaves

## Service ideas

### Vertical examples
- **Swimming / sports clubs:** member CRM, class and lane booking, payment and renewal reminders, WhatsApp FAQ bot
- **Pizza places:** online ordering that adapts to kitchen load (longer wait estimates or throttling when busy, promos when quiet); needs real-time data from their POS
- **Coffee shops:** QR table ordering; differentiate with lower price, local support, loyalty, regulars' favorites, WhatsApp receipts

### Universal quick wins
- **Missed call to WhatsApp:** auto-message with booking link, menu, or bot when a call is missed
- **Review engine:** automatic Google review requests and AI-drafted replies
- **Customer win-back:** detect lapsed regulars, send personal WhatsApp offers

### Bigger differentiators
- Hebrew AI phone receptionist: answers calls, books appointments, handles FAQs
- Owner's daily digest on WhatsApp: sales, bookings, reviews, anomalies
- Social media autopilot: owner sends a photo, AI writes and schedules the post
- Back-office automation: supplier reorders, shift scheduling, automatic invoicing

## Suggested starter bundle
Missed call to WhatsApp + review engine + daily digest: cheap to build, works in any vertical, shows value in week one.
**This is what `engine/` implements, and what `landing/` pitches.**

## Growth & business model
- Test demand before building: landing page per idea, show to ~10 owners, build only what they'd pay for
- Productize: turn a proven module into self-serve software so growth doesn't depend on our hours
- Distribution partners: accountants, POS resellers, business associations
- Recurring monthly fees (support, hosting, monitoring) are the core revenue

## Practical checklist
- [ ] Decide who on the team handles sales and talking to owners
- [ ] Register a business (osek patur to start), use a simple contract per client
- [ ] Comply with Israeli privacy law (CRMs and bots hold customer data)
- [ ] Check what approvals military service requires for outside work
- [ ] Pick pilot #1 based on easiest access (family, friends, regular spots)
