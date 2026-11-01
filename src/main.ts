import { validateLoop, loopToggleShortcut, type LoopClip } from './shared/loops';
import { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, ipcMain, screen, powerMonitor, nativeTheme, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { defaultSettings, instrumentIds, instruments, instrumentBindings, adjacentInstrument, themeIds, overlayDimensions, instrumentScale, type InstrumentId, type ThemeId, type Settings, type AppState, type Position, type TimingReport } from './shared/model';
import { validateSettings, clampPosition, setSharedAppearance, shareAppearanceChanges } from './shared/settings';
import { SettingsStore } from './settings-store';
import { ShortcutRegistry, shortcutDispatcher, type ShortcutBinding } from './shortcuts';
import { resizeInstrument, fitInstrumentScale, sharedPosition, positionAtAnchor, initialSharedLayout, type ResizeOrigin } from './shared/resizing';

app.setName('Tapkit');
if (process.env.TAPKIT_DATA_DIR) app.setPath('userData', process.env.TAPKIT_DATA_DIR);
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();

let settings = defaultSettings();
let store: SettingsStore;
let tray: Tray;
let overlay: BrowserWindow | null = null;
// Keep the last complete instrument on screen while its replacement prepares hidden.
let displayedOverlay: BrowserWindow | null = null;
let overlayScale: number | undefined;
let preferences: BrowserWindow | null = null;
let active: InstrumentId | null = null;
let shown = false;
let pageVisible = false;
let ready = false;
let playing = false;
let status = '';
let quitting = false;
let sleeping = false;
let pendingSettingsSaves = 0;
let settingsWrites: Promise<void> = Promise.resolve();
let saveTimer: ReturnType<typeof setTimeout>;
let dragOrigin: { pointer: Position; bounds: Position } | null = null;
let resizeOrigin: ResizeOrigin | null = null;
const timing: TimingReport[] = [];

const registry = new ShortcutRegistry(globalShortcut, shortcutDispatcher(action => {
  if (quitting) return;
  if (action.startsWith('summon:')) void toggleInstrument(action.slice(7) as InstrumentId);
  else if (action === 'hide') hideInstrument();
  else if (action === 'settings') openSettings();
  else if (action === 'loop' && shown && pageVisible && !preferences && overlay) overlay.webContents.send('tapkit:toggle-loop');
  else if (action.startsWith('cycle:') && active && shown && pageVisible && !preferences && !sleeping && !pendingSettingsSaves && !quitting) void toggleInstrument(adjacentInstrument(settings.instrumentOrder, active, action === 'cycle:left' ? -1 : 1));
  else if (action.startsWith('voice:') && playing && overlay) overlay.webContents.send('tapkit:hit', { voiceId: action.slice(6), sentAt: performance.timeOrigin + performance.now() });
}, setImmediate));

function snapshot(): AppState { return { settings, activeInstrument: active, playing, status, overlayScale }; }
function broadcast(updateMenu = true) {
  if (process.env.TAPKIT_DIAGNOSTICS) console.log(JSON.stringify({ type: 'state', active, shown, ready, pageVisible, playing, status, theme: active ? settings.instruments[active].theme : null, settingsOpen: Boolean(preferences) }));
  for (const win of new Set([overlay, displayedOverlay, preferences])) if (win && !win.isDestroyed() && !win.webContents.isLoadingMainFrame()) win.webContents.send('tapkit:state', snapshot());
  if (updateMenu) refreshMenu();
}
function bindings(candidate = settings, includePlaying = playing): ShortcutBinding[] {
  if (preferences || sleeping || pendingSettingsSaves || quitting) return [];
  const result: ShortcutBinding[] = instrumentIds.map(id => ({ accelerator: candidate.instruments[id].shortcut, action: `summon:${id}` }));
  if (shown && pageVisible && overlay) result.push({ accelerator: 'Left', action: 'cycle:left' }, { accelerator: 'Right', action: 'cycle:right' }, { accelerator: 'CommandOrControl+,', action: 'settings' }, { accelerator: 'Escape', action: 'hide' }, { accelerator: loopToggleShortcut(candidate), action: 'loop' });
  if (includePlaying && active) {
    result.push(...instrumentBindings(active).map(voice => ({ accelerator: candidate.instruments[active!].keys[voice.id], action: `voice:${voice.id}` })));
  }
  return result;
}
function updateInput() {
  const shouldPlay = Boolean(overlay && shown && ready && pageVisible && !preferences && !sleeping && !pendingSettingsSaves && !quitting);
  try { registry.replace(bindings(settings, shouldPlay)); playing = shouldPlay; }
  catch (error) {
    playing = false; status = (error as Error).message;
    // A failed transition must never leave a previous instrument's keys reserved.
    registry.release();
    try { registry.replace(bindings(settings, false)); } catch { registry.release(); }
  }
  broadcast();
}
function reportError(error: unknown) { status = error instanceof Error ? error.message : String(error); broadcast(); }
function persistSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void store.save(settings).catch(reportError); }, 250);
}
function rememberPosition() {
  if (!overlay || !settings.layout || overlay.isDestroyed()) return;
  const bounds = overlay.getBounds();
  const display = screen.getDisplayMatching(bounds);
  settings.layout.position = sharedPosition(bounds, display);
  persistSoon();
}
function layoutDisplay() {
  const position = settings.layout?.position;
  return position ? screen.getAllDisplays().find(display => display.id === position.displayId) ?? screen.getPrimaryDisplay() : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}
