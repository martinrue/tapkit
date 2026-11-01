/** Offline asset preparation; gh and ffmpeg are not app dependencies. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { violinRoots, noteLabel } from '../src/shared/melody';
import { sampleBounds } from '../src/shared/audio-samples';

const run = promisify(execFile), directory = '.artifacts/violin-drums-source';
await mkdir(directory, { recursive: true });
const request = async (path: string) => JSON.parse((await run('gh', ['api', path], { maxBuffer: 32 * 1024 * 1024 })).stdout);
const recordings = [
  ...violinRoots.map(root => ({ name: `violin-${root}`, repo: 'sgossner/VSCO-2-CE', path: `Strings/Solo Violin/Arco Vib/LLVln_ArcoVib_${noteLabel(root)}_f.wav`, seconds: 2.4 })),
  ...[
    ['kick', 'kickmic/kick/kickmic_kick_snoff_vl3_rr1', .95],
    ['snare', 'mid/snare/mid_snare_center_vl8', 1.25],
    ['hat-closed', 'mid/hh/mid_hh_closed_vl3_rr1', .4],
    ['hat-open', 'mid/hh/mid_hh_open_vl3_rr1', 1.8],
    ['tom-high', 'mid/htom/mid_htom_center_vl8', 1.5],
    ['tom-floor', 'mid/ltom/mid_ltom_center_vl8', 1.8],
    ['crash', 'mid/crash/mid_crash_crash_vl3_rr1', 4],
    ['ride', 'mid/ride/mid_ride_ride_vl3_rr1', 3.5],
  ].map(([name, path, seconds]) => ({ name: `kit-${name}`, repo: 'sfzinstruments/virtuosity_drums', path: `Samples/${path}.flac`, seconds: Number(seconds) })),
];
function highpass(input: Float32Array) {
  const omega = 2 * Math.PI * 100 / 44100, c = Math.cos(omega), alpha = Math.sin(omega) / (2 * Math.SQRT1_2), a0 = 1 + alpha;
  const b0 = (1 + c) / (2 * a0), b1 = -(1 + c) / a0, a1 = -2 * c / a0, a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return Float32Array.from(input, x => { const y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; });
}
for (const recording of recordings) {
  const violin = recording.name.startsWith('violin');
  if (process.argv.includes('--violin-only') && !violin) continue;
  const source = `${directory}/${recording.name}.${recording.path.split('.').at(-1)}`;
  try { await access(source); }
  catch {
    const file = await request(`repos/${recording.repo}/contents/${recording.path.split('/').map(encodeURIComponent).join('/')}`);
    const blob = file.content ? file : await request(`repos/${recording.repo}/git/blobs/${file.sha}`);
    await writeFile(source, Buffer.from(blob.content, 'base64'));
  }
  const { stdout } = await run('ffmpeg', ['-v', 'error', '-i', source, '-t', '7', '-ac', '1', '-ar', '44100', '-f', violin ? 'f32le' : 's16le', 'pipe:1'], { encoding: 'buffer', maxBuffer: 2 * 1024 * 1024 });
  let pcm = violin ? Float32Array.from({ length: stdout.length / 4 }, (_, i) => stdout.readFloatLE(i * 4)) : Float32Array.from({ length: stdout.length / 2 }, (_, i) => stdout.readInt16LE(i * 2) / 32768);
  const bounds = sampleBounds([pcm], 44100);
  const start = bounds.start + (violin ? Math.round(.08 * 44100) : 0), available = pcm.length - start;
  if (violin) pcm = highpass(pcm);
  const length = Math.min(available, Math.round(44100 * recording.seconds));
  const wav = Buffer.alloc(44 + length * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(44100, 24); wav.writeUInt32LE(88200, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(length * 2, 40);
  const fade = 44100 * (violin ? .32 : .06);
  const prepared = new Float32Array(length); let peak = 0;
  for (let i = 0; i < length; i++) {
    const envelope = violin
      ? Math.min(.5 - .5 * Math.cos(Math.PI * Math.min(1, i / (44100 * .02))), .5 - .5 * Math.cos(Math.PI * Math.min(1, (length - 1 - i) / fade)))
      : Math.min(1, i / 9, (length - 1 - i) / fade);
    prepared[i] = pcm[start + i] * envelope; peak = Math.max(peak, Math.abs(prepared[i]));
  }
  const gain = violin ? .85 / peak : 1;
  for (let i = 0; i < length; i++) wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, prepared[i] * gain)) * 32767), 44 + i * 2);
  await writeFile(`assets/audio/${recording.name}.wav`, wav);
  console.log(`${recording.name}: ${(length / 44100).toFixed(3)} s`);
}
