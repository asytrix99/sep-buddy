import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Sheet, Field, Label, Chip, Btn, DateTimeField } from '../ui';
import { COURSE_COLORS, TASK_TYPES, TYPE } from '../../lib/study';
import { uid } from '../../lib/dates';
import { BLOCK_COLORS } from '../../lib/semester';

const REMIND_OPTS = [{ h: 168, label: '1 week' }, { h: 72, label: '3 days' }, { h: 24, label: '1 day' }, { h: 2, label: '2 hours' }];

export function TaskSheet({ visible, task, courses, onClose, onSave, onDelete }) {
  const fresh = () => {
    const due = new Date();
    due.setDate(due.getDate() + 7);
    due.setHours(23, 55, 0, 0);
    return { title: '', courseId: courses[0]?.id || null, type: 'assignment', due: due.toISOString(), remind: TYPE.assignment.remind, note: '' };
  };
  const [t, setT] = useState(fresh);
  useEffect(() => { if (visible) setT(task || fresh()); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    if (!t.title.trim()) return;
    onSave({ ...t, id: t.id || uid(), title: t.title.trim(), done: !!t.done });
  };
  const toggleRemind = (h) => setT((x) => {
    const r = x.remind ?? TYPE[x.type].remind;
    return { ...x, remind: r.includes(h) ? r.filter((y) => y !== h) : [...r, h].sort((a, b) => b - a) };
  });
  const remind = t.remind ?? TYPE[t.type].remind;

  return (
    <Sheet visible={visible} title={task ? 'Edit task' : 'New task'} onClose={onClose} onSave={save}>
      <Field label="What" value={t.title} onChangeText={(title) => setT((x) => ({ ...x, title }))} placeholder="e.g. Lab report 2, Mechanics exam" autoFocus={!task} />
      <Label>Type</Label>
      <View style={st.wrap}>
        {TASK_TYPES.map((ty) => <Chip key={ty.key} label={`${ty.emoji} ${ty.label}`} on={t.type === ty.key}
          onPress={() => setT((x) => ({ ...x, type: ty.key, remind: task ? x.remind : ty.remind }))} />)}
      </View>
      <Label>Course</Label>
      <View style={st.wrap}>
        <Chip label="None" on={!t.courseId} onPress={() => setT((x) => ({ ...x, courseId: null }))} />
        {courses.map((c) => <Chip key={c.id} label={c.code || c.name} color={c.color} on={t.courseId === c.id} onPress={() => setT((x) => ({ ...x, courseId: c.id }))} />)}
      </View>
      <DateTimeField label={t.type === 'exam' ? 'Exam starts' : 'Due'} value={new Date(t.due)} onChange={(d) => setT((x) => ({ ...x, due: d.toISOString() }))} />
      <Label>Remind me before</Label>
      <View style={st.wrap}>
        {REMIND_OPTS.map((o) => <Chip key={o.h} label={o.label} on={remind.includes(o.h)} color="#f08c00" onPress={() => toggleRemind(o.h)} />)}
      </View>
      <Field label="Notes" value={t.note || ''} onChangeText={(note) => setT((x) => ({ ...x, note }))} multiline style={{ minHeight: 60 }} placeholder="Room, group members, what's needed…" />
      {task && <Btn kind="danger" label="Delete task" onPress={() => onDelete(task.id)} />}
    </Sheet>
  );
}

export function CourseSheet({ visible, course, onClose, onSave, onDelete }) {
  const [c, setC] = useState({ code: '', name: '', color: COURSE_COLORS[0], blocks: {} });
  useEffect(() => { if (visible) setC(course || { code: '', name: '', blocks: { VT1: null }, color: COURSE_COLORS[Math.floor(Math.random() * COURSE_COLORS.length)] }); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = () => {
    if (!c.code.trim() && !c.name.trim()) return;
    onSave({ ...c, id: c.id || uid(), code: c.code.trim().toUpperCase(), name: c.name.trim() });
  };
  const blocks = c.blocks || {};
  const toggleTerm = (tm) => setC((x) => {
    const nb = { ...(x.blocks || {}) };
    if (tm in nb) delete nb[tm]; else nb[tm] = null;
    return { ...x, blocks: nb };
  });
  const setBlock = (tm, b) => setC((x) => ({ ...x, blocks: { ...(x.blocks || {}), [tm]: b } }));
  return (
    <Sheet visible={visible} title={course ? 'Edit course' : 'Add course'} onClose={onClose} onSave={save}>
      <Field label="Course code" value={c.code} onChangeText={(code) => setC((x) => ({ ...x, code }))} placeholder="e.g. TMME19" autoCapitalize="characters" />
      <Text style={st.hint}>Used to match lectures in your TimeEdit timetable.</Text>
      <Field label="Name" value={c.name} onChangeText={(name) => setC((x) => ({ ...x, name }))} placeholder="e.g. Mechanics, Second Course" />
      <Label>Study period</Label>
      <View style={st.wrap}>
        {['VT1', 'VT2'].map((tm) => (
          <Chip key={tm} label={tm === 'VT1' ? 'VT1 (Jan–Mar)' : 'VT2 (Mar–Jun)'} on={tm in blocks} onPress={() => toggleTerm(tm)} />
        ))}
      </View>
      {['VT1', 'VT2'].filter((tm) => tm in blocks).map((tm) => (
        <View key={tm}>
          <Label>Timetable block in {tm}</Label>
          <View style={st.wrap}>
            <Chip label="None" on={!blocks[tm]} onPress={() => setBlock(tm, null)} />
            {[1, 2, 3, 4].map((b) => <Chip key={b} label={`Block ${b}`} on={blocks[tm] === b} color={BLOCK_COLORS[b]} onPress={() => setBlock(tm, b)} />)}
          </View>
        </View>
      ))}
      <Label>Colour</Label>
      <View style={st.wrap}>
        {COURSE_COLORS.map((col) => (
          <TouchableOpacity key={col} onPress={() => setC((x) => ({ ...x, color: col }))}
            style={[st.swatch, { backgroundColor: col }, c.color === col && st.swatchOn]} />
        ))}
      </View>
      {course && <Btn kind="danger" label="Delete course" onPress={() => onDelete(course.id)} />}
    </Sheet>
  );
}

export function TimetableSheet({ visible, url, onClose, onSave }) {
  const [u, setU] = useState(url || '');
  useEffect(() => { if (visible) setU(url || ''); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Sheet visible={visible} title="Timetable (TimeEdit)" onClose={onClose} onSave={() => onSave(u.trim())}>
      <Text style={st.p}>LiU timetables live in TimeEdit. To show yours here:</Text>
      <Text style={st.p}>1. Open TimeEdit for LiU and search your courses or programme.{'\n'}2. Choose “Subscribe” / “Prenumerera” (or the iCal / .ics export).{'\n'}3. Copy the link that ends in <Text style={{ fontWeight: '700' }}>.ics</Text> and paste it below.</Text>
      <Btn label="Open TimeEdit (LiU)" onPress={() => Linking.openURL('https://cloud.timeedit.net/liu/web/')} style={{ alignSelf: 'flex-start', marginBottom: 14 }} />
      <Field label="Calendar link (.ics)" value={u} onChangeText={setU} placeholder="https://cloud.timeedit.net/liu/web/…ics" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
      <Text style={st.hint}>The timetable refreshes every time you open the Study tab (pull down to refresh).</Text>
    </Sheet>
  );
}

const st = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  hint: { fontSize: 12, color: '#888', marginTop: -6, marginBottom: 12 },
  swatch: { width: 34, height: 34, borderRadius: 17, marginRight: 10, marginBottom: 10 },
  swatchOn: { borderWidth: 3, borderColor: '#111' },
  p: { fontSize: 14, color: '#333', lineHeight: 21, marginBottom: 10 },
});
