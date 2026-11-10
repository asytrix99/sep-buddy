/**
 * Cycle tab — a period tracker modelled on Flo: today ring, period logging, predictions,
 * fertile window, daily symptoms/mood, insights, reminders and phase-based food ideas nearby.
 * All data stays on the phone (AsyncStorage). Optional Face ID / passcode lock.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, AppState } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { ScreenHeader, Card, Btn, IconBtn, SectionTitle, Sheet, Toggle, Label, DateTimeField, Empty, C } from '../../components/ui';
import CycleCalendar from '../../components/cycle/CycleCalendar';
import DayLogSheet from '../../components/cycle/DayLogSheet';
import FoodIdeas from '../../components/cycle/FoodIdeas';
import { buildCycleModel, DEFAULT_SETTINGS, PHASES, MOODS } from '../../lib/cycle';
import { ymd, addDays, fmtShort, fmtDay, diffDays } from '../../lib/dates';
import { usePersisted, KEYS } from '../../lib/storage';
import { HOME_DEFAULT } from '../../lib/geo';

export default function CycleScreen() {
  const today = ymd();
  const [periodDays, setPeriodDays] = usePersisted(KEYS.periodDays, []);
  const [dayLogs, setDayLogs] = usePersisted(KEYS.dayLogs, {});
  const [rawSettings, setSettings] = usePersisted(KEYS.cycleSettings, DEFAULT_SETTINGS);
  const [home] = usePersisted(KEYS.home, HOME_DEFAULT);
  const settings = { ...DEFAULT_SETTINGS, ...rawSettings };

  const [editMode, setEditMode] = useState(false);
  const [logDate, setLogDate] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  const model = useMemo(() => buildCycleModel(periodDays, settings, today), [periodDays, settings.cycleLength, settings.periodLength, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const info = model.todayInfo;
  const phase = info ? PHASES[info.phase] : null;

  // Re-lock when the app goes to the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'background') setUnlocked(false); });
    return () => sub.remove();
  }, []);

  async function unlock() {
    try {
      const has = await LocalAuthentication.hasHardwareAsync();
      const enrolled = has && (await LocalAuthentication.isEnrolledAsync());
      if (!enrolled) return setUnlocked(true); // no Face ID / passcode set up — nothing to check against
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock your cycle data' });
      if (r.success) setUnlocked(true);
    } catch {
      setUnlocked(true);
    }
  }
  useEffect(() => { if (settings.lock && !unlocked) unlock(); }, [settings.lock]); // eslint-disable-line react-hooks/exhaustive-deps

  if (settings.lock && !unlocked) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScreenHeader title="Cycle" />
        <Empty emoji="🔒" title="Locked" text="Your cycle data is protected.">
          <Btn kind="primary" color="#e5484d" label="Unlock" onPress={unlock} style={{ marginTop: 14 }} />
        </Empty>
      </View>
    );
  }

  const setDays = (fn) => setPeriodDays((days) => [...new Set(fn(days))].sort());
  const startPeriodToday = () => setDays((days) => [...days, ...Array.from({ length: model.stats.avgPeriod }, (_, i) => addDays(today, i))]);
  const endPeriodToday = () => setDays((days) => days.filter((d) => !(d > today && model.last && d >= model.last.start)));
  const toggleDay = (d) => setDays((days) => (days.includes(d) ? days.filter((x) => x !== d) : [...days, d]));

  function saveDay({ period, log }) {
    const d = logDate;
    const isP = periodDays.includes(d);
    if (period !== isP) toggleDay(d);
    setDayLogs((all) => {
      const next = { ...all };
      const empty = !log.flow && !(log.symptoms || []).length && !(log.moods || []).length && !log.energy && !log.note;
      if (empty) delete next[d]; else next[d] = log;
      return next;
    });
    setLogDate(null);
  }

  // ── hero text ──
  let big;
  let small;
  if (model.empty) {
    big = 'Log your period';
    small = 'Tap the button below when it starts, or pick past dates on the calendar.';
  } else if (info?.phase === 'menstrual' && (info.logged || info.predictedPeriod)) {
    big = `Period · day ${info.cycleDay}`;
    small = 'Take it easy today 💗';
  } else if (model.lateBy > 0) {
    big = `Late by ${model.lateBy} day${model.lateBy > 1 ? 's' : ''}`;
    small = 'Late periods are common (stress, travel, sleep). Log it when it starts.';
  } else {
    const n = model.daysUntilNext;
    big = n === 0 ? 'Period expected today' : `Period in ${n} day${n > 1 ? 's' : ''}`;
    small = `Expected ${fmtDay(model.nextStart)}`;
  }
  const ringColor = phase?.color || '#e5484d';
  const todayLog = dayLogs[today];
  const inPeriodNow = info?.phase === 'menstrual' && info.logged;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Cycle" subtitle={info ? `Cycle day ${info.cycleDay} · ${phase.label}` : 'Period tracker'}
        right={<IconBtn label="⚙️" onPress={() => setShowSettings(true)} />} />
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        {/* Today ring */}
        <Card style={{ alignItems: 'center', paddingVertical: 22 }}>
          <View style={[st.ring, { borderColor: ringColor, backgroundColor: phase?.soft || '#fde2e3' }]}>
            {phase && <Text style={st.ringEmoji}>{phase.emoji}</Text>}
            <Text style={[st.ringBig, { color: ringColor }]}>{big}</Text>
            <Text style={st.ringSmall}>{small}</Text>
          </View>
          <View style={st.heroBtns}>
            {inPeriodNow ? (
              <Btn kind="primary" color="#e5484d" label="Period ended today" onPress={endPeriodToday} />
            ) : (
              <Btn kind="primary" color="#e5484d" label="🩸 Period started today" onPress={startPeriodToday} />
            )}
            <Btn label={editMode ? '✓ Done editing' : 'Edit dates'} onPress={() => setEditMode((e) => !e)} />
          </View>
          {!model.empty && info?.fertile && (
            <Text style={st.fertileNote}>✨ Fertile window{info.ovulation ? ' · estimated ovulation today' : ''}</Text>
          )}
        </Card>

        {/* Phase explainer */}
        {phase && (
          <Card style={{ backgroundColor: phase.soft }}>
            <Text style={[st.phaseTitle, { color: phase.color }]}>{phase.emoji} {phase.label}</Text>
            <Text style={st.phaseText}>{phase.blurb}</Text>
          </Card>
        )}

        {/* Daily log */}
        <Card>
          <View style={st.rowCenter}>
            <View style={{ flex: 1 }}>
              <Text style={st.cardTitle}>Today</Text>
              <Text style={st.cardSub} numberOfLines={2}>{todayLog ? summarise(todayLog) : 'How are you feeling? Log symptoms & mood.'}</Text>
            </View>
            <Btn kind="primary" color="#8e4ec6" label={todayLog ? 'Edit' : '+ Log'} onPress={() => setLogDate(today)} />
          </View>
        </Card>

        {/* Food ideas */}
        {settings.showFood && phase && (
          <FoodIdeas phase={phase} home={home} onHide={() => setSettings((s) => ({ ...DEFAULT_SETTINGS, ...s, showFood: false }))} />
        )}

        {/* Calendar */}
        <SectionTitle>Calendar</SectionTitle>
        <Card>
          {editMode && <Text style={st.editHint}>Tap the days you had your period, then “Done editing”.</Text>}
          <CycleCalendar model={model} dayLogs={dayLogs} editMode={editMode} today={today}
            onPressDay={(d) => (editMode ? toggleDay(d) : setLogDate(d))} />
        </Card>

        {/* Insights */}
        {!model.empty && <Insights model={model} />}

        <Text style={st.disclaimer}>Predictions are estimates based on your logged cycles. They are not a form of contraception or medical advice.</Text>
      </ScrollView>

      <DayLogSheet visible={!!logDate} date={logDate} log={logDate ? dayLogs[logDate] : null}
        isPeriod={logDate ? periodDays.includes(logDate) : false} onClose={() => setLogDate(null)} onSave={saveDay} />
      <CycleSettings visible={showSettings} settings={settings} onClose={() => setShowSettings(false)}
        onChange={(patch) => setSettings((s) => ({ ...DEFAULT_SETTINGS, ...s, ...patch }))} />
    </View>
  );
}

