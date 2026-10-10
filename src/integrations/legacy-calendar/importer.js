import { createHash } from 'node:crypto';
import { db } from '../../database/connection.js';

const source = process.env.CALENDAR_SOURCE_URL;
const format = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
function local(value) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf())) throw new Error('Invalid source date');
  const p = Object.fromEntries(format.formatToParts(parsed).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** Import the old public snapshot without sharing admin accounts or credentials. */
export function startSourceSync() {
  if (!source) return () => {};
  const url = new URL(source);
  if (url.protocol !== 'https:') throw new Error('Calendar source requires HTTPS');
  let running = false;
  async function sync() {
    if (running) return;
    running = true;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Source HTTP ${response.status}`);
      const text = await response.text();
      if (text.length > 4000000) throw new Error('Source too large');
      const snapshot = JSON.parse(text);
      if (!Array.isArray(snapshot.events) || snapshot.events.length > 10000)
        throw new Error('Invalid snapshot');
      const now = new Date().toISOString();
      const legacyTrashed = db
        .prepare("SELECT group_id FROM group_trash WHERE group_id='legacy-calendar'")
        .get();
      const rows = snapshot.events
        .filter((e) => !legacyTrashed || e.publicHoliday || e.systemHoliday)
        .map((e) => {
          const occurrence = e.occurrence_at || e.starts_at;
          const start = local(occurrence);
          const finish = e.occurrence_end || e.ends_at;
          // All-day source end timestamps are exclusive.
          const end = finish
            ? local(e.all_day ? new Date(new Date(finish).valueOf() - 1).toISOString() : finish)
            : start;
          const id = 'source:' + createHash('sha256').update(`${e.id}@${occurrence}`).digest('hex');
          const tags = Array.isArray(e.categories)
            ? e.categories.filter((x) => typeof x === 'string')
            : [];
          return [
            id,
            String(e.title || '').slice(0, 160),
            String(e.description || '').slice(0, 2000),
            start.date,
            end.date < start.date ? start.date : end.date,
            e.all_day ? '' : start.time,
            e.all_day ? '' : end.time,
            e.all_day ? 1 : 0,
            /^#[a-f\d]{6}$/i.test(e.color || '') ? e.color : '#4285f4',
            e.publicHoliday ? 'holiday' : e.systemHoliday ? 'important' : 'community',
            now,
            now,
            JSON.stringify(tags),
            String(e.id),
            occurrence,
            e.publicHoliday || e.systemHoliday ? 'shared' : 'group',
          ];
        });
      const insert = db.prepare(`INSERT INTO events
        (id,title,description,date,end_date,time,end_time,all_day,color,category,status,created_at,updated_at,source_categories,source_id,source_occurrence,data_scope)
        VALUES (?,?,?,?,?,?,?,?,?,?,'published',?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
        title=excluded.title,description=excluded.description,date=excluded.date,end_date=excluded.end_date,
        time=excluded.time,end_time=excluded.end_time,all_day=excluded.all_day,color=excluded.color,
        category=excluded.category,source_categories=excluded.source_categories,source_id=excluded.source_id,
        source_occurrence=excluded.source_occurrence,data_scope=excluded.data_scope,updated_at=excluded.updated_at`);
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const row of rows) insert.run(...row);
        db.prepare(
          "INSERT INTO settings VALUES ('source-sync',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        ).run(
          JSON.stringify({ syncedAt: now, generatedAt: snapshot.generatedAt, count: rows.length }),
        );
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      console.log(`[source-sync] imported ${rows.length} occurrences`);
    } catch (error) {
      console.error('[source-sync]', error.message);
    } finally {
      running = false;
    }
  }
  void sync();
  const timer = setInterval(sync, 60000);
  timer.unref();
  return () => clearInterval(timer);
}
