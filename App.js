/**
 * Ryd Walker — nearby amenities + place→place walking routes + step-by-step
 * street-level photos, around Rydsvägen, Linköping.
 *
 * Runs in Expo Go (no App Store / deployment needed).
 *  - Map: Apple Maps via react-native-maps (no API key in Expo Go)
 *  - Amenities: OpenStreetMap (Overpass API, free, no key)
 *  - Walking routes: OSRM foot profile at routing.openstreetmap.de (free, no key)
 *  - Street photos: Mapillary (free token — paste it below)
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView,
  ActivityIndicator, Image, Modal, Linking, TextInput, Keyboard, Dimensions, StatusBar,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

// ───────────────────────── SETTINGS ─────────────────────────
// 1) Paste your free Mapillary client token here (starts with "MLY|").
//    Get it at https://www.mapillary.com/dashboard/developers → Register application.
//    Leave empty and the walk-through still works, with "Street View here" buttons instead of photos.
const MAPILLARY_TOKEN = '';

// 2) Your home. Ryd, Linköping by default — long-press your exact building in the app
//    and tap "Set as Home", or put your building's coordinates here to make it permanent.
const HOME_DEFAULT = { id: 'home', name: 'Home · Rydsvägen', lat: 58.40889, lon: 15.5625 };

const RADIUS_M = 2000; // how far around the centre to look for amenities
// ────────────────────────────────────────────────────────────

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const ROUTER = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot';

const CATEGORIES = [
  { key: 'grocery', label: 'Groceries', emoji: '🛒', color: '#2e7d32', f: [['shop', 'supermarket|convenience|greengrocer|bakery|butcher']] },
  { key: 'food', label: 'Food & café', emoji: '🍜', color: '#ef6c00', f: [['amenity', 'restaurant|cafe|fast_food|pub|bar|food_court']] },
  { key: 'transport', label: 'Bus & train', emoji: '🚌', color: '#1565c0', f: [['highway', 'bus_stop'], ['railway', 'station|halt'], ['amenity', 'bicycle_rental|bus_station']] },
  { key: 'health', label: 'Health', emoji: '💊', color: '#c62828', f: [['amenity', 'pharmacy|doctors|clinic|hospital|dentist'], ['shop', 'chemist']] },
  { key: 'study', label: 'Campus & library', emoji: '📚', color: '#6a1b9a', f: [['amenity', 'library|university|college']] },
  { key: 'fitness', label: 'Gym & sport', emoji: '🏋️', color: '#00838f', f: [['leisure', 'fitness_centre|sports_centre|swimming_pool|sports_hall']] },
  { key: 'services', label: 'ATM & post', emoji: '📮', color: '#5d4037', f: [['amenity', 'atm|bank|post_office|parcel_locker|bureau_de_change']] },
  { key: 'shops', label: 'Shops', emoji: '🛍️', color: '#ad1457', f: [['shop', 'mall|department_store|clothes|electronics|hardware|second_hand|variety_store|doityourself|furniture|mobile_phone|sports|bicycle|charity']] },
];
const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));
const CAT_RX = CATEGORIES.map((c) => ({ key: c.key, f: c.f.map(([k, v]) => [k, new RegExp(`^(${v})$`)]) }));
const DEFAULT_ON = ['grocery', 'food', 'transport', 'health', 'study'];

// ───────────────────────── geo helpers ─────────────────────────
const R = 6371000;
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;
const toLL = (p) => ({ latitude: p.lat, longitude: p.lon });

export function dist(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
export function bearing(a, b) {
  const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
export function angleDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
const fmtDist = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
const fmtTime = (s) => {
  const m = Math.max(1, Math.round(s / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
const compassWord = (b) => ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(b / 45) % 8];
const pretty = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : 'Place');

/** Points every `spacing` metres along a polyline, each with the walking heading. */
export function resample(coords, spacing) {
  const out = [];
  if (coords.length < 2) return out;
  let acc = 0;
  let next = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const seg = dist(a, b);
    if (seg === 0) continue;
    const h = bearing(a, b);
    while (next <= acc + seg) {
      const t = (next - acc) / seg;
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t, heading: h, along: next });
      next += spacing;
    }
    acc += seg;
  }
  const last = coords[coords.length - 1];
  const lastH = out.length ? out[out.length - 1].heading : 0;
  if (!out.length || acc - out[out.length - 1].along > spacing * 0.4) {
    out.push({ lat: last.lat, lon: last.lon, heading: lastH, along: acc });
  }
  return out;
}

