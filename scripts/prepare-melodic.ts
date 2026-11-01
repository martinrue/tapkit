/** Offline asset preparation. Requires gh, curl, tar and ffmpeg only during preparation. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { sampleBounds } from '../src/shared/audio-samples';
import { guitarRoots, trumpetRoots, noteLabel } from '../src/shared/melody';

const run = promisify(execFile), directory = '.artifacts/melodic-source';
await mkdir(directory, { recursive: true });
const guitarDirectory = `${directory}/SpanishClassicalGuitar-SFZ+FLAC-20190618`;
try { await access(`${guitarDirectory}/samples/E2.flac`); }
catch {
  await run('curl', ['-fL', 'https://freepats.zenvoid.org/Guitar/SpanishClassicalGuitar/SpanishClassicalGuitar-SFZ%2BFLAC-20190618.7z', '-o', `${directory}/guitar.7z`]);
  await run('tar', ['-xf', `${directory}/guitar.7z`, '-C', directory]);
}
const request = async (path: string) => JSON.parse((await run('gh', ['api', path], { maxBuffer: 24 * 1024 * 1024 })).stdout);
for (const instrument of ['trumpet', 'guitar'] as const) for (const root of instrument === 'trumpet' ? trumpetRoots : guitarRoots) {
  // VSCO names middle C as C3; FreePats and the UI use scientific C4.
  const originalNote = noteLabel(instrument === 'trumpet' ? root - 12 : root).replace('♯', '#');
  const source = instrument === 'guitar' ? `${guitarDirectory}/samples/${originalNote}.flac` : `${directory}/trumpet-${originalNote}.wav`;
  if (instrument === 'trumpet') {
    try { await access(source); }
    catch {
      const path = `Brass/Trumpet/sus/Sum_SHTrumpet_sus_${originalNote}_v1_rr1.wav`;
      const file = await request(`repos/sgossner/VSCO-2-CE/contents/${path.split('/').map(encodeURIComponent).join('/')}`);
      const blob = file.content ? file : await request(`repos/sgossner/VSCO-2-CE/git/blobs/${file.sha}`);
      await writeFile(source, Buffer.from(blob.content, 'base64'));
    }
  }
  const { stdout } = await run('ffmpeg', ['-v', 'error', '-i', source, '-t', '7', '-ac', '1', '-ar', '44100', '-f', 's16le', 'pipe:1'], { encoding: 'buffer', maxBuffer: 2 * 1024 * 1024 });
  const pcm = Float32Array.from({ length: stdout.length / 2 }, (_, index) => stdout.readInt16LE(index * 2) / 32768);
  const { start, length: total } = sampleBounds([pcm], 44100);
  const length = Math.min(total, Math.round(44100 * (instrument === 'trumpet' ? .8 : 5)));
  const wav = Buffer.alloc(44 + length * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(44100, 24); wav.writeUInt32LE(88200, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(length * 2, 40);
  const fadeFrames = 44100 * (instrument === 'trumpet' ? .09 : .04);
  for (let i = 0; i < length; i++) wav.writeInt16LE(Math.round(pcm[start + i] * 32767 * Math.min(1, i / 9, (length - 1 - i) / fadeFrames)), 44 + i * 2);
  await writeFile(`assets/audio/${instrument}-${root}.wav`, wav);
  console.log(`${instrument} ${noteLabel(root)}: ${(length / 44100).toFixed(3)} s`);
}
