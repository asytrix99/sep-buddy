/**
 * Watches the events feed for events that weren't there before and sends a phone
 * notification ("🆕 3 new events: …").
 *
 * Runs (1) when the app opens / comes back to the foreground, (2) on pull-to-refresh in the
 * Events tab (no notification then — you're already looking), and (3) as a background task
 * every few hours when the phone allows it (iOS decides the exact timing).
 *
 * The first check only records what's already in the feed, so you aren't flooded on day one.
 */
import * as Notifications from 'expo-notifications';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { load, save, KEYS } from './storage';
import { ensurePermission } from './notify';
import {
  EVENTS_FEED_URL, BUNDLED_FEED, DEFAULT_SOURCES, DEFAULT_EVENT_SETTINGS, SOURCE, fetchFeed, visibleEvents,
} from './events';
import { fmtShort, ymd } from './dates';

export const EVENT_CHECK_TASK = 'ryd-check-new-events';
const MIN_GAP_MS = 30 * 60000; // don't hit the feed more than every 30 min unless forced

/**
 * Fetch the feed (if a feed link is set), save it, and notify about events never seen before.
 * Returns { ok, error?, fresh: [] }.
 */
export async function checkForNewEvents({ force = false, notify = true } = {}) {
  const settings = { ...DEFAULT_EVENT_SETTINGS, ...(await load(KEYS.eventSettings, DEFAULT_EVENT_SETTINGS)) };
  const url = settings.feedUrl || EVENTS_FEED_URL;
  let feed = await load(KEYS.eventsCache, BUNDLED_FEED);
  // An app update can ship a newer bundled events.json than the copy saved on the phone.
  const stamp = (f) => (f?.updatedAt ? Date.parse(f.updatedAt) : 0);
  if (stamp(BUNDLED_FEED) > stamp(feed)) {
    feed = BUNDLED_FEED;
    save(KEYS.eventsCache, feed);
  }

  if (url) {
    const last = await load(KEYS.eventsCheckedAt, 0);
    if (force || Date.now() - last > MIN_GAP_MS) {
      try {
        feed = await fetchFeed(url);
        save(KEYS.eventsCache, feed);
        save(KEYS.eventsCheckedAt, Date.now());
      } catch (e) {
        return { ok: false, error: e.message, fresh: [] };
      }
    }
  }

  // "Known" = every feed event id we've ever recorded (all sources, so switching a
  // source on later doesn't trigger a flood of "new" notifications).
  const all = feed?.events || [];
  const known = await load(KEYS.notifiedEvents, null);
  const allIds = all.map((e) => e.id);
  if (known === null) {
    save(KEYS.notifiedEvents, allIds);
    return { ok: true, fresh: [] };
  }
  const knownSet = new Set(known);
  const sources = await load(KEYS.eventSources, DEFAULT_SOURCES);
  const fresh = visibleEvents(all.filter((e) => !knownSet.has(e.id)), [], sources);
  if (allIds.some((id) => !knownSet.has(id))) save(KEYS.notifiedEvents, [...known, ...allIds.filter((id) => !knownSet.has(id))].slice(-3000));

  if (notify && fresh.length && settings.notifyNew !== false && (await ensurePermission())) {
    const line = (e) => `${(SOURCE[e.source] || SOURCE.other).emoji} ${e.title} · ${fmtShort(ymd(new Date(e.start)))}`;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: fresh.length === 1 ? '🆕 New event' : `🆕 ${fresh.length} new events`,
        body: fresh.slice(0, 3).map(line).join('\n') + (fresh.length > 3 ? `\n+${fresh.length - 3} more` : ''),
        data: { screen: 'events' },
      },
      trigger: null, // show now
    }).catch(() => {});
  }
  return { ok: true, fresh };
}

// Background task — must be defined at module load (this file is imported by the root layout).
TaskManager.defineTask(EVENT_CHECK_TASK, async () => {
  try {
    const r = await checkForNewEvents({ force: true });
    return r.ok ? BackgroundTask.BackgroundTaskResult.Success : BackgroundTask.BackgroundTaskResult.Failed;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Ask the OS to run the check every few hours in the background (no-op if unavailable). */
export async function registerEventCheck() {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return false;
    if (!(await TaskManager.isTaskRegisteredAsync(EVENT_CHECK_TASK))) {
      await BackgroundTask.registerTaskAsync(EVENT_CHECK_TASK, { minimumInterval: 180 }); // minutes
    }
    return true;
  } catch {
    return false;
  }
}
