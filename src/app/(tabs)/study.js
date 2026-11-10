/**
 * Study tab — courses, deadlines/exams with reminders, TimeEdit timetable (iCal link),
 * a "next 7 days" agenda and a Pomodoro focus timer.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { ScreenHeader, Card, Btn, IconBtn, SectionTitle, Empty, C, Fab, useTabBarSpace } from '../../components/ui';
import FocusTimer from '../../components/study/FocusTimer';
import { SemesterCard } from '../../components/study/Semester';
import { TaskSheet, CourseSheet, TimetableSheet } from '../../components/study/StudySheets';
import { usePersisted, KEYS } from '../../lib/storage';
import { STARTER_COURSES, TYPE, buildAgenda, focusSummary, courseWhen } from '../../lib/study';
import { parseIcs } from '../../lib/ical';
import { fmtDay, fmtTime, ymd, relDays } from '../../lib/dates';

export default function StudyScreen() {
  const space = useTabBarSpace();
  const [courses, setCourses] = usePersisted(KEYS.courses, STARTER_COURSES);
  const [tasks, setTasks] = usePersisted(KEYS.tasks, []);
  const [ttUrl, setTtUrl] = usePersisted(KEYS.timetableUrl, '');
  const [ttCache, setTtCache] = usePersisted(KEYS.timetableCache, { at: 0, events: [] });
  const [focusLog] = usePersisted(KEYS.focusLog, []);

  const [taskEdit, setTaskEdit] = useState(null); // null | 'new' | task
  const [courseEdit, setCourseEdit] = useState(null);
  const [showTt, setShowTt] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ttErr, setTtErr] = useState(null);

  const refresh = useCallback(async (url = ttUrl) => {
    if (!url) return;
    setLoading(true);
    setTtErr(null);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const events = parseIcs(await res.text()).map((e) => ({ ...e, start: e.start.toISOString(), end: e.end?.toISOString() }));
      setTtCache({ at: Date.now(), events });
    } catch (e) {
      setTtErr('Could not load the timetable (' + e.message + '). Showing the last saved copy.');
    } finally {
      setLoading(false);
    }
  }, [ttUrl, setTtCache]);

  useEffect(() => { if (ttUrl && Date.now() - ttCache.at > 3 * 3600000) refresh(); }, [ttUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const agenda = useMemo(() => buildAgenda(tasks, ttCache.events, courses), [tasks, ttCache, courses]);
  const minutes = useMemo(() => focusSummary(focusLog), [focusLog]);
  const open = tasks.filter((t) => !t.done).sort((a, b) => new Date(a.due) - new Date(b.due));
  const done = tasks.filter((t) => t.done);
  const byId = Object.fromEntries(courses.map((c) => [c.id, c]));

  const saveTask = (t) => { setTasks((all) => (all.some((x) => x.id === t.id) ? all.map((x) => (x.id === t.id ? t : x)) : [...all, t])); setTaskEdit(null); };
  const toggleDone = (id) => setTasks((all) => all.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const saveCourse = (c) => { setCourses((all) => (all.some((x) => x.id === c.id) ? all.map((x) => (x.id === c.id ? c : x)) : [...all, c])); setCourseEdit(null); };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Study" subtitle={open.length ? `${open.length} open task${open.length > 1 ? 's' : ''}` : 'All caught up'}
        right={<IconBtn label="🗓️" onPress={() => setShowTt(true)} />} />
      <ScrollView contentContainerStyle={{ paddingBottom: space + 80 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => refresh()} />}>
        <SemesterCard courses={courses} />
        <FocusTimer courses={courses} minutesByCourse={minutes} />

        <SectionTitle right={!ttUrl && <TouchableOpacity onPress={() => setShowTt(true)}><Text style={st.link}>Add timetable</Text></TouchableOpacity>}>Next 7 days</SectionTitle>
        {!!ttErr && <Text style={st.err}>{ttErr}</Text>}
        {agenda.length === 0 ? (
          <Card><Text style={st.muted}>{ttUrl ? 'Nothing scheduled in the next week. 🎉' : 'Add deadlines below, and link your TimeEdit timetable to see lectures here.'}</Text></Card>
        ) : agenda.map((g) => (
          <Card key={g.day} style={{ paddingVertical: 10 }}>
            <Text style={[st.day, g.day === 'overdue' && { color: '#d6336c' }]}>
              {g.day === 'overdue' ? '⚠️ Overdue' : `${fmtDay(g.day)}${g.day === ymd() ? ' · today' : ''}`}
            </Text>
            {g.items.map((it) => (
              <TouchableOpacity key={it.key} style={st.agRow} disabled={it.kind !== 'task'} onPress={() => setTaskEdit(it.task)}>
                <View style={[st.bar, { backgroundColor: it.course?.color || (it.kind === 'class' ? '#adb5bd' : '#f08c00') }]} />
                <Text style={st.agTime}>{it.kind === 'class' ? `${fmtTime(it.start)}–${fmtTime(it.end)}` : fmtTime(it.start)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={st.agTitle} numberOfLines={2}>{it.kind === 'task' ? `${TYPE[it.task.type]?.emoji} ${it.title}` : it.title}</Text>
                  {!!(it.location || (it.kind === 'task' && it.course)) && (
                    <Text style={st.agSub} numberOfLines={1}>{it.kind === 'task' ? it.course?.code || it.course?.name : `📍 ${it.location}`}</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </Card>
        ))}

        <SectionTitle right={<TouchableOpacity onPress={() => setCourseEdit('new')}><Text style={st.link}>+ Add</Text></TouchableOpacity>}>Courses</SectionTitle>
        {courses.length === 0 ? (
          <Card>
            <Text style={st.muted}>No courses yet. Load the 5 courses from the admission letter, or add your own with “+ Add”.</Text>
            <Btn kind="primary" label="Load Spring 2027 courses" style={{ marginTop: 10, alignSelf: 'flex-start' }} onPress={() => setCourses(STARTER_COURSES)} />
          </Card>
        ) : (
          <View style={st.courseWrap}>
            {courses.map((c) => (
              <TouchableOpacity key={c.id} style={[st.course, { borderLeftColor: c.color }]} onPress={() => setCourseEdit(c)}>
                <Text style={st.courseCode}>{c.code || '—'}</Text>
                <Text style={st.courseName} numberOfLines={2}>{c.name}</Text>
                {!!courseWhen(c) && <Text style={st.courseWhen}>{courseWhen(c)}</Text>}
                <Text style={st.courseMeta}>{tasks.filter((t) => t.courseId === c.id && !t.done).length} open · {minutes[c.id] || 0} min focus</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <SectionTitle>Tasks & exams</SectionTitle>
        {open.length === 0 && <Empty emoji="✅" title="No open tasks" text="Tap + to add an assignment, lab or exam." />}
        {open.map((t) => <TaskRow key={t.id} t={t} course={byId[t.courseId]} onToggle={() => toggleDone(t.id)} onPress={() => setTaskEdit(t)} />)}
        {done.length > 0 && (
          <TouchableOpacity onPress={() => setShowDone((v) => !v)}><Text style={[st.link, { marginHorizontal: 16, marginTop: 4 }]}>{showDone ? 'Hide' : 'Show'} {done.length} done</Text></TouchableOpacity>
        )}
        {showDone && done.map((t) => <TaskRow key={t.id} t={t} course={byId[t.courseId]} onToggle={() => toggleDone(t.id)} onPress={() => setTaskEdit(t)} />)}
      </ScrollView>

      <Fab onPress={() => setTaskEdit('new')} accessibilityLabel="Add task" />

      <TaskSheet visible={!!taskEdit} task={taskEdit === 'new' ? null : taskEdit} courses={courses}
        onClose={() => setTaskEdit(null)} onSave={saveTask}
        onDelete={(id) => { setTasks((all) => all.filter((t) => t.id !== id)); setTaskEdit(null); }} />
      <CourseSheet visible={!!courseEdit} course={courseEdit === 'new' ? null : courseEdit}
        onClose={() => setCourseEdit(null)} onSave={saveCourse}
        onDelete={(id) => { setCourses((all) => all.filter((c) => c.id !== id)); setCourseEdit(null); }} />
      <TimetableSheet visible={showTt} url={ttUrl} onClose={() => setShowTt(false)}
        onSave={(u) => { setTtUrl(u); setShowTt(false); if (u) refresh(u); else setTtCache({ at: 0, events: [] }); }} />
    </View>
  );
}

function TaskRow({ t, course, onToggle, onPress }) {
  const due = new Date(t.due);
  const overdue = !t.done && due < new Date();
  return (
    <TouchableOpacity style={st.task} onPress={onPress}>
      <TouchableOpacity onPress={onToggle} hitSlop={10} style={[st.check, t.done && st.checkOn]}>
        {t.done && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={[st.taskTitle, t.done && st.doneText]} numberOfLines={2}>{TYPE[t.type]?.emoji} {t.title}</Text>
        <Text style={[st.taskSub, overdue && { color: '#d6336c' }]}>
          {course ? `${course.code || course.name} · ` : ''}{fmtDay(ymd(due))} {fmtTime(due)} · {relDays(ymd(due))}
        </Text>
      </View>
      {course && <View style={[st.dot, { backgroundColor: course.color }]} />}
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  link: { color: '#2979ff', fontWeight: '600', fontSize: 14 },
  muted: { fontSize: 14, color: '#666', lineHeight: 20 },
  err: { color: '#b71c1c', fontSize: 13, marginHorizontal: 16, marginBottom: 8 },
  day: { fontSize: 13, fontWeight: '700', color: '#555', marginBottom: 6 },
  agRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  bar: { width: 4, alignSelf: 'stretch', borderRadius: 2, marginRight: 10 },
  agTime: { width: 88, fontSize: 13, color: '#555', fontVariant: ['tabular-nums'] },
  agTitle: { fontSize: 14, color: '#111', fontWeight: '500' },
  agSub: { fontSize: 12, color: '#888', marginTop: 1 },
  courseWrap: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12 },
  course: { width: '46%', margin: '2%', backgroundColor: '#fff', borderRadius: 12, padding: 12, borderLeftWidth: 5 },
  courseCode: { fontSize: 15, fontWeight: '800' },
  courseName: { fontSize: 13, color: '#444', marginTop: 2 },
  courseWhen: { fontSize: 11, color: '#2979ff', fontWeight: '600', marginTop: 4 },
  courseMeta: { fontSize: 11, color: '#999', marginTop: 6 },
  task: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 8, borderRadius: 12, padding: 12 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#bbb', marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: '#2f9e6f', borderColor: '#2f9e6f' },
  taskTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
  doneText: { textDecorationLine: 'line-through', color: '#999' },
  taskSub: { fontSize: 12, color: '#777', marginTop: 3 },
  dot: { width: 10, height: 10, borderRadius: 5, marginLeft: 8 },
});
