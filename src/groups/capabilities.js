import { db } from '../database/connection.js';

/** External assistance never creates a membership or notification entitlement. */
export function externalAccess(groupId, userId) {
  if (!userId) {
    return false;
  }

  return Boolean(
    db
      .prepare(
        `
          SELECT a.user_id
          FROM group_external_access a
          JOIN users u ON u.id=a.user_id
          WHERE a.group_id=? AND a.user_id=? AND u.blocked=0 AND NOT EXISTS (SELECT 1
          FROM memberships m
          WHERE m.group_id=a.group_id AND m.user_id=a.user_id)
        `,
      )
      .get(groupId, userId),
  );
}

export function mayDeleteEvent(req, event) {
  return Boolean(
    req.session &&
    event &&
    event.group_id === req.group.id &&
    event.data_scope === 'group' &&
    !event.source_id &&
    (['owner', 'manager', 'editor'].includes(req.membership?.role) ||
      (req.membership && event.owner_id === req.session.id) ||
      req.externalAccess),
  );
}

export function mayAnnounce(groupId, userId) {
  return Boolean(
    userId &&
    db
      .prepare(
        `
          SELECT m.user_id
          FROM memberships m
          JOIN users u ON u.id=m.user_id
          WHERE m.group_id=? AND m.user_id=? AND m.blocked=0 AND u.blocked=0 AND (m.role='owner' OR (m.role='manager' AND EXISTS ( SELECT 1
          FROM group_announcement_managers a
          WHERE a.group_id=m.group_id AND a.user_id=m.user_id)))
        `,
      )
      .get(groupId, userId),
  );
}
