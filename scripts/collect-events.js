/**
 * Collects student events into events.json (read by the Events tab).
 *
 *   node scripts/collect-events.js
 *
 * Runs every morning on GitHub Actions (.github/workflows/events.yml), so the app always
 * has fresh events without her phone doing any scraping.
 *
 * Where events come from:
 *  1. data/event-sources.json — feeds per club (iCal, WordPress "The Events Calendar" API,
 *     or any web page with schema.org Event data). Feeds that fail are listed in the
 *     "sources" section of events.json and in the Actions log — they never break the run.
 *  2. data/events-manual.json — events you type in by hand (for clubs that only post on
 *     Instagram/Facebook, e.g. a sittning from M-sektionen or an FR Ryd barbecue).
 *
 * Locations get map coordinates from OpenStreetMap Nominatim (cached in data/geocode-cache.json),
 * so events can be shown and routed to on the Map tab.
 * No npm packages needed (Node 20+).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const DATA = path.join(root, 'data');
const UA = 'RydWalker-events/1.0 (student app; github actions)';
const DAYS_AHEAD = 240; // far enough to cover a whole spring term
const readJson = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; } };

// ---------- iCal (same rules as src/lib/ical.js) ----------
function parseIcsDate(value, params = '') {
  const v = value.trim();
  if (/VALUE=DATE(?!-)/.test(params) || /^\d{8}$/.test(v)) return { iso: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T00:00:00`, allDay: true };
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s = '00', z] = m;
  // Floating / TZID times are Swedish local time; keep them as local ISO (no Z) so the phone reads them as local.
  return { iso: z ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)).toISOString() : `${y}-${mo}-${d}T${h}:${mi}:${s}`, allDay: false };
}
function parseIcs(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const un = (v) => v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();
  const out = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') { if (cur?.start) out.push(cur); cur = null; continue; }
    if (!cur) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const [name, ...p] = line.slice(0, i).split(';');
    const val = line.slice(i + 1);
    const params = p.join(';');
    switch (name.toUpperCase()) {
      case 'UID': cur.uid = val.trim(); break;
      case 'SUMMARY': cur.title = un(val); break;
      case 'LOCATION': cur.location = un(val); break;
      case 'DESCRIPTION': cur.description = un(val); break;
      case 'URL': cur.url = val.trim(); break;
      case 'DTSTART': { const d = parseIcsDate(val, params); if (d) { cur.start = d.iso; cur.allDay = d.allDay; } break; }
      case 'DTEND': { const d = parseIcsDate(val, params); if (d) cur.end = d.iso; break; }
      default:
    }
  }
  return out;
}

// ---------- WordPress "The Events Calendar" REST API ----------
function parseTribe(json) {
  const strip = (h) => (h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  return (json.events || []).map((e) => ({
    uid: String(e.id),
    title: strip(e.title),
    start: (e.start_date || '').replace(' ', 'T'),
    end: (e.end_date || '').replace(' ', 'T'),
    allDay: !!e.all_day,
    location: [e.venue?.venue, e.venue?.address].filter(Boolean).join(', '),
    lat: e.venue?.geo_lat ? +e.venue.geo_lat : undefined,
    lon: e.venue?.geo_lng ? +e.venue.geo_lng : undefined,
    url: e.url,
    description: strip(e.excerpt || e.description).slice(0, 400),
  }));
}

// ---------- schema.org Event JSON-LD embedded in a web page ----------
function parseJsonLd(html) {
  const out = [];
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    const type = [].concat(node['@type'] || []);
    if (type.some((t) => /Event$/.test(t)) && node.startDate) {
      const loc = node.location || {};
      out.push({
        uid: node['@id'] || node.url || node.name + node.startDate,
        title: node.name, start: node.startDate, end: node.endDate,
        location: [loc.name, typeof loc.address === 'string' ? loc.address : loc.address?.streetAddress].filter(Boolean).join(', '),
        lat: loc.geo?.latitude ? +loc.geo.latitude : undefined, lon: loc.geo?.longitude ? +loc.geo.longitude : undefined,
        url: node.url, description: (node.description || '').slice(0, 400),
      });
    }
    if (node['@graph']) visit(node['@graph']);
  };
  for (const b of blocks) { try { visit(JSON.parse(b)); } catch { /* skip broken block */ } }
  return out;
}

