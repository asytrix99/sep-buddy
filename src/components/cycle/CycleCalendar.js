import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ymd, monthName } from '../../lib/dates';
import { PHASES } from '../../lib/cycle';

const WD = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Month grid coloured by cycle phase. editMode: tapping a day toggles it as a period day. */
export default function CycleCalendar({ model, dayLogs, editMode, onPressDay, today }) {
  const t = new Date();
  const [ym, setYm] = useState({ y: t.getFullYear(), m: t.getMonth() });

  const cells = useMemo(() => {
    const first = new Date(ym.y, ym.m, 1, 12);
    const lead = (first.getDay() + 6) % 7; // Monday first
    const n = new Date(ym.y, ym.m + 1, 0).getDate();
    const out = Array(lead).fill(null);
    for (let d = 1; d <= n; d++) out.push(ymd(new Date(ym.y, ym.m, d, 12)));
    while (out.length % 7) out.push(null);
    return out;
  }, [ym]);

  const move = (k) => setYm(({ y, m }) => {
    const d = new Date(y, m + k, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  return (
    <View>
      <View style={st.head}>
        <TouchableOpacity onPress={() => move(-1)} hitSlop={10}><Text style={st.arrow}>‹</Text></TouchableOpacity>
        <Text style={st.month}>{monthName(ym.y, ym.m)}</Text>
        <TouchableOpacity onPress={() => move(1)} hitSlop={10}><Text style={st.arrow}>›</Text></TouchableOpacity>
      </View>
      <View style={st.row}>{WD.map((w, i) => <Text key={i} style={st.wd}>{w}</Text>)}</View>
      <View style={st.grid}>
        {cells.map((d, i) => {
          if (!d) return <View key={i} style={st.cell} />;
          const info = model.empty ? null : model.infoFor(d);
          const isToday = d === today;
          const future = d > today;
          let bg = 'transparent';
          let border = 'transparent';
          let fg = '#222';
          let dashed = false;
          if (info?.logged) { bg = PHASES.menstrual.color; fg = '#fff'; } else if (info?.predictedPeriod) { border = PHASES.menstrual.color; bg = PHASES.menstrual.soft; dashed = true; } else if (info?.ovulation) { bg = PHASES.fertile.color; fg = '#fff'; } else if (info?.fertile) { bg = PHASES.fertile.soft; }
          if (editMode && future) fg = '#bbb';
          return (
            <TouchableOpacity key={i} style={st.cell} disabled={editMode && future} onPress={() => onPressDay(d)}>
              <View style={[st.day, { backgroundColor: bg, borderColor: isToday ? '#111' : border, borderStyle: dashed && !isToday ? 'dashed' : 'solid', borderWidth: isToday || border !== 'transparent' ? 2 : 0 }]}>
                <Text style={[st.dayText, { color: fg }, isToday && { fontWeight: '800' }]}>{+d.slice(8)}</Text>
              </View>
              {!!dayLogs[d] && <View style={st.dot} />}
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={st.legend}>
        <Legend color={PHASES.menstrual.color} label="Period" />
        <Legend color={PHASES.menstrual.soft} border={PHASES.menstrual.color} label="Predicted" />
        <Legend color={PHASES.fertile.soft} label="Fertile" />
        <Legend color={PHASES.fertile.color} label="Ovulation" />
      </View>
    </View>
  );
}

const Legend = ({ color, border, label }) => (
  <View style={st.legItem}>
    <View style={[st.legDot, { backgroundColor: color, borderColor: border || color, borderStyle: border ? 'dashed' : 'solid' }]} />
    <Text style={st.legText}>{label}</Text>
  </View>
);

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  arrow: { fontSize: 28, color: '#555', paddingHorizontal: 10 },
  month: { fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row' },
  wd: { flex: 1, textAlign: 'center', fontSize: 12, color: '#999', fontWeight: '600', marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 14 },
  dot: { position: 'absolute', bottom: 2, width: 4, height: 4, borderRadius: 2, backgroundColor: '#8e4ec6' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 12 },
  legItem: { flexDirection: 'row', alignItems: 'center' },
  legDot: { width: 12, height: 12, borderRadius: 6, marginRight: 5, borderWidth: 1.5 },
  legText: { fontSize: 12, color: '#666' },
});
