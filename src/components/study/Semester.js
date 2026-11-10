import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Card, Sheet, Chip, Label } from '../ui';
import { SEMESTER, KIND, semesterStatus, isoWeek, GRID, SLOTS, DAYS, BLOCK_COLORS, coursesByBlock } from '../../lib/semester';
import { fmtShort, ymd } from '../../lib/dates';

const range = (p) => (p.start === p.end ? fmtShort(p.start) : `${fmtShort(p.start)} – ${fmtShort(p.end)}`);

/** Compact "where are we in the semester" card; tap for all key dates + block timetable. */
export function SemesterCard({ courses }) {
  const [open, setOpen] = useState(false);
  const today = ymd();
  const s = semesterStatus(today);

  let line1;
  let line2;
  if (s.phase === 'before') {
    line1 = `${SEMESTER.name} starts in ${s.daysToStart} days`;
    line2 = `Study period 1 begins ${fmtShort(SEMESTER.start)} (week ${isoWeek(SEMESTER.start)})`;
  } else if (s.phase === 'after') {
    line1 = `${SEMESTER.name} is over 🎉`;
    line2 = 'Update the dates in src/lib/semester.js for the next term.';
  } else {
    line1 = `${s.special ? s.special.label : s.studyPeriod?.label || SEMESTER.name} · week ${s.week}`;
    line2 = s.next ? `Next: ${s.next.label} in ${s.daysToNext} day${s.daysToNext === 1 ? '' : 's'} (${fmtShort(s.next.start)})` : '';
  }
  const color = s.special ? KIND[s.special.kind].color : '#2979ff';

  return (
    <>
      <TouchableOpacity activeOpacity={0.85} onPress={() => setOpen(true)}>
        <Card style={{ borderLeftWidth: 5, borderLeftColor: color }}>
          <Text style={st.kicker}>🗓️ {SEMESTER.name} · {s.term}</Text>
          <Text style={st.big}>{line1}</Text>
          {!!line2 && <Text style={st.sub}>{line2}</Text>}
          <Text style={st.more}>Key dates & block timetable ›</Text>
        </Card>
      </TouchableOpacity>
      <SemesterSheet visible={open} onClose={() => setOpen(false)} courses={courses} term={s.term} />
    </>
  );
}

function SemesterSheet({ visible, onClose, courses, term: initialTerm }) {
  const [term, setTerm] = useState(initialTerm);
  const today = ymd();
  const byBlock = coursesByBlock(courses, term);
  return (
    <Sheet visible={visible} title={SEMESTER.name} onClose={onClose}>
      <Text style={st.p}>{fmtShort(SEMESTER.start)} – {fmtShort(SEMESTER.end)} (week {isoWeek(SEMESTER.start)}–{isoWeek(SEMESTER.end)})</Text>

      <Label>Key dates</Label>
      <View style={st.timeline}>
        {SEMESTER.periods.map((p) => {
          const past = p.end < today;
          const now = p.start <= today && today <= p.end;
          const k = KIND[p.kind];
          const indent = p.kind !== 'period';
          return (
            <View key={p.key} style={[st.tRow, indent && { paddingLeft: 16 }, now && st.tNow, past && { opacity: 0.4 }]}>
              <Text style={st.tEmoji}>{k.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[st.tLabel, p.kind === 'period' && { fontWeight: '800' }, (p.kind === 'exam' || p.kind === 'reexam') && { color: k.color }]}>{p.label}{now ? '  ← now' : ''}</Text>
                <Text style={st.tDate}>{range(p)}</Text>
              </View>
            </View>
          );
        })}
      </View>

      <Label>Block timetable</Label>
      <View style={st.wrap}>
        <Chip label="VT1 (Jan–Mar)" on={term === 'VT1'} onPress={() => setTerm('VT1')} />
        <Chip label="VT2 (Mar–Jun)" on={term === 'VT2'} onPress={() => setTerm('VT2')} />
      </View>
      <BlockGrid byBlock={byBlock} />
      <View style={{ marginTop: 10 }}>
        {[1, 2, 3, 4].map((b) => (
          <View key={b} style={st.legRow}>
            <View style={[st.legSw, { backgroundColor: BLOCK_COLORS[b] }]} />
            <Text style={st.legText}>Block {b}: {(byBlock[b] || []).map((c) => `${c.code} ${c.name}`).join(', ') || '— free'}</Text>
          </View>
        ))}
      </View>
      <Text style={st.hint}>Each course is taught in its block’s time slots. Evening slots (17–21) are split between two blocks for half-group sessions. This is LiU’s usual pattern — exact times and rooms are in TimeEdit.</Text>
    </Sheet>
  );
}

