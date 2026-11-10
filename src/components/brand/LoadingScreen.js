/**
 * Cute launch screen shown over the app for a moment while it loads: the Sep Buddy mascot
 * bounces, sparkles twinkle and a little status line plays, then it all fades away.
 * Same background and mascot position as the native splash (app.json → expo-splash-screen),
 * so the hand-over from the native splash is seamless.
 */
import React, { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import BUDDY from './buddyMarkup';
import { C } from '../ui';

const SIZE = 200; // matches imageWidth of the native splash
const XML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><g transform="translate(0 30)">${BUDDY}</g></svg>`;
const LINES = [
  'Packing your day ☁️',
  'Checking the buses 🚌',
  'Watering your focus tree 🌱',
  'Finding fika nearby ☕',
  'Peeking at tonight’s events 🎉',
];
const SHOW_MS = 1700;

export default function LoadingScreen({ onDone }) {
  const [line] = useState(() => LINES[Math.floor(Math.random() * LINES.length)]);
  const bounce = useState(() => new Animated.Value(0))[0]; // 0 = on the ground, 1 = up
  const fade = useState(() => new Animated.Value(1))[0];
  const intro = useState(() => new Animated.Value(0))[0];
  const dots = useState(() => [0, 1, 2].map(() => new Animated.Value(0)))[0];
  const twinkle = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    const ease = Easing.inOut(Easing.quad);
    const hop = Animated.loop(Animated.sequence([
      Animated.timing(bounce, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(bounce, { toValue: 0, duration: 420, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.delay(120),
    ]));
    const dotLoop = Animated.loop(Animated.stagger(140, dots.map((d) => Animated.sequence([
      Animated.timing(d, { toValue: 1, duration: 260, easing: ease, useNativeDriver: true }),
      Animated.timing(d, { toValue: 0, duration: 260, easing: ease, useNativeDriver: true }),
    ]))));
    const tw = Animated.loop(Animated.sequence([
      Animated.timing(twinkle, { toValue: 1, duration: 700, easing: ease, useNativeDriver: true }),
      Animated.timing(twinkle, { toValue: 0, duration: 700, easing: ease, useNativeDriver: true }),
    ]));
    hop.start();
    dotLoop.start();
    tw.start();
    Animated.timing(intro, { toValue: 1, duration: 450, delay: 150, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }).start();
    const t = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 380, easing: ease, useNativeDriver: true }).start(() => onDone?.());
    }, SHOW_MS);
    return () => { clearTimeout(t); hop.stop(); dotLoop.stop(); tw.stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lift = bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -22] });
  const squish = bounce.interpolate({ inputRange: [0, 0.15, 1], outputRange: [1, 1, 1.03] });
  const shadowScale = bounce.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] });
  const shadowOpacity = bounce.interpolate({ inputRange: [0, 1], outputRange: [0.14, 0.07] });
  const textIn = {
    opacity: intro,
    transform: [{ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
  };

  return (
    <Animated.View style={[StyleSheet.absoluteFill, st.wrap, { opacity: fade }]} pointerEvents="none">
      <View style={st.stage}>
        <Sparkle style={{ top: 18, left: -34 }} size={22} v={twinkle} />
        <Sparkle style={{ top: 64, right: -40 }} size={16} v={twinkle} invert />
        <Sparkle style={{ bottom: 70, left: -48 }} size={14} v={twinkle} invert />
        <Sparkle style={{ bottom: 46, right: -30 }} size={20} v={twinkle} />
        <Animated.View style={[st.shadow, { opacity: shadowOpacity, transform: [{ scaleX: shadowScale }] }]} />
        <Animated.View style={{ transform: [{ translateY: lift }, { scale: squish }] }}>
          <SvgXml xml={XML} width={SIZE} height={SIZE} />
        </Animated.View>
      </View>

      <Animated.View style={[st.textBox, textIn]}>
        <Text style={st.title}>Sep Buddy</Text>
        <View style={st.lineRow}>
          <Text style={st.line}>{line}</Text>
        </View>
        <View style={st.dots}>
          {dots.map((d, i) => (
            <Animated.View key={i} style={[st.dot, {
              opacity: d.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
              transform: [{ translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }],
            }]} />
          ))}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

function Sparkle({ style, size, v, invert }) {
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: invert ? [1, 0.25] : [0.25, 1] });
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: invert ? [1, 0.7] : [0.7, 1] });
  return <Animated.Text style={[st.sparkle, style, { fontSize: size, opacity, transform: [{ scale }] }]}>✦</Animated.Text>;
}

const st = StyleSheet.create({
  wrap: { backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  stage: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  // Ground shadow sits where the native splash draws it (y ≈ 900/1024 of the image).
  shadow: { position: 'absolute', top: SIZE * (900 / 1024) - 5, width: SIZE * 0.27, height: 10, borderRadius: 5, backgroundColor: C.text },
  sparkle: { position: 'absolute', color: C.sky },
  textBox: { position: 'absolute', top: '50%', marginTop: SIZE / 2 + 18, alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: C.text, letterSpacing: 0.3 },
  lineRow: { marginTop: 6 },
  line: { fontSize: 14, color: C.sub },
  dots: { flexDirection: 'row', gap: 7, marginTop: 14 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary },
});
