import { Graphics, type Container } from "pixi.js";

/**
 * Frees a fog layer completely (T-165): its graphics with their contexts (the geometry PixiJS
 * keeps for them), and the textures its sprites and meshes own. `Graphics.destroy` with an
 * options object leaves the context behind unless asked, and asking for textures too would
 * destroy the shared `Texture.WHITE` of colour fills – so graphics get `context` only, every
 * other node its own textures, children first, at any depth.
 */
export function disposeFog(node: Container): void {
  if (node instanceof Graphics) {
    node.destroy({ context: true });
    return;
  }
  for (const child of [...node.children]) disposeFog(child);
  node.destroy({ texture: true, textureSource: true });
}
