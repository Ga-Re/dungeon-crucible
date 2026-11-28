/**
 * DM map view. Map, grid, tokens and fog are drawn by the PixiJS renderer ported from
 * Dungeon-Manager (see-through fog for the DM); DM overlays are a 2D canvas on top. "Player
 * view" shows the table's frame with the table's own view component.
 */
import { useEffect, useMemo, useRef } from 'react';
import type { Point } from '../core/geometry';
import { gridDistanceFeet, snapToCorner, squareBox } from '../core/grid';
import { clearArea, openArea } from '../core/fogModel';
import { circleArea, ellipseArea, strokeArea } from '../core/poly/shapes';
import { areaContains, partFromDrag, partFromPoints, vertexAt, type VertexRef } from '../core/areas';
import { AreaCommandPanel } from './AreaCommandPanel';
import { WallCommandPanel } from './WallCommandPanel';
import { TerrainCommandPanel } from './TerrainCommandPanel';
import { brushOutline, snapLasso } from '../core/build/terrain/stepTool';
import { assetShapes, footprintOf, hitsPlacement, ROTATE_STEP } from '../core/placement';
import { drawnPlacements } from '../core/interiors';
import { PlacingPanel } from './PlacingPanel';
import { LeakCheckPanel } from './LeakCheckPanel';
import { LookPanel } from './LookPanel';
import { MapCatalogView } from './MapCatalog';
import { allPlacements } from '../core/persistence';
import { ASSET_DRAG } from './VaultPanels';
import { refreshVault, requestAssetUrls } from '../app/vault';
import { CalibrationPanel } from './CalibrationPanel';
import { endsAt, nearestEnd, wallAt, type WallEnd } from '../core/walls';
import type { Polygon } from '../core/poly/types';
import { rectPolygon } from '../core/fogModel';
import type { MapAssetPlacement, Scene, TemplateShape } from '../core/scene';
import { useI18n } from '../i18n/i18n';
import { hasMap } from '../core/emptyScene';
import { importMapIntoCampaign, putOnTv } from '../app/campaign';
import { Icon } from '../ui/Icon';
import type { MessageKey } from '../i18n/en';
import { drawDmOverlay, rotateHandleAt, SOUND_HANDLE_PX, type OverlayState } from '../render/dmOverlay';
import { isSoundRef } from '../core/sound';
import { fitView, toMap, toScreen, viewAt, type View } from '../render/viewTransform';
import { storeysBelow } from '../core/storeyShape';
import { otherEnd, stairsOn } from '../core/stairs';
import { stairShapes } from '../render/stairPicture';
import { fogOptions } from '../render/fogOptions';
import { DARKNESS } from '../core/projection';
import { bindMap } from '../render/mapBinding';
import { createRenderer, type Renderer, type TokenShape } from '../render/pixi/renderer';
import { TableView, type FrameSource } from '../table/TableView';
import {
  addPing, addTemplate, applyFogArea, cancelAreaCommand, checkpoint, drawAreaPart, finishAreaCommand, moveAreaCorner, startAreaCommand, getVersion, initiativeOrder, log, moveToken,
  addCreatureToken, addLight, lightAt, removeSound, selectSound, soundAt, updateSound, currentLeaks, testFigureSight, updateLeakCheck, shownLook, addStair, answerStairAsk, removeStair, selectStair, stairUnder, dmFramesBelow, workingFootprint, pictureOf, setCropping, updateLook, removeToken, revealZone, selectLight, selectToken, selectZone, snapPoint, state, toggleDmFog, toggleDoor, toggleLight, useStore, zoneAt,
  cancelCalibration, finishCalibration, moveCalibration, setCalibrationBox,
  editableHere, shownInForge, activateAsset, placeHere, previewPlacing, stopPlacing, placedFootprint, placedPivot, turnPlacedAssetTo, answerInteriorAsk, answerTvAsk, applyMapToTv, assetDoors, sightWalls, withAssetDoors, anyAssetAt, assetExtras, currentChanges, editableAssets, toggleHidden, cycleAssetVariant, deletePlacedAsset, moveAssetTo, placeAsset, placedAssetAt, rotatePlacedAsset, scalePlacedAsset, selectPlacedAsset,
  addWallPoint, cancelWallCommand, deleteSelectedWalls, endWallChain, finishWallCommand, moveWallEnds, selectWall, selectWallChain, undoWallPoint,
  terrainShape, hoverTerrainBiome, beginTerrainStroke, moveTerrainStroke, terrainStrokePath, abortTerrainStroke, cancelTerrainCommand, finishTerrainCommand,
} from '../app/store';

/** Drag-and-drop type for creatures dragged from the browser onto the map. */
export const CREATURE_DRAG = 'application/x-dc-creature';

/** Commands other UI parts can trigger on the active map view. */
export const mapCommands: { fit: () => void; centre: () => Point | null; show: (p: Point) => void } = { fit: () => undefined, centre: () => null, show: () => undefined };

const HINTS: Partial<Record<string, MessageKey>> = {
  select: 'hint.select', pan: 'hint.pan', measure: 'hint.measure', ping: 'hint.ping', calibrate: 'hint.calibrate',
  area: 'hint.area', wall: 'hint.wall', hide: 'hint.hide',
  'fog-rect': 'hint.fogRect', 'fog-ellipse': 'hint.fogEllipse', 'fog-polygon': 'hint.fogPolygon', 'fog-lasso': 'hint.fogLasso',
  'fog-brush': 'hint.fogBrush', 'reveal-room': 'hint.revealRoom', light: 'hint.light',
  cone: 'hint.template', sphere: 'hint.template', line: 'hint.template', cube: 'hint.template',
  stair: 'hint.stair', terrain: 'hint.terrain',
};

type Drag =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'token'; id: string; ox: number; oy: number; start: Point; moved: boolean }
  | { kind: 'measure'; a: Point; b: Point }
  | { kind: 'terrain' }
  | { kind: 'area-drag'; tool: 'rect' | 'ellipse'; a: Point; b: Point }
  | { kind: 'area-path'; path: Point[] }
  | { kind: 'area-corner'; at: VertexRef }
  | { kind: 'wall-ends'; ends: WallEnd[]; to: Point; moved: boolean }
  | { kind: 'asset-move'; id: string; ox: number; oy: number; moved: boolean; activate?: boolean }
  | { kind: 'asset-turn'; id: string; pivot: Point; from: number; start: number; moved: boolean }
  /** A sound source (E-37): moved, or its radius dragged at the handle on its edge. */
  | { kind: 'sound-move'; id: string; ox: number; oy: number; moved: boolean }
  | { kind: 'sound-radius'; id: string; moved: boolean }
  /** The leak check's test figure (DC-025), dragged around. */
  | { kind: 'leak-figure'; ox: number; oy: number }
  /** "Adjust picture": a cut dragged on the map (DC-022). */
  | { kind: 'crop'; a: Point; b: Point }
  /** New stairs dragged over cells (E-44). */
  | { kind: 'stair-rect'; a: Point; b: Point }
  | { kind: 'calib-box'; a: Point }
  | { kind: 'calib-move'; last: Point }
  | { kind: 'template'; shape: TemplateShape; a: Point; b: Point }
  | { kind: 'fog-rect' | 'fog-ellipse'; a: Point; b: Point; invert: boolean; circle: boolean }
  | { kind: 'fog-path'; tool: 'fog-lasso' | 'fog-brush'; path: Point[]; invert: boolean }

