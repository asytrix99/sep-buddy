/**
 * Today — one screen for the day: semester status, bus to/from Campus Valla, today's classes,
 * what's due soon, events near home today, money left this month and focus trees.
 * Everything here is read from the other tabs' data; tap a card to jump to its tab.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { ScreenHeader, Card, C } from '../../components/ui';
import Commute from '../../components/today/Commute';
import { usePersisted, KEYS } from '../../lib/storage';
import { ymd, fmtTime, parseYmd, relDays } from '../../lib/dates';
import { SEMESTER, semesterStatus, GRID, SLOTS, coursesByBlock } from '../../lib/semester';
import { STARTER_COURSES, buildAgenda, TYPE } from '../../lib/study';
import { BUNDLED_FEED, DEFAULT_SOURCES, SOURCE, visibleEvents, eventDays, STAY } from '../../lib/events';
import { HOME_DEFAULT, dist } from '../../lib/geo';
import { kr, monthKey, inMonth, sum, budgetStatus } from '../../lib/money';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function TodayScreen() {
  const today = ymd();
  const d = parseYmd(today);
  const [home] = usePersisted(KEYS.home, HOME_DEFAULT);
  const [courses] = usePersisted(KEYS.courses, STARTER_COURSES);
  const [tasks] = usePersisted(KEYS.tasks, []);
  const [tt] = usePersisted(KEYS.timetableCache, { at: 0, events: [] });
  const [feed] = usePersisted(KEYS.eventsCache, BUNDLED_FEED);
  const [mine] = usePersisted(KEYS.myEvents, []);
  const [sources] = usePersisted(KEYS.eventSources, DEFAULT_SOURCES);
  const [expenses] = usePersisted(KEYS.expenses, []);
  const [money] = usePersisted(KEYS.moneySettings, { budget: 0 });
  const [focusLog] = usePersisted(KEYS.focusLog, []);

  const sem = semesterStatus(today);

  // Classes + deadlines today (TimeEdit if linked), and deadlines in the next 3 days.
  const agenda = useMemo(() => buildAgenda(tasks, tt?.events || [], courses, { days: 4 }), [tasks, tt, courses]);
  const todayItems = agenda.find((g) => g.day === today)?.items || [];
  const classes = todayItems.filter((i) => i.kind === 'class');
  const due = agenda.filter((g) => g.day === 'overdue' || g.day >= today).flatMap((g) => g.items.filter((i) => i.kind === 'task'));

  // No TimeEdit link → show the usual block slots for her courses in the current study period.
  const wd = (d.getDay() + 6) % 7; // Mon = 0
  const showBlocks = !classes.length && wd <= 4 && sem.phase === 'during' && !!sem.studyPeriod;
  const mineByBlock = coursesByBlock(courses, sem.term);
  const blockSlots = !showBlocks ? [] : GRID[wd].map((cell, i) => {
    const cs = (cell == null || cell === 0 ? [] : [].concat(cell)).flatMap((b) => mineByBlock[b] || []);
    return cs.length ? { slot: SLOTS[i], courses: cs } : null;
  }).filter(Boolean);

  // Events today (or running today), nearest to home first.
  const events = visibleEvents(feed?.events || [], mine, sources)
    .filter((e) => { const [a, b] = eventDays(e); return a <= today && today <= b; })
    .map((e) => ({ ...e, m: e.lat != null ? dist(home, e) : null }))
    .sort((a, b) => (a.m ?? 1e9) - (b.m ?? 1e9))
    .slice(0, 3);

  const spent = sum(inMonth(expenses, monthKey(today)));
  const budget = budgetStatus(spent, money?.budget, monthKey(today), today);
  const trees = (focusLog || []).filter((e) => !e.dead && ymd(new Date(e.at)) === today).length;

  const subtitle = `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} · week ${sem.week}`;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Today" subtitle={subtitle} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Semester status */}
        <Card style={st.semCard}>
          {sem.phase === 'before' ? (
            <>
              <Text style={st.semBig}>{sem.daysToStart} days</Text>
              <Text style={st.semText}>until {SEMESTER.name} starts ({fmtDate(SEMESTER.start)}) 🎒</Text>
            </>
          ) : sem.phase === 'after' ? (
            <Text style={st.semText}>{SEMESTER.name} is over — well done! ☀️</Text>
          ) : (
            <>
              <Text style={st.semText}>
                {sem.special ? `${sem.special.label}` : sem.studyPeriod ? `${sem.studyPeriod.label} (${sem.term})` : SEMESTER.name}
              </Text>
              {!!sem.next && <Text style={st.semSub}>Next: {sem.next.label} {relDays(sem.next.start, today)}</Text>}
              <Text style={st.semSub}>{Math.max(0, Math.round((parseYmd(STAY.to) - d) / 86400000))} days left in Linköping</Text>
            </>
          )}
        </Card>

        <Commute />

        {/* Classes */}
        {(classes.length > 0 || blockSlots.length > 0) && (
          <TouchableOpacity activeOpacity={0.8} onPress={() => router.navigate('/study')}>
            <Card>
              <Text style={st.cardTitle}>📚 Classes today</Text>
              {classes.map((c) => (
                <Row key={c.key} color={c.course?.color} left={`${fmtTime(c.start)}–${fmtTime(c.end)}`}
                  title={c.course?.code ? `${c.course.code} · ${c.title}` : c.title} sub={c.location} />
              ))}
              {blockSlots.map((b) => (
                <Row key={b.slot} color={b.courses[0].color} left={b.slot} title={b.courses.map((c) => `${c.code} ${c.name}`).join(' / ')} />
              ))}
              {blockSlots.length > 0 && <Text style={st.hint}>Usual block times for your courses — link TimeEdit in Study for exact lectures and rooms.</Text>}
            </Card>
          </TouchableOpacity>
        )}

        {/* Due soon */}
        {due.length > 0 && (
          <TouchableOpacity activeOpacity={0.8} onPress={() => router.navigate('/study')}>
            <Card>
              <Text style={st.cardTitle}>⏰ Due soon</Text>
              {due.slice(0, 4).map((t) => (
                <Row key={t.key} color={t.course?.color || '#f08c00'}
                  left={t.overdue ? 'overdue' : relDays(ymd(t.start), today)}
                  title={`${TYPE[t.task.type]?.emoji || '📌'} ${t.title}`} sub={t.course?.code} danger={t.overdue} />
              ))}
            </Card>
          </TouchableOpacity>
        )}

        {/* Events */}
        <TouchableOpacity activeOpacity={0.8} onPress={() => router.navigate('/events')}>
          <Card>
            <Text style={st.cardTitle}>🎉 Happening today</Text>
            {events.length === 0 ? (
              <Text style={st.muted}>Nothing on today{today < STAY.from ? ' — events show from 15 Jan' : ''}. Tap to see the calendar.</Text>
            ) : events.map((e) => {
              const src = SOURCE[e.source] || SOURCE.other;
              return (
                <Row key={e.id} color={src.color} left={e.allDay ? 'all day' : fmtTime(new Date(e.start))}
                  title={`${src.emoji} ${e.title}`}
                  sub={[e.location, e.m != null && (e.m < 1000 ? `${Math.round(e.m / 50) * 50} m away` : `${(e.m / 1000).toFixed(1)} km away`)].filter(Boolean).join(' · ')} />
              );
            })}
          </Card>
        </TouchableOpacity>

        {/* Money + focus */}
        <View style={st.tiles}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.8} onPress={() => router.navigate('/money')}>
            <Card style={st.tile}>
              <Text style={st.tileLabel}>💸 This month</Text>
              <Text style={st.tileValue}>{kr(spent)}</Text>
              <Text style={st.tileSub}>{budget ? (budget.over ? `${kr(-budget.left)} over budget` : `${kr(budget.perDay)}/day left`) : 'no budget set'}</Text>
            </Card>
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.8} onPress={() => router.navigate('/study')}>
            <Card style={st.tile}>
              <Text style={st.tileLabel}>🌳 Focus today</Text>
              <Text style={st.tileValue}>{trees} tree{trees === 1 ? '' : 's'}</Text>
              <Text style={st.tileSub}>{trees ? `${trees * 25} min focused` : 'start a session'}</Text>
            </Card>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const fmtDate = (s) => { const x = parseYmd(s); return `${x.getDate()} ${MONTHS[x.getMonth()].slice(0, 3)}`; };

