import { loadClients } from './config.js';
import { Store } from './store.js';
import { createWhatsApp } from './whatsapp.js';
import { createAI } from './ai.js';
import { createContext } from './app.js';
import { createHttpServer } from './server.js';
import { purgeOld, tick } from './scheduler.js';
import { HOUR } from './util.js';

const clients = loadClients(process.env.CLIENTS_DIR || 'clients');
const whatsapp = createWhatsApp();
const ai = createAI();
const ctx = createContext({ clients, store: new Store(process.env.DATA_DIR || 'data'), whatsapp, ai });

const port = Number(process.env.PORT || 8080);
createHttpServer(ctx).listen(port, () => {
  console.log(`engine listening on :${port} – ${clients.size} client(s), whatsapp ${whatsapp.dryRun ? 'DRY RUN' : 'live'}, AI ${ai ? 'on' : 'off (template replies)'}`);
});

const safely = (fn) => () => fn().catch((err) => console.error('[scheduler]', err));
setInterval(safely(() => tick(ctx)), 60_000);
setInterval(safely(async () => purgeOld(ctx)), 24 * HOUR);
safely(() => tick(ctx))();
