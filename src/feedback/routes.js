import multer from 'multer';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import { dirname, resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../database/connection.js';
import { member, csrf } from '../auth/oauth.js';
import { serviceAuth } from '../integrations/discord/security.js';

const imageDirectory = resolve(
  process.env.FEEDBACK_UPLOAD_DIR ||
    join(dirname(process.env.DATABASE_PATH || './data/calendar.sqlite'), 'feedback'),
);
const publicDirectory = resolve(fileURLToPath(new URL('../../public', import.meta.url)));

if (
  imageDirectory.toLowerCase() === publicDirectory.toLowerCase() ||
  imageDirectory.toLowerCase().startsWith(publicDirectory.toLowerCase() + sep)
) {
  throw new Error('FEEDBACK_UPLOAD_DIR must be outside public/');
}

const types = ['problem', 'suggestion', 'other'];
const statuses = ['new', 'in_progress', 'done'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 3, fields: 5, fieldSize: 24000, parts: 8 },
});
let activeUploads = 0;

function uploadCapacity(req, res, next) {
  if (activeUploads >= 2) {
    res.set('Retry-After', '10');
    return res.status(429).json({ error: 'กำลังรับรูปภาพหลายรายการ กรุณาลองใหม่สักครู่' });
  }

  activeUploads++;
  let released = false;

  const release = () => {
    if (!released) {
      released = true;
      activeUploads--;
    }
  };

  res.once('finish', release);
  res.once('close', release);
  next();
}

