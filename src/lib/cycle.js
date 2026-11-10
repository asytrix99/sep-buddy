/**
 * Cycle maths (pure functions, no React) — the same approach period apps like Flo use:
 *  - a period = a run of logged bleeding days (a single missed day in between is bridged)
 *  - cycle length = days from one period start to the next
 *  - next period ≈ last start + average of the last 6 cycle lengths
 *  - ovulation ≈ 14 days before the next period; fertile window = 5 days before → 1 day after
 * These are estimates from her own history, not medical or contraceptive advice.
 */
import { addDays, diffDays, ymd, at } from './dates';

export const DEFAULT_SETTINGS = {
  cycleLength: 28, // used until she has logged 2+ periods
  periodLength: 5,
  remindBefore: true, // "period expected in 2 days"
  remindLate: true, // "period is 3 days late"
  dailyLog: false, // daily "how are you feeling?" reminder
  dailyLogTime: { hour: 21, minute: 0 },
  showFood: true,
  lock: false,
};

export const PHASES = {
  menstrual: {
    key: 'menstrual', label: 'Period', color: '#e5484d', soft: '#fde2e3', emoji: '🩸',
    blurb: 'Rest is productive. Warm, comforting and iron-rich food can help with tiredness.',
    tags: ['warm', 'iron', 'comfort', 'chocolate'],
  },
  follicular: {
    key: 'follicular', label: 'Follicular phase', color: '#2f9e6f', soft: '#dcf3e8', emoji: '🌱',
    blurb: 'Energy usually climbs after the period — a good time for fresh, lighter meals and protein.',
    tags: ['fresh', 'protein', 'light'],
  },
  fertile: {
    key: 'fertile', label: 'Fertile window', color: '#2f7de1', soft: '#dde9fb', emoji: '✨',
    blurb: 'Often the highest-energy days. Fresh food, fibre and protein suit busy days.',
    tags: ['fresh', 'fibre', 'protein', 'light'],
  },
  luteal: {
    key: 'luteal', label: 'Luteal phase', color: '#8e4ec6', soft: '#efe3fa', emoji: '🌙',
    blurb: 'Cravings and lower energy are normal. Complex carbs and magnesium (whole grains, nuts, dark chocolate) keep you fuller.',
    tags: ['carbs', 'magnesium', 'comfort', 'warm', 'chocolate'],
  },
};

export const FLOWS = [
  { key: 'spotting', label: 'Spotting', drops: '·' },
  { key: 'light', label: 'Light', drops: '💧' },
  { key: 'medium', label: 'Medium', drops: '💧💧' },
  { key: 'heavy', label: 'Heavy', drops: '💧💧💧' },
];
export const SYMPTOMS = [
  'Cramps', 'Headache', 'Bloating', 'Tender breasts', 'Acne', 'Back pain', 'Fatigue',
  'Cravings', 'Nausea', 'Insomnia', 'Diarrhea', 'Constipation',
];
export const MOODS = [
  { key: 'happy', label: 'Happy', emoji: '😊' }, { key: 'calm', label: 'Calm', emoji: '😌' },
  { key: 'energetic', label: 'Energetic', emoji: '⚡' }, { key: 'sensitive', label: 'Sensitive', emoji: '🥺' },
  { key: 'irritable', label: 'Irritable', emoji: '😤' }, { key: 'sad', label: 'Sad', emoji: '😢' },
  { key: 'anxious', label: 'Anxious', emoji: '😰' }, { key: 'tired', label: 'Tired', emoji: '😴' },
];
export const ENERGY = ['Low', 'OK', 'High'];

/** Group logged period days (any order) into periods [{start, end, length}]. */
export function periodsFromDays(days) {
  const sorted = [...new Set(days)].sort();
  const out = [];
  for (const d of sorted) {
    const last = out[out.length - 1];
    if (last && diffDays(last.end, d) <= 2) last.end = d; // bridge a single unlogged day
    else out.push({ start: d, end: d });
  }
  return out.map((p) => ({ ...p, length: diffDays(p.start, p.end) + 1 }));
}

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

export function cycleStats(periods, settings = DEFAULT_SETTINGS) {
  const lengths = [];
  for (let i = 1; i < periods.length; i++) lengths.push(diffDays(periods[i - 1].start, periods[i].start));
  const valid = lengths.filter((l) => l >= 15 && l <= 60); // ignore forgotten logs / double logs
  const recent = valid.slice(-6);
  // Don't count a period that might still be going on (started in the last 2 days) towards period length.
  const done = periods.filter((p) => diffDays(p.end, ymd()) > 1).slice(-6);
  const avgCycle = recent.length ? Math.round(mean(recent)) : settings.cycleLength;
  const avgPeriod = done.length ? Math.max(2, Math.round(mean(done.map((p) => p.length)))) : settings.periodLength;
  const irregular = recent.length >= 3 && (Math.max(...recent) - Math.min(...recent) > 9 || recent.some((l) => l < 21 || l > 35));
  return { lengths, recent, avgCycle, avgPeriod, irregular, basedOn: recent.length };
}

