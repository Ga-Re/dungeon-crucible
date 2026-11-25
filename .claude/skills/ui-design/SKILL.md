---
name: ui-design
description: Governs UI/UX design decisions, layout, component styling and visual consistency in Dungeon Crucible. Invoke this skill whenever creating or modifying React components, CSS, layouts, the ribbon, panels, dialogs or icons, or when answering design and UX questions.
---

# Dungeon Crucible UI/UX design

Every UI change or design proposal must follow this guide. The look follows Autodesk Fusion 360 (CAD ergonomics)
with a restrained fantasy accent – the same direction as Dungeon-Manager's `ui-design` skill and ADR-0011/0014/0015,
adapted to this app.

## 1. Spatial layout (Fusion 360)

- **Title bar** (`.appbar`, `App.tsx`): brand, start screen (🏠), save, export, undo/redo, campaign name with save
  status, the "Windows" menu (panels), TV status, theme and language. No tools here.
- **Ribbon** (`.ribbon`): workspace switcher on the left ("WORKSPACE" over the name), then the tabs and groups of the
  current workspace from `WORKSPACES` in `app/src/app/workspaces.ts`. Tools are large icon buttons with a short label,
  grouped with a caption below. New tools go into the ribbon of their workspace, never into ad-hoc toolbars.
- **Docking** (`app/src/dock/`, own system – see `docs/PLAN.md` and the docking spec): the workspace's **canvas** in
  the middle (the map in the Map Forge and the Game-Orchestrator); **zones** left, right and bottom with groups of
  panels as an accordion; a zone collapses to a 24 px bar whose tabs open the panel as a **hover flyout**; panels
  can **float in real windows**, also on other monitors. New tool areas become **panels** (`PANEL_CONTENT` in
  `app/src/app/docking.tsx`, titles in `PANEL_TITLES`), placed in the workspace's default layout – not fixed zones,
  not overlays on the map.
- **Over the map** only small HUD parts: the hint (`.map-hint`, top left), the workspace badge (`.map-badge`, bottom
  left), the empty state (`.map-empty`). Nothing permanent that covers the map.
- **Tools** (decision E-6): drawing and playing act directly on the map. A tool **with options** (create area,
  calibrate the grid, import) opens a small floating **command panel** with OK / Cancel. An object's settings open
  from the browser (double-click or context menu); the Properties panel shows facts and simple fields.
- **Dialogs** (modal, centred, `.start-dialog` style) only for decisions that need full attention: new campaign,
  export, confirmations that cannot be inline. Prefer inline confirmation in the list where the action started
  (as in the start screen and the library list).

## 2. Look

- **Themes:** dark (default), light, parchment – `data-skin` on `<html>`. Every colour comes from tokens; check all
  three themes.
- **Restrained, professional:** thin 1 px lines instead of boxes and heavy shadows; small radii (2–6 px); soft
  shadows only on floating parts (menus, flyouts, dialogs, floating windows); **one accent** (`--accent`) for the
  primary action and selected/active states; `--sel` (blue) for focus and selection in the map/docking.
- **Type:** `--font-ui` for labels; `--font-head` (condensed) for headings, panel titles and captions – small
  uppercase with letter spacing; `--font-mono` only for file names, paths and values.
- **Icons:** one stroke icon set (`app/src/ui/Icon.tsx`, 24×24 paths). Add new icons there in the same style; no
  emoji in the UI except the docking pin (📌).
- **Readability first:** the app is used in a dim room – WCAG AA contrast in every theme; text over the map gets a
  scrim (`--overlay`).

## 3. Tokens and layering

- **Theme tokens** (`app/src/theme/theme.css`): `--bg --shell --ribbon --panel --panel-2 --input --line --line-soft
  --edge --canvas --overlay --fg --fg-dim --fg-faint --accent --accent-soft --sel --sel-soft --ok --warn --crit
  --arcane --font-ui --font-head --font-mono`. **Docking tokens** (`app/src/dock/dock.css`): `--dock-*`.
- Never hard-code colours, fonts or z-indices in components; inline styles only for computed geometry (positions,
  sizes). If a token is missing, add it to every theme block first.
- **Layers** (z-index): map canvas 0 · bars 4, splitters 5, resize grips 6 · flyouts 15 · floating panels 20
  (dragged 25) · drop indicators 30 · modals 50 · workspace menu 60 · menus/popovers 90. Fit new layers into this
  order instead of inventing new numbers.

## 4. Behaviour

- **i18n:** every label, tooltip and `aria-label` through `t(...)` with keys in `app/src/i18n/en.ts` and `de.ts`
  (the UI follows the system language).
- **Keyboard:** everything reachable and usable with Tab, Enter/Space and Esc; focus visible (`:focus-visible` with
  `--sel` or `--accent`). Icon-only buttons need `title` and `aria-label`.
- **Panels may sit in floating windows:** code inside a panel must use its own document and window
  (`el.ownerDocument`, `.defaultView`) for listeners, measuring and outside clicks – never the global `document`
  or `window`.
- **Reduced motion:** animations (≤ 120 ms for UI) switch off under `prefers-reduced-motion`.
- **Map size:** never move or resize the map canvas from the outside; fit, zoom and centring use the canvas size.

## 5. Workflow when invoked

1. Look at the current state: the component in `app/src/app/` or `app/src/panels/`, `theme.css`, `dock.css`.
2. Decide where the feature belongs: ribbon tab of which workspace, a panel (and in which default zone), the map HUD,
   a command panel or a dialog.
3. Style with tokens in all three themes; keep the Fusion look (section 2).
4. Check accessibility, i18n (en + de) and floating-window safety; then check it in the running app with
   screenshots (each theme if colours changed).