const Row = ({ color, left, title, sub, danger }) => (
  <View style={st.row}>
    <View style={[st.bar, { backgroundColor: color || '#adb5bd' }]} />
    <Text style={[st.left, danger && { color: C.danger }]}>{left}</Text>
    <View style={{ flex: 1 }}>
      <Text style={st.rowTitle} numberOfLines={2}>{title}</Text>
      {!!sub && <Text style={st.rowSub} numberOfLines={1}>{sub}</Text>}
    </View>
  </View>
);

const st = StyleSheet.create({
  semCard: { backgroundColor: C.soft },
  semBig: { fontSize: 30, fontWeight: '800', color: C.text },
  semText: { fontSize: 15, fontWeight: '700', color: C.text },
  semSub: { fontSize: 13, color: C.sub, marginTop: 3 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  bar: { width: 4, alignSelf: 'stretch', borderRadius: 2, marginRight: 10 },
  left: { width: 64, fontSize: 13, fontWeight: '700', color: C.text, fontVariant: ['tabular-nums'] },
  rowTitle: { fontSize: 14, color: C.text, fontWeight: '500' },
  rowSub: { fontSize: 12, color: C.sub, marginTop: 1 },
  hint: { fontSize: 11, color: '#999', marginTop: 6 },
  muted: { fontSize: 13, color: C.sub },
  tiles: { flexDirection: 'row', marginHorizontal: 8 },
  tile: { marginHorizontal: 8 },
  tileLabel: { fontSize: 12, color: C.sub, fontWeight: '600' },
  tileValue: { fontSize: 20, fontWeight: '800', color: C.text, marginTop: 4 },
  tileSub: { fontSize: 12, color: C.sub, marginTop: 2 },
});
