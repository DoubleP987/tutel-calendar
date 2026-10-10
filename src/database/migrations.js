/** Idempotent schema initialization and additive upgrades for existing installations. */
export function initializeSchema(db) {
  db.exec(`
  PRAGMA journal_mode=WAL;
  PRAGMA foreign_keys=ON;
  PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, provider TEXT NOT NULL, subject TEXT NOT NULL,
    name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('member','manager')),
    UNIQUE(provider,subject)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
    csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS oauth_states (
    hash TEXT PRIMARY KEY, provider TEXT NOT NULL, verifier TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY, owner_id TEXT REFERENCES users(id), title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '', date TEXT NOT NULL, end_date TEXT NOT NULL,
    time TEXT NOT NULL DEFAULT '', end_time TEXT NOT NULL DEFAULT '',
    all_day INTEGER NOT NULL, color TEXT NOT NULL, category TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending','published','rejected')),
    review_note TEXT NOT NULL DEFAULT '', reviewed_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sample INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS events_date ON events(date,status);
`);

  // Additive migrations keep existing prototype proposals and sessions.
  if (
    !db
      .prepare('PRAGMA table_info(events)')
      .all()
      .some((c) => c.name === 'source_categories')
  ) {
    db.exec("ALTER TABLE events ADD COLUMN source_categories TEXT NOT NULL DEFAULT '[]'");
  }

  for (const name of ['source_id', 'source_occurrence']) {
    if (
      !db
        .prepare('PRAGMA table_info(events)')
        .all()
        .some((c) => c.name === name)
    ) {
      db.exec(`ALTER TABLE events ADD COLUMN ${name} TEXT NOT NULL DEFAULT ''`);
    }
  }

  const columns = new Set(
    db
      .prepare('PRAGMA table_info(users)')
      .all()
      .map((c) => c.name),
  );

  for (const [name, definition] of [
    ['preferences', "TEXT NOT NULL DEFAULT '{}'"],
    ['auto_approve', 'INTEGER NOT NULL DEFAULT 0'],
    ['blocked', 'INTEGER NOT NULL DEFAULT 0'],
  ]) {
    if (!columns.has(name)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,
       value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS notifications ( id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL REFERENCES users(id),
       title TEXT NOT NULL,
       body TEXT NOT NULL,
       event_id TEXT,
       kind TEXT NOT NULL,
       created_at TEXT NOT NULL,
       read_at TEXT,
       dedupe TEXT NOT NULL,
       UNIQUE(user_id,
       dedupe) ); CREATE TABLE IF NOT EXISTS push_subscriptions ( endpoint TEXT PRIMARY KEY,
       user_id TEXT NOT NULL REFERENCES users(id),
       subscription TEXT NOT NULL,
       created_at TEXT NOT NULL );
  `);
  db.prepare("INSERT OR IGNORE INTO settings VALUES ('calendar',?)").run(
    JSON.stringify({
      approval: 'manual',
      adminNotifyPending: true,
      adminNotifyPublished: false,
    }),
  );
}
