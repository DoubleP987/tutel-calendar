import { db } from '../database/connection.js';
import { occurrences } from './recurrence.js';

const statements = new Map();

/** Combine the shared calendar with one authorized group without duplicating rows. */
export function publishedEvents(groupId, { includeGroup = true, date = null } = {}) {
  const range = date ? " AND ((e.date<=? AND e.end_date>=?) OR e.recurrence<>'{}')" : '';
  const shared = `SELECT e.*, u.name AS owner_name FROM events e
    LEFT JOIN users u ON u.id=e.owner_id
    WHERE e.data_scope='shared' AND e.status='published' AND e.lifecycle='active'${range}`;
  const local = `SELECT e.*, u.name AS owner_name FROM events e
    LEFT JOIN users u ON u.id=e.owner_id
    WHERE e.data_scope='group' AND e.group_id=? AND e.status='published' AND e.lifecycle='active'${range}`;
  const params = date ? [date, date] : [];

  if (includeGroup) {
    params.push(groupId, ...(date ? [date, date] : []));
  }

  const cacheKey = `${includeGroup}:${Boolean(date)}`;

  if (!statements.has(cacheKey)) {
    statements.set(
      cacheKey,
      db.prepare(`${shared}${includeGroup ? ` UNION ALL ${local}` : ''} ORDER BY date,time,title`),
    );
  }

  const changes = includeGroup
    ? db
        .prepare(
          'SELECT x.* FROM event_exceptions x JOIN events e ON e.id=x.event_id WHERE e.group_id=?',
        )
        .all(groupId)
    : [];
  const exceptions = new Set(
    changes.filter((row) => row.cancelled).map((row) => `${row.event_id}@${row.occurrence_date}`),
  );
  const overrides = new Map(
    changes
      .filter((row) => !row.cancelled && row.override_data !== '{}')
      .map((row) => [`${row.event_id}@${row.occurrence_date}`, JSON.parse(row.override_data)]),
  );
  return statements
    .get(cacheKey)
    .all(...params)
    .flatMap(occurrences)
    .map((event) => ({
      ...event,
      ...(overrides.get(event.id) || {}),
      occurrence_date: event.series_id ? event.id.slice(event.id.lastIndexOf('@') + 1) : null,
    }))
    .filter((e) => !exceptions.has(e.id) && (!date || (e.date <= date && e.end_date >= date)))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.time.localeCompare(b.time) ||
        a.title.localeCompare(b.title),
    );
}
