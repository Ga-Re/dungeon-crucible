import { describe, expect, it } from 'vitest';
import { rendererCanvas } from './gl-canvas';

/**
 * A canvas holds one WebGL context for its whole life, and a destroyed renderer loses it on
 * purpose. A view that sets up its renderer again (React StrictMode in the dev app, a TV view
 * whose source changes) must not reuse that canvas: the new renderer would start on the lost
 * context, where Pixi's shader check never ends and the page hangs.
 */
describe('a canvas of its own for each renderer', () => {
  it('is put into the host, filling it', () => {
    const host = document.createElement('div');
    const { canvas } = rendererCanvas(host);
    expect(canvas.parentElement).toBe(host);
    expect(canvas.style.position).toBe('absolute');
    expect(canvas.style.width).toBe('100%');
    expect(canvas.style.height).toBe('100%');
  });

  it('a second set-up gets another canvas, and the first goes with its renderer', () => {
    const host = document.createElement('div');
    const first = rendererCanvas(host);
    first.remove();
    const second = rendererCanvas(host);
    expect(second.canvas).not.toBe(first.canvas);
    expect([...host.children]).toEqual([second.canvas]);
  });
});
