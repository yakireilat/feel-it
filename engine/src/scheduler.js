import { processOutbox } from './modules/reviews.js';
import { digestDue, runDigest } from './modules/digest.js';
import { processMessages } from './modules/outbox.js';
import { pollGoogleReviews } from './modules/googleReviews.js';
import { DAY } from './util.js';

// One pass over all clients. Each client is isolated: one failing never blocks the others.
export async function tick(ctx) {
  for (const client of ctx.clients.values()) {
    try {
      await processMessages(ctx, client);
      await processOutbox(ctx, client);
      await pollGoogleReviews(ctx, client).catch((err) => ctx.recordError(client, 'google_poll', err));
      if (digestDue(client, ctx.store.getState(client.id), ctx.now())) await runDigest(ctx, client);
    } catch (err) {
      await ctx.recordError(client, 'scheduler', err);
    }
  }
}

export function purgeOld(ctx, retentionDays = Number(process.env.RETENTION_DAYS || 180)) {
  for (const client of ctx.clients.values()) ctx.store.purge(client.id, ctx.now() - retentionDays * DAY);
}
