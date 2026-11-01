import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleBounds } from '../src/shared/audio-samples';
import { defaultSettings, instrumentDimensions } from '../src/shared/model';
import { validateSettings } from '../src/shared/settings';

test('sample preparation skips quiet lead-in and retains a short attack preroll', () => {
  const channel = new Float32Array(4800);
  channel.fill(0.003, 0, 480); // bleed previously mistaken for the beginning of a bass strike
  channel[480] = 0.1;
  channel[500] = 1;
  const result = sampleBounds([channel], 48000);
  assert.equal(result.start, 470);
  assert.equal(result.peak, 1);
  assert.equal(result.length, 4330);
});

test('stereo attack detection keeps channels aligned and handles attacks at frame zero', () => {
  const left = new Float32Array(1000), right = new Float32Array(1000);
  left[500] = 1; right[100] = 0.5;
  assert.equal(sampleBounds([left, right], 48000).start, 90);
  left[0] = 1;
  assert.equal(sampleBounds([left, right], 48000).start, 0);
  assert.throws(() => sampleBounds([new Float32Array(10)], 48000), /silent/);
});

test('old settings migrate to M, while per-instrument sizes survive validation', () => {
  const old = defaultSettings();
  delete (old.instruments.djembe as Partial<typeof old.instruments.djembe>).size;
  delete (old.instruments.piano as Partial<typeof old.instruments.piano>).size;
  assert.equal(validateSettings(old).instruments.djembe.size, 'm');
  old.instruments.piano.size = 's'; old.instruments.djembe.size = 'l';
  const result = validateSettings(old);
  assert.equal(result.instruments.piano.size, 's');
  assert.equal(result.instruments.djembe.size, 'l');
  assert.throws(() => validateSettings({ ...old, instruments: { ...old.instruments, piano: { ...old.instruments.piano, size: 'xl' } } }), /Choose S, M, or L/);
});

test('preset dimensions scale the entire window from the original M size', () => {
  assert.deepEqual(instrumentDimensions('piano', 's'), { width: 405, height: 300 });
  assert.deepEqual(instrumentDimensions('piano', 'm'), { width: 540, height: 400 });
  assert.deepEqual(instrumentDimensions('piano', 'l'), { width: 675, height: 500 });
  assert.deepEqual(instrumentDimensions('djembe', 's'), { width: 293, height: 368 });
  assert.deepEqual(instrumentDimensions('djembe', 'l'), { width: 488, height: 613 });
});


test('prepared violin envelopes retain the complete soft attack and release', () => {
  const channel = new Float32Array(1000); channel[300] = .5; channel[999] = .001;
  const bounds = sampleBounds([channel], 48000, false);
  assert.equal(bounds.start, 0); assert.equal(bounds.length, 1000); assert.equal(bounds.peak, .5);
  assert.ok(sampleBounds([channel], 48000).start > 0, 'default drum/keyboard attack trimming is unchanged');
});
