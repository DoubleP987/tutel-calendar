import { randomUUID } from 'node:crypto';
import { db } from '../database/connection.js';
import { member, csrf } from '../auth/oauth.js';
import { groupContext, requireGroupMember, ownerGroup } from '../groups/access.js';
import { mayAnnounce } from '../groups/capabilities.js';
import { recordAudit } from '../groups/schema.js';
import { notify } from './service.js';
import { preferences } from '../members/preferences.js';

export function registerAnnouncements(app) {
  const owner = [member, groupContext, requireGroupMember, ownerGroup];

  app.get('/api/group/capabilities', ...owner, (req, res) => {
    res.json({
      assistants: db
        .prepare(
          `
            SELECT u.id,
               u.name
            FROM group_external_access a
            JOIN users u ON u.id=a.user_id
            WHERE a.group_id=?
            ORDER BY u.name
          `,
        )
        .all(req.group.id),
      managers: db
        .prepare(
          `
            SELECT u.id,
               u.name,
               EXISTS(SELECT 1
            FROM group_announcement_managers a
            WHERE a.group_id=m.group_id AND a.user_id=m.user_id) AS canAnnounce
            FROM memberships m
            JOIN users u ON u.id=m.user_id
            WHERE m.group_id=? AND m.role='manager' AND m.blocked=0
          `,
        )
        .all(req.group.id),
    });
  });

  app.post(
    '/api/group/assistants',
    member,
    csrf,
    groupContext,
    requireGroupMember,
    ownerGroup,
    (req, res) => {
      const email = String(req.body.email || '')
        .trim()
        .toLowerCase();

      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'กรอกอีเมลบัญชีที่เข้าสู่ระบบแล้ว' });
      }

      const users = db
        .prepare(
          `
            SELECT DISTINCT u.id
            FROM identities i
            JOIN users u ON u.id=i.user_id
            WHERE lower(i.email)=? AND i.email_verified=1 AND u.blocked=0
          `,
        )
        .all(email);

      if (users.length !== 1) {
        return res.status(400).json({
          error: 'ไม่พบบัญชีที่ยืนยันอีเมลนี้แบบไม่ซ้ำ ให้ผู้ช่วยเข้าสู่ระบบและเชื่อมบัญชีก่อน',
        });
      }

      const userId = users[0].id;

      if (
        db
          .prepare('SELECT user_id FROM memberships WHERE group_id=? AND user_id=?')
          .get(req.group.id, userId)
      ) {
        return res
          .status(409)
          .json({ error: 'บัญชีนี้มีสมาชิกภาพอยู่แล้ว ให้จัดสิทธิ์จากหน้าสมาชิก' });
      }

      db.prepare('INSERT OR IGNORE INTO group_external_access VALUES (?,?,?,?)').run(
        req.group.id,
        userId,
        req.session.id,
        new Date().toISOString(),
      );
      recordAudit(db, req.session.id, 'external.granted', userId, req.group.id);
      res.json({ ok: true });
    },
  );

  app.delete(
    '/api/group/assistants/:id',
    member,
    csrf,
    groupContext,
    requireGroupMember,
    ownerGroup,
    (req, res) => {
      db.prepare('DELETE FROM group_external_access WHERE group_id=? AND user_id=?').run(
        req.group.id,
        req.params.id,
      );
      recordAudit(db, req.session.id, 'external.revoked', req.params.id, req.group.id);
      res.json({ ok: true });
    },
  );

  app.put(
    '/api/group/announcement-managers/:id',
    member,
    csrf,
    groupContext,
    requireGroupMember,
    ownerGroup,
    (req, res) => {
      if (typeof req.body.enabled !== 'boolean') {
        return res.status(400).json({ error: 'สิทธิ์ไม่ถูกต้อง' });
      }

      const target = db
        .prepare(
          "SELECT user_id FROM memberships WHERE group_id=? AND user_id=? AND role='manager' AND blocked=0",
        )
        .get(req.group.id, req.params.id);

      if (!target) {
        return res.status(404).json({ error: 'ไม่พบผู้จัดการที่ใช้งานอยู่' });
      }

      if (req.body.enabled) {
        db.prepare('INSERT OR IGNORE INTO group_announcement_managers VALUES (?,?)').run(
          req.group.id,
          target.user_id,
        );
      } else {
        db.prepare('DELETE FROM group_announcement_managers WHERE group_id=? AND user_id=?').run(
          req.group.id,
          target.user_id,
        );
      }

      recordAudit(db, req.session.id, 'announcement.permission', target.user_id, req.group.id);
      res.json({ ok: true });
    },
  );

  app.get('/api/group/announcements', member, groupContext, requireGroupMember, (req, res) => {
    res.json(
      db
        .prepare(
          `
            SELECT a.*,
               (SELECT count(*)
            FROM announcement_delivery d
            WHERE d.announcement_id=a.id) AS recipients,
               (SELECT count(*)
            FROM announcement_delivery d
            WHERE d.announcement_id=a.id AND d.state='sent') AS inboxDelivered
            FROM group_announcements a
            WHERE a.group_id=?
            ORDER BY a.created_at DESC
            LIMIT 50
          `,
        )
        .all(req.group.id),
    );
  });

  app.post(
    '/api/group/announcements',
    member,
    csrf,
    groupContext,
    requireGroupMember,
    (req, res) => {
      if (!mayAnnounce(req.group.id, req.session.id)) {
        return res.status(403).json({ error: 'เฉพาะเจ้าของหรือผู้จัดการที่ได้รับสิทธิ์ส่งประกาศ' });
      }

      const title = String(req.body.title || '').trim();
      const body = String(req.body.body || '').trim();
      const requestId = String(req.body.requestId || '');

      if (
        !title ||
        title.length > 120 ||
        !body ||
        body.length > 2000 ||
        !/^[a-zA-Z0-9-]{16,64}$/.test(requestId)
      ) {
        return res
          .status(400)
          .json({ error: 'หัวข้อไม่เกิน 120 ตัวอักษร รายละเอียดไม่เกิน 2,000 ตัวอักษร' });
      }

      const previous = db
        .prepare(
          'SELECT id FROM group_announcements WHERE group_id=? AND user_id=? AND request_id=?',
        )
        .get(req.group.id, req.session.id, requestId);

      if (previous) {
        return res.json({ id: previous.id, queued: true });
      }

      if (
        db
          .prepare('SELECT count(*) n FROM group_announcements WHERE group_id=? AND created_at>?')
          .get(req.group.id, new Date(Date.now() - 3600000).toISOString()).n >= 5
      ) {
        return res.status(429).json({ error: 'ส่งประกาศได้ไม่เกิน 5 ครั้งต่อกลุ่มต่อชั่วโมง' });
      }

      const id = randomUUID();
      db.exec('BEGIN IMMEDIATE');

      try {
        db.prepare('INSERT INTO group_announcements VALUES (?,?,?,?,?,?,?,?)').run(
          id,
          req.group.id,
          req.session.id,
          req.session.name,
          title,
          body,
          requestId,
          new Date().toISOString(),
        );
        db.prepare(
          `
            INSERT INTO announcement_delivery (announcement_id,
               user_id) SELECT ?,
               m.user_id
            FROM memberships m
            JOIN users u ON u.id=m.user_id
            WHERE m.group_id=? AND m.blocked=0 AND u.blocked=0
          `,
        ).run(id, req.group.id);
        recordAudit(db, req.session.id, 'announcement.sent', id, req.group.id);
        db.exec('COMMIT');
        res.status(202).json({ id, queued: true });
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  );
}

/** Durable single-process outbox; membership is checked again immediately before delivery. */
export function startAnnouncementDelivery() {
  let running = false;
  let stopped = false;

  async function tick() {
    if (running || stopped) {
      return;
    }

    running = true;

    try {
      const rows = db
        .prepare(
          `
            SELECT a.*,
               d.user_id AS recipient
            FROM announcement_delivery d
            JOIN group_announcements a ON a.id=d.announcement_id
            WHERE d.state='pending'
            LIMIT 10
          `,
        )
        .all();

      for (const row of rows) {
        if (stopped) {
          break;
        }

        const user = db
          .prepare(
            `
              SELECT u.*
              FROM users u
              JOIN memberships m ON m.user_id=u.id
              JOIN groups g ON g.id=m.group_id
              WHERE u.id=? AND m.group_id=? AND m.blocked=0 AND u.blocked=0 AND g.suspended=0 AND NOT EXISTS (SELECT 1
              FROM group_trash t
              WHERE t.group_id=g.id)
            `,
          )
          .get(row.recipient, row.group_id);

        if (user && preferences(user, row.group_id).notifyAnnouncements !== false) {
          await notify(user.id, {
            groupId: row.group_id,
            title: row.title,
            body: `${row.author_name}: ${row.body}`,
            kind: 'announcement',
            dedupe: `announcement:${row.id}`,
          });
        }

        db.prepare(
          'UPDATE announcement_delivery SET state=? WHERE announcement_id=? AND user_id=?',
        ).run(
          user && preferences(user, row.group_id).notifyAnnouncements !== false
            ? 'sent'
            : 'skipped',
          row.id,
          row.recipient,
        );
      }
    } catch (error) {
      console.error('[announcements]', error.name);
    } finally {
      running = false;
    }
  }

  const timer = setInterval(() => void tick(), 1000);
  timer.unref();
  void tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
