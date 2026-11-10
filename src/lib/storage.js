/**
 * Tiny persisted-state layer on top of AsyncStorage (data stays on the phone).
 * usePersisted(key, initial) works like useState, survives restarts, and keeps every
 * screen using the same key in sync (e.g. "home" set on the Map is seen by the Cycle tab).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const PREFIX = 'rydapp:';
const cache = new Map(); // key -> value (once loaded)
const listeners = new Map(); // key -> Set<fn>

function emit(key, value) {
  listeners.get(key)?.forEach((fn) => fn(value));
}

export async function load(key, fallback) {
  if (cache.has(key)) return cache.get(key);
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    const v = raw == null ? fallback : JSON.parse(raw);
    if (!cache.has(key)) cache.set(key, v);
    return cache.get(key);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  cache.set(key, value);
  emit(key, value);
  AsyncStorage.setItem(PREFIX + key, JSON.stringify(value)).catch(() => {});
}

export function usePersisted(key, initial) {
  const [state, setState] = useState(() => (cache.has(key) ? cache.get(key) : initial));
  const [ready, setReady] = useState(cache.has(key));

  useEffect(() => {
    let alive = true;
    const fn = (v) => alive && setState(v);
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
    load(key, initial).then((v) => {
      if (!alive) return;
      setState(v);
      setReady(true);
    });
    return () => {
      alive = false;
      listeners.get(key)?.delete(fn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback((next) => {
    const prev = cache.has(key) ? cache.get(key) : initial;
    save(key, typeof next === 'function' ? next(prev) : next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [state, set, ready];
}

/** Storage keys used across the app (one place, so nothing collides). */
export const KEYS = {
  home: 'home',
  placesCache: 'places-cache',
  placesArea: 'places-area', // { lat, lon, at, places } — last places downloaded for the map
  periodDays: 'cycle-period-days',
  dayLogs: 'cycle-day-logs',
  cycleSettings: 'cycle-settings',
  foods: 'cycle-foods',
  courses: 'study-courses',
  tasks: 'study-tasks',
  timetableUrl: 'study-timetable-url',
  timetableCache: 'study-timetable-cache',
  focus: 'study-focus',
  focusLog: 'study-focus-log',
  eventSources: 'events-sources',
  eventsCache: 'events-cache',
  myEvents: 'events-mine',
  starred: 'events-starred',
  seenEvents: 'events-seen',
  eventSettings: 'events-settings',
  notifiedEvents: 'events-notified',
  eventsCheckedAt: 'events-checked-at',
  offeredSources: 'events-offered-sources',
  expenses: 'money-expenses',
  moneySettings: 'money-settings',
  transit: 'transit-settings', // { key } Trafiklab ResRobot key for bus times
};
