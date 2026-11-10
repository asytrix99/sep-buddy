import React from 'react';
import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { C } from '../../components/ui';
import GlassTabBar from '../../components/GlassTabBar';

const icon = (emoji) => function TabIcon({ focused }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.6, transform: [{ scale: focused ? 1.08 : 1 }] }}>{emoji}</Text>;
};

const renderTabBar = (props) => <GlassTabBar {...props} />;

export default function TabsLayout() {
  return (
    <Tabs initialRouteName="today" tabBar={renderTabBar} screenOptions={{
      headerShown: false,
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
