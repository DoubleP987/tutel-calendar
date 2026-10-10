import { db } from '../database/connection.js';
import { preferences } from '../members/preferences.js';
import { notify } from './service.js';
import { publishedEvents } from '../events/published.js';

export function startReminderScheduler() {
  function tick() {
    const now = Date.now();
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(now));
    const tomorrow = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(now + 86400000));
    const groups = db
      .prepare(
        `
          SELECT DISTINCT g.id
          FROM groups g
          JOIN memberships m ON m.group_id=g.id
          JOIN users u ON u.id=m.user_id
          WHERE g.suspended=0 AND m.blocked=0 AND u.blocked=0
        `,
      )
      .all();

    for (const group of groups) {
      const members = db
        .prepare(
          `
            SELECT u.*
            FROM users u
            JOIN memberships m ON m.user_id=u.id
            WHERE m.group_id=? AND m.blocked=0 AND u.blocked=0
          `,
        )
        .all(group.id)
        .map((user) => ({ user, prefs: preferences(user, group.id) }));
      const upcoming = new Map();

      for (const date of [today, tomorrow]) {
        for (const event of publishedEvents(group.id, { date })) {
          upcoming.set(event.id, event);
        }
      }

      const clock = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Bangkok',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(now));

      for (const { user, prefs } of members) {
        if (!prefs.notifyDaily || clock !== prefs.dayTime) {
          continue;
        }

        const daily = [...upcoming.values()].filter(
          (e) =>
            e.date <= today && e.end_date >= today && prefs.notifyCategories.includes(e.category),
        );

        if (daily.length) {
          notify(user.id, {
            title: 'กิจกรรมวันนี้',
            body: daily
              .map((e) => `${e.all_day ? 'ทั้งวัน' : e.time} ${e.title}`)
              .join(' · ')
              .slice(0, 1800),
            groupId: group.id,
            kind: 'daily',
            dedupe: `daily:${today}`,
          });
        }
      }

      if (clock === '12:00') {
        for (const { user, prefs } of members) {
          if (!prefs.notifyTomorrow) {
            continue;
          }

          const events = [...upcoming.values()].filter(
            (e) => e.date === tomorrow && prefs.notifyCategories.includes(e.category),
          );

          if (events.length) {
            notify(user.id, {
              title: 'กิจกรรมวันพรุ่งนี้',
              body: events
                .map((e) => `${e.all_day ? 'ทั้งวัน' : e.time} ${e.title}`)
                .join(' · ')
                .slice(0, 1800),
              groupId: group.id,
              kind: 'daily',
              dedupe: `tomorrow:${tomorrow}`,
            });
          }
        }
      }

      for (const event of upcoming.values()) {
        for (const { user, prefs } of members) {
          if (!prefs.notifyReminders || !prefs.notifyCategories.includes(event.category)) {
            continue;
          }

          const due = new Date(
            `${event.date}T${event.all_day ? prefs.dayTime : event.time}:00+07:00`,
          ).getTime();
          const schedules = event.all_day
            ? prefs.notifyDaily
              ? []
              : [['day', due]]
            : [
                ['before', due - prefs.leadMinutes * 60000],
                ['start', due],
              ];

          for (const [offset, at] of schedules) {
            if (now >= at && now - at < 120000) {
              notify(user.id, {
                title: offset === 'start' || offset === 'day' ? 'กิจกรรมวันนี้' : 'กิจกรรมใกล้ถึง',
                body: event.title,
                eventId: event.series_id || event.id,
                groupId: group.id,
                kind: 'reminder',
                dedupe: `reminder:${event.id}:${offset}:${at}`,
              });
            }
          }
        }
      }
    }
  }

  const timer = setInterval(tick, 30000);
  timer.unref();
  tick();
  return () => clearInterval(timer);
}
