import { db } from '../../database/connection.js';
import { serviceAuth } from '../discord/security.js';
import { recordAudit } from '../../groups/schema.js';
import {
  createInvitation,
  invitationList,
  validateMemberChange,
  parseMemberCsv,
} from '../../groups/invitations.js';
import { saveBinding, enqueueBindingTest } from '../discord/bindings.js';
import { validate } from '../../events/routes.js';
import { published } from '../../notifications/service.js';
import { sendInvitationEmail } from '../../notifications/email.js';
import { categories } from '../../events/categories.js';

/** Private service API, authenticated with its own key. Never shares browser cookies. */
export function registerControlIntegration(app) {
  app.use('/internal/v1/control', serviceAuth('control'));
  app.use('/internal/v1/control/groups/:id', (req, res, next) => {
    if (
      !['GET', 'HEAD'].includes(req.method) &&
      db.prepare('SELECT group_id FROM group_trash WHERE group_id=?').get(req.params.id)
    ) {
      return res.status(409).json({ error: 'ปฏิทินอยู่ในถังขยะ ให้เจ้าของกู้คืนก่อนแก้ไข' });
    }

    next();
  });

  app.get('/internal/v1/control/catalog', (req, res) => res.json(categories));

  app.get('/internal/v1/control/overview', (req, res) =>
    res.json({
      groups: db.prepare('SELECT count(*) n FROM groups').get().n,
      members: db.prepare('SELECT count(*) n FROM users').get().n,
      pending: db.prepare("SELECT count(*) n FROM events WHERE status='pending'").get().n,
      failed: db
        .prepare("SELECT count(*) n FROM notification_jobs WHERE state IN ('failed','uncertain')")
        .get().n,
    }),
  );

  app.get('/internal/v1/control/groups', (req, res) =>
    res.json(
      db
        .prepare(
          `
            SELECT g.*,
               (SELECT deleted_at
            FROM group_trash t
            WHERE t.group_id=g.id) deleted_at,
               (SELECT purge_after
            FROM group_trash t
            WHERE t.group_id=g.id) purge_after,
               (SELECT count(*)
            FROM memberships m
            WHERE m.group_id=g.id AND m.blocked=0) member_count,
               (SELECT count(*)
            FROM events e
            WHERE e.group_id=g.id) event_count,
               (SELECT u.name
            FROM memberships m
            JOIN users u ON u.id=m.user_id
            WHERE m.group_id=g.id AND m.role='owner'
            LIMIT 1) owner
            FROM groups g
            WHERE g.name LIKE ?
            ORDER BY g.name
          `,
        )
        .all(`%${String(req.query.q || '').slice(0, 100)}%`)
        .map((g) => ({ ...g, settings: JSON.parse(g.settings) })),
    ),
  );

  app.get('/internal/v1/control/users', (req, res) =>
    res.json(
      db
        .prepare(
          'SELECT id,name,provider,blocked FROM users WHERE name LIKE ? ORDER BY name LIMIT 1000',
        )
        .all(`%${String(req.query.q || '').slice(0, 100)}%`)
        .map((user) => ({
          ...user,
          originalName:
            db.prepare('SELECT provider_name FROM users WHERE id=?').get(user.id)?.provider_name ||
            user.name,
          emails: db
            .prepare(
              'SELECT DISTINCT email FROM identities WHERE user_id=? AND email_verified=1 AND email IS NOT NULL',
            )
            .all(user.id)
            .map((identity) => identity.email),
          groups: db
            .prepare(
              `
                SELECT g.id,
                   g.name,
                   m.role,
                   m.blocked
                FROM memberships m
                JOIN groups g ON g.id=m.group_id
                WHERE m.user_id=?
              `,
            )
            .all(user.id),
        })),
    ),
  );

  app.get('/internal/v1/control/groups/:id', (req, res) => {
    const group = db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id);

    if (!group) {
      return res.sendStatus(404);
    }

    res.json({
      group: {
        ...group,
        trash:
          db
            .prepare('SELECT deleted_at,purge_after FROM group_trash WHERE group_id=?')
            .get(group.id) || null,
        settings: JSON.parse(group.settings),
      },
      members: db
        .prepare(
          `
            SELECT u.id,
               u.name,
               u.provider,
               m.*
            FROM memberships m
            JOIN users u ON u.id=m.user_id
            WHERE m.group_id=?
            ORDER BY u.name
          `,
        )
        .all(group.id)
        .map((user) => ({
          ...user,
          originalName:
            db.prepare('SELECT provider_name FROM users WHERE id=?').get(user.id)?.provider_name ||
            user.name,
          emails: db
            .prepare(
              'SELECT DISTINCT email FROM identities WHERE user_id=? AND email_verified=1 AND email IS NOT NULL',
            )
            .all(user.id)
            .map((identity) => identity.email),
        })),
      events: db
        .prepare('SELECT * FROM events WHERE group_id=? ORDER BY date DESC LIMIT 1000')
        .all(group.id),
      invitations: invitationList(group.id),
      bindings: db
        .prepare('SELECT * FROM discord_bindings WHERE group_id=?')
        .all(group.id)
        .map((b) => ({ ...b, config: JSON.parse(b.config) })),
    });
  });

  app.put('/internal/v1/control/groups/:id', (req, res) => {
    const group = db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id);

    if (!group) {
      return res.sendStatus(404);
    }

    const name = String(req.body.name ?? group.name).trim();
    const visibility = req.body.visibility ?? group.visibility;

    if (!name || name.length > 100 || !['private', 'public'].includes(visibility)) {
      return res.status(400).json({ error: 'ค่ากลุ่มไม่ถูกต้อง' });
    }

    const settings = { ...JSON.parse(group.settings) };

    if (req.body.approval !== undefined) {
      if (!['manual', 'trusted', 'all'].includes(req.body.approval)) {
        return res.sendStatus(400);
      }

      settings.approval = req.body.approval;
    }

    db.prepare('UPDATE groups SET name=?,visibility=?,suspended=?,settings=? WHERE id=?').run(
      name,
      visibility,
      req.body.suspended === undefined ? group.suspended : Number(req.body.suspended === true),
      JSON.stringify(settings),
      group.id,
    );
    recordAudit(db, req.serviceActor, 'platform.group-updated', group.id, group.id);
    res.json({ ok: true });
  });

  app.put('/internal/v1/control/groups/:id/members/:userId', (req, res) => {
    try {
      const value = validateMemberChange(
        req.params.id,
        req.serviceActor,
        'owner',
        req.params.userId,
        req.body,
      );
      db.prepare(
        'UPDATE memberships SET role=?,blocked=?,auto_approve=? WHERE group_id=? AND user_id=?',
      ).run(value.role, value.blocked, value.autoApprove, req.params.id, req.params.userId);
      recordAudit(
        db,
        req.serviceActor,
        'platform.membership-updated',
        req.params.userId,
        req.params.id,
      );
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/internal/v1/control/groups/:id/transfer', (req, res) => {
    const target = db
      .prepare('SELECT * FROM memberships WHERE group_id=? AND user_id=? AND blocked=0')
      .get(req.params.id, String(req.body.userId || ''));

    if (!target) {
      return res.sendStatus(404);
    }

    db.exec('BEGIN IMMEDIATE');

    try {
      db.prepare("UPDATE memberships SET role='manager' WHERE group_id=? AND role='owner'").run(
        req.params.id,
      );
      db.prepare("UPDATE memberships SET role='owner' WHERE group_id=? AND user_id=?").run(
        req.params.id,
        target.user_id,
      );
      recordAudit(
        db,
        req.serviceActor,
        'platform.owner-transferred',
        target.user_id,
        req.params.id,
      );
      db.exec('COMMIT');
      res.json({ ok: true });
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });

  app.post('/internal/v1/control/groups/:id/invitations', async (req, res) => {
    if (!db.prepare('SELECT id FROM groups WHERE id=?').get(req.params.id)) {
      return res.sendStatus(404);
    }

    try {
      const invite = createInvitation(req.params.id, req.serviceActor, req.body, 'owner');
      const delivery =
        req.body.sendEmail === true && invite.email
          ? await sendInvitationEmail(
              invite,
              db.prepare('SELECT name FROM groups WHERE id=?').get(req.params.id).name,
            )
          : { status: 'not-requested' };
      res.status(201).json({ ...invite, delivery });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/internal/v1/control/groups/:id/invitations/csv', (req, res) => {
    if (!db.prepare('SELECT id FROM groups WHERE id=?').get(req.params.id)) {
      return res.sendStatus(404);
    }

    try {
      const rows = parseMemberCsv(req.body.csv);

      for (const row of rows) {
        if (
          !row.error &&
          db
            .prepare(
              `
                SELECT id
                FROM invitations
                WHERE group_id=? AND email=? AND revoked=0 AND expires_at>? AND uses<max_uses
              `,
            )
            .get(req.params.id, row.email, Date.now())
        ) {
          row.error = 'มีคำเชิญที่ยังใช้งานอยู่แล้ว';
        }
      }

      if (req.body.confirm !== true) {
        return res.json({ rows, created: false });
      }

      if (rows.some((row) => row.error)) {
        return res.status(400).json({ error: 'แก้รายการผิดก่อนนำเข้า', rows });
      }

      db.exec('BEGIN IMMEDIATE');
      let invitations;

      try {
        invitations = rows.map((row) =>
          createInvitation(req.params.id, req.serviceActor, { ...row, kind: 'email' }, 'owner'),
        );
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }

      res.status(201).json({ rows, created: true, invitations });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete('/internal/v1/control/groups/:id/invitations/:inviteId', (req, res) => {
    const change = db
      .prepare('UPDATE invitations SET revoked=1 WHERE id=? AND group_id=?')
      .run(req.params.inviteId, req.params.id);

    if (!change.changes) {
      return res.sendStatus(404);
    }

    recordAudit(
      db,
      req.serviceActor,
      'platform.invitation-revoked',
      req.params.inviteId,
      req.params.id,
    );
    res.json({ ok: true });
  });

  app.post('/internal/v1/control/groups/:id/bindings', (req, res) => {
    try {
      const result = saveBinding(req.params.id, req.serviceActor, req.body, req.body.id || null);

      if (req.body.test === true) {
        enqueueBindingTest(result.id, req.serviceActor);
      }

      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put('/internal/v1/control/groups/:id/events/:eventId', (req, res) => {
    const event = db
      .prepare('SELECT * FROM events WHERE id=? AND group_id=?')
      .get(req.params.eventId, req.params.id);

    if (!event) {
      return res.sendStatus(404);
    }

    if (event.source_id) {
      return res.status(409).json({ error: 'รายการนำเข้าต้องแก้ที่ต้นทางระหว่างย้ายข้อมูล' });
    }

    try {
      const fields = validate(req.body);
      db.prepare(
        `
          UPDATE events
          SET title=?,
             description=?,
             date=?,
             end_date=?,
             time=?,
             end_time=?,
             all_day=?,
             color=?,
             category=?,
             updated_at=?
          WHERE id=? AND group_id=?
        `,
      ).run(...fields, new Date().toISOString(), event.id, req.params.id);
      recordAudit(db, req.serviceActor, 'platform.event-updated', event.id, req.params.id);
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete('/internal/v1/control/groups/:id/events/:eventId', (req, res) => {
    const event = db
      .prepare('SELECT * FROM events WHERE id=? AND group_id=?')
      .get(req.params.eventId, req.params.id);

    if (!event) {
      return res.sendStatus(404);
    }

    if (event.source_id) {
      return res.status(409).json({ error: 'รายการนำเข้าต้องจัดการต้นทางระหว่างย้ายข้อมูล' });
    }

    db.prepare('DELETE FROM events WHERE id=? AND group_id=?').run(event.id, req.params.id);
    recordAudit(db, req.serviceActor, 'platform.event-deleted', event.id, req.params.id);
    res.json({ ok: true });
  });

  app.post('/internal/v1/control/groups/:id/events/:eventId/review', (req, res) => {
    const status = req.body.status;

    if (!['published', 'rejected'].includes(status)) {
      return res.sendStatus(400);
    }

    const change = db
      .prepare(
        "UPDATE events SET status=?,review_note=?,updated_at=? WHERE id=? AND group_id=? AND status='pending'",
      )
      .run(
        status,
        String(req.body.note || '').slice(0, 500),
        new Date().toISOString(),
        req.params.eventId,
        req.params.id,
      );

    if (!change.changes) {
      return res.status(409).json({ error: 'รายการถูกตรวจแล้วหรือไม่พบ' });
    }

    recordAudit(db, req.serviceActor, 'platform.event-reviewed', req.params.eventId, req.params.id);

    if (status === 'published') {
      published(req.params.eventId);
    }

    res.json({ ok: true });
  });

  app.get('/internal/v1/control/jobs', (req, res) =>
    res.json(
      db
        .prepare(
          `
            SELECT j.id,
               j.group_id,
               g.name,
               j.binding_id,
               b.guild_id,
               b.channel_id,
               j.state,
               j.due_at,
               j.attempts,
               j.message_id,
               j.error,
               j.updated_at
            FROM notification_jobs j
            JOIN groups g ON g.id=j.group_id
            JOIN discord_bindings b ON b.id=j.binding_id
            ORDER BY j.updated_at DESC
            LIMIT 500
          `,
        )
        .all(),
    ),
  );

  app.post('/internal/v1/control/jobs/:id/retry', (req, res) => {
    const job = db.prepare('SELECT * FROM notification_jobs WHERE id=?').get(req.params.id);

    if (!job || !['failed', 'uncertain'].includes(job.state)) {
      return res.status(409).json({ error: 'งานนี้ไม่สามารถลองใหม่ได้' });
    }

    if (job.state === 'uncertain' && req.body.confirmCheckedChannel !== true) {
      return res
        .status(409)
        .json({ error: 'ตรวจช่อง Discord ก่อนยืนยันลองใหม่ งานนี้อาจส่งไปแล้ว' });
    }

    db.prepare(
      `
        UPDATE notification_jobs
        SET state='pending',
           claim_token=NULL,
           lease_until=NULL,
           error=NULL,
           due_at=?,
           updated_at=?
        WHERE id=?
      `,
    ).run(Date.now(), new Date().toISOString(), job.id);
    recordAudit(db, req.serviceActor, 'platform.job-retried', job.id, job.group_id);
    res.json({ ok: true });
  });

  app.get('/internal/v1/control/audit', (req, res) =>
    res.json(db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 500').all()),
  );
}
