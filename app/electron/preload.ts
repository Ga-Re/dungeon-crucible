/**
 * DM window preload: exposes `window.dc`. Runs sandboxed; it may only import `electron`
 * (types from elsewhere are fine) and is bundled into a single file.
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { DcApi, FloatBounds, PackProgress } from '../src/platform/desktop-api';

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
  screensSync: () => ipcRenderer.sendSync('displays:screensSync'),
  screens: () => ipcRenderer.invoke('displays:screens'),
  openTable: (index, title) => ipcRenderer.invoke('table:open', index, title),
  closeTable: () => ipcRenderer.invoke('table:close'),
  sendFrame: (frame) => ipcRenderer.send('table:frame', frame),
  sendRaster: (batch) => ipcRenderer.send('table:raster', batch),
  onTableReady: on('table:ready'),
  onTableClosed: on('table:closed'),
  rootInfo: () => ipcRenderer.invoke('root:info'),
  chooseRoot: (useSuggested) => ipcRenderer.invoke('root:choose', useSuggested),
  readText: (rel) => ipcRenderer.invoke('files:read', rel),
  writeText: (rel, content) => ipcRenderer.invoke('files:write', rel, content),
  listFiles: (dir) => ipcRenderer.invoke('files:list', dir),
  absolutePath: (rel) => ipcRenderer.invoke('files:absolute', rel),
  trash: (rel, withSidecar) => ipcRenderer.invoke('files:trash', rel, withSidecar),
  listCampaigns: () => ipcRenderer.invoke('campaigns:list'),
  createCampaign: (name) => ipcRenderer.invoke('campaigns:create', name),
  trashCampaign: (slug) => ipcRenderer.invoke('campaigns:trash', slug),
  importToLibrary: (kind) => ipcRenderer.invoke('library:import', kind),
  listLibrary: () => ipcRenderer.invoke('library:list'),
  importAssets: () => ipcRenderer.invoke('library:importAssets'),
  importDropped: (fileName, bytes) => ipcRenderer.invoke('library:importDropped', fileName, bytes),
  pickPack: () => ipcRenderer.invoke('library:pickPack'),
  importPack: (token, folders) => ipcRenderer.invoke('library:importPack', token, folders),
  cancelPack: (token) => ipcRenderer.invoke('library:cancelPack', token),
  onPackProgress: (cb) => {
    const listener = (_e: unknown, p: PackProgress) => cb(p);
    ipcRenderer.on('library:packProgress', listener);
    return () => {
      ipcRenderer.removeListener('library:packProgress', listener);
    };
  },
  readThumb: (key) => ipcRenderer.invoke('thumbs:read', key),
  writeThumb: (key, bytes) => ipcRenderer.invoke('thumbs:write', key, bytes),
  exportCampaignArchive: (slug, name, libraryFiles) => ipcRenderer.invoke('archive:export', slug, name, libraryFiles),
  importCampaignArchive: () => ipcRenderer.invoke('archive:import'),
  setFloatBounds: (name, bounds) => ipcRenderer.send('float:bounds', name, bounds),
  onFloatMoved: (cb) => {
    const listener = (_e: unknown, name: string, bounds: FloatBounds) => cb(name, bounds);
    ipcRenderer.on('float:moved', listener);
    return () => {
      ipcRenderer.removeListener('float:moved', listener);
    };
  },
  onFloatClosed: (cb) => {
    const listener = (_e: unknown, name: string) => cb(name);
    ipcRenderer.on('float:closed', listener);
    return () => {
      ipcRenderer.removeListener('float:closed', listener);
    };
  },
  contentOrigin: () => ipcRenderer.invoke('window:contentOrigin'),
};

contextBridge.exposeInMainWorld('dc', api);
