import { randomUUID, randomBytes } from 'node:crypto';
import { publishedEvents } from '../../events/published.js';
import { db } from '../../database/connection.js';
import { serviceAuth } from './security.js';
import { bindingConfig } from './bindings.js';
import { tokenHash } from '../../groups/invitations.js';

const today = (now) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now));
const at = (date, time) => new Date(`${date}T${time}:00+07:00`).getTime();
const nextDate = (date) => today(at(date, '12:00') + 86400000);

function agenda(groupId, date, config) {
  return publishedEvents(groupId, { date }).filter(
    (e) =>
      config.categories.includes(e.category) ||
      JSON.parse(e.source_categories || '[]').some((c) => config.categories.includes(c)),
  );
}

function queue(binding, key, due, payload) {
  db.prepare(
    `INSERT OR IGNORE INTO notification_jobs(id,binding_id,group_id,dedupe,due_at,payload,updated_at) VALUES (?,?,?,?,?,?,?)`,
  ).run(
    randomUUID(),
    binding.id,
    binding.group_id,
    key,
    due,
    JSON.stringify(payload),
    new Date().toISOString(),
  );
}

/** Short catch-up window avoids a burst of obsolete reminders after an outage. */
export function scheduleDiscordJobs(now = Date.now()) {
  const date = today(now);
  const bindings = db
    .prepare(
      'SELECT b.*,g.name,g.slug FROM discord_bindings b JOIN groups g ON g.id=b.group_id WHERE b.enabled=1 AND g.suspended=0',
    )
    .all();
  for (const binding of bindings) {
    const config = bindingConfig(JSON.parse(binding.config));
    for (const [kind, target, due] of [
      ['day', date, at(date, config.dailyTime)],
      ['before', nextDate(date), at(date, '12:00')],
    ]) {
      if (kind === 'before' && !config.beforeDay) continue;
      if (now < due || now - due > 300000) continue;
      const events = agenda(binding.group_id, target, config);
      if (!events.length) continue;
      queue(binding, `${binding.id}:${kind}:${target}`, due, {
        kind,
        date: target,
        groupName: binding.name,
        slug: binding.slug,
        color: config.color,
        events,
        url: `${process.env.BASE_URL}/g/${binding.slug}?date=${target}`,
      });
    }
    if (config.timed)
      for (const event of [
        ...agenda(binding.group_id, date, config),
        ...agenda(binding.group_id, nextDate(date), config),
      ].filter((e, i, all) => !e.all_day && all.findIndex((other) => other.id === e.id) === i)) {
        const due = at(event.date, event.time) - config.leadMinutes * 60000;
        if (now >= due && now - due < 300000)
          queue(binding, `${binding.id}:event:${event.id}:${due}`, due, {
            kind: 'event',
            date: event.date,
            groupName: binding.name,
            slug: binding.slug,
            color: config.color,
            events: [event],
            url: `${process.env.BASE_URL}/g/${binding.slug}?date=${event.date}&event=${encodeURIComponent(event.id)}`,
          });
      }
  }
  db.prepare(
    "UPDATE notification_jobs SET state='uncertain',error='Worker stopped after delivery began; verify channel before retry',updated_at=? WHERE state='sending' AND lease_until<?",
  ).run(new Date().toISOString(), now);
  db.prepare(
    "UPDATE notification_jobs SET state='expired',error='Delivery window expired',updated_at=? WHERE state IN ('pending','claimed') AND due_at<?",
  ).run(new Date().toISOString(), now - 3600000);
}

