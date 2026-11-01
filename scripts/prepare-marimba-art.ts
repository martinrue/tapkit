/** Original vector layers: exact bar geometry is shared with the playable controls. */
import { writeFile } from 'node:fs/promises';
import { themeIds } from '../src/shared/model';
import { marimbaBar, marimbaMaterials } from '../src/shared/marimba';

for (const theme of themeIds) {
  const m = marimbaMaterials[theme], flat = theme === 'cartoon', paper = theme === 'paper';
  const stroke = flat ? 3 : paper ? 1.2 : .8;
  const gradient = (id: string, light: string, face: string, dark: string) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2=".25"><stop stop-color="${light}"/><stop offset=".2" stop-color="${face}"/><stop offset=".35" stop-color="${light}"/><stop offset=".55" stop-color="${face}"/><stop offset="1" stop-color="${dark}"/></linearGradient>`;
  const fill = (name: string, colour: string) => flat ? colour : `url(#${name})`;
  const definitions = `<defs>${gradient('frame', m.frameLight, m.frame, paper ? '#bcbab5' : m.edge)}${gradient('tube', m.tube, m.tubeLight, m.tube)}${gradient('bar', m.light, m.face, m.dark)}${gradient('raised', m.raisedLight, m.raised, m.raisedDark)}
    <pattern id="grain" width="42" height="65" patternUnits="userSpaceOnUse"><path d="M7 0Q3 18 9 33T7 65M23 0Q29 20 22 41T23 65M36 0Q31 23 38 42T36 65" fill="none" stroke="${m.dark}" opacity=".3" stroke-width=".65"/></pattern>
    <pattern id="sketch" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M-1 1L1-1M0 8L8 0M7 9L9 7" stroke="#333" stroke-width=".5" opacity=".28"/></pattern></defs>`;
  const tubes = Array.from({ length: 15 }, (_, slot) => {
    const x = 61 + slot * 35, bottom = 362 - slot * 3.2;
    return `<g><rect x="${x - 10}" y="224" width="20" height="${bottom - 224}" rx="9" fill="${fill('tube', m.tubeLight)}" stroke="${m.edge}" stroke-width="${stroke}"/>
      <ellipse cx="${x}" cy="225" rx="9" ry="3" fill="${m.edge}"/><path d="M${x - 5} 238V${bottom - 12}" stroke="${m.tubeLight}" stroke-width="2" opacity=".65"/>
      ${paper ? `<path d="M${x - 8} 244V${bottom - 8}" stroke="#555" stroke-dasharray="3 3" stroke-width=".6"/>` : ''}</g>`;
  }).join('');
  const frame = `<g stroke="${m.edge}" stroke-width="${stroke}" stroke-linejoin="round">
    <path d="M51 143H529V156H51Z" fill="${fill('frame', m.frame)}"/>
    <path d="M52 151L43 188H55L64 151Z M518 151L563 188H579L531 151Z" fill="${fill('frame', m.frame)}"/>
    <path d="M54 145H526" stroke="${m.frameLight}" stroke-width="2" opacity=".8"/>
    <path d="M31 181L45 177 55 347 44 356 31 351Z" fill="${fill('frame', m.frame)}"/>
    <path d="M574 178L587 181 586 306 573 315 567 308Z" fill="${fill('frame', m.frame)}"/>
    <rect x="28" y="187" width="564" height="20" rx="5" fill="${fill('frame', m.frame)}"/>
    ${tubes}
    <path d="M32 328L585 280 585 296 34 346Z" fill="${fill('frame', m.frame)}"/>
    <path d="M36 331L582 284" stroke="${m.frameLight}" stroke-width="2" opacity=".8"/>
    <path d="M30 350L57 348 63 365 22 369Z M566 308L591 305 598 323 559 327Z" fill="${fill('frame', m.frame)}"/>
    ${[43, 579].map(x => `<circle cx="${x}" cy="197" r="4" fill="${m.tubeLight}"/><path d="M${x - 2} 195l4 4" stroke="${m.edge}"/>`).join('')}
    ${paper ? '<path d="M34 335L584 287 584 292 34 341Z" fill="url(#sketch)"/>' : ''}
    ${theme === 'neon' ? '<path d="M29 189H591M34 341L585 293" stroke="#9c6cff" stroke-width="2"/>' : ''}
  </g>`;
  const bars = Array.from({ length: 25 }, (_, i) => {
    const b = marimbaBar(i), material = b.sharp ? 'raised' : 'bar', dark = b.sharp ? m.raisedDark : m.dark;
    return `<g data-bar="${i}" transform="translate(${b.left} ${b.top})">
      <rect y="4" width="${b.width}" height="${b.height}" rx="${flat ? 4 : 3}" fill="${dark}" stroke="${m.edge}" stroke-width="${stroke}"/>
      <rect width="${b.width}" height="${b.height - 2}" rx="${flat ? 4 : 3}" fill="${fill(material, b.sharp ? m.raised : m.face)}" stroke="${m.edge}" stroke-width="${stroke}"/>
      ${theme === 'classic' ? `<rect x="2" y="2" width="${b.width - 4}" height="${b.height - 6}" rx="2" fill="url(#grain)"/>` : ''}
      ${paper ? `<path d="M3 4H${b.width - 4}V${b.height - 6}L${b.width - 8} ${b.height - 10}V8H3Z" fill="url(#sketch)" stroke="#555" stroke-width=".5"/>` : ''}
      <path d="M4 5H${b.width - 5}" stroke="${b.sharp ? m.raisedLight : m.light}" stroke-width="2" stroke-linecap="round"/>
      ${[.22, .78].map(y => `<circle cx="${b.width / 2}" cy="${b.height * y}" r="1.7" fill="${m.edge}"/><circle cx="${b.width / 2 - .3}" cy="${b.height * y - .3}" r=".6" fill="${m.tubeLight}"/>`).join('')}
    </g>`;
  }).join('');
  for (const bodyOnly of [true, false]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="780" viewBox="0 0 620 390">${definitions}${frame}${bodyOnly ? '' : bars}</svg>\n`;
    await writeFile(`assets/art/${theme}-marimba${bodyOnly ? '-body' : ''}.svg`, svg);
  }
}
