import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron';
import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateSettings } from '../src/shared/settings';
import { SettingsStore } from '../src/settings-store';
import { samplerKeys, samplerPad } from '../src/shared/sampler';
import { marimbaBar, marimbaLayout } from '../src/shared/marimba';
import assert from 'node:assert/strict';
import { defaultSettings, instruments, instrumentIds as allInstrumentIds, overlayDimensions as instrumentDimensions, instrumentArtwork, voicesFor, sizeIds, themeIds as allThemeIds, handGroupFilter, handArtwork, type AppState, type TimingReport, type Settings, type InstrumentId } from '../src/shared/model';

// Optional focused runs; omitted filters exercise the full application matrix.
const instrumentIds = allInstrumentIds.filter(id => !process.env.TAPKIT_CHECK_INSTRUMENTS || process.env.TAPKIT_CHECK_INSTRUMENTS.split(',').includes(id));
const themeIds = allThemeIds.filter(id => !process.env.TAPKIT_CHECK_THEMES || process.env.TAPKIT_CHECK_THEMES.split(',').includes(id));
const settingsOnly = process.env.TAPKIT_CHECK_SETTINGS_ONLY === '1';
assert.ok(instrumentIds.length && themeIds.length, 'check filters must select known instruments/themes');

const profile = resolve('.artifacts/renderer-profile'); mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function capturePNG(win: BrowserWindow, file: string) {
  await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  for (let attempt = 0; attempt < 3; attempt++) {
    try { await writeFile(resolve(file), (await win.webContents.capturePage()).toPNG()); return; }
    catch (error) {
      if (attempt === 2 || !String(error).includes('UnknownVizError')) throw new Error(`Capture ${file}: ${String(error)}`);
      await wait(150); // Offscreen surfaces can briefly be unavailable after native resizing.
    }
  }
}
const timings: TimingReport[] = [];
let state: AppState = { settings: defaultSettings(), activeInstrument: null, playing: false, status: '' };
let loaded: (() => void) | undefined;
let failure: string | undefined;
let rejectNextLoop = false;
let settingsOpens = 0;
ipcMain.on('check:open-settings', () => settingsOpens++);
ipcMain.handle('check:get-state', () => state);
ipcMain.handle('check:set-loop', async (event, id: InstrumentId, clip) => {
  if (rejectNextLoop) { rejectNextLoop = false; return { ok: false, error: 'Could not save loop.' }; }
  const candidate = structuredClone(state.settings);
  if (clip === null) delete candidate.loops[id]; else candidate.loops[id] = clip;
  state.settings = validateSettings(candidate); await settingsStore.save(state.settings);
  event.sender.send('tapkit:state', state); return { ok: true };
});

