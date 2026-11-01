import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { defaultSettings, instrumentIds, instrumentBindings, instruments, voicesFor } from '../src/shared/model';
import { validateSettings } from '../src/shared/settings';
import { melodicSample, violinTuning, guitarTuning, noteLabel, trumpetValves } from '../src/shared/melody';

test('chromatic registers cover the complete practical ranges with no missing semitones', () => {
  for (const [id, low, high] of [['trumpet', 52, 84], ['guitar', 40, 88], ['violin', 55, 100]] as const) {
    const covered = new Set<number>();
    for (let range = 0; range < instruments[id].ranges!.length; range++) {
      const voices = voicesFor(id, range).filter(voice => voice.midi !== undefined);
      assert.equal(voices.length, 13);
      for (const voice of voices) {
        covered.add(voice.midi!); assert.equal(voice.label, noteLabel(voice.midi!));
        assert.ok(instruments[id].samples!.includes(voice.sample), 'every register sample is preloaded');
        assert.ok(Math.abs(voice.semitones) <= (id === 'trumpet' ? 2 : 4), 'use nearby multisample roots');
        if (id === 'violin') assert.equal(violinTuning[voice.string!] + voice.fret!, voice.midi);
        if (id === 'guitar') assert.equal(guitarTuning[voice.string!] + voice.fret!, voice.midi);
      }
    }
    assert.deepEqual([...covered].sort((a, b) => a - b), Array.from({ length: high - low + 1 }, (_, index) => low + index));
  }
});

test('guitar strums use real six-string chord voicings and start immediately', () => {
  const pitchClasses: Record<string, number[]> = { C: [0, 4, 7], D: [2, 6, 9], Em: [4, 7, 11], F: [5, 9, 0], G: [7, 11, 2], Am: [9, 0, 4] };
  for (const voice of instruments.guitar.voices.filter(voice => voice.chord)) {
    const layers = voice.layers!;
    assert.ok(layers.length >= 4 && layers.length <= 6); assert.equal(layers[0].delay, 0);
    for (const [index, layer] of layers.entries()) {
      const midi = Number(layer.sample.match(/guitar-(\d+)/)![1]) + layer.semitones;
      assert.ok(pitchClasses[voice.chord!].includes(midi % 12), `${voice.chord} contains only chord tones`);
      assert.equal(layer.delay, index * .009); assert.ok(instruments.guitar.samples!.includes(layer.sample));
    }
    assert.ok(layers.at(-1)!.delay! <= .045, 'a full strum completes within 45 ms');
  }
  assert.deepEqual(melodicSample('trumpet', 60), { sample: 'trumpet-60.wav', semitones: 0 });
  assert.deepEqual(trumpetValves(52), [1, 2, 3], 'concert E3 is written F-sharp3 on B-flat trumpet');
  assert.deepEqual(trumpetValves(58), [], 'concert B-flat3 is written open C4');
});

test('four-instrument preferences gain melodic instruments and validate register controls', () => {
  const before = defaultSettings();
  const old = { ...before, instruments: Object.fromEntries(instrumentIds.slice(0, 4).map(id => [id, before.instruments[id]])) };
  old.instruments.djembe.shortcut = 'CommandOrControl+Alt+R'; old.instruments.piano.shortcut = 'CommandOrControl+Alt+G';
  const settings = validateSettings(old);
  assert.equal(settings.instruments.djembe.shortcut, old.instruments.djembe.shortcut);
  assert.equal(new Set(instrumentIds.map(id => settings.instruments[id].shortcut)).size, instrumentIds.length);
  for (const id of ['trumpet', 'guitar', 'violin'] as const) {
    assert.equal(settings.instruments[id].range, 1);
    assert.equal(new Set(instrumentBindings(id).map(binding => settings.instruments[id].keys[binding.id])).size, instrumentBindings(id).length);
    settings.instruments[id].range = instruments[id].ranges!.length;
    assert.throws(() => validateSettings(settings), /valid register/);
    settings.instruments[id].range = 0;
    settings.instruments[id].keys['range-up'] = 'A';
    assert.throws(() => validateSettings(settings), /duplicate playing key A/);
    settings.instruments[id].keys['range-up'] = 'X';
  }
  const validated = validateSettings(settings); assert.equal(validated.instruments.guitar.range, 0);
});