// ---------- Ticketmaster Discovery API (concerts, shows, sport in/around Linköping) ----------
// Free key: https://developer.ticketmaster.com → "Get your API key". Put it in the
// TICKETMASTER_API_KEY environment variable (a GitHub Actions secret of the same name).
// Without a key this source is skipped and listed as failed in events.json → sources.
async function fromTicketmaster(src) {
  const key = process.env.TICKETMASTER_API_KEY;
  if (!key) throw new Error('no TICKETMASTER_API_KEY set');
  const u = new URL('https://app.ticketmaster.com/discovery/v2/events.json');
  u.search = new URLSearchParams({
    apikey: key, countryCode: 'SE', latlong: src.latlong || '58.4108,15.6214', radius: String(src.radiusKm || 20), unit: 'km',
    size: '100', sort: 'date,asc', locale: '*',
  }).toString();
  const j = await (await get(u.toString(), 'application/json')).json();
  return (j._embedded?.events || []).map((e) => {
    const v = e._embedded?.venues?.[0] || {};
    const d = e.dates?.start || {};
    const kind = e.classifications?.[0]?.segment?.name;
    return {
      uid: 'tm-' + e.id,
      title: e.name,
      start: d.dateTime && !d.localTime ? d.dateTime : `${d.localDate}T${(d.localTime || '00:00:00').slice(0, 8)}`,
      allDay: !d.localTime && !d.dateTime,
      location: [v.name, v.address?.line1].filter(Boolean).join(', '),
      lat: v.location?.latitude ? +v.location.latitude : undefined,
      lon: v.location?.longitude ? +v.location.longitude : undefined,
      url: e.url,
      description: [kind && kind !== 'Undefined' ? kind : null, e.info || e.pleaseNote].filter(Boolean).join(' · ').slice(0, 400),
    };
  }).filter((e) => e.start && !e.start.startsWith('undefined'));
}

// ---------- studentlivet.se (Linköping student events, mirrored from Orbi) ----------
// The public events page lists ~4 weeks of events from student houses, unions, sections and
// clubs, each as <a class="event-link" data-title=… data-start-ms=…>. Fetched once a day.
const decode = (s) => (s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const FAR_AWAY = /Norrköping|Örat|Trappan|\bKY\d|Kåkenhus/i; // Campus Norrköping — too far from Ryd

/** Which app source an organiser/venue belongs to. */
function studentSource(org, loc) {
  const both = `${org} ${loc}`;
  if (/Ryds Herrg|Lill-Lördagspub/i.test(both)) return 'hg';
  if (/^LinTek$/i.test(org)) return 'lintek';
  if (/Maskinteknolog|M-sektionen/i.test(org)) return 'msek';
  if (/FR Ryd/i.test(org)) return 'frryd';
  if (/\bISA\b|International Students|\bESN\b/.test(org)) return 'intl';
  if (/Kårallen|Kollektivet|Kårservice|VilleValla/i.test(both)) return 'karhus';
  return 'other';
}

// Venue names Nominatim doesn't know → searchable addresses (all in Linköping).
const VENUES = {
  'kårhus ryds herrgård': 'Ryds Herrgård, Linköping',
  'kårhus kårallen': 'Kårallen, Linköping',
  'kårhuset kollektivet': 'Kollektivet, Linköping',
};

function parseStudentlivet(page) {
  const out = [];
  for (const m of page.matchAll(/<a [^>]*class="event-link"[^>]*>/g)) {
    const a = {};
    for (const [, k, v] of m[0].matchAll(/data-([a-z-]+)="([^"]*)"/g)) a[k] = decode(v).trim();
    const start = +a['start-ms'];
    if (!a.title || !start) continue;
    const org = a.organizer || '';
    const loc = a.location || '';
    if (FAR_AWAY.test(`${org} ${loc}`)) continue;
    const end = +a['end-ms'];
    out.push({
      uid: `sl-${start}-${a.title}`,
      source: studentSource(org, loc),
      title: a.title,
      start: new Date(start).toISOString(),
      end: end > start ? new Date(end).toISOString() : undefined,
      location: loc,
      geocodeAs: VENUES[loc.toLowerCase()],
      // Room codes like "C1" / "Sh62" or just "Linköping" would land on a random city-centre point.
      noGeocode: !VENUES[loc.toLowerCase()] && !/\s/.test(loc),
      url: a['external-link'] || a['location-link'] || 'https://studentlivet.se/events/',
      description: [org && `By ${org}`, a.description].filter(Boolean).join(' · ').replace(/\s+/g, ' ').slice(0, 400),
    });
  }
  return out;
}

async function get(url, accept) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res;
}

