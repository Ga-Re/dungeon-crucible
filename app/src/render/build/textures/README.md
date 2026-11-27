# Textures of drawn walls (E-33)

Pictures here are shipped with the app and used by `../textures.ts`. A slot without a picture gets a
generated pattern, so every slot is optional. File name = slot, `.webp` (preferred) or `.png`.

| Slot | What | Form |
|---|---|---|
| `wall-dungeon-stone` | top of a wall of cut stone blocks | square, seamless, ~512 px |
| `wall-cave-rock` | natural rock | square, seamless, ~512 px |
| `wall-brick` | brickwork | square, seamless, ~512 px |
| `wall-wood` | planks / palisade from above | square, seamless, ~512 px |
| `floor-dungeon-stone` | flagstone floor | square, seamless, ~512 px |
| `floor-cave-rock` | rough rock floor | square, seamless, ~512 px |
| `floor-brick` | cobbles / paving | square, seamless, ~512 px |
| `floor-wood` | floorboards | square, seamless, ~512 px |
| `part-cornerstone` | a corner stone from above | square, transparent background, ~256 px |
| `part-pillar` | a round pillar from above | square, transparent background, ~256 px |
| `part-door` | a closed door leaf from above, filling the picture, grain along its width | square, ~256 px |
| `cliff-rock`, `cliff-earth`, `cliff-scree` | faces of cliffs and slopes from above (E-34) | square, seamless, ~512 px |
| `growth-grass`, `growth-bush`, `growth-moss` | plants along the upper edge of cliffs | square, transparent background, ~256 px |
| `ground-grass`, `ground-snow`, `ground-sand`, `ground-ash`, `ground-swamp` | natural ground far from walls, after the biome (E-34) | square, seamless, ~512 px |
| `floor-carpet`, `floor-marble`, `floor-gravel`, `floor-dirt`, `floor-moss` | floors of their own for the floor brush (DC-107b) | square, seamless, ~512 px |
| `shore-reeds`, `shore-stones` | details along shores (E-35) | square, transparent background, ~256 px |
| `water-river`, `water-deep`, `water-foam` | water surfaces and foam (E-35; foam with transparency) | square, seamless, ~512 px |
| `cliff-band-<biome>` | the face of a cliff band seen from the front, strata running along it, per terrain biome (`temperate`, `dungeon`, `swamp`, `desert`, `winter`; E-87) | wide strip, seamless along its width, 1024 px wide |
| `terrain-ground-<biome>` | the ground of a terrain biome under and over its cliffs (E-87) | square, seamless, 512 px |
| `terrain-<biome>-<class>` | a ground class as the biome shows it (E-88): `grass`, `tallgrass`, `earth`, `rock`, `gravel`, `moss`, `leaves`, `paving`, `snow` – only where the biome has the class (Teil B §13.1) | square, seamless, 512 px |

A surface slot may bring **variants** as `<slot>.1.webp`, `<slot>.2.webp` … (DC-119a): the variant
sheets (`../variantSheet.ts`) lay them in patches over floors and ground, so large areas stop
repeating one picture. Variants should match their base picture in palette and scale.

Seamless surfaces are blended with themselves when loaded (`seamless`), so small seams are hidden.
Only pictures whose rights allow shipping them in this public repository belong here; record each
picture's origin in `docs/TASKS.md` (DC-107a).

## Origin

The eleven wall, floor and part pictures were generated for this project with Higgsfield (model Seedream 5.5) on
2026-11-26, on the DM's Higgsfield plan, which the DM confirmed allows shipping them in this public
repository. Pillar and corner stone were generated a second time to get a strict top-down view.
They were scaled to their slot size and converted to WebP; no third-party picture was used.
The six cliff and growth pictures and the five grounds were generated the same way on 2026-11-26 (DC-107d).
The three water pictures were generated the same way on 2026-11-26 (DC-107f).
The two shore pictures were generated the same way on 2026-11-26 (DC-107g).
The five floor-brush pictures were generated the same way on 2026-11-26 (DC-107b).
The 69 variant pictures (`*.1/2/3.webp` of all floors, grounds, walls, cliffs and water surfaces)
were generated the same way on 2026-11-26 (DC-119a).
The five cliff bands and five terrain grounds (E-87) were generated the same way on 2026-11-27 (DC-127, DC-128b) and
accepted by the DM next to a reference picture; the DM's plan allows shipping them here.
The 35 ground classes of the five terrain biomes, a variant of each but paving (laid stones in two sizes look wrong
side by side, DM 2026-11-27) and a variant of each terrain ground were generated the same way on 2026-11-27
(DC-128c) and accepted by the DM per biome.