export function initializeFeedback() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS feedback ( id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL,
       user_name TEXT NOT NULL,
       group_id TEXT,
       group_name TEXT,
       category TEXT NOT NULL,
       title TEXT NOT NULL,
       message TEXT NOT NULL,
       page_path TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'new',
       read_at TEXT,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       updated_by TEXT ); CREATE TABLE IF NOT EXISTS feedback_images ( id TEXT PRIMARY KEY,
       feedback_id TEXT NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
       size INTEGER NOT NULL ); CREATE INDEX IF NOT EXISTS feedback_created ON feedback(created_at DESC,
       id DESC); CREATE INDEX IF NOT EXISTS feedback_user_created ON feedback(user_id,
       created_at DESC);
  `);
}

function rateLimit(req, res, next) {
  const count = db
    .prepare('SELECT count(*) n FROM feedback WHERE user_id=? AND created_at>?')
    .get(req.session.id, new Date(Date.now() - 3600000).toISOString()).n;

  if (count >= 5) {
    return res.status(429).json({ error: 'ส่งได้ไม่เกิน 5 ข้อความต่อชั่วโมง กรุณารอสักครู่' });
  }

  next();
}

function parseUpload(req, res, next) {
  upload.array('images', 3)(req, res, (error) => {
    if (error) {
      return res
        .status(400)
        .json({ error: 'แนบได้ 3 รูป รูปละไม่เกิน 5 MB ใช้ JPG, PNG หรือ WebP' });
    }

    next();
  });
}

async function normalizedImage(file) {
  // Decode the actual file, bound pixel count, and re-encode without original metadata.
  const image = sharp(file.buffer, {
    limitInputPixels: 25000000,
    animated: false,
    failOn: 'warning',
  });
  const metadata = await image.metadata();

  if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) {
    throw new Error('รองรับภาพนิ่ง JPG, PNG และ WebP เท่านั้น');
  }

  return image
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
}

async function sendImage(res, image) {
  if (!image) {
    return res.sendStatus(404);
  }

  try {
    const bytes = await readFile(join(imageDirectory, image.id + '.webp'));
    res
      .set({
        'Cache-Control': 'private, no-store',
        'Content-Type': 'image/webp',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(bytes);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.sendStatus(404);
    }

    throw error;
  }
}

export function registerFeedback(app) {
  initializeFeedback();

  app.post(
    '/api/feedback',
    member,
    csrf,
    rateLimit,
    uploadCapacity,
    parseUpload,
    async (req, res) => {
      const title = String(req.body.title || '').trim();
      const message = String(req.body.message || '').trim();
      const category = req.body.category;
      const pagePath = String(req.body.pagePath || '/').slice(0, 300);

      if (
        !types.includes(category) ||
        !title ||
        title.length > 120 ||
        !message ||
        message.length > 5000 ||
        !pagePath.startsWith('/') ||
        pagePath.startsWith('//') ||
        pagePath.includes('?') ||
        pagePath.includes('#')
      ) {
        return res.status(400).json({
          error: 'กรอกประเภท หัวข้อไม่เกิน 120 ตัวอักษร และรายละเอียดไม่เกิน 5,000 ตัวอักษร',
        });
      }

      const groupId = String(req.body.groupId || '');
      const group = groupId
        ? db
            .prepare(
              `
                SELECT g.id,
                   g.name
                FROM groups g
                JOIN memberships m ON m.group_id=g.id
                WHERE g.id=? AND m.user_id=? AND m.blocked=0
              `,
            )
            .get(groupId, req.session.id)
        : null;

      if (groupId && !group) {
        return res.status(403).json({ error: 'คุณไม่ได้เป็นสมาชิกของกลุ่มนี้' });
      }

      const saved = [];

      try {
        const images = [];
        // Sequential processing bounds peak memory even when three large images are attached.
        for (const file of req.files || []) {
          let bytes;

          try {
            bytes = await normalizedImage(file);
          } catch {
            const issue = new Error(
              'อ่านรูปไม่ได้ กรุณาใช้ภาพนิ่ง JPG, PNG หรือ WebP ที่ไม่เสียหาย',
            );
            issue.status = 400;
            throw issue;
          }

          images.push({ id: randomUUID(), bytes });
        }

        await mkdir(imageDirectory, { recursive: true, mode: 0o700 });

        for (const image of images) {
          const path = join(imageDirectory, image.id + '.webp');
          await writeFile(path, image.bytes, { flag: 'wx', mode: 0o600 });
          saved.push(path);
        }

        const id = randomUUID();
        const now = new Date().toISOString();
        db.exec('BEGIN IMMEDIATE');

        try {
          // Recheck after asynchronous processing to bound concurrent submissions.
          const recent = db
            .prepare('SELECT count(*) n FROM feedback WHERE user_id=? AND created_at>?')
            .get(req.session.id, new Date(Date.now() - 3600000).toISOString()).n;

          if (recent >= 5) {
            const issue = new Error('ส่งได้ไม่เกิน 5 ข้อความต่อชั่วโมง กรุณารอสักครู่');
            issue.status = 429;
            throw issue;
          }

          db.prepare(
            `
              INSERT INTO feedback (id,
                 user_id,
                 user_name,
                 group_id,
                 group_name,
                 category,
                 title,
                 message,
                 page_path,
                 created_at,
                 updated_at)
              VALUES (?,
                 ?,
                 ?,
                 ?,
                 ?,
                 ?,
                 ?,
                 ?,
                 ?,
                 ?,
                 ?)
            `,
          ).run(
            id,
            req.session.id,
            req.session.name,
            group?.id || null,
            group?.name || null,
            category,
            title,
            message,
            pagePath,
            now,
            now,
          );

          for (const image of images) {
            db.prepare('INSERT INTO feedback_images VALUES (?,?,?)').run(
              image.id,
              id,
              image.bytes.length,
            );
          }

          db.exec('COMMIT');
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }

        res.status(201).json({ id, ok: true });
      } catch (error) {
        await Promise.all(saved.map((path) => unlink(path).catch(() => {})));

        if (![400, 429].includes(error.status)) {
          console.error('[feedback]', error.name);
        }

        res
          .status(error.status || 500)
          .json({ error: error.status ? error.message : 'บันทึก Feedback ไม่สำเร็จ กรุณาลองใหม่' });
      }
    },
  );

  app.get('/api/feedback/images/:id', member, async (req, res) =>
    sendImage(
      res,
      db
        .prepare(
          `
            SELECT i.id
            FROM feedback_images i
            JOIN feedback f ON f.id=i.feedback_id
            WHERE i.id=? AND f.user_id=?
          `,
        )
        .get(req.params.id, req.session.id),
    ),
  );

  const prefix = '/internal/v1/control/feedback';
  app.use(prefix, serviceAuth('control'));

  app.get(prefix, (req, res) => {
    const page = Number(req.query.page || 1);
    const status = String(req.query.status || '');
    const category = String(req.query.category || '');

    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 100000 ||
      (status && !statuses.includes(status)) ||
      (category && !types.includes(category))
    ) {
      return res.sendStatus(400);
    }

    const items = db
      .prepare(
        `
          SELECT f.*,
             (SELECT count(*)
          FROM feedback_images i
          WHERE i.feedback_id=f.id) image_count
          FROM feedback f
          WHERE (?='' OR status=?) AND (?='' OR category=?)
          ORDER BY created_at DESC,
             id DESC
          LIMIT 51
          OFFSET ?
        `,
      )
      .all(status, status, category, category, (page - 1) * 50);
    res.json({
      items: items.slice(0, 50),
      page,
      hasMore: items.length > 50,
      unread: db.prepare('SELECT count(*) n FROM feedback WHERE read_at IS NULL').get().n,
    });
  });

  app.get(prefix + '/images/:id', async (req, res) =>
    sendImage(res, db.prepare('SELECT id FROM feedback_images WHERE id=?').get(req.params.id)),
  );

  app.get(prefix + '/:id', (req, res) => {
    const item = db.prepare('SELECT * FROM feedback WHERE id=?').get(req.params.id);

    if (!item) {
      return res.sendStatus(404);
    }

    res.json({
      ...item,
      images: db.prepare('SELECT id,size FROM feedback_images WHERE feedback_id=?').all(item.id),
    });
  });

  app.put(prefix + '/:id', (req, res) => {
    const item = db.prepare('SELECT * FROM feedback WHERE id=?').get(req.params.id);

    if (!item) {
      return res.sendStatus(404);
    }

    const status = req.body.status ?? item.status;

    if (
      !statuses.includes(status) ||
      (req.body.read !== undefined && typeof req.body.read !== 'boolean')
    ) {
      return res.sendStatus(400);
    }

    db.prepare('UPDATE feedback SET status=?,read_at=?,updated_at=?,updated_by=? WHERE id=?').run(
      status,
      req.body.read === undefined ? item.read_at : req.body.read ? new Date().toISOString() : null,
      new Date().toISOString(),
      req.serviceActor,
      item.id,
    );
    res.json({ ok: true });
  });
}
