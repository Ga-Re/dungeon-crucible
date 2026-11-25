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

Seamless surfaces are blended with themselves when loaded (`seamless`), so small seams are hidden.
Only pictures whose rights allow shipping them in this public repository belong here; record each
picture's origin in `docs/TASKS.md` (DC-107a).