async function fromSource(src) {
  if (src.type === 'ical') return parseIcs(await (await get(src.url, 'text/calendar')).text());
  if (src.type === 'wp-tribe') return parseTribe(await (await get(src.url, 'application/json')).json());
  if (src.type === 'jsonld') return parseJsonLd(await (await get(src.url, 'text/html')).text());
  if (src.type === 'ticketmaster') return fromTicketmaster(src);
  if (src.type === 'studentlivet') return parseStudentlivet(await (await get(src.url, 'text/html')).text());
  throw new Error('unknown type ' + src.type);
}

// ---------- geocoding (Nominatim, max 1 request/second, cached) ----------
const geoCacheFile = path.join(DATA, 'geocode-cache.json');
const geoCache = readJson(geoCacheFile, {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function geocode(q) {
  const key = q.toLowerCase().trim();
  if (key in geoCache) return geoCache[key];
  await sleep(1100);
  try {
    // Bounded to the Linköping area so "Kårallen" or "Rydsvägen 254" resolve locally.
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&bounded=1&viewbox=15.45,58.46,15.75,58.36&q=' + encodeURIComponent(q);
    const j = await (await get(url, 'application/json')).json();
    geoCache[key] = j[0] ? { lat: +j[0].lat, lon: +j[0].lon } : null;
  } catch {
    return null; // don't cache network failures
  }
  return geoCache[key];
}

const slug = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

async function main() {
  const config = readJson(path.join(DATA, 'event-sources.json'), { feeds: [] });
  const sources = config.feeds.filter((f) => f.enabled !== false);
  const win = config.window; // { from, to } 'YYYY-MM-DD' — optional
  const manual = readJson(path.join(DATA, 'events-manual.json'), { events: [] }).events;
  const report = {};
  const all = [];

  for (const src of sources) {
    process.stdout.write(`${src.source} (${src.type}) ${src.url || "API"} … `);
    try {
      const evs = await fromSource(src);
      evs.forEach((e) => all.push({ ...e, source: e.source || src.source }));
      report[src.source + ':' + src.type] = { ok: true, count: evs.length };
      console.log(`${evs.length} events`);
    } catch (e) {
      report[src.source + ':' + src.type] = { ok: false, error: e.message };
      console.log('failed (' + e.message + ')');
    }
  }
  manual.forEach((e) => all.push({ ...e, source: e.source || 'other', manual: true }));
  report.manual = { ok: true, count: manual.length };

  const now = Date.now();
  const horizon = now + DAYS_AHEAD * 86400000;
  const seen = new Set();
  const events = [];
  for (const e of all) {
    if (!e.title || !e.start) continue;
    const t = new Date(e.start).getTime();
    const tEnd = e.end ? new Date(e.end).getTime() : t;
    if (Number.isNaN(t) || tEnd < now - 86400000 || t > horizon) continue;
    if (win && (new Date(tEnd).toISOString().slice(0, 10) < win.from || e.start.slice(0, 10) > win.to)) continue;
    const id = `${e.source}-${slug(e.title)}-${e.start.slice(0, 10)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const ev = { id, source: e.source, title: e.title, start: e.start, end: e.end || null, allDay: !!e.allDay, location: e.location || '', url: e.url || '', description: e.description || '' };
    if (e.lat != null && e.lon != null) Object.assign(ev, { lat: e.lat, lon: e.lon });
    else if (!e.noGeocode && (e.geocodeAs || ev.location)) {
      const q = e.geocodeAs || (ev.location.includes('Linköping') ? ev.location : ev.location + ', Linköping');
      Object.assign(ev, (await geocode(q)) || {});
    }
    events.push(ev);
  }
  events.sort((a, b) => new Date(a.start) - new Date(b.start));

  fs.writeFileSync(geoCacheFile, JSON.stringify(geoCache, null, 1));
  fs.writeFileSync(path.join(root, 'events.json'), JSON.stringify({ updatedAt: new Date().toISOString(), sources: report, events }, null, 1));
  console.log(`\nWrote ${events.length} upcoming events to events.json`);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { parseIcs, parseTribe, parseJsonLd, parseStudentlivet };
