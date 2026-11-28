// Draws one scene of the image comparisons (`?scene=<name>`, see `scenes.ts`) and says so in the
// title; `scripts/visual.mjs` takes the picture. Developer tool: its text is English on purpose.
import { createRenderer } from '../render/pixi/renderer';
import { shownStack } from '../core/build/terrain/state';
import { BAND_PER_10_FT } from '../core/build/geom/band';
import { VISUAL_SCENES, VISUAL_VIEW } from './scenes';

async function main() {
  const name = new URLSearchParams(location.search).get('scene') ?? '';
  const make = VISUAL_SCENES[name];
  if (!make) throw new Error(`Unknown scene "${name}"`);
  const scene = make();
  const canvas = document.createElement('canvas');
  canvas.style.width = `${VISUAL_VIEW.width}px`;
  canvas.style.height = `${VISUAL_VIEW.height}px`;
  document.body.appendChild(canvas);
  const r = await createRenderer({ canvas, size: VISUAL_VIEW, resolution: 1 });
  r.setMap({ blank: true, ...scene.map });
  r.setTerrain({
    source: { blocks: shownStack(scene.terrain, 'map', []), missingIsUnknown: false },
    grid: scene.grid,
    palette: scene.terrain.biomePalette,
    stepFt: scene.terrain.stepFt,
    perspective: BAND_PER_10_FT,
    erosion: true,
    lightAngle: 45,
    area: { x: 0, y: 0, ...scene.map },
    overPicture: false,
  });
  r.setCamera(scene.camera);
  await r.drawn();
  // Baking far out takes a few frames.
  for (let i = 0; i < 30; i++) await new Promise((ok) => requestAnimationFrame(ok));
  await r.drawn();
  document.title = `Visual check ${name} – ready`;
}

main().catch((error: unknown) => {
  document.title = `Visual check – failed: ${String(error)}`;
});