/**
 * Builds the day-by-day picture: actual cycles from her log plus predicted cycles ahead.
 * Returns helpers to ask about any date.
 */
export function buildCycleModel(periodDays, settings = DEFAULT_SETTINGS, today = ymd()) {
  const periods = periodsFromDays(periodDays);
  const stats = cycleStats(periods, settings);
  const logged = new Set(periodDays);
  if (!periods.length) return { periods, stats, empty: true, infoFor: () => null, today };

  const last = periods[periods.length - 1];
  const expectedNext = addDays(last.start, stats.avgCycle);
  const lateBy = Math.max(0, diffDays(expectedNext, today));
  // If late, keep predictions in the future: the next period is "any day now" (tomorrow).
  const firstPredicted = lateBy > 0 ? addDays(today, 1) : expectedNext;
  const predictedStarts = [0, 1, 2, 3, 4, 5].map((i) => addDays(firstPredicted, i * stats.avgCycle));
  const starts = [...periods.map((p) => ({ date: p.start, actual: true })), ...predictedStarts.map((d) => ({ date: d, actual: false }))];
  const ongoing = diffDays(last.end, today) <= 1 && diffDays(last.start, today) < stats.avgPeriod + 3;

  function infoFor(d) {
    let i = -1;
    for (let k = 0; k < starts.length; k++) if (starts[k].date <= d) i = k;
    if (i < 0) return null; // before her first logged period
    const s = starts[i];
    const n = starts[i + 1];
    if (!n) return null;
    const cycleDay = diffDays(s.date, d) + 1;
    // Ovulation is estimated from the expected cycle length, so a late period doesn't drag it along.
    const expectedEnd = s.actual && i === periods.length - 1 ? expectedNext : n.date;
    const ovulation = addDays(expectedEnd < n.date ? expectedEnd : n.date, -14);
    const fertileStart = addDays(ovulation, -5);
    const fertileEnd = addDays(ovulation, 1);

    const isLogged = logged.has(d);
    let predictedPeriod = false;
    if (!s.actual) predictedPeriod = cycleDay <= stats.avgPeriod;
    else if (i === periods.length - 1 && ongoing && d >= today) predictedPeriod = cycleDay <= stats.avgPeriod;

    let phase;
    if (isLogged || predictedPeriod) phase = 'menstrual';
    else if (d >= fertileStart && d <= fertileEnd) phase = 'fertile';
    else if (d < fertileStart) phase = 'follicular';
    else phase = 'luteal';
    // Days inside an actual logged period's span but not logged (the bridged gap) still count as the period.
    if (s.actual && i < periods.length && d <= periods[i].end) phase = 'menstrual';

    return { date: d, cycleDay, phase, logged: isLogged, predictedPeriod, ovulation: d === ovulation, fertile: d >= fertileStart && d <= fertileEnd, actualCycle: s.actual };
  }

  const todayInfo = infoFor(today);
  const nextStart = lateBy > 0 ? null : expectedNext;
  const currentOvulation = todayInfo && todayInfo.actualCycle ? addDays(expectedNext, -14) : null;
  return {
    periods, stats, today, last, expectedNext, nextStart, lateBy, ongoing, todayInfo,
    predictedStarts, currentOvulation, infoFor, empty: false,
    daysUntilNext: nextStart ? diffDays(today, nextStart) : 0,
  };
}

/** Local notifications the cycle tracker wants scheduled. */
export function cycleNotifications(model, settings) {
  const out = [];
  if (!model || model.empty) {
    if (settings.dailyLog) out.push(dailyLogNotif(settings));
    return out;
  }
  const next = model.expectedNext;
  if (settings.remindBefore && model.lateBy === 0) {
    out.push({ id: 'cycle-before', date: at(addDays(next, -2), 9), title: 'Period expected in 2 days', body: 'A good moment to pack pads/tampons and plan something cosy. 🌸' });
  }
  if (settings.remindLate) {
    out.push({ id: 'cycle-late', date: at(addDays(next, 3), 10), title: 'Your period might be late', body: 'If it has started, log it so predictions stay accurate.' });
  }
  if (settings.dailyLog) out.push(dailyLogNotif(settings));
  return out;
}
const dailyLogNotif = (s) => ({ id: 'cycle-daily', daily: s.dailyLogTime, title: 'How are you feeling today?', body: 'Tap to log symptoms and mood.' });
