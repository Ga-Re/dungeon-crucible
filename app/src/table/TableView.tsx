/**
 * Draws PlayerFrames with the PixiJS renderer from Dungeon-Manager. Used by the table window
 * and by the DM's preview panel, so the preview is exactly what the TV shows.
 *
 * Fail-closed: without a fresh, valid, non-blackout frame the whole view is hidden on black.
 * Scene transitions (DC-105) lay only a still of what this view already showed, and black, over
 * the new scene; a stale frame ends them at once.
 * With a frame, the opaque fog covers everything outside `fog.open`; memory fog and the living
 * fog only ever darken. Templates are clipped to the open area. This module must not import
 * DM-side state (src/app/store.ts and friends).
 */
import { useEffect, useRef, useState } from 'react';
import { MAX_FRAME_AGE_MS, type PlayerFrame, type StoreyFrame } from '../core/projection';
import { transitionLook, type TransitionPlay } from '../core/transition';
import type { Polygon } from '../core/poly/types';
import { fogOptions, lookFromWire } from '../render/fogOptions';
import { bindMap } from '../render/mapBinding';
import { createRenderer, type Renderer, type TokenShape } from '../render/pixi/renderer';
import { templatePath } from '../render/shared';

export interface FrameSource {
  /** Latest frame and when it arrived (ms, `Date.now()`), or null. */
  current(): { frame: PlayerFrame; receivedAt: number } | null;
}

/**
 * `depth`: which storey of the frame this view draws (E-40) – 0 the TV's own, 1 the one below it …
 * A storey below is drawn by a nested view under this one, blurred and darkened; this view is cut
 * to its storey's footprint, so outside it only the storey below (with its own fog) shows.
 */
