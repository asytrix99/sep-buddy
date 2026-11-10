import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Sheet, Chip, Field, Label, Btn, Toggle } from '../ui';
import { FLOWS, SYMPTOMS, MOODS, ENERGY } from '../../lib/cycle';
import { fmtDay } from '../../lib/dates';

/** Log for one day: period on/off + flow, symptoms, mood, energy, note. */
export default function DayLogSheet({ date, visible, log, isPeriod, onClose, onSave }) {
  const [period, setPeriod] = useState(isPeriod);
  const [d, setD] = useState(log || {});
  useEffect(() => {
    if (visible) { setPeriod(isPeriod); setD(log || {}); }
  }, [visible, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleIn = (k, v) => setD((x) => {
    const set = new Set(x[k] || []);
    set.has(v) ? set.delete(v) : set.add(v);
    return { ...x, [k]: [...set] };
  });

  return (
    <Sheet visible={visible} title={date ? fmtDay(date) : ''} onClose={onClose} onSave={() => onSave({ period, log: d })}>
      <Toggle label="🩸 Period day" sub="Turn on for every day you bleed (spotting included)" value={period} onChange={setPeriod} />
      {period && (
        <>
          <Label>Flow</Label>
          <View style={st.wrap}>
            {FLOWS.map((f) => <Chip key={f.key} label={`${f.drops} ${f.label}`} on={d.flow === f.key} color="#e5484d" onPress={() => setD((x) => ({ ...x, flow: x.flow === f.key ? undefined : f.key }))} />)}
          </View>
        </>
      )}
      <Label>Symptoms</Label>
      <View style={st.wrap}>
        {SYMPTOMS.map((s) => <Chip key={s} label={s} on={(d.symptoms || []).includes(s)} color="#8e4ec6" onPress={() => toggleIn('symptoms', s)} />)}
      </View>
      <Label>Mood</Label>
      <View style={st.wrap}>
        {MOODS.map((m) => <Chip key={m.key} label={`${m.emoji} ${m.label}`} on={(d.moods || []).includes(m.key)} color="#f08c00" onPress={() => toggleIn('moods', m.key)} />)}
      </View>
      <Label>Energy</Label>
      <View style={st.wrap}>
        {ENERGY.map((e) => <Chip key={e} label={e} on={d.energy === e} color="#2f9e6f" onPress={() => setD((x) => ({ ...x, energy: x.energy === e ? undefined : e }))} />)}
      </View>
      <Field label="Notes" value={d.note || ''} onChangeText={(note) => setD((x) => ({ ...x, note }))} placeholder="Anything worth remembering…" multiline style={{ minHeight: 70 }} />
      {!!log && <Btn label="Clear this day's log" kind="danger" onPress={() => setD({})} />}
      <Text style={st.hint}>Everything you log stays on this phone.</Text>
    </Sheet>
  );
}

const st = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  hint: { fontSize: 12, color: '#888', marginTop: 14, textAlign: 'center' },
});
