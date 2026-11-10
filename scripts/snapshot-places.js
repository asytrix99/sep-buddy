/**
 * Saves the amenities around HOME_DEFAULT to places-snapshot.json so the app shows
 * pins instantly, even when the free Overpass servers are slow or down.
 *
 * Run from the ryd-map folder:  node scripts/snapshot-places.js
 * (Re-run it if you change HOME_DEFAULT, RADIUS_M or the CATEGORIES in src/lib/geo.js.)
 *
 * It reuses the query/parse code from src/lib/geo.js, so the snapshot always matches the app.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
// geo.js is plain JS with `export` keywords and no imports — strip the exports and evaluate it.
const src = fs.readFileSync(path.join(root, 'src', 'lib', 'geo.js'), 'utf8').replace(/^export /gm, '');
const { HOME_DEFAULT, OVERPASS, OVERPASS_HEADERS, buildOverpassQuery, parseOverpass } =
  new Function(`${src}\nreturn { HOME_DEFAULT, OVERPASS, OVERPASS_HEADERS, buildOverpassQuery, parseOverpass };`)();

async function main() {
  const body = 'data=' + encodeURIComponent(buildOverpassQuery(HOME_DEFAULT));
  for (const ep of OVERPASS) {
    process.stdout.write(`Trying ${ep} … `);
    try {
      const res = await fetch(ep, { method: 'POST', headers: OVERPASS_HEADERS, body, signal: AbortSignal.timeout(180000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const places = parseOverpass(await res.json());
      if (!places.length) throw new Error('no places returned');
      fs.writeFileSync(path.join(root, 'places-snapshot.json'), JSON.stringify(places));
      console.log(`saved ${places.length} places to places-snapshot.json`);
      return;
    } catch (e) {
      console.log('failed (' + e.message + ')');
    }
  }
  console.error('All Overpass servers failed — try again in a few minutes.');
  process.exit(1);
}
main();
