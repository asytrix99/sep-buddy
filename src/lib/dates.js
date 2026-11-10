// Small local-date helpers. Calendar days are stored as 'YYYY-MM-DD' strings in local time,
// so a period logged on "the 3rd" stays on the 3rd whatever the time zone does.

const pad = (n) => String(n).padStart(2, '0');

export function ymd(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'YYYY-MM-DD' → Date at local noon (noon avoids daylight-saving edge cases). */
export function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDays(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/** Whole days from a to b (b - a). */
export function diffDays(a, b) {
  return Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
}

/** Date object for a calendar day at a given local hour:minute. */
export function at(s, hour, minute = 0) {
  const d = parseYmd(s);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const fmtDay = (s) => {
  const d = parseYmd(s);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
export const fmtShort = (s) => {
  const d = parseYmd(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
export const fmtTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const monthName = (y, m) => `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m]} ${y}`;

/** "today", "tomorrow", "in 3 days", "2 days ago" */
export function relDays(s, today = ymd()) {
  const n = diffDays(today, s);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
