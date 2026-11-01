import { app, BrowserWindow, globalShortcut } from 'electron';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

mkdirSync('.artifacts', { recursive: true });
const report = resolve('.artifacts/feasibility.jsonl');
const log = (event: unknown) => { appendFileSync(report, JSON.stringify(event) + '\n'); console.log(event); };

app.whenReady().then(async () => {
  const observer = new BrowserWindow({ title: 'Tapkit input observer', width: 440, height: 220 });
  await observer.loadURL('data:text/html,' + encodeURIComponent('<h2>Tapkit input observer</h2><p>Mapped keys must not appear below.</p><input autofocus style="font-size:24px;width:90%"/><script>document.addEventListener("keydown",e=>console.log("OBSERVER",e.key))</script>'));
  const win = new BrowserWindow({ title: 'Tapkit feasibility', width: 300, height: 200, x: 900, y: 80, frame: false, transparent: true, alwaysOnTop: true, focusable: false, webPreferences: { autoplayPolicy: 'no-user-gesture-required' } });
  const playingKeys = ['D', 'F', 'J', 'K', 'Escape'];
  const release = () => { for (const key of playingKeys) globalShortcut.unregister(key); };
  const reserve = () => {
    for (const key of playingKeys.slice(0, 4)) log({ registration: key, ok: globalShortcut.register(key, () => { log({ hit: key, time: performance.now(), focused: win.isFocused(), visible: win.isVisible() }); void win.webContents.executeJavaScript('window.hit()'); }) });
    globalShortcut.register('Escape', () => { release(); win.hide(); log({ hidden: true }); });
  };
  win.webContents.on('console-message', event => {
    log({ renderer: event.message });
    if (event.message === 'VISIBILITY hidden') release();
    if (event.message === 'VISIBILITY visible') reserve();
  });
  const sound = readFileSync('assets/audio/C4.mp3').toString('base64');
  await win.loadURL('data:text/html,' + encodeURIComponent(`<body style="margin:0;background:transparent"><div style="border-radius:80px;background:#e7a55d;padding:35px;text-align:center;font:24px system-ui">Tapkit<br>D F J K</div><script>
  const ctx = new AudioContext({latencyHint:'interactive'}); let buffer;
  fetch('data:audio/mp3;base64,${sound}').then(r=>r.arrayBuffer()).then(b=>ctx.decodeAudioData(b)).then(b=>{buffer=b;console.log('AUDIO READY',ctx.state,ctx.baseLatency,ctx.outputLatency)});
  window.hit=()=>{const t=performance.now();const s=ctx.createBufferSource();s.buffer=buffer;s.connect(ctx.destination);s.start();console.log('SCHEDULE_MS',performance.now()-t);};
  document.addEventListener('visibilitychange',()=>console.log('VISIBILITY',document.visibilityState));
  </script>`));
  reserve();
  globalShortcut.register('CommandOrControl+Alt+D', () => { if (win.isVisible()) { release(); win.hide(); } else win.showInactive(); });
  observer.focus();
  observer.webContents.on('console-message', event => log({ observer: event.message }));
  win.webContents.on('did-finish-load', () => log({ loaded: true }));
  win.on('closed', () => app.quit());
});
app.on('will-quit', () => globalShortcut.unregisterAll());