function summarise(log) {
  const bits = [];
  if (log.flow) bits.push(`${log.flow} flow`);
  (log.moods || []).forEach((m) => { const mm = MOODS.find((x) => x.key === m); if (mm) bits.push(mm.emoji); });
  if ((log.symptoms || []).length) bits.push(log.symptoms.join(', '));
  if (log.energy) bits.push(`${log.energy} energy`);
  if (log.note) bits.push('📝');
  return bits.join(' · ');
}

function Insights({ model }) {
  const { stats, periods } = model;
  const recent = periods.slice(-7);
  const lengths = [];
  for (let i = 1; i < recent.length; i++) lengths.push({ start: recent[i - 1].start, len: diffDays(recent[i - 1].start, recent[i].start) });
  const max = Math.max(40, ...lengths.map((l) => l.len));
  return (
    <>
      <SectionTitle>Insights</SectionTitle>
      <Card>
        <View style={st.statRow}>
          <Stat value={`${stats.avgCycle} d`} label="Avg cycle" />
          <Stat value={`${stats.avgPeriod} d`} label="Avg period" />
          <Stat value={periods.length} label="Periods logged" />
        </View>
        {stats.basedOn === 0 && <Text style={st.cardSub}>Using a 28-day default until two periods are logged.</Text>}
        {lengths.length > 0 && (
          <View style={{ marginTop: 14 }}>
            <Label>Recent cycle lengths</Label>
            {lengths.map((l) => (
              <View key={l.start} style={st.barRow}>
                <Text style={st.barLabel}>{fmtShort(l.start)}</Text>
                <View style={st.barTrack}>
                  <View style={[st.bar, { width: `${(l.len / max) * 100}%`, backgroundColor: l.len < 21 || l.len > 35 ? '#f08c00' : '#e5484d' }]} />
                </View>
                <Text style={st.barVal}>{l.len}</Text>
              </View>
            ))}
          </View>
        )}
        {stats.irregular && (
          <Text style={st.irregular}>Your recent cycles vary quite a bit. That’s common, but if it keeps happening it can be worth mentioning to a doctor or the student health centre.</Text>
        )}
      </Card>
    </>
  );
}
const Stat = ({ value, label }) => (
  <View style={{ flex: 1, alignItems: 'center' }}>
    <Text style={st.statVal}>{value}</Text>
    <Text style={st.statLabel}>{label}</Text>
  </View>
);

