import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { Card, Btn, Chip, Field, Label, Sheet, C } from '../ui';
import { recommendFoods, FOOD_TAGS, STARTER_FOODS } from '../../lib/food';
import { fmtDist } from '../../lib/geo';
import { usePersisted, KEYS } from '../../lib/storage';
import { uid } from '../../lib/dates';

const PLACES_SNAPSHOT = require('../../../places-snapshot.json');
const TAG = Object.fromEntries(FOOD_TAGS.map((t) => [t.key, t]));

/** "Feeling like…" — her favourite foods that suit the current phase, with the nearest places. */
export default function FoodIdeas({ phase, home, onHide }) {
  const [foods, setFoods] = usePersisted(KEYS.foods, STARTER_FOODS);
  const [places] = usePersisted(KEYS.placesCache, PLACES_SNAPSHOT);
  const [origin, setOrigin] = useState(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const l = (await Location.getLastKnownPositionAsync()) || (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        if (l) setOrigin({ lat: l.coords.latitude, lon: l.coords.longitude, me: true });
      } catch { /* fall back to home */ }
    })();
  }, []);

  const from = origin || home;
  const recs = useMemo(() => recommendFoods(foods, phase, places, from), [foods, phase, places, from]);
  const goTo = (p) => router.navigate({ pathname: '/', params: { toLat: p.lat, toLon: p.lon, toName: p.name, t: Date.now() } });

  return (
    <Card>
      <View style={st.head}>
        <Text style={st.title}>🍽️ Feeling like…</Text>
        <TouchableOpacity onPress={() => setEditing(true)}><Text style={st.link}>Edit list</Text></TouchableOpacity>
        <TouchableOpacity onPress={onHide} style={{ marginLeft: 14 }}><Text style={st.link}>Hide</Text></TouchableOpacity>
      </View>
      <Text style={st.sub}>Picked from your favourites for the {phase.label.toLowerCase()} · near {origin ? 'you' : 'home'}</Text>
      {recs.length === 0 && <Text style={st.none}>None of the saved foods match this phase yet — tap “Edit list” and add tags.</Text>}
      {recs.map(({ food, matched, places: near }) => (
        <View key={food.id} style={st.item}>
          <Text style={st.food}>{food.name}</Text>
          <Text style={st.tags}>{matched.map((t) => `${TAG[t]?.emoji || ''} ${TAG[t]?.label || t}`).join('  ·  ')}</Text>
          {near.length ? near.map((p) => (
            <TouchableOpacity key={p.id} style={st.place} onPress={() => goTo(p)}>
              <Text style={st.placeName} numberOfLines={1}>{food.kind === 'buy' ? '🛒' : '📍'} {p.name}</Text>
              <Text style={st.placeDist}>{fmtDist(p.away)} · Go ›</Text>
            </TouchableOpacity>
          )) : <Text style={st.noPlace}>{food.kind === 'buy' ? 'No grocery shop found nearby in the map data.' : 'Nothing matching nearby in the map data — make it at home?'}</Text>}
        </View>
      ))}
      <Text style={st.fine}>General food ideas, not medical or nutrition advice.</Text>
      <FoodEditor visible={editing} foods={foods} onClose={() => setEditing(false)} onChange={setFoods} />
    </Card>
  );
}

function FoodEditor({ visible, foods, onClose, onChange }) {
  const blank = { name: '', kind: 'out', tags: [], keywords: '' };
  const [draft, setDraft] = useState(blank);
  const [editId, setEditId] = useState(null);

  const startEdit = (f) => { setEditId(f.id); setDraft({ ...f, keywords: (f.keywords || []).join(', ') }); };
  const commit = () => {
    if (!draft.name.trim()) return;
    const item = { ...draft, id: editId || uid(), name: draft.name.trim(), keywords: draft.keywords.split(',').map((k) => k.trim()).filter(Boolean) };
    onChange(editId ? foods.map((f) => (f.id === editId ? item : f)) : [...foods, item]);
    setDraft(blank);
    setEditId(null);
  };
  const toggleTag = (t) => setDraft((d) => ({ ...d, tags: d.tags.includes(t) ? d.tags.filter((x) => x !== t) : [...d.tags, t] }));

  return (
    <Sheet visible={visible} title="Foods you like" onClose={onClose}>
      {foods.map((f) => (
        <View key={f.id} style={st.row}>
          <View style={{ flex: 1 }}>
            <Text style={st.food}>{f.name}</Text>
            <Text style={st.tags}>{f.kind === 'buy' ? '🛒 buy · ' : '📍 eat out · '}{f.tags.map((t) => TAG[t]?.label || t).join(', ')}</Text>
          </View>
          <Btn small label="Edit" onPress={() => startEdit(f)} />
          <Btn small kind="danger" label="✕" style={{ marginLeft: 6 }} onPress={() => onChange(foods.filter((x) => x.id !== f.id))} />
        </View>
      ))}
      <Text style={[st.title, { marginTop: 18, marginBottom: 10 }]}>{editId ? 'Edit food' : 'Add a food'}</Text>
      <Field label="Name" value={draft.name} onChangeText={(name) => setDraft((d) => ({ ...d, name }))} placeholder="e.g. Pho, bubble tea, köttbullar" />
      <Label>Where</Label>
      <View style={st.wrap}>
        <Chip label="📍 Eat out" on={draft.kind === 'out'} onPress={() => setDraft((d) => ({ ...d, kind: 'out' }))} />
        <Chip label="🛒 Buy at a shop" on={draft.kind === 'buy'} onPress={() => setDraft((d) => ({ ...d, kind: 'buy' }))} />
      </View>
      <Label>What it’s like (used to match cycle phases)</Label>
      <View style={st.wrap}>
        {FOOD_TAGS.map((t) => <Chip key={t.key} label={`${t.emoji} ${t.label}`} on={draft.tags.includes(t.key)} color="#e5484d" onPress={() => toggleTag(t.key)} />)}
      </View>
      <Field label="Search words for places (comma-separated)" value={draft.keywords} onChangeText={(keywords) => setDraft((d) => ({ ...d, keywords }))}
        placeholder="e.g. vietnamese, pho, noodle" autoCapitalize="none" />
      <Btn kind="primary" label={editId ? 'Save changes' : 'Add food'} onPress={commit} disabled={!draft.name.trim() || !draft.tags.length} />
      {editId && <Btn label="Cancel edit" style={{ marginTop: 8 }} onPress={() => { setEditId(null); setDraft(blank); }} />}
    </Sheet>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, fontSize: 17, fontWeight: '700' },
  link: { color: '#2979ff', fontWeight: '600' },
  sub: { fontSize: 12, color: '#888', marginTop: 2, marginBottom: 6 },
  none: { fontSize: 14, color: '#666', marginVertical: 8 },
  item: { paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#e5e5e5' },
  food: { fontSize: 15, fontWeight: '700', color: '#111' },
  tags: { fontSize: 12, color: '#8e4ec6', marginTop: 2 },
  place: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginTop: 6 },
  placeName: { flex: 1, fontSize: 14, color: '#222' },
  placeDist: { fontSize: 13, color: '#2979ff', fontWeight: '600', marginLeft: 6 },
  noPlace: { fontSize: 13, color: '#888', marginTop: 6 },
  fine: { fontSize: 11, color: '#aaa', marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ddd' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
});
