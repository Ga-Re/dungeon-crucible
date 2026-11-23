# Dungeon Crucible – desktop app

Tauri 2 + React + TypeScript. Runs on macOS and Windows.

## Develop

```bash
npm install
npm run tauri dev      # desktop app with hot reload
npm run dev            # browser only (table opens as a popup window)
npm test               # unit tests (core logic, i18n)
npm run build          # type-check, build, verify the table bundle has no DM code
```

## Structure

| Path | Content |
|---|---|
| `src/core/` | Pure logic with tests: geometry and line of sight, grid and 3-point / physical calibration, fog of war, 2024 rules, dice, sidecar schemas, player projection |
| `src/app/` | DM state, workspaces, ribbon, docking layout |
| `src/panels/` | Map view and dockable panels |
| `src/render/` | DM renderer and the shared player-frame renderer |
| `src/table/` | Table window (separate entry `table.html`) |
| `src/i18n/` | English (default) and German |
| `src/theme/` | Theme tokens: dark, light, parchment |
| `src-tauri/` | Native side: monitor list, table window on a chosen monitor |

## Table display safety (fail-closed)

The table window never sees the DM scene. The DM window builds a `PlayerFrame`
from a whitelist (`src/core/projection.ts`) and sends it to the window labelled
`table` only. The table validates each frame; invalid, out-of-order or older
than 2.5 s means black. The table window's Tauri capability only allows
listening to events. `npm run build` fails if the table bundle can reach DM code.

## Physical grid

For a 55" 4K TV: 3840×2160 px over 55" → 80.1 px per inch. The table zoom makes
one grid cell exactly one inch, so miniatures fit. Fine-tune with the ruler
correction in the *Table display* panel.
