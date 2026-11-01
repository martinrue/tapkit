import { loopToggleShortcut } from '../src/shared/loops';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings, instrumentIds, instruments, instrumentBindings } from '../src/shared/model';
import { normalizeAccelerator, validateSettings, clampPosition } from '../src/shared/settings';
import { ShortcutRegistry, shortcutDispatcher, type ShortcutAdapter } from '../src/shortcuts';
import { SettingsStore } from '../src/settings-store';

function fakeShortcuts() {
  const registered = new Map<string, () => void>();
  const unavailable = new Set<string>();
  const adapter: ShortcutAdapter = {
    register(key, callback) { if (unavailable.has(key) || registered.has(key)) return false; registered.set(key, callback); return true; },
    unregister(key) { registered.delete(key); },
  };
  return { registered, unavailable, adapter };
}

test('shortcut transitions release playing keys while retaining summon keys', () => {
  const fake = fakeShortcuts(); const actions: string[] = [];
  const registry = new ShortcutRegistry(fake.adapter, action => actions.push(action));
  const summon = { accelerator: 'CommandOrControl+Alt+D', action: 'summon:djembe' };
  registry.replace([summon]);
  registry.replace([summon, { accelerator: 'F', action: 'voice:left-bass' }, { accelerator: 'G', action: 'voice:center-bass' }, { accelerator: 'Escape', action: 'hide' }]);
  fake.registered.get('F')!(); fake.registered.get('G')!(); assert.deepEqual(actions, ['voice:left-bass', 'voice:center-bass']);
  registry.replace([summon]); assert.deepEqual([...fake.registered.keys()], [summon.accelerator]);
  registry.replace([]); assert.equal(fake.registered.size, 0);
  registry.replace([summon]); fake.registered.get(summon.accelerator)!(); assert.equal(actions.at(-1), 'summon:djembe');
  registry.release(); assert.equal(fake.registered.size, 0);
});

test('failed registration rolls back the complete previous shortcut set', () => {
  const fake = fakeShortcuts(); const registry = new ShortcutRegistry(fake.adapter, () => {});
  const original = [{ accelerator: 'D', action: 'old-left' }, { accelerator: 'F', action: 'old-right' }];
  registry.replace(original); fake.unavailable.add('K');
  assert.throws(() => registry.replace([{ accelerator: 'J', action: 'new-left' }, { accelerator: 'K', action: 'new-right' }]), /unavailable/);
  assert.deepEqual(registry.bindings(), original); assert.deepEqual([...fake.registered.keys()], ['D', 'F']);
  assert.equal(fake.registered.has('J'), false);
});

test('swapping playing keys reuses native registrations and dispatches the new voices', () => {
  const fake = fakeShortcuts(); const actions: string[] = [];
  const registry = new ShortcutRegistry(fake.adapter, action => actions.push(action));
  registry.replace([{ accelerator: 'D', action: 'left' }, { accelerator: 'F', action: 'right' }]);
  const original = fake.registered.get('D');
  registry.replace([{ accelerator: 'F', action: 'left' }, { accelerator: 'D', action: 'right' }]);
  assert.equal(fake.registered.get('D'), original);
  fake.registered.get('D')!(); assert.deepEqual(actions, ['right']);
});

test('hide and instrument switches retain unchanged native hotkey IDs', () => {
  const fake = fakeShortcuts(); const registry = new ShortcutRegistry(fake.adapter, () => {});
  const summon = { accelerator: 'CommandOrControl+Alt+D', action: 'summon:djembe' };
  registry.replace([summon, { accelerator: 'F', action: 'voice:bass' }]);
  const original = fake.registered.get(summon.accelerator);
  registry.replace([summon]);
  assert.equal(fake.registered.get(summon.accelerator), original);
  registry.replace([summon, { accelerator: 'F', action: 'voice:note' }]);
  assert.equal(fake.registered.get(summon.accelerator), original);
  const playing = fake.registered.get('F');
  registry.replace([summon, { accelerator: 'f', action: 'voice:new-note' }]);
  assert.equal(fake.registered.get('F'), playing, 'case changes retain the original native registration');
  registry.release(); assert.equal(fake.registered.size, 0);
});

