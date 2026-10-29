import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleReview, handleVisit, processOutbox } from '../src/modules/reviews.js';
import { DAY, HOUR } from '../src/util.js';
import { setup } from './helpers.js';

test('review request goes out after the delay, once', async () => {
  const { ctx, client, clock, sent } = setup();
  assert.equal(handleVisit(ctx, client, { phone: '0521112222', name: 'Noa Levi' }).status, 'queued');
  assert.equal(handleVisit(ctx, client, { phone: '0521112222' }).reason, 'already_queued');

  assert.equal(await processOutbox(ctx, client), 0);
  clock.now += 91 * 60_000;
  assert.equal(await processOutbox(ctx, client), 1);
  assert.match(sent[0].text, /היי Noa,/);
  assert.match(sent[0].text, /g\.page/);

  clock.now += DAY;
  assert.equal(handleVisit(ctx, client, { phone: '0521112222' }).reason, 'asked_recently');
});

test('requests wait for the send window (no late-night texts)', async () => {
  const { ctx, client, clock, sent } = setup({ at: Date.parse('2026-11-01T18:00:00Z') }); // 20:00 local
  handleVisit(ctx, client, { phone: '0521112222', name: 'Noa' });
  clock.now += 2 * HOUR; // 22:00 local, due but outside the window
  assert.equal(await processOutbox(ctx, client), 0);
  clock.now += 12 * HOUR; // 10:00 next morning
  assert.equal(await processOutbox(ctx, client), 1);
  assert.equal(sent.length, 1);
});

test('low review alerts the owner with an AI draft', async () => {
  const calls = [];
  const ai = { draftReviewReply: async (args) => { calls.push(args); return 'Sorry Avi, please call us.'; } };
  const { ctx, client, sent } = setup({ ai });
  const result = await handleReview(ctx, client, { author: 'Avi Cohen', rating: 2, text: 'Waited 40 minutes.' });
  assert.equal(result.urgent, true);
  assert.equal(result.drafter, 'ai');
  assert.equal(calls[0].review.text, 'Waited 40 minutes.');
  assert.equal(sent[0].to, client.ownerPhone);
  assert.match(sent[0].text, /⚠️/);
  assert.match(sent[0].text, /Sorry Avi/);
});

test('falls back to a template draft when AI fails', async () => {
  const ai = { draftReviewReply: async () => { throw new Error('overloaded'); } };
  const { ctx, client, sent } = setup({ ai });
  const result = await handleReview(ctx, client, { author: 'Dana', rating: 5, text: 'Best haircut!' });
  assert.equal(result.drafter, 'template');
  assert.match(result.draft, /תודה רבה Dana/);
  assert.equal(sent.length, 1);
  assert.ok(ctx.store.events(client.id).some((e) => e.type === 'error' && e.where === 'review_draft'));
});

test('rejects invalid ratings', async () => {
  const { ctx, client } = setup();
  assert.equal((await handleReview(ctx, client, { rating: 9 })).status, 'skipped');
});