ipcMain.handle('check:ready', () => loaded?.());
ipcMain.on('check:failed', (_event, message) => { failure = message; loaded?.(); });
ipcMain.on('check:timing', (_event, timing) => timings.push(timing));
ipcMain.on('check:set-range', (event, id: InstrumentId, range: number) => {
  state.settings.instruments[id].range = range;
  event.sender.send('tapkit:state', state);
});
const settingsStore = new SettingsStore(resolve('.artifacts/renderer-settings.json'));
let saveCount = 0;
let writes = Promise.resolve();
let rejectNextOrder = false;
ipcMain.handle('check:save-settings', (event, candidate: Settings) => {
  saveCount++;
  const save = writes.then(async () => {
    await wait(35); // Make overlapping saves and their broadcasts observable.
    if (rejectNextOrder) { rejectNextOrder = false; return { ok: false, error: 'Could not save instrument order.' }; }
    if (candidate.instruments.djembe.keys['left-rim'] === 'Z') return { ok: false, error: 'Shortcut Z is unavailable.' };
    state.settings = validateSettings(candidate);
    await settingsStore.save(state.settings);
    if (!event.sender.isDestroyed()) event.sender.send('tapkit:state', state);
    return { ok: true };
  });
  writes = save.then(() => {});
  return save;
});
async function until(check: () => Promise<boolean>, label: string) {
  const deadline = Date.now() + 15000;
  while (!await check()) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${label}`);
    await wait(30);
  }
}
async function checkSettings() {
  state = { settings: defaultSettings(), activeInstrument: 'piano', playing: false, status: '' };
  state.settings.instruments.piano.scale = 1.1375;
  const win = new BrowserWindow({ width: 1320, height: 860, show: false, webPreferences: { offscreen: true, preload: resolve('.artifacts/renderer-preload.cjs'), sandbox: true, contextIsolation: true, autoplayPolicy: 'no-user-gesture-required' } });
  win.webContents.setAudioMuted(true);
  const errors: string[] = [];
  win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  const js = (code: string) => win.webContents.executeJavaScript(code);
  const ready = () => until(() => js(`Boolean(document.querySelector('.instrument-preview[aria-busy="false"]'))`), 'settings preview ready');
  const press = (key: string, options: KeyboardEventInit = {}) => js(`document.dispatchEvent(new KeyboardEvent('keydown', ${JSON.stringify({ key, bubbles: true, cancelable: true, ...options })}))`);
  const pressed = () => js('document.querySelectorAll(".instrument-preview .pressed").length');
  // Hidden offscreen windows update activeElement but macOS emits no native focus events.
  const focusEditor = (selector: string) => js(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); input.focus(); input.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); })()`);
  const blurEditor = (selector: string) => js(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); input.blur(); input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); })()`);

  const saved = () => until(() => js('document.querySelector(".save-message").textContent === "All changes saved."'), 'automatic save');
  await win.loadFile(resolve('dist/renderer/index.html'), { query: { view: 'settings' } });
  await ready();
  assert.equal(await js('document.querySelector(".nav-instrument.selected").dataset.instrument'), 'piano');
  assert.equal(await js('document.querySelectorAll(".save-button, .done-button, .preview-button").length'), 0);
  assert.equal(await js('document.querySelectorAll(".size-option, .size-control, .custom-size-label").length'), 0, 'size presets are removed');
  assert.equal((await js('document.querySelector(".preview-description").textContent')).includes('Size'), false);
  assert.equal(await js('getComputedStyle(document.querySelector(".instrument-preview")).transform'), 'matrix(1, 0, 0, 1, 0, 0)', 'preview ignores the saved floating size');
  assert.equal(await js('document.querySelectorAll(".instrument-preview .resize-grip, .instrument-preview .overlay-themes").length'), 0, 'desktop chrome is omitted from the preview');
  const orderInUI = () => js('[...document.querySelectorAll(".nav-instrument")].map(button=>button.dataset.instrument)');
  const moveInstrument = async (from: InstrumentId, to: InstrumentId, after = false) => js(`(() => {
    const source=document.querySelector('.nav-instrument[data-instrument="${from}"]'), target=document.querySelector('.nav-instrument[data-instrument="${to}"]'), dataTransfer=new DataTransfer(), bounds=target.getBoundingClientRect();
    source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer}));
    target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer,clientY:bounds.top+bounds.height*${after ? '.75' : '.25'}}));
    target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer,clientY:bounds.top+bounds.height*${after ? '.75' : '.25'}}));
    source.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer}));
  })()`);
  await press('ArrowRight'); await ready();
  assert.equal(await js('document.querySelector(".nav-instrument.selected").dataset.instrument'), 'handpan');
  await press('ArrowLeft'); await ready();
  assert.equal(await js('document.querySelector(".nav-instrument.selected").dataset.instrument'), 'piano');
  await moveInstrument('drums', 'djembe'); await saved();
  const reordered = ['drums', ...allInstrumentIds.filter(id => id !== 'drums')];
  assert.deepEqual(await orderInUI(), reordered);
  assert.deepEqual(state.settings.instrumentOrder, reordered);
  assert.deepEqual(await js('[...document.querySelectorAll(".nav-position")].map(label=>label.textContent)'), allInstrumentIds.map((_, i) => String(i + 1)));
  await js('document.querySelector(".nav-instrument[data-instrument=drums]").click()'); await ready();
  await press('ArrowLeft'); await ready();
  assert.equal(await js('document.querySelector(".nav-instrument.selected").dataset.instrument'), allInstrumentIds.at(-1), 'left wraps using the custom order');
  await press('ArrowRight'); await ready();
  assert.equal(await js('document.querySelector(".nav-instrument.selected").dataset.instrument'), 'drums');
  await focusEditor('.binding input'); await press('ArrowRight');
  assert.equal(await js('document.querySelector(".nav-instrument.selected").dataset.instrument'), 'drums', 'arrow editing never switches instruments');
  await blurEditor('.binding input');
  rejectNextOrder = true; await moveInstrument('piano', 'drums');
  await until(() => js('document.querySelector(".save-message").textContent.includes("Could not save instrument order")'), 'failed reorder reports error');
  await until(async () => JSON.stringify(await orderInUI()) === JSON.stringify(reordered), 'failed reorder rolls back positions');
  await moveInstrument('drums', 'violin', true); await saved();
  assert.deepEqual(await orderInUI(), [...allInstrumentIds]);
  assert.deepEqual((await settingsStore.load()).settings.instrumentOrder, [...allInstrumentIds]);
  const dragGap = async (area: 'top' | 'bottom' | 'between' | 'release-top' | 'cancel') => js(`(() => {
    const nav=document.querySelector('.sidebar nav'), source=nav.querySelector('[data-instrument=drums]'), rows=[...nav.querySelectorAll('[data-instrument]')], dataTransfer=new DataTransfer(), x=nav.getBoundingClientRect().left+20;
    const top=rows[0].getBoundingClientRect().top-8, bottom=rows.at(-1).getBoundingClientRect().bottom+16, between=rows[1].getBoundingClientRect().bottom+3;
    const y=${JSON.stringify(area)}==='bottom'?bottom:(${JSON.stringify(area)}==='between'||${JSON.stringify(area)}==='release-top')?between:top;
    const target=document.elementFromPoint(x,y);
    if(target.closest('[data-instrument]'))throw new Error('Regression must drop in whitespace, not a row');
    source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer}));
    const over=new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer,clientX:x,clientY:y});target.dispatchEvent(over);
    const marker=nav.querySelector('.drop-before,.drop-after'), rect=marker.getBoundingClientRect(), bounds=nav.getBoundingClientRect();
    const markerVisible=marker.classList.contains('drop-before')?rect.top-4>=bounds.top:rect.bottom+4<=bounds.bottom;
    if(${JSON.stringify(area)}!=='cancel') {
      const dropY=${JSON.stringify(area)}==='release-top'?top:y;
      document.elementFromPoint(x,dropY).dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer,clientX:x,clientY:dropY}));
    }
    source.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer}));
    return {accepted:over.defaultPrevented,markerVisible,clean:!document.querySelector('.reordering,.nav-dragging,.drop-before,.drop-after')};
  })()`);
  for (const area of ['top', 'bottom', 'between', 'bottom', 'release-top', 'bottom', 'cancel'] as const) {
    const result = await dragGap(area);
    assert.deepEqual(result, { accepted: true, markerVisible: true, clean: true }, `${area} whitespace drop has a visible marker and cleans up`);
    if (area !== 'cancel') await saved();
    const expected = area === 'top' || area === 'release-top' ? ['drums', ...allInstrumentIds.filter(id=>id!=='drums')]
      : area === 'between' ? ['djembe', 'piano', 'drums', ...allInstrumentIds.slice(2).filter(id=>id!=='drums')] : [...allInstrumentIds.filter(id=>id!=='drums'), 'drums'];
    assert.deepEqual(await orderInUI(), expected, `${area} drop position`);
    assert.deepEqual((await settingsStore.load()).settings.instrumentOrder, expected, `${area} order saved`);
  }
  await moveInstrument('drums', 'violin', true); await saved();
  const backgrounds: string[] = [];
  for (const appearance of ['light', 'dark'] as const) {
    nativeTheme.themeSource = appearance;
    await until(() => js(`matchMedia('(prefers-color-scheme: dark)').matches === ${appearance === 'dark'}`), 'system color scheme');
    backgrounds.push(await js('getComputedStyle(document.body).backgroundColor'));
    const typography = await js(`(() => {
      const invalid = []; const walker = document.createTreeWalker(document.querySelector('#app'), NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode; const parent = node.parentElement;
        if (!node.textContent.trim() || !parent.getClientRects().length || getComputedStyle(parent).visibility !== 'visible') continue;
        const size = parseFloat(getComputedStyle(parent).fontSize);
        if (size < 12) invalid.push({ text: node.textContent, size });
      }
      return { invalid, font: getComputedStyle(document.body).fontFamily, base: getComputedStyle(document.body).fontSize, taglines: Boolean(document.querySelector('.eyebrow, .sidebar-bottom, .beta')) };
    })()`);
    assert.deepEqual(typography.invalid, [], 'every visible settings label is at least 12px');
    assert.ok(typography.font.includes('-apple-system'));
    assert.equal(typography.base, '15px'); assert.equal(typography.taglines, false);
    for (const id of instrumentIds) {
      await js(`document.querySelector('.nav-instrument[data-instrument="${id}"]').click()`);
      await ready();
      await js('window.dispatchEvent(new Event("focus"))');
      for (const theme of themeIds) {
        await js(`document.querySelector('.theme-card[data-theme="${theme}"]').click()`);
        await saved();
        assert.ok(allInstrumentIds.every(other => state.settings.instruments[other].theme === theme), 'Settings style edits apply to every instrument');
        await until(() => js(`document.querySelector('.instrument-preview .instrument-body').src.endsWith('${instrumentArtwork(id, theme)}')`), 'preview artwork update');
        if (id === 'sampler') assert.equal(await js('new Set([...document.querySelectorAll(".sampler-pad")].map(pad=>getComputedStyle(pad).getPropertyValue("--pad-face"))).size'), 25, 'all pads retain distinct themed colours');
        assert.equal(await js('getComputedStyle(document.querySelector(".instrument-preview .key-legend")).display'), 'none', 'preview uses only its readable unscaled key guide');
        const widths: number[] = [];
        for (const [index, size] of sizeIds.entries()) {
          state.settings.instruments[id].size = size;
          state.settings.instruments[id].scale = [.5, 1, 2][index];
          win.webContents.send('tapkit:state', state); await wait(40);
          const geometry = await js(`(() => {
            const stage = document.querySelector('.preview-stage').getBoundingClientRect();
            const preview = document.querySelector('.preview-fit').getBoundingClientRect();
            const panel = document.querySelector('.instrument-settings').getBoundingClientRect();
            return { width: preview.width, contained: preview.left >= stage.left - 1 && preview.right <= stage.right + 1 && preview.top >= stage.top - 1 && preview.bottom <= stage.bottom + 1, right: stage.left > panel.right, theme: document.querySelector('.instrument-preview').dataset.theme, error: document.querySelector('.instrument-error').textContent, hands: [...document.querySelectorAll('.hand img')].map(image => image.src) };
          })()`);
          assert.equal(await js('document.querySelectorAll(".preview-loop, .loop-panel, .loop-dock, .loop-toggle").length'), 0, 'Settings has no recorder UI');
          const fitGap = await js(`(() => { const s=document.querySelector('.preview-stage').getBoundingClientRect(),p=document.querySelector('.preview-fit').getBoundingClientRect();return Math.min(s.width-p.width,s.height-p.height);})()`);
          assert.ok(Math.abs(fitGap - 12) < 1.5, 'preview grows to fill an available axis with only a small margin');
          assert.ok(geometry.contained, `${id}/${theme}/${size} preview fits`);
          assert.ok(geometry.right, 'preview is beside controls');
          assert.equal(geometry.theme, theme); assert.equal(geometry.error, '');
          assert.ok(geometry.hands.every((src: string, index: number) => src.endsWith(handArtwork(id, theme, index ? 'right' : 'left'))), 'preview body and both hands use the same art style');
          widths.push(geometry.width);
        }
        assert.ok(widths.every(width => Math.abs(width - widths[0]) < .1), 'saved floating sizes never change preview size');
        await press(instruments[id].voices[0].key);
        await until(() => js('Boolean(document.querySelector(".instrument-preview .pressed"))'), 'keyboard-playable preview');
        await wait(250);
        if (id === 'drums') { await press(state.settings.instruments.drums.keys.crash); await wait(100); }
        const handsFit = await js(`(() => { const stage=document.querySelector('.preview-stage').getBoundingClientRect();return [...document.querySelectorAll('.instrument-preview .hand, .instrument-preview .violin-bow, .instrument-preview .kick-pedal, .instrument-preview .drumstick, .instrument-preview .marimba-mallet')].filter(part => part.getClientRects().length).every(part => { const r=part.getBoundingClientRect();return r.left>=stage.left-1 && r.right<=stage.right+1 && r.top>=stage.top-1 && r.bottom<=stage.bottom+1; }); })()`);
        assert.ok(handsFit, `${id}/${theme} preview preserves space for hands and playing layers`);
        await capturePNG(win, `.artifacts/settings-v0.11-${id}-${theme}-${appearance}.png`);
      }
      // Chords overlap, and repeated keydowns remain tap hits.
      for (const voice of instruments[id].voices.slice(0, 3)) await press(voice.key);
      await until(async () => await pressed() >= 3, 'overlapping preview notes');
      await wait(220);
      await press(instruments[id].voices[0].key, { repeat: true });
      await until(async () => await pressed() > 0, 'repeat key preview');
      await wait(220);
      if (id === 'sampler') {
        await js(`for (const key of ${JSON.stringify(samplerKeys)}) document.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));`);
        await until(async () => await pressed() === 25, 'all sampler pads play together from the keyboard');
        await wait(220);
        await focusEditor('.binding input[data-voice="pad-kick"]');
        await js(`document.querySelector('.binding input[data-voice="pad-kick"]').dispatchEvent(new KeyboardEvent('keydown',{key:'N',bubbles:true,cancelable:true}))`);
        await saved(); await blurEditor('.binding input[data-voice="pad-kick"]');
        assert.equal(await js('document.querySelector(".sampler-pad kbd").textContent'), 'N');
        assert.equal(await js('document.querySelector(".preview-binding kbd").textContent'), 'N');
        await press('1'); await wait(80); assert.equal(await pressed(), 0, 'old sampler key stops playing');
        await press('N'); await until(async () => await pressed() === 1, 'custom sampler key plays the same pad');
        await wait(220);
        await focusEditor('.binding input[data-voice="pad-kick"]');
        await js(`document.querySelector('.binding input[data-voice="pad-kick"]').dispatchEvent(new KeyboardEvent('keydown',{key:'1',bubbles:true,cancelable:true}))`);
        await saved(); await blurEditor('.binding input[data-voice="pad-kick"]');
      }
      if (instruments[id].ranges) {
        for (let step = state.settings.instruments[id].range!; step > 0; step--) { await press('z'); await saved(); }
        assert.equal(state.settings.instruments[id].range, 0);
        assert.ok((await js('document.querySelector(".preview-description").textContent')).includes(instruments[id].ranges![0].label));
        const first = voicesFor(id, 0)[0];
        assert.equal(await js(`document.querySelector('.binding input[data-voice="${first.id}"]').parentElement.querySelector('span').textContent`), first.label, 'binding labels track the selected register');
        await focusEditor('.binding input[data-voice="range-up"]');
        const customRangeKey = id === 'guitar' ? 'N' : 'B';
        await js(`document.querySelector('.binding input[data-voice="range-up"]').dispatchEvent(new KeyboardEvent('keydown', { key: '${customRangeKey}', bubbles: true, cancelable: true }))`);
        await saved(); await blurEditor('.binding input[data-voice="range-up"]');
        await press('x'); await wait(50); assert.equal(state.settings.instruments[id].range, 0, 'old register binding no longer changes pitch');
        await press(customRangeKey.toLowerCase()); await saved(); assert.equal(state.settings.instruments[id].range, 1, 'custom register binding plays in preview');
        await focusEditor('.binding input[data-voice="range-up"]');
        await js(`document.querySelector('.binding input[data-voice="range-up"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'X', bubbles: true, cancelable: true }))`);
        await saved(); await blurEditor('.binding input[data-voice="range-up"]');
        await js(`(() => { const select = document.querySelector('#range'); select.value = '${instruments[id].ranges!.length - 1}'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
        await saved(); assert.equal(state.settings.instruments[id].range, instruments[id].ranges!.length - 1, 'register selector saves immediately');
        await press('x'); await wait(40); assert.equal(state.settings.instruments[id].range, instruments[id].ranges!.length - 1, 'register upper bound is stable');
        await js(`(() => { const select = document.querySelector('#range'); select.value = '${instruments[id].defaultRange}'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`); await saved();
        if (id === 'guitar') {
          await press('1');
          await until(() => js(`document.querySelector('.legend-key[data-voice="chord-0"]').classList.contains('pressed')`), 'guitar chord plays in keyboard preview');
          await wait(180);
          await press('b');
          await until(() => js(`document.querySelector('.legend-key[data-voice="body-tap"]').classList.contains('pressed')`), 'body tap uses B in keyboard preview');
          assert.equal(await js(`document.querySelector('.binding input[data-voice="body-tap"]').value`), 'B');
          await wait(250);
        }
      }
    }
  }
  assert.notEqual(backgrounds[0], backgrounds[1], 'settings follow system appearance without reloading');
  win.setBounds({ width: 1080, height: 680 });
  await wait(100);
  assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true, 'small settings window has no horizontal overflow');
  await capturePNG(win, '.artifacts/settings-v0.11-small-dark.png');
  win.setBounds({ width: 1320, height: 860 });
  await js(`document.querySelector('.nav-instrument[data-instrument="djembe"]').click()`);
  await ready();
  await js('window.dispatchEvent(new Event("focus"))');
  await press('G');
  await until(() => js(`document.querySelector('.legend-key[data-voice="center-bass"]').classList.contains("pressed")`), 'G triggers hard centre bass');
  assert.equal(await js('document.querySelector(".hand-right").style.left'), '159.75px');
  await wait(220);
  await focusEditor('.binding input[data-voice="center-bass"]');
  await js(`document.querySelector('.binding input[data-voice="center-bass"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'R', bubbles: true, cancelable: true }))`);
  await saved(); await blurEditor('.binding input[data-voice="center-bass"]');
  await press('G'); await wait(50); assert.equal(await pressed(), 0, 'old accent binding stops playing');
  await press('R'); await until(async () => await pressed() > 0, 'accent uses its custom binding');
  await wait(220);
  await focusEditor('.binding input[data-voice="center-bass"]');
  await js(`document.querySelector('.binding input[data-voice="center-bass"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'G', bubbles: true, cancelable: true }))`);
  await saved(); await blurEditor('.binding input[data-voice="center-bass"]');
  // Duplicate edits never reach main, and the previous binding stays usable.
  const before = saveCount;
  await focusEditor('.binding input');
  await until(() => js('document.querySelector(".instrument-preview").classList.contains("paused")'), 'focused binding editor pauses preview');
  await js(`(() => { const key = document.querySelector('.binding input'); key.dispatchEvent(new KeyboardEvent('keydown', { key: 'F', bubbles: true })); })()`);
  assert.ok((await js('document.querySelector(".save-message").textContent')).includes('duplicate'));
  assert.equal(saveCount, before);
  assert.equal(await pressed(), 0, 'binding editor never plays its typed key');
  assert.equal(await js('document.querySelector(".binding input").value'), 'D');
  // A valid edit rejected by the OS is rolled back without a save button.
  await js(`document.querySelector('.binding input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Z', bubbles: true }))`);
  await until(() => js('document.querySelector(".save-message").textContent.includes("unavailable")'), 'failed registration');
  await until(() => js('document.querySelector(".binding input").value === "D"'), 'failed edit rollback');
  await js(`document.querySelector('.binding input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Q', bubbles: true }))`);
  await saved();
  await blurEditor('.binding input');
  await wait(20);
  await press('D'); await wait(50);
  assert.equal(await pressed(), 0, 'old binding stops playing immediately');
  await press('Q');
  await until(async () => await pressed() > 0, 'custom binding preview');
  assert.equal(await js('document.querySelector(".preview-binding kbd").textContent'), 'Q');
  await wait(220);
  for (const options of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }, { shiftKey: true }]) await press('Q', options);
  await wait(50); assert.equal(await pressed(), 0, 'modified keys do not play');
  await js('window.dispatchEvent(new Event("blur"))');
  await press('Q'); await wait(50); assert.equal(await pressed(), 0, 'unfocused settings do not play');
  await js('window.dispatchEvent(new Event("focus"))');
  await press('Q'); await until(async () => await pressed() > 0, 'focus resumes keyboard preview');
  await wait(220);
  await focusEditor('#summon');
  await press('Q'); await wait(50); assert.equal(await pressed(), 0, 'summon editor does not play');
  await js(`document.querySelector('#summon').dispatchEvent(new KeyboardEvent('keydown', { key: 'N', code: 'KeyN', metaKey: true, altKey: true, bubbles: true, cancelable: true }))`);
  await saved();
  assert.equal(state.settings.instruments.djembe.shortcut, 'CommandOrControl+Alt+N');
  await blurEditor('#summon');
  const floatingScale = state.settings.instruments.djembe.scale;
  await js(`(() => {
    const slider = document.querySelector('#volume'); window.originalSlider = slider;
    slider.focus();
    for (const value of [12, 25, 39, 48, 67, 73]) { slider.value = value; slider.dispatchEvent(new Event('input', { bubbles: true })); }
    document.querySelector('.theme-card[data-theme="candy"]').click();
  })()`);
  await saved();
  assert.equal(await js('document.querySelector("#volume") === window.originalSlider'), true, 'saving preserves control identity');
  assert.equal(state.settings.instruments.djembe.volume, .73);
  assert.equal(state.settings.instruments.djembe.theme, 'candy');
  assert.equal(state.settings.instruments.djembe.scale, floatingScale, 'theme and volume edits preserve the floating size');
  assert.equal(state.settings.instruments.djembe.keys['left-rim'], 'Q');
  assert.deepEqual((await settingsStore.load()).settings, state.settings);
  // Reload uses persisted values; switching before decoding finishes must dispose safely.
  await win.reload();
  await ready();
  await js(`document.querySelector('.nav-instrument[data-instrument="djembe"]').click()`);
  await ready();
  assert.equal(await js('document.querySelector("#volume").value'), '73');
  await js(`for (let i = 0; i < 10; i++) document.querySelector('.nav-instrument[data-instrument="' + (i % 2 ? 'djembe' : 'piano') + '"]').click()`);
  await ready();
  await wait(150);
  assert.deepEqual(errors, []);
  // An edit already sent to main survives destruction of the settings renderer.
  const beforeClose = saveCount;
  await js(`(() => { const slider = document.querySelector('#volume'); slider.value = 81; slider.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await until(async () => saveCount > beforeClose, 'last edit dispatched');
  win.destroy();
  await writes;
  assert.equal((await settingsStore.load()).settings.instruments.djembe.volume, .81);
  nativeTheme.themeSource = 'system';
  console.log(`Settings checks passed: ${instrumentIds.length * sizeIds.length * themeIds.length * 2} light/dark previews, keyboard playing, focus/edit suspension, typography, immediate saves, rollback, reload, and close.`);
}
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  app.dock?.hide();
  try {
    for (const id of settingsOnly ? [] : instrumentIds) {
      state = { settings: defaultSettings(), activeInstrument: id, playing: false, status: '' };
      const win = new BrowserWindow({ ...instrumentDimensions(id, 'm'), show: false, webPreferences: { offscreen: true, preload: resolve('.artifacts/renderer-preload.cjs'), sandbox: true, contextIsolation: true, autoplayPolicy: 'no-user-gesture-required' } });
      win.webContents.setAudioMuted(true);
      const ready = new Promise<void>(resolve => { loaded = resolve; });
      await win.loadFile(resolve('dist/renderer/index.html'), { query: { view: 'instrument', instrument: id } });
      let timeout: ReturnType<typeof setTimeout>;
      await Promise.race([ready, new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('Renderer readiness timeout')), 20000); })]).finally(() => clearTimeout(timeout));
      assert.equal(failure, undefined, failure);
      assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll(".instrument-toolbar, .instrument-footer, .playing-label").length'), 0);
      assert.equal(await win.webContents.executeJavaScript('getComputedStyle(document.querySelector(".overlay-themes")).visibility'), 'hidden');
      assert.equal(await win.webContents.executeJavaScript('getComputedStyle(document.querySelector(".resize-grip")).pointerEvents'), 'none');
      const sprite = await win.webContents.executeJavaScript(`(() => {
        const image = document.querySelector('.hand-left img');
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0);
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        let opaque = 0, neutral = 0, light = 0, runs = 0, length = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 192) {
          opaque++; const channels = [data[i], data[i + 1], data[i + 2]];
          if (Math.max(...channels) - Math.min(...channels) <= 8) neutral++;
          light += (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
        const y = Math.floor(canvas.height * .70);
        for (let x = 0; x <= canvas.width; x++) {
          if (x < canvas.width && data[(y * canvas.width + x) * 4 + 3] > 192) length++;
          else { if (length > canvas.width * .025) runs++; length = 0; }
        }
        return { neutral: neutral / opaque, light: light / opaque, runs, marginAlpha: data[(Math.floor(canvas.height * .02) * canvas.width + Math.floor(canvas.width / 2)) * 4 + 3] };
      })()`);
      assert.ok(sprite.neutral > .99 && sprite.light > 190, `${id} hand must be neutral white`);
      assert.equal(sprite.marginAlpha, 0, `${id} hand must have transparent surroundings`);
      if (id !== 'drums' && id !== 'marimba') assert.equal(sprite.runs, id === 'piano' || id === 'trumpet' || id === 'sampler' ? 1 : 4, 'four extended fingers, or one extended pointing index, plus the anatomically separate thumb');
      state.playing = true;
      win.webContents.send('tapkit:state', state);
      const loopJS = (code: string) => win.webContents.executeJavaScript(code);
      assert.equal(await loopJS('document.querySelector(".loop-dock").hidden'), true, 'recorder starts hidden');
      win.webContents.send('tapkit:toggle-loop');
      await until(() => loopJS('!document.querySelector(".loop-dock").hidden'), 'shortcut reveals recorder');
      assert.equal(await loopJS('document.querySelector(".loop-toggle").getAttribute("aria-pressed")'), 'true');
      await until(() => loopJS('!document.querySelector("[data-loop=record]").disabled'), `${id} loop input enabled`);
      await loopJS('document.querySelector("[data-loop=record]").click()');
      assert.ok((await loopJS('document.querySelector(".loop-status").textContent')).includes('first note'));
      for (const voice of instruments[id].voices.slice(0, 3)) {
        win.webContents.send('tapkit:hit', { voiceId: voice.id, sentAt: performance.timeOrigin + performance.now() }); await wait(80);
      }
      await loopJS('document.querySelector("[data-loop=record]").click()');
      await until(() => loopJS('!document.querySelector("[data-loop=play]").disabled'), `${id} saved loop rendered`);
      assert.equal(state.settings.loops[id]!.events.length, 3);
      assert.equal(state.settings.loops[id]!.events[0].at, 0);
      assert.ok(state.settings.loops[id]!.duration >= .25 && state.settings.loops[id]!.duration <= 10);
      assert.equal(await loopJS('document.querySelectorAll(".loop-note").length'), 3);
      await loopJS('document.querySelector("[data-loop=play]").click()'); await wait(50);
      win.webContents.send('tapkit:hit', { voiceId: instruments[id].voices.at(-1)!.id, sentAt: performance.timeOrigin + performance.now() });
      await wait(320);
      assert.ok((await loopJS('document.querySelector("[data-loop=play]").textContent')).includes('Pause'), 'live input leaves the composite loop playing');
      await loopJS('document.querySelector(".loop-toggle").click()');
      assert.equal(await loopJS('document.querySelector(".loop-dock").hidden'), true, 'icon hides recorder');
      assert.ok((await loopJS('document.querySelector("[data-loop=play]").textContent')).includes('Pause'), 'hiding recorder keeps its loop playing');
      win.webContents.send('tapkit:toggle-loop');
      await until(() => loopJS('!document.querySelector(".loop-dock").hidden'), 'shortcut restores recorder without interrupting playback');
      if (id === 'sampler') await capturePNG(win, '.artifacts/sampler-loop-playing.png');
      await loopJS('document.querySelector("[data-loop=play]").click()'); await wait(50);
      const pausedTime = await loopJS('document.querySelector(".loop-time").value'); await wait(80);
      assert.equal(await loopJS('document.querySelector(".loop-time").value'), pausedTime, 'pause holds the playhead');
      await loopJS('document.querySelector("[data-loop=play]").click()'); await wait(30);
      state.playing = false; win.webContents.send('tapkit:state', state); await wait(50);
      assert.ok((await loopJS('document.querySelector("[data-loop=play]").textContent')).includes('Play'), 'hiding pauses the loop');
      assert.equal(state.settings.loops[id]!.events.length, 3, 'hiding retains the saved performance');
      state.playing = true; win.webContents.send('tapkit:state', state);
      if (id === 'sampler') {
        const savedClip = structuredClone(state.settings.loops[id]); rejectNextLoop = true;
        await loopJS('document.querySelector("[data-loop=reset]").click()');
        await until(() => loopJS('document.querySelector(".loop-status").textContent.includes("Could not save loop")'), 'failed loop reset reports its error');
        assert.deepEqual(state.settings.loops[id], savedClip, 'failed reset retains saved performance');
        await until(() => loopJS('!document.querySelector("[data-loop=reset]").disabled'), 'failed reset recovers');
      }
      await loopJS('document.querySelector("[data-loop=reset]").click()');
      await until(async () => !state.settings.loops[id] && await loopJS('document.querySelector("[data-loop=reset]").disabled'), `${id} loop reset persisted`);
      if (id === 'djembe') {
        await until(() => loopJS('!document.querySelector("[data-loop=record]").disabled'), 'five-second recording ready');
        await loopJS('document.querySelector("[data-loop=record]").click()');
        for (let n=0;n<5;n++) {
          win.webContents.send('tapkit:hit', { voiceId: instruments[id].voices[n % instruments[id].voices.length].id, sentAt: performance.timeOrigin + performance.now() });
          await wait(1000);
        }
        await loopJS('document.querySelector("[data-loop=record]").click()');
        await until(() => loopJS('!document.querySelector("[data-loop=play]").disabled'), 'five-second loop rendered');
        const duration = state.settings.loops[id]!.duration;
        assert.ok(duration >= 4.9 && duration < 5.2, 'Stop retains the actual five-second performance');
        assert.ok(parseFloat(await loopJS('document.querySelector(".loop-time").value')) >= 4.9);
        assert.ok(Math.abs(parseFloat(await loopJS('document.querySelector(".loop-timeline").style.getPropertyValue("--loop-step")')) - 100 / duration) < .001, 'timeline rescales to the recorded length');
        await loopJS(`(() => { window.loopPeriods=[];const create=AudioContext.prototype.createBufferSource;AudioContext.prototype.createBufferSource=function(){const source=create.call(this),start=source.start.bind(source);source.start=function(...args){if(source.loop)window.loopPeriods.push(source.buffer.duration);return start(...args);};return source;};})()`);
        await loopJS('document.querySelector("[data-loop=play]").click()');
        const periods = await loopJS('window.loopPeriods');
        assert.equal(periods.length, 1); assert.ok(Math.abs(periods[0] - duration) <= 1 / 44100, 'Web Audio repeats after five seconds instead of ten');
        await capturePNG(win, '.artifacts/recorder-five-seconds.png');
        await loopJS('document.querySelector("[data-loop=reset]").click()');
        await until(async () => !state.settings.loops[id], 'five-second recording reset');
      }
      if (id === 'sampler') {
        await until(() => loopJS('!document.querySelector("[data-loop=record]").disabled'), 'reset finishes before recording again');
        await loopJS('document.querySelector("[data-loop=record]").click()');
        assert.ok((await loopJS('document.querySelector(".loop-status").textContent')).includes('first note'));
        for (let n=0; n<6; n++) { win.webContents.send('tapkit:hit', { voiceId: instruments[id].voices[n].id, sentAt: performance.timeOrigin + performance.now() }); if(n<5) await wait(1500); }
        await until(() => loopJS('!document.querySelector("[data-loop=play]").disabled'), 'floating recorder stops automatically at ten seconds');
        assert.equal(state.settings.loops[id]!.duration, 10); assert.equal(state.settings.loops[id]!.events.length, 6);
        const clip = structuredClone(state.settings.loops[id]);
        await win.reload();
        await until(() => loopJS('Boolean(document.querySelector("[data-loop=play]")) && !document.querySelector("[data-loop=play]").disabled'), 'saved floating loop restored after reload');
        assert.equal(await loopJS('document.querySelector(".loop-dock").hidden'), true, 'restored recorder still starts closed');
        assert.deepEqual(state.settings.loops[id], clip);
        win.webContents.send('tapkit:toggle-loop'); await until(() => loopJS('!document.querySelector(".loop-dock").hidden'), 'restored recorder opens');
        await loopJS('document.querySelector("[data-loop=reset]").click()');
        await until(async () => !state.settings.loops[id], 'ten-second test recording reset');
      }
      if (instruments[id].ranges) {
        await win.webContents.executeJavaScript(`(() => {
          window.melodicHits = []; window.melodicStops = []; window.melodicBuffers = new WeakMap(); let bufferId = 0;
          const create = AudioContext.prototype.createBufferSource;
          AudioContext.prototype.createBufferSource = function() {
            const source = create.call(this), start = source.start.bind(source), stop = source.stop.bind(source), context = this;
            source.start = function(when) { if (!window.melodicBuffers.has(source.buffer)) window.melodicBuffers.set(source.buffer, ++bufferId); window.melodicHits.push({ buffer: window.melodicBuffers.get(source.buffer), rate: source.playbackRate.value, duration: source.buffer.duration, when, lead: when - context.currentTime }); return start(when); };
            source.stop = function(when) { window.melodicStops.push({ when, now: context.currentTime }); return stop(when); };
            return source;
          };
        })()`);
        const hit = async (voiceId: string) => {
          win.webContents.send('tapkit:hit', { voiceId, sentAt: performance.timeOrigin + performance.now() }); await wait(30);
        };
        const measuredBuffers = new Map<string, number>();
        win.webContents.send('tapkit:state', state);
        for (let range = 0; range < instruments[id].ranges!.length; range++) {
          state.settings.instruments[id].range = range; win.webContents.send('tapkit:state', state);
          for (const voice of voicesFor(id, range).filter(voice => voice.midi !== undefined)) {
            const before = await win.webContents.executeJavaScript('window.melodicHits.length');
            await hit(voice.id);
            const observed = await win.webContents.executeJavaScript('window.melodicHits.at(-1)');
            measuredBuffers.set(voice.sample, observed.buffer);
            assert.equal(await win.webContents.executeJavaScript('window.melodicHits.length'), before + 1);
            assert.ok(Math.abs(observed.rate - 2 ** (voice.semitones / 12)) < 1e-6, `${id} ${voice.label} has the correct concert pitch`);
            assert.ok(observed.lead <= .003, 'single notes begin immediately');
          }
        }
        if (instruments[id].monophonic) {
          const stops = await win.webContents.executeJavaScript('window.melodicStops');
          assert.ok(stops.length >= 30, 'trumpet replaces its previous note');
          const crossfade = (instruments[id].crossfadeMs ?? 25) / 1000;
          assert.ok(stops.every((stop: { when: number; now: number }) => stop.when - stop.now <= crossfade + .001), `${id} crossfade matches its articulation`);
          if (id === 'trumpet') assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll("[data-valve]").length'), 3);
          else assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll(".violin-bow").length'), 1);
        } else if (id === 'guitar') for (const chord of instruments.guitar.voices.filter(voice => voice.chord)) {
          const before = await win.webContents.executeJavaScript('window.melodicHits.length'); await hit(chord.id);
          const strings = await win.webContents.executeJavaScript(`window.melodicHits.slice(${before})`);
          assert.equal(strings.length, chord.layers!.length);
          for (const [index, string] of strings.entries()) assert.ok(Math.abs(string.when - strings[0].when - index * .009) < .0001, 'guitar strings are scheduled as a natural strum');
          assert.ok(strings[0].lead <= .003, 'first chord string starts immediately');
        }
        if (id === 'guitar') {
          const left = await win.webContents.executeJavaScript(`document.querySelector('.hand-left').getAttribute('style')`);
          const before = await win.webContents.executeJavaScript('window.melodicHits.length');
          await hit('body-tap');
          await until(() => win.webContents.executeJavaScript(`parseFloat(document.querySelector('.hand-right').style.left) > 450`), 'body tap contacts the wooden lower bout');
          const tap = await win.webContents.executeJavaScript('window.melodicHits.at(-1)');
          assert.equal(await win.webContents.executeJavaScript('window.melodicHits.length'), before + 1);
          assert.ok(tap.lead <= .003 && tap.duration > .4 && tap.duration < .5 && tap.rate === 1);
          assert.equal(await win.webContents.executeJavaScript(`document.querySelector('.hand-left').getAttribute('style')`), left, 'body tapping leaves fretting position intact');
          const frames = await win.webContents.executeJavaScript(`document.querySelector('.hand-right').getAnimations()[0].effect.getKeyframes().map(frame=>frame.transform)`);
          assert.match(frames[0], /translateY\(20px\)/); assert.match(frames[1], /translateY\(-16px\)/);
          for (let n = 0; n < 3; n++) await hit('body-tap');
          assert.equal(await win.webContents.executeJavaScript('window.melodicStops.length'), 0, 'body taps overlap the chords and each other');
          await hit('melody-0');
          await until(() => win.webContents.executeJavaScript(`document.querySelector('.hand-right').style.left === '403px'`), 'plucking returns the tapping hand to the strings');
        }
        if (id === 'piano') {
          state.playing = false; win.webContents.send('tapkit:state', state); await wait(100);
          await win.webContents.executeJavaScript('window.melodicHits = []; window.melodicStops = [];');
          state.playing = true; win.webContents.send('tapkit:state', state);
          for (const voiceId of ['note-0', 'note-12', 'note-24']) await hit(voiceId);
          assert.equal(await win.webContents.executeJavaScript('window.melodicHits.length'), 3);
          assert.equal(await win.webContents.executeJavaScript('window.melodicStops.length'), 0, 'bass and melody ring together');
          const keys = await win.webContents.executeJavaScript('({white:document.querySelectorAll(".piano-key.white").length,black:document.querySelectorAll(".piano-key.black").length})');
          assert.deepEqual(keys, { white: 15, black: 10 });
          // Fingertip position follows the actual narrow key, for both hands and colors.
          const geometry = { width: 59.25, leftTip: .61, rightTip: .39 };
          for (const index of [0, 1, 11, 12, 13, 24]) {
            await hit(`note-${index}`);
            const voice = voicesFor('piano', state.settings.instruments.piano.range)[index];
            const width = 408 / 15, center = 66 + (voice.x + (voice.black ? .32 : .5)) * width;
            await until(() => win.webContents.executeJavaScript(`Math.abs(parseFloat(document.querySelector('.hand-${voice.hand}').style.left)+${geometry.width * (voice.hand === 'left' ? geometry.leftTip : geometry.rightTip)}-${center})<.001`), `piano hand contacts note ${index}`);
          }
        }
        if (id === 'marimba') {
          assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll(".marimba-bar").length'), 25);
          assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll(".marimba-mallet").length'), 2);
          // Both rows and both hands must hit the exact bar, including the far edges.
          for (const index of [0, 1, 11, 12, 13, 24]) {
            const voice = voicesFor('marimba')[index], bar = marimbaBar(index);
            await hit(voice.id);
            await until(() => win.webContents.executeJavaScript(`Math.abs(parseFloat(document.querySelector('.hand-${voice.hand}').style.left)+35.25-${bar.centerX})<.001 && Math.abs(parseFloat(document.querySelector('.hand-${voice.hand}').style.top)-${bar.contactY + marimbaLayout.malletContact})<.001`), `marimba mallet contacts bar ${index}`);
          }
          assert.equal(await win.webContents.executeJavaScript('window.melodicStops.length'), 0, 'marimba notes and repeated hits retain their tails');
          const before = await win.webContents.executeJavaScript('window.melodicHits.length');
          await win.webContents.executeJavaScript(`document.querySelector('.marimba-bar').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));`);
          await until(() => win.webContents.executeJavaScript(`window.melodicHits.length === ${before + 1}`), 'marimba pointer hit uses the same immediate audio path');
        }
        // No wait between shifting and hitting: the renderer must use the new range immediately.
        state.settings.instruments[id].range = 0; win.webContents.send('tapkit:state', state);
        win.webContents.send('tapkit:hit', { voiceId: 'range-up', sentAt: performance.timeOrigin + performance.now() });
        await hit(instruments[id].voices[0].id);
        const expected = voicesFor(id, 1)[0];
        const observed = await win.webContents.executeJavaScript('window.melodicHits.at(-1)');
        assert.ok(Math.abs(observed.rate - 2 ** (expected.semitones / 12)) < 1e-6);
        assert.equal(observed.buffer, measuredBuffers.get(expected.sample), 'a rapid register shift selects the new sample buffer');
        assert.equal(await win.webContents.executeJavaScript('document.querySelector(".register-name").textContent'), instruments[id].ranges![1].label);
        await wait(250);
      }
      if (id === 'drums') {
        await win.webContents.executeJavaScript(`(() => {
          window.kitHits = []; window.kitStops = [];
          const create = AudioContext.prototype.createBufferSource;
          AudioContext.prototype.createBufferSource = function() {
            const source = create.call(this), start = source.start.bind(source), stop = source.stop.bind(source), context = this;
            const index = window.kitHits.length;
            source.start = function(when) { window.kitHits.push({ rate: source.playbackRate.value, lead: when - context.currentTime }); return start(when); };
            source.stop = function(when) { window.kitStops.push({ index, lead: when - context.currentTime }); return stop(when); };
            return source;
          };
        })()`);
        win.webContents.send('tapkit:state', state);
        const hit = async (voiceId: string) => { win.webContents.send('tapkit:hit', { voiceId, sentAt: performance.timeOrigin + performance.now() }); await wait(35); };
        await hit('kick'); await hit('snare-left'); await hit('hat-open'); await hit('hat-open');
        assert.deepEqual(await win.webContents.executeJavaScript('window.kitStops'), [], 'repeated open hi-hats ring together with kick and snare');
        await hit('hat-closed');
        const stops = await win.webContents.executeJavaScript('window.kitStops');
        assert.deepEqual(stops.map((stop: { index: number }) => stop.index), [2, 3], 'closing hi-hat chokes only the open hats');
        assert.ok(stops[0].lead <= .026, 'hi-hat choke fades within 25 ms');
        for (const voice of instruments.drums.voices) await hit(voice.id);
        const hits = await win.webContents.executeJavaScript('window.kitHits.slice(5)');
        assert.equal(hits.length, 10);
        for (const [index, voice] of instruments.drums.voices.entries()) {
          assert.ok(Math.abs(hits[index].rate - 2 ** (voice.semitones / 12)) < 1e-6);
          assert.ok(hits[index].lead <= .003, 'drum attacks start immediately');
        }
        assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll(".drumstick").length'), 2);
        assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll(".kit-target").length'), 8);
        await hit('kick');
        assert.equal(await win.webContents.executeJavaScript('document.querySelector(".kick-pedal").getAnimations().length'), 1);
        await hit('snare-left');
        const contact = await win.webContents.executeJavaScript('parseFloat(document.querySelector(".hand-left").style.top) - 60');
        assert.ok(Math.abs(contact - instruments.drums.voices[1].y! * instruments.drums.height) < 1);
        await wait(250);
      }
      if (id === 'sampler') {
        const js = (code: string) => win.webContents.executeJavaScript(code);
        await js(`(() => {
          window.samplerHits = []; window.samplerStops = []; const buffers = new WeakMap(); let next = 0;
          const create = AudioContext.prototype.createBufferSource;
          AudioContext.prototype.createBufferSource = function() {
            const source = create.call(this), start = source.start.bind(source), stop = source.stop.bind(source), context = this;
            source.start = function(when) { if (!buffers.has(source.buffer)) buffers.set(source.buffer, ++next); window.samplerHits.push({ buffer: buffers.get(source.buffer), rate: source.playbackRate.value, duration: source.buffer.duration, lead: when - context.currentTime }); return start(when); };
            source.stop = function(when) { window.samplerStops.push(when); return stop(when); };
            return source;
          };
        })()`);
        assert.deepEqual(await js('[...document.querySelectorAll(".sampler-pad kbd")].map(key=>key.textContent)'), samplerKeys);
        const layout = await js(`(() => {
          const pads = [...document.querySelectorAll('.sampler-pad')].map(pad => pad.getBoundingClientRect());
          return { rows: new Set(pads.map(pad=>pad.top)).size, columns: new Set(pads.map(pad=>pad.left)).size, square: pads.every(pad=>Math.abs(pad.width-pad.height)<.01), labelsFit: [...document.querySelectorAll('.sampler-pad')].every(pad=>pad.scrollWidth<=pad.clientWidth+1 && pad.scrollHeight<=pad.clientHeight+1) };
        })()`);
        assert.deepEqual(layout, { rows: 5, columns: 5, square: true, labelsFit: true });
        win.webContents.send('tapkit:state', state);
        for (const [index, voice] of instruments.sampler.voices.entries()) {
          win.webContents.send('tapkit:hit', { voiceId: voice.id, sentAt: performance.timeOrigin + performance.now() });
          const pad = samplerPad(index), tip = voice.hand === 'left' ? .61 : .39;
          await until(() => js(`Math.abs(parseFloat(document.querySelector('.hand-${voice.hand}').style.left)+59.25*${tip}-${pad.left + pad.size / 2})<.01 && Math.abs(parseFloat(document.querySelector('.hand-${voice.hand}').style.top)+93.75*.77+14-${pad.top + pad.size / 2})<.01`), `sampler pad ${index + 1} visual contact`);
          const contact = await js(`(() => { const hand=document.querySelector('.hand-${voice.hand}'); return {left:parseFloat(hand.style.left),top:parseFloat(hand.style.top)}; })()`);
          assert.ok(Math.abs(contact.left + 59.25 * tip - pad.left - pad.size / 2) < .01, 'hand points to the played column');
          assert.ok(Math.abs(contact.top + 93.75 * .77 + 14 - pad.top - pad.size / 2) < .01, 'hand contacts the played row');
        }
        const hits = await js('window.samplerHits');
        assert.equal(hits.length, 25); assert.equal(new Set(hits.map((hit: {buffer:number})=>hit.buffer)).size,25);
        assert.ok(hits.every((hit: {rate:number;lead:number})=>hit.rate===1 && hit.lead<=.003));
        assert.deepEqual(await js('window.samplerStops'), [], 'all 25 tails can overlap');
        const first = instruments.sampler.voices[0];
        for (let n=0;n<3;n++) await js(`document.querySelector('[data-voice="${first.id}"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);
        assert.equal(await js('window.samplerHits.length'), 28, 'rapid pointer taps share the immediate audio path');
        const opens = settingsOpens;
        await js(`document.querySelector('.sampler-pad').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, button: 0, detail: 2 })); document.querySelector('.instrument-body').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, button: 0, detail: 2 }));`);
        await wait(30);
        assert.equal(settingsOpens, opens, 'double-clicking pads or artwork never opens Settings');
        assert.deepEqual(await js('window.samplerStops'), [], 'repeated pad taps do not cut earlier tails');
        await wait(250);
      }
      if (id === 'handpan' || id === 'tambourine') {
        await win.webContents.executeJavaScript(`(() => {
          window.percussionHits = [];
          const original = AudioContext.prototype.createBufferSource;
          AudioContext.prototype.createBufferSource = function() {
            const source = original.call(this), start = source.start.bind(source);
            source.start = function(...args) {
              window.percussionHits.push({ rate: source.playbackRate.value, duration: source.buffer.duration });
              return start(...args);
            };
            return source;
          };
        })()`);
        win.webContents.send('tapkit:state', state);
        for (const voice of instruments[id].voices) {
          win.webContents.send('tapkit:hit', { voiceId: voice.id, sentAt: performance.timeOrigin + performance.now() });
          await wait(35);
        }
        const hits = await win.webContents.executeJavaScript('window.percussionHits');
        assert.equal(hits.length, instruments[id].voices.length, 'every new voice reaches the audio engine');
        assert.ok(hits.every((hit: { rate: number }) => hit.rate === 1), 'recorded native pitches are preserved');
        if (id === 'handpan') {
          assert.ok(hits.every((hit: { duration: number }) => hit.duration > 1.5), 'handpan voices ring naturally');
          assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll(".tone-field").length'), 9);
          const handY = await win.webContents.executeJavaScript('[...document.querySelectorAll(".hand")].map(hand => parseFloat(hand.style.top))');
          assert.ok(handY.every((y: number) => Number.isFinite(y) && y > 0 && y < 350), 'hands move vertically across the note fields');
        } else {
          assert.ok(hits[1].duration > hits[0].duration * 2, 'long shake has a distinct longer recording');
          assert.equal(await win.webContents.executeJavaScript('document.querySelector(".instrument-art").getAnimations().length'), 1, 'shake/tap animates the instrument and holding hand together');
        }
        await wait(300);
      }
      if (id === 'djembe') {
        // Observe real source nodes; verify audible pitch/level/decay changes at the engine.
        await win.webContents.executeJavaScript(`(() => {
          window.observedHits = [];
          const original = AudioContext.prototype.createBufferSource;
          AudioContext.prototype.createBufferSource = function() {
            const source = original.call(this), connect = source.connect.bind(source), start = source.start.bind(source);
            let target;
            source.connect = function(node, ...args) { target = node; return connect(node, ...args); };
            source.start = function(...args) {
              window.observedHits.push({ rate: source.playbackRate.value, gain: target.gain.value, duration: source.buffer.duration / source.playbackRate.value });
              return start(...args);
            };
            return source;
          };
        })()`);
        win.webContents.send('tapkit:state', state);
        for (const voiceId of ['left-rim', 'left-bass', 'center-bass']) {
          win.webContents.send('tapkit:hit', { voiceId, sentAt: performance.timeOrigin + performance.now() });
          await wait(40);
        }
        const [rim, bass, hard] = await win.webContents.executeJavaScript('window.observedHits');
        assert.ok(Math.abs(rim.rate - 2 ** (-1.5 / 12)) < 1e-6, 'rim stays percussive but is slightly lower');
        assert.ok(Math.abs(bass.rate - 2 ** (-2 / 12)) < 1e-6, 'regular bass is deeper');
        assert.ok(Math.abs(hard.rate - 2 ** (-11 / 12)) < 1e-6, 'G accent is three more semitones deeper');
        assert.ok(hard.rate < bass.rate && hard.gain > bass.gain * 1.4, 'accent is deeper and stronger');
        assert.ok(Math.abs(hard.gain - 1.1) < 1e-6, 'G accent is louder while a single hit retains peak headroom at full volume');
        const expectedBass = .644 / 2 ** (-2 / 12), expectedRim = (.5200907029478458 * 1.15) / 2 ** (-1.5 / 12);
        assert.ok(Math.abs(bass.duration - expectedBass) < .006 && Math.abs(rim.duration - expectedRim) < .006, 'bass and rim retain the modestly extended samples');
        assert.ok(Math.abs(hard.duration - .644 / 2 ** (-11 / 12)) < .006, 'G retains the extended sample at its deeper pitch');
        console.log(`Djembe: rim ${(rim.duration*1000).toFixed(1)} ms, bass ${(bass.duration*1000).toFixed(1)} ms, G ${(hard.duration*1000).toFixed(1)} ms`);
        await wait(250);
      }
      if (id === 'piano') { state.settings.instruments.piano.range = instruments.piano.defaultRange; win.webContents.send('tapkit:state', state); }
      for (const size of sizeIds) {
        state.settings.instruments[id].size = size;
        win.setBounds({ ...instrumentDimensions(id, size), x: 0, y: 0 });
        for (const theme of themeIds) {
          state.settings.instruments[id].theme = theme;
          win.webContents.send('tapkit:state', state);
          for (const voice of [instruments[id].voices[0], instruments[id].voices.at(-1)!]) win.webContents.send('tapkit:hit', { voiceId: voice.id, sentAt: performance.timeOrigin + performance.now() });
          await wait(300);
          const result = await win.webContents.executeJavaScript(`(() => {
            const root = document.querySelector('#app'); const pair = document.querySelector('.hands');
            const left = document.querySelector('.hand-left img'); const right = document.querySelector('.hand-right img');
            const rect = root.getBoundingClientRect(), legend = document.querySelector('.key-legend').getBoundingClientRect();
            return { width: rect.width, height: rect.height, legendFits: legend.left >= rect.left - 1 && legend.right <= rect.right + 1, filter: pair.style.filter, valid: CSS.supports('filter', pair.style.filter), left: getComputedStyle(left).filter, right: getComputedStyle(right).filter, handWidth: parseFloat(getComputedStyle(document.querySelector('.hand-left')).width), handHeight: parseFloat(getComputedStyle(document.querySelector('.hand-left')).height), theme: document.body.dataset.theme, error: document.querySelector('.instrument-error').textContent, hands: [...document.querySelectorAll('.hand img')].map(image => image.src) };
          })()`);
          const expected = instrumentDimensions(id, size);
          assert.ok(Math.abs(result.width - expected.width) <= .5);
          assert.ok(Math.abs(result.height - expected.height) <= .5);
          assert.ok(result.legendFits, `${id}/${theme}/${size} playing-key guide fits the overlay`);
          if (instruments[id].ranges && id !== 'piano' && id !== 'marimba') {
            const guide = await win.webContents.executeJavaScript(`(() => {
              const legend = document.querySelector('.key-legend'); const register = document.querySelector('.register-control');
              return { display: getComputedStyle(legend).display, separated: legend.getBoundingClientRect().bottom <= register.getBoundingClientRect().top - 5, labelsFit: [...legend.querySelectorAll('button')].every(key => key.scrollWidth <= key.clientWidth + 2) };
            })()`);
            assert.equal(guide.display, 'grid'); assert.equal(guide.separated, true); assert.equal(guide.labelsFit, true, 'chromatic and chord labels do not overlap');
          }
          if (id === 'piano') {
            const keyboard = await win.webContents.executeJavaScript(`(() => {
              const keyboard = document.querySelector('.keyboard').getBoundingClientRect();
              const register = document.querySelector('.register-control').getBoundingClientRect();
              return { count: document.querySelectorAll('.piano-key').length, separated: keyboard.bottom < register.top, fits: [...document.querySelectorAll('.piano-key')].every(key => { const rect = key.getBoundingClientRect(); return rect.left >= keyboard.left - 2 && rect.right <= keyboard.right + 2; }) };
            })()`);
            assert.equal(keyboard.count, 25); assert.ok(keyboard.separated && keyboard.fits);
          }
          assert.equal(result.valid, true);
          // CSSOM may normalize shorthand alpha colors; compare against its own parser.
          const expectedFilter = await win.webContents.executeJavaScript(`(() => { const el = document.createElement('div'); el.style.filter = ${JSON.stringify(handGroupFilter())}; return el.style.filter; })()`);
          assert.equal(result.filter, expectedFilter);
          assert.equal(result.left, 'none'); assert.equal(result.right, 'none');
          assert.equal(result.handWidth, (id === 'piano' || id === 'trumpet' || id === 'sampler' ? 79 : 94) * .75);
          assert.equal(result.handHeight, (id === 'piano' || id === 'trumpet' || id === 'sampler' ? 125 : 130) * .75);
          assert.equal(result.theme, theme); assert.equal(result.error, '');
          assert.ok(result.hands.every((src: string, index: number) => src.endsWith(handArtwork(id, theme, index ? 'right' : 'left'))), 'overlay body and both hands use the same art style');
        }
      }
      // Recorder controls remain readable at the smallest and largest floating sizes.
      if (await loopJS('document.querySelector(".loop-dock").hidden')) win.webContents.send('tapkit:toggle-loop');
      for (const scale of [.5, 2]) for (const theme of themeIds) {
        state.settings.instruments[id].scale = scale; state.settings.instruments[id].theme = theme;
        win.setBounds({ ...instrumentDimensions(id, scale), x: 0, y: 0 });
        win.webContents.send('tapkit:state', state);
        await until(() => loopJS(`document.querySelector('.loop-panel').dataset.theme === '${theme}' && Math.abs(document.querySelector('#app').getBoundingClientRect().width-${instruments[id].width * scale})<.5`), 'recorder size/theme update');
        const ui = await loopJS(`(() => {
          const panel=document.querySelector('.loop-panel'), dock=panel.getBoundingClientRect(), time=panel.querySelector('.loop-time'), old=time.value;
          time.value='9.9 / 10 s';
          const result={font:parseFloat(getComputedStyle(time).fontSize),statusFont:parseFloat(getComputedStyle(panel.querySelector('.loop-status')).fontSize),scale:dock.width/panel.offsetWidth,fits:panel.scrollWidth<=panel.clientWidth+1 && dock.left>=-1 && dock.right<=innerWidth+1 && dock.bottom<=innerHeight+1};
          time.value=old;return result;
        })()`);
        assert.ok(ui.font >= 14 && ui.statusFont >= 12 && Math.abs(ui.scale - 1) < .01, 'recorder text stays at least 12 screen pixels regardless of instrument scale');
        assert.ok(ui.fits, `${id}/${theme}/${scale} recorder controls fit`);
        if (scale === .5 && (id === 'djembe' || id === 'sampler')) {
          await until(() => loopJS(`document.querySelector('.instrument-body').src.endsWith('${instrumentArtwork(id, theme)}')`), 'recorder screenshot artwork');
          await capturePNG(win, `.artifacts/recorder-${id}-${theme}-small.png`);
        }
      }
      delete state.settings.instruments[id].scale;
      win.setBounds({ ...instrumentDimensions(id, state.settings.instruments[id].size), x: 0, y: 0 });
      // Rapidly change themes while both hands have animations in flight.
      for (const theme of [...themeIds, ...themeIds].reverse()) {
        state.settings.instruments[id].theme = theme;
        win.webContents.send('tapkit:state', state);
        win.webContents.send('tapkit:hit', { voiceId: instruments[id].voices[0].id, sentAt: performance.timeOrigin + performance.now() });
      }
      await wait(300);
      assert.equal(await win.webContents.executeJavaScript('document.body.dataset.theme'), 'classic');
      assert.equal(await win.webContents.executeJavaScript('document.querySelector(".instrument-error").textContent'), '');
      assert.ok((await win.webContents.executeJavaScript('document.querySelector(".instrument-body").src')).endsWith(instrumentArtwork(id, 'classic')));
      assert.ok((await win.webContents.executeJavaScript('[...document.querySelectorAll(".hand img")].map(image => image.src)')).every((src: string, index: number) => src.endsWith(handArtwork(id, 'classic', index ? 'right' : 'left'))));
      await capturePNG(win, `.artifacts/${id}-updated.png`);
      win.destroy();
    }
    const p95 = (key: keyof TimingReport) => timings.map(item => Math.abs(item[key])).sort((a, b) => a - b)[Math.floor(timings.length * .95)];
    if (!settingsOnly) assert.ok(timings.length >= 60, 'Real Web Audio hits must produce timing reports.');
    await checkSettings();
    const summary = { combinations: settingsOnly ? 0 : instrumentIds.length * sizeIds.length * themeIds.length, recorderCombinations: settingsOnly ? 0 : instrumentIds.length * 2 * themeIds.length, settingsPreviews: instrumentIds.length * sizeIds.length * themeIds.length * 2, hits: timings.length, schedulingP95Ms: timings.length ? p95('schedulingMs') : null, baseLatencyMs: timings.at(-1)?.baseLatencyMs ?? null, outputLatencyMs: timings.at(-1)?.outputLatencyMs ?? null };
    console.log('Renderer checks passed:', summary);
    await writeFile(resolve('.artifacts/renderer-check.json'), JSON.stringify(summary, null, 2));
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
