import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { adjacentInstrument, defaultSettings, instrumentIds } from '../src/shared/model';
import { validateSettings } from '../src/shared/settings';
import { SettingsStore } from '../src/settings-store';

test('instrument cycling follows saved order and wraps in both directions', () => {
  for (const order of [[...instrumentIds], [...instrumentIds].reverse()]) {
    for (const [index, id] of order.entries()) {
      assert.equal(adjacentInstrument(order, id, 1), order[(index + 1) % order.length]);
      assert.equal(adjacentInstrument(order, id, -1), order[(index + order.length - 1) % order.length]);
    }
  }
});
test('order migration preserves older preferences and appends new instruments', () => {
  const settings = defaultSettings(), { instrumentOrder, ...legacy } = settings;
  assert.deepEqual(validateSettings(legacy), settings);
  assert.deepEqual(validateSettings({ ...legacy, instrumentOrder: ['piano', 'djembe'] }).instrumentOrder, ['piano', 'djembe', ...instrumentIds.slice(2)]);
  for (const order of [null, 'piano', ['piano', 'piano'], ['unknown']]) assert.throws(() => validateSettings({ ...settings, instrumentOrder: order }), /Instrument order/);
});
test('custom order persists without changing sizes, bindings, themes or positions', async () => {
  const settings = defaultSettings(); settings.instrumentOrder.reverse(); settings.instruments.piano.scale = 1.7;
  const directory = await mkdtemp(join(tmpdir(), 'tapkit-order-'));
  try {
    const store = new SettingsStore(join(directory, 'settings.json')); await store.save(settings);
    assert.deepEqual((await store.load()).settings, settings);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
