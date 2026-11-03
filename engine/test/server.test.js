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

test('tracked booking link redirects and counts real clicks only', async () => {
  const { setup: mk } = await import('./helpers.js');
  const { createHttpServer: create } = await import('../src/server.js');
  const { handleMissedCall } = await import('../src/modules/missedCall.js');
  const t = mk({ publicUrl: 'https://engine.example.com' });
  const srv = create(t.ctx).listen(0);
  try {
    await handleMissedCall(t.ctx, t.client, { from: '0501234567' });
    const link = t.sent[0].text.match(/https:\/\/engine\.example\.com(\/r\/\S+)/)[1];
    const url = `http://localhost:${srv.address().port}${link}`;
    const preview = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'WhatsApp/2.23' } });
    const human = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (iPhone)' } });
    assert.equal(human.status, 302);
    assert.equal(human.headers.get('location'), t.client.missedCall.bookingUrl);
    assert.equal(preview.status, 302);
    assert.equal(t.ctx.store.events(t.client.id).filter((e) => e.type === 'booking_click').length, 1);
  } finally {
    srv.close();
  }
});

test('WhatsApp webhook: verification, signature check and routing', async () => {
  const { createHmac } = await import('node:crypto');
  const { setup: mk } = await import('./helpers.js');
  const { createHttpServer: create } = await import('../src/server.js');
  const t = mk();
  const srv = create(t.ctx, { whatsappVerifyToken: 'vt', whatsappAppSecret: 'app-secret' }).listen(0);
  const b = `http://localhost:${srv.address().port}/webhooks/whatsapp`;
  try {
    const verify = await fetch(`${b}?hub.mode=subscribe&hub.verify_token=vt&hub.challenge=42`);
    assert.equal(await verify.text(), '42');
    assert.equal((await fetch(`${b}?hub.mode=subscribe&hub.verify_token=no&hub.challenge=42`)).status, 403);

    const body = JSON.stringify({ entry: [{ changes: [{ value: {
      metadata: { phone_number_id: '123' },
      messages: [{ from: '972501234567', timestamp: '1793534400', type: 'text', text: { body: 'הסר' } }],
    } }] }] });
    const sig = 'sha256=' + createHmac('sha256', 'app-secret').update(body).digest('hex');
    assert.equal((await fetch(b, { method: 'POST', body, headers: { 'x-hub-signature-256': 'sha256=bad' } })).status, 401);
    const ok = await fetch(b, { method: 'POST', body, headers: { 'x-hub-signature-256': sig } });
    assert.deepEqual(await ok.json(), { handled: 1 });
    assert.ok(t.ctx.store.getState(t.client.id).optOut['972501234567']);
  } finally {
    srv.close();
  }
});

test('visit webhook accepts a batch', async () => {
  const res = await post(`/hooks/${client.id}/visit`, { visits: [{ phone: '0521111111' }, { phone: 'bad' }] }, { 'x-webhook-secret': 'test-secret' });
  const body = await res.json();
  assert.deepEqual(body.results.map((r) => r.status), ['queued', 'skipped']);
});
