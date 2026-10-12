import 'dotenv/config';
import { startCalendarDiscordBot } from './runtime.js';

if (!process.env.CALENDAR_DISCORD_TOKEN?.trim()) {
  throw new Error('Set CALENDAR_DISCORD_TOKEN');
}

const stop = await startCalendarDiscordBot();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stop();
    process.exit(0);
  });
}
