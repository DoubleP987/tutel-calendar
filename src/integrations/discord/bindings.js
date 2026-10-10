import { db } from '../../database/connection.js';
import { randomUUID } from 'node:crypto';
import { member, csrf } from '../../auth/oauth.js';
import { groupContext, requireGroupMember, manageGroup } from '../../groups/access.js';
import { tokenHash } from '../../groups/invitations.js';
import { recordAudit } from '../../groups/schema.js';
import { categories } from '../../events/categories.js';

export const bindingDefaults = {
  dailyTime: '07:00',
  beforeDay: true,
  timed: false,
  leadMinutes: 30,
  color: '#4285f4',
  categories: categories.map((c) => c.id),
};

export function bindingConfig(input = {}) {
  const value = { ...bindingDefaults, ...input };
  if (
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.dailyTime) ||
    ![0, 5, 15, 30, 60, 1440].includes(Number(value.leadMinutes)) ||
    !/^#[a-f\d]{6}$/i.test(value.color) ||
    !Array.isArray(value.categories) ||
    value.categories.some((c) => !categories.some((x) => x.id === c)) ||
    typeof value.beforeDay !== 'boolean' ||
    typeof value.timed !== 'boolean'
  )
    throw new Error('การตั้งค่าแจ้งเตือนไม่ถูกต้อง');
  return {
    ...value,
    leadMinutes: Number(value.leadMinutes),
    categories: [...new Set(value.categories)],
  };
}

export function saveBinding(groupId, actor, input, id = null) {
  if (!db.prepare('SELECT id FROM groups WHERE id=?').get(groupId)) throw new Error('ไม่พบกลุ่ม');
  if (!/^\d{17,20}$/.test(String(input.guildId)) || !/^\d{17,20}$/.test(String(input.channelId)))
    throw new Error('Discord server/channel ID ไม่ถูกต้อง');
  const config = bindingConfig(input.config),
    enabled = input.enabled === false ? 0 : 1;
  const existing = id
    ? db.prepare('SELECT id FROM discord_bindings WHERE id=? AND group_id=?').get(id, groupId)
    : db
        .prepare('SELECT id FROM discord_bindings WHERE group_id=? AND guild_id=? AND channel_id=?')
        .get(groupId, input.guildId, input.channelId);
  id = existing?.id || randomUUID();
  if (existing)
    db.prepare(
      'UPDATE discord_bindings SET guild_id=?,channel_id=?,enabled=?,config=? WHERE id=? AND group_id=?',
    ).run(input.guildId, input.channelId, enabled, JSON.stringify(config), id, groupId);
  else
    db.prepare('INSERT INTO discord_bindings VALUES (?,?,?,?,?,?,?)').run(
      id,
      groupId,
      input.guildId,
      input.channelId,
      enabled,
      JSON.stringify(config),
      new Date().toISOString(),
    );
  recordAudit(db, actor, 'discord.binding-saved', id, groupId);
  return { id };
}

export function enqueueBindingTest(bindingId, actor) {
  const binding = db
    .prepare(
      'SELECT b.*,g.name,g.slug,g.suspended FROM discord_bindings b JOIN groups g ON g.id=b.group_id WHERE b.id=?',
    )
    .get(bindingId);
  if (!binding || !binding.enabled || binding.suspended)
    throw new Error('เปิดกลุ่มและการเชื่อมก่อนส่งทดลอง');
  const id = randomUUID(),
    config = bindingConfig(JSON.parse(binding.config));
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  db.prepare(
    'INSERT INTO notification_jobs(id,binding_id,group_id,dedupe,due_at,payload,updated_at) VALUES (?,?,?,?,?,?,?)',
  ).run(
    id,
    binding.id,
    binding.group_id,
    `test:${id}`,
    Date.now(),
    JSON.stringify({
      kind: 'test',
      date,
      groupName: binding.name,
      slug: binding.slug,
      color: config.color,
      events: [{ title: 'ทดสอบการเชื่อมปฏิทินกับช่อง Discord', all_day: 1, time: '' }],
      url: `${process.env.BASE_URL}/g/${binding.slug}`,
    }),
    new Date().toISOString(),
  );
  recordAudit(db, actor, 'discord.test-queued', id, binding.group_id);
  return { id };
}

export function registerBindings(app) {
  app.post(
    '/api/discord-bindings/:id/test',
    member,
    csrf,
    groupContext,
    requireGroupMember,
    manageGroup,
    (req, res) => {
      if (
        !db
          .prepare('SELECT id FROM discord_bindings WHERE id=? AND group_id=?')
          .get(req.params.id, req.group.id)
      )
        return res.sendStatus(404);
      try {
        res.json(enqueueBindingTest(req.params.id, req.session.id));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    },
  );
  app.get(
    '/api/discord-bindings',
    member,
    groupContext,
    requireGroupMember,
    manageGroup,
    (req, res) =>
      res.json(
        db
          .prepare('SELECT * FROM discord_bindings WHERE group_id=? ORDER BY created_at')
          .all(req.group.id)
          .map((b) => ({ ...b, config: JSON.parse(b.config) })),
      ),
  );
  app.put(
    '/api/discord-bindings/:id',
    member,
    csrf,
    groupContext,
    requireGroupMember,
    manageGroup,
    (req, res) => {
      const previous = db
        .prepare('SELECT * FROM discord_bindings WHERE id=? AND group_id=?')
        .get(req.params.id, req.group.id);
      if (!previous) return res.status(404).json({ error: 'ไม่พบการเชื่อมนี้' });
      try {
        res.json(
          saveBinding(
            req.group.id,
            req.session.id,
            {
              guildId: previous.guild_id,
              channelId: previous.channel_id,
              enabled: req.body.enabled,
              config: req.body.config,
            },
            previous.id,
          ),
        );
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    },
  );
  app.delete(
    '/api/discord-bindings/:id',
    member,
    csrf,
    groupContext,
    requireGroupMember,
    manageGroup,
    (req, res) => {
      const changed = db
        .prepare('UPDATE discord_bindings SET enabled=0 WHERE id=? AND group_id=?')
        .run(req.params.id, req.group.id);
      if (!changed.changes) return res.sendStatus(404);
      recordAudit(db, req.session.id, 'discord.binding-disabled', req.params.id, req.group.id);
      res.json({ ok: true });
    },
  );
  app.post(
    '/api/discord-connect',
    member,
    csrf,
    groupContext,
    requireGroupMember,
    manageGroup,
    (req, res) => {
      const grant = db
        .prepare('SELECT * FROM discord_connection_grants WHERE hash=? AND expires_at>?')
        .get(tokenHash(String(req.body.token || '')), Date.now());
      if (!grant) return res.status(400).json({ error: 'ลิงก์เชื่อมหมดอายุหรือใช้ไปแล้ว' });
      if (
        !db
          .prepare(
            "SELECT subject FROM identities WHERE provider='discord' AND subject=? AND user_id=?",
          )
          .get(grant.discord_user_id, req.session.id)
      )
        return res
          .status(403)
          .json({ error: 'เชื่อมบัญชี Discord ของผู้ที่ใช้คำสั่งก่อน แล้วลองใหม่' });
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = saveBinding(req.group.id, req.session.id, {
          guildId: grant.guild_id,
          channelId: grant.channel_id,
        });
        db.prepare('DELETE FROM discord_connection_grants WHERE hash=?').run(grant.hash);
        db.exec('COMMIT');
        res.json(result);
      } catch (error) {
        db.exec('ROLLBACK');
        res.status(400).json({ error: error.message });
      }
    },
  );
}