function CycleSettings({ visible, settings, onClose, onChange }) {
  const t = new Date();
  t.setHours(settings.dailyLogTime.hour, settings.dailyLogTime.minute, 0, 0);
  return (
    <Sheet visible={visible} title="Cycle settings" onClose={onClose}>
      <Label>Typical lengths (used until a few cycles are logged)</Label>
      <Stepper label="Cycle length" value={settings.cycleLength} min={18} max={45} onChange={(cycleLength) => onChange({ cycleLength })} />
      <Stepper label="Period length" value={settings.periodLength} min={2} max={10} onChange={(periodLength) => onChange({ periodLength })} />
      <View style={{ height: 12 }} />
      <Label>Reminders</Label>
      <Toggle label="Period coming" sub="2 days before it’s expected" value={settings.remindBefore} onChange={(v) => onChange({ remindBefore: v })} />
      <Toggle label="Late period" sub="If it hasn’t been logged 3 days after expected" value={settings.remindLate} onChange={(v) => onChange({ remindLate: v })} />
      <Toggle label="Daily check-in" sub="A reminder to log symptoms & mood" value={settings.dailyLog} onChange={(v) => onChange({ dailyLog: v })} />
      {settings.dailyLog && (
        <DateTimeField label="Check-in time" mode="time" value={t} onChange={(d) => onChange({ dailyLogTime: { hour: d.getHours(), minute: d.getMinutes() } })} />
      )}
      <View style={{ height: 12 }} />
      <Label>More</Label>
      <Toggle label="Food ideas" sub="Suggestions from your favourite foods for each phase" value={settings.showFood} onChange={(v) => onChange({ showFood: v })} />
      <Toggle label="Lock with Face ID / passcode" sub="Asks every time the app is reopened" value={settings.lock} onChange={(v) => onChange({ lock: v })} />
    </Sheet>
  );
}

function Stepper({ label, value, min, max, onChange }) {
  return (
    <View style={st.stepper}>
      <Text style={{ flex: 1, fontSize: 15 }}>{label}</Text>
      <TouchableOpacity style={st.stepBtn} onPress={() => onChange(Math.max(min, value - 1))}><Text style={st.stepTxt}>−</Text></TouchableOpacity>
      <Text style={st.stepVal}>{value} days</Text>
      <TouchableOpacity style={st.stepBtn} onPress={() => onChange(Math.min(max, value + 1))}><Text style={st.stepTxt}>+</Text></TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  ring: { width: 230, height: 230, borderRadius: 115, borderWidth: 10, alignItems: 'center', justifyContent: 'center', padding: 22 },
  ringEmoji: { fontSize: 26, marginBottom: 2 },
  ringBig: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  ringSmall: { fontSize: 13, color: '#555', textAlign: 'center', marginTop: 6 },
  heroBtns: { flexDirection: 'row', gap: 8, marginTop: 18, flexWrap: 'wrap', justifyContent: 'center' },
  fertileNote: { marginTop: 12, color: '#2f7de1', fontWeight: '600' },
  phaseTitle: { fontSize: 16, fontWeight: '700' },
  phaseText: { fontSize: 14, color: '#333', marginTop: 4, lineHeight: 20 },
  rowCenter: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  cardSub: { fontSize: 13, color: '#666', marginTop: 3 },
  editHint: { fontSize: 13, color: '#e5484d', marginBottom: 8, fontWeight: '600' },
  statRow: { flexDirection: 'row' },
  statVal: { fontSize: 22, fontWeight: '800', color: '#111' },
  statLabel: { fontSize: 12, color: '#777', marginTop: 2 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  barLabel: { width: 52, fontSize: 12, color: '#777' },
  barTrack: { flex: 1, height: 10, backgroundColor: '#f1f1f3', borderRadius: 5, overflow: 'hidden' },
  bar: { height: 10, borderRadius: 5 },
  barVal: { width: 30, textAlign: 'right', fontSize: 13, fontWeight: '600' },
  irregular: { fontSize: 13, color: '#9a5b00', backgroundColor: '#fff4e0', borderRadius: 10, padding: 10, marginTop: 12, lineHeight: 18 },
  disclaimer: { fontSize: 11, color: '#999', textAlign: 'center', marginHorizontal: 30, marginTop: 6 },
  stepper: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  stepBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f0f1f4', alignItems: 'center', justifyContent: 'center' },
  stepTxt: { fontSize: 20, fontWeight: '600' },
  stepVal: { width: 80, textAlign: 'center', fontSize: 15, fontWeight: '600' },
});