// ───────────────────────── data sources ─────────────────────────
function classify(tags) {
  for (const c of CAT_RX) for (const [k, rx] of c.f) if (tags[k] && rx.test(tags[k])) return c.key;
  return null;
}

export function buildOverpassQuery(c) {
  const lines = [];
  CATEGORIES.forEach((cat) => cat.f.forEach(([k, v]) => {
    lines.push(`nwr["${k}"~"^(${v})$"](around:${RADIUS_M},${c.lat.toFixed(6)},${c.lon.toFixed(6)});`);
  }));
  return `[out:json][timeout:25];(${lines.join('')});out center;`;
}

export function parseOverpass(json) {
  const seen = new Set();
  const out = [];
  for (const el of json.elements || []) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const t = el.tags || {};
    const cat = classify(t);
    if (!cat) continue;
    const id = el.type + el.id;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id, lat, lon, cat, tags: t,
      name: t.name || t.brand || t.operator || pretty(t.amenity || t.shop || t.leisure || t.highway || t.railway),
    });
  }
  return out;
}

async function fetchAmenities(center) {
  const q = buildOverpassQuery(center);
  let lastErr;
  for (const ep of OVERPASS) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return parseOverpass(await res.json());
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export function stepText(s) {
  const m = s.maneuver || {};
  const name = s.name ? s.name : '';
  const onto = name ? ` onto ${name}` : '';
  const mod = m.modifier || '';
  if (mod === 'uturn') return 'Make a U-turn';
  switch (m.type) {
    case 'depart': return `Head ${compassWord(m.bearing_after || 0)}${name ? ` on ${name}` : ''}`;
    case 'arrive': return 'Arrive at your destination';
    case 'roundabout':
    case 'rotary': return `Go through the roundabout${onto}`;
    case 'continue':
    case 'new name': return `Continue${mod && mod !== 'straight' ? ' ' + mod : ' straight'}${name ? ` on ${name}` : ''}`;
    case 'fork': return `Keep ${mod || 'straight'}${onto}`;
    default:
      if (mod === 'straight') return `Go straight${onto}`;
      return `Turn ${mod || 'ahead'}${onto}`;
  }
}

export function parseRoute(j) {
  if (j.code !== 'Ok' || !j.routes?.length) throw new Error(j.message || 'No walking route found');
  const r = j.routes[0];
  const coords = r.geometry.coordinates.map(([lon, lat]) => ({ lat, lon }));
  let along = 0;
  const steps = [];
  for (const s of r.legs[0].steps) {
    steps.push({ text: stepText(s), distance: s.distance, at: along, loc: { lat: s.maneuver.location[1], lon: s.maneuver.location[0] } });
    along += s.distance;
  }
  return { coords, distance: r.distance, duration: r.duration, steps };
}

async function getRoute(a, b) {
  const url = `${ROUTER}/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson&steps=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return parseRoute(await res.json());
}

/** Pick the Mapillary photo nearest to the point AND facing the walking direction. */
export function pickBestPhoto(p, images) {
  let best = null;
  let bestScore = Infinity;
  for (const im of images) {
    const g = (im.computed_geometry || im.geometry)?.coordinates;
    if (!g || !im.thumb_1024_url) continue;
    const ang = im.computed_compass_angle ?? im.compass_angle ?? 0;
    const d = dist(p, { lat: g[1], lon: g[0] });
    const facing = im.is_pano ? 45 : angleDiff(ang, p.heading); // panoramas look odd when cropped
    const score = facing + d * 1.5;
    if (score < bestScore) {
      bestScore = score;
      best = { id: im.id, url: im.thumb_1024_url, capturedAt: im.captured_at, away: d, facing };
    }
  }
  return best;
}

async function findPhoto(p, token) {
  for (const r of [25, 60]) {
    const dLat = r / 111320;
    const dLon = r / (111320 * Math.cos(toRad(p.lat)));
    const bbox = [p.lon - dLon, p.lat - dLat, p.lon + dLon, p.lat + dLat].map((v) => v.toFixed(6)).join(',');
    const url = `https://graph.mapillary.com/images?access_token=${encodeURIComponent(token)}` +
      `&fields=id,thumb_1024_url,computed_compass_angle,compass_angle,computed_geometry,geometry,is_pano,captured_at` +
      `&bbox=${bbox}&limit=50`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'Mapillary token rejected' : 'Mapillary HTTP ' + res.status);
    const j = await res.json();
    const best = pickBestPhoto(p, j.data || []);
    if (best && (best.facing < 100 || r === 60)) return best;
  }
  return null;
}

