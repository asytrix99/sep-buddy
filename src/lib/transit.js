/**
 * Bus trips between home and Campus Valla (Östgötatrafiken) via Trafiklab's ResRobot v2.1
 * route planner — door to door from coordinates, so it includes the walk to the stop.
 *
 * Needs a free API key: trafiklab.se → create account → new project → add "ResRobot v2.1"
 * → copy the key into the app (Today → 🚌 → ⚙︎). Without a key the app offers a
 * Google Maps transit link instead.
 */
export const RESROBOT_KEY = ''; // optional: hard-code a key here instead of pasting it in the app

export const CAMPUS = { id: 'campus', name: 'Campus Valla', lat: 58.39779, lon: 15.57545 };

const pad = (n) => String(n).padStart(2, '0');
const at = (date, time) => (date && time ? new Date(`${date}T${time.length === 5 ? time + ':00' : time}`) : null);
const arr = (x) => (Array.isArray(x) ? x : x ? [x] : []);

/** "PT1H5M" → 65 */
function isoMinutes(s) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?/.exec(s || '');
  return m ? (+m[1] || 0) * 60 + (+m[2] || 0) : null;
}

/** Short line label: "12", "Tåg", … */
function lineOf(leg) {
  const p = arr(leg.Product)[0] || {};
  return String(p.num || leg.transportNumber || p.displayNumber || leg.number || p.name || leg.name || '').trim();
}

function parseTrip(t) {
  const legs = arr(t.LegList?.Leg).map((l) => {
    const dep = at(l.Origin?.date, l.Origin?.time);
    const arrT = at(l.Destination?.date, l.Destination?.time);
    const rtDep = at(l.Origin?.rtDate || l.Origin?.date, l.Origin?.rtTime);
    const rtArr = at(l.Destination?.rtDate || l.Destination?.date, l.Destination?.rtTime);
    return {
      type: l.type, // WALK | JNY | TRSF
      line: l.type === 'JNY' ? lineOf(l) : null,
      mode: (arr(l.Product)[0]?.catOutL || '').toLowerCase(),
      direction: l.direction || '',
      from: l.Origin?.name || '',
      to: l.Destination?.name || '',
      dep, arr: arrT,
      delayMin: rtDep && dep ? Math.round((rtDep - dep) / 60000) : 0,
      arrDelayMin: rtArr && arrT ? Math.round((rtArr - arrT) / 60000) : 0,
      dist: l.dist ? +l.dist : null,
    };
  });
  if (!legs.length) return null;
  const rides = legs.filter((l) => l.type === 'JNY');
  const first = legs[0];
  const last = legs[legs.length - 1];
  return {
    leave: first.dep, // when to leave the door
    arrive: last.arr,
    rides,
    firstRide: rides[0] || null,
    changes: Math.max(0, rides.length - 1),
    minutes: isoMinutes(t.duration) ?? (last.arr && first.dep ? Math.round((last.arr - first.dep) / 60000) : null),
    walkMin: legs.filter((l) => l.type === 'WALK' && l === first).reduce((a, l) => a + (l.arr && l.dep ? Math.round((l.arr - l.dep) / 60000) : 0), 0),
    delayMin: rides[0]?.delayMin || 0,
  };
}

const BASE = 'https://api.resrobot.se/v2.1';
const WALK_M_PER_MIN = 80;

