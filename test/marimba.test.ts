import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { defaultSettings, instrumentIds, instruments, instrumentBindings, voicesFor } from '../src/shared/model';
import { validateSettings, setSharedAppearance } from '../src/shared/settings';
import { marimbaBar, marimbaLayout, marimbaRoots, marimbaSampleFile } from '../src/shared/marimba';
import { pianoKeys } from '../src/shared/piano';
import { sampleBounds } from '../src/shared/audio-samples';

test('marimba covers C3–C7 with 25 chromatic notes and familiar keys in each register', () => {
  const pitches = new Set<number>();
  assert.equal(instrumentBindings('marimba').length, 27);
  for (const [range, definition] of instruments.marimba.ranges!.entries()) {
    const voices = voicesFor('marimba', range);
    assert.deepEqual(voices.map(voice => voice.key), pianoKeys);
    for (const [index, voice] of voices.entries()) {
      pitches.add(voice.midi!);
      assert.equal(voice.midi, definition.start + index);
      assert.equal(Number(voice.sample.match(/marimba-(\d+)/)![1]) + voice.semitones, voice.midi);
      assert.ok(Math.abs(voice.semitones) <= 3, 'nearby samples retain wooden-bar timbre');
      assert.ok(instruments.marimba.samples!.includes(voice.sample));
      assert.equal(voice.hand, index < 12 ? 'left' : 'right');
      const bar = marimbaBar(index);
      assert.ok(bar.left > 0 && bar.left + bar.width < marimbaLayout.width);
      assert.ok(bar.contactY > bar.top && bar.contactY < bar.top + bar.height);
      assert.ok(Math.abs(voice.x * marimbaLayout.width - bar.centerX) < 1e-10);
      assert.ok(Math.abs(voice.y! * marimbaLayout.height - bar.contactY) < 1e-10);
    }
    assert.equal(voices.filter(voice => voice.black).length, 10);
  }
  assert.deepEqual([...pitches].sort((a, b) => a - b), Array.from({ length: 49 }, (_, i) => 48 + i));
});

test('older preferences gain marimba with shared appearance, independent volume and a collision-free shortcut', () => {
  const old = defaultSettings();
  setSharedAppearance(old, { theme: 'gold', scale: 1.3 });
  old.instrumentOrder.reverse(); old.instrumentOrder = old.instrumentOrder.filter(id => id !== 'marimba');
  delete (old.instruments as Partial<typeof old.instruments>).marimba;
  old.instruments.guitar.shortcut = instruments.marimba.shortcut;
  const next = validateSettings(old);
  assert.deepEqual(next.instrumentOrder, [...old.instrumentOrder, 'marimba']);
  for (const id of old.instrumentOrder) assert.deepEqual(next.instruments[id], old.instruments[id]);
  assert.equal(next.instruments.marimba.theme, 'gold'); assert.equal(next.instruments.marimba.scale, 1.3);
  assert.equal(next.instruments.marimba.volume, .75);
  assert.equal(new Set(instrumentIds.map(id => next.instruments[id].shortcut)).size, instrumentIds.length);
  assert.deepEqual(validateSettings(next), next);
  next.loops.marimba = { duration: 1, events: [{ at: 0, voiceId: 'note-0', range: 0 }, { at: .5, voiceId: 'note-24', range: 2 }] };
  assert.deepEqual(validateSettings(next).loops, next.loops);
  next.instruments.marimba.keys['range-up'] = 'A';
  assert.throws(() => validateSettings(next), /duplicate playing key/);
});

test('recorded marimba roots have prompt attacks, natural decays, correct octaves and clean boundaries', async () => {
  for (const root of marimbaRoots) {
    const wav = await readFile(`assets/audio/${marimbaSampleFile(root)}`);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.readUInt32LE(24), 44100); assert.equal(wav.readUInt16LE(22), 1);
    const pcm = Float32Array.from({ length: wav.readUInt32LE(40) / 2 }, (_, i) => wav.readInt16LE(44 + i * 2) / 32768);
    assert.ok(pcm.length / 44100 > 1.5 && pcm.length / 44100 <= 7);
    assert.ok(sampleBounds([pcm], 44100).start < 441, 'audible onset is within 10ms');
    assert.equal(pcm[0], 0); assert.equal(pcm.at(-1), 0);
    const expected = 440 * 2 ** ((root - 69) / 12);
    // Locate the strongest fundamental near either possible octave convention.
    let maximum = 0, measured = 0;
    for (let frequency = expected * .48; frequency <= expected * 2.04; frequency += expected * .002) {
      const coefficient = 2 * Math.cos(2 * Math.PI * frequency / 44100);
      let previous = 0, older = 0;
      for (const value of pcm.subarray(1000, 16000)) { const next = value + coefficient * previous - older; older = previous; previous = next; }
      const energy = previous ** 2 + older ** 2 - coefficient * previous * older;
      if (energy > maximum) { maximum = energy; measured = frequency; }
    }
    assert.ok(Math.abs(12 * Math.log2(measured / expected)) < .15, `${root} recording sounds in the intended octave`);
    let tail = 0;
    for (const value of pcm.subarray(11025, 22050)) tail += value ** 2;
    assert.ok(tail > .001, 'recorded resonance survives rapid overlapping hits');
  }
});
