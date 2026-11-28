/**
 * The canvas a renderer draws into, made for that renderer alone. A canvas keeps one WebGL context
 * for its whole life and a destroyed renderer loses it on purpose (Pixi frees the GPU that way).
 * Set up again on the same canvas, a renderer would start on that lost context – where Pixi's shader
 * check (`checkMaxIfStatementsInShader`) never ends and the page hangs. So views do not let React own
 * the WebGL canvas: they make one per renderer in a host element and remove it with the renderer.
 */
export function rendererCanvas(host: HTMLElement): { canvas: HTMLCanvasElement; remove: () => void } {
  // Made in the host's document: a panel may sit in a floating window.
  const canvas = host.ownerDocument.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
  host.appendChild(canvas);
  return { canvas, remove: () => canvas.remove() };
}
