/** Expand bounded series in memory. Shared general dates remain stored only once. */
export function occurrences(event) {
  let rule;

  try {
    rule = JSON.parse(event.recurrence || '{}');
  } catch {
    return [event];
  }

  if (!rule.frequency || !rule.until) {
    return [event];
  }

  const first = new Date(event.date + 'T00:00:00Z');
  const span = new Date(event.end_date + 'T00:00:00Z') - first;
  const rows = [];
  const originalDay = first.getUTCDate();

  for (let i = 0; i < 367; i++) {
    const start = new Date(first);

    if (rule.frequency === 'daily') {
      start.setUTCDate(first.getUTCDate() + i);
    } else if (rule.frequency === 'weekly') {
      start.setUTCDate(first.getUTCDate() + 7 * i);
    } else if (rule.frequency === 'monthly') {
      start.setUTCDate(1);
      start.setUTCMonth(first.getUTCMonth() + i);
      const last = new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
      ).getUTCDate();

      if (originalDay > last) {
        continue;
      } // A series on the 31st skips months without a 31st.
      start.setUTCDate(originalDay);
    } else {
      return [event];
    }

    const day = start.toISOString().slice(0, 10);

    if (day > rule.until) {
      break;
    }

    rows.push({
      ...event,
      id: `${event.id}@${day}`,
      series_id: event.id,
      date: day,
      end_date: new Date(start.valueOf() + span).toISOString().slice(0, 10),
    });
  }

  return rows;
}
