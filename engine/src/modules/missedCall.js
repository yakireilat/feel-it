import { randomBytes } from 'node:crypto';
import { DAY, HOUR, isWithin, localParts, normalizePhone, render } from '../util.js';

const DEFAULTS = {
  messageOpen: 'היי, כאן {business} 👋\nראינו שהתקשרת ולא הספקנו לענות 🙏\nאפשר לקבוע תור כאן: {link}\nאו פשוט לכתוב לנו פה ונחזור אליך בהקדם.',
  messageClosed: 'היי, כאן {business} 👋\nהתקשרת מחוץ לשעות הפעילות.\nאפשר לקבוע תור כאן: {link}\nאו להשאיר הודעה כאן ונחזור אליך כשנפתח.',
  cooldownHours: 12,
};

// With PUBLIC_URL set, each caller gets a short tracked link, so the digest can show who went on to book.
function bookingLink(ctx, client, phone, when, url) {
  if (!ctx.publicUrl) return url;
  const token = randomBytes(6).toString('base64url');
  ctx.store.updateState(client.id, (s) => {
    const links = Object.fromEntries(Object.entries(s.links ?? {}).filter(([, l]) => when - l.at < 30 * DAY));
    return { ...s, links: { ...links, [token]: { phone, at: when, url } } };
  });
  return `${ctx.publicUrl}/r/${client.id}/${token}`;
}

// A call went unanswered: text the caller on WhatsApp so the lead isn't lost.
export async function handleMissedCall(ctx, client, { from, at }) {
  const cfg = { ...DEFAULTS, ...client.missedCall };
  if (!cfg.enabled) return { status: 'disabled' };

  const when = Number.isFinite(Date.parse(at)) ? Date.parse(at) : ctx.now();
  const phone = normalizePhone(from);
  const record = (fields) => ctx.store.append(client.id, 'missed_call', { from: phone, ...fields }, when);
  if (!phone) {
    record({ messaged: false, reason: 'hidden_or_invalid_number' });
    return { status: 'skipped', reason: 'hidden_or_invalid_number' };
  }

  // Someone who calls three times in a row should get one message, not three.
  const last = ctx.store.getState(client.id).missedCallSentAt?.[phone];
  if (last && when - last < cfg.cooldownHours * HOUR) {
    record({ messaged: false, reason: 'cooldown' });
    return { status: 'skipped', reason: 'cooldown' };
  }

  const parts = localParts(new Date(when), client.timezone);
  const open = isWithin(client.businessHours, parts);
  const link = bookingLink(ctx, client, phone, when, cfg.bookingUrl);
  const template = open ? cfg.templateOpen : cfg.templateClosed;
  const message = template
    ? { to: phone, template: { ...template, params: [client.name, link] } }
    : { to: phone, text: render(open ? cfg.messageOpen : cfg.messageClosed, { business: client.name, link }) };

  // Outside the optional send window (e.g. Shabbat), hold the reply until the window opens.
  let status;
  if (cfg.sendWindow && !isWithin(cfg.sendWindow, parts)) {
    ctx.enqueue(client, { where: 'missed_call', message, window: 'missedCall' });
    status = 'deferred';
  } else {
    status = await ctx.send(client, 'missed_call', message);
  }

  const messaged = status === 'sent' || status === 'queued' || status === 'deferred';
  if (messaged) {
    ctx.store.updateState(client.id, (s) => ({ ...s, missedCallSentAt: { ...s.missedCallSentAt, [phone]: when } }));
  }
  record({ messaged, open, status });
  return { status: status === 'sent' ? 'messaged' : status, open };
}
