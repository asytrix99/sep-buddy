/**
 * Map data + geo helpers for the Map tab (moved here unchanged from the old App.js).
 *  - Amenities: OpenStreetMap (Overpass API, free, no key)
 *  - Walking routes: OSRM foot profile at routing.openstreetmap.de (free, no key)
 *  - Street photos: Mapillary (free token)
 * Pure JS (no React Native imports) so scripts/snapshot-places.js can reuse it.
 */
// ───────────────────────── SETTINGS ─────────────────────────
// 1) Paste your free Mapillary client token here (starts with "MLY|").
//    Get it at https://www.mapillary.com/dashboard/developers → Register application.
//    Leave empty and the walk-through still works, with "Street View here" buttons instead of photos.
export const MAPILLARY_TOKEN = 'MLY|29590325143895353|5451ddafae2bd2746728fbb8580c9c6f';

// 2) Default home. Ryd, Linköping — long-press your exact building in the app and tap
//    "Set as Home" (now saved on the phone), or put your building's coordinates here.
export const HOME_DEFAULT = { id: 'home', name: 'Home · Rydsvägen', lat: 58.40889, lon: 15.5625 };

export const RADIUS_M = 2000; // how far around the centre to look for amenities
// ────────────────────────────────────────────────────────────

export const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
// Overpass servers reject requests without an identifying User-Agent (HTTP 406).
export const OVERPASS_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  Accept: 'application/json',
  'User-Agent': 'RydWalker/1.0 (Expo student map app)',
};
export const OVERPASS_TIMEOUT_MS = 30000; // per server (busy servers drop the connection at ~32 s anyway)
export const OVERPASS_STAGGER_MS = 6000; // start the next server if no answer yet
export const ROUTER = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot';

export const CATEGORIES = [
  { key: 'grocery', label: 'Groceries', emoji: '🛒', color: '#2e7d32', f: [['shop', 'supermarket|convenience|greengrocer|bakery|butcher']] },
  { key: 'food', label: 'Food & café', emoji: '🍜', color: '#ef6c00', f: [['amenity', 'restaurant|cafe|fast_food|pub|bar|food_court']] },
  { key: 'transport', label: 'Bus & train', emoji: '🚌', color: '#1565c0', f: [['highway', 'bus_stop'], ['railway', 'station|halt'], ['amenity', 'bicycle_rental|bus_station']] },
  { key: 'health', label: 'Health', emoji: '💊', color: '#c62828', f: [['amenity', 'pharmacy|doctors|clinic|hospital|dentist'], ['shop', 'chemist']] },
  { key: 'study', label: 'Campus & library', emoji: '📚', color: '#6a1b9a', f: [['amenity', 'library|university|college']] },
  { key: 'fitness', label: 'Gym & sport', emoji: '🏋️', color: '#00838f', f: [['leisure', 'fitness_centre|sports_centre|swimming_pool|sports_hall']] },
  { key: 'services', label: 'ATM & post', emoji: '📮', color: '#5d4037', f: [['amenity', 'atm|bank|post_office|parcel_locker|bureau_de_change']] },
  { key: 'shops', label: 'Shops', emoji: '🛍️', color: '#ad1457', f: [['shop', 'mall|department_store|clothes|electronics|hardware|second_hand|variety_store|doityourself|furniture|mobile_phone|sports|bicycle|charity']] },
];
export const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));
export const CAT_RX = CATEGORIES.map((c) => ({ key: c.key, f: c.f.map(([k, v]) => [k, new RegExp(`^(${v})$`)]) }));
export const DEFAULT_ON = ['grocery', 'food', 'transport', 'health', 'study'];