test('guitar body percussion stays available in every register and migrates around custom keys', () => {
  const previous = defaultSettings(); delete previous.instruments.guitar.keys['body-tap'];
  const standard = validateSettings(previous);
  assert.equal(standard.instruments.guitar.keys['body-tap'], 'B');
  previous.instruments.guitar.keys['melody-0'] = 'b';
  previous.loops.guitar = { duration: 1, events: [{ at: 0, voiceId: 'chord-0', range: 1 }] };
  const migrated = validateSettings(previous);
  assert.equal(migrated.instruments.guitar.keys['melody-0'], 'B');
  assert.equal(migrated.instruments.guitar.keys['body-tap'], 'N');
  assert.deepEqual(migrated.loops, previous.loops);
  for (let range = 0; range < instruments.guitar.ranges!.length; range++) {
    const tap = voicesFor('guitar', range).find(voice => voice.id === 'body-tap')!;
    assert.equal(tap.sample, 'guitar-body-tap.wav'); assert.equal(tap.semitones, 0);
    assert.equal(tap.surface, 'body'); assert.equal(tap.hand, 'right');
    assert.ok(tap.y! * instruments.guitar.height > 280, 'tap contacts wood below the strings');
    assert.ok(instruments.guitar.samples!.includes(tap.sample));
  }
  migrated.instruments.guitar.keys['body-tap'] = 'V';
  assert.equal(validateSettings(migrated).instruments.guitar.keys['body-tap'], 'V');
  migrated.instruments.guitar.keys['body-tap'] = '1';
  assert.throws(() => validateSettings(migrated), /duplicate playing key/);
});

test('guitar body tap has deep cavity weight without losing its wooden resonance', async () => {
  const wav = await readFile('assets/audio/guitar-body-tap.wav'), rate = wav.readUInt32LE(24);
  const frames = wav.readUInt32LE(40) / 2;
  const pcm = Float64Array.from({ length: frames }, (_, i) => wav.readInt16LE(44 + i * 2) / 32768);
  let bass = 0, wood = 0, edge = 0, total = 0;
  // Measure spectral energy independently of the preparation's resonator model.
  for (let k = 1; k <= Math.floor(2000 * frames / rate); k++) {
    const frequency = k * rate / frames, coefficient = 2 * Math.cos(2 * Math.PI * k / frames);
    let previous = 0, older = 0;
    for (const sample of pcm) { const next = sample + coefficient * previous - older; older = previous; previous = next; }
    const energy = Math.max(0, previous ** 2 + older ** 2 - coefficient * previous * older);
    total += energy;
    if (frequency >= 45 && frequency < 130) bass += energy;
    if (frequency >= 130 && frequency < 600) wood += energy;
    if (frequency >= 600) edge += energy;
  }
  assert.ok(bass / total > .48 && bass / total < .68, 'retain bass weight without the overly deep, muffled balance');
  assert.ok(wood / total > .25 && wood / total < .48, 'audible wooden body resonance balances the bass');
  assert.ok(edge / total > .003 && edge / total < .04, 'brief palm slap is audible without becoming a bright snare');
  let crossings = 0, tailEnergy = 0;
  for (let i = Math.round(rate * .2); i < Math.round(rate * .4); i++) {
    if (pcm[i - 1] <= 0 && pcm[i] > 0) crossings++;
    tailEnergy += pcm[i] ** 2;
  }
  assert.ok(crossings >= 18 && crossings <= 20, 'cavity register sits between the original knock and the overly deep revision');
  assert.ok(Math.sqrt(tailEnergy / Math.round(rate * .2)) > .02, 'bass body remains audible beyond the attack');
  assert.equal(pcm[0], 0); assert.equal(pcm.at(-1), 0);
});

