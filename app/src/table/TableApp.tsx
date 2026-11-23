/**
 * Table window. Shows only validated PlayerFrames; everything else is black.
 * This module must not import DM-side state (src/app/*).
 */
import { useEffect, useRef } from 'react';
import { MAX_FRAME_AGE_MS, parsePlayerFrame, type PlayerFrame } from '../core/projection';
import { onFrame } from '../platform/bridge';
import { renderPlayerFrame } from '../render/frameRenderer';

export function TableApp() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const g = canvas.getContext('2d')!;
    let frame: PlayerFrame | null = null;
    let receivedAt = 0;
    let lastSeq = -1;
    let raf = 0;
    let stop: (() => void) | null = null;
    let disposed = false;

    void onFrame((data) => {
      const now = Date.now();
      const r = parsePlayerFrame(data, now, lastSeq);
      if (r.ok) {
        frame = r.frame;
        lastSeq = r.frame.seq;
        receivedAt = now;
      } else if (r.reason === 'invalid-frame') {
        // Unknown or broken data: drop the current picture immediately.
        frame = null;
      }
    }).then((un) => {
      if (disposed) un();
      else stop = un;
    });

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const now = Date.now();
      try {
        if (!frame || now - receivedAt > MAX_FRAME_AGE_MS) throw new Error('no fresh frame');
        renderPlayerFrame(g, frame, w, h, now - receivedAt);
      } catch {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.fillStyle = '#000';
        g.fillRect(0, 0, w, h);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      stop?.();
    };
  }, []);

  return <canvas ref={ref} style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', background: '#000', cursor: 'none' }} />;
}
