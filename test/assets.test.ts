import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { themeIds, instrumentIds, instrumentArtwork, handArtwork, instruments } from '../src/shared/model';
import { insidePiano } from '../src/shared/artwork';

test('every instrument/theme and both hand layers have bundled transparent artwork', async () => {
  const files = new Set(themeIds.flatMap(theme => instrumentIds.flatMap(id => [instrumentArtwork(id, theme), instrumentArtwork(id, theme, true), handArtwork(id, theme, 'left'), handArtwork(id, theme, 'right')])));
  for (const file of files) {
    const png = await readFile(`assets/art/${file}`);
    if (file.endsWith('.svg')) {
      const svg = png.toString(); assert.ok(svg.startsWith('<svg'));
      if (file.includes('-marimba')) {
        assert.ok(svg.includes('viewBox="0 0 620 390"'));
        assert.equal((svg.match(/data-bar=/g) ?? []).length, file.includes('-body') ? 0 : 25, 'marimba thumbnails contain the exact playable bar layout');
      } else {
        assert.ok(svg.includes('viewBox="0 0 1024 1024"'));
        assert.equal((svg.match(/width="144" height="144"/g) ?? []).length, file.includes('-body') ? 0 : 25, 'thumbnails show all 25 pads; body leaves pads to live controls');
      }
      continue;
    }
    assert.equal(png.subarray(1, 4).toString(), 'PNG', file);
    assert.equal(png[25], 6, `${file} needs an alpha channel`);
    assert.ok(png.readUInt32BE(16) > 256 && png.readUInt32BE(20) > 256, file);
  }
});

test('recorded djembe one-shots contain audible PCM rather than silent crop output', async () => {
  for (const name of ['bass', 'rim']) {
    const wav = await readFile(`assets/audio/djembe-${name}.wav`);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    let peak = 0, sampleCount = 0, dataStart = 0;
    for (let offset = 12; offset + 8 <= wav.length;) {
      const size = wav.readUInt32LE(offset + 4);
      if (wav.toString('ascii', offset, offset + 4) === 'data') {
        for (let i = offset + 8; i + 1 < offset + 8 + size; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
        sampleCount = size / 2;
        dataStart = offset + 8;
      }
      offset += 8 + size + (size % 2);
    }
    const expected = name === 'bass' ? .644 : .5200907029478458 * 1.15;
    assert.ok(Math.abs(sampleCount / 44100 - expected) < 1 / 44100, `${name}: decay extends by 15%`);
    assert.ok(peak > 1000 && peak < 32767, `${name} must be audible without clipped peaks`);
    // Guard against merely padding the old short hit with silence.
    let tailEnergy = 0;
    const tailStart = Math.floor(44100 * 0.28), tailEnd = Math.floor(44100 * 0.42);
    for (let i = tailStart; i < tailEnd; i++) tailEnergy += wav.readInt16LE(dataStart + i * 2) ** 2;
    const tailRms = Math.sqrt(tailEnergy / (tailEnd - tailStart));
    assert.ok(tailRms > peak * 0.005, `${name} must have an audible recorded tail after the old cutoff`);
    const previousEnd = name === 'bass' ? .56 : .5200907029478458;
    let extendedEnergy = 0; const first = Math.round(previousEnd * 44100), last = Math.round((previousEnd + .055) * 44100);
    for (let i=first;i<last;i++) extendedEnergy += wav.readInt16LE(dataStart+i*2)**2;
    assert.ok(Math.sqrt(extendedEnergy/(last-first)) > peak*.003, `${name}: extended decay is audible beyond the previous ending`);
    assert.ok(Math.abs(wav.readInt16LE(dataStart + (sampleCount - 1) * 2)) <= 2, `${name} must fade cleanly to zero`);
  }
});

test('piano mouse mask excludes the backdrop and gap beneath its housing', () => {
  assert.equal(insidePiano(50, 50), true);
  assert.equal(insidePiano(0, 0), false);
  assert.equal(insidePiano(50, 90), false);
});

test('new percussion voices have distinct, audible native-pitch samples with clean tails', async () => {
  for (const id of ['handpan', 'tambourine'] as const) {
    const voices = instruments[id].voices;
    assert.equal(new Set(voices.map(voice => voice.sample)).size, voices.length, 'each field/articulation has its own recording');
    const durations: number[] = [];
    for (const voice of voices) {
      const wav = await readFile(`assets/audio/${voice.sample}`);
      assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
      assert.equal(wav.readUInt16LE(22), 1); assert.equal(wav.readUInt32LE(24), 44100);
      assert.equal(wav.readUInt16LE(34), 16); assert.equal(voice.semitones, 0, 'preserve natural pitch and sympathetic notes');
      const length = wav.readUInt32LE(40) / 2; let peak = 0, energy = 0;
      for (let i = 0; i < length; i++) { const sample = wav.readInt16LE(44 + i * 2); peak = Math.max(peak, Math.abs(sample)); energy += sample ** 2; }
      assert.ok(peak > 100, `${voice.sample} must be audible`);
      assert.ok(Math.sqrt(energy / length) > peak * .01, `${voice.sample} has real signal, not an isolated spike`);
      assert.equal(wav.readInt16LE(wav.length - 2), 0, 'tail fades to zero');
      durations.push(length / 44100);
    }
    if (id === 'handpan') assert.ok(durations.every(duration => duration > 1.5 && duration <= 7), 'handpan retains natural ringing tails');
    else {
      assert.ok(durations[1] > durations[0] * 2, 'long shake is distinctly longer than short shake');
      assert.ok(durations.every(duration => duration < 1), 'tambourine articulations are bounded one-shots');
    }
  }
});


test('drum recordings contain real attacks and clean natural decays', async () => {
  for (const sample of new Set(instruments.drums.voices.map(voice => voice.sample))) {
    const wav = await readFile(`assets/audio/${sample}`);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    const frames = wav.readUInt32LE(40) / 2;
    let peak = 0, tailEnergy = 0;
    for (let i = 0; i < frames; i++) {
      const value = wav.readInt16LE(44 + i * 2); peak = Math.max(peak, Math.abs(value));
      if (i > 4410 && i < 11025) tailEnergy += value * value;
    }
    assert.ok(peak > 500, sample);
    assert.ok(Math.sqrt(tailEnergy / 6615) > peak * .001, `${sample} retains its recorded decay`);
    assert.equal(wav.readInt16LE(wav.length - 2), 0);
  }
});
