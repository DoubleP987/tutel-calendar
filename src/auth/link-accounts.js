import { db } from '../database/connection.js';
import { recordAudit } from '../groups/schema.js';

/** Called only after both the current session and a fresh provider OAuth callback are proved. */
export function mergeVerifiedAccount(targetId, sourceId) {
  if (targetId === sourceId) {
    return;
  }

  const source = db.prepare('SELECT * FROM users WHERE id=?').get(sourceId);
  const target = db.prepare('SELECT * FROM users WHERE id=?').get(targetId);

  if (!source || !target || source.blocked || target.blocked) {
    throw new Error('blocked-account');
  }

  const rank = { member: 0, editor: 1, manager: 2, owner: 3 };
  db.exec('BEGIN IMMEDIATE');

  try {
    for (const membership of db
      .prepare('SELECT * FROM memberships WHERE user_id=?')
      .all(sourceId)) {
      const previous = db
        .prepare('SELECT * FROM memberships WHERE group_id=? AND user_id=?')
        .get(membership.group_id, targetId);

      if (previous) {
        db.prepare(
          'UPDATE memberships SET role=?,blocked=?,auto_approve=? WHERE group_id=? AND user_id=?',
        ).run(
          rank[membership.role] > rank[previous.role] ? membership.role : previous.role,
          previous.blocked || membership.blocked ? 1 : 0,
          previous.auto_approve || membership.auto_approve ? 1 : 0,
          membership.group_id,
          targetId,
        );
      } else {
        db.prepare('INSERT INTO memberships VALUES (?,?,?,?,?,?,?)').run(
          membership.group_id,
          targetId,
          membership.role,
          membership.blocked,
          membership.auto_approve,
          membership.preferences,
          membership.joined_at,
        );
      }
    }

    db.prepare('DELETE FROM memberships WHERE user_id=?').run(sourceId);
    db.prepare(
      `
        INSERT OR IGNORE INTO membership_exits SELECT group_id,
           ?,
           exited_at
        FROM membership_exits
        WHERE user_id=?
      `,
    ).run(targetId, sourceId);
    db.prepare('DELETE FROM membership_exits WHERE user_id=?').run(sourceId);
    db.prepare('DELETE FROM account_views WHERE user_id=?').run(sourceId);
    db.prepare('UPDATE ownership_requests SET from_user=? WHERE from_user=?').run(
      targetId,
      sourceId,
    );
    db.prepare('UPDATE ownership_requests SET to_user=? WHERE to_user=?').run(targetId, sourceId);
    db.prepare('DELETE FROM ownership_requests WHERE from_user=to_user').run();
    db.prepare('UPDATE events SET owner_id=? WHERE owner_id=?').run(targetId, sourceId);
    db.prepare('UPDATE events SET reviewed_by=? WHERE reviewed_by=?').run(targetId, sourceId);
    db.prepare(
      `
        DELETE
        FROM notifications
        WHERE user_id=? AND dedupe IN (SELECT dedupe
        FROM notifications
        WHERE user_id=?)
      `,
    ).run(sourceId, targetId);
    db.prepare('UPDATE notifications SET user_id=? WHERE user_id=?').run(targetId, sourceId);
    db.prepare('UPDATE push_subscriptions SET user_id=? WHERE user_id=?').run(targetId, sourceId);
    db.prepare('UPDATE identities SET user_id=? WHERE user_id=?').run(targetId, sourceId);

    if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='feedback'").get()) {
      db.prepare('UPDATE feedback SET user_id=? WHERE user_id=?').run(targetId, sourceId);
    }

    db.prepare('DELETE FROM sessions WHERE user_id=?').run(sourceId);
    db.prepare('DELETE FROM oauth_states WHERE link_user_id=?').run(sourceId);
    db.prepare('UPDATE users SET platform_admin=?,role=? WHERE id=?').run(
      target.platform_admin || source.platform_admin ? 1 : 0,
      target.role === 'manager' || source.role === 'manager' ? 'manager' : 'member',
      targetId,
    );
    db.prepare('DELETE FROM users WHERE id=?').run(sourceId);
    recordAudit(db, targetId, 'account.linked-and-merged', sourceId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
