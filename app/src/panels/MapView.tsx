/**
 * DM map view. Map, grid, tokens and fog are drawn by the PixiJS renderer ported from
 * Dungeon-Manager (see-through fog for the DM); DM overlays are a 2D canvas on top. "Player
 * view" shows the table's frame with the table's own view component.
 */
import { useEffect, useMemo, useRef } from 'react';
import type { Point } from '../core/geometry';
import { gridDistanceFeet } from '../core/grid';
import { clearArea, openArea } from '../core/fogModel';
import { circleArea, ellipseArea, strokeArea } from '../core/poly/shapes';
import type { Polygon } from '../core/poly/types';
import { rectPolygon } from '../core/fogModel';
import type { TemplateShape } from '../core/scene';
import { useI18n } from '../i18n/i18n';
import type { MessageKey } from '../i18n/en';
import { drawDmOverlay, type OverlayState } from '../render/dmOverlay';
import { fogOptions } from '../render/fogOptions';
import { bindMap } from '../render/mapBinding';
import { createRenderer, type Renderer, type TokenShape } from '../render/pixi/renderer';
import { TableView, type FrameSource } from '../table/TableView';
import {
  addCalibrationPoint, addPing, addTemplate, addWall, addZone, applyFogArea, checkpoint, getVersion, initiativeOrder, log, moveToken,
  addCreatureToken, addLight, lightAt, removeToken, revealZone, selectLight, selectToken, selectZone, snapPoint, state, toggleDmFog, toggleDoor, toggleLight, useStore, zoneAt,
} from '../app/store';

/** Drag-and-drop type for creatures dragged from the browser onto the map. */
export const CREATURE_DRAG = 'application/x-dc-creature';

/** Commands other UI parts can trigger on the active map view. */
export const mapCommands: { fit: () => void } = { fit: () => undefined };

const HINTS: Partial<Record<string, MessageKey>> = {
  select: 'hint.select', pan: 'hint.pan', measure: 'hint.measure', ping: 'hint.ping', calibrate: 'hint.calibrate',
  zone: 'hint.zone', wall: 'hint.wall', door: 'hint.door', 'secret-door': 'hint.secretDoor', window: 'hint.window',
  'fog-rect': 'hint.fogRect', 'fog-ellipse': 'hint.fogEllipse', 'fog-polygon': 'hint.fogPolygon', 'fog-lasso': 'hint.fogLasso',
  'fog-brush': 'hint.fogBrush', 'reveal-room': 'hint.revealRoom', light: 'hint.light',
  cone: 'hint.template', sphere: 'hint.template', line: 'hint.template', cube: 'hint.template',
};

type Drag =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'token'; id: string; ox: number; oy: number; start: Point; moved: boolean }
  | { kind: 'measure'; a: Point; b: Point }
  | { kind: 'rect'; a: Point; b: Point }
  | { kind: 'template'; shape: TemplateShape; a: Point; b: Point }
  | { kind: 'fog-rect' | 'fog-ellipse'; a: Point; b: Point; invert: boolean; circle: boolean }
  | { kind: 'fog-path'; tool: 'fog-lasso' | 'fog-brush'; path: Point[]; invert: boolean };

export function MapView() {
  const viewAsPlayer = useStore((s) => s.viewAsPlayer);
  const source = useMemo<FrameSource>(() => ({ current: () => (state.frame ? { frame: state.frame, receivedAt: Date.now() } : null) }), []);
  return viewAsPlayer ? <TableView source={source} /> : <DmMap />;
}

