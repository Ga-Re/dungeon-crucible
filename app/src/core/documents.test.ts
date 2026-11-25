import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DOCUMENT_VERSIONS, ID_PATTERN, keepUnknown, newId, readDocument, slugId, type DocumentKind } from './documents';

const Wall = z.object({ id: z.string(), x: z.number(), open: z.boolean().optional() });
const Map = z.object({
  kind: z.literal('map'),
  schemaVersion: z.literal(2),
  name: z.string(),
  tags: z.array(z.string()).default([]),
  walls: z.array(Wall).default([]),
  grid: z.object({ cell: z.number() }),
});

const versions = { ...DOCUMENT_VERSIONS, map: 2 } as Record<DocumentKind, number>;
const migrations = { ...Object.fromEntries(Object.keys(DOCUMENT_VERSIONS).map((k) => [k, {}])), map: { 1: (d: Record<string, unknown>) => ({ ...d, name: String(d['title'] ?? 'x') }) } } as never;

describe('readDocument', () => {
  it('migrates older documents step by step, then validates', () => {
    const r = readDocument('map', Map, JSON.stringify({ kind: 'map', schemaVersion: 1, title: 'Krypta', grid: { cell: 70 } }), versions, migrations);
    expect(r).toMatchObject({ ok: true, value: { name: 'Krypta', schemaVersion: 2, tags: [] } });
  });

  it('refuses a document from a newer version instead of reading it partly', () => {
    const r = readDocument('map', Map, JSON.stringify({ kind: 'map', schemaVersion: 3, name: 'x', grid: { cell: 1 } }), versions, migrations);
    expect(r).toMatchObject({ ok: false, reason: 'newer', version: 3 });
  });

  it('reports broken JSON and invalid content', () => {
    expect(readDocument('map', Map, '{', versions, migrations)).toMatchObject({ ok: false, reason: 'json' });
    expect(readDocument('map', Map, '[1]', versions, migrations)).toMatchObject({ ok: false, reason: 'invalid' });
    const bad = readDocument('map', Map, JSON.stringify({ kind: 'map', schemaVersion: 2, name: 'x', grid: {} }), versions, migrations);
    expect(bad).toMatchObject({ ok: false, reason: 'invalid' });
    expect(bad.ok ? [] : bad.errors[0]).toMatch(/^grid\.cell/);
  });
});

describe('keepUnknown', () => {
  it('keeps unknown fields at every level, matching list elements by id', () => {
    const original = {
      kind: 'map', schemaVersion: 2, name: 'Old', tags: ['a'], plugin: { x: 1 },
      grid: { cell: 70, snapToHalf: true },
      walls: [{ id: 'w1', x: 1, material: 'stone' }, { id: 'w2', x: 2, material: 'wood' }],
    };
    const next = { kind: 'map', schemaVersion: 2, name: 'New', tags: [], grid: { cell: 80 }, walls: [{ id: 'w2', x: 5 }, { id: 'w3', x: 9 }] };
    expect(keepUnknown(Map, original, next)).toEqual({
      kind: 'map', schemaVersion: 2, name: 'New', tags: [], plugin: { x: 1 },
      grid: { cell: 80, snapToHalf: true },
      walls: [{ id: 'w2', x: 5, material: 'wood' }, { id: 'w3', x: 9 }],
    });
  });

  it('a known field the app leaves out stays out', () => {
    const out = keepUnknown(Map, { name: 'a', walls: [{ id: 'w', x: 1, open: true }] }, { name: 'a', walls: [{ id: 'w', x: 1 }] }) as { walls: object[] };
    expect(out.walls[0]).toEqual({ id: 'w', x: 1 });
  });

  it('without an original, writes exactly what it is given', () => {
    const next = { name: 'x' };
    expect(keepUnknown(Map, undefined, next)).toBe(next);
  });
});

describe('ids', () => {
  it('new ids are lowercase, prefixed and never taken', () => {
    const taken = new Set<string>();
    let n = 0;
    const seq = [0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    const random = () => seq[n++ % seq.length]!;
    const a = newId('wall', (id) => taken.has(id), random);
    taken.add(a);
    const b = newId('wall', (id) => taken.has(id), random);
    expect(a).toBe('wall-aaaaaaaa');
    expect(b).toBe('wall-ssssssss');
    expect(ID_PATTERN.test(a)).toBe(true);
    for (let i = 0; i < 100; i++) expect(ID_PATTERN.test(newId('area', () => false))).toBe(true);
  });

  it('slugs names', () => {
    expect(slugId('Asche von Vhal’Durn!')).toBe('asche-von-vhal-durn');
    expect(slugId('Ärger im Ödland')).toBe('arger-im-odland');
    expect(slugId('***')).toBe('item');
  });
});