export function upcomingStep(steps, along) {
  for (let i = 1; i < steps.length; i++) if (steps[i].at >= along - 10) return steps[i];
  return steps[steps.length - 1];
}

const streetViewUrl = (p) =>
  `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.lat},${p.lon}${p.heading != null ? `&heading=${Math.round(p.heading)}` : ''}`;

// ───────────────────────── UI ─────────────────────────
export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

function Main() {
  const insets = useSafeAreaInsets();
  const W = Dimensions.get('window').width;
  const mapRef = useRef(null);
  const miniRef = useRef(null);
  const photoReq = useRef({});
  const routeGen = useRef(0);

  const [home, setHome] = useState(HOME_DEFAULT);
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [enabled, setEnabled] = useState(() => new Set(DEFAULT_ON));
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState(null);
  const [loadedAt, setLoadedAt] = useState(HOME_DEFAULT);
  const [selected, setSelected] = useState(null);

  const [from, setFrom] = useState(HOME_DEFAULT);
  const [to, setTo] = useState(null);
  const [route, setRoute] = useState(null);
  const [routing, setRouting] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  const [walk, setWalk] = useState(false);
  const [idx, setIdx] = useState(0);
  const [photos, setPhotos] = useState({});
  const [autoplay, setAutoplay] = useState(false);

  async function loadPlaces(center) {
    setLoading(true);
    setErr(null);
    try {
      setPlaces(await fetchAmenities(center));
      setLoadedAt(center);
    } catch (e) {
      setErr('Could not load places (' + (e?.message || 'network') + '). Tap “Search this area” to retry.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPlaces(HOME_DEFAULT);
    Location.requestForegroundPermissionsAsync().catch(() => {});
  }, []);

  // Compute route whenever start/destination change
  useEffect(() => {
    if (!from || !to) {
      setRoute(null);
      return;
    }
    const gen = ++routeGen.current;
    setRouting(true);
    setErr(null);
    getRoute(from, to)
      .then((r) => {
        if (gen !== routeGen.current) return;
        photoReq.current = {};
        setPhotos({});
        setIdx(0);
        setRoute(r);
        setTimeout(() => mapRef.current?.fitToCoordinates(r.coords.map(toLL), {
          edgePadding: { top: insets.top + 230, right: 40, bottom: 120, left: 40 }, animated: true,
        }), 250);
      })
      .catch((e) => gen === routeGen.current && setErr('Route failed: ' + e.message))
      .finally(() => gen === routeGen.current && setRouting(false));
  }, [from, to]);

  const frames = useMemo(
    () => (route ? resample(route.coords, Math.max(30, route.distance / 60)) : []),
    [route],
  );

  // Load photos for the current frame + the next two (prefetch)
  useEffect(() => {
    if (!walk || !frames.length || !MAPILLARY_TOKEN) return;
    const gen = routeGen.current;
    [idx, idx + 1, idx + 2].forEach((i) => {
      if (i >= frames.length || photoReq.current[i]) return;
      photoReq.current[i] = true;
      setPhotos((p) => ({ ...p, [i]: 'loading' }));
      findPhoto(frames[i], MAPILLARY_TOKEN)
        .then((ph) => gen === routeGen.current && setPhotos((p) => ({ ...p, [i]: ph })))
        .catch((e) => gen === routeGen.current && setPhotos((p) => ({ ...p, [i]: { error: e.message } })));
    });
  }, [walk, idx, frames]);

  // Mini-map follows you, heading-up
  useEffect(() => {
    const f = frames[idx];
    if (!walk || !f) return;
    miniRef.current?.animateCamera(
      { center: toLL(f), heading: f.heading, pitch: 45, altitude: 220, zoom: 18 },
      { duration: 500 },
    );
  }, [walk, idx, frames]);

  // Autoplay
  useEffect(() => {
    if (!autoplay) return undefined;
    const t = setInterval(() => setIdx((i) => Math.min(i + 1, frames.length - 1)), 2500);
    return () => clearInterval(t);
  }, [autoplay, frames.length]);
  useEffect(() => {
    if (autoplay && idx >= frames.length - 1) setAutoplay(false);
  }, [idx, autoplay, frames.length]);

  const visible = useMemo(() => places.filter((p) => enabled.has(p.cat)), [places, enabled]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return places
      .filter((p) => p.name.toLowerCase().includes(q) || CAT[p.cat].label.toLowerCase().includes(q))
      .sort((a, b) => dist(home, a) - dist(home, b))
      .slice(0, 8);
  }, [query, places, home]);

  const regionCenter = region ? { lat: region.latitude, lon: region.longitude } : null;
  const showSearchArea = !loading && regionCenter && dist(regionCenter, loadedAt) > 700;

  function toggleCat(k) {
    setEnabled((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  }
  function focus(p) {
    setSelected(p);
    setQuery('');
    Keyboard.dismiss();
    mapRef.current?.animateToRegion({ latitude: p.lat, longitude: p.lon, latitudeDelta: 0.008, longitudeDelta: 0.008 }, 400);
  }
  async function startFromMe() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return setErr('Location permission was denied (Settings → Expo Go → Location).');
      const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setFrom({ id: 'me', name: 'My location', lat: l.coords.latitude, lon: l.coords.longitude });
    } catch (e) {
      setErr('Could not get your location: ' + e.message);
    }
  }
  function makeHome(p) {
    const h = { id: 'home', name: 'Home', lat: p.lat, lon: p.lon };
    setHome(h);
    if (from?.id === 'home') setFrom(h);
    setSelected(null);
    loadPlaces(h);
  }
  function openWalk() {
    setIdx(0);
    setAutoplay(false);
    setWalk(true);
  }
  const clearRoute = () => { setTo(null); setFrom(home); setRoute(null); };

  const sel = selected;
  const selCat = sel?.cat ? CAT[sel.cat] : null;
  const f = frames[idx];
  const ph = photos[idx];
  const nxt = f && route ? upcomingStep(route.steps, f.along) : null;
  const toNext = nxt && f ? nxt.at - f.along : 0;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: HOME_DEFAULT.lat, longitude: HOME_DEFAULT.lon, latitudeDelta: 0.025, longitudeDelta: 0.025 }}
        showsUserLocation
        showsPointsOfInterest={false}
        onRegionChangeComplete={setRegion}
        onPress={(e) => { if (e.nativeEvent.action !== 'marker-press') { setSelected(null); Keyboard.dismiss(); } }}
        onLongPress={(e) => {
          const { latitude, longitude } = e.nativeEvent.coordinate;
          setSelected({ id: 'pin', name: 'Dropped pin', lat: latitude, lon: longitude, cat: null, custom: true, tags: {} });
        }}
      >
        {visible.map((p) => (
          <Marker key={p.id} coordinate={toLL(p)} onPress={() => setSelected(p)} tracksViewChanges={false}>
            <View style={[styles.pin, { backgroundColor: CAT[p.cat].color }, sel?.id === p.id && styles.pinSel]}>
              <Text style={styles.pinEmoji}>{CAT[p.cat].emoji}</Text>
            </View>
          </Marker>
        ))}
        {sel && (sel.custom || !enabled.has(sel.cat)) && sel.id !== 'home' && (
          <Marker key={'sel' + sel.lat + sel.lon} coordinate={toLL(sel)} pinColor="#d50000" />
        )}
        <Marker key={'home' + home.lat} coordinate={toLL(home)} onPress={() => setSelected({ ...home, cat: null, tags: {} })} tracksViewChanges={false}>
          <View style={[styles.pin, styles.homePin]}><Text style={styles.pinEmoji}>🏠</Text></View>
        </Marker>
        {route && <Polyline coordinates={route.coords.map(toLL)} strokeWidth={6} strokeColor="#2979ff" />}
        {route && from && <Marker coordinate={toLL(from)} pinColor="#00c853" />}
        {route && to && <Marker coordinate={toLL(to)} pinColor="#d50000" />}
      </MapView>

      {/* ── Top: search + chips + route ── */}
      <View style={[styles.top, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <View style={styles.searchRow}>
          <TextInput
            style={styles.search}
            placeholder="Search places (e.g. ICA, pharmacy, Kårallen)"
            placeholderTextColor="#888"
            value={query}
            onChangeText={setQuery}
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
          {loading && <ActivityIndicator style={{ marginLeft: 8 }} />}
        </View>
        {results.length > 0 && (
          <View style={styles.results}>
            {results.map((p) => (
              <TouchableOpacity key={p.id} style={styles.resultRow} onPress={() => focus(p)}>
                <Text style={styles.resultName} numberOfLines={1}>{CAT[p.cat].emoji}  {p.name}</Text>
                <Text style={styles.resultDist}>{fmtDist(dist(home, p))}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
          {CATEGORIES.map((c) => {
            const on = enabled.has(c.key);
            return (
              <TouchableOpacity key={c.key} onPress={() => toggleCat(c.key)}
                style={[styles.chip, on && { backgroundColor: c.color, borderColor: c.color }]}>
                <Text style={[styles.chipText, on && { color: '#fff' }]}>{c.emoji} {c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {to && (
          <View style={styles.routeBox}>
            <View style={styles.routeRow}>
              <Text style={styles.routeDot}>🟢</Text>
              <Text style={styles.routeName} numberOfLines={1}>{from?.name || 'Pick a start'}</Text>
              <TouchableOpacity onPress={startFromMe} style={styles.iconBtn}><Text>📍</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setFrom(home)} style={styles.iconBtn}><Text>🏠</Text></TouchableOpacity>
            </View>
            <View style={styles.routeRow}>
              <Text style={styles.routeDot}>🔴</Text>
              <Text style={styles.routeName} numberOfLines={1}>{to.name}</Text>
              <TouchableOpacity onPress={() => { const a = from; setFrom(to); setTo(a); }} style={styles.iconBtn}><Text>⇅</Text></TouchableOpacity>
              <TouchableOpacity onPress={clearRoute} style={styles.iconBtn}><Text>✕</Text></TouchableOpacity>
            </View>
            {routing && <ActivityIndicator style={{ marginTop: 6 }} />}
            {!routing && route && (
              <>
                <Text style={styles.routeStats}>🚶 {fmtDist(route.distance)} · about {fmtTime(route.duration)}</Text>
                <View style={styles.btnRow}>
                  <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={openWalk}>
                    <Text style={styles.btnPrimaryText}>👣 Walk-through</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.btn} onPress={() => setShowSteps(true)}><Text style={styles.btnText}>📋 Steps</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.btn}
                    onPress={() => Linking.openURL(`http://maps.apple.com/?saddr=${from.lat},${from.lon}&daddr=${to.lat},${to.lon}&dirflg=w`)}>
                    <Text style={styles.btnText}>🧭 Navigate</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}

        {err && (
          <TouchableOpacity style={styles.err} onPress={() => setErr(null)}>
            <Text style={styles.errText}>{err}  (tap to hide)</Text>
          </TouchableOpacity>
        )}
        {showSearchArea && (
          <TouchableOpacity style={styles.searchArea} onPress={() => loadPlaces(regionCenter)}>
            <Text style={styles.searchAreaText}>↻ Search this area</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Bottom: selected place card ── */}
      {sel && (
        <View style={[styles.card, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={styles.cardTitle} numberOfLines={2}>{selCat ? selCat.emoji + '  ' : ''}{sel.name}</Text>
          <Text style={styles.cardSub}>
            {selCat ? selCat.label + ' · ' : ''}
            {sel.id === 'home' ? 'Your home' : `${fmtDist(dist(home, sel))} from home (straight line)`}
          </Text>
          {!!(sel.tags?.['addr:street']) && <Text style={styles.cardInfo}>📍 {sel.tags['addr:street']} {sel.tags['addr:housenumber'] || ''}</Text>}
          {!!sel.tags?.opening_hours && <Text style={styles.cardInfo}>🕒 {sel.tags.opening_hours}</Text>}
          {!!(sel.tags?.website || sel.tags?.['contact:website']) && (
            <Text style={[styles.cardInfo, styles.link]} numberOfLines={1}
              onPress={() => Linking.openURL(sel.tags.website || sel.tags['contact:website'])}>
              🌐 {sel.tags.website || sel.tags['contact:website']}
            </Text>
          )}
          <View style={styles.btnRow}>
            {sel.id !== 'home' && (
              <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => { setFrom(home); setTo(sel); setSelected(null); }}>
                <Text style={styles.btnPrimaryText}>🏠 → Here</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.btn} onPress={() => { setFrom(sel); if (!to) setTo(home.id === sel.id ? null : home); setSelected(null); }}>
              <Text style={styles.btnText}>Start here</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btn} onPress={() => { setTo(sel); setSelected(null); }}>
              <Text style={styles.btnText}>Go here</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.btn} onPress={() => Linking.openURL(streetViewUrl(sel))}>
              <Text style={styles.btnText}>👀 Street View</Text>
            </TouchableOpacity>
            {sel.custom && (
              <TouchableOpacity style={styles.btn} onPress={() => makeHome(sel)}>
                <Text style={styles.btnText}>🏠 Set as Home</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* ── Steps list ── */}
      <Modal visible={showSteps} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowSteps(false)}>
        <View style={{ flex: 1, padding: 16 }}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Directions</Text>
            <TouchableOpacity onPress={() => setShowSteps(false)}><Text style={styles.sheetClose}>Done</Text></TouchableOpacity>
          </View>
          <ScrollView>
            {route?.steps.map((s, i) => (
              <TouchableOpacity key={i} style={styles.stepRow} onPress={() => {
                setShowSteps(false);
                mapRef.current?.animateToRegion({ latitude: s.loc.lat, longitude: s.loc.lon, latitudeDelta: 0.003, longitudeDelta: 0.003 }, 400);
              }}>
                <Text style={styles.stepNum}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepText}>{s.text}</Text>
                  {s.distance > 0 && <Text style={styles.stepDist}>then {fmtDist(s.distance)}</Text>}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* ── POV walk-through ── */}
      <Modal visible={walk} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { setWalk(false); setAutoplay(false); }}>
        <View style={[styles.walkWrap, { paddingTop: insets.top, paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.walkHeader}>
            <TouchableOpacity onPress={() => { setWalk(false); setAutoplay(false); }} style={styles.walkHdrBtnWrap}>
              <Text style={styles.walkHdrBtn}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.walkTitle} numberOfLines={1}>{from?.name} → {to?.name}</Text>
            <TouchableOpacity onPress={() => setAutoplay((a) => !a)} style={styles.walkHdrBtnWrap}>
              <Text style={styles.walkHdrBtn}>{autoplay ? '⏸' : '▶'}</Text>
            </TouchableOpacity>
          </View>

          <View style={{ width: W, height: W * 0.75, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' }}>
            {!MAPILLARY_TOKEN ? (
              <View style={styles.noPhoto}>
                <Text style={styles.noPhotoText}>Add your free Mapillary token at the top of App.js to see real street photos at every step.</Text>
                <Text style={styles.noPhotoText}>For now, tap “Street View here” below.</Text>
              </View>
            ) : ph === undefined || ph === 'loading' ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : ph === null ? (
              <View style={styles.noPhoto}><Text style={styles.noPhotoText}>No street photo within 60 m of this point.{'\n'}Try “Street View here”.</Text></View>
            ) : ph.error ? (
              <View style={styles.noPhoto}><Text style={styles.noPhotoText}>{ph.error}</Text></View>
            ) : (
              <>
                <Image source={{ uri: ph.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                <View style={styles.credit}>
                  <Text style={styles.creditText}>
                    📷 Mapillary{ph.capturedAt ? ' · ' + new Date(ph.capturedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : ''} · {Math.round(ph.away)} m away
                  </Text>
                </View>
              </>
            )}
            <Pressable style={[styles.tapZone, { left: 0 }]} onPress={() => setIdx((i) => Math.max(0, i - 1))} />
            <Pressable style={[styles.tapZone, { right: 0 }]} onPress={() => setIdx((i) => Math.min(frames.length - 1, i + 1))} />
            {nxt && (
              <View style={styles.instr}>
                <Text style={styles.instrText}>
                  {idx === frames.length - 1 ? '🏁 You have arrived' : toNext <= 15 ? `Now: ${nxt.text}` : `In ${fmtDist(toNext)}: ${nxt.text}`}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${frames.length > 1 ? (idx / (frames.length - 1)) * 100 : 100}%` }]} />
          </View>
          <Text style={styles.walkMeta}>
            Stop {idx + 1} of {frames.length} · {f ? fmtDist(f.along) : ''} of {route ? fmtDist(route.distance) : ''} · facing {f ? compassWord(f.heading) : ''}
          </Text>

          {walk && f && (
            <MapView
              ref={miniRef}
              style={styles.mini}
              initialCamera={{ center: toLL(f), heading: f.heading, pitch: 45, altitude: 220, zoom: 18 }}
              scrollEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
              showsPointsOfInterest={false}
            >
              {route && <Polyline coordinates={route.coords.map(toLL)} strokeWidth={6} strokeColor="#2979ff" />}
              <Marker coordinate={toLL(f)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                <View style={styles.meDot}><Text style={styles.meArrow}>▲</Text></View>
              </Marker>
            </MapView>
          )}

          <View style={styles.walkControls}>
            <TouchableOpacity style={styles.walkBtn} onPress={() => setIdx((i) => Math.max(0, i - 1))}><Text style={styles.walkBtnText}>◀ Back</Text></TouchableOpacity>
            <TouchableOpacity style={styles.walkBtn} onPress={() => f && Linking.openURL(streetViewUrl(f))}><Text style={styles.walkBtnText}>👀 Street View here</Text></TouchableOpacity>
            <TouchableOpacity style={styles.walkBtn} onPress={() => setIdx((i) => Math.min(frames.length - 1, i + 1))}><Text style={styles.walkBtnText}>Next ▶</Text></TouchableOpacity>
          </View>
          <Text style={styles.attrib}>Map data © OpenStreetMap contributors · Photos © Mapillary contributors</Text>
        </View>
      </Modal>
    </View>
  );
}

const shadow = { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4 };

const styles = StyleSheet.create({
  pin: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  pinSel: { transform: [{ scale: 1.3 }] },
  homePin: { backgroundColor: '#111', width: 36, height: 36, borderRadius: 18 },
  pinEmoji: { fontSize: 15 },

  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 10 },
  searchRow: { flexDirection: 'row', alignItems: 'center' },
  search: { flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 16, color: '#111', ...shadow },
  results: { backgroundColor: '#fff', borderRadius: 12, marginTop: 6, ...shadow },
  resultRow: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ddd' },
  resultName: { flex: 1, fontSize: 15, color: '#111' },
  resultDist: { fontSize: 13, color: '#666', marginLeft: 8 },
  chips: { paddingVertical: 8, gap: 6 },
  chip: { backgroundColor: '#fff', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: '#ddd', marginRight: 6, ...shadow },
  chipText: { fontSize: 13, color: '#222', fontWeight: '500' },

  routeBox: { backgroundColor: '#fff', borderRadius: 14, padding: 12, ...shadow },
  routeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  routeDot: { fontSize: 12, marginRight: 8 },
  routeName: { flex: 1, fontSize: 15, color: '#111' },
  iconBtn: { paddingHorizontal: 9, paddingVertical: 4 },
  routeStats: { marginTop: 6, fontSize: 15, fontWeight: '600', color: '#111' },

  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  btn: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: '#f0f1f4' },
  btnText: { fontSize: 14, color: '#111', fontWeight: '500' },
  btnPrimary: { backgroundColor: '#2979ff' },
  btnPrimaryText: { fontSize: 14, color: '#fff', fontWeight: '700' },

  err: { backgroundColor: '#ffebee', borderRadius: 10, padding: 10, marginTop: 8 },
  errText: { color: '#b71c1c', fontSize: 13 },
  searchArea: { alignSelf: 'center', backgroundColor: '#111', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginTop: 8 },
  searchAreaText: { color: '#fff', fontWeight: '600' },

  card: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, ...shadow },
  cardTitle: { fontSize: 19, fontWeight: '700', color: '#111' },
  cardSub: { fontSize: 13, color: '#666', marginTop: 3 },
  cardInfo: { fontSize: 14, color: '#333', marginTop: 6 },
  link: { color: '#1565c0' },

  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sheetTitle: { fontSize: 22, fontWeight: '700' },
  sheetClose: { fontSize: 17, color: '#2979ff', fontWeight: '600' },
  stepRow: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ddd' },
  stepNum: { width: 28, fontSize: 15, fontWeight: '700', color: '#2979ff' },
  stepText: { fontSize: 16, color: '#111' },
  stepDist: { fontSize: 13, color: '#777', marginTop: 2 },

  walkWrap: { flex: 1, backgroundColor: '#000' },
  walkHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6 },
  walkHdrBtnWrap: { padding: 8 },
  walkHdrBtn: { color: '#fff', fontSize: 22 },
  walkTitle: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  noPhoto: { padding: 24 },
  noPhotoText: { color: '#ccc', fontSize: 15, textAlign: 'center', marginBottom: 8 },
  credit: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  creditText: { color: '#fff', fontSize: 11 },
  tapZone: { position: 'absolute', top: 0, bottom: 60, width: '35%' },
  instr: { position: 'absolute', left: 10, right: 10, bottom: 10, backgroundColor: 'rgba(41,121,255,0.92)', borderRadius: 12, padding: 12 },
  instrText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  progressTrack: { height: 4, backgroundColor: '#333' },
  progressFill: { height: 4, backgroundColor: '#2979ff' },
  walkMeta: { color: '#aaa', fontSize: 12, textAlign: 'center', paddingVertical: 6 },
  mini: { flex: 1, marginHorizontal: 10, borderRadius: 14, overflow: 'hidden' },
  meDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#2979ff', borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  meArrow: { color: '#fff', fontSize: 11, marginTop: -2 },
  walkControls: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10, paddingTop: 10, gap: 8 },
  walkBtn: { flex: 1, backgroundColor: '#1f1f1f', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  walkBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  attrib: { color: '#666', fontSize: 10, textAlign: 'center', marginTop: 8 },
});