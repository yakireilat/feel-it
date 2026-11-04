import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleInbound } from '../src/modules/inbound.js';
import { handleMissedCall } from '../src/modules/missedCall.js';
import { handleReview, handleVisit, processOutbox } from '../src/modules/reviews.js';
import { HOUR, DAY } from '../src/util.js';
import { setup } from './helpers.js';

test('"הסר" opts a customer out of every automated message', async () => {
  const { ctx, client, clock, sent } = setup();
  assert.equal((await handleInbound(ctx, client, { from: '972501234567', text: 'הסר' })).status, 'opted_out');
  assert.match(sent.at(-1).text, /הוסרתם/);

  clock.now += DAY;
  assert.equal((await handleMissedCall(ctx, client, { from: '0501234567' })).status, 'blocked');
  handleVisit(ctx, client, { phone: '0501234567', name: 'Noa' });
  clock.now += 2 * HOUR;
  assert.equal(await processOutbox(ctx, client), 0);
  assert.equal(sent.length, 1);

  assert.equal((await handleInbound(ctx, client, { from: '972501234567', text: 'התחל' })).status, 'opted_in');
  clock.now += DAY;
  assert.equal((await handleMissedCall(ctx, client, { from: '0501234567' })).status, 'messaged');
});

test('customer replies are forwarded to the owner with a reply link', async () => {
  const { ctx, client, sent } = setup();
  await handleInbound(ctx, client, { from: '972501234567', text: 'אפשר תור למחר?' });
  assert.equal(sent[0].to, client.ownerPhone);
  assert.match(sent[0].text, /אפשר תור למחר/);
  assert.match(sent[0].text, /wa\.me\/972501234567/);
});

test('owner messages never count as customer messages', async () => {
  const { ctx, client, sent } = setup();
  assert.equal((await handleInbound(ctx, client, { from: client.ownerPhone, text: 'מה קורה' })).status, 'help');
  assert.match(sent[0].text, /פקודות זמינות/);
});

test('owner "1" posts the latest AI draft to Google', async () => {
  const posted = [];
  const google = { replyToReview: async (g, id, comment) => posted.push({ id, comment }) };
  const ai = { draftReviewReply: async () => 'Thanks Dana!' };
  const { ctx, client, sent } = setup({ client: { ...setup().client, google: { accountId: 'a', locationId: 'l', refreshTokenEnv: 'X' } }, ai, google });
  await handleReview(ctx, client, { author: 'Dana', rating: 5, text: 'Great', reviewId: 'r1' });
  assert.match(sent.at(-1).text, /השיבו 1/);

  assert.equal((await handleInbound(ctx, client, { from: client.ownerPhone, text: '1' })).status, 'posted');
  assert.deepEqual(posted, [{ id: 'r1', comment: 'Thanks Dana!' }]);
  assert.match(sent.at(-1).text, /פורסמה בגוגל/);
  assert.equal((await handleInbound(ctx, client, { from: client.ownerPhone, text: '1' })).status, 'none_pending');
});

test('owner can post their own wording', async () => {
  const posted = [];
  const google = { replyToReview: async (g, id, comment) => posted.push(comment) };
  const { ctx, client } = setup({ client: { ...setup().client, google: { accountId: 'a', locationId: 'l', refreshTokenEnv: 'X' } }, google });
  await handleReview(ctx, client, { author: 'Avi', rating: 2, text: 'Slow', reviewId: 'r2' });
  await handleInbound(ctx, client, { from: client.ownerPhone, text: 'תגובה: מצטערים אבי, נשמח לפצות בביקור הבא' });
  assert.deepEqual(posted, ['מצטערים אבי, נשמח לפצות בביקור הבא']);
});

test('without Google connected, approval returns the text to post manually', async () => {
  const { ctx, client, sent } = setup();
  await handleReview(ctx, client, { author: 'Avi', rating: 4, text: 'Nice' });
  assert.equal((await handleInbound(ctx, client, { from: client.ownerPhone, text: '1' })).status, 'manual');
  assert.match(sent.at(-1).text, /יש לפרסם ידנית/);
});

test('owner "סיכום" sends the digest now without marking the day done', async () => {
  const { ctx, client, sent } = setup();
  await handleInbound(ctx, client, { from: client.ownerPhone, text: 'סיכום' });
  assert.match(sent.at(-1).text, /סיכום יומי/);
  assert.equal(ctx.store.getState(client.id).lastDigestDate, undefined);
});

test('owner outside the 24h window gets one template ping; updates arrive when they reply', async () => {
  const client = { ...setup().client, ownerTemplate: { name: 'owner_updates', language: 'he' } };
  const { ctx, clock, sent } = setup({ client });
  await handleInbound(ctx, client, { from: '972501234567', text: 'שאלה ראשונה' });
  await handleInbound(ctx, client, { from: '972501234567', text: 'שאלה שנייה' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].template.name, 'owner_updates');

  clock.now += HOUR;
  const r = await handleInbound(ctx, client, { from: client.ownerPhone, text: 'כן' });
  assert.deepEqual(r, { status: 'delivered_pending', delivered: 2 });
  assert.match(sent[1].text, /שאלה ראשונה/);
  assert.match(sent[2].text, /שאלה שנייה/);

  // Inside the window, updates go straight through.
  await handleInbound(ctx, client, { from: '972501234567', text: 'שאלה שלישית' });
  assert.match(sent.at(-1).text, /שאלה שלישית/);
});
