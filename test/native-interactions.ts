import { loopToggleShortcut } from '../src/shared/loops';
import { app, BrowserWindow, globalShortcut, Tray, Menu, screen, ipcMain } from 'electron';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defaultSettings, instrumentIds, instruments, instrumentArtwork, adjacentInstrument, instrumentScale, overlayDimensions as instrumentDimensions, type AppState, type InstrumentId } from '../src/shared/model';
import { fitInstrumentScale, positionAtAnchor, sharedPosition } from '../src/shared/resizing';

// Exercise real main/preload/renderer IPC and native window bounds. Never reserve user keys.
const profile = resolve('.artifacts/interaction-profile');
mkdirSync(resolve(profile, 'Shared Dictionary/cache'), { recursive: true });
process.env.TAPKIT_DATA_DIR = profile;
app.setPath('userData', profile);
let lastWindow: BrowserWindow | undefined;
const hideCalls = new WeakMap<BrowserWindow, number>();
const revealCalls = new WeakMap<BrowserWindow, number>();
const revealChecks: Promise<void>[] = [];
const revealErrors: string[] = [];
let readyGate: { entered: boolean; wait: Promise<void> } | null = null;
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => handle(channel, async (event, ...args) => {
  const gate = channel === 'tapkit:ready' ? readyGate : null;
  if (gate) { readyGate = null; gate.entered = true; await gate.wait; }
  if (!event.sender.isDestroyed()) return listener(event, ...args);
});
function holdNextReveal() {
  let release!: () => void;
  const gate = { entered: false, wait: new Promise<void>(resolve => { release = resolve; }) };
  readyGate = gate;
  return { gate, release };
}
const registered = new Map<string, () => void>();
let nativeShortcutCallback = false;
let lastMenu: Menu | null = null;
const setMenu = Tray.prototype.setContextMenu;
Tray.prototype.setContextMenu = function(menu) { lastMenu = menu; setMenu.call(this, menu); };
globalShortcut.register = (key, callback) => {
  assert.equal(nativeShortcutCallback, false, 'native registrations never change inside a shortcut callback');
  if (registered.has(key)) return false;
  registered.set(key, () => { nativeShortcutCallback = true; try { callback(); } finally { nativeShortcutCallback = false; } });
  return true;
};
globalShortcut.unregister = key => {
  assert.equal(nativeShortcutCallback, false, 'native registrations never change inside a shortcut callback');
  registered.delete(key);
};
app.on('browser-window-created', (_event, win) => {
  const hide = win.hide.bind(win);
  win.hide = () => { hideCalls.set(win, (hideCalls.get(win) ?? 0) + 1); hide(); };
  win.webContents.setAudioMuted(true);
  // Keep all windows hidden and unthrottled so the test never interferes with desktop input.
  win.show = () => {};
  win.showInactive = () => {
    revealCalls.set(win, (revealCalls.get(win) ?? 0) + 1);
    revealChecks.push(win.webContents.executeJavaScript(`({prepared:document.querySelector('#app').dataset.prepared,complete:[...document.querySelectorAll('.instrument-body,.hand img')].every(image=>image.complete&&image.naturalWidth>0)})`).then(result => {
      assert.equal(result.prepared, 'true', 'native reveal waits for decoded audio/artwork and a complete painted frame');
      assert.equal(result.complete, true, 'first reveal includes the body and both hand images');
    }).catch(error => { if (!win.isDestroyed()) revealErrors.push(String(error)); }));
  };
  win.webContents.setBackgroundThrottling(false);
});
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until<T>(fn: () => Promise<T> | T, label: string): Promise<NonNullable<T>> {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { try { const value = await fn(); if (value) return value as NonNullable<T>; } catch {} await wait(30); }
  throw new Error(`Timed out: ${label}`);
}
function instrumentWindow(id: InstrumentId) { return BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes(`instrument=${id}`)); }
const state = (win: BrowserWindow): Promise<AppState> => win.webContents.executeJavaScript('window.tapkit.getState()');
let mouseHeld = false;
const mouse = (win: BrowserWindow, type: 'mouseMove' | 'mouseDown' | 'mouseUp', x: number, y: number, count = 1) => {
  if (type === 'mouseDown') mouseHeld = true;
  if (type === 'mouseUp') mouseHeld = false;
  win.webContents.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), globalX: Math.round(win.getBounds().x + x), globalY: Math.round(win.getBounds().y + y), modifiers: mouseHeld ? ['leftbuttondown'] : [], button: 'left', clickCount: count });
};

