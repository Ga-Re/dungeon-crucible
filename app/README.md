# Dungeon Crucible – desktop app

Electron + React + TypeScript. Runs on macOS and Windows (Linux builds as AppImage).

## Develop

```bash
npm install
npm start              # desktop app (Electron) with hot reload for the pages
npm run dev            # browser only (table opens as a popup window)
npm test               # unit tests (core logic, i18n, file access)
npm run build          # type-check, build, verify the table bundle has no DM code, bundle Electron
npm run dist           # installers into release/ (dmg on macOS, nsis + msi on Windows)
```

## Structure

| Path | Content |
|---|---|
| `src/core/` | Pure logic with tests: geometry and line of sight, grid and 3-point / physical calibration, fog of war, 2024 rules, dice, sidecar schemas, player projection |
| `src/app/` | DM state, workspaces, ribbon, panel registration (`docking.tsx`) |
| `src/dock/` | Docking system: layout model, geometry and drop targets (pure, tested), `DockManager` API with per-workspace persistence, `DockHost` view |
| `src/panels/` | Map view and dockable panels |
| `src/render/` | DM renderer and the shared player-frame renderer |
| `src/table/` | Table window (separate entry `table.html`) |
| `src/i18n/` | English (default) and German |
| `src/theme/` | Theme tokens: dark, light, parchment |
| `src/platform/` | Bridge to the desktop API (`window.dc`), browser fallback |
| `electron/` | Main process: windows, monitor list, table window on a chosen monitor, campaign folder access, `app://` and `dc-asset://` protocols; preload scripts |

## Table display safety (fail-closed)

The table window never sees the DM scene. The DM window builds a `PlayerFrame`
from a whitelist (`src/core/projection.ts`) and sends it to the table window
only. The table validates each frame; invalid, out-of-order or older than
2.5 s means black. The table window's preload (`electron/preload-table.ts`)
only lets it receive frames. `npm run build` fails if the table bundle can
reach DM code.

## Physical grid

For a 55" 4K TV: 3840×2160 px over 55" → 80.1 px per inch. The table zoom makes
one grid cell exactly one inch, so miniatures fit. Fine-tune with the ruler
correction in the *Table display* panel.

## Campaign folder

```
campaign.dm.json                 name, active scene, table calibration
maps/<file>  + <file>.dm.json    map image/video and its sidecar (grid, walls, zones)
scenes/<name>.scene.json         per-session state (fog, doors, tokens, combat)
creatures/<name>.dm.json         2024 stat blocks
```

All files are plain JSON and can be versioned or synced. The main process only
reads and writes inside the opened folder (`electron/files.ts` rejects absolute
paths and `..`), and `dc-asset://` serves only files inside it.

## Unsigned installers

Builds are not code-signed (macOS builds carry only an ad-hoc signature). On
macOS, open the app the first time with right-click → Open. On Windows, choose
"More info" → "Run anyway".

Building the macOS app locally inside an iCloud-synced folder (such as
`~/Documents`) fails at signing; build with an output folder elsewhere:
`npm run dist -- -c.directories.output=/tmp/dc-release`.

## Fog engine (from Dungeon-Manager)

The fog engine, renderer and benchmark are ported from Ga-Re/Dungeon-Manager (ADR-0019 there):
fog is stored as polygons (`revealed`, `remembered`), drawn by the PixiJS renderer with the exact
hard fog underneath (fail-closed), a soft mask, a spread at a speed with a ragged front, and the
living fog shader with eight biomes. Dungeon Crucible adds token sight: what player tokens see is
revealed automatically, what they leave becomes memory fog (a darkening layer under the fog).
Device settings (speed, transition, quality, edge wobble, movement, soft edges, cover start) are
stored like in Dungeon-Manager (`dm.fog.*` in local storage) and sent to the TV with every frame.

## Renderer benchmark (`npm run bench`)

Measures whether the TV keeps 60 FPS: a 4K video map, fog with holes (living fog, quality
Mittel by default), 20 tokens and a moving camera, drawn by the real renderer in the table window
while the DM window is open. Budget: at most 1 % missed refreshes at 4K/60 Hz.

1. Make the 4K test video once (needs ffmpeg). It is written to `app/bench-assets/bench-4k.mp4`
   (git-ignored, never committed):

   ```bash
   npm run bench:video
   ```

2. Copy it into the **library of your root folder**, e.g. `<root folder>/library/bench-4k.mp4`. The app
   serves media only from `<root folder>/library/` (the asset protocol never serves campaign data), and the
   root folder is the one chosen on the start screen – it is remembered on this device and loaded on
   start, so choose it in the app once before benchmarking. As a video in the library it also shows up
   in the map catalog; move it to the trash there when you no longer need it.

3. Start the benchmark with the absolute path of that copy:

   ```bash
   VITE_BENCH_VIDEO="/absolute/path/to/root folder/library/bench-4k.mp4" npm run bench
   ```

   Open the table window on the TV. `VITE_BENCH_QUALITY=off|medium|high` picks the fog look,
   `VITE_BENCH_SECONDS` the measurement length.

4. After about 40 s the verdict appears on the TV and in the terminal between
   `===== BENCH RESULTS` and `===== END`; it is also saved in `app/bench-results/`.
