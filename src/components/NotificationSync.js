/**
 * Invisible component in the root layout: whenever cycle / study / event data changes
 * (or the app comes back to the foreground on a new day), it rebuilds the full list of
 * reminders and re-schedules them. Keeping this in one place means a reminder is never
 * lost just because a tab hasn't been opened yet.
 */
import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { usePersisted, KEYS } from '../lib/storage';
import { syncNotifications } from '../lib/notify';
import { buildCycleModel, cycleNotifications, DEFAULT_SETTINGS } from '../lib/cycle';
import { studyNotifications } from '../lib/study';
import { eventNotifications, visibleEvents, BUNDLED_FEED, DEFAULT_SOURCES, DEFAULT_EVENT_SETTINGS } from '../lib/events';
import { ymd } from '../lib/dates';
import { semesterNotifications } from '../lib/semester';

export default function NotificationSync() {
  const [periodDays, , r1] = usePersisted(KEYS.periodDays, []);
  const [cycleSettings, , r2] = usePersisted(KEYS.cycleSettings, DEFAULT_SETTINGS);
  const [tasks, , r3] = usePersisted(KEYS.tasks, []);
  const [courses, , r4] = usePersisted(KEYS.courses, []);
  const [focus, , r5] = usePersisted(KEYS.focus, null);
  const [feed, , r6] = usePersisted(KEYS.eventsCache, BUNDLED_FEED);
  const [mine, , r7] = usePersisted(KEYS.myEvents, []);
  const [sources, , r8] = usePersisted(KEYS.eventSources, DEFAULT_SOURCES);
  const [starred, , r9] = usePersisted(KEYS.starred, []);
  const [evSettings, , r10] = usePersisted(KEYS.eventSettings, DEFAULT_EVENT_SETTINGS);
  const ready = r1 && r2 && r3 && r4 && r5 && r6 && r7 && r8 && r9 && r10;

  const [day, setDay] = useState(ymd());
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') setDay(ymd()); });
    return () => sub.remove();
  }, []);

  const items = useMemo(() => {
    if (!ready) return null;
    const cs = { ...DEFAULT_SETTINGS, ...cycleSettings };
    const model = buildCycleModel(periodDays, cs, day);
    const events = visibleEvents(feed?.events || [], mine, sources);
    return [
      ...cycleNotifications(model, cs),
      ...studyNotifications(tasks, courses, focus),
      ...semesterNotifications(),
      ...eventNotifications(events, starred, { ...DEFAULT_EVENT_SETTINGS, ...evSettings }),
    ];
  }, [ready, periodDays, cycleSettings, tasks, courses, focus, feed, mine, sources, starred, evSettings, day]);

  useEffect(() => {
    if (!items) return undefined;
    const t = setTimeout(() => { syncNotifications(items).catch(() => {}); }, 800);
    return () => clearTimeout(t);
  }, [items]);

  return null;
}
