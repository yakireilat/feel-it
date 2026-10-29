import { HOUR, isWithin, localParts, normalizePhone, render } from '../util.js';

const DEFAULTS = {
  messageOpen: 'היי, כאן {business} 👋\nראינו שהתקשרת ולא הספקנו לענות 🙏\nאפשר לקבוע תור כאן: {link}\nאו פשוט לכתוב לנו פה ונחזור אליך בהקדם.',
  messageClosed: 'היי, כאן {business} 👋\nהתקשרת מחוץ לשעות הפעילות.\nאפשר לקבוע תור כאן: {link}\nאו להשאיר הודעה כאן ונחזור אליך כשנפתח.',
  cooldownHours: 12,
};

// A call went unanswered: text the caller on WhatsApp so the lead isn't lost.
export async function handleMissedCall(ctx, client, { from, at }) {
  const cfg = { ...DEFAULTS, ...client.missedCall };
  if (!cfg.enabled) return { status: 'disabled' };

  const when = Number.isFinite(Date.parse(at)) ? Date.parse(at) : ctx.now();
  const phone = normalizePhone(from);
  if (!phone) {
    ctx.store.append(client.id, 'missed_call', { from: null, messaged: false, reason: 'hidden_or_invalid_number' }, when);
    return { status: 'skipped', reason: 'hidden_or_invalid_number' };
  }

  // Someone who calls three times in a row should get one message, not three.
  const last = ctx.store.getState(client.id).missedCallSentAt?.[phone];
  if (last && when - last < cfg.cooldownHours * HOUR) {
    ctx.store.append(client.id, 'missed_call', { from: phone, messaged: false, reason: 'cooldown' }, when);
    return { status: 'skipped', reason: 'cooldown' };
  }

  const open = isWithin(client.businessHours, localParts(new Date(when), client.timezone));
  const vars = { business: client.name, link: cfg.bookingUrl };
  const template = open ? cfg.templateOpen : cfg.templateClosed;
  const sent = await ctx.send(client, 'missed_call', template
    ? { to: phone, template: { ...template, params: [client.name, cfg.bookingUrl] } }
    : { to: phone, text: render(open ? cfg.messageOpen : cfg.messageClosed, vars) });

  if (sent) {
    ctx.store.updateState(client.id, (s) => ({ ...s, missedCallSentAt: { ...s.missedCallSentAt, [phone]: when } }));
  }
  ctx.store.append(client.id, 'missed_call', { from: phone, messaged: sent, open, reason: sent ? undefined : 'send_failed' }, when);
  return { status: sent ? 'messaged' : 'failed', open };
}
