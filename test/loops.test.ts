import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LoopCapture, maxLoopEvents, validateLoop } from '../src/shared/loops';
import { defaultSettings } from '../src/shared/model';
import { validateSettings } from '../src/shared/settings';
import { SettingsStore } from '../src/settings-store';

test('loop capture starts at the first note, preserves registers and clamps at ten seconds', () => {
  const capture = new LoopCapture(); assert.equal(capture.finish(100), null);
  capture.add('note-0', 100, 0); capture.add('note-12', 100.25, 3);
  capture.add('note-24', 110, 2);
  assert.deepEqual(capture.finish(115), { duration: 10, events: [{ voiceId: 'note-0', at: 0, range: 0 }, { voiceId: 'note-12', at: .25, range: 3 }] });
  const one = new LoopCapture(); one.add('kick', 15); assert.equal(one.finish(15.01)!.duration, .25);
  for (let i = 0; i < maxLoopEvents + 10; i++) one.add('kick', 15.02 + i * .001);
  assert.equal(one.events.length, maxLoopEvents);
});

test('a five-second performance repeats after five seconds without padding to ten', () => {
  const capture = new LoopCapture();
  capture.add('left-bass', 100); capture.add('right-rim', 102); capture.add('left-bass', 104.5);
  const clip = validateLoop('djembe', capture.finish(105));
  assert.equal(clip.duration, 5);
  assert.deepEqual(clip.events.map(event => event.at), [0, 2, 4.5]);
});

test('loop validation rejects invalid times, registers, voices and excessive event counts', () => {
  const clip = { duration: 1, events: [{ voiceId: 'note-0', at: .5, range: 0 }, { voiceId: 'note-24', at: 0, range: 3 }] };
  assert.deepEqual(validateLoop('piano', clip).events.map(event => event.at), [0, .5]);
  for (const duration of [0, .24, 10.01, Infinity, NaN]) assert.throws(() => validateLoop('piano', { ...clip, duration }));
  for (const event of [{ at: -1, voiceId: 'note-0', range: 0 }, { at: 1, voiceId: 'note-0', range: 0 }, { at: 0, voiceId: 'range-up', range: 0 }, { at: 0, voiceId: 'note-0', range: 9 }, { at: NaN, voiceId: 'note-0', range: 0 }]) assert.throws(() => validateLoop('piano', { duration: 1, events: [event] }));
  assert.throws(() => validateLoop('piano', { duration: 1, events: Array.from({ length: maxLoopEvents + 1 }, () => clip.events[1]) }));
  assert.throws(() => validateLoop('piano', { duration: 1, events: [] }));
});

test('saved loops migrate, persist per instrument, and reset without changing instrument preferences', async () => {
  const settings = defaultSettings(), { loops, ...legacy } = settings;
  assert.deepEqual(validateSettings(legacy).loops, {});
  settings.loops.sampler = { duration: 2, events: [{ at: 0, voiceId: 'pad-kick' }, { at: .5, voiceId: 'pad-bell' }] };
  settings.loops.piano = { duration: 1, events: [{ at: 0, voiceId: 'note-0', range: 1 }] };
  const directory = await mkdtemp(join(tmpdir(), 'tapkit-loops-'));
  try {
    const store = new SettingsStore(join(directory, 'settings.json')); await store.save(settings);
    const next = (await store.load()).settings; assert.deepEqual(next, settings);
    delete next.loops.sampler; await store.save(next);
    const reset = (await store.load()).settings;
    assert.equal(reset.loops.sampler, undefined); assert.deepEqual(reset.loops.piano, settings.loops.piano);
    assert.deepEqual(reset.instruments, settings.instruments);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
