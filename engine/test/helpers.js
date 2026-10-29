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

export function setup({ client = demoClient(), ai = null, at = SUNDAY_NOON, failSend = false } = {}) {
  const clock = { now: at };
  const silent = { info() {}, error() {} };
  const whatsapp = createWhatsApp({ dryRun: true, log: silent });
  if (failSend) whatsapp.send = async () => { throw new Error('WhatsApp API 500: boom'); };
  const ctx = createContext({
    clients: new Map([[client.id, client]]),
    store: new Store(mkdtempSync(join(tmpdir(), 'engine-test-'))),
    whatsapp, ai, now: () => clock.now, opsPhone: null, log: silent,
  });
  return { ctx, client, clock, sent: whatsapp.sent };
}
