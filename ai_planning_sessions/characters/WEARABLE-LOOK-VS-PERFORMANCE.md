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
| Parts under a hat (eyes, ears, mane) | Saves draws; memory for a pressed copy | **Decided 2026-09-27.** Eyes and ears under the hat are not drawn. The mane and feather shell are pressed in on the CPU once at dressing (head and hat never move apart), into a per-character copy of the geometry. Nothing runs per frame, and shadows stay right. Rejected: cutting away pixels with `discard` (the same tile-GPU cost as lace cutouts). In the game this needs dressing before the merge pass: the merge bakes the skull and mane into one head mesh, so hat fit and the mane press can't find them. Eyes and ears are joints and can still be hidden (`FINISHED-OBJ-TODO.md`) | estimate |

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

### 2026-09-27: triangle counts after the yarn/stitch/craft model (`fabric()`, spec §2b)

**Method.** Same as 2026-09-26: headless geometry counts on the lion at default proportions, no
frame time. The model's defaults are `stitchScale` 3 for super-bulky and `spread` 0.8. Relief still
ignores the detail tiers.

**Kilo-triangles, hat / long-sleeve sweater:**

| Stitch | fingering | worsted | super-bulky |
| --- | --- | --- | --- |
| knit stockinette | 2.1 / 9.3 | 2.1 / 9.3 | 2.1 / 9.3 |
| knit rib | 7.5 / 33.3 | 5.0 / 22.9 | 3.1 / 14.7 |
| knit cable | 7.5 / 32.9 | 5.4 / 21.8 | 3.1 / 14.7 |
| single crochet | 6.0 / 27.0 | 4.3 / 19.8 | 2.7 / 13.9 |
| crochet puff | 5.4 / 24.6 | 3.8 / 18.4 | 2.7 / 13.6 |

**Updates section 2, "Big relief":**
- **Cheaper at the fine end.** The squeezed spread makes fine-yarn stitches bigger, so there are
  fewer of them. A fingering rib hat went from 25.0k to 7.5k; a fingering sweater from 44k to 33k.
- **Crochet now costs geometry everywhere.** Its bumps need segments under every stitch: a worsted
  single-crochet hat is 4.3k, against knit stockinette's 2.1k.

### 2026-09-27 (later): relief sampled per axis, crochet knots every two stitches

**What changed.** Each stitch now gets its own segment density along each direction, with at least
three samples per repeat of its pattern. Before, rows got 0.8 of the across-density whatever the
pattern. At exactly two samples per repeat a sine is sampled at its zeros: crochet's bumps peaked
at 0.18 of their depth at lace weight, and garter's ridges and linen stitch's dashes aliased the
same way. Crochet's knot now spans two stitches and two rows. Same method as the entry above.

**Kilo-triangles, hat / long-sleeve sweater:**

| Stitch | lace | fingering | worsted | super-bulky |
| --- | --- | --- | --- | --- |
| knit stockinette | 2.1 / 9.3 | 2.1 / 9.3 | 2.1 / 9.3 | 2.1 / 9.3 |
| knit rib | 4.0 / 15.8 | 3.8 / 15.2 | 3.3 / 13.5 | 2.7 / 11.8 |
| knit garter | 4.1 / 15.9 | 3.8 / 15.0 | 3.3 / 12.9 | 2.7 / 10.9 |
| knit cable | 5.1 / 23.1 | 4.4 / 20.2 | 3.5 / 15.2 | 2.7 / 12.0 |
| single crochet | 5.4 / 23.9 | 4.6 / 21.1 | 3.5 / 16.2 | 2.5 / 11.8 |
| crochet puff | 4.8 / 21.8 | 4.3 / 19.5 | 3.2 / 15.0 | 2.4 / 11.6 |

**Updates section 2, "Big relief":** cheaper again, and the relief now actually shows. Rib and
cable had been paying for rows their patterns never used: a fingering rib hat went from 7.5k to
3.8k. The worst case measured is now a lace single-crochet sweater, at 24k.

### 2026-09-27 (later still): rounder puffs and bigger lace holes

**What changed.** Two stitches, in crochet (both are crochet-only):
- **Puff** is now round, bricked pillows, 3 stitches by 3 rows, at 2 segments a stitch each way (was
  1). The old sharpened sine drew spikes.
- **Lace holes** are 1.8 stitches across (were 0.6), at 2.5 segments a stitch (was 2). Same method as
  above.

**Kilo-triangles, hat / long-sleeve sweater (crochet):**

| Stitch | lace weight | worsted | super-bulky |
| --- | --- | --- | --- |
| puff | 10.2 / 43.8 | 4.1 / 18.8 | 2.8 / 13.9 |
| lace | 12.8 / 47.3 | 4.9 / 21.1 | 3.1 / 14.8 |

