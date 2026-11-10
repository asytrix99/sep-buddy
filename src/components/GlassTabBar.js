/**
 * Floating Liquid Glass tab bar (iOS 26+ style) for the six tabs. Apple's own native tab bar
 * only fits five tabs on iPhone (the rest go under "More"), so this draws the bar with a
 * real native GlassView instead, with a sliding glass "pill" behind the selected tab.
 */
import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, Glass, TAB_BAR_H, shadow } from './ui';

// Expo Router (SDK 58) passes `emitter` + `navigateToTab` to a custom tab bar — not React
// Navigation's `navigation` object — so tab presses go through those.
export default function GlassTabBar({ state, descriptors, emitter, navigateToTab }) {
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const [x] = useState(() => new Animated.Value(0));
  const n = state.routes.length;
  const tabW = width ? (width - PAD * 2) / n : 0;

  useEffect(() => {
    if (!tabW) return;
    Animated.spring(x, { toValue: state.index * tabW, useNativeDriver: true, speed: 18, bounciness: 7 }).start();
  }, [state.index, tabW, x]);

  return (
    <View pointerEvents="box-none" style={[st.wrap, { bottom: Math.max(insets.bottom - 6, 10) }]}>
      <View style={st.shadowBox}>
        <Glass interactive style={st.bar} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {!!tabW && (
            <Animated.View pointerEvents="none" style={[st.pill, { width: tabW, transform: [{ translateX: x }] }]} />
          )}
          {state.routes.map((route, i) => {
            const { options } = descriptors[route.key];
            const focused = state.index === i;
            const label = options.title ?? route.name;
            const onPress = () => {
              const ev = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !ev.defaultPrevented) navigateToTab(route.key);
            };
            return (
              <TouchableOpacity key={route.key} onPress={onPress} style={st.tab} activeOpacity={0.7}
                accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={label}>
                {options.tabBarIcon?.({ focused, color: focused ? C.primary : C.sub, size: 22 })}
                <Text style={[st.label, focused && st.labelOn]} numberOfLines={1}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </Glass>
      </View>
    </View>
  );
}

const PAD = 5;
const st = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12 },
  shadowBox: { borderRadius: TAB_BAR_H / 2, ...shadow, shadowOpacity: 0.14, shadowRadius: 16 },
  bar: { height: TAB_BAR_H, borderRadius: TAB_BAR_H / 2, flexDirection: 'row', alignItems: 'center', paddingHorizontal: PAD, overflow: 'hidden' },
  pill: { position: 'absolute', left: PAD, top: 5, bottom: 5, borderRadius: (TAB_BAR_H - 10) / 2, backgroundColor: 'rgba(26,116,184,0.14)' },
  tab: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 1 },
  label: { fontSize: 10, fontWeight: '600', color: C.sub },
  labelOn: { color: C.primary, fontWeight: '700' },
});
