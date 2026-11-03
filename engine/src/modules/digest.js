import { DAY, localParts } from '../util.js';

// Evening WhatsApp summary for the owner: what our automations did today and anything unusual.
export function computeDigest(ctx, client, now = ctx.now()) {
  const day = (at) => localParts(new Date(at), client.timezone).date;
  const today = day(now);
  const events = ctx.store.events(client.id, now - 8 * DAY);
  const todays = events.filter((e) => day(e.at) === today);
  const count = (type, pred = () => true) => todays.filter((e) => e.type === type && pred(e)).length;

  const reviews = todays.filter((e) => e.type === 'review_received');
  const d = {
    date: today,
    missedCalls: count('missed_call'),
    missedCallsMessaged: count('missed_call', (e) => e.messaged),
    visits: count('visit'),
    reviewRequestsSent: count('review_request_sent'),
    reviewsReceived: reviews.length,
    avgRating: reviews.length ? Math.round((reviews.reduce((s, e) => s + e.rating, 0) / reviews.length) * 10) / 10 : null,
    lowReviews: reviews.filter((e) => e.urgent).length,
    bookingClicks: count('booking_click'),
    recovered: 0,
    recoveredValue: null,
    customerMessages: count('inbound'),
    optOuts: count('opt_out'),
    errors: count('error'),
    anomalies: [],
  };

  // A visit today from someone who called and got our WhatsApp in the past week counts as a recovered customer.
  const messagedCallers = new Set(events
    .filter((e) => e.type === 'missed_call' && e.messaged && e.from && e.at >= now - 7 * DAY)
    .map((e) => e.from));
  d.recovered = new Set(todays.filter((e) => e.type === 'visit' && messagedCallers.has(e.phone)).map((e) => e.phone)).size;
  if (client.avgTicket && d.recovered) d.recoveredValue = d.recovered * client.avgTicket;

  const previousMissed = events.filter((e) => e.type === 'missed_call' && day(e.at) !== today && e.at >= now - 7 * DAY).length;
  const avgMissed = previousMissed / 7;
  if (d.missedCalls >= 3 && d.missedCalls > 2 * avgMissed) {
    d.anomalies.push(`היום היו ${d.missedCalls} שיחות שלא נענו – יותר מפי 2 מהממוצע (${avgMissed.toFixed(1)} ביום). אולי חסר מישהו על הטלפון?`);
  }
  if (d.lowReviews) d.anomalies.push(`${d.lowReviews} ביקורות נמוכות היום – שלחנו לך הצעות תגובה.`);
  if (d.errors) d.anomalies.push('הייתה תקלה טכנית במערכת – הצוות שלנו כבר מטפל.');
  return d;
}

export function formatDigest(client, d) {
  const lines = [
    `📊 סיכום יומי – ${client.name} (${d.date})`,
    '',
    `📞 שיחות שלא נענו: ${d.missedCalls} (קיבלו וואטסאפ אוטומטי: ${d.missedCallsMessaged})`,
    `🧾 ביקורים שנרשמו: ${d.visits}`,
    `🔗 לחצו על קישור קביעת התור: ${d.bookingClicks}`,
    `🙏 בקשות דירוג שנשלחו: ${d.reviewRequestsSent}`,
    `⭐ ביקורות חדשות: ${d.reviewsReceived}${d.avgRating != null ? ` (ממוצע ${d.avgRating})` : ''}`,
  ];
  if (d.recovered) {
    lines.push(`💰 לקוחות שחזרו אחרי שיחה שלא נענתה: ${d.recovered}${d.recoveredValue ? ` (כ-₪${d.recoveredValue.toLocaleString('he-IL')})` : ''}`);
  }
  if (d.customerMessages) lines.push(`💬 הודעות מלקוחות שהועברו אליך: ${d.customerMessages}`);
  if (d.optOuts) lines.push(`🚫 ביקשו להסיר אותם מההודעות: ${d.optOuts}`);
  if (d.anomalies.length) lines.push('', '👀 שים/י לב:', ...d.anomalies.map((a) => `• ${a}`));
  return lines.join('\n');
}

export function digestDue(client, state, now) {
  if (!client.digest?.enabled) return false;
  const parts = localParts(new Date(now), client.timezone);
  return parts.hhmm >= (client.digest.time || '21:00') && state.lastDigestDate !== parts.date;
}

export async function runDigest(ctx, client, { markDone = true } = {}) {
  const d = computeDigest(ctx, client);
  const text = formatDigest(client, d);
  const sent = (await ctx.send(client, 'digest', { to: client.ownerPhone, text })) !== 'failed';
  // Mark the day done even on failure so a broken number doesn't trigger a retry every minute; ops is alerted.
  if (markDone) ctx.store.updateState(client.id, (s) => ({ ...s, lastDigestDate: d.date }));
  if (sent) ctx.store.append(client.id, 'digest_sent', {}, ctx.now());
  return { sent, text, digest: d };
}
