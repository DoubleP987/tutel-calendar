import { randomUUID } from 'node:crypto';
import { db } from '../database/connection.js';
import { member, csrf } from '../auth/oauth.js';
import { groupContext, requireGroupMember, manageGroup, ownerGroup, groupFor } from './access.js';
import { recordAudit } from './schema.js';
import {
  createInvitation,
  acceptInvitation,
  invitationList,
  parseMemberCsv,
  tokenHash,
  claimEmailInvitations,
} from './invitations.js';
import { sendInvitationEmail } from '../notifications/email.js';

export function registerGroups(app) {
  app.get('/api/groups', member, (req, res) => {
    claimEmailInvitations(req.session);
    res.json(
      db
        .prepare(
          `SELECT g.id,g.slug,g.name,g.visibility,g.suspended,m.role FROM groups g JOIN memberships m ON m.group_id=g.id WHERE m.user_id=? AND m.blocked=0 ORDER BY g.name`,
        )
        .all(req.session.id),
    );
  });
  app.get('/api/group', groupContext, (req, res) =>
    res.json({
      id: req.group.id,
      slug: req.group.slug,
      name: req.group.name,
      visibility: req.group.visibility,
      suspended: !!req.group.suspended,
      role: req.membership?.role || null,
      canRead: !!req.membership || req.group.visibility === 'public',
    }),
  );
  app.post('/api/groups', member, csrf, (req, res) => {
    const name = String(req.body.name || '').trim(),
      slug = String(req.body.slug || '')
        .trim()
        .toLowerCase();
    if (name.length < 1 || name.length > 100 || !/^[a-z0-9][a-z0-9-]{2,47}$/.test(slug))
      return res
        .status(400)
        .json({ error: 'ชื่อ 1–100 ตัวอักษร และชื่อในลิงก์ 3–48 ตัว ใช้ a-z, 0-9 และ -' });
    if (
      db
        .prepare("SELECT count(*) n FROM memberships WHERE user_id=? AND role='owner'")
        .get(req.session.id).n >= 20
    )
      return res.status(429).json({ error: 'สร้างได้ไม่เกิน 20 กลุ่มต่อบัญชี' });
    if (db.prepare('SELECT id FROM groups WHERE slug=?').get(slug))
      return res.status(409).json({ error: 'ชื่อในลิงก์นี้ถูกใช้แล้ว' });
    const id = randomUUID(),
      now = new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`INSERT INTO groups VALUES (?,?,?,'private',0,?,?)`).run(
        id,
        slug,
        name,
        JSON.stringify({
          approval: 'manual',
          adminNotifyPending: true,
          adminNotifyPublished: false,
        }),
        now,
      );
      db.prepare("INSERT INTO memberships VALUES (?,?, 'owner',0,1,'{}',?)").run(
        id,
        req.session.id,
        now,
      );
      recordAudit(db, req.session.id, 'group.created', id, id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    res.status(201).json({ id, slug, name });
  });
  app.post('/api/group/select', member, csrf, groupContext, requireGroupMember, (req, res) => {
    db.prepare('UPDATE users SET last_group_id=? WHERE id=?').run(req.group.id, req.session.id);
    res.json({ ok: true });
  });
  app.put('/api/group', member, csrf, groupContext, requireGroupMember, ownerGroup, (req, res) => {
    const name = String(req.body.name || req.group.name).trim(),
      visibility = req.body.visibility ?? req.group.visibility;
    if (!name || name.length > 100 || !['private', 'public'].includes(visibility))
      return res.status(400).json({ error: 'ค่ากลุ่มไม่ถูกต้อง' });
    db.prepare('UPDATE groups SET name=?,visibility=? WHERE id=?').run(
      name,
      visibility,
      req.group.id,
    );
    recordAudit(db, req.session.id, 'group.updated', req.group.id, req.group.id);
    res.json({ ok: true });
  });
  app.post(
    '/api/group/transfer',
    member,
    csrf,
    groupContext,
    requireGroupMember,
    ownerGroup,
    (req, res) => {
      const target = db
        .prepare('SELECT * FROM memberships WHERE group_id=? AND user_id=? AND blocked=0')
        .get(req.group.id, String(req.body.userId || ''));
      if (!target || target.user_id === req.session.id)
        return res.status(400).json({ error: 'เลือกสมาชิกคนอื่นเพื่อรับเป็นเจ้าของ' });
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare("UPDATE memberships SET role='manager' WHERE group_id=? AND role='owner'").run(
          req.group.id,
        );
        db.prepare("UPDATE memberships SET role='owner' WHERE group_id=? AND user_id=?").run(
          req.group.id,
          target.user_id,
        );
        recordAudit(db, req.session.id, 'group.owner-transferred', target.user_id, req.group.id);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      res.json({ ok: true });
    },
  );
  app.get('/api/invitations', member, groupContext, requireGroupMember, manageGroup, (req, res) =>
    res.json(invitationList(req.group.id)),
  );
  app.post(
    '/api/invitations',
    member,
    csrf,
    groupContext,
    requireGroupMember,
    manageGroup,
    async (req, res) => {
      try {
        const invite = createInvitation(
          req.group.id,
          req.session.id,
          req.body,
          req.membership.role,
        );
        const delivery =
          invite.kind === 'email' && invite.email
            ? await sendInvitationEmail(invite, req.group.name)
            : { status: 'not-requested' };
        res.status(201).json({ ...invite, delivery });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    },
  );
  app.post(
    '/api/invitations/csv',
    member,
    csrf,
    groupContext,
    requireGroupMember,
    manageGroup,
    (req, res) => {
      try {
        const rows = parseMemberCsv(req.body.csv);
        for (const row of rows)
          if (
            !row.error &&
            db
              .prepare(
                'SELECT id FROM invitations WHERE group_id=? AND email=? AND revoked=0 AND expires_at>? AND uses<max_uses',
              )
              .get(req.group.id, row.email, Date.now())
          )
            row.error = 'มีคำเชิญที่ใช้งานอยู่แล้ว';
        if (req.body.confirm !== true) return res.json({ rows, created: false });
        if (rows.some((row) => row.error))
          return res.status(400).json({ error: 'แก้รายการที่ผิดก่อนนำเข้า', rows });
        db.exec('BEGIN IMMEDIATE');
        let invites;
        try {
          invites = rows.map((row) =>
            createInvitation(
              req.group.id,
              req.session.id,
              { ...row, kind: 'email' },
              req.membership.role,
            ),
          );
          db.exec('COMMIT');
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
        res.status(201).json({ rows, created: true, invitations: invites });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    },
  );
  app.delete(
    '/api/invitations/:id',
    member,
    csrf,
    groupContext,
    requireGroupMember,
    manageGroup,
    (req, res) => {
      const changed = db
        .prepare('UPDATE invitations SET revoked=1 WHERE id=? AND group_id=?')
        .run(req.params.id, req.group.id);
      if (!changed.changes) return res.sendStatus(404);
      recordAudit(db, req.session.id, 'invitation.revoked', req.params.id, req.group.id);
      res.json({ ok: true });
    },
  );
  app.post('/api/invitations/accept', member, csrf, (req, res) => {
    try {
      const token = String(req.body.token || '').trim(),
        invite = db.prepare('SELECT * FROM invitations WHERE token_hash=?').get(tokenHash(token));
      if (!invite) throw new Error('คำเชิญไม่ถูกต้อง');
      const id = acceptInvitation(invite, req.session);
      const group = groupFor(id);
      res.json({ id, slug: group.slug });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
}
