/**
 * Events tab — an Apple-Calendar-style month view (or a plain list) of LiU / student-union /
 * Ryd / Linköping city events from the daily feed, plus events she adds herself.
 * Star events for an extra 1-hour reminder; tap 📍 to walk there. New feed events trigger a
 * phone notification (see lib/eventWatch.js).
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Linking } from 'react-native';
import { router } from 'expo-router';
import { ScreenHeader, Card, Btn, Chip, IconBtn, Empty, Sheet, Field, Label, DateTimeField, Toggle, C } from '../../components/ui';
import MonthCalendar from '../../components/events/MonthCalendar';
import { usePersisted, KEYS } from '../../lib/storage';
import {
  EVENT_SOURCES, SOURCE, DEFAULT_SOURCES, DEFAULT_EVENT_SETTINGS, EVENTS_FEED_URL, BUNDLED_FEED,
  visibleEvents, groupByDay, eventsByDay, eventDays, STAY,
} from '../../lib/events';
import { checkForNewEvents } from '../../lib/eventWatch';
import { fmtDay, fmtShort, fmtTime, ymd, uid, parseYmd } from '../../lib/dates';
import { HOME_DEFAULT, dist } from '../../lib/geo';

const pickable = EVENT_SOURCES.filter((s) => s.id !== 'mine');
const ACCENT = C.primary;

export default function EventsScreen() {
  const [feed] = usePersisted(KEYS.eventsCache, BUNDLED_FEED);
  const [mine, setMine] = usePersisted(KEYS.myEvents, []);
  const [sources, setSources] = usePersisted(KEYS.eventSources, DEFAULT_SOURCES);
  const [starred, setStarred] = usePersisted(KEYS.starred, []);
  const [seen, setSeen, seenReady] = usePersisted(KEYS.seenEvents, null);
  const [rawSettings, setSettings] = usePersisted(KEYS.eventSettings, DEFAULT_EVENT_SETTINGS);
  const [home] = usePersisted(KEYS.home, HOME_DEFAULT);
  const settings = { ...DEFAULT_EVENT_SETTINGS, ...rawSettings };
  const feedUrl = settings.feedUrl || EVENTS_FEED_URL;
  const view = settings.view || 'month';

  const today = ymd();
  const startDay = today < STAY.from ? STAY.from : today; // open on the stay if it hasn't started yet
  const [month, setMonth] = useState(startDay.slice(0, 7));
  const [day, setDay] = useState(startDay);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [onlyStarred, setOnlyStarred] = useState(false);
  const [adding, setAdding] = useState(null); // null | { event?, day? }
  const [showSettings, setShowSettings] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [opens, setOpens] = useState(0); // fresh form state each time a sheet opens

  const refresh = async () => {
    if (!feedUrl) return;
    setLoading(true);
    setErr(null);
    const r = await checkForNewEvents({ force: true, notify: false });
    if (!r.ok) setErr('Could not update events (' + r.error + '). Showing the last saved list.');
    setLoading(false);
  };

  const star = useMemo(() => new Set(starred), [starred]);
  const keep = (e) => !onlyStarred || star.has(e.id) || e.source === 'mine';
  const upcoming = useMemo(() => visibleEvents(feed?.events || [], mine, sources), [feed, mine, sources]);
  const byDay = useMemo(() => eventsByDay(feed?.events || [], mine, sources), [feed, mine, sources]);
  const dots = useMemo(() => {
    const out = {};
    for (const [d, list] of Object.entries(byDay)) {
      const ids = new Set(list.filter(keep).map((e) => (e.source in SOURCE ? e.source : 'other')));
      const colors = EVENT_SOURCES.filter((s) => ids.has(s.id)).map((s) => s.color);
      if (colors.length) out[d] = colors;
    }
    return out;
  }, [byDay, onlyStarred, star]); // eslint-disable-line react-hooks/exhaustive-deps
  const dayEvents = (byDay[day] || []).filter(keep);
  const groups = groupByDay(upcoming.filter(keep));

  // "New" = in the feed but not seen on a previous visit. First ever visit marks everything seen.
  const seenSet = useMemo(() => new Set(seen || []), [seen]);
  const newCount = seen ? upcoming.filter((e) => e.source !== 'mine' && !seenSet.has(e.id)).length : 0;
  React.useEffect(() => {
    if (!seenReady) return undefined;
    const ids = upcoming.filter((e) => e.source !== 'mine').map((e) => e.id);
    const t = setTimeout(() => setSeen(ids), seen ? 4000 : 0); // leave the "new" badges up for a moment
    return () => clearTimeout(t);
  }, [seenReady, upcoming.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSource = (id) => setSources((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleStar = (id) => setStarred((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const openAdd = (a) => { setOpens((n) => n + 1); setAdding(a); };
  const openSettings = () => { setOpens((n) => n + 1); setShowSettings(true); };
  const updated = feed?.updatedAt ? new Date(feed.updatedAt) : null;

  const card = (e) => (
    <EventCard key={e.id} e={e} home={home}
      isNew={!!seen && e.source !== 'mine' && !seenSet.has(e.id)}
      starred={star.has(e.id) || e.source === 'mine'}
      open={openId === e.id}
      onToggle={() => setOpenId(openId === e.id ? null : e.id)}
      onStar={() => toggleStar(e.id)}
      onWalk={() => walkTo(e)}
      onEdit={() => openAdd({ event: e })}
      onDelete={() => setMine((m) => m.filter((x) => x.id !== e.id))} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Events"
        subtitle={newCount ? `${newCount} new since last time` : updated ? `Updated ${fmtDay(ymd(updated))} ${fmtTime(updated)}` : 'Student life & Linköping'}
        right={(
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={st.seg}>
              {[['month', '📅'], ['list', '☰']].map(([k, label]) => (
                <TouchableOpacity key={k} onPress={() => setSettings((s) => ({ ...s, view: k }))}
                  style={[st.segBtn, view === k && st.segOn]} accessibilityLabel={k === 'month' ? 'Month view' : 'List view'}>
                  <Text style={[st.segText, view === k && { color: '#111' }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <IconBtn label="⚙️" onPress={openSettings} />
          </View>
        )} />
      <ScrollView contentContainerStyle={{ paddingBottom: 90 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 6 }}>
          <Chip label="⭐ Starred" on={onlyStarred} color="#f08c00" onPress={() => setOnlyStarred((v) => !v)} />
          {pickable.map((s) => <Chip key={s.id} label={`${s.emoji} ${s.name}`} on={sources.includes(s.id)} color={s.color} onPress={() => toggleSource(s.id)} />)}
        </ScrollView>
        {!!err && <Text style={st.err}>{err}</Text>}
        {!feedUrl && (
          <Card style={{ backgroundColor: '#fff8e6' }}>
            <Text style={st.note}>Showing events from {fmtShort(STAY.from)} to {fmtShort(STAY.to)} {STAY.to.slice(0, 4)} that came with the app. Connect the live feed (⚙️) to get new events and notifications automatically.</Text>
          </Card>
        )}

        {view === 'month' ? (
          <>
            <Card>
              <MonthCalendar month={month} selected={day} dots={dots}
                onMonth={setMonth}
                onSelect={(d) => { setDay(d); if (!d.startsWith(month)) setMonth(d.slice(0, 7)); setOpenId(null); }} />
            </Card>
            <View style={st.dayHead}>
              <Text style={st.dayTitle}>{fmtDay(day)}{day === today ? ' · today' : ''}</Text>
              <TouchableOpacity onPress={() => openAdd({ day })}><Text style={st.link}>＋ Add</Text></TouchableOpacity>
            </View>
            {dayEvents.length === 0
              ? <Text style={st.nothing}>{onlyStarred ? 'No starred events this day.' : 'Nothing planned.'}</Text>
              : dayEvents.map(card)}
          </>
        ) : (
          <>
            {groups.length === 0 && (
              <Empty emoji="🎈" title={onlyStarred ? 'No starred events' : 'No upcoming events'} text="Pull down to refresh, or add one you saw on Instagram with +." />
            )}
            {groups.map((g) => (
              <View key={g.day}>
                <Text style={st.day}>{fmtDay(g.day)}{g.day === today ? ' · today' : ''}</Text>
                {g.items.map(card)}
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <TouchableOpacity style={st.fab} onPress={() => openAdd({ day: view === 'month' ? day : null })} accessibilityLabel="Add event">
        <Text style={st.fabText}>＋</Text>
      </TouchableOpacity>

      <AddEventSheet key={'a' + opens} visible={!!adding} event={adding?.event} day={adding?.day} onClose={() => setAdding(null)}
        onSave={(ev) => { setMine((m) => (m.some((x) => x.id === ev.id) ? m.map((x) => (x.id === ev.id ? ev : x)) : [...m, ev])); setAdding(null); }} />
      <EventSettings key={'s' + opens} visible={showSettings} settings={settings} feed={feed}
        onClose={(url) => {
          setShowSettings(false);
          if (url !== settings.feedUrl) {
            setSettings((s) => ({ ...DEFAULT_EVENT_SETTINGS, ...s, feedUrl: url }));
            // checkForNewEvents reads the just-saved link from storage, so no stale closure here.
            if (url || EVENTS_FEED_URL) {
              checkForNewEvents({ force: true, notify: false })
                .then((r) => setErr(r.ok ? null : 'Could not load the feed (' + r.error + '). Check the link.'));
            }
          }
        }}
        onChange={(patch) => setSettings((s) => ({ ...DEFAULT_EVENT_SETTINGS, ...s, ...patch }))} />
    </View>
  );
}

/** Open the Map tab with a walking route to the event (t makes repeated taps count as new). */
function walkTo(e) {
  const t = Date.now();
  router.navigate({ pathname: '/', params: e.lat != null ? { toLat: e.lat, toLon: e.lon, toName: e.title, t } : { q: e.location, t } });
}

