import { db } from '../database/connection.js';
import { categories, defaultPreferences } from '../events/categories.js';
import { groupContext, requireGroupMember } from '../groups/access.js';
import { member, csrf } from '../auth/oauth.js';
const categoryIds = new Set(categories.map((c) => c.id));
export function preferences(user, groupId = null) {
  const saved =
    groupId && user?.id
      ? db
          .prepare('SELECT preferences FROM memberships WHERE group_id=? AND user_id=?')
          .get(groupId, user.id)?.preferences
      : user?.preferences;
  try {
    return { ...defaultPreferences, ...JSON.parse(saved || '{}') };
  } catch {
    return { ...defaultPreferences };
  }
}
export function calendarSettings(groupId) {
  const value = db.prepare('SELECT settings FROM groups WHERE id=?').get(groupId)?.settings;
  return {
    approval: 'manual',
    adminNotifyPending: true,
    adminNotifyPublished: false,
    ...JSON.parse(value || '{}'),
  };
}
export function registerPreferences(app) {
  app.get('/api/catalog', (req, res) => res.json({ categories, defaults: defaultPreferences }));
  app.get('/api/preferences', member, groupContext, requireGroupMember, (req, res) =>
    res.json(preferences(req.session, req.group.id)),
  );
  app.put('/api/preferences', member, csrf, groupContext, requireGroupMember, (req, res) => {
    const value = { ...preferences(req.session, req.group.id) };
    for (const key of ['categories', 'notifyCategories']) {
      if (req.body[key] !== undefined) {
        if (!Array.isArray(req.body[key]) || req.body[key].some((id) => !categoryIds.has(id)))
          return res.status(400).json({ error: 'หมวดไม่ถูกต้อง' });
        value[key] = [...new Set(req.body[key])];
      }
    }
    if (req.body.view !== undefined) {
      if (!['month', 'week', 'list'].includes(req.body.view))
        return res.status(400).json({ error: 'มุมมองไม่ถูกต้อง' });
      value.view = req.body.view;
    }
    for (const key of ['notifyPublished', 'notifyReview', 'notifyReminders']) {
      if (req.body[key] !== undefined) {
        if (typeof req.body[key] !== 'boolean')
          return res.status(400).json({ error: 'ค่าตั้งไม่ถูกต้อง' });
        value[key] = req.body[key];
      }
    }
    if (req.body.leadMinutes !== undefined) {
      if (![0, 5, 15, 30, 60, 1440].includes(req.body.leadMinutes))
        return res.status(400).json({ error: 'เวลาเตือนไม่ถูกต้อง' });
      value.leadMinutes = req.body.leadMinutes;
    }
    if (req.body.dayTime !== undefined) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(req.body.dayTime))
        return res.status(400).json({ error: 'เวลาไม่ถูกต้อง' });
      value.dayTime = req.body.dayTime;
    }
    db.prepare('UPDATE memberships SET preferences=? WHERE group_id=? AND user_id=?').run(
      JSON.stringify(value),
      req.group.id,
      req.session.id,
    );
    res.json(value);
  });
}
