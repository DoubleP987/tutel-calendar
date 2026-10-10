import { db } from '../database/connection.js';
import { legacyGroupId } from './schema.js';

export const managedRoles = new Set(['owner', 'manager']);
export const roles = ['owner', 'manager', 'editor', 'member'];

export function groupFor(value) {
  return db.prepare('SELECT * FROM groups WHERE id=? OR slug=?').get(value, value);
}

export function groupContext(req, res, next) {
  const value =
    req.get('x-calendar-group') || req.query.group || req.session?.last_group_id || legacyGroupId;

  if (typeof value !== 'string') {
    return res.status(400).json({ error: 'กลุ่มไม่ถูกต้อง' });
  }

  const group = groupFor(value);

  if (!group) {
    return res.status(404).json({ error: 'ไม่พบกลุ่ม' });
  }

  if (db.prepare('SELECT group_id FROM group_trash WHERE group_id=?').get(group.id)) {
    return res.status(410).json({ error: 'ปฏิทินนี้อยู่ในถังขยะ เจ้าของกู้คืนได้จากเมนูกลุ่ม' });
  }

  const membership =
    req.session &&
    db
      .prepare('SELECT * FROM memberships WHERE group_id=? AND user_id=?')
      .get(group.id, req.session.id);

  if (group.suspended && !req.session?.platform_admin) {
    return res.status(403).json({ error: 'กลุ่มนี้ถูกระงับ' });
  }

  if (membership?.blocked && !req.session?.platform_admin) {
    return res.status(403).json({ error: 'สิทธิ์ในกลุ่มนี้ถูกระงับ' });
  }

  req.group = group;
  req.membership = membership && !membership.blocked ? membership : null;

  if (req.session?.platform_admin) {
    req.membership ||= { role: 'manager', auto_approve: 0, preferences: '{}' };
  }

  next();
}

export function readGroup(req, res, next) {
  if (!req.membership && req.group.visibility !== 'public') {
    return res
      .status(req.session ? 403 : 401)
      .json({ error: 'ต้องได้รับคำเชิญเพื่อเข้าถึงกลุ่มนี้' });
  }

  next();
}

export function requireGroupMember(req, res, next) {
  if (!req.session) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
  }

  if (!req.membership) {
    return res.status(403).json({ error: 'ต้องได้รับคำเชิญเพื่อเข้าถึงกลุ่มนี้' });
  }

  next();
}

export function manageGroup(req, res, next) {
  if (!managedRoles.has(req.membership?.role)) {
    return res.status(403).json({ error: 'เฉพาะผู้จัดการกลุ่ม' });
  }

  next();
}

export function ownerGroup(req, res, next) {
  if (req.membership?.role !== 'owner' && !req.session?.platform_admin) {
    return res.status(403).json({ error: 'เฉพาะเจ้าของกลุ่ม' });
  }

  next();
}
