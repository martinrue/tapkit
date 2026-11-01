import { app, BrowserWindow } from 'electron';
import { mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const profile = resolve('.artifacts/audio-profile'); mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
app.on('window-all-closed', () => {});
void app.whenReady().then(async () => {
  app.dock?.hide();
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true } });
  win.webContents.setAudioMuted(true);
  await win.loadFile(resolve('.artifacts/audio-check.html'));
  await win.webContents.executeJavaScript(await readFile(resolve('.artifacts/audio-check-renderer.js'), 'utf8'));
  const result = await win.webContents.executeJavaScript('window.runAudioCheck()');
  await writeFile(resolve('.artifacts/audio-check.json'), JSON.stringify(result, null, 2));
  console.log('Audio checks passed:', { instruments: result.instruments, additivePairs: result.overlaps.length, dense: result.dense, soloTransitions: result.solo.length, voiceLimit: result.voiceLimit });
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
