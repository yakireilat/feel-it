import { randomUUID } from 'node:crypto';
import { HOUR, normalizePhone } from './util.js';

// Delay before each retry of a message that failed for a temporary reason (Meta outage, rate limit, network).
export const RETRY_MINUTES = [1, 5, 15, 60];

// WhatsApp only delivers free text within 24h of the recipient's last message. Owners who haven't written
// recently get one approved-template ping, and the full updates wait until they reply.
const OWNER_WINDOW = 23 * HOUR;
const OWNER_PING_EVERY = 6 * HOUR;

const isTransient = (err) => !err.status || err.status === 429 || err.status >= 500;

// Everything the modules need, injected so tests can swap any piece.
export function createContext({
  clients, store, whatsapp, ai = null, google = null,
  now = () => Date.now(), opsPhone = process.env.OPS_PHONE, publicUrl = process.env.PUBLIC_URL, log = console,
}) {
  const lastAlert = new Map();

  const ctx = {
    clients, store, whatsapp, ai, google, now, log,
    publicUrl: publicUrl ? publicUrl.replace(/\/+$/, '') : null,

    // Monitoring is the product: every failure is recorded per client and the team is pinged (max once/hour per issue).
    async alertOps(key, text) {
      log.error?.(`[ops] ${text}`);
      if (!opsPhone || now() - (lastAlert.get(key) ?? 0) < HOUR) return;
      lastAlert.set(key, now());
      try {
        await whatsapp.send({ to: opsPhone, text: `🚨 ${text}` });
      } catch (err) {
        log.error?.(`[ops] alert failed: ${err.message}`);
      }
    },

    async recordError(client, where, err) {
      store.append(client.id, 'error', { where, message: err.message }, now());
      await ctx.alertOps(`${client.id}:${where}`, `${client.name} (${client.id}) – ${where}: ${err.message}`);
    },

    // The owner just wrote to us, so the 24h window is open: deliver everything that was waiting.
    async ownerWrote(client, when = now()) {
      const pending = store.getState(client.id).ownerPending ?? [];
      store.updateState(client.id, (s) => ({ ...s, ownerLastInbound: when, ownerPending: [], ownerPingAt: 0 }));
      for (const p of pending) await ctx.send(client, p.where, { to: client.ownerPhone, text: p.text });
      return pending.length;
    },

    isOwner(client, phone) {
      return normalizePhone(phone) === normalizePhone(client.ownerPhone);
    },

    // Queue a message for later: after a temporary failure, or until a client's send window opens.
    enqueue(client, item) {
      const entry = { id: randomUUID(), kind: 'message', sendAt: now(), attempts: 0, ...item };
      store.updateState(client.id, (s) => ({ ...s, outbox: [...(s.outbox ?? []), entry] }));
      return entry;
    },

    // Returns 'sent', 'queued' (temporary failure, will retry), 'blocked' (customer opted out) or 'failed'.
    async send(client, where, message, { attempts = 0 } = {}) {
      const msg = { phoneNumberId: client.whatsappPhoneNumberId, ...message };
      if (client.ownerTemplate && msg.text && ctx.isOwner(client, msg.to)) {
        const state = store.getState(client.id);
        if (now() - (state.ownerLastInbound ?? 0) > OWNER_WINDOW) {
          store.updateState(client.id, (s) => ({ ...s, ownerPending: [...(s.ownerPending ?? []), { where, text: msg.text }].slice(-30) }));
          if (now() - (state.ownerPingAt ?? 0) < OWNER_PING_EVERY) return 'queued';
          store.updateState(client.id, (s) => ({ ...s, ownerPingAt: now() }));
          return ctx.send(client, 'owner_ping', { to: msg.to, template: { ...client.ownerTemplate, params: [client.name] } }, { attempts });
        }
      }
      if (!ctx.isOwner(client, msg.to) && store.getState(client.id).optOut?.[msg.to]) {
        store.append(client.id, 'blocked_opt_out', { where, to: msg.to }, now());
        return 'blocked';
      }
      try {
        await whatsapp.send(msg);
        return 'sent';
      } catch (err) {
        await ctx.recordError(client, where, err);
        if (!isTransient(err) || attempts >= RETRY_MINUTES.length) return 'failed';
        ctx.enqueue(client, { where, message: msg, attempts: attempts + 1, sendAt: now() + RETRY_MINUTES[attempts] * 60_000 });
        return 'queued';
      }
    },
  };
  return ctx;
}