export function registerDiscordWorker(app) {
  const auth = serviceAuth('bot');
  app.get('/internal/v1/bot/bindings', auth, (req, res) =>
    res.json(
      db
        .prepare(
          'SELECT b.id,b.group_id,b.guild_id,b.channel_id,g.slug FROM discord_bindings b JOIN groups g ON g.id=b.group_id WHERE b.enabled=1 AND g.suspended=0',
        )
        .all(),
    ),
  );
  app.post('/internal/v1/bot/connect-grants', auth, (req, res) => {
    for (const key of ['discordUserId', 'guildId', 'channelId'])
      if (!/^\d{17,20}$/.test(String(req.body[key] || '')))
        return res.status(400).json({ error: 'Invalid Discord identity' });
    const token = randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO discord_connection_grants VALUES (?,?,?,?,?)').run(
      tokenHash(token),
      req.body.discordUserId,
      req.body.guildId,
      req.body.channelId,
      Date.now() + 600000,
    );
    res.json({ url: `${process.env.BASE_URL}/connect/${token}` });
  });
  app.post('/internal/v1/bot/claim', auth, (req, res) => {
    const guilds = req.body.guildIds;
    if (
      !Array.isArray(guilds) ||
      guilds.length > 1000 ||
      guilds.some((g) => !/^\d{17,20}$/.test(g))
    )
      return res.status(400).json({ error: 'Invalid guild list' });
    if (!guilds.length) return res.json({ jobs: [] });
    scheduleDiscordJobs();
    db.exec('BEGIN IMMEDIATE');
    try {
      const jobs = db
        .prepare(
          `SELECT j.*,b.guild_id,b.channel_id FROM notification_jobs j JOIN discord_bindings b ON b.id=j.binding_id JOIN groups g ON g.id=j.group_id WHERE b.enabled=1 AND g.suspended=0 AND j.due_at<=? AND (j.state='pending' OR (j.state='claimed' AND j.lease_until<?)) AND b.guild_id IN (${guilds.map(() => '?').join(',')}) ORDER BY j.due_at LIMIT 10`,
        )
        .all(Date.now(), Date.now(), ...guilds);
      for (const job of jobs) {
        job.claimToken = randomBytes(32).toString('base64url');
        db.prepare(
          "UPDATE notification_jobs SET state='claimed',claim_token=?,lease_until=?,attempts=attempts+1,updated_at=? WHERE id=?",
        ).run(tokenHash(job.claimToken), Date.now() + 120000, new Date().toISOString(), job.id);
        job.payload = JSON.parse(job.payload);
        delete job.claim_token;
      }
      db.exec('COMMIT');
      res.json({ jobs });
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
  app.post('/internal/v1/bot/jobs/:id/start', auth, (req, res) => {
    const change = db
      .prepare(
        "UPDATE notification_jobs SET state='sending',lease_until=?,updated_at=? WHERE id=? AND state='claimed' AND claim_token=? AND lease_until>? AND EXISTS (SELECT 1 FROM discord_bindings b JOIN groups g ON g.id=b.group_id WHERE b.id=notification_jobs.binding_id AND b.enabled=1 AND g.suspended=0)",
      )
      .run(
        Date.now() + 120000,
        new Date().toISOString(),
        req.params.id,
        tokenHash(String(req.body.claimToken || '')),
        Date.now(),
      );
    if (!change.changes) return res.status(409).json({ error: 'Claim expired or already used' });
    res.json({ ok: true });
  });
  app.post('/internal/v1/bot/jobs/:id/ack', auth, (req, res) => {
    const state = req.body.messageId ? 'sent' : req.body.uncertain ? 'uncertain' : 'failed';
    if (req.body.messageId && !/^\d{17,20}$/.test(req.body.messageId)) return res.sendStatus(400);
    const change = db
      .prepare(
        "UPDATE notification_jobs SET state=?,message_id=?,error=?,claim_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND claim_token=? AND state IN ('claimed','sending','uncertain')",
      )
      .run(
        state,
        req.body.messageId || null,
        String(req.body.error || '').slice(0, 200),
        new Date().toISOString(),
        req.params.id,
        tokenHash(String(req.body.claimToken || '')),
      );
    if (!change.changes) return res.status(409).json({ error: 'Claim no longer owned' });
    res.json({ ok: true });
  });
}
