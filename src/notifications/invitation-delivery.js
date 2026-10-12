import { db } from '../database/connection.js';
import { sendInvitationEmail } from './email.js';

/** Persist mail work before responding. Never automatically retry an ambiguous SMTP send. */
export function initializeInvitationDelivery() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS invitation_delivery ( invitation_id TEXT PRIMARY KEY REFERENCES invitations(id),
       url TEXT,
       state TEXT NOT NULL,
       reason TEXT,
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL );
  `);
}

export function queueInvitation(invitation) {
  db.prepare(
    `
      INSERT INTO invitation_delivery
      VALUES (?,
         ?,
         'queued',
         NULL,
         ?,
         ?)
      ON CONFLICT(invitation_id) DO UPDATE
      SET url=excluded.url,
         state='queued',
         reason=NULL,
         created_at=excluded.created_at,
         updated_at=excluded.updated_at
    `,
  ).run(invitation.id, invitation.url, Date.now(), Date.now());
  return { status: 'queued' };
}

export function startInvitationDelivery() {
  // A restart during SMTP leaves an unknown outcome; sending again could duplicate mail.
  db.prepare(
    "UPDATE invitation_delivery SET state='uncertain',url=NULL WHERE state='sending'",
  ).run();
  let stopped = false;
  let running;

  const tick = async () => {
    if (stopped || running) {
      return;
    }

    running = (async () => {
      db.prepare(
        `
          UPDATE invitation_delivery
          SET state='cancelled',
             url=NULL
          WHERE state='queued' AND invitation_id IN (SELECT id
          FROM invitations
          WHERE revoked=1 OR (expires_at<>0 AND expires_at<=?) OR uses>=max_uses)
        `,
      ).run(Date.now());
      const item = db
        .prepare(
          `
            SELECT d.url,
               i.id,
               i.email,
               i.expires_at,
               g.name
            FROM invitation_delivery d
            JOIN invitations i ON i.id=d.invitation_id
            JOIN groups g ON g.id=i.group_id
            WHERE d.state='queued' AND g.suspended=0
            ORDER BY d.created_at
            LIMIT 1
          `,
        )
        .get();

      if (!item) {
        return;
      }

      db.prepare(
        "UPDATE invitation_delivery SET state='sending',updated_at=? WHERE invitation_id=?",
      ).run(Date.now(), item.id);
      const result = await sendInvitationEmail(
        { email: item.email, url: item.url, expiresAt: item.expires_at },
        item.name,
      );
      db.prepare(
        'UPDATE invitation_delivery SET state=?,reason=?,url=NULL,updated_at=? WHERE invitation_id=?',
      ).run(result.status, result.reason || null, Date.now(), item.id);
    })();

    try {
      await running;
    } catch (error) {
      console.error('[invitation-delivery]', error.name);
    } finally {
      running = null;
    }
  };

  const timer = setInterval(tick, 2000);
  timer.unref();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await running;
  };
}
