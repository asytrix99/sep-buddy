/**
 * Minimal iCalendar (.ics) parser — enough for TimeEdit timetables (LiU) and event feeds.
 * Handles folded lines, escaped text, UTC times (…Z), floating/TZID times (treated as the
 * phone's local time, i.e. Swedish time while she's in Linköping) and all-day dates.
 */
function unfold(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}
const unescape = (v) => v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');

export function parseIcsDate(value, params = '') {
  const v = value.trim();
  if (/VALUE=DATE(?!-)/.test(params) || /^\d{8}$/.test(v)) {
    return { date: new Date(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8), 0, 0, 0), allDay: true };
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s = '0', z] = m;
  const date = z
    ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
    : new Date(+y, +mo - 1, +d, +h, +mi, +s);
  return { date, allDay: false };
}

export function parseIcs(text) {
  const lines = unfold(text).split('\n');
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur && cur.start) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const head = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const [name, ...paramParts] = head.split(';');
    const params = paramParts.join(';');
    switch (name.toUpperCase()) {
      case 'UID': cur.uid = value.trim(); break;
      case 'SUMMARY': cur.title = unescape(value).trim(); break;
      case 'LOCATION': cur.location = unescape(value).trim(); break;
      case 'DESCRIPTION': cur.description = unescape(value).trim(); break;
      case 'URL': cur.url = value.trim(); break;
      case 'DTSTART': { const p = parseIcsDate(value, params); if (p) { cur.start = p.date; cur.allDay = p.allDay; } break; }
      case 'DTEND': { const p = parseIcsDate(value, params); if (p) cur.end = p.date; break; }
      default: break;
    }
  }
  return events.sort((a, b) => a.start - b.start);
}

/** TimeEdit puts "COURSECODE, Type, Group…" in SUMMARY; find which of her courses it belongs to. */
export function matchCourse(summary, courses) {
  const s = (summary || '').toUpperCase();
  return courses.find((c) => c.code && s.includes(c.code.toUpperCase())) || null;
}
