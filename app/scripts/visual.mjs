// `npm run visual` (DC-126, E-91): the image comparisons. Starts the Vite dev server and Electron,
// which draws each scene of `src/visual/scenes.ts` in an invisible window and compares the picture
// with its reference in `visual/` (own pixel comparison, no browser download). `-- --update` writes
// the references anew; differences are written to `visual-out/`. Local only: other GPUs draw
// slightly differently, so CI does not run it.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import electron from 'electron';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '..');
const update = process.argv.includes('--update');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), server: { port: 1432, strictPort: false }, logLevel: 'warn' });
await server.listen();
const url = new URL('visual.html', server.resolvedUrls?.local[0] ?? 'http://localhost:1432/').href;

// One Electron per scene: a window after another in one process can hang while the dev server
// optimises its dependencies.
const scenesFile = readFileSync(resolve(root, 'src/visual/scenes.ts'), 'utf8');
const known = [...scenesFile.matchAll(/^\s+'?([a-z0-9-]+)'?: \(\) =>/gm)].map((m) => m[1]);
const unknown = only.filter((s) => !known.includes(s));
const scenes = known.filter((s) => !only.length || only.includes(s));
if (unknown.length || !scenes.length) {
  console.log(unknown.length ? `Unknown scenes: ${unknown.join(', ')} (known: ${known.join(', ')})` : 'No scenes found in src/visual/scenes.ts');
  await server.close();
  process.exit(1);
}
let failed = 0;
for (const scene of scenes) {
  const code = await new Promise((done) => {
    const child = spawn(String(electron), [resolve(import.meta.dirname, 'visual-main.cjs')], {
      cwd: root,
      stdio: ['ignore', 'inherit', 'pipe'],
      env: { ...process.env, VISUAL_URL: url, VISUAL_UPDATE: update ? '1' : '', VISUAL_SCENE: scene, VISUAL_ROOT: root },
    });
    // Electron's own output is noise while a scene passes; shown when it does not.
    let errors = '';
    child.stderr.on('data', (d) => (errors += d));
    child.on('error', (error) => {
      console.log(`${scene}: FAILED – Electron did not start (${String(error)})`);
      done(1);
    });
    child.on('exit', (c) => {
      if (c !== 0 && errors.trim()) console.log(errors.trim());
      done(c);
    });
  });
  if (code !== 0) failed++;
}
console.log(failed ? `${failed} of ${scenes.length} scenes differ or failed` : `All ${scenes.length} scenes match`);
await server.close();
process.exit(failed ? 1 : 0);
