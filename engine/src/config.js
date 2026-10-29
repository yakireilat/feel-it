import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CLIENT_ID = /^[a-z0-9-]{1,64}$/;

// Each client is one JSON file. Secrets come from the environment, never from the file.
export function loadClients(dir, env = process.env) {
  const clients = new Map();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const client = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    validateClient(client, file);
    const secret = env[client.webhookSecretEnv];
    if (!secret) throw new Error(`${file}: env var ${client.webhookSecretEnv} (webhook secret) is not set`);
    clients.set(client.id, { ...client, webhookSecret: secret });
  }
  return clients;
}

export function validateClient(c, label = c?.id) {
  const errors = [];
  if (!CLIENT_ID.test(c?.id ?? '')) errors.push('id must match ' + CLIENT_ID);
  if (!c.name) errors.push('name is required');
  if (!c.timezone) errors.push('timezone is required');
  if (!c.ownerPhone) errors.push('ownerPhone is required');
  if (!c.webhookSecretEnv) errors.push('webhookSecretEnv is required');
  if (c.missedCall?.enabled && !c.missedCall.bookingUrl) errors.push('missedCall.bookingUrl is required');
  if (c.reviews?.enabled && !c.reviews.googleReviewUrl) errors.push('reviews.googleReviewUrl is required');
  if (errors.length) throw new Error(`${label}: ${errors.join('; ')}`);
}
