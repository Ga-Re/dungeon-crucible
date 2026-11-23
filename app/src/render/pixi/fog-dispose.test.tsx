import {
  Container,
  Graphics,
  Mesh,
  MeshGeometry,
  Sprite,
  Texture,
} from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { disposeFog } from "./fog-dispose";
import { drawLivingFog } from "./fog-living";

describe("disposeFog (T-165)", () => {
  it("frees the graphics contexts and own textures of a fog layer, never shared ones", () => {
    const layer = new Container();
    const cover = new Graphics().rect(0, 0, 10, 10).fill({ color: 0 });
    const open = new Graphics().rect(2, 2, 4, 4).fill({ color: 0xffffff });
    const nested = new Container();
    const inner = new Graphics().rect(0, 0, 1, 1).fill({ color: 0 });
    nested.addChild(inner);
    const own = Texture.from(document.createElement("canvas"));
    const soft = new Sprite(own);
    layer.addChild(cover, open, nested, soft);
    const contexts = [cover.context, open.context, inner.context];

    disposeFog(layer);

    expect(contexts.every((context) => context.destroyed)).toBe(true);
    expect(layer.destroyed && nested.destroyed && soft.destroyed).toBe(true);
    expect(own.destroyed).toBe(true);
    // Colour fills use the shared white texture: it must survive.
    expect(Texture.WHITE.destroyed).toBe(false);
  });

  it("frees a fade layer: the mesh's own texture, and what its layer frees when destroyed", () => {
    const layer = new Container();
    const target = Texture.from(document.createElement("canvas"));
    const source = Texture.from(document.createElement("canvas"));
    const geometry = new MeshGeometry({
      positions: new Float32Array([0, 0, 1, 0, 1, 1]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1]),
      indices: new Uint32Array([0, 1, 2]),
    });
    const freeGeometry = vi.spyOn(geometry, "destroy");
    layer.addChild(new Mesh({ geometry, texture: target }));
    // As the renderer's fade layer does for what PixiJS does not free with the mesh.
    layer.on("destroyed", () => {
      source.destroy(true);
      geometry.destroy();
    });

    disposeFog(layer);

    expect(target.destroyed && source.destroyed).toBe(true);
    expect(freeGeometry).toHaveBeenCalled();
    expect(Texture.WHITE.destroyed).toBe(false);
  });

  it("frees a living fog layer: its masks, order, geometry, shader and filter (T-245)", () => {
    const layer = new Container();
    const to = Texture.from(document.createElement("canvas"));
    const from = Texture.from(document.createElement("canvas"));
    const order = Texture.from(document.createElement("canvas"));
    const handle = drawLivingFog({
      from,
      to,
      order,
      maskSize: { width: 10, height: 10 },
      map: { width: 10, height: 10 },
      margin: 10,
      living: { quality: "medium", cellSizePx: 5, edge: 1.2, motion: 1 },
      opacity: 1,
      rootResolution: 1,
    });
    const [filter] = handle.mesh.filters;
    if (!filter) throw new Error("The living fog renders through a filter.");
    const freeFilter = vi.spyOn(filter, "destroy");
    layer.addChild(handle.mesh);

    disposeFog(layer);

    expect(to.destroyed && from.destroyed && order.destroyed).toBe(true);
    expect(freeFilter).toHaveBeenCalled();
    expect(Texture.WHITE.destroyed).toBe(false);
  });
});
