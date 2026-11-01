/** Offline pitch-preserving decay extension; ffmpeg/curl are preparation tools only. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { sampleBounds } from '../src/shared/audio-samples';
const run = promisify(execFile), rate = 44100, directory = '.artifacts/djembe-decay';
await mkdir(directory, { recursive: true });
const source = '.artifacts/djembe-isolated.ogg';
try { await access(source); } catch { await run('curl', ['-fLsS', 'https://upload.wikimedia.org/wikipedia/commons/7/7c/Djembe_bass%2C_tone%2C_tonpalo%2C_slap.ogg', '-o', source]); }
const { stdout } = await run('ffmpeg', ['-v','error','-i',source,'-ac','1','-ar',String(rate),'-f','f32le','pipe:1'], { encoding:'buffer', maxBuffer:rate*4*8 });
const original = Float32Array.from({ length:stdout.length/4 },(_,i)=>stdout.readFloatLE(i*4));
for (const [name, start, end, fade] of [['bass', .055, .615, .09], ['rim', 3.960, 4.493, .07]] as const) {
  const crop = original.slice(Math.round(start*rate), Math.round(end*rate));
  const baseline = crop.slice(sampleBounds([crop], rate).start);
  for (let i=0;i<baseline.length;i++) baseline[i] *= Math.min(1,i/9,(baseline.length-1-i)/(rate*fade));
  const prefix = Math.round(.04*rate), overlap = Math.round(.02*rate), length = Math.round(baseline.length*1.15);
  const tail = baseline.slice(prefix), path = `${directory}/${name}.f32`;
  await writeFile(path, Buffer.from(tail.buffer,tail.byteOffset,tail.byteLength));
  const tempo = (baseline.length-prefix)/(length-prefix);
  // Padding flushes atempo's analysis window; the requested output still contains the stretched recorded decay.
  const { stdout: stretched } = await run('ffmpeg', ['-v','error','-f','f32le','-ar',String(rate),'-ac','1','-i',path,'-af',`apad=pad_dur=0.15,atempo=${tempo}`,'-f','f32le','pipe:1'], { encoding:'buffer',maxBuffer:rate*4*3 });
  if (stretched.length/4 < length-prefix) throw Error(`${name}: truncated stretch`);
  const wav=Buffer.alloc(44+length*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(length*2,40);
  const prepared = new Float64Array(length); let peak = 0;
  for(let i=0;i<length;i++){
    let value = i < prefix ? baseline[i] : stretched.readFloatLE((i-prefix)*4);
    if(i>=prefix && i<prefix+overlap){const mix=.5-.5*Math.cos(Math.PI*(i-prefix)/overlap);value=baseline[i]*(1-mix)+value*mix;}
    value*=Math.min(1,(length-1-i)/(rate*.005));
    prepared[i] = value; peak = Math.max(peak, Math.abs(value));
  }
  for(let i=0;i<length;i++) wav.writeInt16LE(Math.round(prepared[i] * (.85/peak) * 32767),44+i*2);
  await writeFile(`assets/audio/djembe-${name}.wav`,wav);
  console.log(`${name}: ${(baseline.length/rate).toFixed(3)} → ${(length/rate).toFixed(3)} s; original first 40 ms, unchanged pitch`);
}
