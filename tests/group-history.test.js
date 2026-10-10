import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';

// Never load .env or touch a real calendar database during these tests.
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'tutel-history-')), 'test.sqlite');
process.env.ENABLE_DEMO = '0';
process.env.BASE_URL = 'https://calendar.test';
const { db } = await import('../src/database/connection.js');
const { recordAudit } = await import('../src/groups/schema.js');
const { authenticate } = await import('../src/auth/oauth.js');
const { registerAdministration } = await import('../src/members/routes.js');
const { createInvitation, acceptInvitation } = await import('../src/groups/invitations.js');
const now = '2026-10-10T10:00:00.000Z';

for (const id of ['group-a', 'group-b']) {
  db.prepare("INSERT INTO groups VALUES (?,?,?,'public',0,'{}',?)").run(id, id, id, now);
}

for (const role of ['owner', 'manager', 'editor', 'member', 'outsider', 'blocked']) {
  db.prepare('INSERT INTO users(id,provider,subject,name,role) VALUES (?,?,?,?,?)').run(
    role,
    'google',
    role,
    `Test ${role}`,
    'member',
  );

  if (role !== 'outsider') {
    db.prepare("INSERT INTO memberships VALUES (?,?,?,?,0,'{}',?)").run(
      'group-a',
      role,
      role === 'blocked' ? 'member' : role,
      role === 'blocked' ? 1 : 0,
      now,
    );
  }

  db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(
    createHash('sha256').update(`test-${role}`).digest('hex'),
    role,
    'test-csrf',
    Date.now() + 3600000,
  );
}

db.prepare("INSERT INTO memberships VALUES ('group-b','outsider','member',0,0,'{}',?)").run(now);
db.prepare(
  `INSERT INTO events(id,owner_id,title,date,end_date,all_day,color,category,status,created_at,updated_at,group_id)
  VALUES ('event-a','member','Original title','2026-10-10','2026-10-10',1,'#237849','community','published',?,?, 'group-a')`,
).run(now, now);
recordAudit(db, 'member', 'event.created', 'event-a', 'group-a');
recordAudit(db, 'outsider', 'group.created', 'group-b', 'group-b');
const app = express();
app.use(express.json());
app.use(authenticate);
registerAdministration(app);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
});

async function request(path, role, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    headers: {
      'x-calendar-group': 'group-a',
      ...(role ? { cookie: `calendar_sid=test-${role}` } : {}),
      ...options.headers,
    },
  });
  return { status: response.status, body: await response.json() };
}

for (const role of ['owner', 'manager', 'editor', 'member']) {
  test(`${role} reads same-group members and join time`, async () => {
    const result = await request('/api/members', role);
    assert.equal(result.status, 200);
    assert(
      result.body.some(
        (row) => row.id === 'member' && row.role === 'member' && row.joined_at === now,
      ),
    );
    assert(!result.body.some((row) => row.id === 'outsider'));
    assert(!result.body.some((row) => 'email' in row));
  });
  test(`${role} reads only same-group history`, async () => {
    const result = await request('/api/group/audit', role);
    assert.equal(result.status, 200);
    assert(result.body.items.every((row) => row.target_name !== 'group-b'));
    assert(
      result.body.items.some(
        (row) => row.actor_name === 'Test member' && row.target_name === 'Original title',
      ),
    );
    assert(result.body.items.every((row) => !('actor' in row) && !('target' in row)));
  });
}

for (const [role, status] of [
  [null, 401],
  ['outsider', 403],
  ['blocked', 403],
]) {
  test(`${role || 'anonymous'} cannot read group directory or history`, async () => {
    for (const path of ['/api/members', '/api/group/audit']) {
      assert.equal((await request(path, role)).status, status);
    }
  });
}

for (const role of ['member', 'editor']) {
  test(`${role} cannot change another member role`, async () => {
    const result = await request('/api/members/manager', role, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-csrf-token': 'test-csrf' },
      body: JSON.stringify({ role: 'member' }),
    });
    assert.equal(result.status, 403);
  });
}

test('Snapshot retains actor and event names after rename and deletion', async () => {
  db.prepare("UPDATE users SET name='Renamed member' WHERE id='member'").run();
  db.prepare("DELETE FROM events WHERE id='event-a'").run();
  const result = await request('/api/group/audit', 'member');
  assert(
    result.body.items.some(
      (row) => row.actor_name === 'Test member' && row.target_name === 'Original title',
    ),
  );
});
test('Invitation acceptance records one join, not duplicate acceptance', () => {
  const invite = createInvitation(
    'group-a',
    'owner',
    { kind: 'code', role: 'member', maxUses: 3 },
    'owner',
  );
  const saved = db.prepare('SELECT * FROM invitations WHERE id=?').get(invite.id);
  const user = db.prepare("SELECT * FROM users WHERE id='outsider'").get();
  acceptInvitation(saved, user);
  acceptInvitation(saved, user);
  assert.equal(
    db
      .prepare(
        "SELECT count(*) n FROM audit_log WHERE group_id='group-a' AND action='membership.joined' AND target='outsider'",
      )
      .get().n,
    1,
  );
});
test('History pagination is bounded and rejects invalid page numbers', async () => {
  for (let i = 0; i < 60; i++) {
    recordAudit(db, 'owner', 'invitation.created', `private-token-${i}`, 'group-a');
  }

  const first = await request('/api/group/audit?page=1', 'member');
  const second = await request('/api/group/audit?page=2', 'member');
  assert.equal(first.body.items.length, 50);
  assert.equal(first.body.hasMore, true);
  assert.equal(second.body.hasMore, false);
  assert(!first.body.items.some((a) => second.body.items.some((b) => a.id === b.id)));
  assert(!JSON.stringify(first.body).includes('private-token-'));

  for (const page of ['0', '-1', '1.5', 'bad', '100001']) {
    assert.equal((await request(`/api/group/audit?page=${page}`, 'member')).status, 400);
  }
});
test('Manager writes require a valid CSRF token', async () => {
  const result = await request('/api/members/member', 'manager', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role: 'editor', autoApprove: false, blocked: false }),
  });
  assert.equal(result.status, 403);
});
test('Manager retains authorized role editing without gaining ownership', async () => {
  const options = {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-csrf-token': 'test-csrf' },
    body: JSON.stringify({ role: 'editor', autoApprove: false, blocked: false }),
  };
  assert.equal((await request('/api/members/member', 'manager', options)).status, 200);
  assert.equal(
    db.prepare("SELECT role FROM memberships WHERE group_id='group-a' AND user_id='member'").get()
      .role,
    'editor',
  );
  assert.notEqual((await request('/api/members/owner', 'manager', options)).status, 200);
});