// ───────────────────────── geo helpers ─────────────────────────
export const R = 6371000;
export const toRad = (d) => (d * Math.PI) / 180;
export const toDeg = (r) => (r * 180) / Math.PI;
export const toLL = (p) => ({ latitude: p.lat, longitude: p.lon });

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
export const fmtDist = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
export const fmtTime = (s) => {
  const m = Math.max(1, Math.round(s / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
export const compassWord = (b) => ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(b / 45) % 8];
export const pretty = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : 'Place');

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
export function classify(tags) {
  for (const c of CAT_RX) for (const [k, rx] of c.f) if (tags[k] && rx.test(tags[k])) return c.key;
  return null;
}

export function buildOverpassQuery(c) {
  // One bounding box + one regex per tag key is far cheaper for the server than
  // a separate "around" search per category (which was timing out).
  const byKey = {};
  CATEGORIES.forEach((cat) => cat.f.forEach(([k, v]) => { byKey[k] = byKey[k] ? `${byKey[k]}|${v}` : v; }));
  const dLat = RADIUS_M / 111320;
  const dLon = RADIUS_M / (111320 * Math.cos((c.lat * Math.PI) / 180));
  const bbox = [c.lat - dLat, c.lon - dLon, c.lat + dLat, c.lon + dLon].map((x) => x.toFixed(5)).join(',');
  const lines = Object.entries(byKey).map(([k, v]) => `nwr["${k}"~"^(${v})$"];`);
  return `[out:json][timeout:25][bbox:${bbox}];(${lines.join('')});out center;`;
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

/**
 * Download places around `center`. The free Overpass servers are often overloaded, so they're
 * tried as a staggered race: the next server starts if the previous hasn't answered within a few
 * seconds (or failed), and the first good answer wins. Gentler than hitting all at once,
 * much faster than waiting for each one to time out in turn.
 */
function fetchOverpass(center) {
  const body = 'data=' + encodeURIComponent(buildOverpassQuery(center));
  const ctrls = OVERPASS.map(() => new AbortController());
  const timers = [];
  const cleanup = () => { timers.forEach(clearTimeout); ctrls.forEach((c) => c.abort()); };

  return new Promise((resolve, reject) => {
    let failed = 0;
    let lastErr = null;
    let done = false;
    let next = 0;

    const fail = (e) => {
      lastErr = e;
      if (++failed === OVERPASS.length && !done) { done = true; cleanup(); reject(lastErr); } else launch(); // failed fast → start the next one now
    };
    const launch = () => {
      if (done || next >= OVERPASS.length) return;
      const i = next++;
      timers.push(setTimeout(() => ctrls[i].abort(), OVERPASS_TIMEOUT_MS));
      timers.push(setTimeout(launch, OVERPASS_STAGGER_MS)); // still waiting → also try the next server
      fetch(OVERPASS[i], { method: 'POST', headers: OVERPASS_HEADERS, body, signal: ctrls[i].signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(res.status === 429 || res.status >= 500 ? 'servers busy' : 'HTTP ' + res.status);
          const places = parseOverpass(await res.json());
          if (!done) { done = true; cleanup(); resolve(places); }
        })
        .catch((e) => {
          if (done) return;
          // iOS reports an aborted fetch as "Fetch request has been canceled".
          const slow = e?.name === 'AbortError' || /cancel|abort/i.test(e?.message || '');
          fail(slow ? new Error('servers too slow') : e?.message === 'fetch failed' || /network/i.test(e?.message || '') ? new Error('servers busy') : e);
        });
    };
    launch();
  });
}

// ── Backup: Photon (photon.komoot.io), a fast OpenStreetMap search. It returns fewer places than
// Overpass, so it's only used when every Overpass server is busy — the map is never left empty.
const PHOTON = 'https://photon.komoot.io/reverse';
const PHOTON_TYPE = { N: 'node', W: 'way', R: 'relation' };

async function fetchJson(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': OVERPASS_HEADERS['User-Agent'] }, signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function fetchPhoton(center) {
  // One request per category, each listing that category's OpenStreetMap tags.
  const results = await Promise.allSettled(CATEGORIES.map((cat) => {
    const tags = cat.f.flatMap(([k, v]) => v.split('|').map((x) => `osm_tag=${encodeURIComponent(`${k}:${x}`)}`));
    return fetchJson(`${PHOTON}?lat=${center.lat}&lon=${center.lon}&radius=${RADIUS_M / 1000}&limit=50&${tags.join('&')}`, 15000);
  }));
  if (results.every((r) => r.status === 'rejected')) throw results[0].reason;
  const seen = new Set();
  const out = [];
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    for (const f of r.value.features || []) {
      const p = f.properties || {};
      const [lon, lat] = f.geometry?.coordinates || [];
      const id = (PHOTON_TYPE[p.osm_type] || 'node') + p.osm_id;
      if (lat == null || seen.has(id)) continue;
      seen.add(id);
      const tags = { [p.osm_key]: p.osm_value, ...(p.name && { name: p.name }), ...(p.street && { 'addr:street': p.street }), ...(p.housenumber && { 'addr:housenumber': p.housenumber }) };
      out.push({ id, lat, lon, cat: classify(tags) || CATEGORIES[i].key, tags, name: p.name || pretty(p.osm_value) });
    }
  });
  return out;
}

