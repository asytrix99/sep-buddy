/**
 * Apple-Calendar-style month grid: Monday first, today in red, the selected day in a filled
 * circle, and up to three coloured dots per day (one per source that has events that day).
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ymd } from '../../lib/dates';
import { C } from '../ui';

const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const RED = C.primary; // accent (month name, arrows, today) — follows the app theme

/** month = 'YYYY-MM'; dots = { 'YYYY-MM-DD': ['#color', ...] } */
export default function MonthCalendar({ month, selected, onSelect, onMonth, dots }) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7; // Monday-first offset
  const count = new Date(y, m, 0).getDate();
  const today = ymd();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const shift = (n) => {
    const d = new Date(y, m - 1 + n, 1);
    onMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const isThisMonth = today.startsWith(month);

  return (
    <View>
      <View style={st.head}>
        <Text style={st.title}>
          <Text style={{ color: RED }}>{MONTHS[m - 1]}</Text> {y}
        </Text>
        {!(isThisMonth && selected === today) && (
          <TouchableOpacity onPress={() => { onMonth(today.slice(0, 7)); onSelect(today); }} style={st.todayBtn}>
            <Text style={st.todayText}>Today</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity hitSlop={10} onPress={() => shift(-1)} accessibilityLabel="Previous month"><Text style={st.arrow}>‹</Text></TouchableOpacity>
        <TouchableOpacity hitSlop={10} onPress={() => shift(1)} accessibilityLabel="Next month"><Text style={st.arrow}>›</Text></TouchableOpacity>
      </View>

      <View style={st.row}>
        {WEEK.map((d, i) => <Text key={i} style={[st.wd, i > 4 && { color: '#9a9ca3' }]}>{d}</Text>)}
      </View>

      {weeks.map((w, wi) => (
        <View key={wi} style={[st.row, st.week]}>
          {w.map((day, i) => {
            if (!day) return <View key={i} style={st.cell} />;
            const isToday = day === today;
            const isSel = day === selected;
            const ds = dots[day] || [];
            return (
              <TouchableOpacity key={day} style={st.cell} onPress={() => onSelect(day)} activeOpacity={0.6}
                accessibilityLabel={`${day}${ds.length ? `, ${ds.length} source${ds.length > 1 ? 's' : ''} with events` : ''}`}>
                <View style={[st.num, isSel && { backgroundColor: isToday ? RED : C.text }]}>
                  <Text style={[
                    st.numText,
                    i > 4 && { color: '#6b6e76' },
                    isToday && { color: RED, fontWeight: '700' },
                    isSel && { color: '#fff', fontWeight: '700' },
                  ]}>{Number(day.slice(8))}</Text>
                </View>
                <View style={st.dots}>
                  {ds.slice(0, 3).map((c, k) => <View key={k} style={[st.dot, { backgroundColor: c }]} />)}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 14 },
  title: { flex: 1, fontSize: 22, fontWeight: '800', color: '#111' },
  todayBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: C.soft },
  todayText: { color: RED, fontWeight: '700', fontSize: 13 },
  arrow: { fontSize: 28, color: RED, lineHeight: 30, paddingHorizontal: 4 },
  row: { flexDirection: 'row' },
  week: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#e6e7eb' },
  wd: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: '#6b6e76', marginBottom: 6 },
  cell: { flex: 1, alignItems: 'center', paddingTop: 5, paddingBottom: 4, minHeight: 50 },
  num: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  numText: { fontSize: 17, color: '#111', fontVariant: ['tabular-nums'] },
  dots: { flexDirection: 'row', gap: 3, height: 6, marginTop: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
