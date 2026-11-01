import { contextBridge, ipcRenderer } from 'electron';
import type { TapkitBridge, AppState, Hit } from './shared/model';

function subscribe<T>(channel: string, callback: (value: T) => void) {
  const listener = (_event: Electron.IpcRendererEvent, value: T) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
const bridge: TapkitBridge = {
  getState: () => ipcRenderer.invoke('tapkit:get-state'),
  ready: () => ipcRenderer.invoke('tapkit:ready'),
  failed: message => ipcRenderer.send('tapkit:failed', message),
  visibility: visible => ipcRenderer.send('tapkit:visibility', visible),
  onState: callback => subscribe<AppState>('tapkit:state', callback),
  onHit: callback => subscribe<Hit>('tapkit:hit', callback),
  onToggleLoop: callback => subscribe('tapkit:toggle-loop', callback),
  hide: () => ipcRenderer.send('tapkit:hide'),
  toggle: id => ipcRenderer.send('tapkit:toggle', id),
  openSettings: () => ipcRenderer.send('tapkit:settings'),
  saveSettings: settings => ipcRenderer.invoke('tapkit:save-settings', settings),
  closeSettings: () => ipcRenderer.send('tapkit:close-settings'),
  setTheme: theme => ipcRenderer.send('tapkit:theme', theme),
  setVolume: volume => ipcRenderer.send('tapkit:volume', volume),
  setRange: (id, range) => ipcRenderer.send('tapkit:range', id, range),
  setLoop: (id, clip) => ipcRenderer.invoke('tapkit:loop', id, clip),
  pointerInteractive: interactive => ipcRenderer.send('tapkit:pointer', interactive),
  drag: (phase, point) => ipcRenderer.send('tapkit:drag', phase, point),
  resize: (phase, point) => ipcRenderer.send('tapkit:resize', phase, point),
  reportTiming: report => ipcRenderer.send('tapkit:timing', report),
};
contextBridge.exposeInMainWorld('tapkit', bridge);
