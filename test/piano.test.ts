import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { defaultSettings, instrumentBindings, instruments, voicesFor } from '../src/shared/model';
import { pianoKeys, pianoKeyCenter, pianoLayout, pianoRoots, pianoSampleFile } from '../src/shared/piano';
import { noteLabel } from '../src/shared/melody';
import { validateSettings } from '../src/shared/settings';

test('piano covers C2–C7 with 25 chromatic notes per window and nearby recorded roots', () => {
  const pitches = new Set<number>();
  assert.equal(instruments.piano.defaultRange, 2);
  assert.equal(instruments.piano.ranges![2].label, 'C4–C6');
  assert.equal(instrumentBindings('piano').length, 27);
  for (const [range, definition] of instruments.piano.ranges!.entries()) {
    const voices = voicesFor('piano', range);
    assert.equal(voices.length, 25); assert.equal(voices.filter(voice => !voice.black).length, 15);
    voices.forEach((voice, index) => {
      pitches.add(voice.midi!);
      assert.equal(voice.midi, definition.start + index); assert.equal(voice.label, noteLabel(voice.midi!));
      assert.equal(Number(voice.sample.match(/(\d)/)![1]), Math.floor((voice.midi! - voice.semitones) / 12) - 1);
      assert.ok(Math.abs(voice.semitones) <= 1); assert.ok(instruments.piano.samples!.includes(voice.sample));
      assert.equal(voice.hand, index < 12 ? 'left' : 'right');
    });
  }
  assert.deepEqual([...pitches].sort((a, b) => a - b), Array.from({ length: 61 }, (_, index) => index + 36));
});

test('25 keys fit the original keyboard and fingertip centers remain inside each key', () => {
  assert.equal(instruments.piano.width, 540);
  const keys = voicesFor('piano');
  const width = pianoLayout.width / pianoLayout.whiteKeys;
  let previousCenter = 0;
  for (const voice of keys) {
    const left = pianoLayout.left + voice.x * width;
    const right = left + width * (voice.black ? pianoLayout.blackWidth : 1);
    const center = pianoKeyCenter(voice);
    assert.ok(left >= pianoLayout.left && right <= pianoLayout.left + pianoLayout.width + .001);
    assert.ok(center > left && center < right && center > previousCenter);
    previousCenter = center;
  }
  assert.deepEqual(pianoKeys.slice(0, 13), ['A', 'W', 'S', 'E', 'D', 'F', 'T', 'G', 'Y', 'H', 'U', 'J', 'K']);
  assert.equal(new Set([...pianoKeys, 'Z', 'X']).size, 27);
});

function legacySettings() {
  const settings = defaultSettings(), piano = settings.instruments.piano;
  delete piano.range;
  piano.keys = Object.fromEntries(pianoKeys.slice(0, 13).map((key, index) => [`note-${index}`, key]));
  piano.theme = 'cartoon'; piano.size = 's'; piano.volume = .43;
  settings.positions['piano:1'] = { x: 150, y: 90 };
  return settings;
}
test('legacy piano settings acquire 12 notes and octave controls without losing preferences', () => {
  const before = legacySettings(), next = validateSettings(before);
  assert.deepEqual(next.instruments.piano, { ...before.instruments.piano, keys: { ...before.instruments.piano.keys, ...Object.fromEntries(instrumentBindings('piano').slice(13).map(binding => [binding.id, binding.key])) }, range: 2 });
  assert.deepEqual(next.positions, before.positions);
  assert.deepEqual(validateSettings(next), next, 'migration is idempotent');
});
test('piano migration preserves custom Z/X/numeric notes and rejects incomplete newer maps', () => {
  const before = legacySettings();
  Object.assign(before.instruments.piano.keys, { 'note-0': 'Z', 'note-1': 'X', 'note-2': '1' });
  const migrated = validateSettings(before);
  for (const [id, key] of Object.entries(before.instruments.piano.keys)) assert.equal(migrated.instruments.piano.keys[id], key);
  assert.equal(new Set(Object.values(migrated.instruments.piano.keys)).size, 27);
  assert.notEqual(migrated.instruments.piano.keys['range-down'], 'Z');
  const invalid = defaultSettings(); delete invalid.instruments.piano.keys['note-24'];
  assert.throws(() => validateSettings(invalid), /single letters or numbers/);
  const duplicate = defaultSettings(); duplicate.instruments.piano.keys['range-down'] = 'A';
  assert.throws(() => validateSettings(duplicate), /duplicate/);
});
test('all 21 piano sample roots have bundled MP3 recordings', async () => {
  for (const root of pianoRoots) {
    const file = pianoSampleFile(root), bytes = await readFile(`assets/audio/${file}`);
    assert.ok(bytes.length > 5000, `${file} contains recorded audio, not just metadata`);
    assert.ok(bytes.toString('ascii', 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0), `${file} is MP3`);
  }
});
