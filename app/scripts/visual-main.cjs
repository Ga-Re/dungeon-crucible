// Electron side of `npm run visual` (see visual.mjs): one scene (`VISUAL_SCENE`) in an invisible
// window, the picture compared with `visual/<scene>.png`. A pixel differs when a channel is off by more than 32 (GPU
// rounding stays below); a scene fails when more than 0.2 % of its pixels differ.
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const SIZE = 512;
const CHANNEL = 32;
const SHARE = 0.002;
const root = process.env.VISUAL_ROOT;
const refDir = path.join(root, 'visual');
const outDir = path.join(root, 'visual-out');
const update = process.env.VISUAL_UPDATE === '1';

async function shoot(scene) {
  const win = new BrowserWindow({ show: false, width: SIZE, height: SIZE, useContentSize: true, webPreferences: { offscreen: true } });
  try {
    // The dev server may still be optimising its dependencies on the first loads: tried again.
    for (let tries = 1; ; tries++) {
      try {
        await win.loadURL(`${process.env.VISUAL_URL}?scene=${encodeURIComponent(scene)}`);
        break;
      } catch (error) {
        if (tries === 3) throw error;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    for (let i = 0; i < 600 && !/ready|failed/.test(win.getTitle()); i++) await new Promise((r) => setTimeout(r, 100));
    const title = win.getTitle();
    if (!title.endsWith('ready')) throw new Error(title.includes('failed') ? title : `${scene}: not drawn within 60 s`);
    return (await win.webContents.capturePage()).resize({ width: SIZE, height: SIZE });
  } finally {
    win.destroy();
  }
}

/** Pixels that differ, and a picture of them (the new picture greyed, differences red). */
function compare(now, ref) {
  const a = now.toBitmap();
  const b = ref.toBitmap();
  const diff = Buffer.alloc(a.length);
  let differ = 0;
  for (let i = 0; i < a.length; i += 4) {
    const off = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
    const grey = Math.round((a[i] + a[i + 1] + a[i + 2]) / 6);
    // BGRA
    if (off > CHANNEL) {
      differ++;
      diff.set([0, 0, 255, 255], i);
    } else diff.set([grey, grey, grey, 255], i);
  }
  return { share: differ / (a.length / 4), diff: nativeImage.createFromBitmap(diff, { width: SIZE, height: SIZE }) };
}

app.whenReady().then(async () => {
  const scene = process.env.VISUAL_SCENE;
  const ref = path.join(refDir, `${scene}.png`);
  fs.mkdirSync(refDir, { recursive: true });
  let ok = true;
  try {
    const now = await shoot(scene);
    if (update) {
      fs.writeFileSync(ref, now.toPNG());
      console.log(`${scene}: reference written`);
    } else {
      // A missing, broken or wrongly sized reference must fail, not compare as equal.
      if (!fs.existsSync(ref)) throw new Error(`no reference visual/${scene}.png (npm run visual -- --update ${scene})`);
      const reference = nativeImage.createFromPath(ref);
      const size = reference.getSize();
      if (reference.isEmpty() || size.width !== SIZE || size.height !== SIZE)
        throw new Error(`visual/${scene}.png is not a ${SIZE}×${SIZE} picture (npm run visual -- --update ${scene})`);
      const { share, diff } = compare(now, reference);
      if (share > SHARE) {
        ok = false;
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, `${scene}.png`), now.toPNG());
        fs.writeFileSync(path.join(outDir, `${scene}.diff.png`), diff.toPNG());
        console.log(`${scene}: DIFFERS – ${(share * 100).toFixed(2)} % of pixels (see visual-out/)`);
      } else console.log(`${scene}: ok (${(share * 100).toFixed(3)} % of pixels off)`);
    }
  } catch (error) {
    ok = false;
    console.log(`${scene}: FAILED – ${String(error)}`);
  }
  app.exit(ok ? 0 : 1);
});
