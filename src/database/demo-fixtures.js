import { randomUUID } from 'node:crypto';

/** Local preview data only; disabled in production. */
export function seedDemoFixtures(db) {
  // Demo fixtures are local illustrations, not an authoritative holiday calendar.
  if (process.env.ENABLE_DEMO === '1' && !db.prepare('SELECT id FROM events LIMIT 1').get()) {
    const now = new Date();
    const y = now.getFullYear(),
      m = String(now.getMonth() + 1).padStart(2, '0');
    const rows = [
      [now.getDate(), 'ประชุมทีมโครงงาน', '10:00', '11:00', '#4285f4', 'academic'],
      [now.getDate(), 'อ่านหนังสือด้วยกัน', '16:30', '18:00', '#0f9d58', 'community'],
      [Math.min(now.getDate() + 2, 28), 'กำหนดส่งงานตัวอย่าง', '', '', '#f4b400', 'academic'],
      [
        Math.min(now.getDate() + 4, 28),
        'กิจกรรมชมรมตัวอย่าง',
        '13:00',
        '15:00',
        '#a142f4',
        'community',
      ],
    ];
    for (const [d, title, time, endTime, color, category] of rows) {
      const date = `${y}-${m}-${String(d).padStart(2, '0')}`;
      db.prepare(
        `INSERT INTO events
      (id,title,description,date,end_date,time,end_time,all_day,color,category,status,created_at,updated_at,sample)
      VALUES (?,?,?,?,?,?,?,?,?,?,'published',?,?,1)`,
      ).run(
        randomUUID(),
        title,
        'ข้อมูลตัวอย่างสำหรับทดลองหน้าจอ ไม่ใช่กำหนดการจริง',
        date,
        date,
        time,
        endTime,
        time ? 0 : 1,
        color,
        category,
        now.toISOString(),
        now.toISOString(),
      );
    }
  }
}
