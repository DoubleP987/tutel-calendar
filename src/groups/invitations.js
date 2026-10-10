import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db } from '../database/connection.js';
import { recordAudit } from './schema.js';
import { managedRoles } from './access.js';

export const tokenHash = (value) => createHash('sha256').update(value).digest('hex');
export const normalizeEmail = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createInvitation(groupId, actor, input, actorRole = 'manager') {
  if (
    db
      .prepare(
        'SELECT count(*) n FROM invitations WHERE group_id=? AND revoked=0 AND expires_at>? AND uses<max_uses',
      )
      .get(groupId, Date.now()).n >= 1000
  )
    throw new Error('มีคำเชิญที่ใช้งานอยู่ครบ 1,000 รายการแล้ว');
  const kind = input.kind || (input.email ? 'email' : 'link');
  const role = input.role || 'member';
  if (!['link', 'email', 'code'].includes(kind)) throw new Error('วิธีเชิญไม่ถูกต้อง');
  if (
    !['member', 'editor', 'manager'].includes(role) ||
    (role === 'manager' && actorRole !== 'owner')
  )
    throw new Error('ไม่สามารถเชิญด้วยบทบาทนี้');
  const email = kind === 'email' ? normalizeEmail(input.email) : null;
  if (kind === 'email' && (!emailPattern.test(email) || email.length > 254))
    throw new Error('อีเมลไม่ถูกต้อง');
  const days = Number(input.days ?? 7),
    maxUses = Number(input.maxUses ?? 1);
  if (
    !Number.isInteger(days) ||
    days < 1 ||
    days > 30 ||
    !Number.isInteger(maxUses) ||
    maxUses < 1 ||
    maxUses > 500
  )
    throw new Error('อายุคำเชิญหรือจำนวนการใช้ไม่ถูกต้อง');
  if (
    email &&
    db
      .prepare(
        'SELECT id FROM invitations WHERE group_id=? AND email=? AND revoked=0 AND expires_at>? AND uses<max_uses',
      )
      .get(groupId, email, Date.now())
  )
    throw new Error('อีเมลนี้มีคำเชิญที่ยังใช้งานอยู่แล้ว');
  const token =
    kind === 'code'
      ? randomBytes(6).toString('hex').toUpperCase()
      : randomBytes(32).toString('base64url');
  const id = randomUUID(),
    now = new Date().toISOString(),
    expiresAt = Date.now() + days * 86400000;
  db.prepare(`INSERT INTO invitations VALUES (?,?,?,?,?,?,?,?,?,0,0,?,?)`).run(
    id,
    groupId,
    tokenHash(token),
    email,
    String(input.name || '').slice(0, 100),
    role,
    kind,
    expiresAt,
    email ? 1 : maxUses,
    actor,
    now,
  );
  recordAudit(db, actor, 'invitation.created', id, groupId);
  return {
    id,
    token,
    kind,
    email,
    role,
    expiresAt,
    url: `${process.env.BASE_URL || 'http://127.0.0.1:3100'}/invite/${token}`,
  };
}

export function acceptInvitation(invitation, user) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const live = db
      .prepare(
        `SELECT i.*,g.suspended FROM invitations i JOIN groups g ON g.id=i.group_id WHERE i.id=? AND i.revoked=0 AND i.expires_at>? AND i.uses<i.max_uses`,
      )
      .get(invitation.id, Date.now());
    if (
      !live ||
      live.suspended ||
      db.prepare('SELECT group_id FROM group_trash WHERE group_id=?').get(live.group_id)
    )
      throw new Error('คำเชิญหมดอายุ ถูกยกเลิก หรือใช้ครบแล้ว');
    if (
      live.email &&
      !db
        .prepare('SELECT subject FROM identities WHERE user_id=? AND email=? AND email_verified=1')
        .get(user.id, live.email)
    )
      throw new Error('กรุณาใช้บัญชีที่ยืนยันอีเมลตรงกับคำเชิญ');
    const previous = db
      .prepare('SELECT * FROM memberships WHERE group_id=? AND user_id=?')
      .get(live.group_id, user.id);
    if (previous?.blocked) throw new Error('สิทธิ์ในกลุ่มนี้ถูกระงับ กรุณาติดต่อผู้จัดการ');
    if (!previous) {
      db.prepare('INSERT INTO memberships VALUES (?,?,?,0,0,?,?)').run(
        live.group_id,
        user.id,
        live.role,
        '{}',
        new Date().toISOString(),
      );
      db.prepare('UPDATE invitations SET uses=uses+1 WHERE id=?').run(live.id);
      recordAudit(db, user.id, 'invitation.accepted', live.id, live.group_id);
      recordAudit(db, user.id, 'membership.joined', user.id, live.group_id);
    }
    db.exec('COMMIT');
    return live.group_id;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** Only provider-verified identities can claim an email invitation. No placeholder accounts. */
