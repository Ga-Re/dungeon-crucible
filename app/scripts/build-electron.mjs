// Bundles the Electron main process and the two preload scripts into dist-electron/*.cjs.
// Each entry is built on its own so every output is a single self-contained file:
// sandboxed preloads may only require("electron"), never a shared chunk.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = resolve(import.meta.dirname, '..');
const ENTRIES = ['main', 'preload', 'preload-table'];

export async function buildElectron({ mode = 'production' } = {}) {
  for (const [i, name] of ENTRIES.entries()) {
    await build({
      configFile: false,
      root,
      mode,
      logLevel: 'warn',
      build: {
        ssr: resolve(root, `electron/${name}.ts`),
        outDir: 'dist-electron',
        emptyOutDir: i === 0,
        target: 'node22',
        minify: false,
        sourcemap: true,
        rollupOptions: {
          external: ['electron', /^node:/],
          output: { format: 'cjs', entryFileNames: `${name}.cjs` },
        },
      },
    });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildElectron();
  console.log(`Electron bundles built: ${ENTRIES.map((n) => `${n}.cjs`).join(', ')}`);
}
