import { contextBridge, ipcRenderer } from 'electron';
import type { TapkitBridge, AppState, Hit } from '../src/shared/model';

function subscribe<T>(channel: string, callback: (value: T) => void) {
  const listener = (_event: Electron.IpcRendererEvent, value: T) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
// Isolated renderer fixture: no global shortcuts, user settings, or host UI input.
const bridge: TapkitBridge = {
  getState: () => ipcRenderer.invoke('check:get-state'), ready: () => ipcRenderer.invoke('check:ready'),
  failed: message => ipcRenderer.send('check:failed', message), visibility: () => {},
  onState: callback => subscribe<AppState>('tapkit:state', callback), onHit: callback => subscribe<Hit>('tapkit:hit', callback),
  onToggleLoop: callback => subscribe('tapkit:toggle-loop', callback),
  hide: () => {}, toggle: () => {}, openSettings: () => ipcRenderer.send('check:open-settings'), saveSettings: settings => ipcRenderer.invoke('check:save-settings', settings), closeSettings: () => {},
  setTheme: theme => ipcRenderer.send('check:theme', theme), setVolume: () => {}, pointerInteractive: interactive => ipcRenderer.send('check:pointer', interactive), drag: (phase, point) => ipcRenderer.send('check:drag', phase, point),
  resize: (phase, point) => ipcRenderer.send('check:resize', phase, point),
  setRange: (id, range) => ipcRenderer.send('check:set-range', id, range),
  setLoop: (id, clip) => ipcRenderer.invoke('check:set-loop', id, clip),
  reportTiming: report => ipcRenderer.send('check:timing', report),
};
contextBridge.exposeInMainWorld('tapkit', bridge);
