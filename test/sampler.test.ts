import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { defaultSettings, instruments, instrumentIds, themeIds } from '../src/shared/model';
import { samplerKeys, samplerLayout, samplerPad, samplerPadColours, samplerPadMaterials, samplerSounds } from '../src/shared/sampler';
import { validateSettings } from '../src/shared/settings';

test('sampler has 25 distinct playable sounds arranged in a square five-by-five grid', () => {
  const definition = instruments.sampler;
  assert.equal(definition.width, definition.height);
  assert.equal(definition.voices.length, 25);
  assert.deepEqual(definition.voices.map(voice => voice.key), samplerKeys);
  assert.equal(new Set(samplerKeys).size, 25);
  assert.equal(new Set(definition.voices.map(voice => voice.sample)).size, 25);
  const pads = definition.voices.map((voice, index) => {
    const pad = samplerPad(index);
    assert.ok(Math.abs(voice.x * definition.width - pad.left - pad.size / 2) < 1e-6);
    assert.ok(Math.abs(voice.y! * definition.height - pad.top - pad.size / 2) < 1e-6);
    assert.ok(pad.left >= samplerLayout.left && pad.left + pad.size <= samplerLayout.left + samplerLayout.body);
    assert.ok(pad.top >= samplerLayout.top && pad.top + pad.size <= samplerLayout.top + samplerLayout.body);
    return pad;
  });
  assert.equal(new Set(pads.map(pad => pad.left)).size, 5);
  assert.equal(new Set(pads.map(pad => pad.top)).size, 5);
  for (const theme of themeIds) assert.equal(new Set(pads.map((_, index) => samplerPadColours(index, theme).face)).size, 25);
});

test('all sampler WAVs contain distinct audible signals with bounded durations and clean boundaries', async () => {
  const hashes = new Set<string>();
  for (const sound of samplerSounds) {
    const wav = await readFile(`assets/audio/sampler-${sound.recipe}.wav`);
    hashes.add(createHash('sha256').update(wav).digest('hex'));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.readUInt16LE(22), 1); assert.equal(wav.readUInt32LE(24), 44100);
    assert.equal(wav.readUInt16LE(34), 16);
    const frames = wav.readUInt32LE(40) / 2;
    assert.ok(Math.abs(frames / 44100 - sound.seconds) < 1 / 44100);
    let peak = 0, energy = 0;
    for (let i = 0; i < frames; i++) { const value = wav.readInt16LE(44 + i * 2); peak = Math.max(peak, Math.abs(value)); energy += value * value; }
    assert.ok(peak > 10000 && peak < 32767, `${sound.id}: audible, unclipped peak`);
    assert.ok(Math.sqrt(energy / frames) > peak * .02, `${sound.id}: real signal beyond an isolated transient`);
    assert.equal(wav.readInt16LE(44), 0, `${sound.id}: clean attack boundary`);
    assert.equal(wav.readInt16LE(wav.length - 2), 0, `${sound.id}: clean tail boundary`);
  }
  assert.equal(hashes.size, 25);
});

test('pad tints stay close to their theme material, with gold and paper especially subtle', () => {
  for (const theme of themeIds) for (let index = 0; index < 25; index++) {
    const colours = samplerPadColours(index, theme), material = samplerPadMaterials[theme];
    for (const layer of ['face', 'light', 'dark'] as const) {
      const channels = colours[layer].match(/[\d.]+/g)!.map(Number);
      const base = [1, 3, 5].map(start => parseInt(material[layer].slice(start, start + 2), 16));
      const difference = Math.max(...channels.map((value, channel) => Math.abs(value - base[channel])));
      assert.ok(difference <= (theme === 'paper' ? 6 : theme === 'gold' ? 13 : 27), `${theme}: tint must not replace the material colour`);
    }
    if (theme === 'gold') {
      const [r, g, b] = colours.face.match(/[\d.]+/g)!.map(Number);
      assert.ok(r > g && g > b + 70, 'every gold button still reads as gold');
    }
  }
});

