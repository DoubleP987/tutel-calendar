import { randomUUID } from 'node:crypto';
import { db } from '../database/connection.js';
import { member, csrf } from './oauth.js';
import { recordAudit } from '../groups/schema.js';

export function initializeAccountSettings() {
  db.exec(`CREATE TABLE IF NOT EXISTS session_details (
    session_hash TEXT PRIMARY KEY REFERENCES sessions(hash) ON DELETE CASCADE,
    id TEXT NOT NULL UNIQUE, device TEXT NOT NULL, created_at TEXT NOT NULL
  );`);
  for (const row of db
    .prepare(
      'SELECT hash FROM sessions WHERE hash NOT IN (SELECT session_hash FROM session_details)',
    )
    .all())
    recordSession(row.hash);
}
export function recordSession(hash, agent = '') {
  const device = /iPad/i.test(agent)
    ? 'iPad'
    : /iPhone/i.test(agent)
      ? 'iPhone'
      : /Android/i.test(agent)
        ? 'Android'
        : /Windows/i.test(agent)
          ? 'Windows'
          : /Mac/i.test(agent)
            ? 'Mac'
            : /Linux/i.test(agent)
              ? 'Linux'
              : 'อุปกรณ์อื่น';
  db.prepare('INSERT INTO session_details VALUES (?,?,?,?)').run(
    hash,
    randomUUID(),
    device,
    new Date().toISOString(),
  );
}
export function registerAccountSettings(app) {
  app.get('/api/accounts', member, (req, res) =>
    res.json(
      db
        .prepare(
          'SELECT provider,email,email_verified FROM identities WHERE user_id=? ORDER BY provider',
        )
        .all(req.session.id),
    ),
  );
  app.delete('/api/accounts/:provider', member, csrf, (req, res) => {
    const identities = db.prepare('SELECT * FROM identities WHERE user_id=?').all(req.session.id);
    const remaining = identities.filter((i) => i.provider !== req.params.provider);
    if (!remaining.length || remaining.length === identities.length)
      return res.status(409).json({ error: 'ต้องเหลือบัญชีสำหรับเข้าสู่ระบบอย่างน้อยหนึ่งบัญชี' });
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM identities WHERE user_id=? AND provider=?').run(
        req.session.id,
        req.params.provider,
      );
      if (req.session.provider === req.params.provider)
        db.prepare('UPDATE users SET provider=?,subject=? WHERE id=?').run(
          remaining[0].provider,
          remaining[0].subject,
          req.session.id,
        );
      db.prepare('DELETE FROM sessions WHERE user_id=? AND hash<>?').run(
        req.session.id,
        req.session.hash,
      );
      recordAudit(db, req.session.id, 'account.unlinked', req.params.provider);
      db.exec('COMMIT');
      res.json({ ok: true });
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
  app.get('/api/account/sessions', member, (req, res) =>
    res.json(
      db
        .prepare(
          `SELECT d.id,d.device,d.created_at,s.expires_at,s.hash=? AS current FROM sessions s JOIN session_details d ON d.session_hash=s.hash
    WHERE s.user_id=? AND s.expires_at>? ORDER BY d.created_at DESC`,
        )
        .all(req.session.hash, req.session.id, Date.now()),
    ),
  );
  app.delete('/api/account/sessions/:id', member, csrf, (req, res) => {
    const target = db
      .prepare(
        'SELECT s.hash FROM sessions s JOIN session_details d ON d.session_hash=s.hash WHERE s.user_id=? AND d.id=?',
      )
      .get(req.session.id, req.params.id);
    if (!target || target.hash === req.session.hash)
      return res.status(409).json({ error: 'ใช้ปุ่มออกจากระบบสำหรับอุปกรณ์ปัจจุบัน' });
    db.prepare('DELETE FROM sessions WHERE hash=?').run(target.hash);
    res.json({ ok: true });
  });
  app.post('/api/account/logout-others', member, csrf, (req, res) => {
    db.prepare('DELETE FROM sessions WHERE user_id=? AND hash<>?').run(
      req.session.id,
      req.session.hash,
    );
    res.json({ ok: true });
  });
}
