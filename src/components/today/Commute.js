/**
 * 🚌 Home ⇄ Campus Valla: the next few trips (leave the door → arrive), the bus line, and
 * "leave in N min". Defaults to "to campus" in the morning and "home" from midday.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, ActivityIndicator } from 'react-native';
import { Card, Btn, Sheet, Field, C } from '../ui';
import { usePersisted, KEYS } from '../../lib/storage';
import { HOME_DEFAULT } from '../../lib/geo';
import { CAMPUS, RESROBOT_KEY, fetchTrips, transitLink } from '../../lib/transit';
import { fmtTime } from '../../lib/dates';

const STALE_MS = 3 * 60000;

export default function Commute() {
  const [home] = usePersisted(KEYS.home, HOME_DEFAULT);
  const [cfg, setCfg] = usePersisted(KEYS.transit, { key: '' });
  const key = cfg?.key || RESROBOT_KEY;
  const [dir, setDir] = useState(() => (new Date().getHours() < 12 ? 'campus' : 'home'));
  const [data, setData] = useState({}); // dir → { at, trips?, error? }
  const [now, setNow] = useState(() => Date.now());
  const [showKey, setShowKey] = useState(false);
  const [opens, setOpens] = useState(0);

  const from = dir === 'campus' ? home : CAMPUS;
  const to = dir === 'campus' ? CAMPUS : home;
  const cur = data[dir];

  // Tick every 30 s so "leave in N min" stays right and stale trips get refreshed.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const stale = !cur || now - cur.at > STALE_MS || (cur.trips && !cur.trips.some((t) => t.leave.getTime() > now));
  useEffect(() => {
    if (!key || !stale) return undefined;
    let alive = true;
    fetchTrips(from, to, key)
      .then((trips) => alive && setData((d) => ({ ...d, [dir]: { at: Date.now(), trips } })))
      .catch((e) => alive && setData((d) => ({ ...d, [dir]: { at: Date.now(), error: e.message } })));
    return () => { alive = false; };
  }, [key, dir, stale, home.lat, home.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => setData((d) => ({ ...d, [dir]: undefined }));
  const upcoming = (cur?.trips || []).filter((t) => t.leave.getTime() > now - 60000).slice(0, 3);

  return (
    <Card>
      <View style={st.head}>
        <Text style={st.title}>🚌 Bus</Text>
        <View style={st.seg}>
          {[['campus', 'To campus'], ['home', 'Home']].map(([k, label]) => (
            <TouchableOpacity key={k} onPress={() => setDir(k)} style={[st.segBtn, dir === k && st.segOn]}>
              <Text style={[st.segText, dir === k && { color: C.text, fontWeight: '700' }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity hitSlop={10} onPress={() => { setOpens((n) => n + 1); setShowKey(true); }} accessibilityLabel="Bus settings">
          <Text style={{ fontSize: 17 }}>⚙️</Text>
        </TouchableOpacity>
      </View>
      <Text style={st.route} numberOfLines={1}>{from.id === 'campus' ? 'Campus Valla' : 'Home'} → {to.id === 'campus' ? 'Campus Valla' : 'Home'}</Text>

      {!key ? (
        <View>
          <Text style={st.muted}>Add a free Trafiklab key (⚙️) to see the next Östgötatrafiken buses right here.</Text>
          <View style={st.btns}>
            <Btn small kind="primary" label="Add key" onPress={() => { setOpens((n) => n + 1); setShowKey(true); }} />
            <Btn small label="Open in Google Maps" onPress={() => Linking.openURL(transitLink(from, to))} />
          </View>
        </View>
      ) : !cur ? (
        <ActivityIndicator style={{ marginVertical: 12 }} />
      ) : cur.error ? (
        <View>
          <Text style={st.err}>Couldn’t load buses: {cur.error}.</Text>
          <View style={st.btns}>
            <Btn small label="Try again" onPress={refresh} />
            <Btn small label="Open in Google Maps" onPress={() => Linking.openURL(transitLink(from, to))} />
          </View>
        </View>
      ) : upcoming.length === 0 ? (
        <Text style={st.muted}>No trips found right now.</Text>
      ) : (
        upcoming.map((t, i) => {
          const inMin = Math.round((t.leave.getTime() - now) / 60000);
          const r = t.firstRide;
          return (
            <View key={i} style={[st.trip, i > 0 && st.tripLine]}>
              <View style={st.badge}><Text style={st.badgeText}>{r?.line || '🚶'}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={st.times}>
                  {fmtTime(t.leave)} → {fmtTime(t.arrive)}
                  <Text style={st.dur}>  · {t.minutes} min{t.changes ? ` · ${t.changes} change${t.changes > 1 ? 's' : ''}` : ''}</Text>
                </Text>
                {!!r && (
                  <Text style={st.sub} numberOfLines={1}>
                    {r.dep ? fmtTime(r.dep) : ''} from {r.from}{r.delayMin > 0 ? ` · ⚠️ +${r.delayMin} min` : ''}
                  </Text>
                )}
              </View>
              <Text style={[st.leave, inMin <= 5 && { color: C.danger }]}>
                {inMin <= 0 ? 'now' : inMin < 60 ? `leave in\n${inMin} min` : ''}
              </Text>
            </View>
          );
        })
      )}
      {!!key && !!cur?.trips && (
        <TouchableOpacity onPress={refresh}><Text style={st.foot}>Updated {fmtTime(new Date(cur.at))} · tap to refresh</Text></TouchableOpacity>
      )}

      <KeySheet key={'k' + opens} visible={showKey} value={cfg?.key || ''} onClose={() => setShowKey(false)}
        onSave={(k) => { setCfg((c) => ({ ...c, key: k })); setData({}); setShowKey(false); }} />
    </Card>
  );
}

function KeySheet({ visible, value, onClose, onSave }) {
  const [k, setK] = useState(value);
  return (
    <Sheet visible={visible} title="Bus times" onClose={onClose} onSave={() => onSave(k.trim())}>
      <Field label="Trafiklab API key (ResRobot v2.1)" value={k} onChangeText={setK} autoCapitalize="none" autoCorrect={false} placeholder="paste your key" />
      <Text style={st.help}>
        Free, takes ~3 minutes:{'\n'}
        1. Create an account at trafiklab.se{'\n'}
        2. Create a project and add the API “ResRobot v2.1”{'\n'}
        3. Copy the project’s API key and paste it above{'\n\n'}
        Trips are planned door-to-door from your home (set on the Map tab) to Campus Valla using Östgötatrafiken timetables.
      </Text>
      <Btn label="Open trafiklab.se" onPress={() => Linking.openURL('https://www.trafiklab.se/')} style={{ marginTop: 14 }} />
    </Sheet>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, fontSize: 16, fontWeight: '800', color: C.text },
  route: { fontSize: 12, color: C.sub, marginTop: 4, marginBottom: 6 },
  seg: { flexDirection: 'row', backgroundColor: C.soft, borderRadius: 9, padding: 2 },
  segBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7 },
  segOn: { backgroundColor: '#fff' },
  segText: { fontSize: 12, color: '#777' },
  trip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  tripLine: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  badge: { minWidth: 38, height: 28, borderRadius: 7, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, marginRight: 10 },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  times: { fontSize: 16, fontWeight: '700', color: C.text, fontVariant: ['tabular-nums'] },
  dur: { fontSize: 13, fontWeight: '500', color: C.sub },
  sub: { fontSize: 12, color: C.sub, marginTop: 2 },
  leave: { fontSize: 12, fontWeight: '700', color: C.text, textAlign: 'right', marginLeft: 8 },
  muted: { fontSize: 13, color: C.sub, lineHeight: 19 },
  err: { fontSize: 13, color: '#b71c1c', lineHeight: 19 },
  btns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  foot: { fontSize: 11, color: '#999', marginTop: 6, textAlign: 'center' },
  help: { fontSize: 13, color: C.sub, lineHeight: 20 },
});
