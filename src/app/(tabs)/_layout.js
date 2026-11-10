import React from 'react';
import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { C } from '../../components/ui';

const icon = (emoji) => function TabIcon({ focused }) {
  return <Text style={{ fontSize: 21, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>;
};

export default function TabsLayout() {
  return (
    <Tabs initialRouteName="today" screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: C.primary,
      tabBarInactiveTintColor: C.sub,
      tabBarStyle: { backgroundColor: C.tabBar, borderTopColor: C.line },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      sceneStyle: { backgroundColor: C.bg },
    }}>
      <Tabs.Screen name="today" options={{ title: 'Today', tabBarIcon: icon('☀️') }} />
      <Tabs.Screen name="index" options={{ title: 'Map', tabBarIcon: icon('🗺️') }} />
      <Tabs.Screen name="cycle" options={{ title: 'Cycle', tabBarIcon: icon('🌸') }} />
      <Tabs.Screen name="study" options={{ title: 'Study', tabBarIcon: icon('📚') }} />
      <Tabs.Screen name="events" options={{ title: 'Events', tabBarIcon: icon('🎉') }} />
      <Tabs.Screen name="money" options={{ title: 'Money', tabBarIcon: icon('💸') }} />
    </Tabs>
  );
}
