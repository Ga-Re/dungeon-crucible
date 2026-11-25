import { describe, expect, it } from 'vitest';
import { countsOf, filterMaps, type CatalogMap } from './mapCatalog';

/** The map catalog (E-32, DC-117). */
const maps: CatalogMap[] = [
  { resource: 'library/crypt.png', name: 'Crypt', tags: ['undead'], region: 'Mountains', mapType: 'dungeon', used: true },
  { resource: 'library/inn.png', name: 'Inn', tags: ['town', 'Undead'], region: '', mapType: 'building', used: false },
  { resource: 'library/coast.webm', name: 'Coast', tags: [], region: 'mountains', mapType: 'region', used: false },
];
const names = (xs: CatalogMap[]) => xs.map((m) => m.name);

describe('map catalog', () => {
  it('filters by type, tag, landscape and use, any case', () => {
    expect(names(filterMaps(maps, { types: ['dungeon', 'region'] }))).toEqual(['Crypt', 'Coast']);
    expect(names(filterMaps(maps, { tag: 'UNDEAD' }))).toEqual(['Crypt', 'Inn']);
    expect(names(filterMaps(maps, { region: 'Mountains' }))).toEqual(['Crypt', 'Coast']);
    expect(names(filterMaps(maps, { used: 'unused' }))).toEqual(['Inn', 'Coast']);
    expect(names(filterMaps(maps, { used: 'used', tag: 'undead' }))).toEqual(['Crypt']);
  });

  it('the text: every word somewhere, also the translated type', () => {
    expect(names(filterMaps(maps, { query: 'gebäude' }, (t) => (t === 'building' ? 'Gebäude' : t)))).toEqual(['Inn']);
    expect(names(filterMaps(maps, { query: 'mount co' }))).toEqual(['Coast']);
  });

  it('counts values for the Browser, one spelling each', () => {
    expect(countsOf(['Mountains', 'mountains', '', 'Coast'])).toEqual([{ value: 'Coast', n: 1 }, { value: 'Mountains', n: 2 }]);
  });
});
