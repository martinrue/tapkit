import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// The piano artwork is a housing: its real keys are separate interactive layers.
// Compose those layers into static gallery thumbnails using the same geometry.
const root = fileURLToPath(new URL('.', import.meta.url));
const result = await build({
  stdin: {
    contents: "export { pianoOutline } from './src/shared/artwork'; export { pianoLayout, pianoVoices } from './src/shared/piano';",
    resolveDir: root,
  },
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const { pianoOutline, pianoLayout: layout, pianoVoices } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const palettes = {
  classic: ['#fffdf4', '#d5d1c4', '#33352e', '#151714'],
  metal: ['#e7edf2', '#84939f', '#52606b', '#182028'],
  neon: ['#60736b', '#35463f', '#203b32', '#0c1914'],
  candy: ['#fff5f8', '#e6ccdf', '#aa81b7', '#73597e'],
  paper: ['#fff', '#e7e7e3', '#3c3c3c', '#252525'],
  gold: ['#ffe69c', '#b58422', '#936b24', '#3c2707'],
  cartoon: ['#fff2b8', '#efbf61', '#253044', '#14202d'],
};
for (const [theme, [white, edge, black, blackEdge]] of Object.entries(palettes)) {
  const art = (await readFile(new URL(`assets/art/${theme}-piano.webp`, import.meta.url))).toString('base64');
  const keys = pianoVoices(60).sort((a, b) => Number(a.black) - Number(b.black)).map(voice => {
    const width = layout.width / layout.whiteKeys * (voice.black ? layout.blackWidth : 1);
    return `<rect x="${layout.left + voice.x * layout.width / layout.whiteKeys}" y="${layout.top}" width="${width}" height="${voice.black ? 30 : 48}" rx="1.5" fill="url(#${voice.black ? 'black' : 'white'})" stroke="${voice.black ? blackEdge : edge}" stroke-width=".8"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="400" viewBox="0 0 540 400"><defs><clipPath id="outline" clipPathUnits="objectBoundingBox"><polygon points="${pianoOutline.map(([x, y]) => `${x / 100},${y / 100}`).join(' ')}"/></clipPath><linearGradient id="white" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${white}"/><stop offset=".88" stop-color="${white}"/><stop offset="1" stop-color="${edge}"/></linearGradient><linearGradient id="black" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${black}"/><stop offset="1" stop-color="${blackEdge}"/></linearGradient></defs><image x="20" y="58" width="500" height="333.333" clip-path="url(#outline)" href="data:image/webp;base64,${art}"/>${keys}</svg>`;
  await writeFile(new URL(`assets/art/${theme}-piano-thumb.svg`, import.meta.url), svg);
}
