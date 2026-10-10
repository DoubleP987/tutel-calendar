import { db } from '../database/connection.js';
import { member, csrf } from '../auth/oauth.js';
import { calendarSettings } from './preferences.js';
import { groupContext, requireGroupMember, manageGroup } from '../groups/access.js';
import { validateMemberChange } from '../groups/invitations.js';
import { recordAudit } from '../groups/schema.js';

export function registerAdministration(app) {
  const guards = [member, groupContext, requireGroupMember, manageGroup];
  app.get('/api/members', ...guards, (req, res) =>
    res.json(
      db
        .prepare(
          `SELECT u.id,u.name,u.provider,m.role,m.auto_approve,m.blocked FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.group_id=? ORDER BY u.name`,
        )
        .all(req.group.id),
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
      if (!['manual', 'trusted', 'all'].includes(req.body.approval))
        return res.status(400).json({ error: 'โหมดอนุมัติไม่ถูกต้อง' });
      value.approval = req.body.approval;
      for (const key of ['adminNotifyPending', 'adminNotifyPublished'])
        if (typeof req.body[key] === 'boolean') value[key] = req.body[key];
      db.prepare('UPDATE groups SET settings=? WHERE id=?').run(
        JSON.stringify(value),
        req.group.id,
      );
      recordAudit(db, req.session.id, 'group.settings-updated', req.group.id, req.group.id);
      res.json(value);
    },
  );
  app.get('/api/group/audit', ...guards, (req, res) =>
    res.json(
      db
        .prepare('SELECT * FROM audit_log WHERE group_id=? ORDER BY created_at DESC LIMIT 200')
        .all(req.group.id),
    ),
  );
}
