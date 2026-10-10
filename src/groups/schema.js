import { randomUUID } from 'node:crypto';

export const legacyGroupId = 'legacy-calendar';

/** Add tenant boundaries without replacing existing event or account identifiers. */
export function initializeGroups(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS group_trash (
      group_id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      deleted_by TEXT NOT NULL, deleted_at INTEGER NOT NULL, purge_after INTEGER NOT NULL,
      previous_suspended INTEGER NOT NULL, purged_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS group_trash_expiry ON group_trash(purge_after,purged_at);
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','public')),
      suspended INTEGER NOT NULL DEFAULT 0,
      settings TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memberships (
      group_id TEXT NOT NULL REFERENCES groups(id), user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL CHECK(role IN ('owner','manager','editor','member')),
      blocked INTEGER NOT NULL DEFAULT 0, auto_approve INTEGER NOT NULL DEFAULT 0,
      preferences TEXT NOT NULL DEFAULT '{}', joined_at TEXT NOT NULL,
      PRIMARY KEY(group_id,user_id)
    );
    CREATE TABLE IF NOT EXISTS identities (
      provider TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id),
      email TEXT, email_verified INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(provider,subject)
    );
    CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id), token_hash TEXT UNIQUE,
      email TEXT, name TEXT NOT NULL DEFAULT '', role TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('link','email','code')),
      expires_at INTEGER NOT NULL, max_uses INTEGER NOT NULL DEFAULT 1, uses INTEGER NOT NULL DEFAULT 0,
      revoked INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY, group_id TEXT, actor TEXT NOT NULL,
      action TEXT NOT NULL, target TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS audit_group_history ON audit_log(group_id,created_at DESC,id DESC);
    CREATE TABLE IF NOT EXISTS audit_snapshots (
      audit_id TEXT PRIMARY KEY REFERENCES audit_log(id) ON DELETE CASCADE,
      actor_name TEXT NOT NULL, target_name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS discord_bindings (
      id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id),
      guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
      config TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL,
      UNIQUE(group_id,guild_id,channel_id)
    );
    CREATE TABLE IF NOT EXISTS discord_connection_grants (
      hash TEXT PRIMARY KEY, discord_user_id TEXT NOT NULL, guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notification_jobs (
      id TEXT PRIMARY KEY, binding_id TEXT NOT NULL REFERENCES discord_bindings(id),
      group_id TEXT NOT NULL REFERENCES groups(id), dedupe TEXT NOT NULL UNIQUE,
      due_at INTEGER NOT NULL, payload TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending', claim_token TEXT, lease_until INTEGER,
      attempts INTEGER NOT NULL DEFAULT 0, message_id TEXT, error TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS jobs_due ON notification_jobs(state,due_at);
    CREATE INDEX IF NOT EXISTS memberships_user ON memberships(user_id,blocked);
    CREATE INDEX IF NOT EXISTS invitations_email ON invitations(email,revoked,expires_at);
  `);
  const add = (table, name, type) => {
    if (
      !db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .some((column) => column.name === name)
    )
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  };
  add('events', 'group_id', "TEXT NOT NULL DEFAULT 'legacy-calendar'");
  add(
    'events',
    'data_scope',
    "TEXT NOT NULL DEFAULT 'group' CHECK(data_scope IN ('group','shared'))",
  );
  // Imported general dates are one shared dataset, never copied for each group.
  if (!db.prepare("SELECT key FROM settings WHERE key='shared-calendar-v1'").get()) {
    db.prepare(
      `UPDATE events SET data_scope='shared'
      WHERE group_id=? AND owner_id IS NULL AND sample=0 AND source_id<>''
      AND category IN ('holiday','important')`,
    ).run(legacyGroupId);
    db.prepare("INSERT INTO settings VALUES ('shared-calendar-v1','1')").run();
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS events_shared_date ON events(date,end_date)
      WHERE data_scope='shared' AND status='published';
    CREATE INDEX IF NOT EXISTS events_local_date ON events(group_id,date,end_date)
      WHERE data_scope='group' AND status='published';
  `);
  add('notifications', 'group_id', "TEXT NOT NULL DEFAULT 'legacy-calendar'");
  add('users', 'platform_admin', 'INTEGER NOT NULL DEFAULT 0');
  add('users', 'last_group_id', 'TEXT');
  add('oauth_states', 'return_to', "TEXT NOT NULL DEFAULT '/'");
  add('oauth_states', 'link_user_id', 'TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS events_group ON events(group_id,status,date)');
  if (!db.prepare('SELECT group_id FROM group_trash WHERE group_id=?').get(legacyGroupId))
    db.prepare(`INSERT OR IGNORE INTO groups VALUES (?,?,?,'public',0,?,?)`).run(
      legacyGroupId,
      'cs-skru',
      'CS SKRU',
      db.prepare("SELECT value FROM settings WHERE key='calendar'").get()?.value || '{}',
      new Date().toISOString(),
    );
  // Bootstrap only once. Later sign-ins cannot recreate revoked membership.
  if (!db.prepare("SELECT key FROM settings WHERE key='group-migration-v1'").get()) {
    const users = db.prepare('SELECT * FROM users ORDER BY rowid').all();
    let ownerAssigned = false;
    for (const user of users) {
      const role = user.role === 'manager' ? (ownerAssigned ? 'manager' : 'owner') : 'member';
      if (role === 'owner') ownerAssigned = true;
      db.prepare('INSERT OR IGNORE INTO memberships VALUES (?,?,?,0,?,?,?)').run(
        legacyGroupId,
        user.id,
        role,
        user.auto_approve,
        user.preferences,
        new Date().toISOString(),
      );
      if (user.role === 'manager')
        db.prepare('UPDATE users SET platform_admin=1 WHERE id=?').run(user.id);
    }
    db.prepare("INSERT INTO settings VALUES ('group-migration-v1','1')").run();
  }
  for (const user of db.prepare('SELECT id,provider,subject FROM users').all())
    db.prepare('INSERT OR IGNORE INTO identities(provider,subject,user_id) VALUES (?,?,?)').run(
      user.provider,
      user.subject,
      user.id,
    );
}

export function recordAudit(db, actor, action, target, groupId = null) {
  const id = randomUUID();
  db.prepare('INSERT INTO audit_log VALUES (?,?,?,?,?,?)').run(
    id,
    groupId,
    String(actor),
    action,
    String(target),
    new Date().toISOString(),
  );
  if (!groupId) return;
  const actorName = db.prepare('SELECT name FROM users WHERE id=?').get(String(actor))?.name;
  let targetName;
  if (action.includes('event.') || action.includes('event-'))
    targetName = db
      .prepare('SELECT title FROM events WHERE id=? AND group_id=?')
      .get(String(target), groupId)?.title;
  else if (action.includes('membership') || action.includes('transfer'))
    targetName = db.prepare('SELECT name FROM users WHERE id=?').get(String(target))?.name;
  else if (action.startsWith('group.') || action === 'platform.group-updated')
    targetName = db.prepare('SELECT name FROM groups WHERE id=?').get(groupId)?.name;
  db.prepare('INSERT INTO audit_snapshots VALUES (?,?,?)').run(
    id,
    actorName || (actor === 'system' ? 'ระบบ' : 'ผู้ดูแลระบบ'),
    targetName || '',
  );
}
