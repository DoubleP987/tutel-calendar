import { randomUUID } from 'node:crypto';
import webPush from 'web-push';
import { db } from '../database/connection.js';
import { member, csrf } from '../auth/oauth.js';
import { preferences } from '../members/preferences.js';
import { groupContext, requireGroupMember } from '../groups/access.js';
import { legacyGroupId } from '../groups/schema.js';

const configured = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

if (configured) {
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'https://calendar.toomtoom.online',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

export function unread(userId, groupId = null) {
  return db
    .prepare(
      `
        SELECT count(*) n
        FROM notifications n
        JOIN memberships m ON m.group_id=n.group_id AND m.user_id=n.user_id
        JOIN groups g ON g.id=n.group_id
        WHERE n.user_id=? AND n.read_at IS NULL AND m.blocked=0 AND g.suspended=0 AND (? IS NULL OR n.group_id=?)
      `,
    )
    .get(userId, groupId, groupId).n;
}

export function notify(userId, { title, body, eventId = null, groupId = null, kind, dedupe }) {
  // Event mutations remain in audit history; notifications are scheduled reminders only.
  if (['published', 'change', 'review'].includes(kind)) {
    return;
  }

  const event = eventId ? db.prepare('SELECT group_id FROM events WHERE id=?').get(eventId) : null;
  groupId ||= event?.group_id || legacyGroupId;
  const membership = db
    .prepare(
      `
        SELECT m.user_id
        FROM memberships m
        JOIN users u ON u.id=m.user_id
        JOIN groups g ON g.id=m.group_id
        WHERE m.user_id=? AND m.group_id=? AND m.blocked=0 AND u.blocked=0 AND g.suspended=0
      `,
    )
    .get(userId, groupId);

  if (!membership) {
    return;
  }

  const result = db
    .prepare(
      `
        INSERT OR IGNORE INTO notifications (id,
           user_id,
           title,
           body,
           event_id,
           kind,
           created_at,
           dedupe,
           group_id)
        VALUES (?,
           ?,
           ?,
           ?,
           ?,
           ?,
           ?,
           ?,
           ?)
      `,
    )
    .run(
      randomUUID(),
      userId,
      title,
      body,
      eventId,
      kind,
      new Date().toISOString(),
      `${groupId}:${dedupe}`,
      groupId,
    );

  if (!result.changes || !configured) {
    return;
  }

  const user = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
  const prefs = preferences(user, groupId);
  const clock = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
  const start = prefs.quietStart || '22:00';
  const end = prefs.quietEnd || '07:00';

  if (
    prefs.quietEnabled &&
    (start < end ? clock >= start && clock < end : clock >= start || clock < end)
  ) {
    return;
  }

  const rows = db.prepare('SELECT * FROM push_subscriptions WHERE user_id=?').all(userId);
  const payload = JSON.stringify({
    title,
    body,
    eventId,
    unread: unread(userId),
    groupId,
    url: `/g/${encodeURIComponent(db.prepare('SELECT slug FROM groups WHERE id=?').get(groupId).slug)}${eventId ? `?event=${encodeURIComponent(eventId)}` : '?notifications=1'}`,
  });

  for (const row of rows) {
    void webPush
      .sendNotification(JSON.parse(row.subscription), payload, { TTL: 3600, timeout: 10000 })
      .catch((error) => {
        if ([404, 410].includes(error.statusCode)) {
          db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(row.endpoint);
        } else {
          console.warn('[push] delivery unavailable:', error.statusCode || error.name);
        }
      });
  }
}

export function published(eventId) {
  const event = db.prepare('SELECT * FROM events WHERE id=?').get(eventId);

  if (!event || event.lifecycle !== 'active' || event.status !== 'published') {
    return;
  }

  for (const user of db
    .prepare(
      `
        SELECT u.*
        FROM users u
        JOIN memberships m ON m.user_id=u.id
        WHERE m.group_id=? AND m.blocked=0 AND u.blocked=0
      `,
    )
    .all(event.group_id)) {
    const prefs = preferences(user, event.group_id);

    if (prefs.notifyPublished && prefs.notifyCategories.includes(event.category)) {
      notify(user.id, {
        title: 'กิจกรรมใหม่ในปฏิทิน',
        body: event.title,
        eventId,
        kind: 'published',
        dedupe: `published:${eventId}`,
      });
    }
  }
}

function validSubscription(value) {
  try {
    const url = new URL(value.endpoint);
    const allowed = [
      'fcm.googleapis.com',
      'updates.push.services.mozilla.com',
      'push.services.mozilla.com',
      'web.push.apple.com',
      'notify.windows.com',
    ];
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === '443') &&
      allowed.some((host) => url.hostname === host || url.hostname.endsWith('.' + host)) &&
      typeof value.keys?.p256dh === 'string' &&
      typeof value.keys?.auth === 'string' &&
      /^[\w-]{80,100}={0,2}$/.test(value.keys.p256dh) &&
      /^[\w-]{20,30}={0,2}$/.test(value.keys.auth)
    );
  } catch {
    return false;
  }
}

