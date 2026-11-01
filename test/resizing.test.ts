import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, instrumentIds, instruments, overlayDimensions as instrumentDimensions, instrumentScale } from '../src/shared/model';
import { loopDockHeight } from '../src/shared/loops';
import { fitInstrumentScale, resizeInstrument } from '../src/shared/resizing';
import { validateSettings, setSharedAppearance, shareAppearanceChanges } from '../src/shared/settings';
import { SettingsStore } from '../src/settings-store';

test('lower-left resize preserves aspect and top-right anchor for every instrument', () => {
  const workArea = { x: -1600, y: 25, width: 1600, height: 1100 };
  for (const id of instrumentIds) {
    const definition = instruments[id], dimensions = instrumentDimensions(id, 'm');
    const bounds = { x: -dimensions.width - 25, y: 45, ...dimensions }, pointer = { x: bounds.x + 20, y: bounds.y + bounds.height - 20 };
    const origin = { bounds, pointer, scale: 1, workArea };
    const result = resizeInstrument(id, origin, { x: pointer.x - definition.width * .12, y: pointer.y + definition.height * .12 });
    assert.ok(Math.abs(result.scale - 1.12) < .00011);
    assert.equal(result.x + result.width, bounds.x + bounds.width); assert.equal(result.y, bounds.y);
    assert.ok(Math.abs(result.width / definition.width - (result.height - loopDockHeight) / definition.height) < .003);
    assert.ok(result.x >= workArea.x && result.y + result.height <= workArea.y + workArea.height);
    const horizontal = resizeInstrument(id, origin, { x: pointer.x - 50, y: pointer.y });
    const vertical = resizeInstrument(id, origin, { x: pointer.x, y: pointer.y + 50 });
    assert.ok(horizontal.scale > 1 && vertical.scale > 1, 'both drag axes resize in the expected direction');
  }
});
test('resize limits and display fitting keep controls within reachable bounds', () => {
  const workArea = { x: 0, y: 25, width: 1440, height: 850 };
  for (const id of instrumentIds) {
    const origin = { bounds: { x: 100, y: 40, ...instrumentDimensions(id, 'm') }, pointer: { x: 100, y: 100 }, scale: 1, workArea };
    const large = resizeInstrument(id, origin, { x: -10000, y: 10000 });
    const small = resizeInstrument(id, origin, { x: 10000, y: -10000 });
    assert.equal(small.scale, .5); assert.ok(large.scale <= 2);
    assert.ok(large.width <= workArea.width && large.height <= workArea.height);
    assert.ok(large.x >= workArea.x && large.y >= workArea.y);
    assert.ok(large.x + large.width <= workArea.x + workArea.width && large.y + large.height <= workArea.y + workArea.height);
    assert.equal(fitInstrumentScale(id, .75, workArea), .75);
  }
});
test('custom sizes survive settings validation, disk persistence and older preset migration', async () => {
  const settings = defaultSettings();
  settings.instruments.piano.scale = 1.1375; settings.instruments.djembe.scale = .627;
  const candidate = validateSettings(settings);
  assert.equal(instrumentScale(candidate.instruments.piano), 1.1375);
  assert.deepEqual(instrumentDimensions('piano', candidate.instruments.piano), { width: 614, height: 567 });
  assert.equal(instrumentScale(candidate.instruments.guitar), 1);
  const directory = await mkdtemp(join(tmpdir(), 'tapkit-size-'));
  try { const store = new SettingsStore(join(directory, 'settings.json')); await store.save(candidate); assert.deepEqual((await store.load()).settings, candidate); }
  finally { await rm(directory, { recursive: true, force: true }); }
  delete candidate.instruments.piano.scale; candidate.instruments.piano.size = 's';
  assert.equal(instrumentScale(validateSettings(candidate).instruments.piano), .75);
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, .49, 2.01, '1', null]) {
    assert.throws(() => validateSettings({ ...candidate, instruments: { ...candidate.instruments, piano: { ...candidate.instruments.piano, scale: value } } }), /50% and 200%/);
  }
});

test('appearance edits share style and proportional size while preserving instrument preferences', async () => {
  const settings = defaultSettings();
  settings.instruments.piano.volume = .43; settings.instruments.guitar.range = 0;
  settings.instruments.djembe.keys['left-rim'] = 'Q'; settings.positions['piano:1'] = { x: 17, y: 25 };
  settings.loops.guitar = { duration: 1, events: [{ at: 0, voiceId: 'body-tap', range: 0 }] };
  const before = structuredClone(settings);
  setSharedAppearance(settings, { theme: 'gold', scale: 1.1375 });
  for (const id of instrumentIds) {
    assert.equal(settings.instruments[id].theme, 'gold'); assert.equal(instrumentScale(settings.instruments[id]), 1.1375);
    const { theme, size, scale, ...rest } = settings.instruments[id];
    const { theme: oldTheme, size: oldSize, scale: oldScale, ...original } = before.instruments[id];
    assert.deepEqual(rest, original);
  }
  assert.deepEqual(settings.loops, before.loops); assert.deepEqual(settings.positions, before.positions);
  assert.deepEqual(settings.instrumentOrder, before.instrumentOrder);
  const directory = await mkdtemp(join(tmpdir(), 'tapkit-shared-'));
  try { const store = new SettingsStore(join(directory, 'settings.json')); await store.save(settings); assert.deepEqual((await store.load()).settings, settings); }
  finally { await rm(directory, { recursive: true, force: true }); }
});

test('single-instrument form edits propagate atomically and unrelated edits preserve legacy appearance', () => {
  const previous = defaultSettings(); previous.instruments.piano.theme = 'paper'; previous.instruments.guitar.size = 's';
  const unrelated = structuredClone(previous); unrelated.instruments.piano.volume = .2;
  shareAppearanceChanges(previous, unrelated);
  assert.equal(unrelated.instruments.piano.theme, 'paper'); assert.equal(instrumentScale(unrelated.instruments.guitar), .75);
  const candidate = structuredClone(previous); candidate.instruments.piano.theme = 'cartoon'; candidate.instruments.guitar.scale = .85;
  shareAppearanceChanges(previous, candidate);
  assert.ok(instrumentIds.every(id => candidate.instruments[id].theme === 'cartoon' && instrumentScale(candidate.instruments[id]) === .85));
  assert.equal(previous.instruments.djembe.theme, 'classic');
  const conflict = structuredClone(previous); conflict.instruments.piano.theme = 'gold'; conflict.instruments.guitar.theme = 'metal';
  assert.throws(() => shareAppearanceChanges(previous, conflict), /one shared/);
});

test('fitting a large instrument never changes the shared requested size', () => {
  const settings = defaultSettings(); setSharedAppearance(settings, { scale: 1.4 });
  const before = structuredClone(settings);
  const fitted = fitInstrumentScale('drums', instrumentScale(settings.instruments.drums), { x: 0, y: 25, width: 800, height: 600 });
  assert.ok(fitted < 1.4); assert.deepEqual(settings, before);
  assert.equal(fitInstrumentScale('drums', instrumentScale(settings.instruments.drums), { x: 0, y: 25, width: 2000, height: 1800 }), 1.4);
});

test('recorder height stays fixed while the instrument scales', () => {
  for (const id of instrumentIds) for (const scale of [.5, .75, 1, 1.25, 2]) {
    assert.equal(instrumentDimensions(id, scale).height - Math.round(instruments[id].height * scale), loopDockHeight);
  }
});
