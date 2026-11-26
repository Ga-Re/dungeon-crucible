/**
 * Stairs between storeys (DC-026, E-44): a rectangle at the same place on two storeys. A figure
 * set down on one is asked over to the storey at the other end. Pure.
 */
import type { Point } from './geometry';
import type { Stair } from './sidecar';

/** The stairs that end on `storey` ("" the map itself). */
export function stairsOn(stairs: readonly Stair[], storey: string): Stair[] {
  return stairs.filter((s) => (s.from ?? '') === storey || (s.to ?? '') === storey);
}

/** The stair under `p` on `storey`, if any. */
export function stairAt(stairs: readonly Stair[], storey: string, p: Point): Stair | null {
  return stairsOn(stairs, storey).find((s) => p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h) ?? null;
}

/** The storey at the other end of `stair`, seen from `storey`. */
export function otherEnd(stair: Stair, storey: string): string {
  return (stair.from ?? '') === storey ? (stair.to ?? '') : (stair.from ?? '');
}
