import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.js';
import { createWhatsApp } from '../src/whatsapp.js';
import { createContext } from '../src/app.js';

export const SUNDAY_NOON = Date.parse('2026-11-01T10:00:00Z'); // 12:00 in Jerusalem
export const SATURDAY_NOON = Date.parse('2026-11-07T10:00:00Z');

export function demoClient(overrides = {}) {
  const base = JSON.parse(readFileSync(new URL('../clients/demo-barber.json', import.meta.url), 'utf8'));
  return { ...base, webhookSecret: 'test-secret', ...overrides };
}

// failSend: false, or the HTTP status to fail with (e.g. 400 permanent, 500 temporary).
export function setup({ client = demoClient(), ai = null, google = null, at = SUNDAY_NOON, failSend = false, publicUrl = null } = {}) {
  const clock = { now: at };
  const silent = { info() {}, error() {} };
  const whatsapp = createWhatsApp({ dryRun: true, log: silent });
  const realSend = whatsapp.send;
  whatsapp.failures = 0;
  whatsapp.send = async (msg) => {
    if (failSend && whatsapp.failures++ < (whatsapp.failLimit ?? Infinity)) {
      throw Object.assign(new Error(`WhatsApp API ${failSend}: boom`), { status: failSend });
    }
    return realSend(msg);
  };
  const ctx = createContext({
    clients: new Map([[client.id, client]]),
    store: new Store(mkdtempSync(join(tmpdir(), 'engine-test-'))),
    whatsapp, ai, google, now: () => clock.now, opsPhone: null, publicUrl, log: silent,
  });
  return { ctx, client, clock, whatsapp, sent: whatsapp.sent };
}
