# Finished Objects: To Do

Implementation to-dos for `characters/garments.js` and `characters/dress-up.html`. This is not spec:
the spec is `VISUAL-DESIGN-FINISHED-OBJ.md`, and costs live in `WEARABLE-LOOK-VS-PERFORMANCE.md`.
Strike items through when they're done, with the date.

## Look

- [ ] **Relief depth and the stitch-size multiplier fight the per-weight stitch size.** Lowering
  the stitch size for a lighter yarn is undone by the other two knobs. This is still wrong
  (2026-09-27).
- [ ] **Stitch size vs yarn weight.** Proposed: keep the order but compress the spread (the square
  root of real gauge, with super-bulky pinned at today's ×3), and split the page's slider into
  "stitch size" and "weight spread". Waiting on a go-ahead.
- [ ] **Craft must read much more strongly:** crochet visibly bumpier and more open than knit (spec
  §2b.5).
- [ ] **Stitches follow craft** (spec §2b.5):
  - Add stockinette (today's `plain` for knit) and linen stitch.
  - Knit gets stockinette, rib, garter, seed, linen stitch and cable; crochet gets waffle, puff and
    lace.
  - The page's stitch menu should offer only the chosen craft's stitches.
- [ ] **Tool size** isn't modelled. It should drive fit, stitch size and drape (spec §2b.1).
- [ ] **Drape:** find a cheap way to model it (spec §2b.4).
- [ ] **Hats' fit 1:** the beanie and the slouch are tuned (`size` in `HAT`); review the rest.

## Game integration

- [ ] **Dress before the merge pass.** Hiding eyes and ears under a hat and pressing the mane only
  work on an un-merged rig; today the merge bakes the eyes into the head.
- [ ] **Relief respects the geometry detail tiers** (`WEARABLE-LOOK-VS-PERFORMANCE.md` §5).
- [ ] The rest of the spec's §6 (wear slots, catalogue types and costs, `scarf` default off).