/** GET a ResRobot endpoint; turns its error codes into readable messages. */
async function rr(path, params, key) {
  const qs = Object.entries({ ...params, format: 'json', accessId: key }).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${BASE}/${path}?${qs}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    const j = await res.json().catch(() => ({}));
    if (j.errorCode === 'API_AUTH' || res.status === 401 || res.status === 403) throw new Error('the Trafiklab key was refused — check it, and that the project has ResRobot v2.1 added');
    if (j.errorCode) {
      const e = new Error(j.errorText || j.errorCode);
      e.code = j.errorCode;
      throw e;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return j;
  } catch (e) {
    if (e?.name === 'AbortError' || /cancel|abort/i.test(e?.message || '')) throw new Error('journey planner too slow');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Nearest stops to a point (closest first): [{ id, name, lat, lon, dist }]. */
export async function nearbyStops(p, key, radius = 1500) {
  const j = await rr('location.nearbystops', { originCoordLat: p.lat, originCoordLong: p.lon, r: radius, maxNo: 5 }, key);
  // The docs show both shapes: { StopLocation: [...] } and { stopLocationOrCoordLocation: [{ StopLocation }] }.
  const list = [...arr(j.StopLocation), ...arr(j.stopLocationOrCoordLocation).map((x) => x.StopLocation).filter(Boolean)];
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const metres = (s) => {
    const x = rad(s.lon - p.lon) * Math.cos(rad((s.lat + p.lat) / 2));
    const y = rad(s.lat - p.lat);
    return Math.round(Math.hypot(x, y) * R);
  };
  return list
    .map((s) => ({ id: s.extId || s.id, name: s.name, lat: +s.lat, lon: +s.lon, dist: s.dist != null ? +s.dist : metres({ lat: +s.lat, lon: +s.lon }) }))
    .filter((s) => s.id)
    .sort((a, b) => a.dist - b.dist);
}

const whenParams = (when) => ({
  date: `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`,
  time: `${pad(when.getHours())}:${pad(when.getMinutes())}`,
});

/** Trips between two stops, with the walk from the door / to the destination added on. */
async function tripsViaStops(from, to, key, when, count) {
  const find = async (p) => {
    let stops = await nearbyStops(p, key, 1500).catch(() => []);
    if (!stops.length) stops = await nearbyStops(p, key, 5000);
    if (!stops.length) throw new Error(`no bus stops found near ${p.name || 'that place'}`);
    return stops[0];
  };
  const [a, b] = await Promise.all([find(from), find(to)]);
  const walkA = Math.ceil(a.dist / WALK_M_PER_MIN);
  const walkB = Math.ceil(b.dist / WALK_M_PER_MIN);
  // Ask for buses leaving after you could reach the stop.
  const j = await rr('trip', { originId: a.id, destId: b.id, ...whenParams(new Date(when.getTime() + walkA * 60000)), numF: count, numB: 0 }, key);
  return arr(j.Trip).map(parseTrip).filter(Boolean).filter((t) => t.leave && t.arrive).map((t) => {
    const leave = new Date(t.leave.getTime() - walkA * 60000);
    const arrive = new Date(t.arrive.getTime() + walkB * 60000);
    return { ...t, leave, arrive, minutes: Math.round((arrive - leave) / 60000), walkMin: walkA };
  });
}

/**
 * Next trips from → to (default: leaving now). Plans door-to-door from coordinates; if the planner
 * can't match a point to a stop (HAFAS error H9220 and friends) it looks the stops up itself.
 * Throws Error with a readable message.
 */
export async function fetchTrips(from, to, key, { when = new Date(), count = 4 } = {}) {
  if (!key) throw new Error('no key');
  try {
    const j = await rr('trip', {
      originCoordLat: from.lat, originCoordLong: from.lon, destCoordLat: to.lat, destCoordLong: to.lon,
      ...whenParams(when), numF: count, numB: 0,
    }, key);
    const trips = arr(j.Trip).map(parseTrip).filter(Boolean).filter((t) => t.leave && t.arrive);
    if (trips.length) return trips;
  } catch (e) {
    if (/refused|too slow/.test(e.message)) throw e; // key problem / timeout: no point retrying
  }
  return tripsViaStops(from, to, key, when, count);
}

/** Google Maps public-transport directions (works without any key). */
export const transitLink = (from, to) =>
  `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lon}&destination=${to.lat},${to.lon}&travelmode=transit`;
