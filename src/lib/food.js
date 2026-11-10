/**
 * "What to eat near me" for the cycle tab.
 * Each food she likes has tags (warm, iron, fresh, …). The current cycle phase also has tags
 * (see PHASES in cycle.js). Foods sharing the most tags with the phase come first, and each
 * one is matched to nearby places from the map data by keywords (name / cuisine / shop type).
 */
import { dist } from './geo';

export const FOOD_TAGS = [
  { key: 'warm', label: 'Warm', emoji: '🍲' },
  { key: 'comfort', label: 'Comfort', emoji: '🛋️' },
  { key: 'iron', label: 'Iron-rich', emoji: '🥩' },
  { key: 'protein', label: 'Protein', emoji: '🍗' },
  { key: 'fresh', label: 'Fresh', emoji: '🥗' },
  { key: 'light', label: 'Light', emoji: '🍃' },
  { key: 'fibre', label: 'Fibre', emoji: '🌾' },
  { key: 'carbs', label: 'Complex carbs', emoji: '🍠' },
  { key: 'magnesium', label: 'Magnesium', emoji: '🥜' },
  { key: 'chocolate', label: 'Chocolate', emoji: '🍫' },
  { key: 'sweet', label: 'Sweet treat', emoji: '🍰' },
];

/**
 * Starter list — replace with what she actually likes (editable in the app: Cycle → Food ideas → Edit).
 * kind: 'out' = eat out (matches restaurants/cafés), 'buy' = buy it (matches grocery shops).
 * keywords: matched against the place name and its OpenStreetMap cuisine/shop tags.
 */
export const STARTER_FOODS = [
  { id: 'f1', name: 'Ramen / noodle soup', kind: 'out', tags: ['warm', 'comfort', 'protein'], keywords: ['ramen', 'noodle', 'asian', 'japanese', 'korean', 'chinese', 'thai'] },
  { id: 'f2', name: 'Sushi', kind: 'out', tags: ['fresh', 'protein', 'light'], keywords: ['sushi', 'japanese'] },
  { id: 'f3', name: 'Pizza', kind: 'out', tags: ['comfort', 'carbs'], keywords: ['pizza', 'italian'] },
  { id: 'f4', name: 'Burger', kind: 'out', tags: ['iron', 'protein', 'comfort'], keywords: ['burger'] },
  { id: 'f5', name: 'Fika (coffee & cake)', kind: 'out', tags: ['sweet', 'comfort'], keywords: ['cafe', 'coffee', 'cake', 'bakery'] },
  { id: 'f6', name: 'Dark chocolate & nuts', kind: 'buy', tags: ['chocolate', 'magnesium', 'sweet'], keywords: [] },
];

const placeText = (p) => [p.name, p.tags?.cuisine, p.tags?.amenity, p.tags?.shop].filter(Boolean).join(' ').toLowerCase().replace(/[_;]/g, ' ');

export function placesFor(food, places, origin, { max = 2, radius = 4000 } = {}) {
  const kw = (food.keywords || []).map((k) => k.trim().toLowerCase()).filter(Boolean);
  const pool = places.filter((p) => {
    if (food.kind === 'buy') return p.cat === 'grocery' && (!kw.length || kw.some((k) => placeText(p).includes(k)));
    return p.cat === 'food' && kw.length && kw.some((k) => placeText(p).includes(k));
  });
  return pool
    .map((p) => ({ ...p, away: dist(origin, p) }))
    .filter((p) => p.away <= radius)
    .sort((a, b) => a.away - b.away)
    .slice(0, max);
}

/** Foods ranked for a phase: [{food, score, matched: [tag…], places: […]}] */
export function recommendFoods(foods, phase, places, origin, limit = 4) {
  if (!phase) return [];
  return foods
    .map((f) => {
      const matched = f.tags.filter((t) => phase.tags.includes(t));
      return { food: f, score: matched.length, matched, places: placesFor(f, places, origin) };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || (b.places.length > 0) - (a.places.length > 0))
    .slice(0, limit);
}