export function TableView({ source, depth = 0 }: { source: FrameSource; depth?: number }) {
  const [below, setBelow] = useState(false);
  const belowRef = useRef(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const cutRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    const canvas = canvasRef.current!;
    const overlay = overlayRef.current!;
    const cutCanvas = cutRef.current!;
    let renderer: Renderer | null = null;
    /** The last change of picture played, and the one playing (with the still of the picture before). */
    let lastCut = -1;
    let cut: { play: TransitionPlay; ms: number; start: number; still: HTMLCanvasElement | null } | null = null;
    let disposed = false;
    let raf = 0;
    let lastSeq = -1;
    let map: ReturnType<typeof bindMap> | null = null;

    const size = () => ({ width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight) });

    void createRenderer({ canvas, size: size(), resolution: window.devicePixelRatio || 1, background: '#000000' }).then((r) => {
      if (disposed) {
        r.destroy();
        return;
      }
      renderer = r;
      map = bindMap(r, host);
    });

    const blank = () => {
      host.style.visibility = 'hidden';
      lastSeq = -1;
    };

    /** What this view shows now, as one still: the map with its fog, then templates and pings. */
    const still = (r: Renderer): HTMLCanvasElement => {
      const out = r.snapshot();
      out.getContext('2d')?.drawImage(overlay, 0, 0, out.width, out.height);
      return out;
    };

    /** The transition over everything: the still fading, black coming or going. Done: nothing. */
    const drawCut = (now: number, s: { width: number; height: number }) => {
      if (!cut) return;
      const g = cutCanvas.getContext('2d');
      const p = (now - cut.start) / cut.ms;
      // Done: nothing over the view (after "out" the view is hidden on the black background).
      if (!g || p >= 1) {
        cut = null;
        cutCanvas.style.visibility = 'hidden';
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      if (cutCanvas.width !== Math.round(s.width * dpr) || cutCanvas.height !== Math.round(s.height * dpr)) {
        cutCanvas.width = Math.round(s.width * dpr);
        cutCanvas.height = Math.round(s.height * dpr);
      }
      const look = transitionLook(cut.play, p);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
      g.clearRect(0, 0, cutCanvas.width, cutCanvas.height);
      if (cut.still && look.old > 0) {
        g.globalAlpha = look.old;
        g.drawImage(cut.still, 0, 0, cutCanvas.width, cutCanvas.height);
      }
      if (look.black > 0) {
        g.globalAlpha = look.black;
        g.fillStyle = '#000';
        g.fillRect(0, 0, cutCanvas.width, cutCanvas.height);
      }
      g.globalAlpha = 1;
      cutCanvas.style.visibility = 'visible';
    };

    let clipKey = '';
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const r = renderer;
      const top = source.current();
      const now = Date.now();
      // The storey this view draws; a storey below shows under it only while the frame has one.
      const frame = top ? frameAt(top.frame, depth) : null;
      const hasBelow = !!top && (top.frame.below?.length ?? 0) > depth;
      if (hasBelow !== belowRef.current) {
        belowRef.current = hasBelow;
        setBelow(hasBelow);
      }
      const latest = top && frame ? { frame, receivedAt: top.receivedAt } : null;
      if (!r || !latest || now - latest.receivedAt > MAX_FRAME_AGE_MS) {
        // No fresh frame: black at once, a transition included.
        blank();
        cut = null;
        cutCanvas.style.visibility = 'hidden';
        lastCut = -1;
        return;
      }
      const f = latest.frame;
      const s = size();
      // A new change of picture (E-38): the still of what is shown now, before the new frame is drawn.
      const newCut = f.cut.n !== lastCut;
      if (newCut) {
        const first = lastCut === -1;
        lastCut = f.cut.n;
        const timed = !first && f.cut.play !== 'cut' && f.cut.ms > 0;
        const shown = host.style.visibility === 'visible';
        cut = timed ? { play: f.cut.play, ms: f.cut.ms, start: now, still: shown && f.cut.play !== 'in' ? still(r) : null } : null;
      }
      if (f.blackout) {
        blank();
        drawCut(now, s);
        return;
      }
      r.resize(s);
      // The frame is laid out for the TV's physical resolution; this view may be smaller.
      // CSS pixels per physical TV pixel; on the TV itself this is 1 / devicePixelRatio.
      const fit = Math.min(s.width / f.display.widthPx, s.height / f.display.heightPx);
      const camera = { centerX: f.center.x, centerY: f.center.y, zoom: f.zoom * fit, rotation: f.rotation };
      if (f.seq !== lastSeq) {
        lastSeq = f.seq;
        const cell = f.map.grid.cellWidth;
        // A drawn map (E-33) has no picture: its drawing is its picture; else it lies over the picture.
        const d = f.map.drawn;
        r.setWater(d && d.waterAnimated && d.waters.length ? { waters: d.waters, cliffs: d.cliffs, cell } : null);
        if (f.map.imageUrl === null && f.map.drawn) void map?.setDrawn(f.map.drawn, cell);
        else {
          void map?.set(f.map.imageUrl, f.map.isVideo, f.map.look);
          void map?.setOver(f.map.drawn, cell);
        }
        r.setGrid(f.map.showGrid && f.map.grid.type === 'square' ? { cellSizePx: cell, offsetXPx: f.map.grid.originX, offsetYPx: f.map.grid.originY, color: '#000000', alpha: 0.35 } : null);
        r.setAssets(f.assets.map((a, i) => ({ ...a, id: `asset-${i}` })));
        r.setTokens(f.tokens.map((t): TokenShape => ({ id: t.id, name: t.label, x: t.x - (t.size * cell) / 2, y: t.y - (t.size * cell) / 2, width: t.size * cell, height: t.size * cell, color: t.ringColor, active: t.active })), { glide: 120 });
        r.setLighting(f.lighting.darkness > 0 || f.lighting.glows.length ? { ...f.lighting, softEdge: cell * 0.35 } : null);
        const look = lookFromWire(f.fog.look);
        r.setMemory(f.fog.clear, { opacity: f.fog.memoryOpacity, softEdge: look.softEdges ? cell * 0.25 : 0 });
        // Another scene's fog comes at once, never grown out of the fog before (DC-105).
        r.setFog(f.fog.open, fogOptions({ look, cellSizePx: cell, seedKey: f.map.seedKey, effect: f.fog.effect, opacity: 1, quick: f.fog.quick, jump: newCut }));
      }
      r.setCamera(camera);
      // Cut to the storey's footprint (E-40): outside it, nothing of this storey is drawn.
      const key = f.storeyClip ? JSON.stringify([camera, s, f.storeyClip]) : '';
      if (key !== clipKey) {
        clipKey = key;
        host.style.clipPath = f.storeyClip ? `path(evenodd, '${clipPath(f.storeyClip, camera, s)}')` : '';
      }
      drawOverlay(overlay, f, camera, s, now - latest.receivedAt);
      host.style.visibility = 'visible';
      drawCut(now, s);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      map?.dispose();
      renderer?.destroy();
    };
  }, [source, depth]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000', overflow: 'hidden' }}>
      {/* The storey below (E-40): blurred and darker, under this one – deeper ones more so. */}
      {below && (
        <div style={{ position: 'absolute', inset: 0, filter: 'blur(3px) brightness(0.6)' }}>
          <TableView source={source} depth={depth + 1} />
        </div>
      )}
      <div ref={hostRef} style={{ position: 'absolute', inset: 0, visibility: 'hidden' }}>
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        <canvas ref={overlayRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
      </div>
      <canvas ref={cutRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', visibility: 'hidden' }} />
    </div>
  );
}