function BlockGrid({ byBlock }) {
  const cell = (b, key, half) => {
    if (b === null) return <View key={key} style={[st.cell, half && st.half, { backgroundColor: '#fafafa' }]} />;
    if (b === 0) return <View key={key} style={[st.cell, half && st.half, { backgroundColor: '#222' }]} />;
    const cs = byBlock[b] || [];
    const mine = cs.length > 0;
    return (
      <View key={key} style={[st.cell, half && st.half, { backgroundColor: mine ? cs[0].color : BLOCK_COLORS[b] + '40' }]}>
        <Text style={[st.cellText, mine && { color: '#fff', fontWeight: '700' }]} numberOfLines={2}>
          {mine ? cs.map((c) => c.code || c.name).join('/') : half ? b : `B${b}`}
        </Text>
      </View>
    );
  };
  return (
    <View style={st.grid}>
      <View style={st.gRow}>
        <View style={st.timeCol} />
        {DAYS.map((d) => <Text key={d} style={st.dayHead}>{d}</Text>)}
      </View>
      {SLOTS.map((slot, si) => (
        <View key={slot} style={[st.gRow, si === 2 && { marginTop: 6 }]}>
          <Text style={st.timeCol}>{slot}</Text>
          {GRID.map((day, di) => {
            const b = day[si];
            if (Array.isArray(b)) {
              return <View key={di} style={st.splitWrap}>{cell(b[0], 'a', true)}{cell(b[1], 'b', true)}</View>;
            }
            return <View key={di} style={st.splitWrap}>{cell(b, 'x')}</View>;
          })}
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  kicker: { fontSize: 12, fontWeight: '700', color: '#777' },
  big: { fontSize: 18, fontWeight: '800', color: '#111', marginTop: 3 },
  sub: { fontSize: 13, color: '#555', marginTop: 3 },
  more: { fontSize: 13, color: '#2979ff', fontWeight: '600', marginTop: 8 },
  p: { fontSize: 14, color: '#444', marginBottom: 14 },
  timeline: { backgroundColor: '#fff', borderRadius: 12, padding: 8, marginBottom: 18 },
  tRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 6, borderRadius: 8 },
  tNow: { backgroundColor: '#eaf2ff' },
  tEmoji: { width: 26, fontSize: 15 },
  tLabel: { fontSize: 14, color: '#111' },
  tDate: { fontSize: 12, color: '#777', marginTop: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  grid: { backgroundColor: '#fff', borderRadius: 12, padding: 6 },
  gRow: { flexDirection: 'row', alignItems: 'stretch' },
  timeCol: { width: 44, fontSize: 10, color: '#777', textAlignVertical: 'center', alignSelf: 'center' },
  dayHead: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: '#555', marginBottom: 4 },
  splitWrap: { flex: 1, flexDirection: 'row', margin: 1 },
  cell: { flex: 1, height: 38, borderRadius: 5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 1 },
  half: { marginHorizontal: 0.5 },
  cellText: { fontSize: 10, color: '#333', textAlign: 'center' },
  legRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  legSw: { width: 14, height: 14, borderRadius: 4, marginRight: 8 },
  legText: { fontSize: 13, color: '#333', flex: 1 },
  hint: { fontSize: 12, color: '#888', marginTop: 10, lineHeight: 17 },
});
