import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHttpServer } from '../src/server.js';
import { Store } from '../src/store.js';
import { setup } from './helpers.js';

const { ctx, client, sent } = setup();
const server = createHttpServer(ctx, { adminToken: 'admin-token' }).listen(0);
const base = `http://localhost:${server.address().port}`;
after(() => server.close());

const post = (path, body, headers = {}) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('health is public and minimal', async () => {
  const res = await fetch(base + '/health');
  assert.deepEqual(Object.keys(await res.json()), ['ok', 'uptimeSec']);
});

test('webhooks require the client secret', async () => {
  assert.equal((await post(`/hooks/${client.id}/missed-call`, { from: '0501234567' })).status, 401);
  assert.equal((await post(`/hooks/nope/missed-call`, {}, { 'x-webhook-secret': 'test-secret' })).status, 401);
});

test('missed-call webhook sends a WhatsApp', async () => {
  const res = await post(`/hooks/${client.id}/missed-call`, { from: '0507654321' }, { 'x-webhook-secret': 'test-secret' });
  assert.equal((await res.json()).status, 'messaged');
  assert.equal(sent.at(-1).to, '972507654321');
});

test('accepts Twilio-style form posts and ignores answered calls', async () => {
  const form = (status) => fetch(`${base}/hooks/${client.id}/missed-call?key=test-secret`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: '+972541231234', CallStatus: status }),
  }).then((r) => r.json());
  assert.equal((await form('completed')).status, 'ignored');
  assert.equal((await form('no-answer')).status, 'messaged');
});

test('admin health lists clients only with the admin token', async () => {
  assert.equal((await fetch(base + '/admin/health')).status, 401);
  const res = await fetch(base + '/admin/health', { headers: { authorization: 'Bearer admin-token' } });
  const body = await res.json();
  assert.equal(body.clients[0].id, client.id);
});

test('store rejects path-traversal client ids', () => {
  assert.throws(() => new Store(ctx.store.dir).events('../etc'), /invalid client id/);
});

test('JSON sent with a form content-type is still read as JSON', async () => {
  const res = await fetch(`${base}/hooks/${client.id}/review`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-webhook-secret': 'test-secret' },
    body: JSON.stringify({ author: 'Avi', rating: 2, text: 'long wait' }),
  });
  assert.equal((await res.json()).status, 'owner_notified');
});