**Updates section 2, "Big relief":** the fine-yarn corner is now the worst case. A lace-weight
sweater in lace stitch is **47k**, double the 24k worst case before; at worsted these cost about
what they did. That corner is exactly what relief-by-detail-tier (§4) is for. If it can't wait, cap
segments per item, or give fine yarn a coarser puff and lace.

### 2026-09-27: the tuned look, measured on screen, and relief built for the view size

**Method.** Same headless counts as above, on the lion at the tuned look (`stitchScale` 2.1,
`relief` 1.8). On-screen sizes assume the character is 150px tall (the lion is 0.987 units, so 152px
a unit).

**A stitch at 150px:**

| Yarn | lace | fingering | DK | worsted | bulky | super-bulky |
| --- | --- | --- | --- | --- | --- | --- |
| knit | 0.87px | 1.11px | 1.55px | 1.85px | 2.64px | 3.62px |
| crochet | 0.87px | 1.17px | 1.77px | 2.07px | 2.86px | 3.62px |

**Findings:**
- **The tuned size made fine yarn expensive.** A smaller `stitchScale` (2.1, down from 3) means
  more stitches. A lace-weight crochet-lace sweater went from 47k to **95k** triangles; a single-crochet
  one from 24k to 70k.
- **Below DK, textured items average 0.1–0.4 px² a triangle at 150px:** several triangles a pixel,
  which the GPU shades in 2x2 blocks. A stitch under ~1.5px can't show its pattern at all, so this
  was pure cost.

**Change:** garments are built for `LOOK.viewPx` (150 by default). A stitch under 1.5px there is
built as its craft's plain.

**Fully dressed lion (all 6 slots, long sleeves; 9 meshes either way):**

| Outfit | close-up | built for 150px |
| --- | --- | --- |
| lace-weight crochet lace | 292k | **21k** |
| lace-weight crochet puff | 291k | **21k** |
| fingering knit cable | 141k | **21k** |
| worsted knit cable | 84k | 84k |
| worsted crochet puff | 108k | 108k |
| bulky crochet puff | 72k | 72k |

**Updates section 2, "Big relief":**
- The fine-yarn worst case is gone at crowd size.
- The crowd's worst case is now the middle weights, whose stitches are just visible: worsted
  crochet puff, at 108k against the body's 77k. See the to-do list for the threshold call.
- Close-ups (the dress-up page, any zoomed view) still pay the full cost, and should set
  `LOOK.viewPx` to 0 only while zoomed.

### 2026-09-27: puff as poofs

**What changed** (spec §2b, "Puff stitch reads as poofs"). Puff's depth dropped from 0.9 to 0.5.
Its dome is now `(1 - d²) ** 1.5`, it has no crochet bumps, and it has 2.5 segments a stitch each
way (was 2). Same method as above, at the tuned look.

**Kilo-triangles, crochet puff, hat / long-sleeve sweater:**

| Weight | close-up | built for 150px |
| --- | --- | --- |
| lace | 39.9 / 113.7 | 2.1 / 9.3 |
| fingering | 27.2 / 80.0 | 2.1 / 9.3 |
| DK | 12.9 / 51.4 | 12.9 / 51.4 |
| worsted | 10.4 / 44.3 | 10.4 / 44.3 |
| bulky | 6.8 / 30.4 | 6.8 / 30.4 |
| super-bulky | 4.7 / 22.6 | 4.7 / 22.6 |

**Updates section 2, "Big relief":** the denser sampling is about 1.5x puff's close-up cost, at
every weight. At the crowd size, fine-yarn puff is still built plain. DK and worsted puff are now
the costliest items the crowd shows: a worsted puff sweater is 44k on its own, against the body's
77k. That sharpens the middle-weights threshold call on the to-do list.

### 2026-09-27: scarf stitches at their real size

**What changed.** Two bugs had drawn every scarf's stitches about as big as super bulky's:
- **Counted at the bunch:** stitches were counted round the bunched part at the neck, so the flat
  ends got a few stitches stretched across them. Now they're counted across the widest point.
- **Rows capped:** a sheet's rows were capped at 192. A textured stitch on a long scarf needs
  240–700 rows, so the pattern aliased along its length. The cap is now 768.

**Kilo-triangles, lion, long draped scarf, seed / cable:**

| Weight | close-up | built for 150px |
| --- | --- | --- |
| lace | 62.8 / 44.7 | 2.8 / 2.8 |
| fingering | 40.7 / 18.1 | 2.8 / 2.8 |
| DK | 24.1 / 14.3 | 24.1 / 14.3 |
| worsted | 19.0 / 12.7 | 19.0 / 12.7 |
| bulky | 11.3 / 10.0 | 11.3 / 10.0 |
| super-bulky | 7.2 / 8.3 | 7.2 / 8.3 |

Worsted cable used to cost 5.9k with the stitches drawn wrong. A trailing cable scarf is now 27.6k
(was 6.2k). At the crowd size, fine yarn is still built plain. DK and worsted scarves join puff
sweaters as the costliest items the crowd shows, which is more reason to settle the middle-weights
threshold on the to-do list.

