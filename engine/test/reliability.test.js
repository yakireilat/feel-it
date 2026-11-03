import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleMissedCall } from '../src/modules/missedCall.js';
import { computeDigest } from '../src/modules/digest.js';
import { pollGoogleReviews } from '../src/modules/googleReviews.js';
import { handleVisit } from '../src/modules/reviews.js';
import { tick } from '../src/scheduler.js';
import { HOUR } from '../src/util.js';
import { SATURDAY_NOON, demoClient, setup } from './helpers.js';

test('temporary WhatsApp failures are retried until they go through', async () => {
  const { ctx, client, clock, whatsapp, sent } = setup({ failSend: 500 });
  whatsapp.failLimit = 2;
  assert.equal((await handleMissedCall(ctx, client, { from: '0501234567' })).status, 'queued');
  clock.now += 60_000; await tick(ctx); // retry 1 fails, re-queued for +5 min
  assert.equal(sent.length, 0);
  clock.now += 5 * 60_000; await tick(ctx); // retry 2 succeeds
  assert.equal(sent.length, 1);
  assert.equal(ctx.store.getState(client.id).outbox.length, 0);
});

test('retries stop after the last backoff step', async () => {
  const { ctx, client, clock, sent } = setup({ failSend: 503 });
  await handleMissedCall(ctx, client, { from: '0501234567' });
  for (const minutes of [1, 5, 15, 60, 60]) { clock.now += minutes * 60_000; await tick(ctx); }
  assert.equal(sent.length, 0);
  assert.equal(ctx.store.getState(client.id).outbox.length, 0);
});

test('permanent failures (4xx) are not retried', async () => {
  const { ctx, client } = setup({ failSend: 400 });
  assert.equal((await handleMissedCall(ctx, client, { from: '0501234567' })).status, 'failed');
  assert.equal(ctx.store.getState(client.id).outbox?.length ?? 0, 0);
});

test('missed-call replies can wait until Shabbat ends', async () => {
  const window = { sun: ['08:00', '22:00'], mon: ['08:00', '22:00'], tue: ['08:00', '22:00'], wed: ['08:00', '22:00'],
    thu: ['08:00', '22:00'], fri: ['08:00', '15:00'], sat: ['18:30', '23:00'] };
  const client = demoClient({ missedCall: { ...demoClient().missedCall, sendWindow: window } });
  const { ctx, clock, sent } = setup({ client, at: SATURDAY_NOON });
  assert.equal((await handleMissedCall(ctx, client, { from: '0501234567' })).status, 'deferred');
  await tick(ctx);
  assert.equal(sent.length, 0);
  clock.now += 6 * HOUR + 30 * 60_000; // 18:30 Saturday
  await tick(ctx);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /מחוץ לשעות הפעילות/);
});

test('digest credits customers who came back after a missed call', () => {
  const { ctx, client, clock } = setup();
  ctx.store.append(client.id, 'missed_call', { from: '972501234567', messaged: true }, clock.now - 2 * HOUR);
  ctx.store.append(client.id, 'booking_click', { phone: '972501234567' }, clock.now - HOUR);
  handleVisit(ctx, client, { phone: '0501234567' });
  handleVisit(ctx, client, { phone: '0529999999' });
  const d = computeDigest(ctx, client);
  assert.equal(d.bookingClicks, 1);
  assert.equal(d.recovered, 1);
  assert.equal(d.recoveredValue, 80);
});

test('Google poll seeds existing reviews, then handles only new ones', async () => {
  let reviews = [{ reviewId: 'old', author: 'A', rating: 5, text: 'ok', replied: false }];
  const google = { listReviews: async () => reviews, replyToReview: async () => {} };
  const client = demoClient({ google: { accountId: 'a', locationId: 'l', refreshTokenEnv: 'X' } });
  const { ctx, clock, sent } = setup({ client, google });
  assert.equal(await pollGoogleReviews(ctx, client), 0);
  reviews = [{ reviewId: 'new', author: 'B', rating: 2, text: 'meh', replied: false }, ...reviews];
  clock.now += 5 * 60_000;
  assert.equal(await pollGoogleReviews(ctx, client), 0); // polled too recently
  clock.now += 15 * 60_000;
  assert.equal(await pollGoogleReviews(ctx, client), 1);
  assert.match(sent.at(-1).text, /ביקורת חדשה \(2\/5\) מאת B/);
});
