import { db } from '../database/connection.js';
import { member, csrf } from '../auth/oauth.js';
import { groupContext, requireGroupMember, manageGroup } from '../groups/access.js';
import { recordAudit } from '../groups/schema.js';
import { notify, published } from '../notifications/service.js';
import { preferences, calendarSettings } from '../members/preferences.js';
import { publishedEvents } from './published.js';
import { validate } from './routes.js';
import { occurrences } from './recurrence.js';

export function initializeWorkflow() {
  const columns = new Set(
    db
      .prepare('PRAGMA table_info(events)')
      .all()
      .map((c) => c.name),
  );

  for (const [name, type] of [
    ['lifecycle', "TEXT NOT NULL DEFAULT 'active'"],
    ['deleted_at', 'INTEGER'],
    ['previous_lifecycle', 'TEXT'],
    ['recurrence', "TEXT NOT NULL DEFAULT '{}'"],
    ['revision', 'INTEGER NOT NULL DEFAULT 1'],
  ]) {
    if (!columns.has(name)) {
      db.exec(`ALTER TABLE events ADD COLUMN ${name} ${type}`);
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS event_exceptions ( event_id TEXT NOT NULL,
       occurrence_date TEXT NOT NULL,
       cancelled INTEGER NOT NULL DEFAULT 0,
       PRIMARY KEY(event_id,
       occurrence_date) );
  `);

  if (
    !db
      .prepare('PRAGMA table_info(event_exceptions)')
      .all()
      .some((c) => c.name === 'override_data')
  ) {
    db.exec("ALTER TABLE event_exceptions ADD COLUMN override_data TEXT NOT NULL DEFAULT '{}'");
  }
}

export function recurrenceRule(input, start) {
  if (!input || input.frequency === 'none') {
    return '{}';
  }

  if (!['daily', 'weekly', 'monthly'].includes(input.frequency)) {
    throw new Error('รูปแบบกิจกรรมซ้ำไม่ถูกต้อง');
  }

  const until = String(input.until || '');
  const end = new Date(until + 'T00:00:00Z');
  const beginning = new Date(start + 'T00:00:00Z');

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(until) ||
    !Number.isFinite(end.valueOf()) ||
    end.toISOString().slice(0, 10) !== until ||
    end < beginning ||
    end - beginning > 366 * 86400000
  ) {
    throw new Error('วันสิ้นสุดการทำซ้ำต้องอยู่ภายในหนึ่งปีหลังวันเริ่ม');
  }

  return JSON.stringify({ frequency: input.frequency, until });
}

export function notifyEventChange(event, action) {
  // Do not deliver stale, queued snapshots after edits or cancellation.
  db.prepare(
    `
      UPDATE notification_jobs
      SET state='expired',
         claim_token=NULL,
         lease_until=NULL,
         updated_at=?
      WHERE group_id=? AND state IN ('pending',
         'claimed') AND EXISTS (SELECT 1
      FROM json_each(notification_jobs.payload,
         '$.events') e
      WHERE json_extract(e.value,
         '$.id')=? OR json_extract(e.value,
         '$.series_id')=?)
    `,
  ).run(new Date().toISOString(), event.group_id, event.id, event.id);
}

function writable(req, event) {
  return (
    event &&
    !event.source_id &&
    event.data_scope === 'group' &&
    (['owner', 'manager', 'editor'].includes(req.membership.role) ||
      event.owner_id === req.session.id)
  );
}

export function cleanupEventTrash() {
  const items = db
    .prepare("SELECT id FROM events WHERE lifecycle='trash' AND deleted_at<=?")
    .all(Date.now() - 30 * 86400000);

  for (const event of items) {
    db.prepare('DELETE FROM event_exceptions WHERE event_id=?').run(event.id);
    db.prepare('DELETE FROM events WHERE id=?').run(event.id);
  }
}

export function registerWorkflow(app) {
  app.get('/api/group/events', member, groupContext, requireGroupMember, manageGroup, (req, res) =>
    res.json(
      db
        .prepare(
          `
            SELECT e.*,
               u.name AS owner_name
            FROM events e
            LEFT JOIN users u ON u.id=e.owner_id
            WHERE group_id=? AND data_scope='group' AND lifecycle<>'trash'
            ORDER BY date DESC
            LIMIT 1000
          `,
        )
        .all(req.group.id),
    ),
  );

  app.get('/api/events/trash', member, groupContext, requireGroupMember, (req, res) => {
    const manager = ['owner', 'manager'].includes(req.membership.role);
    res.json(
      db
        .prepare(
          `
            SELECT *
            FROM events
            WHERE group_id=? AND lifecycle='trash' AND deleted_at>? AND (? OR owner_id=?)
            ORDER BY deleted_at DESC
          `,
        )
        .all(req.group.id, Date.now() - 30 * 86400000, manager ? 1 : 0, req.session.id),
    );
  });

  app.get('/api/events/:id/history', member, groupContext, requireGroupMember, (req, res) => {
    const event = db
      .prepare('SELECT * FROM events WHERE id=? AND group_id=?')
      .get(req.params.id, req.group.id);

    if (
      !event ||
      (!['owner', 'manager', 'editor'].includes(req.membership.role) &&
        event.owner_id !== req.session.id &&
        (event.status !== 'published' || event.lifecycle !== 'active'))
    ) {
      return res.status(404).json({ error: 'ไม่พบกิจกรรม' });
    }

    res.json(
      db
        .prepare(
          `
            SELECT a.action,
               a.created_at,
               u.name AS actor_name
            FROM audit_log a
            LEFT JOIN users u ON u.id=a.actor
            WHERE a.group_id=? AND a.target=?
            ORDER BY a.created_at DESC
            LIMIT 100
          `,
        )
        .all(req.group.id, event.id),
    );
  });

  app.post('/api/events/:id/action', member, csrf, groupContext, requireGroupMember, (req, res) => {
    const event = db
      .prepare('SELECT * FROM events WHERE id=? AND group_id=?')
      .get(req.params.id, req.group.id);

    if (!writable(req, event)) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์จัดการกิจกรรมนี้ หรือเป็นรายการจากต้นทาง' });
    }

    const action = req.body.action;

    if (
      !['trash', 'restore', 'cancel', 'submit', 'cancelOccurrence', 'editOccurrence'].includes(
        action,
      )
    ) {
      return res.status(400).json({ error: 'การทำงานไม่ถูกต้อง' });
    }

    const now = Date.now();

    if (
      action === 'restore' &&
      (event.lifecycle !== 'trash' || event.deleted_at <= now - 30 * 86400000)
    ) {
      return res.status(409).json({ error: 'พ้นกำหนดกู้คืนหรือไม่ได้อยู่ในถังขยะ' });
    }

    if (event.lifecycle === 'trash' && action !== 'restore') {
      return res.status(409).json({ error: 'กู้คืนก่อนจัดการกิจกรรม' });
    }

    if (
      action === 'restore' &&
      event.owner_id !== req.session.id &&
      !['owner', 'manager'].includes(req.membership.role)
    ) {
      return res.status(403).json({ error: 'เจ้าของกิจกรรมหรือผู้จัดการเท่านั้นที่กู้คืนได้' });
    }

    if (action === 'submit' && !['draft', 'cancelled'].includes(event.lifecycle)) {
      return res.status(409).json({ error: 'ไม่ใช่ฉบับร่าง' });
    }

    if (action === 'editOccurrence') {
      const occurrence = String(req.body.date || '');
      const config = calendarSettings(req.group.id);
      const approved =
        ['owner', 'manager'].includes(req.membership.role) ||
        config.approval === 'all' ||
        (config.approval === 'trusted' &&
          (req.membership.auto_approve || req.membership.role === 'editor'));

      if (!approved) {
        return res.status(409).json({
          error: 'การแก้เฉพาะครั้งต้องมีสิทธิ์เผยแพร่โดยไม่รอตรวจ หากต้องตรวจให้แก้ทั้งชุด',
        });
      }

      if (!occurrences(event).some((e) => e.series_id === event.id && e.date === occurrence)) {
        return res.status(400).json({ error: 'ไม่พบครั้งที่ต้องการแก้' });
      }

      let fields;

      try {
        fields = validate(req.body.event);
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }

      const names = [
        'title',
        'description',
        'date',
        'end_date',
        'time',
        'end_time',
        'all_day',
        'color',
        'category',
      ];
      const data = Object.fromEntries(names.map((name, i) => [name, fields[i]]));
      db.prepare(
        `
          INSERT OR REPLACE INTO event_exceptions (event_id,
             occurrence_date,
             cancelled,
             override_data)
          VALUES (?,
             ?,
             0,
             ?)
        `,
      ).run(event.id, occurrence, JSON.stringify(data));
      db.prepare('UPDATE events SET revision=revision+1 WHERE id=?').run(event.id);
    } else if (action === 'cancelOccurrence') {
      const occurrence = String(req.body.date || '');

      if (
        !publishedEvents(req.group.id).some(
          (e) => e.series_id === event.id && e.occurrence_date === occurrence,
        )
      ) {
        return res.status(400).json({ error: 'ไม่พบครั้งที่ต้องการยกเลิก' });
      }

      db.prepare(
        'INSERT OR REPLACE INTO event_exceptions (event_id,occurrence_date,cancelled) VALUES (?,?,1)',
      ).run(event.id, occurrence);
      db.prepare('UPDATE events SET revision=revision+1 WHERE id=?').run(event.id);
    } else if (action === 'trash') {
      db.prepare(
        `
          UPDATE events
          SET previous_lifecycle=lifecycle,
             lifecycle='trash',
             deleted_at=?,
             revision=revision+1
          WHERE id=?
        `,
      ).run(now, event.id);
    } else if (action === 'restore') {
      db.prepare(
        `
          UPDATE events
          SET lifecycle=COALESCE(previous_lifecycle,
             'active'),
             deleted_at=NULL,
             revision=revision+1
          WHERE id=?
        `,
      ).run(event.id);
    } else if (action === 'cancel') {
      db.prepare("UPDATE events SET lifecycle='cancelled',revision=revision+1 WHERE id=?").run(
        event.id,
      );
    } else {
      const config = calendarSettings(req.group.id);
      const approved =
        ['owner', 'manager'].includes(req.membership.role) ||
        config.approval === 'all' ||
        (config.approval === 'trusted' &&
          (req.membership.auto_approve || req.membership.role === 'editor'));
      db.prepare(
        "UPDATE events SET lifecycle='active',status=?,updated_at=?,revision=revision+1 WHERE id=?",
      ).run(approved ? 'published' : 'pending', new Date().toISOString(), event.id);

      if (approved) {
        published(event.id);
      } else if (config.adminNotifyPending) {
        for (const admin of db
          .prepare(
            "SELECT user_id FROM memberships WHERE group_id=? AND role IN ('owner','manager') AND blocked=0",
          )
          .all(event.group_id)) {
          notify(admin.user_id, {
            groupId: event.group_id,
            eventId: event.id,
            title: 'มีกิจกรรมรออนุมัติ',
            body: event.title,
            kind: 'review',
            dedupe: `submission:${event.id}:${event.revision + 1}`,
          });
        }
      }
    }

    recordAudit(db, req.session.id, `event.${action}`, event.id, req.group.id);
    const updated = db.prepare('SELECT * FROM events WHERE id=?').get(event.id);

    if (action === 'editOccurrence') {
      notifyEventChange(updated, 'updated');
    }

    if (
      event.status === 'published' &&
      event.lifecycle === 'active' &&
      ['trash', 'cancel', 'cancelOccurrence'].includes(action)
    ) {
      notifyEventChange(updated, 'cancelled');
    }

    res.json({ ok: true });
  });

  app.get(
    '/api/group/export',
    member,
    groupContext,
    requireGroupMember,
    manageGroup,
    (req, res) => {
      // Export group data, without emails, tokens, sessions or account identifiers.
      const events = db
        .prepare(
          `
            SELECT title,
               description,
               date,
               end_date,
               time,
               end_time,
               all_day,
               color,
               category,
               status,
               lifecycle,
               recurrence
            FROM events
            WHERE group_id=? AND data_scope='group' AND lifecycle<>'trash'
            ORDER BY date
          `,
        )
        .all(req.group.id);
      res.json({
        format: 'tutel-calendar-export-v1',
        exportedAt: new Date().toISOString(),
        group: { name: req.group.name, slug: req.group.slug },
        events,
      });
    },
  );
}