export function claimEmailInvitations(user) {
  const invitations = db
    .prepare(
      `SELECT DISTINCT i.* FROM invitations i JOIN identities a ON a.email=i.email
    WHERE a.user_id=? AND a.email_verified=1 AND i.kind='email' AND i.revoked=0 AND i.expires_at>? AND i.uses<i.max_uses
    AND NOT EXISTS (SELECT 1 FROM membership_exits x WHERE x.group_id=i.group_id AND x.user_id=a.user_id)`,
    )
    .all(user.id, Date.now());
  for (const invitation of invitations) {
    try {
      acceptInvitation(invitation, user);
    } catch {
      /* A blocked group or expired invite is not a login failure. */
    }
  }
}

export function invitationList(groupId) {
  return db
    .prepare(
      `SELECT i.id,i.email,i.name,i.role,i.kind,i.expires_at,i.max_uses,i.uses,i.revoked,i.created_at,
      d.state AS delivery_state,d.reason AS delivery_reason
      FROM invitations i LEFT JOIN invitation_delivery d ON d.invitation_id=i.id
      WHERE i.group_id=? ORDER BY i.created_at DESC LIMIT 500`,
    )
    .all(groupId);
}

/** RFC 4180-style quoted fields, BOM and CRLF; no spreadsheet formulas are executed. */
export function parseMemberCsv(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 100000)
    throw new Error('CSV ใหญ่เกิน 100 KB');
  text = text.replace(/^\uFEFF/, '');
  const rows = [],
    row = [];
  let field = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (!quoted && field) throw new Error('รูปแบบ CSV ไม่ถูกต้อง');
      else quoted = !quoted;
    } else if (!quoted && (c === ',' || c === '\n')) {
      row.push(field.replace(/\r$/, ''));
      field = '';
      if (c === '\n') {
        if (row.some((x) => x.trim())) rows.push([...row]);
        row.length = 0;
      }
    } else field += c;
  }
  if (quoted) throw new Error('CSV มีเครื่องหมายคำพูดไม่ครบ');
  row.push(field.replace(/\r$/, ''));
  if (row.some((x) => x.trim())) rows.push(row);
  const header = (rows.shift() || []).map((x) => x.trim().toLowerCase());
  if (!header.includes('email') || new Set(header).size !== header.length)
    throw new Error('CSV ต้องมีคอลัมน์ email และหัวตารางไม่ซ้ำ');
  if (rows.length > 500) throw new Error('นำเข้าได้ไม่เกิน 500 คนต่อครั้ง');
  const seen = new Set();
  return rows.map((fields, index) => {
    const value = Object.fromEntries(header.map((name, i) => [name, fields[i] || '']));
    const email = normalizeEmail(value.email),
      role = (value.role || '').trim() || 'member';
    const error = !emailPattern.test(email)
      ? 'อีเมลไม่ถูกต้อง'
      : seen.has(email)
        ? 'อีเมลซ้ำใน CSV'
        : !['member', 'editor'].includes(role)
          ? 'CSV เพิ่มได้เฉพาะสมาชิกหรือผู้แก้ไข'
          : null;
    seen.add(email);
    return { row: index + 2, email, name: (value.name || '').trim().slice(0, 100), role, error };
  });
}

export function validateMemberChange(groupId, actorId, actorRole, targetId, input) {
  const previous = db
    .prepare('SELECT * FROM memberships WHERE group_id=? AND user_id=?')
    .get(groupId, targetId);
  if (!previous) throw new Error('ไม่พบสมาชิกกลุ่มนี้');
  const role = input.role ?? previous.role,
    blocked = input.blocked === undefined ? previous.blocked : Number(input.blocked === true);
  if (!['manager', 'editor', 'member'].includes(role) && role !== previous.role)
    throw new Error('ใช้เมนูโอนเจ้าของเพื่อเปลี่ยนเจ้าของ');
  if (previous.role === 'owner' && (role !== 'owner' || blocked))
    throw new Error('ต้องโอนเจ้าของก่อน');
  if (actorId === targetId && (blocked || !managedRoles.has(role)))
    throw new Error('ไม่สามารถตัดสิทธิ์จัดการของตนเอง');
  if (actorRole !== 'owner' && (previous.role === 'manager' || role === 'manager'))
    throw new Error('เฉพาะเจ้าของที่จัดการผู้จัดการได้');
  return {
    role,
    blocked,
    autoApprove:
      input.autoApprove === undefined ? previous.auto_approve : Number(input.autoApprove === true),
  };
}