test('failed shortcut edits never unregister existing hotkeys', () => {
  const fake = fakeShortcuts(); const actions: string[] = [];
  const registry = new ShortcutRegistry(fake.adapter, action => actions.push(action));
  const original = [{ accelerator: 'D', action: 'left' }, { accelerator: 'F', action: 'right' }];
  registry.replace(original); const callback = fake.registered.get('D')!;
  fake.unavailable.add('K'); fake.unavailable.add('D');
  assert.throws(() => registry.replace([{ accelerator: 'D', action: 'changed' }, { accelerator: 'J', action: 'new' }, { accelerator: 'K', action: 'blocked' }]), /unavailable/);
  assert.deepEqual(registry.bindings(), original);
  assert.equal(fake.registered.get('D'), callback);
  callback(); assert.deepEqual(actions, ['left']);
  assert.equal(fake.registered.has('J'), false);
});

test('released callbacks cannot fire or trigger a later registration for the same key', () => {
  const fake = fakeShortcuts(); const actions: string[] = [];
  const registry = new ShortcutRegistry(fake.adapter, action => actions.push(action));
  registry.replace([{ accelerator: 'F', action: 'voice:old' }]);
  const stale = fake.registered.get('F')!;
  registry.release(); stale();
  registry.replace([{ accelerator: 'F', action: 'voice:new' }]); stale();
  assert.deepEqual(actions, []);
  fake.registered.get('F')!(); assert.deepEqual(actions, ['voice:new']);
});

test('shortcut commands leave the native callback before releasing keys; voices stay immediate', () => {
  const fake = fakeShortcuts(); const pending: (() => void)[] = []; const actions: string[] = [];
  const registry = new ShortcutRegistry(fake.adapter, shortcutDispatcher(action => {
    actions.push(action); if (action === 'hide') registry.release();
  }, callback => pending.push(callback)));
  registry.replace([{ accelerator: 'Escape', action: 'hide' }, { accelerator: 'F', action: 'voice:bass' }]);
  fake.registered.get('F')!(); assert.deepEqual(actions, ['voice:bass']);
  fake.registered.get('Escape')!();
  assert.equal(fake.registered.size, 2, 'no unregistration inside the native callback');
  assert.equal(pending.length, 1);
  pending.shift()!(); assert.equal(fake.registered.size, 0);
  assert.deepEqual(actions, ['voice:bass', 'hide']);
  const dispatch = shortcutDispatcher(action => actions.push(action), callback => pending.push(callback));
  dispatch('cycle:left'); dispatch('cycle:left'); dispatch('cycle:right');
  for (const callback of pending) callback();
  assert.deepEqual(actions.slice(-3), ['cycle:left', 'cycle:left', 'cycle:right'], 'rapid navigation preserves every press and its order');
});

test('case-insensitive duplicate shortcut sets do not disturb existing bindings', () => {
  const fake = fakeShortcuts(); const registry = new ShortcutRegistry(fake.adapter, () => {});
  registry.replace([{ accelerator: 'F', action: 'left' }]);
  assert.throws(() => registry.replace([{ accelerator: 'D', action: 'left' }, { accelerator: 'd', action: 'right' }]), /Duplicate/);
  assert.equal(fake.registered.has('F'), true);
});

test('settings normalize keys, allow overlap across instruments, and reject duplicates within one', () => {
  const defaults = defaultSettings();
  assert.deepEqual(validateSettings(defaults), defaults);
  defaults.instruments.djembe.keys['left-rim'] = 'd';
  assert.equal(validateSettings(defaults).instruments.djembe.keys['left-rim'], 'D');
  defaults.instruments.djembe.keys['left-rim'] = 'F';
  assert.throws(() => validateSettings(defaults), /duplicate playing key F/);
});