function whenText(e) {
  const [first, last] = eventDays(e);
  if (first !== last) {
    return e.allDay ? `${fmtShort(first)} – ${fmtShort(last)}` : `${fmtShort(first)} ${fmtTime(new Date(e.start))} – ${fmtShort(last)} ${fmtTime(new Date(e.end))}`;
  }
  if (e.allDay) return 'All day';
  return fmtTime(new Date(e.start)) + (e.end ? `–${fmtTime(new Date(e.end))}` : '');
}

/** "350 m" / "1.3 km" from home, or '' if the event has no map position. */
function fromHome(e, home) {
  if (e.lat == null || !home) return '';
  const m = dist(home, e);
  return m < 1000 ? `${Math.max(50, Math.round(m / 50) * 50)} m` : `${(m / 1000).toFixed(1)} km`;
}

function EventCard({ e, home, isNew, starred, open, onToggle, onStar, onWalk, onEdit, onDelete }) {
  const src = SOURCE[e.source] || SOURCE.other;
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onToggle}>
      <Card style={{ borderLeftWidth: 5, borderLeftColor: src.color }}>
        <View style={st.row}>
          <View style={{ flex: 1 }}>
            <Text style={st.src}>{src.emoji} {src.name}{isNew ? '  ·  🆕' : ''}</Text>
            <Text style={st.title}>{e.title}</Text>
            <Text style={st.meta}>{whenText(e)}{e.location ? ` · ${e.location}` : ''}</Text>
            {!!fromHome(e, home) && <Text style={st.away}>🚶 {fromHome(e, home)} from home</Text>}
          </View>
          <TouchableOpacity onPress={onStar} hitSlop={10} accessibilityLabel={starred ? 'Unstar' : 'Star'}>
            <Text style={{ fontSize: 24, opacity: starred ? 1 : 0.3 }}>⭐</Text>
          </TouchableOpacity>
        </View>
        {open && (
          <View style={{ marginTop: 10 }}>
            {!!e.description && <Text style={st.desc}>{e.description}</Text>}
            <View style={st.btns}>
              {!!(e.lat != null || e.location) && <Btn small label="📍 Walk there" onPress={onWalk} />}
              {!!e.url && <Btn small label="🔗 Open" onPress={() => Linking.openURL(e.url)} />}
              {e.source === 'mine' && <Btn small label="Edit" onPress={onEdit} />}
              {e.source === 'mine' && <Btn small kind="danger" label="Delete" onPress={onDelete} />}
            </View>
          </View>
        )}
      </Card>
    </TouchableOpacity>
  );
}

