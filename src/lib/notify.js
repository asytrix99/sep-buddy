/**
 * All reminders are *local* notifications (they work in Expo Go — no server needed).
 * Each feature describes the reminders it wants as a list; syncNotifications() cancels
 * everything and re-schedules the nearest ones. iOS only keeps 64 pending notifications,
 * so we schedule at most MAX, nearest first, and refresh every time the app opens.
 *
 * Item shape: { id, title, body, date: Date }  or  { id, title, body, daily: { hour, minute } }
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const MAX = 60;
let lastSignature = '';

export function initNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.HIGH,
    }).catch(() => {});
  }
}

export async function ensurePermission() {
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted || cur.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return true;
    if (!cur.canAskAgain) return false;
    const req = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    return !!req.granted;
  } catch {
    return false;
  }
}

export async function syncNotifications(items, now = new Date()) {
  const daily = items.filter((i) => i.daily);
  const dated = items
    .filter((i) => i.date && i.date.getTime() > now.getTime() + 30000)
    .sort((a, b) => a.date - b.date)
    .slice(0, Math.max(0, MAX - daily.length));
  const all = [...daily, ...dated];
  const signature = JSON.stringify(all.map((i) => [i.id, i.title, i.body, i.date?.getTime(), i.daily]));
  if (signature === lastSignature) return all.length;
  if (!(await ensurePermission())) return 0;
  lastSignature = signature;
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const i of all) {
    const trigger = i.daily
      ? { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: i.daily.hour, minute: i.daily.minute, channelId: 'default' }
      : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: i.date, channelId: 'default' };
    try {
      await Notifications.scheduleNotificationAsync({
        content: { title: i.title, body: i.body, data: { id: i.id, url: i.url } },
        trigger,
      });
    } catch {
      // one bad item shouldn't stop the rest
    }
  }
  return all.length;
}