function DmMap() {
  const { t } = useI18n();
  const tool = useStore((s) => s.tool);
  const ws = useStore((s) => s.ws);
  const sceneVersion = useStore((s) => s.sceneVersion);
  const dmFogHidden = useStore((s) => s.dmFogHidden);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const view = useRef({ zoom: 0.4, x: 20, y: 20 });
  const drag = useRef<Drag | null>(null);
  const polygonDraft = useRef<Point[]>([]);
  const mouse = useRef<Point>({ x: 0, y: 0 });
  const space = useRef(false);

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
      const z = Math.min((s.width - 40) / m.widthPx, (s.height - 40) / m.heightPx);
      view.current = { zoom: z, x: (s.width - m.widthPx * z) / 2, y: (s.height - m.heightPx * z) / 2 };
    };
    mapCommands.fit = fit;
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
      void map?.set(sc.map.imageUrl, sc.map.isVideo);
      r.setGrid(state.showGrid && sc.map.grid.type === 'square' ? { cellSizePx: cell, offsetXPx: sc.map.grid.originX, offsetYPx: sc.map.grid.originY, alpha: 0.18 } : null);
      const active = state.ws === 'play' ? initiativeOrder()[state.turn]?.id : undefined;
      r.setTokens(
        sc.tokens.map((k): TokenShape => ({
          id: k.id, name: k.label, x: k.x - (k.size * cell) / 2, y: k.y - (k.size * cell) / 2, width: k.size * cell, height: k.size * cell,
          color: k.ringColor, selected: k.id === state.selectedTokenId, hidden: k.hidden, active: k.id === active,
        })),
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
        const v2 = view.current;
        const camKey = `${v2.zoom}|${v2.x}|${v2.y}|${s.width}|${s.height}`;
        if (camKey !== lastCam) {
          lastCam = camKey;
          r.setCamera({ centerX: (s.width / 2 - v2.x) / v2.zoom, centerY: (s.height / 2 - v2.y) / v2.zoom, zoom: v2.zoom, rotation: 0 });
        }
      }
      const dpr = window.devicePixelRatio || 1;
      if (overlay.width !== Math.round(s.width * dpr) || overlay.height !== Math.round(s.height * dpr)) {
        overlay.width = Math.round(s.width * dpr);
        overlay.height = Math.round(s.height * dpr);
      }
      const g = overlay.getContext('2d');
      if (g) drawDmOverlay(g, state.scene, state.vision, view.current, dpr, overlayState(), Date.now());
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

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return;
      if (e.code === 'Space') space.current = true;
      if (e.key === 'Escape') {
        state.wallStart = null;
        drag.current = null;
        polygonDraft.current = [];
      }
      if (e.key === 'Enter') finishPolygon();
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedTokenId) removeToken(state.selectedTokenId);
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
      measure: d?.kind === 'measure' ? { a: d.a, b: d.b, ft: gridDistanceFeet(state.scene.map.grid, d.a, d.b) } : null,
      dragRect: d?.kind === 'rect' ? { a: d.a, b: d.b } : null,
      wallPreview: state.wallStart ? { a: state.wallStart, b: snapCorner(mouse.current) } : null,
      brush: state.tool === 'fog-brush' ? { p: mouse.current, r: state.brushCells * cell } : null,
      calibPoints: state.calibPoints,
      draftTemplate: d?.kind === 'template' ? templateDraft(d.shape, d.a, d.b) : null,
      fogDraft,
    };
  };

  const toWorld = (e: { clientX: number; clientY: number }): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    const v = view.current;
    return { x: (e.clientX - r.left - v.x) / v.zoom, y: (e.clientY - r.top - v.y) / v.zoom };
  };

  const finishPolygon = () => {
    const pts = polygonDraft.current;
    polygonDraft.current = [];
    if (pts.length >= 3) applyFogArea({ outer: pts.map((p) => [p.x, p.y] as [number, number]), holes: [] }, state.fogMode);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = toWorld(e);
    const r = canvasRef.current!.getBoundingClientRect();
    if (e.button === 1 || e.button === 2 || state.tool === 'pan' || space.current) {
      drag.current = { kind: 'pan', sx: e.clientX - r.left, sy: e.clientY - r.top, vx: view.current.x, vy: view.current.y };
      return;
    }
    if ((e.altKey && !state.tool.startsWith('fog-')) || state.tool === 'ping') {
      addPing(p);
      return;
    }
    const cell = state.scene.map.grid.cellWidth;
    switch (state.tool) {
      case 'select': {
        const tk = [...state.scene.tokens].reverse().find((k) => Math.hypot(k.x - p.x, k.y - p.y) < (cell * k.size) / 2);
        if (tk) {
          selectToken(tk.id);
          checkpoint();
          drag.current = { kind: 'token', id: tk.id, ox: tk.x - p.x, oy: tk.y - p.y, start: { x: tk.x, y: tk.y }, moved: false };
          return;
        }
        const light = lightAt(p);
        if (light) {
          if (state.ws === 'play') toggleLight(light);
          else selectLight(light);
          return;
        }
        if (state.ws === 'play') {
          const door = state.scene.walls.find((w) => (w.kind === 'door' || w.kind === 'secret-door') && Math.hypot((w.x1 + w.x2) / 2 - p.x, (w.y1 + w.y2) / 2 - p.y) < cell * 0.45);
          if (door && (door.kind === 'door' || door.open)) {
            toggleDoor(door.id);
            return;
          }
        }
        selectToken(null);
        selectLight(null);
        selectZone(zoneAt(p));
        return;
      }
      case 'light':
        addLight(snapPoint(p));
        return;
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
      case 'zone':
        drag.current = { kind: 'rect', a: snapCorner(p), b: p };
        return;
      case 'reveal-room': {
        const z = zoneAt(p);
        if (z) revealZone(z);
        return;
      }
      case 'wall':
      case 'door':
      case 'secret-door':
      case 'window': {
        const q = snapCorner(p);
        if (!state.wallStart) state.wallStart = q;
        else {
          addWall(state.tool, state.wallStart, q);
          state.wallStart = state.tool === 'wall' || state.tool === 'window' ? q : null;
        }
        return;
      }
      case 'calibrate':
        addCalibrationPoint(p);
        return;
      case 'cone':
      case 'sphere':
      case 'line':
      case 'cube':
        drag.current = { kind: 'template', shape: state.tool, a: snapCorner(p), b: p };
        return;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = toWorld(e);
    mouse.current = p;
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pan') {
      const r = canvasRef.current!.getBoundingClientRect();
      view.current = { ...view.current, x: d.vx + e.clientX - r.left - d.sx, y: d.vy + e.clientY - r.top - d.sy };
    } else if (d.kind === 'token') {
      d.moved = true;
      moveToken(d.id, { x: p.x + d.ox, y: p.y + d.oy }, false);
    } else if (d.kind === 'fog-path') {
      const last = d.path[d.path.length - 1];
      if (Math.hypot(last.x - p.x, last.y - p.y) * view.current.zoom > 4) d.path.push(p);
    } else if (d.kind === 'fog-rect' || d.kind === 'fog-ellipse') {
      d.b = p;
      d.circle = e.shiftKey;
    } else {
      d.b = p;
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === 'token') {
      const tk = state.scene.tokens.find((x) => x.id === d.id)!;
      moveToken(d.id, { x: tk.x, y: tk.y }, true);
      if (d.moved) log('log.moved', { name: tk.name, ft: gridDistanceFeet(state.scene.map.grid, d.start, tk) });
    } else if (d.kind === 'rect') {
      const b = snapCorner(d.b);
      addZone(d.a.x, d.a.y, b.x, b.y);
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
    view.current = { zoom, x: mx - w.x * zoom, y: my - w.y * zoom };
  };

  const hintKey = HINTS[tool];
  return (
    <div ref={wrapRef} className="map-wrap">
      <canvas ref={canvasRef} aria-hidden="true" />
      <canvas
        ref={overlayRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => state.tool === 'fog-polygon' && finishPolygon()}
        onWheel={onWheel}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(CREATURE_DRAG)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDrop={(e) => {
          const idx = e.dataTransfer.getData(CREATURE_DRAG);
          if (idx === '') return;
          e.preventDefault();
          addCreatureToken(Number(idx), toWorld(e));
        }}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={t('panel.map')}
      />
      {hintKey && <div className="map-hint">{t(hintKey)}</div>}
      <div className="map-badge">{dmFogHidden ? t('fog.hiddenInDm') : t(ws === 'forge' ? 'ws.forge' : 'ws.play')}</div>
    </div>
  );
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

/** Wall/zone/template points snap to grid corners (square) or cell centres (hex). */
function snapCorner(p: Point): Point {
  if (!state.snap) return p;
  const g = state.scene.map.grid;
  if (g.type !== 'square' || g.rotationDeg !== 0) return snapPoint(p);
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