/** Add / edit one of her own events. `day` pre-fills the date when adding from the calendar. */
function AddEventSheet({ visible, event, day, onClose, onSave }) {
  const [e, setE] = useState(() => {
    if (event) return event;
    const d = day ? parseYmd(day) : new Date(Date.now() + 86400000);
    d.setHours(18, 0, 0, 0);
    return { title: '', start: d.toISOString(), location: '', url: '', description: '' };
  });
  return (
    <Sheet visible={visible} title={event ? 'Edit event' : 'Add event'} onClose={onClose}
      onSave={() => e.title.trim() && onSave({ ...e, id: e.id || 'mine-' + uid(), title: e.title.trim(), source: 'mine' })}>
      <Field label="What" value={e.title} onChangeText={(title) => setE((x) => ({ ...x, title }))} placeholder="e.g. M-sektionen sittning" autoFocus={!event} />
      <DateTimeField label="Starts" value={new Date(e.start)} onChange={(d) => setE((x) => ({ ...x, start: d.toISOString() }))} />
      <Field label="Where" value={e.location} onChangeText={(location) => setE((x) => ({ ...x, location }))} placeholder="e.g. Kårallen, Herrgården, Rydsvägen 254" />
      <Field label="Link (optional)" value={e.url} onChangeText={(url) => setE((x) => ({ ...x, url }))} placeholder="Instagram / Facebook / ticket link" autoCapitalize="none" keyboardType="url" />
      <Field label="Notes" value={e.description} onChangeText={(description) => setE((x) => ({ ...x, description }))} multiline style={{ minHeight: 60 }} />
      <Text style={st.hint}>You’ll get a reminder the evening before and 1 hour before.</Text>
    </Sheet>
  );
}

