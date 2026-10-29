import { DAY, isWithin, localParts, normalizePhone, render } from '../util.js';

const DEFAULTS = {
  delayMinutes: 90,
  cooldownDays: 60,
  alertBelowRating: 3,
  // Don't text customers late at night or on Shabbat; requests wait in the outbox until the window opens.
  sendWindow: {
    sun: ['09:30', '20:30'], mon: ['09:30', '20:30'], tue: ['09:30', '20:30'],
    wed: ['09:30', '20:30'], thu: ['09:30', '20:30'], fri: ['09:30', '13:00'], sat: null,
  },
  requestMessage: 'היי {name}, כאן {business} – תודה שביקרת אצלנו! 🙏\nאם נהנית, נשמח מאוד לדירוג קצר בגוגל – זה עוזר לנו המון:\n{link}',
};

const config = (client) => ({ ...DEFAULTS, ...client.reviews });

// After a visit (from the booking system, POS, or a Google Sheet row), queue a review request.
export function handleVisit(ctx, client, { phone, name, at }) {
  const cfg = config(client);
  if (!cfg.enabled) return { status: 'disabled' };
  const to = normalizePhone(phone);
  if (!to) return { status: 'skipped', reason: 'invalid_number' };

  const when = Number.isFinite(Date.parse(at)) ? Date.parse(at) : ctx.now();
  ctx.store.append(client.id, 'visit', { phone: to }, when);

  const state = ctx.store.getState(client.id);
  const lastAsked = state.reviewAskedAt?.[to];
  if (lastAsked && when - lastAsked < cfg.cooldownDays * DAY) return { status: 'skipped', reason: 'asked_recently' };
  if (state.outbox?.some((item) => item.kind === 'review_request' && item.phone === to)) {
    return { status: 'skipped', reason: 'already_queued' };
  }

  const item = { kind: 'review_request', phone: to, name: name?.split(' ')[0] || '', sendAt: when + cfg.delayMinutes * 60_000 };
  ctx.store.updateState(client.id, (s) => ({ ...s, outbox: [...(s.outbox ?? []), item] }));
  return { status: 'queued', sendAt: new Date(item.sendAt).toISOString() };
}

// Called every minute by the scheduler.
export async function processOutbox(ctx, client) {
  const cfg = config(client);
  const now = ctx.now();
  const due = (ctx.store.getState(client.id).outbox ?? []).filter((i) => i.sendAt <= now);
  if (!due.length || !isWithin(cfg.sendWindow, localParts(new Date(now), client.timezone))) return 0;

  let sentCount = 0;
  for (const item of due) {
    const vars = { name: item.name || '', business: client.name, link: cfg.googleReviewUrl };
    const text = render(cfg.requestMessage, vars).replace('היי ,', 'היי,');
    const sent = await ctx.send(client, 'review_request', cfg.template
      ? { to: item.phone, template: { ...cfg.template, params: [item.name || '', client.name, cfg.googleReviewUrl] } }
      : { to: item.phone, text });
    // Failed sends are dropped rather than retried forever; the error is already recorded and alerted.
    ctx.store.updateState(client.id, (s) => ({
      ...s,
      outbox: (s.outbox ?? []).filter((i) => !(i.kind === item.kind && i.phone === item.phone)),
      reviewAskedAt: sent ? { ...s.reviewAskedAt, [item.phone]: now } : s.reviewAskedAt,
    }));
    if (sent) {
      ctx.store.append(client.id, 'review_request_sent', { phone: item.phone }, now);
      sentCount++;
    }
  }
  return sentCount;
}

function fallbackDraft(review) {
  const name = review.author?.split(' ')[0] || '';
  return review.rating >= 4
    ? `תודה רבה${name ? ' ' + name : ''}! שמחים מאוד שנהנית, מחכים לראות אותך שוב 🙏`
    : `${name ? name + ', ' : ''}תודה על המשוב, ואנחנו מצטערים שהחוויה לא הייתה כמו שציפית. נשמח אם תיצור/י איתנו קשר ישירות כדי שנוכל לתקן.`;
}

// A new Google review arrived: draft a reply with AI and send it to the owner to approve and post.
export async function handleReview(ctx, client, review) {
  const cfg = config(client);
  const rating = Number(review.rating);
  if (!(rating >= 1 && rating <= 5)) return { status: 'skipped', reason: 'invalid_rating' };
  const r = { author: String(review.author ?? '').slice(0, 100), rating, text: String(review.text ?? '').slice(0, 4000) };

  let draft = null;
  let drafter = 'template';
  if (ctx.ai) {
    try {
      draft = await ctx.ai.draftReviewReply({ business: client, review: r });
      drafter = 'ai';
    } catch (err) {
      await ctx.recordError(client, 'review_draft', err);
    }
  }
  draft ??= fallbackDraft(r);

  const urgent = rating <= cfg.alertBelowRating;
  ctx.store.append(client.id, 'review_received', { rating, urgent, drafter, author: r.author, draft }, ctx.now());

  const header = urgent ? '⚠️ ביקורת נמוכה – כדאי לטפל היום\n' : '';
  const quoted = r.text ? `\n"${r.text}"\n` : '\n';
  const text = `${header}⭐ ביקורת חדשה (${rating}/5) מאת ${r.author || 'אנונימי'}:${quoted}\nהצעה לתגובה:\n${draft}`;
  const sent = await ctx.send(client, 'review_notify_owner', { to: client.ownerPhone, text });
  return { status: sent ? 'owner_notified' : 'failed', urgent, drafter, draft };
}
