import { timingSafeEqual } from 'node:crypto';

export function serviceAuth(kind) {
  return (req, res, next) => {
    const expected =
      process.env[kind === 'control' ? 'CALENDAR_CONTROL_SECRET' : 'CALENDAR_BOT_SECRET'] || '';
    const token = String(req.get('authorization') || '').replace(/^Bearer /, '');
    const a = Buffer.from(token);
    const b = Buffer.from(expected);

    if (expected.length < 32 || a.length !== b.length || !timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'Service authentication required' });
    }

    req.serviceActor =
      kind === 'control'
        ? `panel:${String(req.get('x-calendar-actor') || 'admin').slice(0, 100)}`
        : 'discord-worker';
    next();
  };
}
