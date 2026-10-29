import { HOUR } from './util.js';

// Everything the modules need, injected so tests can swap any piece.
export function createContext({ clients, store, whatsapp, ai = null, now = () => Date.now(), opsPhone = process.env.OPS_PHONE, log = console }) {
  const lastAlert = new Map();

  const ctx = {
    clients, store, whatsapp, ai, now, log,

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

    // Returns true when the message went out; failures are recorded instead of thrown.
    async send(client, where, message) {
      try {
        await whatsapp.send(message);
        return true;
      } catch (err) {
        await ctx.recordError(client, where, err);
        return false;
      }
    },
  };
  return ctx;
}
