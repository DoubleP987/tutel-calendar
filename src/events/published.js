import { db } from '../database/connection.js';

const statements = new Map();

/** Combine the shared calendar with one authorized group without duplicating rows. */
export function publishedEvents(groupId, { includeGroup = true, date = null } = {}) {
  const range = date ? ' AND e.date<=? AND e.end_date>=?' : '';
  const shared = `SELECT e.*, u.name AS owner_name FROM events e
    LEFT JOIN users u ON u.id=e.owner_id
    WHERE e.data_scope='shared' AND e.status='published'${range}`;
  const local = `SELECT e.*, u.name AS owner_name FROM events e
    LEFT JOIN users u ON u.id=e.owner_id
    WHERE e.data_scope='group' AND e.group_id=? AND e.status='published'${range}`;
  const params = date ? [date, date] : [];
  if (includeGroup) params.push(groupId, ...(date ? [date, date] : []));
  const cacheKey = `${includeGroup}:${Boolean(date)}`;
  if (!statements.has(cacheKey))
    statements.set(
      cacheKey,
      db.prepare(`${shared}${includeGroup ? ` UNION ALL ${local}` : ''} ORDER BY date,time,title`),
    );
  return statements.get(cacheKey).all(...params);
}
