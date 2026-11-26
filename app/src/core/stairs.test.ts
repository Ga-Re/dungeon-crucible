import { describe, expect, it } from 'vitest';
import { otherEnd, stairAt, stairsOn } from './stairs';
import type { Stair } from './sidecar';

const up: Stair = { id: 's1', x: 100, y: 100, w: 70, h: 140, to: 'first', dir: 'n' };
const higher: Stair = { id: 's2', x: 500, y: 0, w: 70, h: 70, from: 'first', to: 'attic', dir: 'e' };

/** Stairs between storeys (DC-026, E-44). */
describe('stairs', () => {
  it('lie on both of their storeys', () => {
    expect(stairsOn([up, higher], '').map((s) => s.id)).toEqual(['s1']);
    expect(stairsOn([up, higher], 'first').map((s) => s.id)).toEqual(['s1', 's2']);
    expect(stairsOn([up, higher], 'attic').map((s) => s.id)).toEqual(['s2']);
  });

  it('a point on a stair finds it, on its storey only', () => {
    expect(stairAt([up, higher], '', { x: 130, y: 200 })?.id).toBe('s1');
    expect(stairAt([up, higher], 'attic', { x: 130, y: 200 })).toBeNull();
    expect(stairAt([up, higher], '', { x: 90, y: 200 })).toBeNull();
  });

  it('lead to the storey at the other end', () => {
    expect(otherEnd(up, '')).toBe('first');
    expect(otherEnd(up, 'first')).toBe('');
    expect(otherEnd(higher, 'first')).toBe('attic');
  });
});
