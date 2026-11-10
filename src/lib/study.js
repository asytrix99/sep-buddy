import { ymd } from './dates';
import { matchCourse } from './ical';

export const COURSE_COLORS = ['#2979ff', '#e5484d', '#2f9e6f', '#f08c00', '#8e4ec6', '#0b9bb5', '#d6336c', '#5d4037'];

/**
 * Her courses for Spring 2027 (from her LiU Letter of Admission, 30 credits).
 * blocks = which LiU timetable block the course uses in each study period (see semester.js).
 * The code is used to match lectures in the TimeEdit timetable. Editable in the app.
 */
export const STARTER_COURSES = [
  { id: 'TSRT21', code: 'TSRT21', name: 'Dynamical Systems and Control', color: '#2f9e6f', blocks: { VT1: 2 } },
  { id: 'TMKO04', code: 'TMKO04', name: 'Composite Materials', color: '#d6336c', blocks: { VT1: 1, VT2: 4 } },
  { id: 'TMHL62', code: 'TMHL62', name: 'The Finite Element Method, Advanced Course', color: '#2979ff', blocks: { VT1: 4 } },
  { id: 'TMME19', code: 'TMME19', name: 'Mechanics, Second Course', color: '#8e4ec6', blocks: { VT2: 1 } },
  { id: 'TMKT57', code: 'TMKT57', name: 'Product Modelling', color: '#f08c00', blocks: { VT2: 3 } },
];

/** 'VT1 · block 1 + VT2 · block 4' */
export const courseWhen = (c) => Object.entries(c.blocks || {})
  .map(([t, b]) => (b ? `${t} · block ${b}` : t)).join(' + ');

export const TASK_TYPES = [
  { key: 'assignment', label: 'Assignment', emoji: '📝', remind: [72, 24] },
  { key: 'lab', label: 'Lab', emoji: '🧪', remind: [24] },
  { key: 'exam', label: 'Exam', emoji: '🎓', remind: [168, 72, 24] },
  { key: 'reading', label: 'Reading', emoji: '📖', remind: [24] },
  { key: 'other', label: 'Other', emoji: '📌', remind: [24] },
];
export const TYPE = Object.fromEntries(TASK_TYPES.map((t) => [t.key, t]));

const hoursLabel = (h) => (h >= 48 ? `${Math.round(h / 24)} days` : h === 24 ? '1 day' : `${h} h`);

/** Reminders for deadlines/exams and the running focus timer. */
export function studyNotifications(tasks, courses, focus) {
  const out = [];
  const byId = Object.fromEntries(courses.map((c) => [c.id, c]));
  for (const t of tasks) {
    if (t.done || !t.due) continue;
    const due = new Date(t.due);
    const course = byId[t.courseId];
    const label = `${TYPE[t.type]?.emoji || '📌'} ${course ? course.code + ' · ' : ''}${t.title}`;
    for (const h of t.remind ?? TYPE[t.type]?.remind ?? [24]) {
      out.push({ id: `task-${t.id}-${h}`, date: new Date(due.getTime() - h * 3600000), title: `Due in ${hoursLabel(h)}`, body: label });
    }
  }
  if (focus?.endsAt && focus.running) {
    out.push({
      id: 'focus-end', date: new Date(focus.endsAt),
      title: focus.mode === 'focus' ? 'Focus session done 🎉' : 'Break over',
      body: focus.mode === 'focus' ? 'Take a 5-minute break.' : 'Ready for another round?',
    });
  }
  return out;
}

/** Next `days` days of classes (TimeEdit) + deadlines, grouped by day. */
export function buildAgenda(tasks, classes, courses, { days = 7, now = new Date() } = {}) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + days * 86400000);
  const items = [];
  for (const c of classes) {
    const s = new Date(c.start);
    const e = c.end ? new Date(c.end) : s;
    if (e < now || s >= end) continue;
    items.push({ kind: 'class', key: 'c' + (c.uid || c.title) + s.getTime(), start: s, end: e, title: c.title, location: c.location, course: matchCourse(c.title, courses) });
  }
  const byId = Object.fromEntries(courses.map((c) => [c.id, c]));
  for (const t of tasks) {
    if (t.done || !t.due) continue;
    const d = new Date(t.due);
    if (d >= end) continue;
    items.push({ kind: 'task', key: 't' + t.id, start: d, title: t.title, task: t, course: byId[t.courseId], overdue: d < now });
  }
  items.sort((a, b) => a.start - b.start);
  const groups = [];
  for (const it of items) {
    const day = it.overdue ? 'overdue' : ymd(it.start);
    let g = groups[groups.length - 1];
    if (!g || g.day !== day) groups.push((g = { day, items: [] }));
    g.items.push(it);
  }
  return groups;
}

/** Minutes of focus per course over the last 7 days. */
export function focusSummary(log, now = new Date()) {
  const since = now.getTime() - 7 * 86400000;
  const out = {};
  for (const e of log) if (e.at >= since) out[e.courseId || 'none'] = (out[e.courseId || 'none'] || 0) + e.minutes;
  return out;
}
