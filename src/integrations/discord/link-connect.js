import { assertCalendarChannel } from '../../discord-bot/runtime.js';
import { db } from '../../database/connection.js';
import { serviceAuth } from './security.js';
import { saveBinding } from './bindings.js';

/** Discord transport proves the command sender; Calendar owns identity and group authorization. */
export function registerCalendarLinkConnection(app) {
  app.get('/internal/v1/bot/runtime-info', serviceAuth('bot'), (req, res) => {
    res.json({ mode: process.env.CALENDAR_DISCORD_TOKEN?.trim() ? 'standalone' : 'shared' });
  });
  app.post('/internal/v1/bot/connect-link', serviceAuth('bot'), async (req, res) => {
    let url;
    let slug;

    try {
      url = new URL(String(req.body.calendarUrl || ''));
      const base = new URL(process.env.BASE_URL || 'http://127.0.0.1:3100');
      const match = url.pathname.match(/^\/g\/([^/]+)\/?$/);

      if (
        url.origin !== base.origin ||
        !match ||
        url.username ||
        url.password ||
        url.hash ||
        url.search
      ) {
        throw new Error();
      }

      slug = decodeURIComponent(match[1]);
    } catch {
      return res
        .status(400)
        .json({ error: 'ใช้ลิงก์ปฏิทินของเว็บนี้ เช่น /g/cs-skru โดยไม่มี query เพิ่มเติม' });
    }

    const discordId = String(req.body.discordUserId || '');

    if (!/^\d{17,20}$/.test(discordId)) {
      return res.sendStatus(400);
    }

    const identity = db
      .prepare(
        `
          SELECT i.user_id
          FROM identities i
          JOIN users u ON u.id=i.user_id
          WHERE i.provider='discord' AND i.subject=? AND u.blocked=0
        `,
      )
      .get(discordId);

    if (!identity) {
      return res.status(403).json({
        error: 'เข้าสู่เว็บปฏิทินด้วย Discord บัญชีนี้ หรือเชื่อมบัญชี Discord ในตั้งค่าของฉันก่อน',
      });
    }

    const group = db
      .prepare(
        `
          SELECT g.*
          FROM groups g
          JOIN memberships m ON m.group_id=g.id
          WHERE g.slug=? AND m.user_id=? AND m.role IN ('owner',
             'manager') AND m.blocked=0 AND g.suspended=0 AND NOT EXISTS (SELECT 1
          FROM group_trash t
          WHERE t.group_id=g.id)
        `,
      )
      .get(slug, identity.user_id);

    if (!group) {
      return res
        .status(403)
        .json({ error: 'บัญชี Discord นี้ต้องเป็นเจ้าของหรือผู้จัดการของปฏิทินที่ยังใช้งานอยู่' });
    }

    try {
      await assertCalendarChannel(req.body.guildId, req.body.channelId);
      if (
        !db
          .prepare(
            "SELECT m.user_id FROM memberships m JOIN groups g ON g.id=m.group_id JOIN users u ON u.id=m.user_id WHERE m.group_id=? AND m.user_id=? AND m.role IN ('owner','manager') AND m.blocked=0 AND u.blocked=0 AND g.suspended=0",
          )
          .get(group.id, identity.user_id)
      )
        return res.status(403).json({ error: 'สิทธิ์หรือสถานะกลุ่มเปลี่ยนไป กรุณาลองใหม่' });
      const binding = saveBinding(group.id, identity.user_id, {
        guildId: String(req.body.guildId || ''),
        channelId: String(req.body.channelId || ''),
      });
      res.json({ ...binding, groupName: group.name, url: url.href });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
}