/**
 * Places around `center`: { places, partial }. Full data from Overpass when a server answers.
 * If Overpass hasn't answered after BASIC_AFTER_MS, basic places are fetched from Photon and
 * handed to `onBasic` straight away (so the map fills in fast) while Overpass keeps trying.
 * If Overpass fails completely, the Photon places are returned with partial: true.
 */
const BASIC_AFTER_MS = 8000;
export async function fetchAmenities(center, { onBasic } = {}) {
  let overpassDone = false;
  let basic = null;
  const basicTimer = setTimeout(() => {
    basic = fetchPhoton(center)
      .then((places) => { if (!overpassDone && places.length) onBasic?.(places); return places; })
      .catch(() => []);
  }, BASIC_AFTER_MS);
  try {
    const places = await fetchOverpass(center);
    return { places, partial: false };
  } catch (e) {
    clearTimeout(basicTimer);
    const places = await (basic || fetchPhoton(center).catch(() => []));
    if (places.length) return { places, partial: true, reason: e.message };
    throw e;
  } finally {
    overpassDone = true;
    clearTimeout(basicTimer);
  }
}

/**
 * Address / place search (like the Google Maps search box) via Photon. `near` biases results
 * towards where you're looking. Returns [{ id, name, address, lat, lon }].
 */
export async function searchAddress(q, near) {
  const bias = near ? `&lat=${near.lat}&lon=${near.lon}&location_bias_scale=0.1&zoom=12` : '';
  const j = await fetchJson(`https://photon.komoot.io/api?q=${encodeURIComponent(q)}&limit=12&lang=en${bias}`, 8000);
  const seen = new Set();
  return (j.features || []).map((f) => {
    const p = f.properties || {};
    const [lon, lat] = f.geometry?.coordinates || [];
    const street = [p.street, p.housenumber].filter(Boolean).join(' ');
    const name = p.name || street || p.city || 'Place';
    const address = [p.name && street !== p.name ? street : null, [p.postcode, p.city || p.town || p.village].filter(Boolean).join(' '), p.country !== 'Sweden' ? p.country : null]
      .filter(Boolean).join(', ');
    return { id: `addr-${p.osm_type}${p.osm_id}`, name, address, lat, lon };
  }).filter((r) => r.lat != null && !seen.has(r.id) && seen.add(r.id))
    // Photon favours exact name matches anywhere in Sweden; put results within 30 km first.
    .map((r, i) => ({ r, i, far: near && dist(near, r) > 30000 ? 1 : 0 }))
    .sort((a, b) => a.far - b.far || a.i - b.i)
    .map((x) => x.r)
    .slice(0, 7);
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

export async function getRoute(a, b) {
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

export async function findPhoto(p, token) {
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

export const streetViewUrl = (p) =>
  `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.lat},${p.lon}${p.heading != null ? `&heading=${Math.round(p.heading)}` : ''}`;
