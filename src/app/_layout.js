import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { initNotifications } from '../lib/notify';
import NotificationSync from '../components/NotificationSync';
import EventWatcher from '../components/EventWatcher';
import LoadingScreen from '../components/brand/LoadingScreen';

export default function RootLayout() {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    initNotifications();
  }, []);
  return (
    <>
      <StatusBar style="dark" />
      <NotificationSync />
      <EventWatcher />
      <Stack screenOptions={{ headerShown: false }} />
      {loading && <LoadingScreen onDone={() => setLoading(false)} />}
    </>
  );
}
