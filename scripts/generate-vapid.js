import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import webPush from 'web-push';
const path = '.env';
if (!existsSync(path)) throw new Error('Copy .env.example to .env first.');
if (/^VAPID_PRIVATE_KEY=.+/m.test(readFileSync(path, 'utf8')))
  throw new Error('Keys already exist; keep them to preserve subscriptions.');
const keys = webPush.generateVAPIDKeys();
appendFileSync(
  path,
  `\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nVAPID_SUBJECT=https://calendar.toomtoom.online\n`,
);
console.log(
  'Web Push keys saved privately in .env. No secret was printed. Restart the application.',
);
