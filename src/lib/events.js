/**
 * Student events. A small collector (scripts/collect-events.js, run daily by GitHub Actions)
 * gathers events from LiU, LinTek, M-sektionen, FR Ryd etc. into one events.json.
 * The app downloads that file, merges in events she adds herself, and schedules reminders.
 */
import { ymd, fmtTime, addDays } from './dates';

// After you push the repo to GitHub, put the raw URL of events.json here, e.g.
// 'https://raw.githubusercontent.com/<your-username>/ryd-map/main/events.json'
// (It can also be pasted in the app: Events → ⚙︎ → Feed link.)
export const EVENTS_FEED_URL = 'https://raw.githubusercontent.com/asytrix99/sep-buddy/main/events.json';

// Bundled copy so the tab is never empty (regenerate with: node scripts/collect-events.js)
export const BUNDLED_FEED = require('../../events.json');

export const EVENT_SOURCES = [
  { id: 'liu', name: 'LiU', full: 'Linköping University (whole uni)', group: 'University', color: '#0a7ea4', emoji: '🎓' },
  { id: 'lintek', name: 'LinTek', full: 'LinTek — tech students’ union', group: 'Engineering', color: '#c92a2a', emoji: '⚙️' },
  { id: 'msek', name: 'M-sektionen', full: 'Maskinteknologsektionen (Mech Eng)', group: 'Engineering', color: '#e03131', emoji: '🔧' },
  { id: 'frryd', name: 'FR Ryd', full: 'FR Ryd — Ryd tenants’ association', group: 'Hostel', color: '#2f9e44', emoji: '🏠' },
  { id: 'hg', name: 'Herrgården', full: 'Kårhuset Ryds Herrgård — student house next to home in Ryd', group: 'Hostel', color: '#7048e8', emoji: '🍻' },
  { id: 'karhus', name: 'Student houses', full: 'Kårallen (Campus Valla) & Kollektivet — pubs, sittningar, parties', group: 'Student houses', color: '#1971c2', emoji: '🏛️' },
  { id: 'intl', name: 'International', full: 'ISA & ESN — international student events', group: 'University', color: '#0ca678', emoji: '🌍' },
  { id: 'city', name: 'Linköping city', full: 'Linköping city — concerts, shows, markets, sport', group: 'City', color: '#d9480f', emoji: '🏙️' },
  { id: 'other', name: 'Other', full: 'Other student events', group: 'University', color: '#495057', emoji: '📣' },
  { id: 'mine', name: 'Mine', full: 'Events you added', group: 'Mine', color: '#f08c00', emoji: '⭐' },
];
// Only feed events inside her stay in Linköping are shown / reminded about. Her own events always show.
export const STAY = { from: '2027-01-15', to: '2027-06-06' };
export function inStay(e) {
  if (e.source === 'mine') return true;
  const [first, last] = eventDays(e);
  return last >= STAY.from && first <= STAY.to;
}

export const SOURCE = Object.fromEntries(EVENT_SOURCES.map((s) => [s.id, s]));
export const DEFAULT_SOURCES = EVENT_SOURCES.map((s) => s.id);

export const DEFAULT_EVENT_SETTINGS = {
  remind: 'all', // 'all' = evening before for every event from her sources; 'starred' = only starred; 'off'
  feedUrl: '',
  notifyNew: true, // phone notification when new events appear in the feed
};

export async function fetchFeed(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    if (!Array.isArray(j.events)) throw new Error('not an events feed');
    return j;
  } finally {
    clearTimeout(t);
  }
}

/** Upcoming events from enabled sources (+ her own), soonest first. */
export function visibleEvents(feedEvents, mine, enabled, now = new Date()) {
  const on = new Set(enabled);
  const cutoff = now.getTime() - 2 * 3600000; // keep things that started in the last 2 h
  return [...feedEvents, ...mine.map((e) => ({ ...e, source: 'mine' }))]
    .filter((e) => on.has(e.source in SOURCE ? e.source : 'other'))
    .filter(inStay)
    .filter((e) => new Date(e.end || e.start).getTime() >= cutoff)
    .sort((a, b) => new Date(a.start) - new Date(b.start));
}

export function groupByDay(events) {
  const groups = [];
  for (const e of events) {
    const day = ymd(new Date(e.start));
    let g = groups[groups.length - 1];
    if (!g || g.day !== day) groups.push((g = { day, items: [] }));
    g.items.push(e);
  }
  return groups;
}

export function eventNotifications(events, starred, settings) {
  if (settings.remind === 'off') return [];
  const star = new Set(starred);
  const out = [];
  for (const e of events) {
    const isStar = star.has(e.id) || e.source === 'mine';
    if (settings.remind === 'starred' && !isStar) continue;
    const start = new Date(e.start);
    const where = e.location ? ` · ${e.location}` : '';
    const time = e.allDay ? 'all day' : fmtTime(start);
    const eve = new Date(start);
    eve.setDate(eve.getDate() - 1);
    eve.setHours(18, 0, 0, 0);
    out.push({ id: `ev-${e.id}-eve`, date: eve, title: `Tomorrow: ${e.title}`, body: `${time}${where}`, url: e.url });
    if (isStar && !e.allDay) {
      out.push({ id: `ev-${e.id}-1h`, date: new Date(start.getTime() - 3600000), title: `In 1 hour: ${e.title}`, body: `${time}${where}`, url: e.url });
    }
  }
  return out;
}

/**
 * First and last calendar day ('YYYY-MM-DD') an event covers. iCal all-day events end at
 * 00:00 on the day *after*, so that day isn't counted.
 */
export function eventDays(e) {
  const first = ymd(new Date(e.start));
  if (!e.end) return [first, first];
  const end = new Date(e.end);
  let last = ymd(end);
  if (e.allDay && end.getHours() === 0 && end.getMinutes() === 0 && last > first) last = addDays(last, -1);
  return [first, last < first ? first : last];
}

/** All events (past ones too) from enabled sources + her own, mapped to every day they cover. */
export function eventsByDay(feedEvents, mine, enabled) {
  const on = new Set(enabled);
  const map = {};
  [...feedEvents, ...mine.map((e) => ({ ...e, source: 'mine' }))]
    .filter((e) => on.has(e.source in SOURCE ? e.source : 'other'))
    .filter(inStay)
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .forEach((e) => {
      const [first, last] = eventDays(e);
      for (let d = first, n = 0; d <= last && n < 62; d = addDays(d, 1), n++) (map[d] = map[d] || []).push(e);
    });
  return map;
}
