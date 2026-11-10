/**
 * Map tab — the original Ryd Walker: nearby amenities, place→place walking routes and the
 * step-by-step street-photo walk-through. Additions: home is saved on the phone, other tabs
 * can open a route here (food ideas, events), and upcoming events show as 🎉 pins.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView,
  ActivityIndicator, Image, Modal, Linking, TextInput, Keyboard, Dimensions, StatusBar,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import {
  MAPILLARY_TOKEN, HOME_DEFAULT, CATEGORIES, CAT, DEFAULT_ON, toLL, dist, fmtDist, fmtTime, compassWord,
  resample, fetchAmenities, searchAddress, getRoute, findPhoto, upcomingStep, streetViewUrl,
} from '../../lib/geo';
import { usePersisted, save, load, KEYS } from '../../lib/storage';
import { C } from '../../components/ui';
import { visibleEvents, BUNDLED_FEED, DEFAULT_SOURCES, SOURCE } from '../../lib/events';

// Saved copy of the places around HOME_DEFAULT, shown instantly while the live data loads
// (or when the free servers are down). Regenerate it with: node scripts/snapshot-places.js
const PLACES_SNAPSHOT = require('../../../places-snapshot.json');

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const W = Dimensions.get('window').width;
  const mapRef = useRef(null);
  const miniRef = useRef(null);
  const photoReq = useRef({});
  const routeGen = useRef(0);
  const loadingRef = useRef(false); // guards against overlapping downloads (state would be stale here)
  const retryRef = useRef(null);

  const [home, setHome, homeReady] = usePersisted(KEYS.home, HOME_DEFAULT);
  const params = useLocalSearchParams();
  const [feed] = usePersisted(KEYS.eventsCache, BUNDLED_FEED);
  const [myEvents] = usePersisted(KEYS.myEvents, []);
  const [eventSources] = usePersisted(KEYS.eventSources, DEFAULT_SOURCES);
  const [showEvents, setShowEvents] = useState(true);
  const [places, setPlaces] = useState(PLACES_SNAPSHOT);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [enabled, setEnabled] = useState(() => new Set(DEFAULT_ON));
  const [query, setQuery] = useState('');
  const [addr, setAddr] = useState({ q: '', items: [] }); // address search results for query q
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

  /**
   * Download places around `center`. On failure keep what's on the map, say so (unless silent),
   * and quietly retry a couple of times — the free servers are often just busy for a minute.
   */
  async function loadPlaces(center, { silent = false, attempt = 0 } = {}) {
    if (loadingRef.current) return;
    clearTimeout(retryRef.current);
    loadingRef.current = true;
    setLoading(true);
    if (!attempt) setErr(null);
    try {
      const { places: fresh, partial, reason } = await fetchAmenities(center, {
        // Overpass is slow → show the quick basic places meanwhile (keeps the current ones if none).
        onBasic: (basic) => { setPlaces(basic); setLoadedAt(center); },
      });
      setPlaces(fresh);
      setLoadedAt(center);
      save(KEYS.placesCache, fresh); // the Cycle tab's food ideas use the same places
      // A partial (backup) result is saved as old, so the next app start tries for the full list again.
      save(KEYS.placesArea, { lat: center.lat, lon: center.lon, at: partial ? 0 : Date.now(), places: fresh });
      if (partial) {
        const RETRY = [60000, 180000];
        const again = attempt < RETRY.length;
        if (!silent) setErr(`Showing basic places — the main map servers are busy (${reason}).${again ? ' Fetching the full list in the background…' : ''}`);
        if (again) retryRef.current = setTimeout(() => loadPlaces(center, { silent: true, attempt: attempt + 1 }), RETRY[attempt]);
      } else {
        setErr(null);
      }
    } catch (e) {
      const RETRIES = [20000, 60000];
      const willRetry = attempt < RETRIES.length;
      if (!silent) {
        setErr(`The free map servers are busy (${e?.message || 'network'}). Showing the places you already have${willRetry ? ' — trying again automatically…' : '. Tap ↻ to try again later.'}`);
      }
      if (willRetry) retryRef.current = setTimeout(() => loadPlaces(center, { silent, attempt: attempt + 1 }), RETRIES[attempt]);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }
  useEffect(() => () => clearTimeout(retryRef.current), []);

  useEffect(() => {
    Location.requestForegroundPermissionsAsync().catch(() => {});
  }, []);

  // Once the saved home is loaded: start routes from it and load places around it.
  useEffect(() => {
    if (!homeReady) return;
    setFrom((f) => (f?.id === 'home' ? home : f));
    // Show the places saved last time for this area straight away; refresh if they're old or elsewhere.
    load(KEYS.placesArea, null).then((area) => {
      const near = area?.places?.length && dist(area, home) < 1500;
      if (near) {
        setPlaces(area.places);
        setLoadedAt({ lat: area.lat, lon: area.lon });
      }
      if (!near || Date.now() - area.at > 7 * 86400000) loadPlaces(home, { silent: true });
    });
    if (dist(home, HOME_DEFAULT) > 300) {
      mapRef.current?.animateToRegion({ latitude: home.lat, longitude: home.lon, latitudeDelta: 0.025, longitudeDelta: 0.025 }, 400);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeReady]);

  // Other tabs open the map with a destination (food idea, event) or a search.
  useEffect(() => {
    if (params.toLat && params.toLon) {
      const dest = { id: 'dest-' + params.t, name: params.toName || 'Destination', lat: +params.toLat, lon: +params.toLon };
      setSelected(null);
      setFrom(home);
      setTo(dest);
    } else if (params.q) {
      setQuery(String(params.q));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.t]);

  // Upcoming events (next 14 days) that have map coordinates.
  const eventPins = useMemo(() => {
    const soon = Date.now() + 14 * 86400000;
    return visibleEvents(feed?.events || [], myEvents, eventSources)
      .filter((e) => e.lat != null && e.lon != null && new Date(e.start).getTime() < soon);
  }, [feed, myEvents, eventSources]);

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
  const catCounts = useMemo(() => {
    const n = {};
    places.forEach((p) => { n[p.cat] = (n[p.cat] || 0) + 1; });
    return n;
  }, [places]);
  // iOS map markers with custom views are snapshotted once (tracksViewChanges=false).
  // When the shown categories / places / selection change, remount the marker layer and
  // let markers redraw briefly so added/removed pins actually appear on the map.
  const layerKey = useMemo(() => [...enabled].sort().join(','), [enabled]);
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    setTracking(true);
    const t = setTimeout(() => setTracking(false), 800);
    return () => clearTimeout(t);
  }, [layerKey, places, selected?.id, showEvents, eventPins]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return places
      .filter((p) => p.name.toLowerCase().includes(q) || CAT[p.cat].label.toLowerCase().includes(q))
      .sort((a, b) => dist(home, a) - dist(home, b))
      .slice(0, 8);
  }, [query, places, home]);

  const regionCenter = region ? { lat: region.latitude, lon: region.longitude } : null;

  // Address search (debounced): runs 350 ms after typing stops, for 3+ characters.
  const addrQ = query.trim();
  useEffect(() => {
    if (addrQ.length < 3) return undefined;
    let alive = true;
    const near = regionCenter || home;
    const t = setTimeout(() => {
      searchAddress(addrQ, near)
        .then((items) => alive && setAddr({ q: addrQ, items }))
        .catch(() => alive && setAddr({ q: addrQ, items: [], failed: true }));
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [addrQ]); // eslint-disable-line react-hooks/exhaustive-deps
  const addrItems = addrQ.length >= 3 && addr.q === addrQ ? addr.items : [];
  const addrSearching = addrQ.length >= 3 && addr.q !== addrQ;
  const addrFailed = addrQ.length >= 3 && addr.q === addrQ && addr.failed;
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
    const h = { id: 'home', name: p.fromSearch ? `Home · ${p.name}` : 'Home', lat: p.lat, lon: p.lon };
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
        showsPointsOfInterests={false}
        onRegionChangeComplete={setRegion}
        onPress={(e) => { if (e.nativeEvent.action !== 'marker-press') { setSelected(null); Keyboard.dismiss(); } }}
        onLongPress={(e) => {
          const { latitude, longitude } = e.nativeEvent.coordinate;
          setSelected({ id: 'pin', name: 'Dropped pin', lat: latitude, lon: longitude, cat: null, custom: true, tags: {} });
        }}
      >
        {visible.map((p) => (
          <Marker key={layerKey + ':' + p.id} coordinate={toLL(p)} onPress={() => setSelected(p)} tracksViewChanges={tracking}>
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
        {showEvents && eventPins.map((e) => (
          <Marker key={'ev' + e.id} coordinate={toLL(e)} tracksViewChanges={tracking}
            onPress={() => setSelected({ id: 'ev-' + e.id, name: e.title, lat: e.lat, lon: e.lon, cat: null, custom: false, event: e, tags: {} })}>
            <View style={[styles.pin, { backgroundColor: SOURCE[e.source]?.color || '#7048e8' }]}><Text style={styles.pinEmoji}>🎉</Text></View>
          </Marker>
        ))}
        {route && <Polyline coordinates={route.coords.map(toLL)} strokeWidth={6} strokeColor="#2979ff" />}
        {route && from && <Marker coordinate={toLL(from)} pinColor="#00c853" />}
        {route && to && <Marker coordinate={toLL(to)} pinColor="#d50000" />}
      </MapView>

      {/* ── Top: search + chips + route ── */}
      <View style={[styles.top, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <View style={styles.searchRow}>
          <TextInput
            style={styles.search}
            placeholder="Search places or addresses"
            placeholderTextColor="#888"
            value={query}
            onChangeText={setQuery}
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
          <TouchableOpacity
            style={styles.refreshBtn}
            disabled={loading}
            onPress={() => { Keyboard.dismiss(); loadPlaces(regionCenter || loadedAt); }}
            accessibilityLabel="Refresh nearby places"
          >
            {loading ? <ActivityIndicator /> : <Text style={styles.refreshText}>↻</Text>}
          </TouchableOpacity>
        </View>
        {(results.length > 0 || addrItems.length > 0 || addrSearching || addrFailed) && (
          <ScrollView style={styles.results} keyboardShouldPersistTaps="handled">
            {results.length > 0 && <Text style={styles.resultHead}>On the map</Text>}
            {results.map((p) => (
              <TouchableOpacity key={p.id} style={styles.resultRow} onPress={() => focus(p)}>
                <Text style={styles.resultName} numberOfLines={1}>{CAT[p.cat].emoji}  {p.name}</Text>
                <Text style={styles.resultDist}>{fmtDist(dist(home, p))}</Text>
              </TouchableOpacity>
            ))}
            {(addrItems.length > 0 || addrSearching || addrFailed) && (
              <Text style={styles.resultHead}>Addresses & places{addrSearching ? ' · searching…' : ''}</Text>
            )}
            {addrFailed && <Text style={styles.resultNote}>Address search isn’t reachable right now.</Text>}
            {addrItems.map((a) => (
              <TouchableOpacity key={a.id} style={styles.resultRow}
                onPress={() => focus({ ...a, cat: null, custom: true, fromSearch: true, tags: {} })}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultName} numberOfLines={1}>📍  {a.name}</Text>
                  {!!a.address && <Text style={styles.resultAddr} numberOfLines={1}>{a.address}</Text>}
                </View>
                <Text style={styles.resultDist}>{fmtDist(dist(home, a))}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
          {eventPins.length > 0 && (
            <TouchableOpacity onPress={() => setShowEvents((v) => !v)}
              style={[styles.chip, showEvents && { backgroundColor: '#7048e8', borderColor: '#7048e8' }]}>
              <Text style={[styles.chipText, showEvents && { color: '#fff' }]}>🎉 Events · {eventPins.length}</Text>
            </TouchableOpacity>
          )}
          {CATEGORIES.map((c) => {
            const on = enabled.has(c.key);
            return (
              <TouchableOpacity key={c.key} onPress={() => toggleCat(c.key)}
                style={[styles.chip, on && { backgroundColor: c.color, borderColor: c.color }]}>
                <Text style={[styles.chipText, on && { color: '#fff' }]}>{c.emoji} {c.label}{places.length ? ` · ${catCounts[c.key] || 0}` : ''}</Text>
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
        <View style={[styles.card, { paddingBottom: 14 }]}>
          <Text style={styles.cardTitle} numberOfLines={2}>{selCat ? selCat.emoji + '  ' : ''}{sel.name}</Text>
          <Text style={styles.cardSub}>
            {selCat ? selCat.label + ' · ' : ''}
            {sel.id === 'home' ? 'Your home' : `${fmtDist(dist(home, sel))} from home (straight line)`}
          </Text>
          {!!(sel.tags?.['addr:street']) && <Text style={styles.cardInfo}>📍 {sel.tags['addr:street']} {sel.tags['addr:housenumber'] || ''}</Text>}
          {!!sel.tags?.opening_hours && <Text style={styles.cardInfo}>🕒 {sel.tags.opening_hours}</Text>}
          {!!sel.event && (
            <Text style={styles.cardInfo}>
              🎉 {new Date(sel.event.start).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              {sel.event.location ? ' · ' + sel.event.location : ''}
            </Text>
          )}
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
              showsPointsOfInterests={false}
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
  refreshBtn: { marginLeft: 8, width: 44, height: 44, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow },
  refreshText: { fontSize: 22, color: '#111', fontWeight: '600' },
  search: { flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 16, color: '#111', ...shadow },
  results: { backgroundColor: '#fff', borderRadius: 12, marginTop: 6, maxHeight: 360, ...shadow },
  resultHead: { fontSize: 11, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 2 },
  resultAddr: { fontSize: 12, color: '#777', marginTop: 2, marginLeft: 26 },
  resultNote: { fontSize: 13, color: '#888', paddingHorizontal: 14, paddingVertical: 8 },
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
  searchArea: { alignSelf: 'center', backgroundColor: C.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginTop: 8 },
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