import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
// @ts-expect-error plain JS dev plugin ported from Dungeon-Manager
import { benchResults } from './bench/vite-plugin-bench-results.js';

// Renderer benchmark: `npm run bench` sets VITE_BENCH=1 and the table window loads bench.html.
const bench = process.env['VITE_BENCH'] === '1';

// Two entry points: the DM window (index.html) and the table window (table.html).
// The table bundle must not import the DM state; it only consumes PlayerFrames.
export default defineConfig({
  plugins: [react(), ...(bench ? [benchResults()] : [])],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_'],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        table: resolve(import.meta.dirname, 'table.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'electron/**/*.test.ts'],
  },
});
