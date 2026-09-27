# Finished-Object Look vs Performance

A living record of what each finished-object look choice costs. Most rows start as **estimates**
worked out from earlier measurements. As real tests run, update the row's status and add an entry to
the measurement log at the bottom. Never overwrite an estimate without leaving the number it replaced.

The look vocabulary itself lives in `VISUAL-DESIGN-FINISHED-OBJ.md` §2.

## 1. Baseline, measured

From `../DESIGN-DECISIONS.md` §4 (2026-09-06) and the rig as shipped:

- **Target is cheap tablets,** tested in Chrome DevTools at a **20x CPU throttle**. That throttle does
  not slow the GPU, so fill rate and shader cost need a real device.
- **The throttled frame is limited by submission, not triangles:** cutting triangles 4x did not move
  the frame rate.
- **Self time at 40 characters:** scene node count ~20%, unique materials ~11%, draw calls ~6%.
- **The merge pass** bakes each joint's static meshes into one mesh per material family (felt, knit,
  eye).
  - Characters went from 35 to **~15 draws** each.
  - Current kits with tails: lion 21, llama 19, owl 19.
- **40 characters ran at 35 fps** on `low` under throttle. The design target is ~10 at once, so there
  is roughly 4x headroom on the CPU side.
- **Sheen (`MeshPhysicalMaterial`) is one of three.js's most expensive fragment shaders** and has
  **never been measured on the target device.** Merchandise already moved to `MeshMatcapMaterial`,
  keeping sheen for close-ups only (`../inventory/DESIGN-DECISIONS.md`, 2026-09-08).

## 2. Cost per look choice

Status: **estimate** (reasoned from the baseline) or **measured YYYY-MM-DD** (with a log entry below).

| Choice | Cost | Notes | Status |
| --- | --- | --- | --- |
| Fine knit normal map | Small GPU cost | Wasted anyway: at 150px a sweater is ~30px wide, so fine stitches blur into grain. The felt normal map failed the same way: it read as granular stone (npc.js `feltMaterial`) | estimate |
| Big relief (ribs, cables, puff bumps) | More triangles only | Merges into the joint's existing mesh, so no extra draws or nodes. Must respect the geometry detail tiers, since triangles are what the tablet GPU feels | estimate |
| Hatching, as on the yarn | Nearly free | Already built: `inventory/yarn-look.js` `applyHatching` | estimate |
| Lace holes | Cut into the geometry | Cutout transparency (alphaTest) is slow on tile-based tablet GPUs; blended transparency also needs sorting | estimate |
| Knit sheen on worn garments | Garment pixels use the costly shader | Mostly covers felt that was already sheen, so it is roughly neutral. Overdraw is where a shell sits over the body. The sheen risk applies either way | estimate |
| Knit as its own material family | +1 draw per joint a garment touches | Long-sleeve sweater: chest + 4 arm segments = +5. Socks +2 (both lower legs). Hat, scarf, shawl, bag: +1 each | estimate |
| Ink outline (inverted hull) on worn items | Doubles each garment's draws | Plus a second copy of its vertices. Cheap on instanced shelf items, expensive per character | estimate |
| Rim highlight on garments | No draws | One extra shader variant of the knit material, shared by the cast | estimate |
| Lightness nudge for contrast | Free | Computed once at build time | estimate |
| Moving parts (scarf ends, trailing scarf) | +1 node and +1 draw each | Each needs its own joint. The tail set the precedent at +1 to +3. **Decided: scarf ends only**, so +1 or +2 on a scarf | estimate |
| Decor objects on shelves | ~1 draw and 1 node each | Every object has its own shape, so they can't share one instanced mesh the way yarn does. A few dozen placed wants `BatchedMesh`. Matcap is the cheap material | estimate |
| Per-character garment geometry | Memory and build time, not frame rate | Cache on quantised parameters, as the mane does (`scallopGeometry`) | estimate |
| Pattern 2D image | Negligible | One offscreen render when a pattern is inspected, cached | estimate |

## 3. Worst case: fully dressed (estimate)

All 6 slots worn, sweater with sleeves: about **+12 draws, ~33 per character**. Ten such characters
is **~330 draws**, still under the ~600 (40 characters × 15) measured at 35 fps. The CPU side has room.

**Decision (2026-09-26): no cap on worn items.** An NPC may show all 6 slots. Cap visible items, or
hide small ones on the low tier, only if the worst-case measurement in section 4 fails.

The unknowns that could break this:
- Sheen fragment cost on a real tablet.
- Any per-character ink outline.

## 4. Open measurements

- [ ] **Sheen:** fragment cost on the Android tablet. Knit sheen vs matcap on a garment-covered
  character, at `low` and `med`.
- [ ] **Outline:** cost per worn garment. Inverted hull on 10 fully dressed characters.
- [ ] **Decor:** decor objects at N placed (10 / 30 / 60), individual meshes vs `BatchedMesh`.
- [ ] **Relief:** triangle counts per detail tier for each relief texture, and frame rate on device
  at the fully dressed worst case.
- [ ] **Worst case:** confirm section 3's estimate under the 20x throttle.

## 5. Measurement log

Append entries; newest last. Give each one: the date, what was measured, the method (20x CPU
throttle / on device, which one / render scale / detail tier), the numbers, and which row in
section 2 it updates.

### 2026-09-26: garment triangle counts, headless (first build of `characters/garments.js`)

**Method.** Geometry counts only, no frame time. Measured with node on the lion at default proportions,
stitch size ×3 (the `LOOK.stitchScale` default). Relief does not yet respect the geometry detail
tiers: the counts are the same at every tier.

**Kilo-triangles per item:**

| Item | plain | rib or cable, fingering | worsted | super-bulky |
| --- | --- | --- | --- | --- |
| hat | 2.1 | 25.0 | 13.1 | 5.3 |
| scarf | 0.6 | 3.5 | 2.2 | 1.7 |
| shawl | 0.6 | 69.0 | 35.5 | 12.4 |
| sweater (long sleeves) | 9.3 | 44.0 | 26.3 | 14.2 |
| bag | 2.1 | 5.0 | 2.8 | 2.1 |
| socks | 6.1 | 18.3 | 12.5 | 8.0 |

**Fully dressed, cable, worsted:** 9 meshes (one per joint touched), **92k triangles**, against the
lion body's 77k at `high` detail.

**Updates section 2:**
- **"Big relief":** the cost is real. Relief more than doubles a dressed character's triangles, and
  fine yarn with rib or cable is the worst case. Plain stitches cost almost nothing.
- **"Knit as its own material family":** the draw estimate holds. Everything on one joint merges,
  so a full outfit is 9 draws, not 12.

**Follow-ups:**
- Relief must scale with the detail tier.
- Relief density could cap at what reads at 150px.
- On-device frame time is still to be measured.
