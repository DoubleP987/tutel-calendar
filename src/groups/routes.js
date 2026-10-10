import { randomUUID, randomBytes } from 'node:crypto';
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
} from './invitations.js';
import { queueInvitation } from '../notifications/invitation-delivery.js';
import { trashGroup, restoreGroup } from './trash.js';
import { notify } from '../notifications/service.js';

export function registerGroups(app) {
  const resendInvitation = (invite) => {
    const token = randomBytes(32).toString('base64url');
    db.prepare('UPDATE invitations SET token_hash=? WHERE id=?').run(tokenHash(token), invite.id);
    const queued = {
      id: invite.id,
      url: `${process.env.BASE_URL || 'http://127.0.0.1:3100'}/invite/${token}`,
    };
    queueInvitation(queued);
    return queued;
  };

  app.get('/api/groups', member, (req, res) => {
    res.json(
      db
        .prepare(
          `
            SELECT g.id,
               g.slug,
               g.name,
               g.visibility,
               g.suspended,
               m.role
            FROM groups g
            JOIN memberships m ON m.group_id=g.id
            WHERE m.user_id=? AND m.blocked=0 AND NOT EXISTS (SELECT 1
            FROM group_trash t
            WHERE t.group_id=g.id)
            ORDER BY g.name
          `,
        )
        .all(req.session.id),
    );
  });

  app.get('/api/groups/trash', member, (req, res) =>
    res.json(
      db
        .prepare(
          `
            SELECT t.group_id AS id,
               t.name,
               t.slug,
               t.deleted_at,
               t.purge_after
            FROM group_trash t
            JOIN memberships m ON m.group_id=t.group_id
            WHERE m.user_id=? AND m.role='owner' AND m.blocked=0 AND t.purged_at IS NULL AND t.purge_after>?
            ORDER BY t.deleted_at DESC
          `,
        )
        .all(req.session.id, Date.now()),
    ),
  );

  app.post('/api/groups/:id/restore', member, csrf, (req, res) => {
    const trash = db
      .prepare(
        `
          SELECT t.*
          FROM group_trash t
          JOIN memberships m ON m.group_id=t.group_id
          WHERE t.group_id=? AND m.user_id=? AND m.role='owner' AND m.blocked=0
        `,
      )
      .get(req.params.id, req.session.id);

    if (!trash) {
      return res.status(404).json({ error: 'ไม่พบปฏิทินที่คุณเป็นเจ้าของในถังขยะ' });
    }

    try {
      restoreGroup(trash, req.session.id);
      res.json({ id: trash.group_id, slug: trash.slug });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete('/api/group', member, csrf, groupContext, requireGroupMember, (req, res) => {
    // Platform administration and manager roles do not grant ownership for deletion.
    if (req.membership.role !== 'owner') {
      return res.status(403).json({ error: 'เฉพาะเจ้าของปฏิทินที่ลบได้' });
    }

    if (req.body.name !== req.group.name) {
      return res.status(400).json({ error: 'กรุณาพิมพ์ชื่อปฏิทินให้ตรงเพื่อยืนยัน' });
    }

    try {
      res.json({ ok: true, ...trashGroup(req.group, req.session.id) });
    } catch {
      res.status(400).json({ error: 'ย้ายปฏิทินไปถังขยะไม่สำเร็จ' });
    }
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
    const name = String(req.body.name || '').trim();
    const slug = String(req.body.slug || '')
      .trim()
      .toLowerCase();

    if (name.length < 1 || name.length > 100 || !/^[a-z0-9][a-z0-9-]{2,47}$/.test(slug)) {
      return res
        .status(400)
        .json({ error: 'ชื่อ 1–100 ตัวอักษร และชื่อในลิงก์ 3–48 ตัว ใช้ a-z, 0-9 และ -' });
    }

    if (
      db
        .prepare("SELECT count(*) n FROM memberships WHERE user_id=? AND role='owner'")
        .get(req.session.id).n >= 20
    ) {
      return res.status(429).json({ error: 'สร้างได้ไม่เกิน 20 กลุ่มต่อบัญชี' });
    }

    if (
      db.prepare('SELECT id FROM groups WHERE slug=?').get(slug) ||
      db.prepare('SELECT group_id FROM group_trash WHERE slug=?').get(slug)
    ) {
      return res.status(409).json({ error: 'ชื่อในลิงก์นี้ถูกใช้แล้ว' });
    }

    const id = randomUUID();
    const now = new Date().toISOString();
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
      recordAudit(db, req.session.id, 'membership.joined', req.session.id, id);
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
    const name = String(req.body.name || req.group.name).trim();
    const visibility = req.body.visibility ?? req.group.visibility;

    if (!name || name.length > 100 || !['private', 'public'].includes(visibility)) {
      return res.status(400).json({ error: 'ค่ากลุ่มไม่ถูกต้อง' });
    }

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

      if (req.membership.role !== 'owner') {
        return res.status(403).json({ error: 'เฉพาะเจ้าของปฏิทิน' });
      }

      if (!target || target.user_id === req.session.id) {
        return res.status(400).json({ error: 'เลือกสมาชิกคนอื่นเพื่อรับเป็นเจ้าของ' });
      }

      db.exec('BEGIN IMMEDIATE');

      try {
        db.prepare('INSERT OR REPLACE INTO ownership_requests VALUES (?,?,?,?)').run(
          req.group.id,
          req.session.id,
          target.user_id,
          Date.now() + 7 * 86400000,
        );
        recordAudit(db, req.session.id, 'group.transfer-requested', target.user_id, req.group.id);
        db.exec('COMMIT');
        notify(target.user_id, {
          groupId: req.group.id,
          title: 'มีคำขอโอนเจ้าของปฏิทิน',
          body: `${req.session.name} ขอให้คุณเป็นเจ้าของ ${req.group.name} เปิดบัญชีของฉัน → คำขอโอนเจ้าของ`,
          kind: 'ownership',
          dedupe: `ownership:${req.group.id}:${Date.now()}`,
        });
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
    (req, res) => {
      db.exec('BEGIN IMMEDIATE');

      try {
        const invite = createInvitation(
          req.group.id,
          req.session.id,
          req.body,
          req.membership.role,
        );
        const delivery =
          invite.kind === 'email' && invite.email
            ? queueInvitation(invite)
            : { status: 'not-requested' };
        db.exec('COMMIT');
        res.status(201).json({ ...invite, delivery });
      } catch (error) {
        db.exec('ROLLBACK');
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

        for (const row of rows) {
          if (row.error) {
            continue;
          }

          if (
            db
              .prepare(
                `
                  SELECT m.user_id
                  FROM memberships m
                  JOIN identities i ON i.user_id=m.user_id
                  WHERE m.group_id=? AND i.email=? AND i.email_verified=1
                `,
              )
              .get(req.group.id, row.email)
          ) {
            row.skip = true;
            row.info = 'เป็นสมาชิกอยู่แล้ว ข้ามและคงสิทธิ์เดิม';
            continue;
          }

          const previous = db
            .prepare(
              `
                SELECT i.*,
                   d.state AS delivery_state,
                   d.updated_at AS delivery_updated
                FROM invitations i
                LEFT JOIN invitation_delivery d ON d.invitation_id=i.id
                WHERE i.group_id=? AND i.email=? AND i.revoked=0 AND i.expires_at>? AND i.uses<i.max_uses
              `,
            )
            .get(req.group.id, row.email, Date.now());

          if (previous) {
            row.existing = previous.id;
            row.role = previous.role;
            row.info = 'ส่งคำเชิญเดิมอีกครั้ง โดยคงสิทธิ์เดิม; ลิงก์เดิมจะใช้ไม่ได้';

            if (
              ['queued', 'sending'].includes(previous.delivery_state) ||
              Date.now() - previous.delivery_updated < 60000
            ) {
              row.error = 'กำลังส่งหรือเพิ่งส่ง กรุณารออย่างน้อย 1 นาที';
            }
          }
        }

        if (req.body.confirm !== true) {
          return res.json({ rows, created: false });
        }

        if (rows.some((row) => row.error)) {
          return res.status(400).json({ error: 'แก้รายการที่ผิดก่อนนำเข้า', rows });
        }

        db.exec('BEGIN IMMEDIATE');
        let invites;

        try {
          invites = rows
            .filter((row) => !row.skip)
            .map((row) => {
              if (row.existing) {
                const previous = db
                  .prepare('SELECT * FROM invitations WHERE id=? AND group_id=?')
                  .get(row.existing, req.group.id);
                const invite = resendInvitation(previous);
                recordAudit(db, req.session.id, 'invitation.resent', previous.id, req.group.id);
                return invite;
              }

              const invite = createInvitation(
                req.group.id,
                req.session.id,
                { ...row, kind: 'email' },
                req.membership.role,
              );
              queueInvitation(invite);
              return invite;
            });
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

  app.post(
    '/api/invitations/:id/resend',
    member,
    csrf,
    groupContext,
    requireGroupMember,
    manageGroup,
    (req, res) => {
      const invite = db
        .prepare('SELECT * FROM invitations WHERE id=? AND group_id=?')
        .get(req.params.id, req.group.id);

      if (
        !invite ||
        invite.kind !== 'email' ||
        invite.revoked ||
        invite.expires_at <= Date.now() ||
        invite.uses >= invite.max_uses
      ) {
        return res.status(400).json({ error: 'คำเชิญนี้ส่งซ้ำไม่ได้ กรุณาสร้างคำเชิญใหม่' });
      }

      const delivery = db
        .prepare('SELECT state,updated_at FROM invitation_delivery WHERE invitation_id=?')
        .get(invite.id);

      if (
        delivery &&
        (['queued', 'sending'].includes(delivery.state) || Date.now() - delivery.updated_at < 60000)
      ) {
        return res.status(429).json({ error: 'กำลังส่งหรือเพิ่งส่ง กรุณารออย่างน้อย 1 นาที' });
      }

      db.exec('BEGIN IMMEDIATE');

      try {
        resendInvitation(invite);
        recordAudit(db, req.session.id, 'invitation.resent', invite.id, req.group.id);
        db.exec('COMMIT');
        res.json({ delivery: { status: 'queued' } });
      } catch (error) {
        db.exec('ROLLBACK');
        res.status(400).json({ error: 'ส่งคำเชิญซ้ำไม่สำเร็จ' });
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

      if (!changed.changes) {
        return res.sendStatus(404);
      }

      recordAudit(db, req.session.id, 'invitation.revoked', req.params.id, req.group.id);
      res.json({ ok: true });
    },
  );

  app.post('/api/invitations/accept', member, csrf, (req, res) => {
    try {
      const token = String(req.body.token || '').trim();
      const invite = db
        .prepare('SELECT * FROM invitations WHERE token_hash=?')
        .get(tokenHash(token));

      if (!invite) {
        throw new Error('คำเชิญไม่ถูกต้อง');
      }

      const id = acceptInvitation(invite, req.session);
      const group = groupFor(id);
      res.json({ id, slug: group.slug });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
}
