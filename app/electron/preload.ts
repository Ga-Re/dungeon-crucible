/**
 * DM window preload: exposes `window.dc`. Runs sandboxed; it may only import `electron`
 * (types from elsewhere are fine) and is bundled into a single file.
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { DcApi } from '../src/platform/desktop-api';

function on(channel: string) {
  return (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  };
}

const api: DcApi = {
  listDisplays: () => ipcRenderer.invoke('displays:list'),
  onDisplaysChanged: on('displays:changed'),
  openTable: (index, title) => ipcRenderer.invoke('table:open', index, title),
  closeTable: () => ipcRenderer.invoke('table:close'),
  sendFrame: (frame) => ipcRenderer.send('table:frame', frame),
  onTableReady: on('table:ready'),
  onTableClosed: on('table:closed'),
  pickCampaignFolder: () => ipcRenderer.invoke('campaign:pick'),
  openCampaignFolder: (path) => ipcRenderer.invoke('campaign:open', path),
  readText: (rel) => ipcRenderer.invoke('campaign:read', rel),
  writeText: (rel, content) => ipcRenderer.invoke('campaign:write', rel, content),
  listFiles: (dir) => ipcRenderer.invoke('campaign:list', dir),
  absolutePath: (rel) => ipcRenderer.invoke('campaign:absolute', rel),
  importMapFile: () => ipcRenderer.invoke('campaign:importMap'),
};

contextBridge.exposeInMainWorld('dc', api);
