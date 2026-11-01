import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, instruments, instrumentIds, instrumentScale, overlayDimensions } from '../src/shared/model';
import { initialSharedLayout, sharedPosition, positionAtAnchor, fitInstrumentScale } from '../src/shared/resizing';
import { validateSettings, setSharedAppearance, shareAppearanceChanges } from '../src/shared/settings';
import { SettingsStore } from '../src/settings-store';

const display = { id: 7, workArea: { x: -1800, y: 30, width: 1800, height: 1200 } };
test('legacy layout adopts the first instrument and becomes one persisted size and position', async () => {
  const settings = defaultSettings();
  settings.instruments.piano.scale = .9;
  settings.positions['piano:7'] = { x: -1000, y: 80 };
  settings.positions['drums:7'] = { x: -800, y: 120 };
  const before = structuredClone(settings);
  settings.layout = initialSharedLayout(settings, 'piano', display);
  assert.deepEqual(settings.layout, { scale: .9, position: { displayId: 7, x: 1286, y: 50 } });
  const next = validateSettings(settings);
  assert.deepEqual(next.positions, {}, 'legacy per-instrument points are retired');
  assert.ok(instrumentIds.every(id => instrumentScale(next.instruments[id]) === .9));
  const staleMirror = structuredClone(next); staleMirror.instruments.piano.scale = 1.7;
  assert.equal(validateSettings(staleMirror).instruments.piano.scale, .9, 'the shared layout is authoritative over legacy size fields');
  for (const id of instrumentIds) {
    assert.equal(next.instruments[id].theme, before.instruments[id].theme);
    assert.deepEqual(next.instruments[id].keys, before.instruments[id].keys);
  }
  const directory = await mkdtemp(join(tmpdir(), 'tapkit-layout-'));
  try {
    const store = new SettingsStore(join(directory, 'settings.json')); await store.save(next);
    assert.deepEqual((await store.load()).settings, next);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('all shapes share the same corner and scale, while temporary fitting cannot move the saved anchor', () => {
  const settings = defaultSettings(); settings.layout = { scale: 1.1, position: { displayId: 7, x: 1700, y: 50 } };
  const before = structuredClone(settings.layout);
  for (const id of instrumentIds) {
    const dimensions = overlayDimensions(id, fitInstrumentScale(id, settings.layout.scale, display.workArea));
    const point = positionAtAnchor(settings.layout.position, dimensions, display.workArea);
    assert.equal(point.x + dimensions.width, display.workArea.x + 1700);
    assert.equal(point.y, display.workArea.y + 50);
    const smallArea = { x: 0, y: 25, width: 620, height: 540 };
    const fitted = overlayDimensions(id, fitInstrumentScale(id, settings.layout.scale, smallArea));
    const clamped = positionAtAnchor(settings.layout.position, fitted, smallArea);
    assert.ok(clamped.x >= smallArea.x && clamped.y >= smallArea.y);
    assert.ok(clamped.x + fitted.width <= smallArea.x + smallArea.width);
    assert.ok(clamped.y + fitted.height <= smallArea.y + smallArea.height);
    assert.deepEqual(settings.layout, before, 'display clamping never causes layout drift');
  }
  const movedDisplay = { ...display, workArea: { ...display.workArea, x: 400, y: -800 } };
  const point = positionAtAnchor(settings.layout.position, overlayDimensions('piano', 1.1), movedDisplay.workArea);
  assert.equal(point.x + overlayDimensions('piano', 1.1).width, 2100);
  assert.equal(point.y, -750, 'display arrangement changes retain the relative placement');
});

test('dragging and resizing update one layout without changing unrelated instrument preferences', () => {
  const settings = defaultSettings(); settings.layout = initialSharedLayout(settings, 'djembe', display);
  settings.instruments.guitar.volume = .32;
  settings.layout.position = sharedPosition({ x: -1200, y: 100, width: 600, height: 550 }, display);
  const anchor = structuredClone(settings.layout.position);
  setSharedAppearance(settings, { scale: 1.25 });
  assert.equal(settings.layout.scale, 1.25);
  assert.deepEqual(settings.layout.position, anchor);
  assert.ok(instrumentIds.every(id => instrumentScale(settings.instruments[id]) === 1.25));
  assert.equal(settings.instruments.guitar.volume, .32);
  const next = structuredClone(settings); next.instruments = defaultSettings().instruments;
  setSharedAppearance(next, { scale: 1 });
  shareAppearanceChanges(settings, next);
  assert.equal(next.layout!.scale, 1, 'Reset defaults resets the single shared scale');
  assert.deepEqual(next.layout!.position, anchor, 'Reset defaults preserves the existing placement');
  const legacyClient = structuredClone(settings); delete legacyClient.layout;
  shareAppearanceChanges(settings, legacyClient);
  assert.deepEqual(legacyClient.layout, settings.layout, 'older form clients cannot discard the layout');
});

test('new layouts default to the current display corner and reject invalid saved geometry', () => {
  const settings = defaultSettings();
  const layout = initialSharedLayout(settings, 'marimba', display);
  assert.deepEqual(layout, { scale: 1, position: { displayId: 7, x: 1776, y: 20 } });
  assert.equal(overlayDimensions('marimba', layout.scale).width, instruments.marimba.width);
  settings.layout = layout;
  for (const scale of [NaN, Infinity, .49, 2.01]) assert.throws(() => validateSettings({ ...settings, layout: { ...layout, scale } }), /50% and 200%/);
  for (const position of [null, { ...layout.position, x: NaN }, { ...layout.position, y: Infinity }, { ...layout.position, displayId: '7' }]) assert.throws(() => validateSettings({ ...settings, layout: { ...layout, position } }), /shared instrument position/);
});
