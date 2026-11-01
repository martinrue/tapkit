/** Offline preparation only. Vocal decoding needs ffmpeg; the app needs neither it nor network access. */
import { mkdir, writeFile, access, readdir, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { samplerSounds, samplerLayout, samplerPadColours } from '../src/shared/sampler';
import { themeIds, type ThemeId } from '../src/shared/model';

const run = promisify(execFile), rate = 44100, tau = Math.PI * 2;
const sin = (frequency: number, time: number) => Math.sin(tau * frequency * time);
const square = (frequency: number, time: number) => Math.tanh(sin(frequency, time) * 4);
const saw = (frequency: number, time: number, cutoff = 5000) => {
  let value = 0;
  for (let h = 1; h <= 20; h++) value += sin(frequency * h, time) / (h * (1 + (frequency * h / cutoff) ** 4));
  return value * .64;
};
const sweep = (time: number, from: number, to: number, speed: number) => Math.sin(tau * (to * time + (from - to) * speed * (1 - Math.exp(-time / speed))));
const artworkOnly = process.argv.includes('--art-only');
if (!artworkOnly) {
  await mkdir('assets/audio', { recursive: true }); await mkdir('assets/art', { recursive: true });
  await mkdir('.artifacts/sampler-vocals', { recursive: true });

  // CC0 recorded voices, cropped to single words before applying short electronic chops/echoes.
  const vocals = new Map<string, Float32Array>();
  for (const source of [
    { id: 'hey', url: 'https://cdn.freesound.org/previews/39/39845_117392-hq.mp3', start: 0, length: .60 },
    { id: 'yeah', url: 'https://cdn.freesound.org/previews/129/129360_1928537-hq.mp3', start: 1.42, length: .96 },
    { id: 'go', url: 'https://cdn.freesound.org/previews/529/529817_10761583-hq.mp3', start: 0, length: 1.45 },
  ]) {
    const path = `.artifacts/sampler-vocals/${source.id}.mp3`;
    try { await access(path); } catch { await run('curl', ['-fLsS', source.url, '-o', path]); }
    const { stdout } = await run('ffmpeg', ['-v', 'error', '-ss', String(source.start), '-i', path, '-t', String(source.length), '-ac', '1', '-ar', String(rate), '-f', 'f32le', 'pipe:1'], { encoding: 'buffer', maxBuffer: rate * 8 });
    const data = Float32Array.from({ length: stdout.length / 4 }, (_, i) => stdout.readFloatLE(i * 4));
    let peak = 0; for (const n of data) peak = Math.max(peak, Math.abs(n));
    if (peak < .001) throw new Error(`Vocal ${source.id} is silent.`);
    const attack = data.findIndex(n => Math.abs(n) > peak * .035), start = Math.max(0, attack - 220);
    const trimmed = data.slice(start);
    for (let i = 0; i < trimmed.length; i++) trimmed[i] = trimmed[i] / peak * Math.min(1, i / 90, (trimmed.length - i - 1) / 880);
    vocals.set(source.id, trimmed);
  }
  const vocal = (id: string, time: number, pitch = 1) => {
    const data = vocals.get(id)!, frame = time * pitch * rate, i = Math.floor(frame);
    return i < 0 || i + 1 >= data.length ? 0 : data[i] + (data[i + 1] - data[i]) * (frame - i);
  };

  for (const [index, sound] of samplerSounds.entries()) {
    const frames = Math.round(sound.seconds * rate), pcm = new Float64Array(frames);
    let seed = 0x51f15e + index * 7919, low = 0, previous = 0, previous2 = 0;
    for (let i = 0; i < frames; i++) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      const noise = (seed >>> 0) / 2147483648 - 1, t = i / rate, q = t / sound.seconds;
      low += .12 * (noise - low); const high = noise - low;
      let value = 0;
      switch (sound.recipe) {
        case 'kick': {
          // Fast drum pitch envelope, warm saturation and a quieter sustained E1 sub tail.
          const body = sweep(t, 155, 41.2, .022), harmonic = sweep(t, 310, 82.4, .022);
          const envelope = .78 * Math.exp(-t * 6.5) + .36 * Math.exp(-t * 2.5);
          value = Math.tanh((body + .20 * harmonic * Math.exp(-t * 5)) * 1.7) * envelope
            + .34 * sweep(t, 290, 82.4, .009) * Math.exp(-t * 18)
            + high * .07 * Math.exp(-t * 300);
          break;
        }
        case 'sub-drop': value = (sweep(t, 165, 36.7, .24) + .28 * sweep(t, 330, 73.4, .24)) * Math.exp(-t * 1.45); break;
        case '808-glide': value = Math.tanh((sweep(t, 110, 41.2, .18) + .22 * sweep(t, 220, 82.4, .18)) * 1.8) * Math.exp(-t * 2.1); break;
        case 'reese': value = (saw(55 * .994, t, 1600) + saw(55 * 1.006, t, 1600) + .45 * sin(27.5, t)) * Math.exp(-t * 2.3); break;
        case 'wobble': {
          const cutoff = 180 + 2100 * (.5 + .5 * sin(3.5, t)) ** 3;
          value = (saw(55, t, cutoff) + .55 * sin(55, t)) * Math.exp(-t * 1.8); break;
        }
        case 'growl': value = (Math.sin(tau * 55 * t + sin(110, t) * (2 + 7 * (.5 + .5 * sin(5, t)))) + .45 * sin(55, t)) * Math.exp(-t * 2.3); break;
        case 'laser': value = sweep(t, 2600, 95, .11) * Math.exp(-t * 7); break;
        case 'zap': value = Math.sin(tau * (100 * t + 100 * .018 * (1 - Math.exp(-t / .018))) + sin(145, t) * 10 * Math.exp(-t * 20)) * Math.exp(-t * 18); break;
        case 'rave': value = [0, .16, .32].reduce((sum, delay, echo) => {
          const age = t - delay;
          return sum + (age < 0 ? 0 : [261.63, 311.13, 392, 466.16].reduce((chord, f) => chord + saw(f, age, 2200), 0) * Math.exp(-age * 12) * .32 ** echo);
        }, 0); break;
        case 'supersaw': value = [-.012, -.008, -.004, 0, .004, .008, .012].reduce((sum, detune) => sum + saw(261.63 * (1 + detune), t, 2600), 0) / 4 * Math.exp(-t * 2.8); break;
        case 'acid': {
          const cutoff = 220 + 5000 * Math.exp(-t * 10), alpha = 1 - Math.exp(-tau * cutoff / rate);
          previous += alpha * (saw(110, t) - previous); previous2 += alpha * (previous - previous2);
          value = (previous2 + .35 * sweep(t, 1300, 180, .09) * Math.exp(-t * 9)) * Math.exp(-t * 5); break;
        }
        case 'vocal-hey': value = vocal('hey', t, 1.12) + .22 * vocal('hey', t - .16, 1.12) + .10 * vocal('hey', t - .32, 1.12); break;
        case 'vocal-yeah': value = vocal('yeah', t, .96) + .18 * vocal('yeah', t - .16, .96); break;
        case 'vocal-go': value = vocal('go', t, 1.03) + .14 * vocal('go', t - .16, 1.03); break;
        case 'tape-stop': {
          // Integrate declining tape speed so the whole minor-seventh stab slows to rest.
          const age = Math.max(0, t - .08), braking = Math.min(age, .98);
          const speed = Math.max(0, 1 - age / .98);
          const position = Math.min(t, .08) + braking - braking * braking / (2 * .98);
          value = [174.61, 207.65, 261.63, 311.13].reduce((sum, f) => sum + saw(f, position, 800 + 2500 * speed), 0)
            * Math.sqrt(speed) * Math.exp(-t * 1.5);
          break;
        }
        case 'vocal-go-chop': {
          const step = Math.floor(t / .16), age = t % .16;
          value = step < 5 ? vocal('go', .3 + age, [1.12, 1.26, 1.5, 1.26, 1][step]) * Math.min(1, age / .004, (.16 - age) / .014) * .85 ** step : 0; break;
        }
        case 'vocal-echo': value = [0, .22, .44, .66].reduce((sum, delay, n) => sum + vocal('yeah', t - delay, 1.15) * .5 ** n, 0); break;
        case 'ring-mod': {
          // Inharmonic sum/difference bands with a slowing gate give a metallic ratchet.
          const gate = .22 + .78 * (.5 + .5 * Math.cos(tau * (8 * t - 1.4 * t * t))) ** 3;
          value = (sin(730, t) * sin(1139, t) + .55 * sin(991, t) * sin(1573, t)) * gate * Math.exp(-t * 2.4);
          break;
        }
        case 'house-keys': value = [130.81, 155.56, 196, 233.08, 293.66].reduce((sum, f) => sum + (sin(f, t) + .3 * Math.sin(tau * f * t + sin(f * 2, t) * 2 * Math.exp(-t * 7))) * Math.exp(-t * 2.2), 0) * (.93 + .07 * sin(4.5, t)); break;
        case 'house-chord': value = [130.81, 155.56, 196, 233.08, 293.66].reduce((sum, f) => sum + saw(f, t, 450 + 1300 * Math.exp(-t * 6)), 0) * Math.exp(-t * 3.1); break;
        case 'house-organ': value = [130.81, 155.56, 196, 233.08].reduce((sum, f) => sum + sin(f, t) + .45 * sin(f * 2, t) + .2 * sin(f * 3, t), 0) * Math.exp(-t * 4.5) + high * .1 * Math.exp(-t * 150); break;
        case 'house-pluck': value = [0, .25, .5].reduce((sum, delay, n) => {
          const age = t - delay; return sum + (age < 0 ? 0 : (sin(261.63, age) + .28 * sin(523.26, age) + .12 * sin(784.89, age)) * Math.exp(-age * 6) * .45 ** n);
        }, 0); break;
        case 'riser': {
          const alpha = 1 - Math.exp(-tau * (200 + q * q * 7000) / rate);
          previous += alpha * (noise - previous);
          const chirp = Math.sin(tau * (180 * t + 280 * t * t));
          value = (previous * .7 + chirp * .18) * (.1 + .9 * q) * (1 - Math.exp(-(sound.seconds - t) * 80)); break;
        }
        case 'impact': value = sweep(t, 160, 32, .09) * Math.exp(-t * 1.7) + high * .45 * Math.exp(-t * 4) + [97, 173, 271].reduce((sum, f) => sum + sin(f, t) * .15 * Math.exp(-t * 2.7), 0); break;
        case 'horn': value = [392, 493.88, 587.33].reduce((sum, f) => sum + Array.from({ length: 9 }, (_, n) => sin(f * (n + 1), t + .0003 * sin(5, t)) * Math.exp(-n * .15) / (n + 1)).reduce((a, b) => a + b, 0), 0) * Math.min(1, t / .012, (sound.seconds - t) / .3); break;
      }
      pcm[i] = Math.tanh(value * .8);
    }
    const mean = pcm.reduce((sum, n) => sum + n, 0) / frames;
    let peak = 0; for (const n of pcm) peak = Math.max(peak, Math.abs(n - mean));
    const wav = Buffer.alloc(44 + frames * 2);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(frames * 2, 40);
    for (let i = 0; i < frames; i++) {
      const fade = Math.min(1, i / 9, (frames - i - 1) / (rate * .025));
      wav.writeInt16LE(Math.round((pcm[i] - mean) / peak * .85 * fade * 32767), 44 + i * 2);
    }
    await writeFile(`assets/audio/sampler-${sound.recipe}.wav`, wav);
  }
  // Retire only factory-bank outputs; user audio lives outside this bundled asset directory.
  const outputs = new Set<string>(samplerSounds.map(sound => `sampler-${sound.recipe}.wav`));
  for (const file of await readdir('assets/audio')) if (/^sampler-.*\.wav$/.test(file) && !outputs.has(file)) await unlink(`assets/audio/${file}`);
}

