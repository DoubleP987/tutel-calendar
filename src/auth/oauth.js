import { randomBytes, createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { db } from '../database/connection.js';
import { legacyGroupId } from '../groups/schema.js';
import { mergeVerifiedAccount } from './link-accounts.js';
import { recordSession } from './account-settings.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');

const random = () => randomBytes(32).toString('base64url');

const base = new URL(process.env.BASE_URL || 'http://127.0.0.1:3100');
const secure = base.protocol === 'https:';
export const demo = process.env.ENABLE_DEMO === '1';

const cookie = (req, name) =>
  String(req.headers.cookie || '')
    .split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(name + '='))
    ?.slice(name.length + 1);

const setCookie = (res, name, value, seconds) =>
  res.append(
    'Set-Cookie',
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure ? '; Secure' : ''}`,
  );

const options = (provider) => {
  const prefix = provider.toUpperCase();
  return { id: process.env[`${prefix}_CLIENT_ID`], secret: process.env[`${prefix}_CLIENT_SECRET`] };
};

export function identity(
  provider,
  subject,
  name,
  role = 'member',
  email = null,
  verified = false,
  linkUserId = null,
) {
  const existing = db
    .prepare('SELECT user_id FROM identities WHERE provider=? AND subject=?')
    .get(provider, subject);

  if (linkUserId && existing && existing.user_id !== linkUserId) {
    mergeVerifiedAccount(linkUserId, existing.user_id);
  }

  let id = linkUserId || existing?.user_id;

  if (!id) {
    id = randomUUID();
    db.prepare(
      'INSERT INTO users (id,provider,subject,name,role,platform_admin) VALUES (?,?,?,?,?,?)',
    ).run(id, provider, subject, name.slice(0, 100), role, role === 'manager' ? 1 : 0);

    if (role === 'manager') {
      const owner = db
        .prepare("SELECT user_id FROM memberships WHERE group_id=? AND role='owner'")
        .get(legacyGroupId);
      db.prepare('INSERT INTO memberships VALUES (?,?,?,0,1,?,?)').run(
        legacyGroupId,
        id,
        owner ? 'manager' : 'owner',
        '{}',
        new Date().toISOString(),
      );
    } else if (provider === 'demo') {
      db.prepare("INSERT INTO memberships VALUES (?,?,'member',0,0,'{}',?)").run(
        legacyGroupId,
        id,
        new Date().toISOString(),
      );
    }
  }

  db.prepare(
    `
      INSERT INTO identities(provider,
         subject,
         user_id,
         email,
         email_verified)
      VALUES (?,
         ?,
         ?,
         ?,
         ?)
      ON CONFLICT(provider,
         subject) DO UPDATE
      SET email=excluded.email,
         email_verified=excluded.email_verified
    `,
  ).run(provider, subject, id, email ? email.trim().toLowerCase() : null, verified ? 1 : 0);

  if (!linkUserId) {
    db.prepare('UPDATE users SET provider_name=?,name=COALESCE(custom_name,?) WHERE id=?').run(
      name.slice(0, 100),
      name.slice(0, 100),
      id,
    );
  }

  const user = db.prepare('SELECT * FROM users WHERE id=?').get(id);

  if (user.blocked) {
    throw new Error('blocked');
  }

  return user;
}

function session(res, user, agent = '') {
  const token = random();
  db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(
    hash(token),
    user.id,
    random(),
    Date.now() + 28800000,
  );
  setCookie(res, 'calendar_sid', token, 28800);
  recordSession(hash(token), agent);
}

export function authenticate(req, res, next) {
  const token = cookie(req, 'calendar_sid');
  req.session = token
    ? db
        .prepare(
          `
            SELECT s.hash,
               s.csrf,
               s.expires_at,
               u.*
            FROM sessions s
            JOIN users u ON u.id=s.user_id
            WHERE s.hash=? AND s.expires_at>? AND u.blocked=0
          `,
        )
        .get(hash(token), Date.now())
    : null;
  next();
}

export function member(req, res, next) {
  if (!req.session) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
  }

  next();
}

export function manager(req, res, next) {
  if (!['owner', 'manager'].includes(req.membership?.role)) {
    return res.status(403).json({ error: 'เฉพาะผู้จัดการปฏิทิน' });
  }

  next();
}

export function csrf(req, res, next) {
  const value = req.get('x-csrf-token') || '';
  const expected = req.session?.csrf || '';
  const a = Buffer.from(value);
  const b = Buffer.from(expected);

  if (!b.length || a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(403).json({ error: 'เปิดหน้าใหม่แล้วลองอีกครั้ง' });
  }

  next();
}

export function registerAuth(app) {
  app.get('/api/session', (req, res) =>
    res.json({
      user: req.session
        ? {
            id: req.session.id,
            name: req.session.name,
            role: req.session.role,
            provider: req.session.provider,
            platformAdmin: !!req.session.platform_admin,
            lastGroupId: req.session.last_group_id,
          }
        : null,
      csrf: req.session?.csrf,
      demo,
      providers: Object.fromEntries(
        ['google', 'discord'].map((p) => [p, Boolean(options(p).id && options(p).secret)]),
      ),
    }),
  );

  app.post('/api/logout', member, csrf, (req, res) => {
    db.prepare('DELETE FROM sessions WHERE hash=?').run(req.session.hash);
    setCookie(res, 'calendar_sid', '', 0);
    res.json({ ok: true });
  });
  // Intentional role preview; never available on a public deployment.
  app.post('/api/demo', (req, res) => {
    if (!demo) {
      return res.sendStatus(404);
    }

    if (req.get('origin') !== base.origin) {
      return res.sendStatus(403);
    }

    const role = req.body.role === 'manager' ? 'manager' : 'member';
    session(
      res,
      identity('demo', role, role === 'manager' ? 'ผู้จัดการตัวอย่าง' : 'สมาชิกตัวอย่าง', role),
      req.get('user-agent') || '',
    );
    res.json({ ok: true });
  });

  function beginOAuth(req, res) {
    const p = req.params.provider;

    if (!['google', 'discord'].includes(p)) {
      return res.sendStatus(404);
    }

    const config = options(p);

    if (!config.id || !config.secret) {
      if (req.linkAccount) {
        return res.status(503).json({ error: 'ยังไม่ได้ตั้งค่า OAuth ของผู้ให้บริการนี้' });
      }

      return res.redirect('/?auth=not-configured');
    }

    const state = random();
    const verifier = random();
    db.prepare(
      `
        INSERT INTO oauth_states(hash,
           provider,
           verifier,
           expires_at,
           return_to,
           link_user_id)
        VALUES (?,
           ?,
           ?,
           ?,
           ?,
           ?)
      `,
    ).run(
      hash(state),
      p,
      verifier,
      Date.now() + 600000,
      safeReturn(req.returnTo || req.query.returnTo),
      req.linkAccount ? req.session.id : null,
    );
    setCookie(res, 'calendar_oauth', state, 600);
    const url = new URL(
      p === 'google'
        ? 'https://accounts.google.com/o/oauth2/v2/auth'
        : 'https://discord.com/oauth2/authorize',
    );
    url.search = new URLSearchParams({
      client_id: config.id,
      response_type: 'code',
      redirect_uri: `${base.origin}/auth/${p}/callback`,
      state,
      scope: p === 'google' ? 'openid email profile' : 'identify email',
      ...(p === 'google'
        ? {
            code_challenge: createHash('sha256').update(verifier).digest('base64url'),
            code_challenge_method: 'S256',
          }
        : {}),
    }).toString();

    if (req.linkAccount) {
      res.json({ url: url.toString() });
    } else {
      res.redirect(url.toString());
    }
  }

  app.get('/auth/:provider', beginOAuth);

  app.post('/api/accounts/link/:provider', member, csrf, (req, res) => {
    req.linkAccount = true;
    req.returnTo = safeReturn(req.body.returnTo);
    beginOAuth(req, res);
  });

  app.get('/auth/:provider/callback', async (req, res) => {
    try {
      const p = req.params.provider;
      const state = String(req.query.state || '');

      if (!['google', 'discord'].includes(p) || !state || state !== cookie(req, 'calendar_oauth')) {
        throw new Error('state');
      }

      const saved = db
        .prepare(
          'DELETE FROM oauth_states WHERE hash=? AND provider=? AND expires_at>? RETURNING *',
        )
        .get(hash(state), p, Date.now());

      if (!saved || typeof req.query.code !== 'string') {
        throw new Error('expired');
      }

      setCookie(res, 'calendar_oauth', '', 0);
      const config = options(p);
      const tokenResponse = await fetch(
        p === 'google'
          ? 'https://oauth2.googleapis.com/token'
          : 'https://discord.com/api/oauth2/token',
        {
          method: 'POST',
          body: new URLSearchParams({
            client_id: config.id,
            client_secret: config.secret,
            grant_type: 'authorization_code',
            code: req.query.code,
            redirect_uri: `${base.origin}/auth/${p}/callback`,
            ...(p === 'google' ? { code_verifier: saved.verifier } : {}),
          }),
          signal: AbortSignal.timeout(15000),
        },
      );
      const tokens = await tokenResponse.json();

      if (!tokenResponse.ok || !tokens.access_token) {
        throw new Error('token');
      }

      const response = await fetch(
        p === 'google'
          ? 'https://openidconnect.googleapis.com/v1/userinfo'
          : 'https://discord.com/api/users/@me',
        {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
          signal: AbortSignal.timeout(15000),
        },
      );
      const profile = await response.json();
      const subject = p === 'google' ? profile.sub : profile.id;

      if (!response.ok || !subject || (p === 'google' && !profile.email_verified)) {
        throw new Error('identity');
      }

      const ids = String(process.env[`${p.toUpperCase()}_ADMIN_IDS`] || '')
        .split(',')
        .map((v) => v.trim());

      if (saved.link_user_id && req.session?.id !== saved.link_user_id) {
        throw new Error('link-session-expired');
      }

      const verifiedEmail =
        p === 'discord'
          ? profile.verified === true
          : profile.email_verified === true &&
            (/@gmail\.com$/i.test(profile.email || '') || !!profile.hd);
      const user = identity(
        p,
        subject,
        profile.name || profile.global_name || profile.username || 'สมาชิก',
        ids.includes(subject) ? 'manager' : 'member',
        profile.email || null,
        verifiedEmail,
        saved.link_user_id,
      );
      session(res, user, req.get('user-agent') || '');
      res.redirect(safeReturn(saved.return_to));
    } catch {
      // Do not log codes, access tokens or provider responses.
      res.redirect('/?auth=failed');
    }
  });
}

function safeReturn(value) {
  return typeof value === 'string' &&
    value.length <= 2048 &&
    /^\/(?:g\/|invite\/|connect\/|\?|$)/.test(value) &&
    !/[\x00-\x1f\x7f]/.test(value) &&
    !value.includes('\\') &&
    !value.startsWith('//')
    ? value
    : '/';
}