async function opaquePoint(win: BrowserWindow) {
  return win.webContents.executeJavaScript(`(() => {
    const image = document.querySelector('.instrument-body'); const rect = image.getBoundingClientRect();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0); const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let y = Math.ceil(rect.top + rect.height * .30); y < rect.top + rect.height * .7; y += 3) for (let x = Math.ceil(rect.left + rect.width * .3); x < rect.left + rect.width * .7; x += 3) {
      const solid = [-2, 0, 2].every(dy => [-2, 0, 2].every(dx => {
        const px = Math.floor((x + dx - rect.left) / rect.width * canvas.width), py = Math.floor((y + dy - rect.top) / rect.height * canvas.height);
        return data[(py * canvas.width + px) * 4 + 3] > 220;
      }));
      if (solid && !document.elementFromPoint(x, y)?.closest('button, input, .keyboard')) return { x, y };
    }
    throw new Error('No opaque test point');
  })()`);
}
async function hover(win: BrowserWindow) {
  const point = await opaquePoint(win); mouse(win, 'mouseMove', point.x, point.y);
  await until(() => win.webContents.executeJavaScript('document.body.classList.contains("instrument-hover")'), 'opaque artwork hover: ' + win.webContents.getURL());
  return point;
}

void (async () => {
  const restoring = process.argv.includes('--restore');
  if (!restoring) await rm(resolve(profile, 'settings.json'), { force: true });
  await import('../src/main');
  await app.whenReady();
  // Wait for main's asynchronous settings load and IPC registration.
  await wait(250);
  assert.equal(Menu.getApplicationMenu()!.items[0].submenu!.items.find(item => item.label === 'Settings…')!.accelerator, 'CommandOrControl+,', 'focused Tapkit supports the standard Settings shortcut');
  const closeCommand = Menu.getApplicationMenu()!.getMenuItemById('close-window')!;
  assert.equal(closeCommand.accelerator, 'CommandOrControl+W', 'focused Settings supports the native close-window shortcut');
  if (restoring) {
    const saved = JSON.parse(await readFile(resolve(profile, 'settings.json'), 'utf8'));
    for (const id of instrumentIds) {
      app.emit('second-instance', {}, ['tapkit', `--instrument=${id}`], process.cwd(), {});
      const win = await until(() => instrumentWindow(id), `${id} restored overlay`);
      await until(async () => (await state(win)).playing, `${id} restored readiness`);
      const item = (await state(win)).settings.instruments[id];
      assert.deepEqual((await state(win)).settings.instrumentOrder, saved.instrumentOrder);
      assert.deepEqual((await state(win)).settings.loops, saved.loops, 'saved loops survive a full process restart');
      assert.deepEqual((await state(win)).settings.layout, saved.layout, 'one shared size/position survives restart and cycling');
      const restoredDisplay = screen.getAllDisplays().find(display => display.id === saved.layout.position.displayId) ?? screen.getPrimaryDisplay();
      const expectedPosition = positionAtAnchor(saved.layout.position, instrumentDimensions(id, (await state(win)).overlayScale!), restoredDisplay.workArea);
      assert.deepEqual({ x: win.getBounds().x, y: win.getBounds().y }, expectedPosition);
      assert.equal(item.scale, saved.instruments[id].scale);
      assert.equal(item.theme, saved.instruments[id].theme);
      assert.ok(instrumentIds.every(other => instrumentScale(saved.instruments[other]) === instrumentScale(item) && saved.instruments[other].theme === item.theme), 'shared appearance survives restart');
      assert.deepEqual({ width: win.getBounds().width, height: win.getBounds().height }, instrumentDimensions(id, (await state(win)).overlayScale ?? item.scale!));
      const width = await win.webContents.executeJavaScript('document.querySelector("#app").getBoundingClientRect().width');
      assert.ok(Math.abs(width - win.getBounds().width) <= .5);
    }
    assert.deepEqual(lastMenu!.items.filter(item => item.type === 'checkbox').map(item => item.label), saved.instrumentOrder.map((id: InstrumentId) => instruments[id].name));
    await Promise.all(revealChecks); assert.deepEqual(revealErrors, []);
    console.log('Native restart persistence passed:', instrumentIds.length, 'shared size/theme and instrument order.');
    app.quit(); return;
  }
  // A slow replacement must never expose an empty window or remove the complete one.
  app.emit('second-instance', {}, ['tapkit', '--instrument=djembe'], process.cwd(), {});
  const original = await until(() => instrumentWindow('djembe'), 'initial transition source');
  await until(async () => (await state(original)).playing, 'transition source ready');
  const summonCallbacks = instrumentIds.map(id => registered.get(instruments[id].shortcut));
  const replacement = holdNextReveal();
  app.emit('second-instance', {}, ['tapkit', '--instrument=piano'], process.cwd(), {});
  await until(() => replacement.gate.entered, 'replacement reaches paint barrier');
  const pending = instrumentWindow('piano')!;
  assert.equal(original.isDestroyed(), false, 'previous complete instrument stays until replacement is ready');
  assert.equal(revealCalls.get(pending) ?? 0, 0, 'pending replacement is never shown early');
  assert.equal((await state(pending)).playing, false);
  assert.ok(registered.has('Left') && registered.has('Right') && registered.has('Escape'), 'navigation and hide remain available during preparation');
  replacement.release();
  await until(async () => original.isDestroyed() && (await state(pending)).playing, 'replacement commits atomically');
  assert.deepEqual(instrumentIds.map(id => registered.get(instruments[id].shortcut)), summonCallbacks, 'instrument changes retain native summon registrations');
  const cancelled = holdNextReveal();
  app.emit('second-instance', {}, ['tapkit', '--instrument=handpan'], process.cwd(), {});
  await until(() => cancelled.gate.entered, 'cancellable replacement prepares');
  const cancelledWindow = instrumentWindow('handpan')!;
  registered.get('Escape')!();
  await new Promise<void>(resolve => setImmediate(resolve)); // Leave the native hotkey callback before cancelling.
  cancelled.release(); await wait(80);
  assert.equal(revealCalls.get(cancelledWindow) ?? 0, 0, 'late readiness cannot resurrect a hidden replacement');
  assert.equal(pending.isDestroyed(), true, 'hiding during preparation removes the retained instrument');
  assert.equal(registered.size, instrumentIds.length, 'cancelling releases navigation and playing keys');
  const scales: Partial<Record<InstrumentId, number>> = {};
  for (const id of instrumentIds) {
    app.emit('second-instance', {}, ['tapkit', `--instrument=${id}`], process.cwd(), {});
    const win = await until(() => instrumentWindow(id), `${id} overlay`);
    await until(async () => (await state(win)).playing, `${id} ready`);
    if (app.dock) assert.equal(app.dock.isVisible(), false, `${id}: opening an instrument never shows the Dock icon`);
    const initialState = await state(win), layout = initialState.settings.layout!;
    assert.equal(instrumentScale(initialState.settings.instruments[id]), layout.scale);
    const initialDisplay = screen.getAllDisplays().find(display => display.id === layout.position.displayId) ?? screen.getPrimaryDisplay();
    assert.deepEqual({ x: win.getBounds().x, y: win.getBounds().y }, positionAtAnchor(layout.position, instrumentDimensions(id, initialState.overlayScale!), initialDisplay.workArea), 'every instrument opens at the shared anchor');
    lastWindow = win;
    if (id === 'guitar') {
      const key = (await state(win)).settings.instruments.guitar.keys['body-tap'];
      assert.equal(key, 'B'); assert.ok(registered.has(key), 'visible guitar reserves its body-tap key');
      await win.webContents.executeJavaScript(`window.bodyTapHits=0; const create=AudioContext.prototype.createBufferSource; AudioContext.prototype.createBufferSource=function(){const source=create.call(this),start=source.start.bind(source);source.start=function(...args){window.bodyTapHits++;return start(...args);};return source;};void 0;`);
      registered.get(key)!();
      await until(() => win.webContents.executeJavaScript(`window.bodyTapHits===1 && parseFloat(document.querySelector('.hand-right').style.left)>450`), 'native B callback plays the body tap and moves the hand');
      for (const theme of ['classic', 'cartoon'] as const) {
        await win.webContents.executeJavaScript(`window.tapkit.setTheme('${theme}')`);
        await until(() => win.webContents.executeJavaScript(`document.querySelector('.instrument-body').src.endsWith('${instrumentArtwork(id, theme)}')`), `body tap ${theme} artwork`);
        registered.get(key)!();
        await until(() => win.webContents.executeJavaScript(`Boolean(document.querySelector('.hand-right').getAnimations()[0])`), 'body tap rebound');
        await win.webContents.executeJavaScript(`(() => { const motion=document.querySelector('.hand-right').getAnimations()[0];motion.pause();motion.currentTime=0; })()`);
        await writeFile(resolve(`.artifacts/guitar-body-tap-${theme}.png`), (await win.webContents.capturePage()).toPNG());
        await win.webContents.executeJavaScript(`document.querySelector('.hand-right').getAnimations()[0]?.play();void 0;`);
      }
    }
    await win.webContents.executeJavaScript(`window.inputTrace=[]; for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,event=>window.inputTrace.push({type,target:event.target.className,x:event.clientX,y:event.clientY}),true);`);
    const recorderShortcut = loopToggleShortcut((await state(win)).settings);
    assert.equal(await win.webContents.executeJavaScript('document.querySelector(".loop-dock").hidden'), true, 'recorder starts closed');
    registered.get(recorderShortcut)!();
    await until(() => win.webContents.executeJavaScript('!document.querySelector(".loop-dock").hidden'), 'shortcut opens recorder');
    if (id === 'sampler') {
      await win.webContents.executeJavaScript('document.querySelector("[data-loop=record]").click()');
      for (const key of ['1', '6', 'A']) { registered.get(key)!(); await wait(100); }
      await win.webContents.executeJavaScript('document.querySelector("[data-loop=record]").click()');
      await until(() => win.webContents.executeJavaScript('!document.querySelector("[data-loop=play]").disabled'), 'native loop records, saves and renders');
      assert.equal((await state(win)).settings.loops.sampler!.events.length, 3);
      await win.webContents.executeJavaScript('document.querySelector("[data-loop=play]").click()'); await wait(100);
      registered.get('S')!();
      assert.ok((await win.webContents.executeJavaScript('document.querySelector("[data-loop=play]").textContent')).includes('Pause'));
      await win.webContents.executeJavaScript('document.querySelector("[data-loop=play]").click()');
    }
    await hover(win);
    const controls = await win.webContents.executeJavaScript(`(() => {
      const buttons = [...document.querySelectorAll('.overlay-controls button')].map(button => button.getBoundingClientRect());
      const toggle = document.querySelector('.loop-toggle').getBoundingClientRect();
      return { aligned: Math.max(...buttons.map(r=>r.y+r.height/2))-Math.min(...buttons.map(r=>r.y+r.height/2)) < 1, ordered: buttons.every((r,i)=>!i || r.left>buttons[i-1].left), x:toggle.x+toggle.width/2,y:toggle.y+toggle.height/2 };
    })()`);
    assert.ok(controls.aligned && controls.ordered, 'resize, recorder and themes share one row');
    mouse(win, 'mouseMove', controls.x, controls.y); await wait(100); mouse(win, 'mouseDown', controls.x, controls.y); mouse(win, 'mouseUp', controls.x, controls.y);
    await until(() => win.webContents.executeJavaScript('document.querySelector(".loop-dock").hidden'), `${id} hover icon closes recorder`);
    mouse(win, 'mouseMove', 2, 2);
    await until(() => win.webContents.executeJavaScript('!document.body.classList.contains("instrument-hover") && getComputedStyle(document.querySelector(".key-legend")).visibility === "hidden" && getComputedStyle(document.querySelector(".resize-grip")).visibility === "hidden"'), 'floating controls stay hidden while idle');
    assert.equal(win.isFocusable(), false);
    assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll(".instrument-toolbar, .instrument-footer, .playing-label").length'), 0);
    assert.equal(await win.webContents.executeJavaScript('getComputedStyle(document.querySelector(".resize-grip")).visibility'), 'hidden');
    // Transparent surroundings neither reveal controls nor open settings.
    mouse(win, 'mouseMove', 2, 2);
    mouse(win, 'mouseDown', 2, 2, 2); mouse(win, 'mouseUp', 2, 2, 2);
    assert.equal(BrowserWindow.getAllWindows().some(w => w.webContents.getURL().includes('view=settings')), false);
    await hover(win);
    const grip = await win.webContents.executeJavaScript('(() => { const r=document.querySelector(".resize-grip").getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()');
    const before = win.getBounds(), beforeScale = (await state(win)).overlayScale!;
    const direction = beforeScale > .9 ? -1 : 1, dx = -35 * direction, dy = 45 * direction;
    lastWindow = win;
    await win.webContents.executeJavaScript(`window.inputTrace=[]; for(const type of ['pointerdown','pointerup','pointermove','mousedown','mouseup','mousemove','lostpointercapture'])document.addEventListener(type,event=>window.inputTrace.push({type,target:event.target.className,detail:event.detail,button:event.button,x:event.clientX,y:event.clientY,screenX:event.screenX,screenY:event.screenY}),true);`);
    mouse(win, 'mouseMove', grip.x, grip.y); await wait(150); mouse(win, 'mouseDown', grip.x, grip.y);
    await until(() => win.webContents.executeJavaScript('document.body.classList.contains("resizing")'), `${id} resize starts`);
    // Alternate shrinking/growing to avoid the display cap with a shared size.
    mouse(win, 'mouseMove', grip.x + dx, grip.y + dy);
    await until(async () => Math.abs(((await state(win)).settings.instruments[id].scale ?? 1) - beforeScale) > .001, `${id} live scale`);
    const during = win.getBounds();
    assert.ok((during.width - before.width) * direction > 0 && (during.height - before.height) * direction > 0);
    assert.equal(during.x + during.width, before.x + before.width);
    assert.equal(during.y, before.y);
    assert.equal(await win.webContents.executeJavaScript('document.body.classList.contains("resizing")'), true, 'resize capture survives native setBounds');
    // Screen point stays fixed as the native left edge moves during the drag.
    mouse(win, 'mouseUp', before.x + grip.x + dx - during.x, grip.y + dy);
    await until(() => win.webContents.executeJavaScript('!document.body.classList.contains("resizing")'), `${id} resize ends`);
    const resized = await state(win), scale = resized.settings.instruments[id].scale!;
    scales[id] = scale;
    assert.ok(instrumentIds.every(other => instrumentScale(resized.settings.instruments[other]) === scale), 'resizing any instrument shares its scale with all others');
    assert.deepEqual({ width: win.getBounds().width, height: win.getBounds().height }, instrumentDimensions(id, scale));
    await until(() => registered.size === instrumentIds.length + Object.keys(resized.settings.instruments[id].keys).length + 5, `${id} resize restores playing shortcuts`);
    await until(async () => JSON.parse(await readFile(resolve(profile, 'settings.json'), 'utf8')).instruments[id].scale === scale, `${id} resize persisted`);
    if (id === 'djembe' || id === 'piano') {
      await hover(win); await wait(160);
      await writeFile(resolve(`.artifacts/${id}-hover-v011.png`), (await win.webContents.capturePage()).toPNG());
    }
    // Header removal keeps the body draggable, including at custom scales.
    const bodyPoint = await hover(win), beforeDrag = win.getBounds();
    mouse(win, 'mouseDown', bodyPoint.x, bodyPoint.y);
    await until(() => win.webContents.executeJavaScript('document.body.classList.contains("dragging")'), `${id} body drag`);
    mouse(win, 'mouseMove', bodyPoint.x - 12, bodyPoint.y + 12);
    await until(() => win.getBounds().x < beforeDrag.x, `${id} moves`);
    mouse(win, 'mouseUp', bodyPoint.x, bodyPoint.y);
    await until(() => win.webContents.executeJavaScript('!document.body.classList.contains("dragging")'), `${id} drag ends`);
    assert.equal(win.getBounds().width, beforeDrag.width); assert.equal(win.getBounds().height, beforeDrag.height);
    await until(async () => {
      const next = await state(win), bounds = win.getBounds();
      return JSON.stringify(next.settings.layout!.position) === JSON.stringify(sharedPosition(bounds, screen.getDisplayMatching(bounds)));
    }, 'drag updates the shared position');
    if (id === 'piano') {
      await hover(win);
      const cancelGrip = await win.webContents.executeJavaScript('(() => { const r=document.querySelector(".resize-grip").getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()');
      mouse(win, 'mouseMove', cancelGrip.x, cancelGrip.y); await wait(100); mouse(win, 'mouseDown', cancelGrip.x, cancelGrip.y);
      await until(() => win.webContents.executeJavaScript('document.body.classList.contains("resizing")'), 'resize before desktop change');
      await win.webContents.executeJavaScript('window.tapkit.visibility(false)');
      await until(async () => !(await state(win)).playing && await win.webContents.executeJavaScript('!document.body.classList.contains("resizing")'), 'desktop change cancels resize');
      assert.equal(registered.size, instrumentIds.length, 'desktop change releases all playing keys');
      mouse(win, 'mouseUp', cancelGrip.x, cancelGrip.y);
      await win.webContents.executeJavaScript('window.tapkit.visibility(true)');
      await until(async () => (await state(win)).playing, 'desktop return reacquires keys');
      assert.equal((await state(win)).settings.instruments.piano.scale, scale);
    }
    // The standalone hover dots switch themes without opening Settings.
    await hover(win);
    const dot = await win.webContents.executeJavaScript('(() => { const r=document.querySelector(".theme-dot[data-theme=paper]").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()');
    mouse(win, 'mouseMove', dot.x, dot.y); await wait(80); mouse(win, 'mouseDown', dot.x, dot.y); mouse(win, 'mouseUp', dot.x, dot.y);
    await until(async () => (await state(win)).settings.instruments[id].theme === 'paper', `${id} hover theme changes`);
    const themed = await state(win);
    assert.ok(instrumentIds.every(other => themed.settings.instruments[other].theme === 'paper'), 'hover dots change the style for all instruments');
    assert.ok(instrumentIds.every(other => instrumentScale(themed.settings.instruments[other]) === scale), 'style changes keep the shared size');
    await until(() => win.webContents.executeJavaScript(`document.querySelector('.instrument-body').src.endsWith('${instrumentArtwork(id, 'paper')}')`), `${id} theme artwork ready`);
    // Pointer leaves: chrome disappears, keyboard playback remains active.
    mouse(win, 'mouseMove', 2, 2);
    await until(() => win.webContents.executeJavaScript('getComputedStyle(document.querySelector(".overlay-themes")).visibility === "hidden"'), `${id} hover controls disappear after leaving`);
    assert.equal((await state(win)).playing, true);
    // Rapid playing and double-clicking artwork must never open Settings.
    const point = await hover(win);
    mouse(win, 'mouseDown', point.x, point.y, 2); mouse(win, 'mouseUp', point.x, point.y, 2);
    await wait(80);
    assert.equal(BrowserWindow.getAllWindows().some(w => w.webContents.getURL().includes('view=settings')), false, `${id}: double-click does not open Settings`);
    if (id === 'sampler' || id === 'piano') {
      await win.webContents.executeJavaScript(`window.rapidHits = 0; const originalSource = AudioContext.prototype.createBufferSource; AudioContext.prototype.createBufferSource = function() { const source = originalSource.call(this), start = source.start; source.start = function(...args) { window.rapidHits++; return start.apply(this, args); }; return source; }; void 0;`);
      const pad = await win.webContents.executeJavaScript('(() => { const r=document.querySelector(".sampler-pad, .piano-key").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height*.8};})()');
      mouse(win, 'mouseMove', pad.x, pad.y);
      for (const count of [1, 2, 3]) { mouse(win, 'mouseDown', pad.x, pad.y, count); mouse(win, 'mouseUp', pad.x, pad.y, count); await wait(20); }
      await until(() => win.webContents.executeJavaScript('window.rapidHits === 3'), `${id} rapid pointer taps all play`);
      assert.equal(BrowserWindow.getAllWindows().some(w => w.webContents.getURL().includes('view=settings')), false, 'rapid playing never opens Settings');
    }
    assert.ok(registered.has('CommandOrControl+,'), 'Settings shortcut works while the unfocused overlay is visible');
    const hiddenBeforeSettings = hideCalls.get(win) ?? 0;
    registered.get('CommandOrControl+,')!();
    const preferences = await until(() => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=settings')), `${id} shortcut Settings`);
    await until(() => preferences.webContents.executeJavaScript(`document.querySelector('.nav-instrument.selected')?.dataset.instrument === '${id}'`), `${id} settings selection`);
    if (app.dock) assert.equal(app.dock.isVisible(), false, `${id}: Settings keeps the Dock icon hidden`);
    assert.equal(registered.size, 0, 'opening Settings releases playing and summon keys');
    assert.ok((hideCalls.get(win) ?? 0) > hiddenBeforeSettings, 'opening Settings hides the native instrument window');
    assert.equal((await state(win)).playing, false, 'floating instrument stops playing while its Settings preview is open');
    assert.ok(lastMenu!.items.filter(item => item.type === 'checkbox').every(item => !item.checked), 'no floating instrument remains selected in the menubar');
    assert.equal(await preferences.webContents.executeJavaScript('document.querySelectorAll(".custom-size-label, .size-option, .preview-loop, .loop-panel, .loop-dock, .loop-toggle").length'), 0, 'Settings contains no recorder or size presets');
    assert.equal(await preferences.webContents.executeJavaScript('getComputedStyle(document.querySelector(".instrument-preview")).transform'), 'matrix(1, 0, 0, 1, 0, 0)');
    closeCommand.click({}, preferences, preferences.webContents);
    await until(() => preferences.isDestroyed() && registered.size === instrumentIds.length, 'settings close restores only summon shortcuts');
    assert.equal((await state(win)).playing, false, 'closing Settings leaves the floating instrument hidden');
    assert.equal(registered.has('CommandOrControl+,'), false);
    assert.equal(registered.has('Left'), false);
    assert.equal(registered.has('Escape'), false);
    assert.equal(registered.has(recorderShortcut), false, 'hidden instrument releases recorder shortcut');
  }
  const saved = JSON.parse(await readFile(resolve(profile, 'settings.json'), 'utf8'));
  const sharedScale = scales[instrumentIds.at(-1)!]!;
  assert.equal(saved.layout.scale, sharedScale);
  assert.deepEqual(saved.positions, {}, 'per-instrument positions are no longer saved');
  for (const id of instrumentIds) assert.equal(saved.instruments[id].scale, sharedScale);
  assert.notDeepEqual(saved, defaultSettings());
  // Recreate a resized overlay and confirm both persisted bounds and renderer scale.
  app.emit('second-instance', {}, ['tapkit', '--instrument=piano'], process.cwd(), {});
  const piano = await until(() => instrumentWindow('piano'), 'piano reopens');
  await until(async () => (await state(piano)).playing, 'reopened piano ready');
  assert.equal(instrumentScale((await state(piano)).settings.instruments.piano), sharedScale);
  await piano.webContents.executeJavaScript('window.tapkit.openSettings()');
  const preferences = await until(() => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('view=settings')), 'reorder settings');
  await until(() => preferences.webContents.executeJavaScript('Boolean(document.querySelector(".instrument-preview[aria-busy=false]"))'), 'reorder preview');
  await preferences.webContents.executeJavaScript(`document.querySelector('.theme-card[data-theme="gold"]').click()`);
  await until(async () => {
    const next = await state(piano);
    return instrumentIds.every(id => next.settings.instruments[id].theme === 'gold');
  }, 'Settings style changes all instruments');
  assert.ok(instrumentIds.every(id => (saved.instruments[id].scale === sharedScale)));
  const order = [...instrumentIds].reverse();
  assert.equal(await preferences.webContents.executeJavaScript(`(async()=>{const state=await window.tapkit.getState();state.settings.instrumentOrder=${JSON.stringify(order)};state.settings.loops={};return (await window.tapkit.saveSettings(state.settings)).ok;})()`), true);
  assert.equal((await state(piano)).settings.loops.sampler!.events.length, 3, 'an unrelated form save cannot erase a recorded loop');
  assert.deepEqual(lastMenu!.items.filter(item => item.type === 'checkbox').map(item => item.label), order.map(id => instruments[id].name));
  assert.deepEqual(lastMenu!.items.filter(item => item.enabled && item.type !== 'separator').map(item => item.label), [...order.map(id => instruments[id].name), 'Settings…', 'Quit Tapkit'], 'menubar only offers instruments, Settings and Quit');
  await preferences.webContents.executeJavaScript('window.tapkit.closeSettings()');
  await until(() => preferences.isDestroyed() && registered.size === instrumentIds.length, 'reorder Settings closes without reopening piano');
  registered.get((await state(piano)).settings.instruments.piano.shortcut)!();
  await until(async () => { const win = instrumentWindow('piano'); return win && win !== piano && (await state(win)).playing; }, 'summon reopens hidden piano before cycling');
  let current: InstrumentId = 'piano';
  for (let i = 0; i < instrumentIds.length; i++) {
    current = adjacentInstrument(order, current, 1); registered.get('Right')!();
    await until(async () => { const win = instrumentWindow(current); return win && (await state(win)).playing; }, `${current} right cycle`);
    const next = instrumentWindow(current)!;
    const nextState = await state(next);
    assert.ok(instrumentIds.every(id => nextState.settings.instruments[id].theme === 'gold' && instrumentScale(nextState.settings.instruments[id]) === sharedScale), 'arrow cycling retains shared style and size');
    assert.deepEqual(nextState.settings.layout, saved.layout, 'switching instruments never overwrites the shared placement');
    assert.ok(await next.webContents.executeJavaScript(`document.querySelector('.instrument-body').src.endsWith('${instrumentArtwork(current, 'gold')}')`));
  }
  // Rapid callbacks must advance from the requested instrument, including while it loads.
  for (let i = 0; i < 3; i++) { current = adjacentInstrument(order, current, -1); registered.get('Left')!(); }
  const cycled = await until(() => instrumentWindow(current), 'rapid cycling window');
  await until(async () => (await state(cycled)).playing, 'rapid cycling ready');
  assert.equal((await state(cycled)).activeInstrument, current);
  assert.deepEqual({ width: cycled.getBounds().width, height: cycled.getBounds().height }, instrumentDimensions(current, (await state(cycled)).settings.instruments[current]));
  await cycled.webContents.executeJavaScript('window.tapkit.visibility(false)');
  await until(() => !registered.has('Left') && !registered.has('Right') && !registered.has('CommandOrControl+,'), 'desktop change releases arrows');
  await cycled.webContents.executeJavaScript('window.tapkit.visibility(true)');
  await until(() => registered.has('Left') && registered.has('Right') && registered.has('CommandOrControl+,'), 'desktop return restores arrows');
  await cycled.webContents.executeJavaScript('window.tapkit.hide()');
  await until(() => !registered.has('Left') && !registered.has('Right') && !registered.has('CommandOrControl+,'), 'hide releases arrows');
  assert.equal(registered.size, instrumentIds.length);
  // A temporary fit must not become a new global size when cycling large instruments.
  const nearest = screen.getDisplayNearestPoint.bind(screen);
  const allDisplays = screen.getAllDisplays.bind(screen);
  const smallArea = { x: 0, y: 25, width: 600, height: 500 };
  screen.getDisplayNearestPoint = point => ({ ...nearest(point), workArea: smallArea });
  screen.getAllDisplays = () => allDisplays().map(display => ({ ...display, workArea: smallArea }));
  app.emit('second-instance', {}, ['tapkit', '--instrument=drums'], process.cwd(), {});
  const fitted = await until(() => instrumentWindow('drums'), 'small-display drum kit');
  await until(async () => (await state(fitted)).playing, 'small-display kit ready');
  const fittedState = await state(fitted);
  assert.ok(fittedState.overlayScale! < sharedScale);
  assert.deepEqual({ width: fitted.getBounds().width, height: fitted.getBounds().height }, instrumentDimensions('drums', fittedState.overlayScale!));
  assert.ok(instrumentIds.every(id => instrumentScale(fittedState.settings.instruments[id]) === sharedScale), 'display fit preserves every requested size');
  assert.deepEqual(fittedState.settings.layout, saved.layout, 'temporary display fitting cannot change the shared anchor');
  assert.ok(Math.abs(await fitted.webContents.executeJavaScript('document.querySelector("#app").getBoundingClientRect().width') - fitted.getBounds().width) <= .5);
  screen.getDisplayNearestPoint = nearest;
  screen.getAllDisplays = allDisplays;
  await fitted.webContents.executeJavaScript('window.tapkit.hide()');
  app.emit('second-instance', {}, ['tapkit', '--instrument=drums'], process.cwd(), {});
  const restored = await until(() => { const win = instrumentWindow('drums'); return win && win !== fitted ? win : undefined; }, 'drum kit returns to normal display');
  await until(async () => (await state(restored)).playing, 'restored display ready');
  const expectedFit = fitInstrumentScale('drums', sharedScale, nearest(screen.getCursorScreenPoint()).workArea);
  assert.equal((await state(restored)).overlayScale, expectedFit);
  await restored.webContents.executeJavaScript('window.tapkit.hide()');
  const layoutBeforeReset = structuredClone((await state(restored)).settings.layout!);
  app.emit('second-instance', {}, ['tapkit', '--settings'], process.cwd(), {});
  const resetPreferences = await until(() => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('view=settings')), 'shared layout Reset defaults');
  await until(() => resetPreferences.webContents.executeJavaScript('Boolean(document.querySelector(".reset-button"))'), 'Reset defaults ready');
  await resetPreferences.webContents.executeJavaScript('document.querySelector(".reset-button").click()');
  await until(async () => (await state(restored)).settings.layout!.scale === 1, 'Reset defaults updates the authoritative shared size');
  assert.deepEqual((await state(restored)).settings.layout!.position, layoutBeforeReset.position, 'Settings changes preserve the shared position');
  const resetState = await state(restored);
  assert.ok(instrumentIds.every(id => instrumentScale(resetState.settings.instruments[id]) === 1), 'Reset defaults shares one size across all instruments');
  await until(async () => JSON.parse(await readFile(resolve(profile, 'settings.json'), 'utf8')).layout.scale === 1, 'shared layout reset persists');
  closeCommand.click({}, resetPreferences, resetPreferences.webContents);
  await until(() => resetPreferences.isDestroyed(), 'shared layout Reset defaults closes');
  await writeFile(resolve('.artifacts/interaction-check.json'), JSON.stringify({ instruments: instrumentIds.length, scales, order, persistence: true, rapidClicks: true, settingsShortcut: true, settingsHidesOverlay: true, recorderShortcut: true, unifiedHoverRow: true, hover: true, nativePointerCapture: true, cycling: true, rapidCycling: true, arrowLifecycle: true }, null, 2));
  await Promise.all(revealChecks); assert.deepEqual(revealErrors, []);
  console.log('Native interactions passed:', instrumentIds.length, 'instruments; complete-frame reveal, atomic switching/cancellation, shared resize/theme, arrow cycling, temporary display fitting, persistence, hover controls and shortcut release.');
  app.quit();
})().catch(async error => { console.error(error); if(lastWindow&&!lastWindow.isDestroyed()){console.error(await lastWindow.webContents.executeJavaScript('({trace:window.inputTrace,body:document.body.className,gripStyle:getComputedStyle(document.querySelector(".resize-grip")).visibility})'));await writeFile(resolve('.artifacts/interaction-failure.png'),(await lastWindow.webContents.capturePage()).toPNG());}app.exit(1); });
