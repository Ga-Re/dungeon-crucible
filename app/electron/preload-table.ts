/**
 * Table window preload: the table may only receive player frames, nothing else.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { DcTableApi } from '../src/platform/desktop-api';

const api: DcTableApi = {
  onFrame(cb) {
    const listener = (_e: IpcRendererEvent, frame: unknown) => cb(frame);
    ipcRenderer.on('player-frame', listener);
    return () => {
      ipcRenderer.removeListener('player-frame', listener);
    };
  },
};

contextBridge.exposeInMainWorld('dcTable', api);
