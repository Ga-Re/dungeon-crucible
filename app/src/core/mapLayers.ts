/**
 * Map and scene layers (decisions E-2, E-16, E-24).
 *
 * A library map holds the elements as built in the Map Forge: walls (with doors and windows),
 * areas, lights and sound sources. A scene uses the map and changes it only for itself:
 *  - `overrides` by element id: `{ hidden: true }`, or the fields that differ from the map;
 *  - `added` elements that exist only in this scene (e.g. a collapsed corridor).
 * State (a door open, a light on, a secret area discovered) is not part of the elements; the scene
 * keeps it separately.
 *
 * An override whose element the map no longer has is "orphaned": kept in the file, not applied,
 * reported. One that would make its element invalid is not applied either and reported likewise.
 *
 * Pure functions; inputs are never changed.
 */
import { z } from 'zod';
import { mapAreaSchema, mapLightSchema, mapSoundSchema, mapWallSchema } from './sidecar';

export type MapWall = z.infer<typeof mapWallSchema>;
export type MapArea = z.infer<typeof mapAreaSchema>;
export type MapLight = z.infer<typeof mapLightSchema>;
export type MapSound = z.infer<typeof mapSoundSchema>;

export interface MapElements {
  walls: MapWall[];
  zones: MapArea[];
  lights: MapLight[];
  sounds: MapSound[];
}

export type ElementOverride = { hidden: true } | Record<string, unknown>;

export interface SceneLayer {
  overrides: Record<string, ElementOverride>;
  added: MapElements;
}

export const EMPTY_LAYER: SceneLayer = { overrides: {}, added: { walls: [], zones: [], lights: [], sounds: [] } };

/** Fields that are scene state, not part of an element. */
const STATE_FIELDS = new Set(['open', 'on', 'discovered', 'level']);

const KINDS = [
  ['walls', mapWallSchema],
  ['zones', mapAreaSchema],
  ['lights', mapLightSchema],
  ['sounds', mapSoundSchema],
] as const;

function withoutState<T extends object>(el: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(el)) if (!STATE_FIELDS.has(k) && v !== undefined) out[k] = v;
  return out as T;
}

function isHidden(o: ElementOverride | undefined): boolean {
  return !!o && (o as { hidden?: unknown }).hidden === true;
}

export interface Resolved {
  elements: MapElements;
  /** Override ids whose element the map does not have (sorted). */
  orphaned: string[];
  /** Override ids that would make their element invalid (sorted). */
  invalid: string[];
}

/** The map's elements as this scene sees them. */
export function resolveElements(base: MapElements, layer: SceneLayer): Resolved {
  const baseIds = new Set<string>();
  const invalid: string[] = [];
  const out: MapElements = { walls: [], zones: [], lights: [], sounds: [] };
  for (const [kind, schema] of KINDS) {
    for (const el of base[kind]) {
      baseIds.add(el.id);
      const o = layer.overrides[el.id];
      if (isHidden(o)) continue;
      if (!o) {
        (out[kind] as unknown[]).push(withoutState(el));
        continue;
      }
      const { hidden: _h, id: _id, ...fields } = o as Record<string, unknown>;
      const next: Record<string, unknown> = { ...withoutState(el), ...fields, id: el.id };
      // `null` in an override removes an optional field the map has.
      for (const [k, v] of Object.entries(next)) if (v === null) delete next[k];
      const merged = schema.safeParse(next);
      if (merged.success) (out[kind] as unknown[]).push(merged.data);
      else {
        invalid.push(el.id);
        (out[kind] as unknown[]).push(withoutState(el));
      }
    }
    for (const el of layer.added[kind]) (out[kind] as unknown[]).push(withoutState(el));
  }
  const orphaned = Object.keys(layer.overrides).filter((id) => !baseIds.has(id)).sort();
  return { elements: out, orphaned, invalid: invalid.sort() };
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The scene layer that turns `base` into `current`: hidden elements, changed fields, added
 * elements. Orphaned overrides of `previous` are carried over, so nothing is lost silently.
 */
export function diffElements(base: MapElements, current: MapElements, previous: SceneLayer = EMPTY_LAYER): SceneLayer {
  const overrides: Record<string, ElementOverride> = {};
  const added: MapElements = { walls: [], zones: [], lights: [], sounds: [] };
  const baseIds = new Set<string>();
  for (const [kind] of KINDS) {
    const now = new Map((current[kind] as { id: string }[]).map((e) => [e.id, withoutState(e) as Record<string, unknown>]));
    for (const el of base[kind]) {
      baseIds.add(el.id);
      const cur = now.get(el.id);
      if (!cur) {
        overrides[el.id] = { hidden: true };
        continue;
      }
      const b = withoutState(el) as Record<string, unknown>;
      const changed: Record<string, unknown> = {};
      for (const k of new Set([...Object.keys(b), ...Object.keys(cur)])) {
        if (k === 'id') continue;
        if (!same(b[k], cur[k])) changed[k] = cur[k] === undefined ? null : cur[k];
      }
      if (Object.keys(changed).length > 0) overrides[el.id] = changed;
    }
    for (const [id, el] of now) if (!baseIds.has(id)) (added[kind] as unknown[]).push(el);
  }
  for (const [id, o] of Object.entries(previous.overrides)) if (!baseIds.has(id)) overrides[id] = o;
  return { overrides, added };
}
