/**
 * Invisible component in the root layout: checks for new events when the app opens or
 * comes back to the foreground, registers the background check, and opens the Events tab
 * when a "new event" notification is tapped.
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { checkForNewEvents, registerEventCheck } from '../lib/eventWatch';
import { load, save, KEYS } from '../lib/storage';
import { DEFAULT_SOURCES } from '../lib/events';

/** Sources added in an app update (e.g. 🏙️ Linköping city) start switched on. */
async function enableNewSources() {
  // Before this was tracked, every source except the ones added since had already been offered.
  const LATER = ['city', 'karhus', 'intl'];
  const offered = (await load(KEYS.offeredSources, null)) || DEFAULT_SOURCES.filter((id) => !LATER.includes(id));
  const enabled = await load(KEYS.eventSources, DEFAULT_SOURCES);
  const added = DEFAULT_SOURCES.filter((id) => !offered.includes(id) && !enabled.includes(id));
  if (added.length) save(KEYS.eventSources, [...enabled, ...added]);
  if (DEFAULT_SOURCES.some((id) => !offered.includes(id))) save(KEYS.offeredSources, DEFAULT_SOURCES);
}

export default function EventWatcher() {
  useEffect(() => {
    enableNewSources().then(() => checkForNewEvents()).catch(() => {});
    registerEventCheck();
    const app = AppState.addEventListener('change', (s) => { if (s === 'active') checkForNewEvents().catch(() => {}); });
    const tap = Notifications.addNotificationResponseReceivedListener((r) => {
      if (r.notification.request.content.data?.screen === 'events') router.navigate('/events');
    });
    return () => { app.remove(); tap.remove(); };
  }, []);
  return null;
}
