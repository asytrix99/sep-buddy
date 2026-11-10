import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { Card, Btn, Chip, C } from '../ui';
import Tree from './Tree';
import { usePersisted, KEYS } from '../../lib/storage';
import { ymd } from '../../lib/dates';

const LEN = { focus: 25, break: 5 };
const idle = (mode = 'focus', courseId = null) => ({ mode, running: false, endsAt: null, remainingMs: LEN[mode] * 60000, courseId });

/**
 * Pomodoro: 25 min focus / 5 min break. A notification fires at the end even if the app is closed.
 * A tree grows during each focus session; finished sessions are planted in today's little forest,
 * and giving up mid-session (Reset) leaves a withered tree.
 */
export default function FocusTimer({ courses, minutesByCourse }) {
  const [focus, setFocus] = usePersisted(KEYS.focus, idle());
  const [log, setLog] = usePersisted(KEYS.focusLog, []);
  const f = focus || idle();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!f.running) return undefined;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [f.running]);

  const left = f.running ? Math.max(0, f.endsAt - now) : f.remainingMs;

  // Session finished → log focus minutes and flip to the other mode.
  useEffect(() => {
    if (f.running && left <= 0) {
      if (f.mode === 'focus') setLog((l) => [...l.slice(-500), { at: Date.now(), minutes: LEN.focus, courseId: f.courseId }]);
      setFocus(idle(f.mode === 'focus' ? 'break' : 'focus', f.courseId));
    }
  }, [left <= 0, f.running]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => setFocus({ ...f, running: true, endsAt: Date.now() + f.remainingMs });
  const pause = () => setFocus({ ...f, running: false, endsAt: null, remainingMs: left });
  const focusMs = LEN.focus * 60000;
  const growing = f.mode === 'focus' && left < focusMs; // a tree has started growing
  const progress = f.mode === 'focus' ? 1 - left / focusMs : 1;
  const reset = () => {
    if (!growing) return setFocus(idle(f.mode, f.courseId));
    Alert.alert('Give up this session?', 'Your tree will wither.', [
      { text: 'Keep going', style: 'cancel' },
      {
        text: 'Give up', style: 'destructive', onPress: () => {
          setLog((l) => [...l.slice(-500), { at: Date.now(), minutes: 0, courseId: f.courseId, dead: true }]);
          setFocus(idle('focus', f.courseId));
        },
      },
    ]);
  };
  const today = ymd();
  const forest = (log || []).filter((e) => ymd(new Date(e.at)) === today);
  const weekTrees = (log || []).filter((e) => !e.dead && e.at >= now - 7 * 86400000).length;
  const MAX_SHOWN = 12;
  const mm = String(Math.floor(left / 60000)).padStart(2, '0');
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
  const total = Object.values(minutesByCourse).reduce((a, b) => a + b, 0);

  return (
    <Card>
      <View style={st.row}>
        <View style={{ marginRight: 10, opacity: f.mode === 'break' && !forest.some((e) => !e.dead) ? 0.35 : 1 }}>
          <Tree progress={progress} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.mode}>{f.mode === 'focus' ? '🍅 Focus' : '☕ Break'}</Text>
          <Text style={[st.time, { color: f.mode === 'focus' ? C.primary : '#2f9e6f' }]}>{mm}:{ss}</Text>
        </View>
        <View style={{ gap: 8 }}>
          {f.running ? <Btn kind="primary" label="Pause" onPress={pause} /> : <Btn kind="primary" label={left < LEN[f.mode] * 60000 ? 'Resume' : 'Start'} onPress={start} />}
          <Btn small label="Reset" onPress={reset} />
        </View>
      </View>
      {courses.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
          {courses.map((c) => (
            <Chip key={c.id} label={c.code || c.name} on={f.courseId === c.id} color={c.color}
              onPress={() => setFocus({ ...f, courseId: f.courseId === c.id ? null : c.id })} />
          ))}
        </ScrollView>
      )}
      {forest.length > 0 && (
        <View style={st.forest}>
          {forest.slice(-MAX_SHOWN).map((e) => <Tree key={e.at} dead={e.dead} size={24} />)}
          {forest.length > MAX_SHOWN && <Text style={st.more}>+{forest.length - MAX_SHOWN}</Text>}
        </View>
      )}
      <Text style={st.sub}>
        This week: {Math.floor(total / 60)} h {total % 60} min focused · 🌳 {weekTrees} tree{weekTrees === 1 ? '' : 's'}
      </Text>
    </Card>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  mode: { fontSize: 14, fontWeight: '700', color: '#555' },
  time: { fontSize: 46, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sub: { fontSize: 12, color: '#888', marginTop: 4 },
  forest: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 8, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#e6e7eb' },
  more: { fontSize: 12, color: '#888', marginLeft: 4, marginBottom: 4 },
});