/** The storey of the frame a view of `depth` draws: the frame itself, or one of those below it. */
function frameAt(frame: PlayerFrame, depth: number): StoreyFrame | null {
  return depth === 0 ? frame : (frame.below?.[depth - 1] ?? null);
}

/** An SVG path of `polys` on screen, placed as the camera places the map (CSS px). */
function clipPath(polys: readonly Polygon[], cam: { centerX: number; centerY: number; zoom: number; rotation: number }, s: { width: number; height: number }): string {
  const a = (cam.rotation * Math.PI) / 180;
  const cos = Math.cos(a) * cam.zoom;
  const sin = Math.sin(a) * cam.zoom;
  const pt = ([x, y]: [number, number]) => `${(cos * (x - cam.centerX) - sin * (y - cam.centerY) + s.width / 2).toFixed(1)} ${(sin * (x - cam.centerX) + cos * (y - cam.centerY) + s.height / 2).toFixed(1)}`;
  return polys.map((p) => [p.outer, ...p.holes].map((ring) => `M${ring.map(pt).join('L')}Z`).join('')).join('');
}

function tracePolygons(g: CanvasRenderingContext2D, polys: readonly Polygon[]): void {
  g.beginPath();
  for (const p of polys) {
    for (const ring of [p.outer, ...p.holes]) {
      ring.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
    }
  }
}

/** Templates (clipped to what players may see) and pings (on top, the DM points somewhere). */
function drawOverlay(c: HTMLCanvasElement, f: PlayerFrame, cam: { centerX: number; centerY: number; zoom: number; rotation: number }, s: { width: number; height: number }, elapsed: number): void {
  const dpr = window.devicePixelRatio || 1;
  if (c.width !== Math.round(s.width * dpr) || c.height !== Math.round(s.height * dpr)) {
    c.width = Math.round(s.width * dpr);
    c.height = Math.round(s.height * dpr);
  }
  const g = c.getContext('2d');
  if (!g) return;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, c.width, c.height);
  if (f.templates.length === 0 && f.pings.length === 0) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.translate(s.width / 2, s.height / 2);
  g.rotate((cam.rotation * Math.PI) / 180);
  g.scale(cam.zoom, cam.zoom);
  g.translate(-cam.centerX, -cam.centerY);
  if (f.templates.length) {
    g.save();
    tracePolygons(g, f.fog.open);
    g.clip('nonzero');
    for (const t of f.templates) {
      const p = templatePath(t, f.map.grid);
      g.fillStyle = withAlpha(t.color, 0.22);
      g.strokeStyle = withAlpha(t.color, 0.95);
      g.lineWidth = 3 / cam.zoom;
      g.beginPath();
      if (p.kind === 'circle') g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      else {
        p.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath();
      }
      g.fill();
      g.stroke();
    }
    g.restore();
  }
  for (const p of f.pings) {
    const k = (p.age + elapsed) / 1600;
    if (k > 1) continue;
    for (let i = 0; i < 3; i++) {
      const kk = (k * 1.4 + i * 0.18) % 1;
      g.strokeStyle = `rgba(226,160,60,${1 - kk})`;
      g.lineWidth = 4 / cam.zoom;
      g.beginPath();
      g.arc(p.x, p.y, 14 + kk * 110, 0, Math.PI * 2);
      g.stroke();
    }
  }
}

function withAlpha(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : `rgba(255,255,255,${a})`;
}