export function registerNotifications(app) {
  app.get('/api/push-key', member, (req, res) =>
    res.json({ enabled: configured, publicKey: configured ? process.env.VAPID_PUBLIC_KEY : null }),
  );

  app.post('/api/push-subscriptions', member, csrf, (req, res) => {
    if (!configured) {
      return res.status(503).json({ error: 'ยังไม่ได้ตั้งค่า Web Push' });
    }

    if (!validSubscription(req.body)) {
      return res
        .status(400)
        .json({ error: 'Push subscription ไม่ถูกต้องหรือผู้ให้บริการยังไม่รองรับ' });
    }

    const count = db
      .prepare('SELECT count(*) n FROM push_subscriptions WHERE user_id=?')
      .get(req.session.id).n;
    const existing = db
      .prepare('SELECT endpoint FROM push_subscriptions WHERE endpoint=?')
      .get(req.body.endpoint);

    if (count >= 5 && !existing) {
      return res.status(400).json({ error: 'รองรับไม่เกิน 5 อุปกรณ์ต่อบัญชี' });
    }

    db.prepare(
      `
        INSERT INTO push_subscriptions
        VALUES (?,
           ?,
           ?,
           ?)
        ON CONFLICT(endpoint) DO UPDATE
        SET user_id=excluded.user_id,
           subscription=excluded.subscription
      `,
    ).run(req.body.endpoint, req.session.id, JSON.stringify(req.body), new Date().toISOString());
    res.json({ ok: true });
  });

  app.delete('/api/push-subscriptions', member, csrf, (req, res) => {
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?').run(
      String(req.body.endpoint || ''),
      req.session.id,
    );
    res.json({ ok: true });
  });

  app.post('/api/push-test', member, csrf, groupContext, requireGroupMember, (req, res) => {
    notify(req.session.id, {
      groupId: req.group.id,
      title: 'Tutel Calendar',
      body: 'เปิดแจ้งเตือนบนอุปกรณ์นี้แล้ว',
      kind: 'test',
      dedupe: `test:${Math.floor(Date.now() / 60000)}`,
    });
    res.json({ ok: true });
  });

  app.get('/api/notifications', member, groupContext, requireGroupMember, (req, res) =>
    res.json({
      unread: unread(req.session.id),
      groupUnread: unread(req.session.id, req.group.id),
      items: db
        .prepare(
          'SELECT * FROM notifications WHERE user_id=? AND group_id=? ORDER BY created_at DESC LIMIT 100',
        )
        .all(req.session.id, req.group.id),
    }),
  );

  app.post(
    '/api/notifications/read',
    member,
    csrf,
    groupContext,
    requireGroupMember,
    (req, res) => {
      db.prepare(
        'UPDATE notifications SET read_at=? WHERE user_id=? AND group_id=? AND read_at IS NULL',
      ).run(new Date().toISOString(), req.session.id, req.group.id);
      res.json({ ok: true });
    },
  );
}
