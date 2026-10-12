import { db } from '../../database/connection.js';
import { recordAudit } from '../../groups/schema.js';
import { removeMembership } from '../../groups/lifecycle.js';
import { trashGroup } from '../../groups/trash.js';

/** Routes inherit control service authentication; these are not Calendar member APIs. */
export function registerPlatformManagement(app) {
  app.delete('/internal/v1/control/groups/:id', (req, res) => {
    const group = db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id);

    if (!group) {
      return res.status(404).json({ error: 'ไม่พบกลุ่ม' });
    }

    if (!group.suspended || req.body.name !== group.name || req.body.permanent !== true) {
      return res
        .status(409)
        .json({ error: 'ต้องระงับกลุ่มก่อน และพิมพ์ชื่อกลุ่มเพื่อยืนยันลบถาวร' });
    }

    if (!db.prepare('SELECT group_id FROM group_trash WHERE group_id=?').get(group.id)) {
      trashGroup(group, req.serviceActor);
    }

    db.exec('BEGIN IMMEDIATE');

    try {
      recordAudit(db, req.serviceActor, 'platform.group-deleted', group.id, group.id);
      db.prepare(
        'DELETE FROM invitation_delivery WHERE invitation_id IN (SELECT id FROM invitations WHERE group_id=?)',
      ).run(group.id);
      db.prepare(
        `
          DELETE
          FROM announcement_delivery
          WHERE announcement_id IN (SELECT id
          FROM group_announcements
          WHERE group_id=?)
        `,
      ).run(group.id);

      for (const table of [
        'group_announcements',
        'group_external_access',
        'group_announcement_managers',
        'ownership_requests',
        'membership_exits',
        'notification_jobs',
        'discord_bindings',
        'invitations',
        'notifications',
        'memberships',
      ]) {
        db.prepare(`DELETE FROM ${table} WHERE group_id=?`).run(group.id);
      }

      db.prepare(
        `
          DELETE
          FROM event_exceptions
          WHERE event_id IN (SELECT id
          FROM events
          WHERE group_id=? AND data_scope='group')
        `,
      ).run(group.id);
      db.prepare("DELETE FROM events WHERE group_id=? AND data_scope='group'").run(group.id);
      db.prepare('UPDATE users SET last_group_id=NULL WHERE last_group_id=?').run(group.id);
      db.prepare('UPDATE feedback SET group_id=NULL WHERE group_id=?').run(group.id);
      db.prepare('DELETE FROM groups WHERE id=?').run(group.id);
      db.prepare("UPDATE group_trash SET purged_at=?,name='',deleted_by='' WHERE group_id=?").run(
        Date.now(),
        group.id,
      );
      db.exec('COMMIT');
      res.json({ ok: true });
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });

  app.put('/internal/v1/control/users/:id', (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'ไม่พบบัญชี' });
    }

    const name =
      req.body.name === undefined
        ? user.custom_name
        : String(req.body.name).trim().normalize('NFC');

    if (
      name?.length > 100 ||
      /[\x00-\x1f\x7f]/.test(name || '') ||
      (req.body.blocked !== undefined && typeof req.body.blocked !== 'boolean')
    ) {
      return res.status(400).json({ error: 'ชื่อหรือสถานะบัญชีไม่ถูกต้อง' });
    }

    const blocked = req.body.blocked === undefined ? user.blocked : Number(req.body.blocked);

    if (
      blocked &&
      user.platform_admin &&
      db.prepare('SELECT count(*) n FROM users WHERE platform_admin=1 AND blocked=0').get().n <=
        1 &&
      !user.blocked
    ) {
      return res.status(409).json({ error: 'ไม่สามารถระงับผู้ดูแลปฏิทินคนสุดท้าย' });
    }

    db.exec('BEGIN IMMEDIATE');

    try {
      db.prepare('UPDATE users SET custom_name=?,name=?,blocked=? WHERE id=?').run(
        name || null,
        name || user.provider_name || user.name,
        blocked,
        user.id,
      );

      if (blocked) {
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
      }

      recordAudit(db, req.serviceActor, 'platform.account-updated', user.id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    res.json({ ok: true });
  });

  app.post('/internal/v1/control/users/:id/logout', (req, res) => {
    if (!db.prepare('SELECT id FROM users WHERE id=?').get(req.params.id)) {
      return res.sendStatus(404);
    }

    const result = db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.params.id);
    recordAudit(db, req.serviceActor, 'platform.sessions-revoked', req.params.id);
    res.json({ ok: true, revoked: result.changes });
  });

  app.post('/internal/v1/control/groups/:id/members', (req, res) => {
    const group = db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id);
    const user = db
      .prepare('SELECT id FROM users WHERE id=? AND blocked=0')
      .get(String(req.body.userId || ''));
    const role = req.body.role || 'member';

    if (!group || !user || !['member', 'editor', 'manager'].includes(role)) {
      return res.status(400).json({ error: 'เลือกกลุ่ม บัญชี และบทบาทที่ถูกต้อง' });
    }

    if (
      db
        .prepare('SELECT user_id FROM memberships WHERE group_id=? AND user_id=?')
        .get(group.id, user.id)
    ) {
      return res.status(409).json({ error: 'บัญชีนี้อยู่ในกลุ่มแล้ว ให้ใช้แก้สิทธิ์' });
    }

    db.prepare('INSERT INTO memberships VALUES (?,?,?,0,0,?,?)').run(
      group.id,
      user.id,
      role,
      '{}',
      new Date().toISOString(),
    );
    recordAudit(db, req.serviceActor, 'platform.membership-added', user.id, group.id);
    res.status(201).json({ ok: true });
  });

  app.delete('/internal/v1/control/groups/:id/members/:userId', (req, res) => {
    const membership = db
      .prepare('SELECT role FROM memberships WHERE group_id=? AND user_id=?')
      .get(req.params.id, req.params.userId);

    if (!membership) {
      return res.status(404).json({ error: 'ไม่พบสมาชิก' });
    }

    if (membership.role === 'owner') {
      return res.status(409).json({ error: 'โอนเจ้าของให้บัญชีอื่นก่อนนำเจ้าของเดิมออก' });
    }

    removeMembership(req.params.id, req.params.userId, req.serviceActor);
    res.json({ ok: true });
  });
}