await mkdir('assets/art', { recursive: true });
const materials: Record<ThemeId, { light: string; face: string; dark: string; edge: string; well: string }> = {
  classic: { light: '#bf8752', face: '#704323', dark: '#35271b', edge: '#d5b77d', well: '#2c2520' },
  metal: { light: '#f2f6f9', face: '#8c9ba7', dark: '#3c4954', edge: '#cdd6dd', well: '#26313c' },
  neon: { light: '#343344', face: '#171c28', dark: '#090c16', edge: '#65f1d3', well: '#080c15' },
  candy: { light: '#fbe8f6', face: '#ceb0df', dark: '#987cac', edge: '#fff5fc', well: '#a88db8' },
  paper: { light: '#fffefa', face: '#f1f0e9', dark: '#dbdad3', edge: '#343633', well: '#d6d6d0' },
  gold: { light: '#fff1b4', face: '#d8a538', dark: '#835914', edge: '#ffed9e', well: '#59441f' },
  cartoon: { light: '#6ce0dd', face: '#6ce0dd', dark: '#3a969e', edge: '#223044', well: '#253247' },
};
for (const theme of themeIds) {
  const m = materials[theme], cartoon = theme === 'cartoon', paper = theme === 'paper';
  const grain = Array.from({ length: 40 }, (_, i) => `<path d="M32 ${40 + i * 25} Q300 ${60 + i * 25} 550 ${43 + i * 25} T992 ${48 + i * 25}" fill="none" stroke="${theme === 'classic' ? '#e6b978' : theme === 'paper' ? '#7c7c75' : '#ffffff'}" stroke-opacity="${theme === 'classic' ? '.13' : '.09'}" stroke-width="${theme === 'classic' ? '3' : '1'}"/>`).join('');
  const screws = [[65,65],[959,65],[65,959],[959,959]].map(([x,y]) => `<circle cx="${x}" cy="${y}" r="11" fill="${m.dark}" stroke="${m.edge}" stroke-width="2"/><path d="M${x-5} ${y}h10" stroke="${m.edge}" stroke-width="2"/>`).join('');
  const definitions = `<defs><linearGradient id="shell" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${m.light}"/><stop offset=".23" stop-color="${m.face}"/><stop offset=".7" stop-color="${m.face}"/><stop offset="1" stop-color="${m.dark}"/></linearGradient><linearGradient id="rim" x2="0" y2="1"><stop stop-color="${m.edge}"/><stop offset=".5" stop-color="${m.dark}"/><stop offset="1" stop-color="${m.edge}"/></linearGradient><clipPath id="grain"><rect x="32" y="${paper ? 26 : 32}" width="960" height="960" rx="${cartoon ? 35 : 48}"/></clipPath>${samplerSounds.map((_, i) => { const c = samplerPadColours(i, theme); return `<linearGradient id="p${i}" x2=".8" y2="1"><stop stop-color="${c.light}"/>${theme === 'gold' ? `<stop offset=".26" stop-color="${c.face}"/><stop offset=".32" stop-color="${c.light}"/>` : ''}<stop offset=".48" stop-color="${c.face}"/><stop offset="${theme === 'gold' ? '.8' : '1'}" stop-color="${c.dark}"/>${theme === 'gold' ? `<stop offset="1" stop-color="${c.face}"/>` : ''}</linearGradient>`; }).join('')}</defs>`;
  const housing = `<rect x="32" y="42" width="960" height="960" rx="${cartoon ? 35 : 48}" fill="${m.dark}" stroke="${cartoon ? m.edge : m.dark}" stroke-width="${cartoon ? 10 : 2}"/><rect x="32" y="26" width="960" height="960" rx="${cartoon ? 35 : 48}" fill="${cartoon ? m.face : 'url(#shell)'}" stroke="${paper || cartoon ? m.edge : 'url(#rim)'}" stroke-width="${cartoon ? 10 : paper ? 3 : 7}"/>${!cartoon ? `<g clip-path="url(#grain)">${grain}</g>` : ''}<rect x="87" y="87" width="850" height="850" rx="24" fill="${m.well}" stroke="${m.edge}" stroke-opacity=".5" stroke-width="2"/>${screws}${theme === 'neon' ? '<rect x="45" y="39" width="934" height="934" rx="36" fill="none" stroke="#d45be8" stroke-width="2"/>' : ''}`;
  const recesses = samplerSounds.map((_, i) => {
    const x = samplerLayout.start + (i % 5) * (samplerLayout.pad + samplerLayout.gap), y = samplerLayout.start + Math.floor(i / 5) * (samplerLayout.pad + samplerLayout.gap);
    return `<rect x="${x-5}" y="${y-5}" width="154" height="158" rx="${cartoon ? 12 : 17}" fill="${paper ? '#aaa9a0' : '#0d1420'}" fill-opacity=".8"/>`;
  }).join('');
  const pads = samplerSounds.map((_, i) => {
    const c = samplerPadColours(i, theme), x = samplerLayout.start + (i % 5) * 168, y = samplerLayout.start + Math.floor(i / 5) * 168;
    return `<rect x="${x}" y="${y}" width="144" height="144" rx="${cartoon ? 9 : paper ? 4 : 14}" fill="${cartoon ? c.face : 'url(#p'+i+')'}" stroke="${paper || cartoon ? '#263039' : c.dark}" stroke-width="${cartoon ? 5 : 2}"/><path d="M${x+14} ${y+7}h116" stroke="${cartoon ? c.light : '#ffffff'}" stroke-opacity=".48" stroke-width="3"/>`;
  }).join('');
  for (const thumbnail of [false, true]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${definitions}${housing}${recesses}${thumbnail ? pads : ''}</svg>`;
    await writeFile(`assets/art/${theme}-sampler${thumbnail ? '' : '-body'}.svg`, svg);
  }
}
console.log(artworkOnly ? 'Prepared 14 sampler artwork layers.' : 'Prepared 25 sampler one-shots and 14 sampler artwork layers.');