test('invalid settings are rejected before reaching Electron', () => {
  for (const bad of [null, {}, { version: 3 }, { ...defaultSettings(), instruments: {} }]) assert.throws(() => validateSettings(bad));
  const settings = defaultSettings(); settings.instruments.piano.volume = Number.NaN;
  assert.throws(() => validateSettings(settings), /Volume/);
  settings.instruments.piano.volume = .5; settings.instruments.piano.shortcut = 'd';
  assert.throws(() => validateSettings(settings), /modifiers/);
  settings.instruments.piano.shortcut = settings.instruments.djembe.shortcut;
  assert.throws(() => validateSettings(settings), /different summon/);
  assert.equal(normalizeAccelerator('alt+cmd+d'), 'CommandOrControl+Alt+D');
});

test('position clamping handles removed displays, negative coordinates, and small work areas', () => {
  assert.deepEqual(clampPosition({ x: 5000, y: -400 }, { width: 390, height: 490 }, { x: 0, y: 25, width: 1440, height: 875 }), { x: 1050, y: 25 });
  assert.deepEqual(clampPosition({ x: -2000, y: 900 }, { width: 540, height: 400 }, { x: -1440, y: 0, width: 1440, height: 900 }), { x: -1440, y: 500 });
  assert.deepEqual(clampPosition({ x: 100, y: 100 }, { width: 540, height: 400 }, { x: 0, y: 0, width: 320, height: 200 }), { x: 0, y: 0 });
});

