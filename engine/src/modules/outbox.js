import { isWithin, localParts } from '../util.js';

// Optional per-module send windows (e.g. hold missed-call replies during Shabbat until it ends).
const windowFor = (client, name) => (name === 'missedCall' ? client.missedCall?.sendWindow : null);

// Sends queued messages that are due: retries after temporary failures, and messages held for a send window.
export async function processMessages(ctx, client) {
  const now = ctx.now();
  const parts = localParts(new Date(now), client.timezone);
  const due = (ctx.store.getState(client.id).outbox ?? []).filter((i) =>
    i.kind === 'message' && i.sendAt <= now && (!i.window || isWithin(windowFor(client, i.window), parts)));

  let sent = 0;
  for (const item of due) {
    // Remove first: a failed attempt re-queues itself as a new item with a higher attempt count.
    ctx.store.updateState(client.id, (s) => ({ ...s, outbox: s.outbox.filter((i) => i.id !== item.id) }));
    if ((await ctx.send(client, item.where, item.message, { attempts: item.attempts })) === 'sent') {
      ctx.store.append(client.id, 'queued_message_sent', { where: item.where, to: item.message.to }, now);
      sent++;
    }
  }
  return sent;
}
