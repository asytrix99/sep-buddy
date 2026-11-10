/**
 * Expense tracking helpers. Amounts are stored in kronor (numbers), dates as 'YYYY-MM-DD'.
 * An expense: { id, amount, cat, note, date }
 */
import { parseYmd, ymd } from './dates';

// Fixed order = fixed colour. A category always keeps its colour, whatever else is shown.
// Colours are a colour-blind-checked palette; "Other" is neutral grey on purpose.
export const EXP_CATS = [
  { key: 'groceries', label: 'Groceries', emoji: '🛒', color: '#2a78d6' },
  { key: 'eating', label: 'Eating out', emoji: '🍜', color: '#eb6834' },
  { key: 'rent', label: 'Rent & bills', emoji: '🏠', color: '#1baf7a' },
  { key: 'transport', label: 'Transport', emoji: '🚌', color: '#eda100' },
  { key: 'fun', label: 'Fun & going out', emoji: '🎉', color: '#e87ba4' },
  { key: 'study', label: 'Study', emoji: '📚', color: '#008300' },
  { key: 'shopping', label: 'Shopping', emoji: '🛍️', color: '#6250d6' },
  { key: 'health', label: 'Health & care', emoji: '💊', color: '#e34948' },
  { key: 'other', label: 'Other', emoji: '📦', color: '#8a8f98' },
];
export const EXP_CAT = Object.fromEntries(EXP_CATS.map((c) => [c.key, c]));

/** 'YYYY-MM' for a 'YYYY-MM-DD' day (or today). */
export const monthKey = (day = ymd()) => day.slice(0, 7);

export function shiftMonth(key, n) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthShort = (key) => MONTHS[Number(key.slice(5, 7)) - 1];
export const monthLong = (key) => `${MONTHS_LONG[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

export function daysInMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** "1 234 kr" (whole kronor) — or "12.50 kr" when asked for decimals. */
export function kr(n, { decimals = false } = {}) {
  const v = Number(n) || 0;
  const neg = v < 0;
  const abs = Math.abs(v);
  const whole = decimals && abs % 1 ? abs.toFixed(2) : String(Math.round(abs));
  const [i, f] = whole.split('.');
  return `${neg ? '−' : ''}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${f ? '.' + f : ''} kr`;
}

/** Parse what someone typed ("120", "89,50", "1 200") into a number, or NaN. */
export function parseAmount(s) {
  const t = String(s || '').replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(t)) return NaN;
  return Number(t);
}

export const inMonth = (expenses, key) => expenses.filter((e) => e.date.startsWith(key));
export const sum = (list) => list.reduce((a, e) => a + e.amount, 0);

/** Per-category totals for a list, in the fixed category order, empty categories dropped. */
export function byCategory(list) {
  const t = {};
  list.forEach((e) => { t[e.cat] = (t[e.cat] || 0) + e.amount; });
  const total = sum(list);
  return EXP_CATS.filter((c) => t[c.key] > 0).map((c) => ({ ...c, value: t[c.key], share: total ? t[c.key] / total : 0 }));
}

/** Totals for the `n` months ending at `endKey` (oldest first). */
export function monthTotals(expenses, endKey, n = 6) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = shiftMonth(endKey, -i);
    out.push({ key, label: monthShort(key), total: sum(inMonth(expenses, key)) });
  }
  return out;
}

/** Expenses grouped by day, newest day first: [{ day, total, items }]. */
export function groupByDay(list) {
  const m = new Map();
  [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).forEach((e) => {
    if (!m.has(e.date)) m.set(e.date, []);
    m.get(e.date).push(e);
  });
  return [...m.entries()].map(([day, items]) => ({ day, items, total: sum(items) }));
}

/**
 * Budget status for a month: spent, left, and (for the current month) how much
 * you can spend per day for the rest of it.
 */
export function budgetStatus(spent, budget, key, today = ymd()) {
  if (!budget) return null;
  const left = budget - spent;
  const isNow = monthKey(today) === key;
  const daysLeft = isNow ? daysInMonth(key) - parseYmd(today).getDate() + 1 : 0;
  return {
    left,
    ratio: spent / budget,
    over: left < 0,
    daysLeft,
    perDay: isNow && left > 0 ? left / daysLeft : 0,
    // Where you "should" be by today if spending evenly (only for the current month).
    pace: isNow ? (parseYmd(today).getDate() / daysInMonth(key)) : null,
  };
}
