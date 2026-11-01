import { deflateSync } from 'node:zlib';
import { writeFile, readFile } from 'node:fs/promises';

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, contents: Buffer) {
  const name = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(contents.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, contents])));
  return Buffer.concat([length, name, contents, crc]);
}
type Point = readonly [number, number];
type Curve = readonly [Point, Point, Point];
// One vector master, refined from the selected black-on-white waveform concept.
const start: Point = [10, 52];
const curves: readonly Curve[] = [
  [[11.3, 52], [12.7, 52], [14, 52]],
  [[19, 52], [19.5, 44], [24, 44]],
  [[31, 44], [28.5, 59.5], [35.5, 59.5]],
  [[43.5, 59.5], [41.5, 34.5], [49.5, 34.5]],
  [[58, 34.5], [55, 63], [63.5, 63]],
  [[70.5, 63], [68, 46.5], [75, 46.5]],
  [[80, 46.5], [80.5, 52], [85.5, 52]],
  [[87, 52], [88.5, 52], [90, 52]],
];
const strokeWidth = 5.5;
const path = `M${start.join(' ')} ${curves.map(curve => `C${curve.flat().join(' ')}`).join(' ')}`;
const transform = (template: boolean) => `translate(50 50) scale(${template ? 1.05 : .9}) translate(-50 -48.75)`;

function svg(template: boolean) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${template ? '' : '<rect x="4" y="4" width="92" height="92" rx="20" fill="white"/>'}<path d="${path}" transform="${transform(template)}" fill="none" stroke="black" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`;
}

function waveformMask(size: number, template: boolean) {
  const mask = new Float32Array(size * size);
  const scale = size / 100 * (template ? 1.05 : .9), radius = strokeWidth * scale / 2;
  const project = ([x, y]: Point): Point => [size / 2 + (x - 50) * scale, size / 2 + (y - 48.75) * scale];
  let from = start, previous = project(start);
  for (const [a, b, end] of curves) {
    for (let step = 1; step <= 48; step++) {
      const t = step / 48, u = 1 - t;
      const next = project([u ** 3 * from[0] + 3 * u ** 2 * t * a[0] + 3 * u * t ** 2 * b[0] + t ** 3 * end[0], u ** 3 * from[1] + 3 * u ** 2 * t * a[1] + 3 * u * t ** 2 * b[1] + t ** 3 * end[1]]);
      const dx = next[0] - previous[0], dy = next[1] - previous[1], length = dx * dx + dy * dy;
      const left = Math.max(0, Math.floor(Math.min(previous[0], next[0]) - radius - 1));
      const right = Math.min(size - 1, Math.ceil(Math.max(previous[0], next[0]) + radius + 1));
      const top = Math.max(0, Math.floor(Math.min(previous[1], next[1]) - radius - 1));
      const bottom = Math.min(size - 1, Math.ceil(Math.max(previous[1], next[1]) + radius + 1));
      for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
        const along = length ? Math.max(0, Math.min(1, ((x + .5 - previous[0]) * dx + (y + .5 - previous[1]) * dy) / length)) : 0;
        const distance = Math.hypot(x + .5 - previous[0] - along * dx, y + .5 - previous[1] - along * dy);
        const coverage = Math.max(0, Math.min(1, radius + .5 - distance));
        mask[y * size + x] = Math.max(mask[y * size + x], coverage);
      }
      previous = next;
    }
    from = end;
  }
  return mask;
}

function icon(size: number, template: boolean): Buffer {
  const rows = Buffer.alloc((size * 4 + 1) * size), mask = waveformMask(size, template);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const qx = Math.abs(x + .5 - size / 2) - size * .26, qy = Math.abs(y + .5 - size / 2) - size * .26;
    const edge = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - size * .2;
    const background = template ? 0 : Math.max(0, Math.min(1, .5 - edge));
    const wave = mask[y * size + x], alpha = wave + background * (1 - wave);
    const shade = alpha ? Math.round(255 * background * (1 - wave) / alpha) : 0;
    const index = y * (size * 4 + 1) + 1 + x * 4;
    rows.set([shade, shade, shade, Math.round(alpha * 255)], index);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
export async function prepareIcons() {
  const files: [string, Buffer][] = [
    ['assets/icon.png', icon(1024, false)],
    ['assets/icon.svg', Buffer.from(svg(false))],
    ['assets/wave.svg', Buffer.from(svg(true))],
    ['assets/trayTemplate.png', icon(22, true)],
    ['assets/trayTemplate@2x.png', icon(44, true)],
  ];
  await Promise.all(files.map(async ([path, data]) => {
    const previous = await readFile(path).catch(() => null);
    if (!previous?.equals(data)) await writeFile(path, data);
  }));
}
