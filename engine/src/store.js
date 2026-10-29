import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLIENT_ID } from './config.js';

// File-based store with one directory per client, so client data never mixes and a client's
// data can be exported or deleted on its own. Swap for SQLite/Postgres once volumes grow.
export class Store {
  constructor(dir) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
  }

  #clientDir(clientId) {
    if (!CLIENT_ID.test(clientId)) throw new Error(`invalid client id: ${clientId}`);
    const dir = join(this.dir, clientId);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  append(clientId, type, payload = {}, at = Date.now()) {
    const event = { at, type, ...payload };
    appendFileSync(join(this.#clientDir(clientId), 'events.jsonl'), JSON.stringify(event) + '\n');
    return event;
  }

  events(clientId, sinceMs = 0) {
    const file = join(this.#clientDir(clientId), 'events.jsonl');
    if (!existsSync(file)) return [];
    return readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((e) => e.at >= sinceMs);
  }

  // Drop events older than the retention window (privacy: keep customer data only as long as needed).
  purge(clientId, olderThanMs) {
    const kept = this.events(clientId, olderThanMs);
    this.#writeAtomic(join(this.#clientDir(clientId), 'events.jsonl'), kept.map((e) => JSON.stringify(e) + '\n').join(''));
  }

  getState(clientId) {
    const file = join(this.#clientDir(clientId), 'state.json');
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  }

  updateState(clientId, fn) {
    const state = this.getState(clientId);
    const next = fn(state) ?? state;
    this.#writeAtomic(join(this.#clientDir(clientId), 'state.json'), JSON.stringify(next, null, 2));
    return next;
  }

  #writeAtomic(file, content) {
    writeFileSync(file + '.tmp', content);
    renameSync(file + '.tmp', file);
  }
}
