import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { handleMissedCall } from './modules/missedCall.js';
import { handleReview, handleVisit } from './modules/reviews.js';
import { computeDigest, formatDigest, runDigest } from './modules/digest.js';
import { DAY } from './util.js';

const MAX_BODY = 64 * 1024;
// Twilio-style status callbacks report every call; only these mean "nobody picked up".
const MISSED_STATUSES = new Set(['no-answer', 'busy', 'canceled', 'failed']);

const HOOKS = {
  'missed-call': (ctx, client, body) => {
    if (body.CallStatus && !MISSED_STATUSES.has(body.CallStatus)) return { status: 'ignored', reason: 'answered' };
    return handleMissedCall(ctx, client, { from: body.from ?? body.From ?? body.caller, at: body.at });
  },
  visit: (ctx, client, body) => handleVisit(ctx, client, body),
  review: (ctx, client, body) => handleReview(ctx, client, body),
};

function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && timingSafeEqual(x, y);
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('body too large'), { status: 413 });
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  // Some senders (curl -d, no-code tools) label JSON as a form, so trust the body's shape over the header.
  const isForm = (req.headers['content-type'] || '').includes('application/x-www-form-urlencoded');
  if (isForm && !raw.trimStart().startsWith('{')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error('invalid JSON'), { status: 400 });
  }
}

function clientHealth(ctx, client) {
  const now = ctx.now();
  const events = ctx.store.events(client.id, now - DAY);
  const state = ctx.store.getState(client.id);
  return {
    id: client.id,
    name: client.name,
    events24h: events.length,
    errors24h: events.filter((e) => e.type === 'error').length,
    lastError: events.filter((e) => e.type === 'error').at(-1) ?? null,
    outboxPending: state.outbox?.length ?? 0,
    lastDigestDate: state.lastDigestDate ?? null,
  };
}

export function createHttpServer(ctx, { adminToken = process.env.ADMIN_TOKEN } = {}) {
  const startedAt = ctx.now();

  return createServer(async (req, res) => {
    const reply = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    };
    try {
      const url = new URL(req.url, 'http://localhost');

      if (req.method === 'GET' && url.pathname === '/health') {
        return reply(200, { ok: true, uptimeSec: Math.round((ctx.now() - startedAt) / 1000) });
      }

      const hook = url.pathname.match(/^\/hooks\/([a-z0-9-]+)\/([a-z-]+)$/);
      if (req.method === 'POST' && hook && HOOKS[hook[2]]) {
        const client = ctx.clients.get(hook[1]);
        // Same response for unknown client and bad secret, so client ids can't be probed.
        const secret = req.headers['x-webhook-secret'] ?? url.searchParams.get('key');
        if (!client || !safeEqual(secret, client.webhookSecret)) return reply(401, { error: 'unauthorized' });
        const result = await HOOKS[hook[2]](ctx, client, await readBody(req));
        return reply(200, result);
      }

      const admin = url.pathname.match(/^\/admin(?:\/([a-z0-9-]+))?\/(health|digest)$/);
      if (admin && adminToken) {
        if (!safeEqual(req.headers.authorization, `Bearer ${adminToken}`)) return reply(401, { error: 'unauthorized' });
        if (req.method === 'GET' && admin[2] === 'health' && !admin[1]) {
          return reply(200, { ok: true, clients: [...ctx.clients.values()].map((c) => clientHealth(ctx, c)) });
        }
        const client = ctx.clients.get(admin[1]);
        if (client && admin[2] === 'digest') {
          if (req.method === 'GET') return reply(200, { text: formatDigest(client, computeDigest(ctx, client)) });
          if (req.method === 'POST') return reply(200, await runDigest(ctx, client));
        }
      }

      reply(404, { error: 'not found' });
    } catch (err) {
      ctx.log.error?.(err);
      reply(err.status ?? 500, { error: err.status ? err.message : 'internal error' });
    }
  });
}
