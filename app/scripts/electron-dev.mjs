// `npm start`: Vite dev server (hot reload for the pages) + Electron pointed at it.
// Changes under electron/ need a restart.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import electron from 'electron';
import { createServer } from 'vite';
import { buildElectron } from './build-electron.mjs';

const root = resolve(import.meta.dirname, '..');
const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts') });
await server.listen();
const url = server.resolvedUrls?.local[0] ?? 'http://localhost:1420/';
await buildElectron({ mode: 'development' });

const child = spawn(String(electron), ['.'], { cwd: root, stdio: 'inherit', env: { ...process.env, VITE_DEV_SERVER_URL: url } });
const stop = async (code) => {
  await server.close();
  process.exit(code ?? 0);
};
child.on('exit', (code) => void stop(code));
process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());
