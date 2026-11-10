/**
 * Draws the app icon and splash image from the mascot in src/components/brand/buddyMarkup.js.
 *
 *   npx -y -p @resvg/resvg-js@2.6.2 node scripts/make-icons.js   (or with resvg-js installed)
 *
 * Writes assets/brand/*.svg (the sources) and assets/icon.png + assets/splash-icon.png.
 * Changing the icon is a NATIVE change: bump the version and run scripts/release-ipa.sh.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const markup = fs.readFileSync(path.join(root, 'src/components/brand/buddyMarkup.js'), 'utf8');
const BUDDY = /`([\s\S]*?)`/.exec(markup)[1];

const star = (x, y, s, o = 0.9) =>
  `<path d="M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s} Z" fill="#ffffff" opacity="${o}"/>`;

const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#a6dcfb"/>
      <stop offset="1" stop-color="#4ea6e6"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#sky)"/>
  <g fill="#ffffff" opacity="0.45">
    <circle cx="150" cy="960" r="170"/><circle cx="360" cy="1010" r="150"/>
    <circle cx="700" cy="1000" r="150"/><circle cx="900" cy="950" r="180"/>
  </g>
  ${star(200, 250, 34)}${star(840, 300, 26)}${star(170, 600, 20, 0.7)}${star(860, 640, 30, 0.8)}
  <ellipse cx="512" cy="880" rx="130" ry="24" fill="#0f2a3f" opacity="0.14"/>
  <g transform="translate(512 512) scale(0.86) translate(-512 -470)">${BUDDY}</g>
</svg>`;

const splash = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <ellipse cx="512" cy="900" rx="140" ry="26" fill="#0f2a3f" opacity="0.10"/>
  <g transform="translate(0 30)">${BUDDY}</g>
</svg>`;

const { Resvg } = require('@resvg/resvg-js');
const out = (name, svg) => {
  fs.mkdirSync(path.join(root, 'assets/brand'), { recursive: true });
  fs.writeFileSync(path.join(root, 'assets/brand', name + '.svg'), svg);
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1024 } }).render().asPng();
  fs.writeFileSync(path.join(root, 'assets', name === 'icon' ? 'icon.png' : 'splash-icon.png'), png);
  console.log('wrote', name);
};
out('icon', icon);
out('splash', splash);
