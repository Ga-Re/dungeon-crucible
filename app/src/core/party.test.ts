import { describe, expect, it } from 'vitest';
import { keepUnknown, readDocument } from './documents';
import { missingPartyTokens, partyForNewScene, playerOfToken, presentCharacters, tokenFromCreature } from './party';
import { CampaignManifestSchema, CreatureSchema, type Player } from './sidecar';
import { SAMPLE_CREATURES } from '../sample/creatures';

const [thorin, lyra, wight] = SAMPLE_CREATURES as [typeof SAMPLE_CREATURES[0], typeof SAMPLE_CREATURES[0], typeof SAMPLE_CREATURES[0]];
const creatures = [thorin, lyra, wight];
let n = 0;
const opts = { at: { x: 500, y: 300 }, cell: 70, newId: (p: string) => `${p}-${++n}`, random: () => 0.5 };

const players: Player[] = [
  { id: 'p-anna', name: 'Anna', characterId: 'thorin-ironbeard', present: true },
  { id: 'p-ben', name: 'Ben', characterId: 'lyra-moonfeather', present: false },
  { id: 'p-cem', name: 'Cem', present: true },
  { id: 'p-dana', name: 'Dana', characterId: 'gone', present: true },
];

describe('creature ids', () => {
  it('an old creature file without an id gets the one its tokens use: the name as a slug', () => {
    const { id: _id, ...old } = thorin;
    const r = readDocument('creature', CreatureSchema, JSON.stringify({ ...old, name: 'Thórin Ironbeard', future: 1 }));
    expect(r.ok && r.value.id).toBe('thorin-ironbeard');
    // Unknown fields survive although the schema has a preprocess step.
    expect(r.ok && keepUnknown(CreatureSchema, r.raw, r.value)).toMatchObject({ id: 'thorin-ironbeard', future: 1 });
  });

  it('a rename keeps the id', () => {
    const r = readDocument('creature', CreatureSchema, JSON.stringify({ ...thorin, name: 'Thorin the Bold' }));
    expect(r.ok && r.value.id).toBe('thorin-ironbeard');
  });

  it('a campaign file without players has an empty list', () => {
    const r = readDocument('campaign', CampaignManifestSchema, JSON.stringify({ kind: 'campaign', schemaVersion: 1, name: 'X', activeScene: null, table: { diagonalInches: 55, widthPx: 3840, heightPx: 2160, inchesPerCell: 1, ppiCorrection: 1, rotation: 0 } }));
    expect(r.ok && r.value.players).toEqual([]);
  });
});

describe('party', () => {
  it('present players with a character that exists, in list order', () => {
    expect(presentCharacters(players, creatures).map((c) => c.id)).toEqual(['thorin-ironbeard']);
    expect(presentCharacters([...players, { id: 'p-e', name: 'E', characterId: 'lyra-moonfeather', present: true }], creatures).map((c) => c.id)).toEqual(['thorin-ironbeard', 'lyra-moonfeather']);
  });

  it('a token from a creature: monsters are numbered, characters keep their name; initiative d20 + Dex', () => {
    const t = tokenFromCreature(wight, 'w2', { x: 1, y: 2 }, 1, () => 0);
    expect(t).toMatchObject({ id: 'w2', name: 'Ash Wight 2', label: 'A2', kind: 'monster', creatureId: 'ash-wight', initiative: 1 + Math.floor((wight.abilities.dex - 10) / 2) });
    expect(tokenFromCreature(thorin, 't', { x: 0, y: 0 }, 3).name).toBe('Thorin Ironbeard');
  });

  it('place party adds only the characters the scene does not have, in a row', () => {
    const all = players.map((p) => ({ ...p, present: true }));
    const have = [tokenFromCreature(thorin, 'th', { x: 0, y: 0 }, 0)];
    const added = missingPartyTokens(all, creatures, have, opts);
    expect(added.map((t) => t.creatureId)).toEqual(['lyra-moonfeather']);
    expect(added[0]).toMatchObject({ x: 500, y: 300 });
    expect(missingPartyTokens(all, creatures, [], opts).map((t) => t.x)).toEqual([465, 535]);
  });

  it('a new scene: characters from the scene before keep HP and conditions; others are new', () => {
    const before = [{ ...tokenFromCreature(thorin, 'th', { x: 0, y: 0 }, 0), hp: 3, conditions: ['poisoned' as const] }];
    const all = players.map((p) => ({ ...p, present: true }));
    const party = partyForNewScene(all, creatures, before, opts);
    expect(party.map((t) => [t.creatureId, t.hp, t.x])).toEqual([['thorin-ironbeard', 3, 465], ['lyra-moonfeather', lyra.hp, 535]]);
    expect(party[0]!.conditions).toEqual(['poisoned']);
    expect(before[0]!.x).toBe(0);
  });

  it('the player of a character token', () => {
    expect(playerOfToken(players, { kind: 'pc', creatureId: 'lyra-moonfeather' })?.name).toBe('Ben');
    expect(playerOfToken(players, { kind: 'monster', creatureId: 'thorin-ironbeard' })).toBeUndefined();
  });
});
