# Finished Objects: To Do

Implementation to-dos for `characters/garments.js` and `characters/dress-up.html`. This is not spec:
the spec is `VISUAL-DESIGN-FINISHED-OBJ.md`, and costs live in `WEARABLE-LOOK-VS-PERFORMANCE.md`.
Strike items through when they're done, with the date.

## Look

- [x] ~~**Relief depth and the stitch-size multiplier fight the per-weight stitch size.**~~ Done
  2026-09-27. Width, rows, thickness and depth each have their own driver now (spec §2b, "As
  built").
- [x] ~~**Tune by eye:** the knit look.~~ Done 2026-09-27 across the yarn weights, every crochet
  stitch and every hat: `stitchScale` 2.1, `relief` 1.8, `rim` 0.42. The spread came out at 1, so
  it was removed. `DEPTH` and `CRAFT` are unchanged.
- [ ] **Middle weights at 150px:** DK and worsted stitches are 1.5–2px there, just above
  `MIN_STITCH_PX` (1.5). They keep their relief, and are now the crowd's most expensive items (a
  fully dressed worsted crochet-puff lion was 108k triangles, and puff's denser sampling since
  makes a worsted puff sweater 44k on its own). Raising the threshold to 2px would drop worsted
  knit's relief. Judge with the page's "build for 150px".
- [ ] **Stitch size does crazy things to the accessories; they aren't scaled right.** Accessory
  sizes come from the fabric's thickness, which comes from the stitch size, so the stitch-size
  slider inflates them:
  - ~~pom-pom~~: done 2026-09-27. Sized from the skull, torso or shin (`POM_OF_*`). The hat's
    tassel and flower share its size, so they're fixed on hats too.
  - buttons: `thick × 1.4–1.8`
  - flower (scarf, shawl, sweater): `thick × 4`
  - tassel (shawl): `thick × 5`

  They probably want to size from the item and the body, with yarn weight at most a small factor
  (2026-09-27).
- [x] ~~**Stitch size vs yarn weight.**~~ Done 2026-09-27. The spread is compressed by
  `LOOK.spread` (0.8, not the square root proposed: neighbouring weights must stay apart), with
  super-bulky pinned. The page has "stitch size" and "weight spread" sliders.
- [x] ~~**Craft must read much more strongly.**~~ Done 2026-09-27: crochet is bumpy under every
  stitch, with taller rows and thicker fabric. Still to judge by eye.
- [x] ~~**Stitches follow craft.**~~ Done 2026-09-27: stockinette and linen stitch added, the
  per-craft lists are in `STITCHES_BY_CRAFT`, and the page's stitch menu follows the craft.
- [ ] **Fibre sheen** isn't modelled: every garment shares one material (spec §2b.4).
- [x] ~~**Tool size**~~ Done 2026-09-27: it drives fit and stitch size (`realWidth`, `madeItem`).
  It doesn't drive drape yet, which waits on the drape model below.
- [ ] **Tune `TOOL_SHARE`** (0.6, the tool's share of real stitch width against the yarn's) and the
  usual tools in `TOOL_MM`.
- [ ] **Drape:** find a cheap way to model it (spec §2b.4).
- [ ] **Hats' fit 1:** the beanie and the slouch are tuned (`size` in `HAT`); review the rest.

## Game integration

- [ ] **Layering: garments don't know about each other.** Each is fitted to the bare body, so a
  scarf's ends lying on the torso sink into a sweater worn under them, and a shawl over a sweater
  does the same. The old stiff-fibre stand-off hid this for scarves by accident; it was removed
  because the ends stood off the body. Fix: fit outer layers to the inner garment's measured
  surface (dress sweaters first, then measure the torso with them on).
- [ ] **Dress before the merge pass.** The game merges each joint's meshes into one per material
  family (felt, knit, eye), with `npc.js` `mergeCharacter`. Dressing a merged rig breaks:
  - **Hat fit:** the skull is found as the head's own sphere, which the merge bakes into the head's
    one felt mesh. Hats would fall back to a generic head size.
  - **Pressing the mane:** skull, muzzle, nose and mane are one mesh after the merge, so the whole
    head would count as a coat over the crown. The face gets pressed into the skull (the
    bucket-brim bug).
  - **Colour, if merged after dressing:** `paintGeometry` repaints every mesh from its material
    colour, wiping colourwork.

  **Not broken:** hiding eyes and ears. They are joints, so each keeps its own node through the
  merge. (Corrected 2026-09-27: this note used to say the merge baked the eyes into the head.)

  **Fix:** build un-merged, `dress()`, then `mergeCharacter()`, and teach `paintGeometry` to keep
  a mesh's existing colour attribute. A merged character can't be re-dressed in place, so changing
  clothes means rebuilding it or keeping an un-merged copy. Decide which when the game needs it.
- [x] ~~**Relief respects the geometry detail tiers.**~~ Done 2026-09-27 as on-screen size
  (`LOOK.viewPx`) rather than tier: relief under 1.5px a stitch isn't built.
- [ ] **The game sets `LOOK.viewPx`** to its real crowd size (150 is assumed), and to 0 for any
  close-up view.
- [ ] The rest of the spec's §6 (wear slots, catalogue types and costs). The rig's placeholder
  `scarf` is deleted outright (2026-10-02).
