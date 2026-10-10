import { db } from '../database/connection.js';
import { recordAudit } from './schema.js';

const retentionMs = 30 * 86400000;

/** Pause access without destroying account identities or the shared general calendar. */
export function trashGroup(group, actor) {
  const now = Date.now();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT INTO group_trash VALUES (?,?,?,?,?,?,?,NULL)').run(
      group.id,
      group.slug,
      group.name,
      actor,
      now,
      now + retentionMs,
      group.suspended,
    );
    db.prepare('UPDATE groups SET suspended=1 WHERE id=?').run(group.id);
    db.prepare('DELETE FROM ownership_requests WHERE group_id=?').run(group.id);
    db.prepare('UPDATE users SET last_group_id=NULL WHERE last_group_id=?').run(group.id);
    db.prepare('UPDATE invitations SET revoked=1 WHERE group_id=?').run(group.id);
    db.prepare(
      `UPDATE invitation_delivery SET state='cancelled',url=NULL,updated_at=?
      WHERE state='queued' AND invitation_id IN (SELECT id FROM invitations WHERE group_id=?)`,
    ).run(now, group.id);
    db.prepare(
      `UPDATE notification_jobs SET state='expired',claim_token=NULL,lease_until=NULL,updated_at=?
      WHERE group_id=? AND state IN ('pending','claimed')`,
    ).run(new Date(now).toISOString(), group.id);
    recordAudit(db, actor, 'group.trashed', group.id, group.id);
    db.exec('COMMIT');
    return { purgeAfter: now + retentionMs };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function restoreGroup(trash, actor) {
  if (trash.purged_at || trash.purge_after <= Date.now()) throw new Error('พ้นกำหนดกู้คืนแล้ว');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('UPDATE groups SET suspended=? WHERE id=?').run(
      trash.previous_suspended,
      trash.group_id,
    );
    db.prepare('DELETE FROM group_trash WHERE group_id=?').run(trash.group_id);
    recordAudit(db, actor, 'group.restored', trash.group_id, trash.group_id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** Expired trash is removed in dependency order; keep a tombstone to prevent legacy recreation. */
export function purgeExpiredGroups() {
  const expired = db
    .prepare('SELECT * FROM group_trash WHERE purged_at IS NULL AND purge_after<=?')
    .all(Date.now());
  for (const item of expired) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        'DELETE FROM invitation_delivery WHERE invitation_id IN (SELECT id FROM invitations WHERE group_id=?)',
      ).run(item.group_id);
      for (const table of [
        'ownership_requests',
        'membership_exits',
        'notification_jobs',
        'discord_bindings',
        'invitations',
        'notifications',
        'memberships',
      ])
        db.prepare(`DELETE FROM ${table} WHERE group_id=?`).run(item.group_id);
      db.prepare(
        "DELETE FROM event_exceptions WHERE event_id IN (SELECT id FROM events WHERE group_id=? AND data_scope='group')",
      ).run(item.group_id);
      db.prepare("DELETE FROM events WHERE group_id=? AND data_scope='group'").run(item.group_id);
      db.prepare('UPDATE users SET last_group_id=NULL WHERE last_group_id=?').run(item.group_id);
      db.prepare('DELETE FROM groups WHERE id=?').run(item.group_id);
      db.prepare("UPDATE group_trash SET purged_at=?,name='',deleted_by='' WHERE group_id=?").run(
        Date.now(),
        item.group_id,
      );
      recordAudit(db, 'system', 'group.purged', item.group_id, item.group_id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      console.error('[group-trash]', error.name);
    }
  }
}