export function MapView() {
  const viewAsPlayer = useStore((s) => s.viewAsPlayer);
  const source = useMemo<FrameSource>(() => ({ current: () => (state.frame ? { frame: state.frame, receivedAt: Date.now() } : null) }), []);
  return viewAsPlayer ? <TableView source={source} /> : <DmMap />;
}

function DmMap() {
  const { t } = useI18n();
  const tool = useStore((s) => s.tool);
  const terrainTool = useStore((s) => s.terrainCommand?.tool ?? 'step');
  const ws = useStore((s) => s.ws);
  const sceneVersion = useStore((s) => s.sceneVersion);
  const mapPresent = useStore((s) => hasMap(s.scene));
  const catalog = useStore((s) => s.ws === 'forge' && s.forgeCatalog);
  const editStart = useStore((s) => s.editStart);
  const campaignOpen = useStore((s) => !!s.campaign);
  const dmFogHidden = useStore((s) => s.dmFogHidden);
  // Another command panel open: the leak check waits behind it (one panel at a time).
  const otherCommand = useStore((s) => !!(s.placing || s.wallCommand || s.areaCommand || s.calibration || s.lookCommand));
  const hasBelow = useStore((s) => storeysBelow(s.scene.map.storeys ?? [], s.scene.map.storey ?? '').length > 0);
  // The storeys below as frames, placed by this window's camera (E-40).
  const belowSource = useMemo<FrameSource>(() => ({
    current: () => {
      const wrap = wrapRef.current;
      if (!wrap) return null;
      const v = view.current;
      const s = { width: Math.max(1, wrap.clientWidth), height: Math.max(1, wrap.clientHeight) };
      const c = toMap(v, { x: s.width / 2, y: s.height / 2 });
      const frame = dmFramesBelow({ centerX: c.x, centerY: c.y, zoom: v.zoom, rotation: v.rot, ...s });
      return frame ? { frame, receivedAt: Date.now() } : null;
    },
  }), []);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const view = useRef<View>({ zoom: 0.4, x: 20, y: 20, rot: 0 });
  const drag = useRef<Drag | null>(null);
  const polygonDraft = useRef<Point[]>([]);
  const mouse = useRef<Point>({ x: 0, y: 0 });
  const space = useRef(false);
  /** Alt held: area parts are drawn without snapping (shown so in the preview). */
  const altHeld = useRef(false);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const overlay = overlayRef.current!;
    let renderer: Renderer | null = null;
    let map: ReturnType<typeof bindMap> | null = null;
    let disposed = false;
    let raf = 0;
    let pushed = -1;
    let lastCam = '';
    const size = () => ({ width: Math.max(1, wrap.clientWidth), height: Math.max(1, wrap.clientHeight) });

    const fit = () => {
      const s = size();
      const m = state.scene.map;
      if (!hasMap(state.scene)) {
        view.current = { zoom: 1, x: 0, y: 0, rot: 0 };
        return;
      }
      // A drawn map's area may start left of or above 0 (E-33); a cut picture shows only its cut,
      // a turned map turned (E-42).
      const look = shownLook();
      const o = m.origin ?? { x: 0, y: 0 };
      const box = look?.crop ? look.crop : { x: o.x, y: o.y, w: m.widthPx, h: m.heightPx };
      view.current = fitView(box, s, look?.rotation ?? 0);
    };
    mapCommands.fit = fit;
    // The middle of what the map view shows, in map pixels (placing from the keyboard).
    mapCommands.centre = () => {
      const s = size();
      return toMap(view.current, { x: s.width / 2, y: s.height / 2 });
    };
    // Brings `p` to the middle of the view, at the zoom there is (a leak in the list, DC-025).
    mapCommands.show = (p) => {
      const s = size();
      const v = view.current;
      view.current = viewAt(p, { x: s.width / 2, y: s.height / 2 }, v.zoom, v.rot);
    };
    fit();

    void createRenderer({ canvas, size: size(), resolution: window.devicePixelRatio || 1, background: '#0e0f11' }).then((r) => {
      if (disposed) {
        r.destroy();
        return;
      }
      renderer = r;
      map = bindMap(r, wrap, (e) => console.error(e));
    });

    const push = (r: Renderer) => {
      const sc = state.scene;
      const cell = sc.map.grid.cellWidth;
      // A drawn map (E-33) has no picture: only its area.
      if (sc.map.drawn) map?.setDrawn({ origin: sc.map.origin ?? { x: 0, y: 0 }, width: sc.map.widthPx, height: sc.map.heightPx });
      else {
        const pic = pictureOf(sc);
        void map?.set(pic.url, pic.isVideo, shownLook());
      }
      // The terrain's ground and cliffs (E-87); the same blocks again build nothing.
      r.setTerrain(terrainShape());
      // While calibrating, the grid is always shown: it is what is being adjusted.
      r.setGrid((state.showGrid || state.calibration) && sc.map.grid.type === 'square' ? { cellSizePx: cell, offsetXPx: sc.map.grid.originX, offsetYPx: sc.map.grid.originY, alpha: 0.18 } : null);
      // Placed assets: their files' URLs are looked up once, the first time they are shown.
      // The Map Forge leaves out layers hidden in the editor.
      const placements = allPlacements(sc).filter((a) => state.ws !== 'forge' || shownInForge(a));
      // Houses (E-29): in a scene as switched there, the DM seeing through roofs if set; the Map Forge shows outsides.
      const inScene = state.layer !== 'map';
      const drawn = drawnPlacements(placements, state.assetInfo, inScene ? sc.interiorsOn : {}, inScene && state.roofsSeeThrough);
      // Inner pictures are looked up with their houses, so switching shows them at once.
      const inner = placements.flatMap((a) => state.assetInfo[a.assetPath]?.interior?.asset ?? []);
      // The placing mode's preview (DC-116): see-through, above the rest – in this window only.
      const pl = state.placing;
      const ghost = pl?.at && !isSoundRef(pl.next.path) ? [{ id: '__placing', assetPath: pl.next.path, x: pl.at.x, y: pl.at.y, rotation: pl.at.rotation, scale: pl.next.scale, alpha: 0.55 }] : [];
      requestAssetUrls([...new Set([...placements.map((a) => a.assetPath), ...inner, ...ghost.map((g) => g.assetPath)])]);
      // In a scene, effects follow its state (switched off, played once); the Map Forge shows all.
      // Stairs on this storey first (E-44), then the placed assets.
      r.setAssets([...stairShapes(stairsOn(sc.map.stairs ?? [], sc.map.storey ?? '')), ...assetShapes([...drawn, ...ghost], state.assetInfo, sc.map.grid, inScene ? { effectsOn: sc.effectsOn, runs: state.effectRuns } : undefined)]);
      const active = state.ws === 'play' ? initiativeOrder()[state.turn]?.id : undefined;
      r.setTokens(
        sc.tokens.map((k): TokenShape => ({
          id: k.id, name: k.label, x: k.x - (k.size * cell) / 2, y: k.y - (k.size * cell) / 2, width: k.size * cell, height: k.size * cell,
          color: k.ringColor, selected: k.id === state.selectedTokenId, hidden: k.hidden, active: k.id === active,
        })),
      );
      // The DM sees all light, unclipped (the TV gets only what players see, see projection.ts).
      r.setLighting(
        sc.ambient === 'lit'
          ? null
          : { darkness: DARKNESS, lit: state.lights.flatMap((l) => l.area), glows: state.lights.map((l) => ({ x: l.x, y: l.y, brightPx: l.brightPx, dimPx: l.dimPx, color: l.color, area: l.area })), softEdge: cell * 0.35 },
      );
      const editMode = state.ws === 'forge';
      if (editMode || state.dmFogHidden) {
        r.setMemory(null);
        r.setFog(null);
        return;
      }
      const see = state.dmSeeThrough ? 0.55 : 1;
      const effect = sc.fogEffect ?? { biome: sc.map.biome, strength: sc.map.biomeStrength };
      r.setMemory(clearArea(sc.fog, state.visible), { opacity: state.memoryOpacity * see, softEdge: state.fogLook.softEdges ? cell * 0.25 : 0 });
      r.setFog(openArea(sc.fog, state.visible), fogOptions({ look: state.fogLook, cellSizePx: cell, seedKey: state.mapResource, effect, opacity: see, quick: state.fogQuick }));
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const r = renderer;
      const s = size();
      if (r) {
        r.resize(s);
        const v = getVersion();
        if (v !== pushed) {
          pushed = v;
          push(r);
        }
        // The map turned another way (E-42): fitted anew.
        if ((shownLook()?.rotation ?? 0) !== view.current.rot) fit();
        const v2 = view.current;
        // On a storey (E-40) the map is cut to its footprint; the storeys below show around it.
        const fp = workingFootprint();
        const camKey = `${v2.zoom}|${v2.x}|${v2.y}|${v2.rot}|${s.width}|${s.height}|${getVersion()}`;
        if (camKey !== lastCam) {
          lastCam = camKey;
          canvas.style.clipPath = fp ? `path(evenodd, '${screenPath(fp, v2)}')` : '';
          const c = toMap(v2, { x: s.width / 2, y: s.height / 2 });
          r.setCamera({ centerX: c.x, centerY: c.y, zoom: v2.zoom, rotation: v2.rot });
        }
      }
      const dpr = window.devicePixelRatio || 1;
      if (overlay.width !== Math.round(s.width * dpr) || overlay.height !== Math.round(s.height * dpr)) {
        overlay.width = Math.round(s.width * dpr);
        overlay.height = Math.round(s.height * dpr);
      }
      const g = overlay.getContext('2d');
      // Doors of placed assets are drawn like other doors (E-29); in a scene with their gaps.
      if (g) drawDmOverlay(g, state.ws === 'forge' ? shownLayers({ ...state.scene, walls: [...state.scene.walls, ...assetDoors(state.scene)] }) : withAssetDoors(state.scene), state.vision, view.current, dpr, overlayState(), Date.now());
    };
    raf = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      map?.dispose();
      renderer?.destroy();
    };
  }, []);

  useEffect(() => {
    if (sceneVersion > 0) mapCommands.fit();
  }, [sceneVersion]);

  // Placed assets need the library's asset data (size, group, file): read when a scene opens.
  const root = useStore((s) => s.root?.root);
  useEffect(() => {
    void refreshVault();
  }, [sceneVersion, root]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return;
      // The map catalog covers the map (E-32): its keys do not reach the map hidden behind.
      if (state.ws === 'forge' && state.forgeCatalog) return;
      if (e.code === 'Space') space.current = true;
      if (e.key === 'Escape' && state.placing) {
        // The placing mode ends (DC-116).
        stopPlacing();
        return;
      }
      if (e.key === 'Escape') {
        // A polygon being clicked goes first; then the running command.
        const drawing = polygonDraft.current.length > 0 || drag.current !== null;
        // A stroke of "Stufe" being painted goes, the ground as before it; the command stays (E-87).
        if (drag.current?.kind === 'terrain') abortTerrainStroke();
        drag.current = null;
        polygonDraft.current = [];
        if (state.calibration) cancelCalibration();
        else if (state.wallCommand) {
          // A chain being drawn ends first; then the command.
          if (state.wallCommand.start) endWallChain();
          else cancelWallCommand();
        } else if (!drawing && state.areaCommand) cancelAreaCommand();
        else if (!drawing && state.terrainCommand) cancelTerrainCommand();
      }
      if (e.key === 'Enter') {
        if (polygonDraft.current.length > 0) finishPolygon(e.altKey);
        else if (state.areaCommand) finishAreaCommand();
        else if (state.wallCommand) finishWallCommand();
        else if (state.calibration) finishCalibration();
        else if (state.terrainCommand) finishTerrainCommand();
      }
      // Calibrating: arrow keys move the grid by 1 px (Shift: 10 px).
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (state.calibration && arrows[e.key]) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        moveCalibration(arrows[e.key][0] * step, arrows[e.key][1] * step);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.wallCommand) undoWallPoint();
        else if (state.selectedTokenId) removeToken(state.selectedTokenId);
        else if (state.selectedWallIds.length) deleteSelectedWalls();
        else if (state.selectedAssetId) deletePlacedAsset(state.selectedAssetId);
        else if (state.selectedSoundId) removeSound(state.selectedSoundId);
        else if (state.selectedStairId) removeStair(state.selectedStairId);
      }
      // A selected placed asset (Map Forge): R / Shift+R turn by 15°, + / − scale, V next variant.
      const sel = state.selectedAssetId;
      if (sel && !e.metaKey && !e.ctrlKey) {
        const k = e.key.toLowerCase();
        if (k === 'r') rotatePlacedAsset(sel, e.shiftKey ? -ROTATE_STEP : ROTATE_STEP);
        else if (e.key === '+' || e.key === '=') scalePlacedAsset(sel, 1.25);
        else if (e.key === '-') scalePlacedAsset(sel, 0.8);
        else if (k === 'v') cycleAssetVariant(sel);
      }
      // "Nebel ausblenden" (N): DM window only; the TV never changes.
      if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey) toggleDmFog();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const overlayState = (): OverlayState => {
    const d = drag.current;
    const cell = state.scene.map.grid.cellWidth;
    let fogDraft: OverlayState['fogDraft'] = null;
    if (d && (d.kind === 'fog-rect' || d.kind === 'fog-ellipse')) fogDraft = { polygon: shapeFor(d), path: [], mode: modeFor(d.invert) };
    else if (d?.kind === 'fog-path') fogDraft = { polygon: d.tool === 'fog-brush' ? null : null, path: d.path, mode: modeFor(d.invert) };
    else if (state.tool === 'fog-polygon' && polygonDraft.current.length) fogDraft = { polygon: null, path: [...polygonDraft.current, mouse.current], mode: state.fogMode };
    return {
      editMode: state.ws === 'forge',
      selectedTokenId: state.selectedTokenId,
      selectedZoneId: state.selectedZoneId,
      selectedLightId: state.selectedLightId,
      selectedSoundId: state.selectedSoundId,
      soundGhost: state.placing?.at && isSoundRef(state.placing.next.path) ? state.placing.at : null,
      stairs: { list: stairsOn(state.scene.map.stairs ?? [], state.scene.map.storey ?? '').map((s) => ({ ...s, toName: storeyName(otherEnd(s, state.scene.map.storey ?? '')) || t('storey.ground') })), selected: state.selectedStairId },
      leakCheck: state.ws === 'forge' && state.leakCheck ? { figure: state.leakCheck.figure, sight: testFigureSight(), leaks: currentLeaks() } : null,
      measure: d?.kind === 'measure' ? { a: d.a, b: d.b, ft: gridDistanceFeet(state.scene.map.grid, d.a, d.b) } : null,
      selectedWallIds: state.selectedWallIds,
      wallDraft: wallDraftOf(),
      terrainDraft: terrainDraftOf(),
      wallEnds: d?.kind === 'wall-ends' ? d.to : null,
      brush: state.tool === 'fog-brush' ? { p: mouse.current, r: state.brushCells * cell } : null,
      calibBox: state.calibration?.box ? { box: state.calibration.box, cells: state.calibration.cells } : null,
      draftTemplate: d?.kind === 'template' ? templateDraft(d.shape, d.a, d.b) : null,
      // Stairs or a cut being dragged (DC-022): a dashed frame.
      frameRect: d?.kind === 'stair-rect' ? cellRect(d.a, d.b) : d?.kind === 'crop'
        ? { x: Math.min(d.a.x, d.b.x), y: Math.min(d.a.y, d.b.y), w: Math.abs(d.b.x - d.a.x), h: Math.abs(d.b.y - d.a.y) }
        : null,
      fogDraft,
      areaDraft: areaDraftOf(d),
      assets: [
        ...allPlacements(state.scene).filter((a) => state.ws !== 'forge' || shownInForge(a)).map((a) => placementLook(a, false)),
        ...(state.layer === 'map' ? [] : state.scene.hidden.assets.map((a) => placementLook(a, true))),
      ],
      covers: state.ws === 'forge' ? (assetExtras(state.scene).covers ?? []) : [],
      changed: new Set(currentChanges().filter((c) => c.status === 'changed').map((c) => c.id)),
    };
  };

  /** "Draw walls": the pieces so far and the one following the pointer (snapped as it will be). */
  const wallDraftOf = (): OverlayState['wallDraft'] => {
    const c = state.wallCommand;
    if (!c) return null;
    // Shown as they will be saved: flipped cliffs the other way round (the arrow points below).
    const turn = c.flip && c.kind === 'cliff';
    const walls = c.walls.map((w) => (c.flip && w.kind === 'cliff' ? { ...w, x1: w.x2, y1: w.y2, x2: w.x1, y2: w.y1 } : w));
    const b = c.start ? wallTarget(mouse.current, altHeld.current) : null;
    return { kind: c.kind, walls, next: c.start && b ? (turn ? { a: b, b: c.start } : { a: c.start, b }) : null };
  };

  /** "Stufe": the brush under the pointer and, with the outline preview, the stroke so far (E-87). */
  const terrainDraftOf = (): OverlayState['terrainDraft'] => {
    const c = state.terrainCommand;
    if (!c || state.tool !== 'terrain') return null;
    const grid = state.scene.map.grid;
    // Ground and biome: a soft round brush; filling: a click.
    if (c.tool !== 'step') return { cursor: c.tool === 'fill' ? null : brushOutline(mouse.current, 'round', c.sizeCells, grid, false), stroke: null, path: null };
    const path = terrainStrokePath();
    const cursor = c.shape === 'lasso' || c.picking ? null : brushOutline(mouse.current, c.shape, c.sizeCells, grid, state.terrainQuarter);
    if (!path || state.terrainPreview === 'live') return { cursor, stroke: null, path: null };
    if (c.shape === 'lasso') return { cursor, stroke: null, path: path.map((q) => snapLasso(q, grid, state.terrainQuarter)) };
    if (c.shape === 'round') {
      const area = strokeArea(path.map((q) => [q.x, q.y] as [number, number]), (c.sizeCells * grid.cellWidth) / 2);
      return { cursor, stroke: area ? [area] : null, path: null };
    }
    // The square brush: its squares along the path (as it paints), no closer than a quarter cell.
    const squares = new Map<string, Polygon>();
    for (const q of path) {
      const ring = brushOutline(q, 'square', c.sizeCells, grid, state.terrainQuarter);
      squares.set(`${ring[0]!.x},${ring[0]!.y}`, { outer: ring.map((v) => [v.x, v.y] as [number, number]), holes: [] });
    }
    return { cursor, stroke: [...squares.values()], path: null };
  };

  /** Where a wall end goes: onto a nearby wall end, else the grid corner; exactly the pointer with Alt. */
  const wallTarget = (p: Point, free: boolean, skip?: ReadonlySet<string>): Point => {
    if (free) return p;
    const drafted = state.wallCommand?.walls.map((w, i) => ({ ...w, id: `draft-${i}` })) ?? [];
    const others = [...state.scene.walls, ...drafted].filter((w) => !skip?.has(w.id));
    return nearestEnd(others, p, HANDLE_PX / view.current.zoom) ?? snapCorner(p);
  };

  /** "Create area": the shape so far and the part being drawn (snapped as it will be). */
  const areaDraftOf = (d: Drag | null): OverlayState['areaDraft'] => {
    const c = state.areaCommand;
    if (!c) return null;
    const part = d?.kind === 'area-drag' ? partFromDrag(d.tool, d.a, d.b, areaGrid(altHeld.current)) : null;
    const path = d?.kind === 'area-path' ? d.path : c.tool === 'polygon' && polygonDraft.current.length ? [...polygonDraft.current, mouse.current] : [];
    return { shape: c.shape, part, path, color: c.color, subtract: c.op === 'subtract', editing: c.areaId };
  };

  const toWorld = (e: { clientX: number; clientY: number }): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    return toMap(view.current, { x: e.clientX - r.left, y: e.clientY - r.top });
  };

  /** A press on the turning handle of the selected asset (DC-113): it turns, freely, about its anchor. */
  const startTurn = (p: Point): boolean => {
    const id = state.selectedAssetId;
    const fp = id ? placedFootprint(id) : null;
    const pivot = id ? placedPivot(id) : null;
    if (!id || !fp || !pivot) return false;
    const h = rotateHandleAt(fp, view.current.zoom);
    if (Math.hypot(h.x - p.x, h.y - p.y) > (HANDLE_PX * 1.2) / view.current.zoom) return false;
    drag.current = { kind: 'asset-turn', id, pivot, from: angleOf(pivot, p), start: fp.rotation, moved: false };
    return true;
  };

  const finishPolygon = (free = false) => {
    const pts = polygonDraft.current;
    polygonDraft.current = [];
    if (state.tool === 'area') drawAreaPart(partFromPoints('polygon', pts, areaGrid(free)));
    else if (pts.length >= 3) applyFogArea({ outer: pts.map((p) => [p.x, p.y] as [number, number]), holes: [] }, state.fogMode);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = toWorld(e);
    const r = canvasRef.current!.getBoundingClientRect();
    // The placing mode (DC-116): a click places, a right click ends it; the middle button still pans.
    if (state.placing && !space.current && e.button !== 1) {
      if (e.button === 2) stopPlacing();
      else placeHere(p);
      return;
    }
    if (e.button === 1 || e.button === 2 || state.tool === 'pan' || space.current) {
      drag.current = { kind: 'pan', sx: e.clientX - r.left, sy: e.clientY - r.top, vx: view.current.x, vy: view.current.y };
      return;
    }
    // Alt pings, except where it changes a drawing tool (fog: the other mode; area, walls: no snapping).
    if ((e.altKey && !state.tool.startsWith('fog-') && state.tool !== 'area' && state.tool !== 'wall' && state.tool !== 'terrain') || state.tool === 'ping') {
      addPing(p);
      return;
    }
    const cell = state.scene.map.grid.cellWidth;
    // "Adjust picture": dragging the cut (DC-022).
    if (state.lookCommand?.cropping) {
      drag.current = { kind: 'crop', a: p, b: p };
      return;
    }
    // The leak check's test figure (DC-025) is grabbed with the select tool.
    const fig = state.ws === 'forge' ? state.leakCheck?.figure : null;
    if (fig && state.tool === 'select' && Math.hypot(fig.x - p.x, fig.y - p.y) < cell * 0.4) {
      drag.current = { kind: 'leak-figure', ox: fig.x - p.x, oy: fig.y - p.y };
      return;
    }
    switch (state.tool) {
      case 'terrain': {
        // "Stufe" (E-87): a press picks a step with the pipette, else starts a stroke.
        if (beginTerrainStroke(p)) drag.current = { kind: 'terrain' };
        return;
      }
      case 'select': {
        const tk = [...state.scene.tokens].reverse().find((k) => Math.hypot(k.x - p.x, k.y - p.y) < (cell * k.size) / 2);
        if (tk) {
          selectToken(tk.id);
          checkpoint();
          drag.current = { kind: 'token', id: tk.id, ox: tk.x - p.x, oy: tk.y - p.y, start: { x: tk.x, y: tk.y }, moved: false };
          return;
        }
        // Sound sources (E-37): the selected one's radius handle, then any source – select and drag.
        const selSound = state.scene.sounds.find((x) => x.id === state.selectedSoundId && editableHere(x));
        if (selSound) {
          const r = selSound.radiusFt * (cell / state.scene.map.grid.feetPerCell);
          if (Math.hypot(p.x - (selSound.x + r), p.y - selSound.y) < SOUND_HANDLE_PX / view.current.zoom) {
            drag.current = { kind: 'sound-radius', id: selSound.id, moved: false };
            return;
          }
        }
        // In a scene a light or an asset under the pointer is switched first (a torch with its sound).
        const sound = state.ws === 'play' && (lightAt(p) || anyAssetAt(p)) ? null : soundAt(p);
        if (sound) {
          selectSound(sound);
          // A switched-off source is only selected; a playing one can be dragged.
          const x = state.scene.sounds.find((q) => q.id === sound);
          if (x) drag.current = { kind: 'sound-move', id: sound, ox: x.x - p.x, oy: x.y - p.y, moved: false };
          return;
        }
        const light = lightAt(p);
        if (light) {
          if (state.ws === 'play') toggleLight(light);
          else selectLight(light);
          return;
        }
        if (state.ws === 'play') {
          const door = sightWalls(state.scene).find((w) => (w.kind === 'door' || w.kind === 'secret-door') && Math.hypot((w.x1 + w.x2) / 2 - p.x, (w.y1 + w.y2) / 2 - p.y) < cell * 0.45);
          if (door && (door.kind === 'door' || door.open)) {
            toggleDoor(door.id);
            return;
          }
        }
        selectToken(null);
        selectLight(null);
        selectSound(null);
        // In a scene: a click on an asset switches its light or effect; the scene's own assets are
        // also selected and can be dragged (a click without moving still switches, DC-110).
        if (state.layer !== 'map') {
          // The scene's own asset selected: its turning handle first.
          if (startTurn(p)) return;
          const asset = anyAssetAt(p);
          if (asset) {
            const own = editableAssets().find((x) => x.id === asset);
            if (own) {
              selectPlacedAsset(asset);
              drag.current = { kind: 'asset-move', id: asset, ox: own.x - p.x, oy: own.y - p.y, moved: false, activate: true };
              return;
            }
            if (activateAsset(asset)) return;
          }
          selectPlacedAsset(null);
        }
        if (state.layer === 'map') {
          const tol = HANDLE_PX / view.current.zoom;
          // An end is grabbed with every wall joined there; Shift takes only the selected walls' ends.
          const walls = state.scene.walls.filter(editableHere);
          const ends = endsAt(walls, p, tol, e.shiftKey ? new Set(state.selectedWallIds) : undefined);
          if (ends.length) {
            if (!ends.some((x) => state.selectedWallIds.includes(x.id))) selectWall(ends[0].id);
            drag.current = { kind: 'wall-ends', ends, to: p, moved: false };
            return;
          }
          // Walls before assets: a floor tile under walls must not hide them from a click.
          const wall = wallAt(walls, p, tol);
          if (wall || e.shiftKey) {
            selectWall(wall, e.shiftKey);
            selectZone(null);
            selectPlacedAsset(null);
            return;
          }
          selectWall(null);
          if (startTurn(p)) return;
          // A placed asset: select it and drag it (DC-041).
          const asset = placedAssetAt(p);
          if (asset) {
            selectPlacedAsset(asset);
            const a = editableAssets().find((x) => x.id === asset)!;
            drag.current = { kind: 'asset-move', id: asset, ox: a.x - p.x, oy: a.y - p.y, moved: false };
            return;
          }
          selectPlacedAsset(null);
          // Stairs (E-44): after everything that may stand on them, before the area they lie in.
          const st = stairUnder(p);
          if (st) {
            selectStair(st);
            return;
          }
          if (state.selectedStairId) selectStair(null);
        }
        selectZone(zoneAt(p));
        return;
      }
      case 'light':
        addLight(snapPoint(p));
        return;
      case 'hide': {
        // Shown and hidden elements alike: a click hides or shows it again.
        const id = elementAt(p, HANDLE_PX / view.current.zoom);
        if (id) toggleHidden(id);
        return;
      }
      case 'measure':
        drag.current = { kind: 'measure', a: snapPoint(p), b: p };
        return;
      case 'fog-rect':
      case 'fog-ellipse':
        drag.current = { kind: state.tool, a: p, b: p, invert: e.altKey, circle: e.shiftKey };
        return;
      case 'fog-lasso':
      case 'fog-brush':
        drag.current = { kind: 'fog-path', tool: state.tool, path: [p], invert: e.altKey };
        return;
      case 'fog-polygon': {
        const pts = polygonDraft.current;
        // Clicking the first point again closes the polygon.
        if (pts.length >= 3 && Math.hypot(pts[0].x - p.x, pts[0].y - p.y) * view.current.zoom < 10) finishPolygon();
        else pts.push(p);
        return;
      }
      case 'area': {
        const c = state.areaCommand;
        if (!c) return;
        // A corner of the shape is grabbed before anything new is drawn.
        const at = polygonDraft.current.length === 0 ? vertexAt(c.shape, p, HANDLE_PX / view.current.zoom) : null;
        if (at) drag.current = { kind: 'area-corner', at };
        else if (c.tool === 'rect' || c.tool === 'ellipse') drag.current = { kind: 'area-drag', tool: c.tool, a: p, b: p };
        else if (c.tool === 'lasso') drag.current = { kind: 'area-path', path: [p] };
        else {
          const pts = polygonDraft.current;
          if (pts.length >= 3 && Math.hypot(pts[0].x - p.x, pts[0].y - p.y) * view.current.zoom < 10) finishPolygon(e.altKey);
          else pts.push(p);
        }
        return;
      }
      case 'reveal-room': {
        const z = zoneAt(p);
        if (z) revealZone(z);
        return;
      }
      case 'wall':
        addWallPoint(wallTarget(p, e.altKey));
        return;
      case 'stair':
        drag.current = { kind: 'stair-rect', a: p, b: p };
        return;
      case 'calibrate': {
        // Inside the box: move it with the grid; elsewhere: drag a new box.
        const b = state.calibration?.box;
        const inside = b && p.x >= b.x && p.x <= b.x + b.size && p.y >= b.y && p.y <= b.y + b.size;
        drag.current = inside ? { kind: 'calib-move', last: p } : { kind: 'calib-box', a: p };
        return;
      }
      case 'cone':
      case 'sphere':
      case 'line':
      case 'cube':
        drag.current = { kind: 'template', shape: state.tool, a: snapCorner(p), b: p };
        return;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    altHeld.current = e.altKey;
    const p = toWorld(e);
    mouse.current = p;
    const d = drag.current;
    // The ground palette shows the biome under the pointer (E-88).
    if (state.tool === 'terrain' && state.terrainCommand && state.terrainCommand.tool !== 'step') hoverTerrainBiome(p);
    // The placing mode's preview follows the pointer (not while panning).
    if (state.placing && d?.kind !== 'pan') previewPlacing(p);
    if (!d) return;
    if (d.kind === 'pan') {
      const r = canvasRef.current!.getBoundingClientRect();
      view.current = { ...view.current, x: d.vx + e.clientX - r.left - d.sx, y: d.vy + e.clientY - r.top - d.sy };
    } else if (d.kind === 'token') {
      d.moved = true;
      moveToken(d.id, { x: p.x + d.ox, y: p.y + d.oy }, false);
    } else if (d.kind === 'area-corner') {
      moveAreaCorner(d.at, cornerTarget(p, e.altKey), false);
    } else if (d.kind === 'calib-box') {
      // A click without dragging keeps the box there is.
      if (Math.hypot(p.x - d.a.x, p.y - d.a.y) * view.current.zoom > 3) setCalibrationBox(squareBox(d.a, p));
    } else if (d.kind === 'calib-move') {
      moveCalibration(p.x - d.last.x, p.y - d.last.y);
      d.last = p;
    } else if (d.kind === 'asset-move') {
      if (!d.moved) checkpoint();
      d.moved = true;
      moveAssetTo(d.id, { x: p.x + d.ox, y: p.y + d.oy }, false);
    } else if (d.kind === 'crop' || d.kind === 'stair-rect') {
      d.b = p;
    } else if (d.kind === 'leak-figure') {
      updateLeakCheck({ figure: { x: p.x + d.ox, y: p.y + d.oy } });
    } else if (d.kind === 'sound-move') {
      if (!d.moved) checkpoint();
      d.moved = true;
      updateSound(d.id, { x: p.x + d.ox, y: p.y + d.oy }, false);
    } else if (d.kind === 'sound-radius') {
      if (!d.moved) checkpoint();
      d.moved = true;
      const x = state.scene.sounds.find((q) => q.id === d.id);
      if (x) updateSound(d.id, { radiusFt: soundRadiusFt(Math.hypot(p.x - x.x, p.y - x.y), e.altKey) }, false);
    } else if (d.kind === 'asset-turn') {
      if (!d.moved) checkpoint();
      d.moved = true;
      turnPlacedAssetTo(d.id, d.start + angleOf(d.pivot, p) - d.from, false);
    } else if (d.kind === 'wall-ends') {
      // The whole drag is one undoable step; a click without moving changes nothing.
      if (!d.moved) checkpoint();
      d.moved = true;
      d.to = wallTarget(p, e.altKey, new Set(d.ends.map((x) => x.id)));
      moveWallEnds(d.ends, d.to, false);
    } else if (d.kind === 'fog-path' || d.kind === 'area-path') {
      const last = d.path[d.path.length - 1];
      if (Math.hypot(last.x - p.x, last.y - p.y) * view.current.zoom > 4) d.path.push(p);
    } else if (d.kind === 'terrain') {
      moveTerrainStroke(p, { straight: e.shiftKey, invert: e.altKey }, false);
    } else if (d.kind === 'fog-rect' || d.kind === 'fog-ellipse') {
      d.b = p;
      d.circle = e.shiftKey;
    } else {
      d.b = p;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === 'token') {
      const tk = state.scene.tokens.find((x) => x.id === d.id)!;
      moveToken(d.id, { x: tk.x, y: tk.y }, true);
      if (d.moved) log('log.moved', { name: tk.name, ft: gridDistanceFeet(state.scene.map.grid, d.start, tk) });
    } else if (d.kind === 'terrain') {
      moveTerrainStroke(toWorld(e), { straight: e.shiftKey, invert: e.altKey }, true);
    } else if (d.kind === 'area-drag') {
      drawAreaPart(partFromDrag(d.tool, d.a, d.b, areaGrid(e.altKey)));
    } else if (d.kind === 'area-path') {
      drawAreaPart(partFromPoints('lasso', d.path, null));
    } else if (d.kind === 'area-corner') {
      moveAreaCorner(d.at, cornerTarget(toWorld(e), e.altKey), true);
    } else if (d.kind === 'wall-ends') {
      if (d.moved) moveWallEnds(d.ends, d.to, true);
    } else if (d.kind === 'asset-move') {
      const q = toWorld(e);
      if (d.moved) moveAssetTo(d.id, { x: q.x + d.ox, y: q.y + d.oy }, true);
      else if (d.activate) activateAsset(d.id);
    } else if (d.kind === 'sound-move') {
      // Let go: on the middle of its cell, as placed (Alt: exactly where it is).
      const q = toWorld(e);
      const at = { x: q.x + d.ox, y: q.y + d.oy };
      if (d.moved) updateSound(d.id, state.snap && !e.altKey ? snapPoint(at) : at, false);
    } else if (d.kind === 'asset-turn') {
      const q = toWorld(e);
      if (d.moved) turnPlacedAssetTo(d.id, d.start + angleOf(d.pivot, q) - d.from, true);
    } else if (d.kind === 'stair-rect') {
      // Whole cells: from the cell pressed to the cell let go (a click: one cell).
      const r = cellRect(d.a, d.b);
      addStair(r);
    } else if (d.kind === 'crop') {
      // The cut lies inside the picture (its area starts at the map's origin).
      const m = state.scene.map;
      const o = m.origin ?? { x: 0, y: 0 };
      const x = Math.max(o.x, Math.min(d.a.x, d.b.x));
      const y = Math.max(o.y, Math.min(d.a.y, d.b.y));
      const w = Math.min(o.x + m.widthPx, Math.max(d.a.x, d.b.x)) - x;
      const h = Math.min(o.y + m.heightPx, Math.max(d.a.y, d.b.y)) - y;
      if (w > 4 && h > 4) updateLook({ crop: { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) } });
      setCropping(false);
    } else if (d.kind === 'template') {
      addTemplate(d.shape, d.a, d.b);
    } else if (d.kind === 'fog-rect' || d.kind === 'fog-ellipse') {
      applyFogArea(shapeFor(d), modeFor(d.invert));
    } else if (d.kind === 'fog-path') {
      const pts = d.path.map((q) => [q.x, q.y] as [number, number]);
      if (d.tool === 'fog-brush') applyFogArea(strokeArea(pts, state.brushCells * state.scene.map.grid.cellWidth), modeFor(d.invert));
      else if (pts.length >= 3) applyFogArea({ outer: pts, holes: [] }, modeFor(d.invert));
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const w = toWorld(e);
    const zoom = Math.max(1 / 64, Math.min(16, view.current.zoom * Math.exp(-e.deltaY * 0.0015)));
    view.current = viewAt(w, { x: mx, y: my }, zoom, view.current.rot);
  };

  const terrainHint: Record<string, MessageKey> = { step: 'hint.terrain', ground: 'hint.terrainGround', biome: 'hint.terrainBiome', fill: 'hint.terrainFill' };
  const hintKey = tool === 'select' && ws === 'forge' ? 'hint.selectForge' : tool === 'terrain' ? terrainHint[terrainTool] : HINTS[tool];
  return (
    <div ref={wrapRef} className="map-wrap">
      {/* The storeys below the one worked on (E-40): blurred under it, everything shown. */}
      {hasBelow && (
        <div className="storey-underlay" aria-hidden="true">
          <TableView source={belowSource} depth={1} />
        </div>
      )}
      <canvas ref={canvasRef} aria-hidden="true" />
      <canvas
        ref={overlayRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => state.placing && previewPlacing(null)}
        onDoubleClick={(e) => {
          if (state.tool === 'fog-polygon' || state.tool === 'area') finishPolygon(e.altKey);
          else if (state.tool === 'wall') endWallChain();
          // Map Forge: a double-click on a wall selects its chain, on an area edits it.
          else if (state.tool === 'select' && state.layer === 'map') {
            const p = toWorld(e);
            const wall = wallAt(state.scene.walls.filter(editableHere), p, HANDLE_PX / view.current.zoom);
            const id = wall ? null : zoneAt(p);
            if (wall) selectWallChain(wall);
            else if (id) startAreaCommand(id);
          }
        }}
        onWheel={onWheel}
        onDragOver={(e) => {
          const asset = e.dataTransfer.types.includes(ASSET_DRAG);
          if (e.dataTransfer.types.includes(CREATURE_DRAG) || asset) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDrop={(e) => {
          const assets = e.dataTransfer.getData(ASSET_DRAG);
          if (assets) {
            e.preventDefault();
            placeDropped(assets, toWorld(e));
            return;
          }
          const idx = e.dataTransfer.getData(CREATURE_DRAG);
          if (idx === '') return;
          e.preventDefault();
          addCreatureToken(Number(idx), toWorld(e));
        }}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={t('panel.map')}
      />
      {hintKey && mapPresent && !catalog && <div className="map-hint">{t(hintKey)}</div>}
      {/* The Map Forge without a map open: the map catalog over the canvas (E-32, DC-117). */}
      {catalog && <MapCatalogView />}
      {ws === 'play' && <InteriorAsks />}
      {ws === 'play' && <StairAsks />}
      {ws === 'play' && <TvAsk />}
      <TvMapPending />
      {ws === 'forge' && <AreaCommandPanel />}
      {(ws === 'forge' || ws === 'play') && <PlacingPanel />}
      {ws === 'forge' && <WallCommandPanel />}
      {ws === 'forge' && <TerrainCommandPanel />}
      {ws === 'forge' && !otherCommand && <LeakCheckPanel />}
      {ws === 'forge' && <LookPanel />}
      {ws === 'forge' && <CalibrationPanel />}
      {!mapPresent && !catalog && (
        <div className="map-empty">
          <Icon name="map" />
          <b>{t('map.empty.title')}</b>
          <p>{t('map.empty.hint')}</p>
          {campaignOpen && (
            <button className="btn pri" onClick={() => void importMapIntoCampaign()}>
              <Icon name="import" />
              {t('map.empty.import')}
            </button>
          )}
        </div>
      )}
      {editStart && ws === 'play' ? (
        <div className="map-badge start-state" role="status">{t('badge.startState')}</div>
      ) : (
        <div className="map-badge">{dmFogHidden ? t('fog.hiddenInDm') : t(ws === 'forge' ? 'ws.forge' : 'ws.play')}</div>
      )}
    </div>
  );
}

/** The map element under `p` for "hide / show": a light, else a wall, else an area – shown or hidden. */
/** Assets dragged from the Assets panel or the Vault: placed at the drop point, a cell apart each. */
function placeDropped(data: string, at: Point): void {
  let paths: unknown;
  try {
    paths = JSON.parse(data);
  } catch {
    return;
  }
  if (!Array.isArray(paths)) return;
  const cell = state.scene.map.grid.cellWidth;
  paths.filter((x): x is string => typeof x === 'string').forEach((path, i) => placeAsset(path, { x: at.x + i * cell, y: at.y }));
}

/** The scene without what lies on layers hidden in the editor (Map Forge, E-28). */
function shownLayers(sc: Scene): Scene {
  if (!sc.map.layers.some((l) => l.editorHidden)) return sc;
  return { ...sc, walls: sc.walls.filter(shownInForge), zones: sc.zones.filter(shownInForge), lights: sc.lights.filter(shownInForge), sounds: sc.sounds.filter(shownInForge) };
}

/** A placement as the overlay shows it. */
function placementLook(a: MapAssetPlacement, hidden: boolean) {
  const info = state.assetInfo[a.assetPath];
  return {
    fp: footprintOf(a, info?.sizeCells, state.scene.map.grid),
    name: info?.name ?? a.assetPath.replace(/^library\//, ''),
    selected: a.id === state.selectedAssetId,
    // Missing: not in the library (the registry is filled once the Vault data is read).
    missing: Object.keys(state.assetInfo).length > 0 && !info,
    hidden,
  };
}

/** The placed asset (shown or hidden in this scene) at `p`. */
function placementAt(p: Point): string | null {
  const sc = state.scene;
  const all = [...allPlacements(sc), ...sc.hidden.assets].reverse();
  return all.find((a) => hitsPlacement(footprintOf(a, state.assetInfo[a.assetPath]?.sizeCells, sc.map.grid), p))?.id ?? null;
}

function elementAt(p: Point, tol: number): string | null {
  const sc = state.scene;
  const r = sc.map.grid.cellWidth * 0.45;
  const light = [...sc.lights, ...sc.hidden.lights, ...sc.sounds, ...sc.hidden.sounds].find((l) => Math.hypot(l.x - p.x, l.y - p.y) < r);
  if (light) return light.id;
  const wall = wallAt([...sc.walls, ...sc.hidden.walls], p, tol);
  if (wall) return wall;
  const asset = placementAt(p);
  if (asset) return asset;
  return [...sc.zones, ...sc.hidden.zones].reverse().find((z) => areaContains(z.shape, p))?.id ?? null;
}

/** An SVG path of `polys` on screen in this view (CSS px). */
function screenPath(polys: readonly Polygon[], v: View): string {
  return polys.map((p) => [p.outer, ...p.holes].map((ring) => `M${ring.map(([x, y]) => { const q = toScreen(v, { x, y }); return `${q.x.toFixed(1)} ${q.y.toFixed(1)}`; }).join('L')}Z`).join('')).join('');
}

/** A dragged radius in feet: whole 5 ft steps (Alt: whole feet), at least one step. */
function soundRadiusFt(px: number, free: boolean): number {
  const g = state.scene.map.grid;
  const ft = px / (g.cellWidth / g.feetPerCell);
  const step = free ? 1 : 5;
  return Math.max(step, Math.round(ft / step) * step);
}

/** Screen pixels within which a corner of the area is grabbed. */
const HANDLE_PX = 8;

/** Where a dragged corner goes: the nearest grid corner, or exactly the pointer with Alt. */
function cornerTarget(p: Point, free: boolean): Point {
  const grid = areaGrid(free);
  return grid ? snapToCorner(grid, p) : p;
}

/** The grid parts of an area snap to; none while Alt is held or snapping is off. */
function areaGrid(free: boolean) {
  return free || !state.snap ? null : state.scene.map.grid;
}

function modeFor(invert: boolean): 'reveal' | 'hide' {
  return invert ? (state.fogMode === 'reveal' ? 'hide' : 'reveal') : state.fogMode;
}

function shapeFor(d: { kind: 'fog-rect' | 'fog-ellipse'; a: Point; b: Point; circle: boolean }): Polygon | null {
  if (Math.hypot(d.a.x - d.b.x, d.a.y - d.b.y) < 2) return null;
  if (d.kind === 'fog-rect') return rectPolygon(d.a.x, d.a.y, d.b.x, d.b.y);
  // Shift draws a circle around the start point (Dungeon-Manager T-247).
  if (d.circle) return circleArea([d.a.x, d.a.y], Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y));
  return ellipseArea([d.a.x, d.a.y], [d.b.x, d.b.y]);
}

/** Wall/zone/template points snap to grid corners (or cell centres on a rotated grid). */
function snapCorner(p: Point): Point {
  if (!state.snap) return p;
  const g = state.scene.map.grid;
  if (g.rotationDeg !== 0) return snapPoint(p);
  return {
    x: Math.round((p.x - g.originX) / g.cellWidth) * g.cellWidth + g.originX,
    y: Math.round((p.y - g.originY) / g.cellHeight) * g.cellHeight + g.originY,
  };
}

function templateDraft(shape: TemplateShape, a: Point, b: Point) {
  const g = state.scene.map.grid;
  const lenPx = Math.hypot(b.x - a.x, b.y - a.y);
  const sizeFt = Math.max(g.feetPerCell, Math.round(lenPx / g.cellWidth) * g.feetPerCell);
  return { shape, x: a.x, y: a.y, angle: Math.atan2(b.y - a.y, b.x - a.x), sizeFt, color: '#e2a03c' };
}

/** "Show the interior?" after a player character came into a house set to ask first (E-29): yes or no, without blocking play. */
function InteriorAsks() {
  const { t } = useI18n();
  const asks = useStore((s) => s.interiorAsks);
  if (!asks.length) return null;
  return (
    <div className="interior-asks" role="status">
      {asks.map((a) => (
        <div key={a.id} className="interior-ask">
          <span>{t('interior.ask', { name: a.name })}</span>
          <div className="library-buttons">
            <button className="btn sm pri" onClick={() => answerInteriorAsk(a.id, true)}>{t('interior.yes')}</button>
            <button className="btn sm" onClick={() => answerInteriorAsk(a.id, false)}>{t('interior.no')}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Figures set down on stairs (E-44): "Thorin up to the gallery?" – without blocking play. */
function StairAsks() {
  const { t } = useI18n();
  const asks = useStore((s) => s.stairAsks);
  if (!asks.length) return null;
  return (
    <div className="interior-asks" role="status">
      {asks.map((a) => (
        <div key={a.tokenId} className="interior-ask">
          <span>{t('stair.ask', { name: a.name, storey: a.toName || t('storey.ground') })}</span>
          <div className="library-buttons">
            <button className="btn sm pri" onClick={() => answerStairAsk(a.tokenId, true)}>{t('stair.go')}</button>
            <button className="btn sm" onClick={() => answerStairAsk(a.tokenId, false)}>{t('stair.stay')}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** The cells from `a` to `b` as one rectangle (map px). */
function cellRect(a: Point, b: Point): { x: number; y: number; w: number; h: number } {
  const g = state.scene.map.grid;
  const cx = (v: number) => Math.floor((v - g.originX) / g.cellWidth);
  const cy = (v: number) => Math.floor((v - g.originY) / g.cellHeight);
  const x0 = Math.min(cx(a.x), cx(b.x));
  const y0 = Math.min(cy(a.y), cy(b.y));
  const x1 = Math.max(cx(a.x), cx(b.x)) + 1;
  const y1 = Math.max(cy(a.y), cy(b.y)) + 1;
  return { x: g.originX + x0 * g.cellWidth, y: g.originY + y0 * g.cellHeight, w: (x1 - x0) * g.cellWidth, h: (y1 - y0) * g.cellHeight };
}

/** A storey's name ("" the map itself). */
function storeyName(id: string): string {
  return id ? (state.scene.map.storeys?.find((s) => s.id === id)?.name ?? id) : '';
}

/** After switching tabs in the Orchestrator (E-30): "put this scene on the TV too?" – without blocking play. */
function TvAsk() {
  const { t } = useI18n();
  const ask = useStore((s) => (s.tvAsk && s.tvAsk === s.scenePath ? s.sceneName : null));
  if (!ask) return null;
  return (
    <div className="interior-asks tv-ask" role="status">
      <div className="interior-ask">
        <span>{t('tv.ask', { name: ask })}</span>
        <div className="library-buttons">
          <button className="btn sm pri" onClick={() => state.scenePath && void putOnTv(state.scenePath)}>{t('tv.yes')}</button>
          <button className="btn sm" onClick={() => answerTvAsk(false)}>{t('tv.no')}</button>
        </div>
      </div>
    </div>
  );
}

/** The TV scene's map was changed (E-30): the TV keeps it as before until the DM takes the changes over. */
function TvMapPending() {
  const { t } = useI18n();
  const pending = useStore((s) => s.tvMapPending);
  if (!pending) return null;
  return (
    <div className="interior-asks tv-map" role="status">
      <div className="interior-ask">
        <span>{t('tv.mapPending')}</span>
        <div className="library-buttons">
          <button className="btn sm pri" onClick={applyMapToTv}><Icon name="monitor" />{t('tv.mapApply')}</button>
        </div>
      </div>
    </div>
  );
}

/** The direction from `pivot` to `p` in degrees, clockwise from up (as an asset's turn). */
function angleOf(pivot: Point, p: Point): number {
  return (Math.atan2(p.x - pivot.x, pivot.y - p.y) * 180) / Math.PI;
}
