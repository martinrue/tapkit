/** Original CC0 guitar-body percussion, rendered offline; no runtime synthesis. */
import { writeFile } from 'node:fs/promises';

const rate = 44100, frames = Math.round(rate * .48), dry = new Float64Array(frames), slap = new Float64Array(frames), pcm = new Float64Array(frames);
// Excite a deep air cavity and quieter, inharmonic wooden plate resonances.
// A shared palm impulse makes them react together instead of stacking pure tones.
const modes = [[94, 1, .095], [181, 1.25, .058], [263, .9, .041], [397, .7, .026], [611, .36, .016], [1091, .14, .009]]
  .map(([frequency, level, decay]) => {
    const radius = Math.exp(-1 / (rate * decay)), angle = 2 * Math.PI * frequency / rate;
    return { level, a: 2 * radius * Math.cos(angle), b: radius * radius, input: Math.sin(angle), y1: 0, y2: 0 };
  });
let seed = 0x47554954, low = 0, smooth = 0, edge = 0, edgeLow = 0;
const cutoff = 1 - Math.exp(-2 * Math.PI * 1100 / rate);
const edgeCutoff = 1 - Math.exp(-2 * Math.PI * 2500 / rate), edgeFloor = 1 - Math.exp(-2 * Math.PI * 350 / rate);
for (let i = 0; i < frames; i++) {
  const t = i / rate;
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  const noise = (seed >>> 0) / 2147483648 - 1;
  low += cutoff * (noise - low); smooth += cutoff * (low - smooth);
  // Heel pressure supplies the thump; a short, band-limited palm slap supplies wood.
  const pressure = t < .004 ? Math.sin(Math.PI * t / .004) ** 2 : 0;
  const impulse = pressure * .8 + smooth * .55 * Math.exp(-t / .006);
  let body = 0;
  for (const mode of modes) {
    const value = mode.a * mode.y1 - mode.b * mode.y2 + impulse * mode.input;
    mode.y2 = mode.y1; mode.y1 = value; body += value * mode.level;
  }
  dry[i] = body;
  edge += edgeCutoff * (noise - edge); edgeLow += edgeFloor * (edge - edgeLow);
  slap[i] = (edge - edgeLow) * (1 - Math.exp(-t / .0006)) * Math.exp(-t / .012);
}
// Balance the contact independently: raw resonator amplitude otherwise masks it.
let bodyPeak = 0, slapPeak = 0;
for (let i = 0; i < frames; i++) { bodyPeak = Math.max(bodyPeak, Math.abs(dry[i])); slapPeak = Math.max(slapPeak, Math.abs(slap[i])); }
// Very short internal reflections colour the cavity without an audible echo or
// roomy reverb. The inverted reflection adds the hollow soundboard character.
const reflections = [[0, 1], [.0037, .32], [.0089, -.22], [.0143, .12]];
for (let i = 0; i < frames; i++) {
  for (const [seconds, level] of reflections) {
    const source = i - Math.round(seconds * rate);
    if (source >= 0) pcm[i] += (dry[source] / bodyPeak + .36 * slap[source] / slapPeak) * level;
  }
  pcm[i] *= Math.min(1, i / 12, (frames - 1 - i) / (rate * .04));
}
let peak = 0; for (const value of pcm) peak = Math.max(peak, Math.abs(value));
const wav = Buffer.alloc(44 + frames * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(frames * 2, 40);
// Gentle offline saturation gives the wooden impact density without clipped peaks.
for (let i = 0; i < frames; i++) wav.writeInt16LE(Math.round(Math.tanh(pcm[i] / peak * 1.7) / Math.tanh(1.7) * .85 * 32767), 44 + i * 2);
await writeFile('assets/audio/guitar-body-tap.wav', wav);
console.log('Guitar body tap: 480 ms, mono 44.1 kHz PCM, peak 0.85');
