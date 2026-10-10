import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import { authenticate, registerAuth, demo } from './auth/oauth.js';
import { registerEvents } from './events/routes.js';
import { db } from './database/connection.js';
import { registerPreferences } from './members/preferences.js';
import { registerAdministration } from './members/routes.js';
import { registerNotifications } from './notifications/service.js';
import { startReminderScheduler } from './notifications/scheduler.js';
import { protectRequests } from './http/security.js';
import { registerGroups } from './groups/routes.js';
import { registerBindings } from './integrations/discord/bindings.js';
import { registerDiscordWorker } from './integrations/discord/jobs.js';
import { registerControlIntegration } from './integrations/control/routes.js';
import { startSourceSync } from './integrations/legacy-calendar/importer.js';

const host = process.env.HOST || '127.0.0.1';
const base = new URL(process.env.BASE_URL || 'http://127.0.0.1:3100');
if (
  demo &&
  (!['127.0.0.1', '::1', 'localhost'].includes(host) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname))
)
  throw new Error('Demo must bind to loopback and use a localhost BASE_URL.');
if (!demo && base.protocol !== 'https:')
  throw new Error('Real OAuth mode requires HTTPS BASE_URL.');
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        'style-src-attr': ["'unsafe-inline'"],
        'upgrade-insecure-requests': demo ? null : [],
      },
    },
  }),
);
protectRequests(app, base.origin);
app.use(express.json({ limit: '256kb' }));
app.use(['/api', '/internal'], (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use(authenticate);
registerAuth(app);
registerGroups(app);
registerBindings(app);
registerDiscordWorker(app);
registerControlIntegration(app);
registerEvents(app);
registerPreferences(app);
registerAdministration(app);
registerNotifications(app);
const stopReminders = startReminderScheduler();
const stopSource = startSourceSync();
app.get('/api/health', (req, res) => res.json({ ok: true, version: '0.1.0' }));
app.get(['/g/:slug', '/invite/:token', '/connect/:token'], (req, res) =>
  res.sendFile(fileURLToPath(new URL('../public/index.html', import.meta.url))),
);
app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));
app.use((error, req, res, next) => {
  console.error('[request]', error.name);
  res
    .status(error.status === 400 ? 400 : 500)
    .json({ error: error.status === 400 ? 'ข้อมูลที่ส่งไม่ถูกต้อง' : 'ระบบขัดข้อง กรุณาลองใหม่' });
});
const server = app.listen(Number(process.env.PORT || 3100), host, () =>
  console.log(`Tutel Calendar: ${base.origin}`),
);
const cleanup = setInterval(() => {
  db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());
  db.prepare('DELETE FROM oauth_states WHERE expires_at<?').run(Date.now());
  db.prepare('DELETE FROM discord_connection_grants WHERE expires_at<?').run(Date.now());
}, 600000);
cleanup.unref();
function shutdown() {
  stopSource();
  stopReminders();
  clearInterval(cleanup);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
