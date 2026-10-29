import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleMissedCall } from '../src/modules/missedCall.js';
import { normalizePhone } from '../src/util.js';
import { HOUR } from '../src/util.js';
import { SATURDAY_NOON, setup } from './helpers.js';

test('normalizes Israeli numbers', () => {
  assert.equal(normalizePhone('050-123-4567'), '972501234567');
  assert.equal(normalizePhone('+972 50 123 4567'), '972501234567');
  assert.equal(normalizePhone('00972501234567'), '972501234567');
  assert.equal(normalizePhone('anonymous'), null);
});

test('messages the caller with the open-hours text and booking link', async () => {
  const { ctx, client, sent } = setup();
  const result = await handleMissedCall(ctx, client, { from: '0501234567' });
  assert.equal(result.status, 'messaged');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, '972501234567');
  assert.match(sent[0].text, /לא הספקנו לענות/);
  assert.match(sent[0].text, /example\.com\/book/);
});

test('uses the closed text outside business hours', async () => {
  const { ctx, client, sent } = setup({ at: SATURDAY_NOON });
  const result = await handleMissedCall(ctx, client, { from: '0501234567' });
  assert.equal(result.open, false);
  assert.match(sent[0].text, /מחוץ לשעות הפעילות/);
});

test('one message per caller within the cooldown', async () => {
  const { ctx, client, clock, sent } = setup();
  await handleMissedCall(ctx, client, { from: '0501234567' });
  clock.now += HOUR;
  assert.equal((await handleMissedCall(ctx, client, { from: '0501234567' })).reason, 'cooldown');
  clock.now += 12 * HOUR;
  assert.equal((await handleMissedCall(ctx, client, { from: '0501234567' })).status, 'messaged');
  assert.equal(sent.length, 2);
});

test('hidden numbers are logged but not messaged', async () => {
  const { ctx, client, sent } = setup();
  assert.equal((await handleMissedCall(ctx, client, { from: 'Restricted' })).status, 'skipped');
  assert.equal(sent.length, 0);
  assert.equal(ctx.store.events(client.id).length, 1);
});

test('send failures are recorded and do not start the cooldown', async () => {
  const { ctx, client } = setup({ failSend: true });
  assert.equal((await handleMissedCall(ctx, client, { from: '0501234567' })).status, 'failed');
  const types = ctx.store.events(client.id).map((e) => e.type);
  assert.deepEqual(types, ['error', 'missed_call']);
  assert.equal(ctx.store.getState(client.id).missedCallSentAt, undefined);
});