test('electronic bank preserves old pad IDs and custom keys when sounds are replaced', () => {
  assert.deepEqual(samplerSounds.map(sound => sound.id), ['kick','snare','clap','snap','cowbell','clave','shaker','tambourine','rim','metal','laser','zap','space','robot','coin','bell','chime','marimba','bass','chord','whoosh','reverse','scratch','bubble','horn']);
  const settings = defaultSettings(); settings.instruments.sampler.keys['pad-clave'] = 'N';
  const next = validateSettings(settings);
  assert.equal(next.instruments.sampler.keys['pad-clave'], 'N');
  assert.equal(instruments.sampler.voices.find(voice => voice.id === 'pad-clave')!.label, 'Sub drop');
});

test('sub drop retains audible deep bass well beyond one second', async () => {
  const wav = await readFile('assets/audio/sampler-sub-drop.wav');
  const start = 44100, end = 44100 * 2;
  let energy = 0, crossings = 0, previous = wav.readInt16LE(44 + (start - 1) * 2);
  for (let i = start; i < end; i++) {
    const value = wav.readInt16LE(44 + i * 2); energy += value * value;
    if (previous <= 0 && value > 0) crossings++; previous = value;
  }
  assert.ok(Math.sqrt(energy / (end - start)) > 700, 'drop must ring with audible bass, not silent padding');
  assert.ok(crossings >= 34 && crossings <= 45, 'tail settles into a deep sub-bass register');
});

test('house kick retains a deep drum body and the revised bank keeps its pad assignments', async () => {
  assert.equal(samplerSounds[0].name, 'House kick'); assert.equal(samplerSounds[0].seconds, 1.8);
  const wav = await readFile('assets/audio/sampler-kick.wav');
  let energy = 0, crossings = 0, previous = 0;
  for (let i = 22050; i < 44100; i++) {
    const value = wav.readInt16LE(44 + i * 2); energy += value * value;
    if (previous <= 0 && value > 0) crossings++; previous = value;
  }
  assert.ok(Math.sqrt(energy / 22050) > 1000, 'deeper beat retains its body after the old decay');
  assert.ok(crossings >= 20 && crossings <= 22, 'body settles near 41 Hz');
  assert.deepEqual(samplerSounds.slice(1, 5).map(sound => sound.recipe), ['vocal-go','tape-stop','vocal-go-chop','vocal-echo']);
  assert.deepEqual([17,18,19,21,22].map(index => samplerSounds[index].recipe), ['ring-mod','house-keys','house-chord','house-organ','house-pluck']);
});

test('eight-instrument settings gain the sampler without changing existing preferences or order', () => {
  const previous = defaultSettings();
  previous.instruments.piano.volume = .43;
  previous.instruments.piano.keys['note-0'] = 'L';
  previous.instruments.drums.scale = 1.37;
  previous.instrumentOrder = instrumentIds.filter(id => id !== 'sampler').reverse();
  const legacy = structuredClone(previous);
  delete (legacy.instruments as Partial<typeof legacy.instruments>).sampler;
  // Deliberately occupy the new default summon to exercise migration's fallback.
  legacy.instruments.guitar.shortcut = instruments.sampler.shortcut;
  const migrated = validateSettings(legacy);
  assert.deepEqual(migrated.instrumentOrder, [...previous.instrumentOrder, 'sampler']);
  for (const id of previous.instrumentOrder) assert.deepEqual(migrated.instruments[id], legacy.instruments[id]);
  assert.equal(migrated.instruments.sampler.volume, .75);
  assert.equal(new Set(Object.values(migrated.instruments).map(item => item.shortcut)).size, instrumentIds.length);
  assert.deepEqual(migrated.instruments.sampler.keys, defaultSettings().instruments.sampler.keys);
  assert.deepEqual(validateSettings(migrated), migrated);
});