test('all melodic multisamples contain audible mono PCM with clean ends', async () => {
  for (const id of ['trumpet', 'guitar', 'violin'] as const) for (const sample of instruments[id].samples!) {
    const wav = await readFile(`assets/audio/${sample}`);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.readUInt16LE(22), 1); assert.equal(wav.readUInt32LE(24), 44100);
    const length = wav.readUInt32LE(40) / 2; let energy = 0, peak = 0;
    for (let i = 0; i < length; i++) { const value = wav.readInt16LE(44 + i * 2); peak = Math.max(peak, Math.abs(value)); energy += value * value; }
    assert.ok(peak > 200, sample); assert.ok(Math.sqrt(energy / length) > peak * .01, sample);
    assert.equal(wav.readInt16LE(wav.length - 2), 0, 'tail fades to zero');
    assert.ok(length / 44100 > .3 && length / 44100 <= 5);
  }
});


test('six-instrument settings gain violin and drums without taking custom summons', () => {
  const before = defaultSettings();
  before.instruments.djembe.shortcut = 'CommandOrControl+Alt+V';
  before.instruments.piano.shortcut = 'CommandOrControl+Alt+B';
  const old = { ...before, instruments: Object.fromEntries(instrumentIds.slice(0, 6).map(id => [id, before.instruments[id]])) };
  const result = validateSettings(old);
  assert.equal(result.instruments.djembe.shortcut, before.instruments.djembe.shortcut);
  assert.equal(result.instruments.piano.shortcut, before.instruments.piano.shortcut);
  assert.equal(new Set(instrumentIds.map(id => result.instruments[id].shortcut)).size, instrumentIds.length);
  assert.equal(result.instruments.violin.range, 1);
  assert.equal(Object.keys(result.instruments.drums.keys).length, 10);
});

test('drum kit preserves snare sticking, three tom pitches and isolated hi-hat choking', () => {
  const voices = instruments.drums.voices, byId = (id: string) => voices.find(voice => voice.id === id)!;
  assert.equal(voices.length, 10);
  assert.equal(byId('snare-left').sample, byId('snare-right').sample);
  assert.notEqual(byId('snare-left').hand, byId('snare-right').hand);
  assert.equal(byId('tom-mid').semitones, -3);
  for (const voice of voices) {
    if (voice.id.startsWith('hat-')) { assert.equal(voice.chokeGroup, 'hi-hat'); assert.equal(voice.choke, voice.id === 'hat-closed' ? 'hi-hat' : undefined); }
    else { assert.equal(voice.choke, undefined); assert.equal(voice.chokeGroup, undefined); }
    assert.ok(voice.x > 0 && voice.x < 1 && voice.y! > 0 && voice.y! < 1);
  }
});


test('violin retains a gentle onset, audible longer body and shaped release', async () => {
  assert.equal(instruments.violin.preserveSampleEnvelope, true);
  assert.equal(instruments.violin.crossfadeMs, 50);
  for (const sample of instruments.violin.samples!) {
    const wav = await readFile(`assets/audio/${sample}`), frames = wav.readUInt32LE(40)/2;
    assert.equal(frames, 44100*2.4);
    const rms = (start: number, end: number) => {
      let energy=0; const first=Math.round(start*44100), last=Math.round(end*44100);
      for(let i=first;i<last;i++) energy+=wav.readInt16LE(44+i*2)**2;
      return Math.sqrt(energy/(last-first));
    };
    assert.ok(rms(0,.005) < rms(.25,.55)*.3, `${sample}: gentle initial contact`);
    assert.ok(rms(1.4,1.9)>100, `${sample}: audible violin beyond the old cutoff`);
    assert.ok(rms(2.35,2.4)<rms(1.4,1.9)*.15, `${sample}: gentle release`);
    assert.equal(wav.readInt16LE(44),0);
  }
});