function hideInstrument() {
  shown = false;
  playing = false;
  pageVisible = false;
  dragOrigin = null; resizeOrigin = null;
  updateInput();
  overlay?.hide();
  const previous = displayedOverlay; displayedOverlay = null;
  if (previous && previous !== overlay && !previous.isDestroyed()) previous.destroy();
}
function secureWindow(win: BrowserWindow) {
  win.webContents.on('console-message', event => { if (event.level === 'error') console.error('Renderer:', event.message); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('render-process-gone', () => { if (win === overlay) hideInstrument(); });
}
async function toggleInstrument(id: InstrumentId) {
  if (!instrumentIds.includes(id) || pendingSettingsSaves) return;
  if (active === id && shown) { hideInstrument(); return; }
  if (preferences) { preferences.close(); }
  const keepCycling = shown && pageVisible;
  dragOrigin = null; resizeOrigin = null;
  const previous = overlay; overlay = null;
  if (previous && previous !== displayedOverlay && !previous.isDestroyed()) previous.destroy();
  displayedOverlay?.setIgnoreMouseEvents(true, { forward: true });
  active = id;
  ready = false;
  playing = false;
  shown = true;
  pageVisible = keepCycling;
  status = '';
  const definition = instruments[id];
  const display = layoutDisplay();
  const area = display.workArea;
  if (!settings.layout) {
    settings.layout = initialSharedLayout(settings, id, display);
    settings.positions = {};
    setSharedAppearance(settings, { scale: settings.layout.scale });
    persistSoon();
  }
  overlayScale = fitInstrumentScale(id, settings.layout.scale, area);
  const dimensions = overlayDimensions(id, overlayScale);
  const position = positionAtAnchor(settings.layout.position, dimensions, area);
  const win = new BrowserWindow({
    ...position, ...dimensions, show: false,
    title: `Tapkit · ${definition.name}`, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, roundedCorners: false, paintWhenInitiallyHidden: true,
    alwaysOnTop: true, focusable: false, resizable: false, maximizable: false, minimizable: false, fullscreenable: false, skipTaskbar: true,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, autoplayPolicy: 'no-user-gesture-required' },
  });
  overlay = win;
  updateInput();
  secureWindow(win);
  // Keep the current desktop without Electron promoting this menu-bar app into the Dock.
  win.setVisibleOnAllWorkspaces(false, { skipTransformProcessType: true });
  win.setAlwaysOnTop(true, 'floating');
  win.on('close', event => { if (!quitting) { event.preventDefault(); hideInstrument(); } });
  win.on('closed', () => {
    if (displayedOverlay === win) displayedOverlay = null;
    if (overlay === win) { overlay = null; ready = false; hideInstrument(); }
  });
  win.on('hide', () => { if (overlay === win) { pageVisible = false; dragOrigin = null; resizeOrigin = null; updateInput(); } });
  try { await win.loadFile(join(__dirname, 'renderer/index.html'), { query: { view: 'instrument', instrument: id } }); }
  catch (error) { if (overlay !== win || win.isDestroyed()) return; hideInstrument(); reportError(error); }
}
function openSettings() {
  dragOrigin = null; resizeOrigin = null;
  if (shown) hideInstrument();
  if (preferences) { preferences.show(); return; }
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const win = new BrowserWindow({
    title: 'Tapkit · Settings', width: Math.min(1320, area.width), height: Math.min(860, area.height), minWidth: Math.min(1080, area.width), minHeight: Math.min(680, area.height), show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e20' : '#f6f6f8', titleBarStyle: 'hiddenInset', skipTaskbar: true,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, autoplayPolicy: 'no-user-gesture-required' },
  });
  preferences = win;
  updateInput();
  secureWindow(win);
  win.on('close', event => {
    if (!pendingSettingsSaves) return;
    event.preventDefault();
    void settingsWrites.then(() => { if (!win.isDestroyed()) win.close(); });
  });
  const updateAppearance = () => { if (!win.isDestroyed()) win.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#1e1e20' : '#f6f6f8'); };
  nativeTheme.on('updated', updateAppearance);
  win.on('closed', () => { nativeTheme.removeListener('updated', updateAppearance); preferences = null; updateInput(); });
  win.once('ready-to-show', () => win.show());
  void win.loadFile(join(__dirname, 'renderer/index.html'), { query: { view: 'settings' } });
}
function changeTheme(theme: ThemeId) {
  if (!active || !themeIds.includes(theme)) return;
  setSharedAppearance(settings, { theme });
  persistSoon();
  broadcast();
}
function resizeOverlay() {
  if (!overlay || !active || !settings.layout || overlay.isDestroyed()) return;
  const area = layoutDisplay().workArea;
  const fitted = fitInstrumentScale(active, settings.layout.scale, area);
  overlayScale = fitted;
  const dimensions = overlayDimensions(active, fitted);
  const position = positionAtAnchor(settings.layout.position, dimensions, area);
  overlay.setBounds({ ...position, ...dimensions }, false);
}
function refreshMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'TAPKIT', enabled: false },
    { label: status || (playing ? `${instruments[active!].name} · playing` : shown ? 'Instrument paused' : 'Tap along'), enabled: false },
    { type: 'separator' },
    ...settings.instrumentOrder.map(id => ({ label: instruments[id].name, type: 'checkbox' as const, checked: shown && active === id, accelerator: settings.instruments[id].shortcut, registerAccelerator: false, click: () => { void toggleInstrument(id); } })),
    { type: 'separator' },
    { label: 'Settings…', accelerator: 'CommandOrControl+,', registerAccelerator: false, click: openSettings },
    { type: 'separator' },
    { label: 'Quit Tapkit', click: () => app.quit() },
  ]));
}
function trusted(event: IpcMainEvent | IpcMainInvokeEvent, role?: 'overlay' | 'settings'): boolean {
  const win = BrowserWindow.fromWebContents(event.sender);
  return event.senderFrame === event.sender.mainFrame && Boolean(win && (role === 'overlay' ? win === overlay : role === 'settings' ? win === preferences : win === overlay || win === preferences));
}
function setupIPC() {
  ipcMain.on('tapkit:failed', (event, message: unknown) => {
    if (!trusted(event, 'overlay') || typeof message !== 'string') return;
    status = message.slice(0, 500); ready = false; hideInstrument();
  });
  ipcMain.handle('tapkit:get-state', event => { if (!trusted(event)) throw new Error('Unknown window.'); return snapshot(); });
  ipcMain.handle('tapkit:ready', event => {
    if (!trusted(event, 'overlay') || !overlay) return;
    ready = true;
    if (shown) {
      overlay.setIgnoreMouseEvents(true, { forward: true });
      overlay.showInactive();
      const previous = displayedOverlay; displayedOverlay = overlay;
      if (previous && previous !== overlay && !previous.isDestroyed()) previous.destroy();
      pageVisible = true;
      updateInput();
    }
  });
  ipcMain.on('tapkit:visibility', (event, visible: unknown) => {
    if (!trusted(event, 'overlay') || typeof visible !== 'boolean') return;
    pageVisible = shown && visible;
    if (!pageVisible) { dragOrigin = null; resizeOrigin = null; }
    updateInput();
  });
  ipcMain.on('tapkit:hide', event => { if (trusted(event)) hideInstrument(); });
  ipcMain.on('tapkit:toggle', (event, id: InstrumentId) => { if (trusted(event) && instrumentIds.includes(id)) void toggleInstrument(id); });
  ipcMain.on('tapkit:settings', event => { if (trusted(event)) openSettings(); });
  ipcMain.on('tapkit:close-settings', event => { if (trusted(event, 'settings')) preferences?.close(); });
  ipcMain.on('tapkit:theme', (event, theme: ThemeId) => { if (trusted(event, 'overlay')) changeTheme(theme); });
  ipcMain.on('tapkit:volume', (event, value: unknown) => {
    if (!trusted(event, 'overlay') || !active || typeof value !== 'number' || !Number.isFinite(value)) return;
    settings.instruments[active].volume = Math.max(0, Math.min(1, value)); persistSoon(); broadcast();
  });
  ipcMain.on('tapkit:range', (event, id: InstrumentId, range: number) => {
    if (!trusted(event, 'overlay') || active !== id || !instrumentIds.includes(id) || pendingSettingsSaves || quitting) return;
    const ranges = instruments[id].ranges;
    if (!ranges || !Number.isInteger(range) || range < 0 || range >= ranges.length) return;
    settings.instruments[id].range = range; persistSoon(); broadcast();
  });
  ipcMain.handle('tapkit:loop', (event, id: InstrumentId, value: LoopClip | null) => {
    if (!trusted(event) || !instrumentIds.includes(id) || (BrowserWindow.fromWebContents(event.sender) === overlay && active !== id)) return { ok: false, error: 'Unknown instrument window.' };
    const write = settingsWrites.then(async () => {
      const previous = settings.loops;
      try {
        const loops = { ...previous };
        if (value === null) delete loops[id]; else loops[id] = validateLoop(id, value);
        settings.loops = loops;
        clearTimeout(saveTimer);
        await store.save(settings); broadcast(false);
        return { ok: true } as const;
      } catch (error) { settings.loops = previous; return { ok: false, error: (error as Error).message } as const; }
    });
    settingsWrites = write.then(() => {}); return write;
  });
  ipcMain.on('tapkit:pointer', (event, interactive: unknown) => {
    if (trusted(event, 'overlay') && typeof interactive === 'boolean') overlay?.setIgnoreMouseEvents(!interactive, { forward: true });
  });
  ipcMain.on('tapkit:drag', (event, phase: unknown, point: Position) => {
    if (!trusted(event, 'overlay') || !overlay || !shown || !pageVisible || preferences || pendingSettingsSaves || quitting || resizeOrigin || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    if (phase === 'start') { const bounds = overlay.getBounds(); dragOrigin = { pointer: point, bounds }; }
    else if (phase === 'move' && dragOrigin) {
      const bounds = overlay.getBounds();
      const target = { x: dragOrigin.bounds.x + point.x - dragOrigin.pointer.x, y: dragOrigin.bounds.y + point.y - dragOrigin.pointer.y };
      const display = screen.getDisplayNearestPoint(point);
      const clamped = clampPosition(target, bounds, display.workArea);
      overlay.setPosition(clamped.x, clamped.y, false);
      rememberPosition();
    } else if (phase === 'end') { dragOrigin = null; rememberPosition(); }
  });
  ipcMain.on('tapkit:resize', (event, phase: unknown, point: Position) => {
    if (!trusted(event, 'overlay') || !overlay || !active || !shown || !pageVisible || preferences || pendingSettingsSaves || quitting || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    if (phase === 'start') {
      const bounds = overlay.getBounds();
      dragOrigin = null;
      resizeOrigin = { bounds, pointer: point, scale: overlayScale ?? instrumentScale(settings.instruments[active]), workArea: screen.getDisplayMatching(bounds).workArea };
    } else if ((phase === 'move' || phase === 'end') && resizeOrigin) {
      const { scale, ...bounds } = resizeInstrument(active, resizeOrigin, point);
      setSharedAppearance(settings, { scale });
      overlayScale = scale;
      overlay.setBounds(bounds, false);
      if (phase === 'end') resizeOrigin = null;
      rememberPosition(); broadcast(phase === 'end');
    }
  });
  ipcMain.handle('tapkit:save-settings', (event, value: unknown) => {
    if (!trusted(event, 'settings')) return { ok: false, error: 'Unknown settings window.' };
    pendingSettingsSaves++;
    const write = settingsWrites.then(async () => {
      try {
        const candidate = validateSettings(value);
        shareAppearanceChanges(settings, candidate);
        if (settings.layout && candidate.layout) candidate.layout.position = settings.layout.position;
        candidate.positions = settings.positions;
        candidate.loops = settings.loops; // Loop edits have their own serialized path; form saves cannot erase them.
        const bindingsChanged = instrumentIds.some(id => {
          const next = candidate.instruments[id], previous = settings.instruments[id];
          return next.shortcut !== previous.shortcut || instrumentBindings(id).some(voice => next.keys[voice.id] !== previous.keys[voice.id]);
        });
        if (bindingsChanged) {
          const proposed = instrumentIds.map(id => ({ accelerator: candidate.instruments[id].shortcut, action: `summon:${id}` }));
          // Probe each map separately; theme/size/volume edits never intercept typing.
          for (const id of instrumentIds) {
            registry.replace([...proposed, ...instrumentBindings(id).map(voice => ({ accelerator: candidate.instruments[id].keys[voice.id], action: `voice:${voice.id}` })), { accelerator: 'Escape', action: 'hide' }]);
            registry.release();
          }
        }
        clearTimeout(saveTimer);
        await store.save(candidate);
        const resized = active && instrumentScale(settings.instruments[active]) !== instrumentScale(candidate.instruments[active]);
        settings = candidate;
        if (resized) resizeOverlay();
        status = '';
        return { ok: true } as const;
      } catch (error) { return { ok: false, error: (error as Error).message } as const; }
      finally { registry.release(); pendingSettingsSaves--; updateInput(); }
    });
    settingsWrites = write.then(() => {});
    return write;
  });
  ipcMain.on('tapkit:timing', (event, report: TimingReport) => {
    if (!trusted(event, 'overlay') || !report || !Object.values(report).every(n => typeof n === 'number' && Number.isFinite(n))) return;
    timing.push(report); if (timing.length > 1000) timing.shift();
    if (process.env.TAPKIT_DIAGNOSTICS) console.log(JSON.stringify({ type: 'timing', ...report }));
  });
}

if (singleInstance) app.whenReady().then(async () => {
  if (process.platform === 'darwin') app.setActivationPolicy('accessory');
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Tapkit', submenu: [{ role: 'about' }, { label: 'Settings…', accelerator: 'CommandOrControl+,', click: openSettings }, { role: 'quit' }] }, { label: 'File', submenu: [{ id: 'close-window', label: 'Close Window', accelerator: 'CommandOrControl+W', click: (_item, window) => window?.close() }] }, { role: 'editMenu' }, { role: 'windowMenu' }]));
  store = new SettingsStore(join(app.getPath('userData'), 'settings.json'));
  const loaded = await store.load(); settings = loaded.settings; status = loaded.warning ?? '';
  const icon = nativeImage.createEmpty();
  for (const scaleFactor of [1, 2]) icon.addRepresentation({
    scaleFactor,
    buffer: readFileSync(join(__dirname, `assets/trayTemplate${scaleFactor === 2 ? '@2x' : ''}.png`)),
  });
  icon.setTemplateImage(true);
  tray = new Tray(icon); tray.setToolTip('Tapkit · Tap along');
  setupIPC(); updateInput();
  const displayChanged = () => { dragOrigin = null; resizeOrigin = null; resizeOverlay(); broadcast(); };
  screen.on('display-removed', displayChanged);
  screen.on('display-metrics-changed', displayChanged);
  powerMonitor.on('suspend', () => { dragOrigin = null; resizeOrigin = null; sleeping = true; updateInput(); });
  powerMonitor.on('lock-screen', () => { dragOrigin = null; resizeOrigin = null; sleeping = true; updateInput(); });
  powerMonitor.on('resume', () => { sleeping = false; updateInput(); });
  powerMonitor.on('unlock-screen', () => { sleeping = false; updateInput(); });
  if (process.argv.includes('--settings')) openSettings();
  const initial = process.argv.find(arg => arg.startsWith('--instrument='))?.split('=')[1];
  if (instrumentIds.includes(initial as InstrumentId)) void toggleInstrument(initial as InstrumentId);
}).catch(error => { console.error(error); app.quit(); });

app.on('second-instance', (_event, argv) => {
  const id = argv.find(arg => arg.startsWith('--instrument='))?.split('=')[1] as InstrumentId;
  if (instrumentIds.includes(id)) void toggleInstrument(id);
  else openSettings();
});
app.on('window-all-closed', () => {});
app.on('before-quit', event => {
  registry.release(); clearTimeout(saveTimer);
  if (quitting || !store) return;
  event.preventDefault(); quitting = true;
  void settingsWrites.then(() => store.save(settings)).catch(error => console.error(error)).finally(() => app.quit());
});
app.on('will-quit', () => {
  registry.release();
  if (timing.length) {
    const directory = join(app.getPath('userData'), 'diagnostics');
    try { mkdirSync(directory, { recursive: true }); writeFileSync(join(directory, 'timing.jsonl'), timing.map(item => JSON.stringify(item)).join('\n') + '\n'); } catch (error) { console.error(error); }
  }
});
