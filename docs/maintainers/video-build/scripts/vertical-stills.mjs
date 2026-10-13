// Renders one still per trailer shot (75% of the way through) for a composition, to check framing.
// Usage: node scripts/vertical-stills.mjs TrailerVertical out/stills/vv
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const [comp = 'TrailerVertical', prefix = 'out/stills/vv', scale = '0.3'] = process.argv.slice(2);
const vo = JSON.parse(readFileSync('src/vo.json', 'utf8')).lines;
const mins = [...readFileSync('src/Trailer.tsx', 'utf8').matchAll(/min: ([0-9.]+)/g)].map(m => Number(m[1]));
let t = 0;
mins.forEach((m, i) => {
  const frames = Math.round(Math.max(m, vo[i] ? 0.45 + vo[i].seconds + 0.6 : 0) * 30);
  const fr = t + Math.round(frames * 0.75);
  execFileSync('npx', ['remotion', 'still', comp, `${prefix}${String(i).padStart(2, '0')}.png`, `--frame=${fr}`, `--scale=${scale}`, '--log=error'], { stdio: 'inherit' });
  t += frames;
});
console.log('done');