test('settings persist atomically and queued saves keep the latest value', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tapkit-test-'));
  try {
    const path = join(directory, 'settings.json'); const store = new SettingsStore(path);
    assert.deepEqual((await store.load()).settings, defaultSettings());
    const first = defaultSettings(); const second = defaultSettings(); second.instruments.piano.theme = 'neon';
    await Promise.all([store.save(first), store.save(second)]);
    assert.equal((await store.load()).settings.instruments.piano.theme, 'neon');
    const contents = await readFile(path, 'utf8'); assert.equal(JSON.parse(contents).version, 1);
    await writeFile(path, '{broken');
    const loaded = await store.load(); assert.ok(loaded.warning); assert.deepEqual(loaded.settings, defaultSettings());
    assert.equal(await readFile(path, 'utf8'), '{broken');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('legacy Studio preferences migrate to Classic without resetting bindings or volume', () => {
  const previous = defaultSettings();
  const old = { ...previous, instruments: {
    ...previous.instruments,
    djembe: { ...previous.instruments.djembe, theme: 'studio', volume: .37, size: 's', keys: { ...previous.instruments.djembe.keys, 'left-rim': 'Q' } },
  } };
  const next = validateSettings(old);
  assert.equal(next.instruments.djembe.theme, 'classic');
  assert.equal(next.instruments.djembe.volume, .37);
  assert.equal(next.instruments.djembe.size, 's');
  assert.equal(next.instruments.djembe.keys['left-rim'], 'Q');
  assert.deepEqual(next.instruments.piano, previous.instruments.piano);
});

test('replaced Ceramic preferences migrate to Paper without resetting the instrument', () => {
  const previous = defaultSettings();
  const old = { ...previous, instruments: { ...previous.instruments, piano: { ...previous.instruments.piano, theme: 'ceramic', volume: .41, size: 'l' } } };
  const next = validateSettings(old);
  assert.equal(next.instruments.piano.theme, 'paper');
  assert.equal(next.instruments.piano.volume, .41);
  assert.equal(next.instruments.piano.size, 'l');
  assert.deepEqual(next.instruments.piano.keys, previous.instruments.piano.keys);
});

test('legacy four-key maps add the hard bass without replacing custom keys', () => {
  const old = defaultSettings();
  delete old.instruments.djembe.keys['center-bass'];
  assert.equal(validateSettings(old).instruments.djembe.keys['center-bass'], 'G');
  old.instruments.djembe.keys['left-rim'] = 'g';
  const migrated = validateSettings(old);
  assert.equal(migrated.instruments.djembe.keys['left-rim'], 'G');
  assert.equal(migrated.instruments.djembe.keys['center-bass'], 'H');
  assert.equal(migrated.instruments.djembe.keys['left-bass'], 'F');
  migrated.instruments.djembe.keys['center-bass'] = 'R';
  assert.equal(validateSettings(migrated).instruments.djembe.keys['center-bass'], 'R');
  migrated.instruments.djembe.keys['center-bass'] = 'F';
  assert.throws(() => validateSettings(migrated), /duplicate playing key F/);
});

test('Terrarium migrates to Cartoon while retaining the rest of the settings', () => {
  const old = defaultSettings();
  const before = { ...old, instruments: { ...old.instruments, djembe: { ...old.instruments.djembe, theme: 'terrarium', volume: .42 } } };
  const migrated = validateSettings(before);
  assert.equal(migrated.instruments.djembe.theme, 'cartoon');
  assert.equal(migrated.instruments.djembe.volume, .42);
  assert.deepEqual(migrated.instruments.djembe.keys, old.instruments.djembe.keys);
});

test('two-instrument settings acquire handpan and tambourine without losing custom preferences', async () => {
  const defaults = defaultSettings();
  const previous = {
    version: 1,
    instruments: {
      djembe: { ...defaults.instruments.djembe, theme: 'gold', volume: .43, shortcut: 'CommandOrControl+Alt+H' },
      piano: { ...defaults.instruments.piano, size: 'l', shortcut: 'CommandOrControl+Alt+T' },
    },
    positions: { 'djembe:1': { x: 120, y: 80 } },
  };
  const directory = await mkdtemp(join(tmpdir(), 'tapkit-migration-'));
  try {
    const path = join(directory, 'settings.json'); await writeFile(path, JSON.stringify(previous));
    const { settings, warning } = await new SettingsStore(path).load();
    assert.equal(warning, undefined);
    assert.deepEqual(settings.instruments.djembe, previous.instruments.djembe);
    assert.deepEqual(settings.instruments.piano, previous.instruments.piano);
    assert.deepEqual({ ...settings.positions }, previous.positions);
    assert.equal(new Set(instrumentIds.map(id => settings.instruments[id].shortcut)).size, instrumentIds.length, 'new summon shortcuts avoid existing custom H/T shortcuts');
    assert.deepEqual(settings.instruments.handpan.keys, defaults.instruments.handpan.keys);
    settings.instruments.handpan.theme = 'paper'; settings.instruments.tambourine.size = 's';
    settings.positions['handpan:2'] = { x: -400, y: 90 }; settings.positions['tambourine:1'] = { x: 600, y: 50 };
    const store = new SettingsStore(path); await store.save(settings);
    assert.deepEqual((await store.load()).settings, settings, 'new instruments and display positions persist');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('new instrument playing keys swap without leaking old keys or summon registrations', () => {
  const fake = fakeShortcuts(); const actions: string[] = [];
  const registry = new ShortcutRegistry(fake.adapter, action => actions.push(action));
  const settings = defaultSettings();
  const summons = instrumentIds.map(id => ({ accelerator: settings.instruments[id].shortcut, action: `summon:${id}` }));
  for (const id of instrumentIds) {
    const voices = instrumentBindings(id).map(voice => ({ accelerator: settings.instruments[id].keys[voice.id], action: `${id}:${voice.id}` }));
    registry.replace([...summons, ...voices]);
    assert.equal(fake.registered.size, instrumentIds.length + voices.length);
    for (const voice of voices) { fake.registered.get(voice.accelerator)!(); assert.equal(actions.at(-1), voice.action); }
    registry.replace(summons); assert.equal(fake.registered.size, instrumentIds.length, 'hide/settings/desktop release all playing keys');
  }
  registry.release(); assert.equal(fake.registered.size, 0);
});


test('recorder shortcut prefers L and avoids customized summon shortcuts', () => {
  const settings = defaultSettings();
  assert.equal(loopToggleShortcut(settings), 'CommandOrControl+Alt+L');
  settings.instruments.piano.shortcut = 'CommandOrControl+Alt+L';
  assert.equal(loopToggleShortcut(settings), 'CommandOrControl+Alt+Shift+L');
  settings.instruments.djembe.shortcut = 'CommandOrControl+Alt+Shift+L';
  const selected = loopToggleShortcut(settings);
  assert.ok(!Object.values(settings.instruments).some(item => item.shortcut === selected));
});
