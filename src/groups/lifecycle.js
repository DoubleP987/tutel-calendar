import { db } from '../database/connection.js';
import { member, csrf } from '../auth/oauth.js';
import { groupContext, requireGroupMember, manageGroup } from './access.js';
import { recordAudit } from './schema.js';

export function initializeLifecycle() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS membership_exits (
      group_id TEXT NOT NULL, user_id TEXT NOT NULL, exited_at TEXT NOT NULL,
      PRIMARY KEY(group_id,user_id)
    );
    CREATE TABLE IF NOT EXISTS ownership_requests (
      group_id TEXT PRIMARY KEY REFERENCES groups(id), from_user TEXT NOT NULL,
      to_user TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_views (
      user_id TEXT PRIMARY KEY REFERENCES users(id), group_ids TEXT NOT NULL DEFAULT '[]'
    );
  `);
}

/** Retain authored events and an exit marker; old email invites must not silently rejoin. */
export function removeMembership(groupId, userId, actor) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT OR REPLACE INTO membership_exits VALUES (?,?,?)').run(
      groupId,
      userId,
      new Date().toISOString(),
    );
    db.prepare('DELETE FROM memberships WHERE group_id=? AND user_id=?').run(groupId, userId);
    db.prepare(
      'DELETE FROM ownership_requests WHERE group_id=? AND (from_user=? OR to_user=?)',
    ).run(groupId, userId, userId);
    db.prepare('UPDATE users SET last_group_id=NULL WHERE id=? AND last_group_id=?').run(
      userId,
      groupId,
    );
    recordAudit(
      db,
      actor,
      actor === userId ? 'membership.left' : 'membership.removed',
      userId,
      groupId,
    );
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function registerLifecycle(app) {
  app.post('/api/group/leave', member, csrf, groupContext, requireGroupMember, (req, res) => {
    const actual = db
      .prepare('SELECT role FROM memberships WHERE group_id=? AND user_id=?')
      .get(req.group.id, req.session.id);
    if (!actual) return res.status(403).json({ error: 'คุณไม่ได้เป็นสมาชิกกลุ่มนี้' });
    if (actual.role === 'owner')
      return res
        .status(409)
        .json({ error: 'โอนเจ้าของให้สมาชิกที่ยอมรับก่อน หรือเลือกย้ายปฏิทินเข้าถังขยะ' });
    removeMembership(req.group.id, req.session.id, req.session.id);
    res.json({ ok: true });
  });
  app.delete(
    '/api/members/:id',
    member,
    csrf,
    groupContext,
    requireGroupMember,
    manageGroup,
    (req, res) => {
      const target = db
        .prepare('SELECT * FROM memberships WHERE group_id=? AND user_id=?')
        .get(req.group.id, req.params.id);
      const actor = db
        .prepare('SELECT role FROM memberships WHERE group_id=? AND user_id=?')
        .get(req.group.id, req.session.id);
      if (!target) return res.status(404).json({ error: 'ไม่พบสมาชิก' });
      if (
        !actor ||
        !['owner', 'manager'].includes(actor.role) ||
        target.role === 'owner' ||
        target.user_id === req.session.id ||
        (actor.role !== 'owner' && target.role === 'manager')
      )
        return res.status(403).json({ error: 'ไม่มีสิทธิ์นำสมาชิกคนนี้ออก' });
      removeMembership(req.group.id, target.user_id, req.session.id);
      res.json({ ok: true });
    },
  );
  app.get('/api/ownership-requests', member, (req, res) => {
    res.json(
      db
        .prepare(
          `SELECT r.group_id,g.name,g.slug,u.name AS from_name,r.expires_at FROM ownership_requests r
      JOIN groups g ON g.id=r.group_id JOIN users u ON u.id=r.from_user JOIN memberships m ON m.group_id=r.group_id AND m.user_id=r.to_user
      WHERE r.to_user=? AND r.expires_at>? AND m.blocked=0 AND g.suspended=0`,
        )
        .all(req.session.id, Date.now()),
    );
  });
  app.get('/api/group/transfer', member, groupContext, requireGroupMember, (req, res) => {
    if (req.membership.role !== 'owner') return res.status(403).json({ error: 'เฉพาะเจ้าของ' });
    res.json(
      db
        .prepare(
          'SELECT r.to_user,u.name,r.expires_at FROM ownership_requests r JOIN users u ON u.id=r.to_user WHERE r.group_id=? AND r.expires_at>?',
        )
        .get(req.group.id, Date.now()) || null,
    );
  });
  app.delete('/api/group/transfer', member, csrf, groupContext, requireGroupMember, (req, res) => {
    db.prepare('DELETE FROM ownership_requests WHERE group_id=? AND from_user=?').run(
      req.group.id,
      req.session.id,
    );
    res.json({ ok: true });
  });
  app.post('/api/ownership-requests/:id/respond', member, csrf, (req, res) => {
    const request = db
      .prepare(
        `SELECT r.* FROM ownership_requests r JOIN groups g ON g.id=r.group_id
      JOIN memberships m ON m.group_id=r.group_id AND m.user_id=r.to_user
      JOIN memberships o ON o.group_id=r.group_id AND o.user_id=r.from_user
      WHERE r.group_id=? AND r.to_user=? AND r.expires_at>? AND g.suspended=0 AND m.blocked=0 AND o.blocked=0 AND o.role='owner'`,
      )
      .get(req.params.id, req.session.id, Date.now());
    if (!request) return res.status(409).json({ error: 'คำขอหมดอายุหรือสมาชิกเปลี่ยนแล้ว' });
    if (typeof req.body.accept !== 'boolean')
      return res.status(400).json({ error: 'ระบุยอมรับหรือปฏิเสธ' });
    db.exec('BEGIN IMMEDIATE');
    try {
      if (req.body.accept) {
        db.prepare("UPDATE memberships SET role='manager' WHERE group_id=? AND role='owner'").run(
          request.group_id,
        );
        db.prepare("UPDATE memberships SET role='owner' WHERE group_id=? AND user_id=?").run(
          request.group_id,
          req.session.id,
        );
      }
      db.prepare('DELETE FROM ownership_requests WHERE group_id=?').run(request.group_id);
      recordAudit(
        db,
        req.session.id,
        req.body.accept ? 'group.owner-transferred' : 'group.transfer-declined',
        request.from_user,
        request.group_id,
      );
      db.exec('COMMIT');
      res.json({ ok: true });
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
  app.get('/api/account/view', member, (req, res) => {
    res.json({
      groupIds: JSON.parse(
        db.prepare('SELECT group_ids FROM account_views WHERE user_id=?').get(req.session.id)
          ?.group_ids || '[]',
      ),
    });
  });
  app.put('/api/account/view', member, csrf, (req, res) => {
    const ids = req.body.groupIds;
    if (!Array.isArray(ids) || ids.length > 20 || ids.some((id) => typeof id !== 'string'))
      return res.status(400).json({ error: 'เลือกได้ไม่เกิน 20 กลุ่ม' });
    const allowed = db
      .prepare(
        'SELECT m.group_id FROM memberships m JOIN groups g ON g.id=m.group_id WHERE m.user_id=? AND m.blocked=0 AND g.suspended=0',
      )
      .all(req.session.id)
      .map((row) => row.group_id);
    if (ids.some((id) => !allowed.includes(id)))
      return res.status(403).json({ error: 'เลือกได้เฉพาะกลุ่มที่คุณเป็นสมาชิก' });
    db.prepare('INSERT OR REPLACE INTO account_views VALUES (?,?)').run(
      req.session.id,
      JSON.stringify([...new Set(ids)]),
    );
    res.json({ ok: true });
  });
}
