/**
 * LiU academic calendar + block timetable (for quick reference in the Study tab).
 * Update SEMESTER each term. Dates are inclusive, 'YYYY-MM-DD'.
 */
import { addDays, at, diffDays, parseYmd, ymd } from './dates';

export const SEMESTER = {
  name: 'Spring 2027',
  start: '2027-01-15', // Fri, week 2
  end: '2027-06-06', // week 22
  periods: [
    { key: 'sp1', kind: 'period', term: 'VT1', label: 'Study period 1', start: '2027-01-15', end: '2027-03-28' },
    { key: 'sch1', kind: 'schedule', term: 'VT1', label: 'Schedule time (lectures)', start: '2027-01-15', end: '2027-03-09' },
    { key: 'self1', kind: 'self', label: 'Self study', start: '2027-03-10', end: '2027-03-11' },
    { key: 'reHT2a', kind: 'reexam', label: 'Re-examination period HT2', start: '2027-03-12', end: '2027-03-12' },
    { key: 'reHT2b', kind: 'reexam', label: 'Re-examination period HT2', start: '2027-03-15', end: '2027-03-17' },
    { key: 'exVT1a', kind: 'exam', label: 'Examination period VT1', start: '2027-03-18', end: '2027-03-19' },
    { key: 'exVT1b', kind: 'exam', label: 'Examination period VT1', start: '2027-03-22', end: '2027-03-25' },
    { key: 'sp2', kind: 'period', term: 'VT2', label: 'Study period 2', start: '2027-03-29', end: '2027-06-06' },
    { key: 'sch2', kind: 'schedule', term: 'VT2', label: 'Schedule time (lectures)', start: '2027-03-30', end: '2027-05-26' },
    { key: 'self2', kind: 'self', label: 'Self study', start: '2027-05-07', end: '2027-05-07' },
    { key: 'self3', kind: 'self', label: 'Self study', start: '2027-05-27', end: '2027-05-28' },
    { key: 'exVT2', kind: 'exam', label: 'Examination period VT2', start: '2027-05-31', end: '2027-06-04' },
    { key: 'reVT1', kind: 'reexam', label: 'Re-examination period VT1', start: '2027-06-07', end: '2027-06-10' },
  ],
};

export const KIND = {
  period: { emoji: '📘', color: '#2979ff' },
  schedule: { emoji: '🧑‍🏫', color: '#0b9bb5' },
  self: { emoji: '📖', color: '#2f9e6f' },
  exam: { emoji: '📝', color: '#e5484d' },
  reexam: { emoji: '🔁', color: '#f08c00' },
};

/** ISO week number (Swedish "vecka"). */
export function isoWeek(s) {
  const d = parseYmd(s);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day + 3); // Thursday of this week
  const jan4 = new Date(d.getFullYear(), 0, 4, 12);
  return 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
}

/** Where are we in the semester? */
export function semesterStatus(today = ymd(), sem = SEMESTER) {
  const active = sem.periods.filter((p) => p.start <= today && today <= p.end);
  const studyPeriod = active.find((p) => p.kind === 'period');
  const special = active.find((p) => p.kind !== 'period' && p.kind !== 'schedule') || active.find((p) => p.kind === 'schedule');
  const upcoming = sem.periods
    .filter((p) => (p.kind === 'exam' || p.kind === 'reexam' || p.kind === 'period') && p.start > today)
    .sort((a, b) => (a.start < b.start ? -1 : 1));
  const next = upcoming[0] || null;
  let phase;
  if (today < sem.start) phase = 'before';
  else if (today > sem.periods[sem.periods.length - 1].end) phase = 'after';
  else phase = 'during';
  return {
    phase,
    week: isoWeek(today),
    term: studyPeriod?.term || (today < sem.start ? 'VT1' : 'VT2'),
    studyPeriod, special, next,
    daysToStart: diffDays(today, sem.start),
    daysToNext: next ? diffDays(today, next.start) : null,
  };
}

/** Heads-up 7 days and 1 day before each exam / re-exam period, and before the semester and period 2 start. */
export function semesterNotifications(sem = SEMESTER) {
  const out = [];
  const seen = new Set();
  for (const p of sem.periods) {
    if (!['exam', 'reexam', 'period'].includes(p.kind)) continue;
    // Split periods (e.g. VT1 exams 18–19 + 22–25 Mar) only get one heads-up.
    if (seen.has(p.label)) continue;
    seen.add(p.label);
    const when = `${+p.start.slice(8)}/${+p.start.slice(5, 7)}`;
    const body = p.kind === 'period' ? `Starts ${when}. Check the new courses in TimeEdit.` : `Starts ${when}. Time to plan revision.`;
    out.push({ id: `sem-${p.key}-7`, date: at(addDays(p.start, -7), 9), title: `In 1 week: ${p.label}`, body });
    if (p.kind !== 'period') out.push({ id: `sem-${p.key}-1`, date: at(addDays(p.start, -1), 18), title: `Tomorrow: ${p.label}`, body: 'Check exam rooms and times in your exam registrations. Good luck! 🍀' });
  }
  return out;
}

/**
 * LiU block timetable ("Blockindelning för schemaläggning").
 * Each course is scheduled in one block; its lectures/lessons fall in that block's slots.
 * Evening slots are split between two blocks (half-group sessions). Thursday 10–12 is kept free.
 * This is the usual pattern — the exact times for a course are always in TimeEdit.
 */
export const BLOCK_COLORS = { 1: '#f4a6c8', 2: '#4cd964', 3: '#ffcc33', 4: '#2f6fdb' };
export const SLOTS = ['8–10', '10–12', '13–15', '15–17', '17–19', '19–21'];
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
// GRID[day][slot] = block number | [blockA, blockB] (split evening) | 0 (free) | null (nothing)
export const GRID = [
  [2, 3, 4, 4, [4, 1], [4, 1]], // Monday
  [1, 2, 3, 3, [3, 4], [3, 4]], // Tuesday
  [4, 1, 2, 2, [2, 3], [2, 3]], // Wednesday
  [3, 0, 1, 1, [1, 2], [1, 2]], // Thursday
  [2, 1, 4, 3, null, null], // Friday
];

/** Courses she takes in a term ('VT1' / 'VT2'), keyed by block. */
export function coursesByBlock(courses, term) {
  const out = {};
  for (const c of courses) {
    const b = c.blocks?.[term];
    if (b) (out[b] ||= []).push(c);
  }
  return out;
}