function EventSettings({ visible, settings, feed, onClose, onChange }) {
  const [url, setUrl] = useState(settings.feedUrl);
  const report = Object.entries(feed?.sources || {});
  return (
    <Sheet visible={visible} title="Event settings" onClose={() => onClose(url.trim())}>
      <Toggle label="🆕 Notify me about new events" sub="A notification when new events show up in the feed (checked when you open the app and every few hours in the background)."
        value={settings.notifyNew !== false} onChange={(v) => onChange({ notifyNew: v })} />
      <Label>Reminders</Label>
      <View style={st.wrap}>
        <Chip label="All my sources" on={settings.remind === 'all'} onPress={() => onChange({ remind: 'all' })} />
        <Chip label="Starred only" on={settings.remind === 'starred'} onPress={() => onChange({ remind: 'starred' })} />
        <Chip label="Off" on={settings.remind === 'off'} onPress={() => onChange({ remind: 'off' })} />
      </View>
      <Text style={st.hint}>“All” = a heads-up at 18:00 the evening before. Starred events also get one 1 hour before.</Text>
      <Field label="Feed link (events.json)" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url"
        placeholder={EVENTS_FEED_URL || 'https://raw.githubusercontent.com/…/events.json'} />
      <Label>Sources in the feed</Label>
      {EVENT_SOURCES.filter((s) => s.id !== 'mine').map((s) => <Text key={s.id} style={st.srcLine}>{s.emoji} {s.full}</Text>)}
      {report.length > 0 && (
        <>
          <Label>Last collection</Label>
          {report.map(([k, r]) => <Text key={k} style={st.srcLine}>{r.ok ? '✅' : '⚠️'} {k}{r.ok ? ` — ${r.count}` : ` — ${r.error}`}</Text>)}
        </>
      )}
    </Sheet>
  );
}

const st = StyleSheet.create({
  err: { color: '#b71c1c', fontSize: 13, marginHorizontal: 16, marginBottom: 8 },
  note: { fontSize: 13, color: '#7a5a00', lineHeight: 19 },
  seg: { flexDirection: 'row', backgroundColor: C.soft, borderRadius: 10, padding: 2, alignSelf: 'center' },
  segBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  segOn: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  segText: { fontSize: 15, color: '#777' },
  dayHead: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 4, marginBottom: 8 },
  dayTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#111' },
  link: { color: ACCENT, fontWeight: '700', fontSize: 14 },
  nothing: { marginHorizontal: 16, color: '#888', fontSize: 14, marginBottom: 8 },
  day: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', marginHorizontal: 16, marginTop: 10, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center' },
  src: { fontSize: 12, fontWeight: '700', color: '#777' },
  title: { fontSize: 16, fontWeight: '700', color: '#111', marginTop: 2 },
  meta: { fontSize: 13, color: '#555', marginTop: 3 },
  away: { fontSize: 12, color: '#777', marginTop: 2 },
  desc: { fontSize: 13, color: '#444', lineHeight: 19 },
  btns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 },
  hint: { fontSize: 12, color: '#888', marginBottom: 14 },
  srcLine: { fontSize: 13, color: '#444', marginBottom: 6 },
  fab: { position: 'absolute', right: 18, bottom: 18, width: 58, height: 58, borderRadius: 29, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
  fabText: { color: '#fff', fontSize: 30, marginTop: -2 },
});
