import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDigest, digestDue, formatDigest, runDigest } from '../src/modules/digest.js';
import { tick } from '../src/scheduler.js';
import { DAY, HOUR } from '../src/util.js';
import { setup } from './helpers.js';

test('counts today and flags a missed-call spike', () => {
  const { ctx, client, clock } = setup();
  const s = ctx.store;
  s.append(client.id, 'missed_call', { messaged: true }, clock.now - 3 * DAY); // one in the last week
  for (let i = 0; i < 4; i++) s.append(client.id, 'missed_call', { messaged: i < 3 }, clock.now - i * 60_000);
  s.append(client.id, 'review_received', { rating: 5, urgent: false }, clock.now);
  s.append(client.id, 'review_received', { rating: 2, urgent: true }, clock.now);

  const d = computeDigest(ctx, client);
  assert.equal(d.missedCalls, 4);
  assert.equal(d.missedCallsMessaged, 3);
  assert.equal(d.avgRating, 3.5);
  assert.equal(d.anomalies.length, 2);
  assert.match(formatDigest(client, d), /שיחות שלא נענו: 4/);
});

test('digest is due once per evening', () => {
  const { client, clock } = setup();
  assert.equal(digestDue(client, {}, clock.now), false); // 12:00
  const evening = clock.now + 9 * HOUR + 30 * 60_000; // 21:30
  assert.equal(digestDue(client, {}, evening), true);
  assert.equal(digestDue(client, { lastDigestDate: '2026-11-01' }, evening), false);
});

test('scheduler sends the digest to the owner', async () => {
  const { ctx, client, clock, sent } = setup();
  clock.now += 9 * HOUR + 5 * 60_000;
  await tick(ctx);
  await tick(ctx);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, client.ownerPhone);
  assert.match(sent[0].text, /סיכום יומי/);
});

test('failed digest is not retried every minute', async () => {
  const { ctx, client } = setup({ failSend: true });
  assert.equal((await runDigest(ctx, client)).sent, false);
  assert.equal(ctx.store.getState(client.id).lastDigestDate, '2026-11-01');
});
