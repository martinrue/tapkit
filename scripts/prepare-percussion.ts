/** Asset preparation only: requires gh + ffmpeg; neither is used by the app. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { sampleBounds } from '../src/shared/audio-samples';

const run = promisify(execFile);
const sourceDirectory = '.artifacts/audio-source';
await mkdir(sourceDirectory, { recursive: true });
const notes = ['A3', 'D4', 'E4', 'F4', 'G4', 'A4', 'Bb4', 'C5', 'D5'];
const inputs = [
  ...notes.map(note => ({ repo: 'freepats/hang-D-minor', path: `samples/${note}_01.flac`, source: `handpan-${note}.flac`, output: `handpan-${note}.wav`, duration: undefined as number | undefined })),
  { repo: 'sgossner/VCSL', path: 'Idiophones/Struck Idiophones/Tambourine 1/Tamb1_Shake_rr1_Mid.wav', source: 'tambourine-Shake_rr1.wav', output: 'tambourine-short.wav', duration: .38 },
  { repo: 'sgossner/VCSL', path: 'Idiophones/Struck Idiophones/Tambourine 1/Tamb1_Roll_v2_rr1_Mid.wav', source: 'tambourine-roll.wav', output: 'tambourine-long.wav', duration: .85 },
  { repo: 'sgossner/VCSL', path: 'Idiophones/Struck Idiophones/Tambourine 1/Tamb1_Hit_v2_rr1_Mid.wav', source: 'tambourine-Hit_v2_rr1.wav', output: 'tambourine-tap.wav', duration: .55 },
];
for (const input of inputs) {
  const source = `${sourceDirectory}/${input.source}`;
  try { await access(source); }
  catch {
    const request = async (path: string) => JSON.parse((await run('gh', ['api', path], { maxBuffer: 20 * 1024 * 1024 })).stdout);
    const file = await request(`repos/${input.repo}/contents/${input.path.split('/').map(encodeURIComponent).join('/')}`);
    const blob = file.content ? file : await request(`repos/${input.repo}/git/blobs/${file.sha}`);
    await writeFile(source, Buffer.from(blob.content, 'base64'));
  }
  // ffmpeg handles original stereo FLAC/WAV; the shipped assets are simple mono PCM.
  const { stdout } = await run('ffmpeg', ['-v', 'error', '-i', source, '-ac', '1', '-ar', '44100', '-f', 's16le', 'pipe:1'], { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 });
  const samples = Float32Array.from({ length: stdout.length / 2 }, (_, i) => stdout.readInt16LE(i * 2) / 32768);
  const bounds = sampleBounds([samples], 44100);
  const length = Math.min(bounds.length, Math.round((input.duration ?? 7) * 44100));
  const wav = Buffer.alloc(44 + length * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(44100, 24); wav.writeUInt32LE(88200, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(length * 2, 40);
  const tail = Math.round(44100 * (input.duration ? .07 : .025));
  for (let i = 0; i < length; i++) {
    const fade = Math.min(1, i / 9, (length - 1 - i) / tail);
    wav.writeInt16LE(Math.round(samples[bounds.start + i] * 32767 * fade), 44 + i * 2);
  }
  await writeFile(`assets/audio/${input.output}`, wav);
  console.log(`${input.output}: ${(length / 44100).toFixed(3)} s`);
}
