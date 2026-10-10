import { randomUUID } from 'node:crypto';
import { publishedEvents } from './published.js';
import { db } from '../database/connection.js';
import { member, manager, csrf } from '../auth/oauth.js';
import { categories } from './categories.js';
import { calendarSettings, preferences } from '../members/preferences.js';
import { notify, published } from '../notifications/service.js';
import { groupContext, readGroup, requireGroupMember } from '../groups/access.js';
import { recordAudit } from '../groups/schema.js';

function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error('วันที่ไม่ถูกต้อง');
  const parsed = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value)
    throw new Error('วันที่ไม่มีอยู่จริง');
  return value;
}
export function validate(input) {
  const title = String(input.title || '').trim();
  if (!title || title.length > 160) throw new Error('ชื่อกิจกรรมต้องมี 1–160 ตัวอักษร');
  const start = date(input.date),
    end = date(input.endDate || start);
  const allDay = !!input.allDay;
  const time = allDay ? '' : input.time,
    endTime = allDay ? '' : input.endTime;
  if (
    !allDay &&
    ![time, endTime].every((v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v))
  )
    throw new Error('ระบุเวลาเริ่มและสิ้นสุด');
  if (end < start || (!allDay && end === start && endTime <= time))
    throw new Error('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม');
  if (!/^#[a-f\d]{6}$/i.test(input.color || '')) throw new Error('สีไม่ถูกต้อง');
  if (!categories.some((c) => c.id === input.category)) throw new Error('หมวดไม่ถูกต้อง');
  if (String(input.description || '').length > 2000)
    throw new Error('รายละเอียดเกิน 2,000 ตัวอักษร');
  return [
    title,
    String(input.description || ''),
    start,
    end,
    time,
    endTime,
    allDay ? 1 : 0,
    input.color,
    input.category,
  ];
}
export function registerEvents(app) {
  app.get('/api/events', groupContext, readGroup, (req, res) =>
    res.json(
      publishedEvents(req.group.id, { includeGroup: Boolean(req.membership) }).map(
        ({ owner_id, reviewed_by, review_note, ...publicEvent }) => publicEvent,
      ),
    ),
  );
  app.get('/api/mine', member, groupContext, requireGroupMember, (req, res) =>
    res.json(
      db
        .prepare('SELECT * FROM events WHERE owner_id=? AND group_id=? ORDER BY updated_at DESC')
        .all(req.session.id, req.group.id),
    ),
  );
  app.post('/api/events', member, csrf, groupContext, requireGroupMember, (req, res) => {
    try {
      const count = db
        .prepare('SELECT count(*) n FROM events WHERE owner_id=? AND created_at>?')
        .get(req.session.id, new Date(Date.now() - 86400000).toISOString()).n;
      if (count >= 20) return res.status(429).json({ error: 'ส่งได้ไม่เกิน 20 กิจกรรมต่อวัน' });
      const fields = validate(req.body),
        id = randomUUID(),
        now = new Date().toISOString();
      const config = calendarSettings(req.group.id);
      const status =
        ['owner', 'manager'].includes(req.membership.role) ||
        config.approval === 'all' ||
        (config.approval === 'trusted' &&
          (req.membership.auto_approve || req.membership.role === 'editor'))
          ? 'published'
          : 'pending';
      db.prepare(
        `INSERT INTO events (id,owner_id,title,description,date,end_date,time,end_time,all_day,color,category,status,created_at,updated_at,group_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(id, req.session.id, ...fields, status, now, now, req.group.id);
      recordAudit(db, req.session.id, 'event.created', id, req.group.id);
      if (status === 'published') published(id);
      for (const admin of db
        .prepare(
          `SELECT u.* FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.group_id=? AND m.role IN ('owner','manager') AND m.blocked=0 AND u.blocked=0`,
        )
        .all(req.group.id)) {
        if (
          (status === 'pending' && config.adminNotifyPending) ||
          (status === 'published' && config.adminNotifyPublished)
        )
          notify(admin.id, {
            title: status === 'pending' ? 'มีกิจกรรมรออนุมัติ' : 'กิจกรรมอนุมัติอัตโนมัติ',
            body: `${req.session.name}: ${fields[0]}`,
            eventId: id,
            kind: 'review',
            dedupe: `admin:${id}`,
          });
      }
      res.status(201).json({ id, status });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
  app.get('/api/review', member, groupContext, requireGroupMember, manager, (req, res) =>
    res.json(
      db
        .prepare(
          `SELECT e.*,u.name AS owner_name FROM events e
    JOIN users u ON u.id=e.owner_id WHERE e.status='pending' AND e.group_id=? ORDER BY e.created_at`,
        )
        .all(req.group.id),
    ),
  );
  app.post(
    '/api/review/:id',
    member,
    csrf,
    groupContext,
    requireGroupMember,
    manager,
    (req, res) => {
      const status = req.body.status;
      if (!['published', 'rejected'].includes(status))
        return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
      const changed = db
        .prepare(
          `UPDATE events SET status=?,review_note=?,reviewed_by=?,updated_at=? WHERE id=? AND group_id=? AND status='pending'`,
        )
        .run(
          status,
          String(req.body.note || '').slice(0, 500),
          req.session.id,
          new Date().toISOString(),
          req.params.id,
          req.group.id,
        );
      if (!changed.changes) return res.status(409).json({ error: 'รายการนี้ถูกตรวจแล้วหรือไม่พบ' });
      const event = db.prepare('SELECT * FROM events WHERE id=?').get(req.params.id);
      const owner = db.prepare('SELECT * FROM users WHERE id=?').get(event.owner_id);
      if (owner && preferences(owner, req.group.id).notifyReview)
        notify(owner.id, {
          title: status === 'published' ? 'กิจกรรมของคุณได้รับอนุมัติ' : 'กิจกรรมไม่ได้รับอนุมัติ',
          body: event.title + (event.review_note ? ': ' + event.review_note : ''),
          eventId: event.id,
          kind: 'review',
          dedupe: `review:${event.id}`,
        });
      recordAudit(db, req.session.id, 'event.reviewed', event.id, req.group.id);
      if (status === 'published') published(event.id);
      res.json({ ok: true });
    },
  );
  app.put('/api/events/:id', member, csrf, groupContext, requireGroupMember, (req, res) => {
    const event = db
      .prepare('SELECT * FROM events WHERE id=? AND group_id=?')
      .get(req.params.id, req.group.id);
    if (!event) return res.status(404).json({ error: 'ไม่พบกิจกรรมในกลุ่มนี้' });
    const editor = ['owner', 'manager', 'editor'].includes(req.membership.role);
    if (!editor && !(event.owner_id === req.session.id && event.status === 'pending'))
      return res.status(403).json({ error: 'ไม่มีสิทธิ์แก้กิจกรรมนี้' });
    if (event.source_id)
      return res.status(409).json({ error: 'รายการนำเข้าแก้ที่ระบบต้นทางจนกว่าจะย้ายข้อมูลเสร็จ' });
    try {
      const fields = validate(req.body);
      db.prepare(
        `UPDATE events SET title=?,description=?,date=?,end_date=?,time=?,end_time=?,all_day=?,color=?,category=?,updated_at=? WHERE id=? AND group_id=?`,
      ).run(...fields, new Date().toISOString(), event.id, req.group.id);
      recordAudit(db, req.session.id, 'event.updated', event.id, req.group.id);
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
  app.delete('/api/events/:id', member, csrf, groupContext, requireGroupMember, (req, res) => {
    const event = db
      .prepare('SELECT * FROM events WHERE id=? AND group_id=?')
      .get(req.params.id, req.group.id);
    if (!event) return res.status(404).json({ error: 'ไม่พบกิจกรรมในกลุ่มนี้' });
    if (
      !['owner', 'manager', 'editor'].includes(req.membership.role) &&
      !(event.owner_id === req.session.id && event.status === 'pending')
    )
      return res.sendStatus(403);
    if (event.source_id)
      return res.status(409).json({ error: 'รายการนำเข้าต้องจัดการที่ต้นทางก่อน' });
    db.prepare('DELETE FROM events WHERE id=? AND group_id=?').run(event.id, req.group.id);
    recordAudit(db, req.session.id, 'event.deleted', event.id, req.group.id);
    res.json({ ok: true });
  });
}
