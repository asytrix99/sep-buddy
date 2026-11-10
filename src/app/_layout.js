import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { initNotifications } from '../lib/notify';
import NotificationSync from '../components/NotificationSync';
import EventWatcher from '../components/EventWatcher';

export default function RootLayout() {
  useEffect(() => {
    initNotifications();
  }, []);
  return (
    <>
      <StatusBar style="dark" />
      <NotificationSync />
      <EventWatcher />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
