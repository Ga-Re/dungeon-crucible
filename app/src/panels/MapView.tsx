import { useEffect, useRef } from 'react';
import type { Point } from '../core/geometry';
import { gridDistanceFeet } from '../core/grid';
import type { TemplateShape } from '../core/scene';
import { useI18n } from '../i18n/i18n';
import type { MessageKey } from '../i18n/en';
import { renderPlayerFrame } from '../render/frameRenderer';
import { renderDm, type DmOverlay, type DmView } from '../render/dmRenderer';
import {
  addCalibrationPoint, addPing, addTemplate, addWall, addZone, fogBrush, fogRect, initiativeOrder, log, moveToken,
  revealZone, selectToken, selectZone, snapPoint, state, toggleDoor, useStore, zoneAt,
} from '../app/store';

/** Commands other UI parts can trigger on the active map view. */
export const mapCommands: { fit: () => void } = { fit: () => undefined };

const HINTS: Partial<Record<string, MessageKey>> = {
  select: 'hint.select', pan: 'hint.pan', measure: 'hint.measure', ping: 'hint.ping', calibrate: 'hint.calibrate',
  zone: 'hint.zone', wall: 'hint.wall', door: 'hint.door', 'secret-door': 'hint.secretDoor', window: 'hint.window',
  reveal: 'hint.revealBrush', hide: 'hint.hideBrush', 'reveal-rect': 'hint.revealRect', 'reveal-room': 'hint.revealRoom',
  cone: 'hint.template', sphere: 'hint.template', line: 'hint.template', cube: 'hint.template',
};

type Drag =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'token'; id: string; ox: number; oy: number; start: Point; moved: boolean }
  | { kind: 'measure'; a: Point; b: Point }
  | { kind: 'brush' }
  | { kind: 'rect'; a: Point; b: Point }
  | { kind: 'template'; shape: TemplateShape; a: Point; b: Point };

export function MapView() {
  const { t } = useI18n();
  const tool = useStore((s) => s.tool);
  const ws = useStore((s) => s.ws);
  const viewAsPlayer = useStore((s) => s.viewAsPlayer);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef<DmView>({ zoom: 0.4, x: 20, y: 20 });
  const drag = useRef<Drag | null>(null);
  const mouse = useRef<Point>({ x: 0, y: 0 });
  const space = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const g = canvas.getContext('2d')!;
    let raf = 0;
    const fit = () => {
      const r = wrap.getBoundingClientRect();
      if (!r.width) return;
      const m = state.scene.map;
      const z = Math.min((r.width - 40) / m.widthPx, (r.height - 40) / m.heightPx);
      view.current = { zoom: z, x: (r.width - m.widthPx * z) / 2, y: (r.height - m.heightPx * z) / 2 };
    };
    mapCommands.fit = fit;
    let fitted = false;
    const ro = new ResizeObserver(() => {
      if (!fitted) {
        fit();
        fitted = true;
      }
    });
    ro.observe(wrap);

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(wrap.clientWidth * dpr);
      const h = Math.round(wrap.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const now = Date.now();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = getComputedStyle(wrap).backgroundColor || '#0e0f11';
      g.fillRect(0, 0, w, h);
      if (state.viewAsPlayer && state.frame) {
        try {
          renderPlayerFrame(g, state.frame, w, h, 0);
        } catch {
          g.setTransform(1, 0, 0, 1, 0, 0);
          g.fillStyle = '#000';
          g.fillRect(0, 0, w, h);
        }
      } else {
        const d = drag.current;
        const order = initiativeOrder();
        const o: DmOverlay = {
          editMode: state.ws === 'forge',
          showGrid: state.showGrid,
          dmSeeThrough: state.dmSeeThrough,
          memoryOpacity: state.memoryOpacity,
          softness: state.fogSoftness,
          selectedTokenId: state.selectedTokenId,
          selectedZoneId: state.selectedZoneId,
          currentTurnId: state.ws === 'play' ? order[state.turn]?.id ?? null : null,
          measure: d?.kind === 'measure' ? { a: d.a, b: d.b, ft: gridDistanceFeet(state.scene.map.grid, d.a, d.b) } : null,
          dragRect: d?.kind === 'rect' ? { a: d.a, b: d.b } : null,
          wallPreview: state.wallStart ? { a: state.wallStart, b: snapCorner(mouse.current) } : null,
          brush: state.tool === 'reveal' || state.tool === 'hide' ? { p: mouse.current, r: state.brushCells * state.scene.map.grid.cellWidth } : null,
          calibPoints: state.calibPoints,
          draftTemplate: d?.kind === 'template' ? templateDraft(d.shape, d.a, d.b) : null,
        };
        renderDm(g, state.scene, state.vision, view.current, dpr, o, now);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement).closest('input,textarea,select')) space.current = true;
      if (e.key === 'Escape') {
        state.wallStart = null;
        drag.current = null;
      }
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

  const toWorld = (e: React.PointerEvent | React.WheelEvent): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    const v = view.current;
    return { x: (e.clientX - r.left - v.x) / v.zoom, y: (e.clientY - r.top - v.y) / v.zoom };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (state.viewAsPlayer) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = toWorld(e);
    const r = canvasRef.current!.getBoundingClientRect();
    if (e.button === 1 || e.button === 2 || state.tool === 'pan' || space.current) {
      drag.current = { kind: 'pan', sx: e.clientX - r.left, sy: e.clientY - r.top, vx: view.current.x, vy: view.current.y };
      return;
    }
    if (e.altKey || state.tool === 'ping') {
      addPing(p);
      return;
    }
    const cell = state.scene.map.grid.cellWidth;
    switch (state.tool) {
      case 'select': {
        const tk = [...state.scene.tokens].reverse().find((k) => Math.hypot(k.x - p.x, k.y - p.y) < (cell * k.size) / 2);
        if (tk) {
          selectToken(tk.id);
          drag.current = { kind: 'token', id: tk.id, ox: tk.x - p.x, oy: tk.y - p.y, start: { x: tk.x, y: tk.y }, moved: false };
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
        selectZone(zoneAt(p));
        return;
      }
      case 'measure':
        drag.current = { kind: 'measure', a: snapPoint(p), b: p };
        return;
      case 'reveal':
      case 'hide':
        drag.current = { kind: 'brush' };
        fogBrush(p, state.tool === 'reveal' ? 'reveal' : 'hide');
        return;
      case 'reveal-rect':
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
    } else if (d.kind === 'measure' || d.kind === 'rect' || d.kind === 'template') {
      d.b = p;
    } else if (d.kind === 'brush') {
      fogBrush(p, state.tool === 'reveal' ? 'reveal' : 'hide');
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
      if (state.tool === 'zone') addZone(d.a.x, d.a.y, b.x, b.y);
      else fogRect(d.a.x, d.a.y, b.x, b.y);
    } else if (d.kind === 'template') {
      addTemplate(d.shape, d.a, d.b);
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const w = toWorld(e);
    const zoom = Math.max(0.05, Math.min(6, view.current.zoom * Math.exp(-e.deltaY * 0.0015)));
    view.current = { zoom, x: mx - w.x * zoom, y: my - w.y * zoom };
  };

  const hintKey = HINTS[tool];
  return (
    <div ref={wrapRef} className="map-wrap">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={t('panel.map')}
      />
      {hintKey && !viewAsPlayer && <div className="map-hint">{t(hintKey)}</div>}
      <div className={`map-badge ${viewAsPlayer ? 'player' : ''}`}>{viewAsPlayer ? t('tool.playerView') : t(ws === 'forge' ? 'ws.forge' : 'ws.play')}</div>
    </div>
  );
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
