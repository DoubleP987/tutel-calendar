import { db } from '../database/connection.js';
import { member, csrf } from '../auth/oauth.js';
import { calendarSettings } from './preferences.js';
import { groupContext, requireGroupMember, manageGroup } from '../groups/access.js';
import { validateMemberChange } from '../groups/invitations.js';
import { recordAudit } from '../groups/schema.js';

export function registerAdministration(app) {
  const readers = [member, groupContext, requireGroupMember];
  const guards = [...readers, manageGroup];

  app.get('/api/members', ...readers, (req, res) =>
    res.json(
      db
        .prepare(
          `
            SELECT u.id,
               u.name,
               u.provider,
               m.role,
               m.auto_approve,
               m.blocked,
               m.joined_at
            FROM users u
            JOIN memberships m ON m.user_id=u.id
            WHERE m.group_id=?
            ORDER BY u.name
          `,
        )
        .all(req.group.id)
        .map((user) =>
          req.session.platform_admin || ['owner', 'manager'].includes(req.membership?.role)
            ? {
                ...user,
                originalName:
                  db.prepare('SELECT provider_name FROM users WHERE id=?').get(user.id)
                    ?.provider_name || user.name,
                emails: db
                  .prepare(
                    'SELECT DISTINCT email FROM identities WHERE user_id=? AND email_verified=1 AND email IS NOT NULL',
                  )
                  .all(user.id)
                  .map((identity) => identity.email),
              }
            : user,
        ),
    ),
  );

  app.put(
    '/api/members/:id',
    member,
    csrf,
    groupContext,
    requireGroupMember,
    manageGroup,
    (req, res) => {
      try {
        const value = validateMemberChange(
          req.group.id,
          req.session.id,
          req.session.platform_admin ? 'owner' : req.membership.role,
          req.params.id,
          req.body,
        );
        db.prepare(
          'UPDATE memberships SET role=?,blocked=?,auto_approve=? WHERE group_id=? AND user_id=?',
        ).run(value.role, value.blocked, value.autoApprove, req.group.id, req.params.id);
        recordAudit(db, req.session.id, 'membership.updated', req.params.id, req.group.id);
        res.json({ ok: true });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    },
  );

  app.get('/api/admin-settings', ...guards, (req, res) => res.json(calendarSettings(req.group.id)));

  app.put(
    '/api/admin-settings',
    member,
    csrf,
    groupContext,
    requireGroupMember,
    manageGroup,
    (req, res) => {
      const value = { ...calendarSettings(req.group.id) };

      if (!['manual', 'trusted', 'all'].includes(req.body.approval)) {
        return res.status(400).json({ error: 'โหมดอนุมัติไม่ถูกต้อง' });
      }

      value.approval = req.body.approval;

      for (const key of ['adminNotifyPending', 'adminNotifyPublished']) {
        if (typeof req.body[key] === 'boolean') {
          value[key] = req.body[key];
        }
      }

      db.prepare('UPDATE groups SET settings=? WHERE id=?').run(
        JSON.stringify(value),
        req.group.id,
      );
      recordAudit(db, req.session.id, 'group.settings-updated', req.group.id, req.group.id);
      res.json(value);
    },
  );

  app.get('/api/group/audit', ...readers, (req, res) => {
    const page = Number(req.query.page || 1);

    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) {
      return res.status(400).json({ error: 'หน้าประวัติไม่ถูกต้อง' });
    }

    const items = db
      .prepare(
        `
          SELECT a.id,
             a.action,
             a.created_at,
             COALESCE(s.actor_name,
             u.name,
             CASE WHEN a.actor='system' THEN 'ระบบ' ELSE 'ผู้ใช้เดิม / ผู้ดูแลระบบ' END) AS actor_name,
             COALESCE(s.target_name,
             e.title,
             t.name,
             '') AS target_name
          FROM audit_log a
          LEFT JOIN audit_snapshots s ON s.audit_id=a.id
          LEFT JOIN users u ON u.id=a.actor
          LEFT JOIN events e ON e.id=a.target AND e.group_id=a.group_id AND (a.action LIKE '%event.%' OR a.action LIKE '%event-%')
          LEFT JOIN users t ON t.id=a.target AND (a.action LIKE '%membership%' OR a.action LIKE '%transfer%')
          WHERE a.group_id=?
          ORDER BY a.created_at DESC,
             a.id DESC
          LIMIT 51
          OFFSET ?
        `,
      )
      .all(req.group.id, (page - 1) * 50);
    res.json({ items: items.slice(0, 50), page, hasMore: items.length > 50 });
  });
}
