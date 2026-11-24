/**
 * Electron main process of Dungeon Crucible.
 *
 * - DM window (`index.html`) with the `window.dc` API from `preload.ts`.
 * - Table window (`table.html`) that can only receive player frames (`preload-table.ts`).
 * - `app://dc/…` serves the built pages; `dc-asset://file/…` serves files of the open
 *   campaign folder only (maps, videos), with CORS and byte ranges.
 * - Floating panels live in frameless child windows the DM window opens itself (`floating.ts`).
 * - Closing the DM window quits the app, so nothing is left on the TV.
 */
import { app, BrowserWindow, ipcMain, Menu, protocol, screen, session, shell, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { ASSET_SCHEME, assetPathFrom } from '../src/platform/asset-url';
import { Campaign } from './campaign';
import { fileResponse, isInside } from './files';
import { FloatingWindows } from './floating';
import type { FloatBounds } from '../src/platform/desktop-api';
import { listDisplays, screenSetup, TableWindow } from './table';

const DEV_URL = process.env['VITE_DEV_SERVER_URL'];
const BENCH = process.env['VITE_BENCH'] === '1';
const APP_ORIGIN = 'app://dc';
const DIST = path.join(__dirname, '..', 'dist');

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self' blob:",
  `img-src 'self' ${ASSET_SCHEME}: blob: data:`,
  `media-src 'self' ${ASSET_SCHEME}: blob:`,
  `connect-src 'self' ${ASSET_SCHEME}: blob: data:`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
].join('; ');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const campaign = new Campaign();
let mainWindow: BrowserWindow | null = null;

function pageUrl(page: string): string {
  return DEV_URL ? new URL(page, DEV_URL).href : `${APP_ORIGIN}/${page}`;
}

function isOwnUrl(url: string): boolean {
  return url.startsWith(`${APP_ORIGIN}/`) || (!!DEV_URL && url.startsWith(DEV_URL));
}

/**
 * Sends to the DM window if it still exists. While it closes, its child windows (floating
 * panels) close after its web contents are gone and must not report to it any more.
 */
function toMain(channel: string, ...args: unknown[]): void {
  const w = mainWindow;
  if (w && !w.isDestroyed() && !w.webContents.isDestroyed()) w.webContents.send(channel, ...args);
}

const table = new TableWindow({
  preload: path.join(__dirname, 'preload-table.cjs'),
  url: () => pageUrl(BENCH ? 'bench.html' : 'table.html'),
  onReady: () => toMain('table:ready'),
  onClosed: () => toMain('table:closed'),
});

const floating = new FloatingWindows({
  moved: (name, bounds) => toMain('float:moved', name, bounds),
  closed: (name) => toMain('float:closed', name),
});

/** Default for every window: no popups; external web links open in the browser. */
function denyWindowOpen({ url }: { url: string }): { action: 'deny' } {
  if (/^https?:\/\//.test(url) && !isOwnUrl(url)) void shell.openExternal(url);
  return { action: 'deny' };
}

function createMainWindow(): void {
  const win = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1100,
    minHeight: 700,
    title: 'Dungeon Crucible',
    show: false,
    backgroundColor: '#1f232b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // The frame loop feeds the table's heartbeat; it must not be throttled when the DM
      // window is hidden or in the background.
      backgroundThrottling: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    mainWindow = null;
    table.close();
    app.quit();
  });
  win.webContents.setWindowOpenHandler((details) => floating.openHandler(win, details) ?? denyWindowOpen(details));
  win.webContents.on('did-create-window', (child, details) => floating.adopt(child, details.frameName));
  void win.loadURL(pageUrl('index.html'));
  mainWindow = win;
}

/** Only the DM window may call the privileged API. */
function fromMain(e: IpcMainInvokeEvent | IpcMainEvent): boolean {
  return !!mainWindow && e.sender === mainWindow.webContents;
}

function handle<A extends unknown[], R>(channel: string, fn: (win: BrowserWindow, ...args: A) => R | Promise<R>): void {
  ipcMain.handle(channel, (e, ...args) => {
    if (!fromMain(e) || !mainWindow) throw new Error('Not allowed');
    return fn(mainWindow, ...(args as A));
  });
}

function registerIpc(): void {
  handle('displays:list', () => listDisplays());
  handle('displays:screens', (w) => screenSetup(w));
  ipcMain.on('displays:screensSync', (e) => {
    e.returnValue = fromMain(e) ? screenSetup(mainWindow) : null;
  });
  handle('table:open', (_w, index: number, title: string) => table.open(index, title));
  handle('table:close', () => table.close());
  ipcMain.on('table:frame', (e, frame: unknown) => {
    if (fromMain(e)) table.send('player-frame', frame);
  });
  ipcMain.on('float:bounds', (e, name: string, bounds: FloatBounds) => {
    if (fromMain(e)) floating.setBounds(name, bounds);
  });
  handle('window:contentOrigin', (w) => {
    const b = w.getContentBounds();
    return { x: b.x, y: b.y };
  });

  handle('campaign:pick', (w) => campaign.pick(w));
  handle('campaign:open', (_w, folder: string) => campaign.activate(folder));
  handle('campaign:read', (_w, rel: string) => campaign.readText(rel));
  handle('campaign:write', (_w, rel: string, content: string) => campaign.writeText(rel, content));
  handle('campaign:list', (_w, dir: string) => campaign.listFiles(dir));
  handle('campaign:absolute', (_w, rel: string) => campaign.absolutePath(rel));
  handle('campaign:importMap', (w) => campaign.importMap(w));

  const displaysChanged = () => toMain('displays:changed');
  screen.on('display-added', displaysChanged);
  screen.on('display-removed', displaysChanged);
  screen.on('display-metrics-changed', displaysChanged);
}

function registerProtocols(): void {
  protocol.handle('app', async (req) => {
    const url = new URL(req.url);
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.join(DIST, rel);
    if (url.host !== 'dc' || !isInside(DIST, file)) return new Response('Not found', { status: 404 });
    return fileResponse(file, req.headers.get('range'), file.endsWith('.html') ? { 'Content-Security-Policy': CSP } : {});
  });

  protocol.handle(ASSET_SCHEME, async (req) => {
    const requested = assetPathFrom(req.url);
    const file = requested ? await campaign.allows(requested) : null;
    if (!file) return new Response('Forbidden', { status: 403 });
    return fileResponse(file, req.headers.get('range'), { 'Access-Control-Allow-Origin': '*' });
  });
}

function lockDown(): void {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'fullscreen' || permission === 'clipboard-sanitized-write'));
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-navigate', (e, url) => {
      if (!isOwnUrl(url)) e.preventDefault();
    });
    // The DM window replaces this with a handler that also allows floating panel windows.
    contents.setWindowOpenHandler(denyWindowOpen);
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });
  void app.whenReady().then(() => {
    if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
    lockDown();
    registerProtocols();
    registerIpc();
    createMainWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
