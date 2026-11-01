/** Offline recording preparation; gh and ffmpeg are not runtime dependencies. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { marimbaRoots, marimbaSampleFile } from '../src/shared/marimba';
import { noteLabel } from '../src/shared/melody';
import { sampleBounds } from '../src/shared/audio-samples';

const run = promisify(execFile), directory = '.artifacts/marimba-source', rate = 44100;
await mkdir(directory, { recursive: true });
const request = async (path: string) => JSON.parse((await run('gh', ['api', path], { maxBuffer: 32 * 1024 * 1024 })).stdout);
for (const root of marimbaRoots) {
  const original = `Marimba_hit_Outrigger_${noteLabel(root - 12)}_loud_01.wav`;
  const source = `${directory}/${original}`;
  try { await access(source); }
  catch {
    const path = `Percussion/Marimba/${original}`;
    const file = await request(`repos/sgossner/VSCO-2-CE/contents/${path.split('/').map(encodeURIComponent).join('/')}`);
    const blob = file.content ? file : await request(`repos/sgossner/VSCO-2-CE/git/blobs/${file.sha}`);
    await writeFile(source, Buffer.from(blob.content, 'base64'));
  }
  const { stdout } = await run('ffmpeg', ['-v', 'error', '-i', source, '-t', '7', '-ac', '1', '-ar', String(rate), '-f', 'f32le', 'pipe:1'], { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 });
  const pcm = Float32Array.from({ length: stdout.length / 4 }, (_, i) => stdout.readFloatLE(i * 4));
  const { start, length, peak } = sampleBounds([pcm], rate);
  const wav = Buffer.alloc(44 + length * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(length * 2, 40);
  for (let i = 0; i < length; i++) {
    const fade = Math.min(1, i / 9, (length - 1 - i) / (rate * .06));
    wav.writeInt16LE(Math.round(pcm[start + i] * (.85 / peak) * fade * 32767), 44 + i * 2);
  }
  await writeFile(`assets/audio/${marimbaSampleFile(root)}`, wav);
  console.log(`${noteLabel(root)} (${original}): ${(length / rate).toFixed(3)} s`);
}
