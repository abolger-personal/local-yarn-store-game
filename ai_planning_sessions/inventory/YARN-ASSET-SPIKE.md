# Yarn assets — research spike

Scope: **performance, layout, and how much aesthetic definition a low poly count buys**, for the
seven yarn families. **Built** — see §7 for what shipped and what the build changed about §1–5.

Everything marked *measured* was computed in this repo against real three.js r160, not estimated.
Sources: `../DESIGN-DECISIONS.md` §4 (measured perf), `DESIGN-DECISIONS.md` §2–3 (instancing and
2.5D), `YARN.md`, `../P1-SPIKE-PLAN.md` (geometry families and variety axes).

---

## 0. First: the two specs disagree, and this spike is where it gets settled

| Doc | Date | Says |
| --- | --- | --- |
| `DESIGN-DECISIONS.md` §2 | 09-06 | Yarn is **seven 3D instanced geometry families**. Notions are billboards. |
| `YARN.md` | 09-08 | "Yarn as inventory is **still 2.5D** — a flat illustration facing the camera is cheaper than a model and is the only way the ink-outline look is affordable." |

`YARN.md` is the newer file and reverses the older decision. Today's request — "what aesthetic
definition can we get with **low poly count**" — is a 3D question, so the direction appears to be
turning back again. **Pick one deliberately.** Section 1 says the stated reason for the reversal
does not survive measurement, which is the main finding of this spike.

---

## 1. The performance premise behind "2.5D is cheaper" is wrong at this scale

`YARN.md`'s argument has two halves. The first is false here, and the second is already solved.

### "A flat illustration is cheaper than a model"

Not at 1000 items, and the project's own profile is what says so. From `../DESIGN-DECISIONS.md` §4:
draw submission is **~6%** of frame time; **node count (~20%)** and **unique material count (~11%)**
dominate. A billboard and a 200-triangle mesh are *identical* on all three: both are one
`InstancedMesh` — one node, one material, one draw call, at any item count.

The only axis they differ on is vertex work. Measured, with the real geometry builders:

```
triangles per item
family     chunky     low     med
ball           80     168     352
cake           96     144     192
skein         120     192     384
hank          100     168     320
cone           80     120     160
mini           64     120     192
booklet        12      12      12
band           20      28      36

the 1000-item ceiling, mixed shelf (82% carry a ball band):
  chunky   106k tris   + ink outline (inverted hull): 211k
  low      174k tris   + ink outline (inverted hull): 349k
  med      305k tris   + ink outline (inverted hull): 610k
```

> These are the **built** numbers, from `inventory/yarn-geometry.js` via `scratchpad/tm/yarncheck.mjs`
> — not the throwaway prototype this section was first drafted against, which came in ~20% lighter
> because it had no ball bands and an under-tessellated skein.

Set against what the project has **already measured itself running** (§4): the concept crowd view
hit 120fps at 264k triangles total — **of which 168k *was* the 1000 instanced yarn items.**

> Fully 3D yarn at the `low` tier costs **174k triangles for all 1000 items, against a scene
> already measured at 264k running 120fps — of which 168k was the yarn.** So low-poly 3D yarn lands
> within a few percent of the billboard yarn it replaces, at the same one draw call per family.
> `chunky` (106k) is *cheaper* than the billboards were, outline included.

Reproduce: `scratchpad/tm/polybudget.mjs`.

### "…the only way the ink-outline look is affordable"

This one was true when written and has since been solved — by this repo, for notions.
`DESIGN-DECISIONS.md` §7: *"Thickness comes from an edge pass, not geometry. A dark copy, grown
slightly and pushed behind the card… in ONE extra draw call for the whole field."*

That is an inverted hull. The identical trick on 3D geometry is one extra draw call per family and
costs the doubled triangle count in the table above (`low` + outline = 349k — the same order as the
264k already measured). The outline is not an argument for billboards any more.

### What the real constraint is instead

The tablet numbers in §4 (11–18 fps at 40 owls) are **fill-rate and shader bound, not vertex
bound** — and §4 says so explicitly: switching tessellation high→low at 40 owls moved frame rate
*not at all* while triangles dropped 4x.

So the lever that matters for yarn is **which fragment shader runs, and over how many pixels** —
not the poly count the request is framed around. Two consequences, and they point in one direction:

- A 3D ball covers **fewer** pixels than the alpha-tested quad that bounds it. Billboards are not
  a fill-rate win here; they may be a small loss.
- `MeshPhysicalMaterial` + `sheen` — which §4 names as *"one of the most expensive fragment shaders
  in three.js, and the entire art direction currently rests on it"*, still untested on device — is
  the actual risk. At 1000 items filling the screen it is the single largest one in the project.

**The interesting question is therefore aesthetic, not performance.** That is a good outcome: it
means the choice can be made on how it looks.

---

## 2. The vibe: five shading approaches

Ranked by fit for *cozy + cheap + 1000 items*. Fragment source length is a crude proxy for cost,
but the lights column is not a proxy — it is the difference between evaluating the light rig per
pixel and not. *Measured from `THREE.ShaderLib`, r160 (`scratchpad/tm/matcapcheck.mjs`):*

| Material | Evaluates lights | Instancing | Per-instance colour | Frag src |
| --- | --- | --- | --- | --- |
| `basic` | no | yes | yes | 1619 |
| **`matcap`** | **no** | **yes** | **yes** | **1506** |
| `toon` | yes | yes | yes | 1786 |
| `lambert` | yes | yes | yes | 1927 |
| `standard` | yes | yes | yes | 3987 |
| `physical` (sheen) | yes | yes | yes | 3987 |

### A. Matcap — the standout for this brief

Lighting baked into a small sphere texture, sampled by view-space normal. **No lights evaluated at
all** — the cheapest lit-*looking* option three has, and it confirms per-instance colour works, so
the whole OKLCH palette-jitter system survives intact.

Why it fits yarn specifically: a matcap is a *material portrait*. One 128px texture of a soft matte
wool ball — wide terminator, slight rim — and every instance inherits that read. It is the
claymation/plasticine look, which is about as close to "cozy" as rendering gets.

It also quietly retires the project's biggest open risk: **a matcap with a bright rim is a sheen
approximation for free.** The fuzz problem from §2 of the DDR ("fibre fuzz is a material property,
cannot vary per instance") becomes a matcap swap — mohair and cotton are two 128px textures, and
"fuzz tiers" becomes one instanced mesh per matcap, exactly the structure already proposed.

Costs: view-space shading ignores the room's lights, so a theme switch needs per-theme matcaps
(cheap — they are tiny). Objects far from screen centre shade slightly wrong; at diorama distance
on a shelf this is not visible.

### B. Toon / gradient ramp

`MeshToonMaterial` with a 2–3 step `gradientMap`. Responds to real lights, so it reacts to theme
and to the room. Pairs naturally with the ink outline already planned.

Reads as *storybook illustration* rather than *soft object*. Risk: hard bands across a sphere can
read as plastic. Wants a deliberately soft ramp to stay cosy. Cheaper than standard, not as cheap
as matcap.

Built: the ramp is biased toward the lit band (0.34 + 0.66·x^0.72) so the shadow reads as an
accent; an even split makes a round object look half in shadow, dramatic rather than cosy.
`NearestFilter` is required, or linear filtering smooths the steps back into a gradient.

### C. Baked vertex-colour AO, unlit

Bake AO/curvature into vertex colours at build time, render `basic`. No lights, no textures, tiny
memory. **This is the same trick already adopted for characters** (§4: *"three shared materials…
with colour moved into a vertex attribute"*), so it is a known-good path in this codebase.

Caveat specific to yarn: at low poly this pushes toward *flat/faceted* shading, which reads
geometric and hard. Wool is the opposite. Good for room and furniture; wrong instinct for the yarn
itself unless deliberately papercraft.

### D. `MeshPhysicalMaterial` + sheen — keep, but not for the shelf

Genuinely looks like fibre; it is the physically right answer and it is the current art direction.
It is also the untested device risk. **Split it by context** — the same move the DDR already made
for notion *scale* ("scale is per context, not per notion"):

| Context | Material |
| --- | --- |
| 1000 items on shelves | matcap or toon |
| The inspect popup `YARN.md` asks for | sheen — one object, close up |
| Finished-object portraits | sheen — rendered **once** offscreen, already the plan |

### E. Impostors — the honest bridge between the two specs

Render each 3D family once to the atlas offscreen, then draw billboards. The render-to-texture rig
already exists for finished-object portraits. Gets modelled form at billboard cost, and bakes the
ink outline in for free.

The catch is the orbiting camera: a single baked angle is the cardboard-cutout pivot the DDR
already warns about, and multi-angle (octahedral) impostors are real complexity. **Worth naming as
the compromise, not worth building first** — section 1 says the 3D it would be approximating is
already affordable.

---

## 3. The harder problem: six shapes that are all "round wound fibre"

This, not the poly count, is what will decide whether it looks good. Ball, cake, hank, skein, mini
and cone are all the same object at a glance. The DDR is already emphatic — *"different silhouettes
are what break clone-stamping, not different colours"* — and the species work applied exactly this
discipline. Six levers, cheapest first:

1. **Test them as silhouettes before modelling anything.** Render all six as black-on-white at
   64px. If they cannot be named at that size, no shading will rescue them. Decisive, and runnable
   before any asset work exists.

2. **Exaggerate the proportion axes past realism.** Ball = round and tall; cake = squat, wide, flat
   top; cone = tall triangle; skein = long horizontal twisted bone; hank = thin flat ring; booklet
   = hard-edged rectangle. Cartoon proportion is what makes them nameable at 40px.

3. **The ball band is the single largest readability win** and the DDR already reached this
   conclusion (*"a second family… keeps the band's colour independent of the yarn's, which is the
   entire readability win"*). A contrasting ring gives a second colour region, breaks the blob, and
   survives being tiny. One extra draw call per family.

4. **Orientation per family, which is free** — it lives in the instance matrix. Cones stand, cakes
   sit, skeins lie down, hanks hang. In a grid this reads strongly.
   The ball is slightly oblate (y × 0.92): a perfect sphere reads as a bouncy ball, a squashed one
   as something soft that has sat on a shelf. The booklet **stands**: the only hard-edged, planar
   item, it punctuates a shelf of round things. It takes no ball band (its cover is its label) and
   no yarn end.

5. **Winding direction as texture or normal, never geometry.** The strand direction is what says
   *yarn* instead of *ball*. At low poly this has to be shading; object-space direction in the
   shader can do it without a UV unwrap.

6. **The ink outline makes the silhouette do the work** — which is the entire point given lever 1.

---

## 4. Layout, against what is already built

The grid already carries the two things this needs, from the tilt and multi-layer work:

- Items already declare `w`/`h`/`layers`, and `catalog.js` already sizes yarn 1×1×1 → 3×3×3 by
  weight, with `place()` occupying the full height. A 3D family drops into that unchanged.
- The wall shelves are tilted 45°, so a shelf presents its stock face-on. **That favours 3D over
  billboards**: a Y-axis billboard on a tilted level either stays vertical (wrong — it ignores the
  tilt) or lies in the level plane (wrong — it is a card lying on a slope). A mesh has no such
  problem, and this is a *new* argument that did not exist when `YARN.md` was written.

Two open layout questions:

- **Footprint vs mesh bounds.** A 3×3 super-bulky ball is a 0.6u sphere in a 0.6u slot; adjacent
  balls will intersect. Either shrink the mesh inside its footprint (~0.9) or let them nestle,
  which arguably looks *better* for yarn in a basket. Needs eyes.
- **Stacking.** Spheres stacked in 2.5D layers float on each other's bounding boxes. Fine for
  cakes and cones (flat tops); wrong for balls. Cheap fix is a per-family stack inset.
- **Bulk-as-height vs the shelf gap.** Confirmed as a real clash once built — see §7.

---

## 5. Recommendation

1. **Go 3D low-poly at the `low` tier.** Measured at 174k triangles for all 1000 items, against a
   scene already measured at 264k/120fps, at one draw call per family. `chunky` is available at
   106k if a device needs it. Update `YARN.md`, which currently asserts the opposite on a cost
   basis that does not hold.
2. **Matcap first, toon as the alternate.** Both keep per-instance colour, so the palette system is
   unaffected either way. Matcap evaluates no lights and gets the soft-wool read closest for free.
3. **Keep sheen for close-ups only** — inspect popup and portrait rig, never the shelf.
4. **Do the silhouette test before modelling.** It is an afternoon and it decides the shape budget.
5. **Then measure on the tablet, not the throttled laptop.** §4's own rule: CPU throttling will
   never reveal fragment cost, and fragment cost is the whole question here.

## 6. Open questions for the player of this game

- Does matcap's flat, unlit-by-the-room look fight the *theme* system? Themes drive lights and env;
  a matcap ignores both. Per-theme matcaps solve it mechanically — is it still one shop?
- `YARN.md` wants "overwhelming variety… gradients, sparkle, fuzziness, ball bands". Gradients and
  sparkle are per-instance-able; **fuzziness is not**, and becomes a family/tier split. Is 2–3 fuzz
  tiers enough variety, or is mohair its own family?
- Does the flat-notion / 3D-yarn contrast still read as deliberate once yarn is genuinely 3D? The
  DDR argues it separates *tools* from *stock* at a glance. That argument gets stronger, not
  weaker — worth confirming with eyes.

---

## 7. Built — 2026-09-08

Three files. Two graduate, one does not, per the split at the top of `../P1-SPIKE-PLAN.md`.

| File | Status |
| --- | --- |
| `inventory/yarn-geometry.js` | **Graduates.** The seven families as procedural builders, in unit space, plus the ball band and the silhouette metric. |
| `inventory/yarn-look.js` | **Graduates.** The four shading modes, the generated matcap and toon ramp, OKLCH palette, fake vertex AO and the inverted-hull outline. |
| `inventory/stash-and-stuff.html` | **Throwaway.** The bake-off scene, GUI and instrumentation. |

### Using it

`inventory/stash-and-stuff.html`, folder **"yarn assets (spike)"**.

- **`1`–`5`** switch shading: matcap / toon / sheen / flat / **silhouette**.
- **`Y`** toggles the family row — one of each of the seven, all the same size, so the only
  difference between them is shape.
- **`N`** pulls back until one slot is ~64 CSS px, roughly what a shelved item occupies in play.
- **"the 1000-item wall"** does the sameyness check from `../DESIGN-DECISIONS.md` §4 in one click.

**The intended sequence is `Y`, then `N`, then `5`.** That is the silhouette test, and it is
deliberately hostile: white ground, no shelf, no grid, no shadows, no colour. If the seven shapes
cannot be named like that, no shading will rescue them on a busy shelf.

The overlay reports triangles, per-1000 extrapolation, and — while the family row is up — the
closest pair of families by proportion, which is the number the shapes were tuned against.

### What building it changed

Four things the write-up above got wrong, all caught by `scratchpad/tm/yarncheck.mjs`:

1. **The triangle counts were ~20% light.** The prototype had no ball bands and an
   under-tessellated skein. Real numbers are in §1; the conclusion is unchanged, but `low` now
   lands at 174k rather than under the 168k the yarn previously cost, so the honest comparison is
   against the 264k *scene*, not the yarn's share of it.

2. **The skein burst unit space** (0.53 wide against a 0.5 box), which would have mis-scaled it in
   every slot it ever sat in. This is exactly the failure mode the unit-space convention exists to
   prevent, and it was invisible until asserted.

3. **The mini-skein was a scaled skein, so it had identical proportions** — 0.038 apart on the
   aspect metric, i.e. the same object at shelf distance. `P1-SPIKE-PLAN.md` warns about precisely
   this ("must read as distinct, since these come in bundles") and a uniform scale cannot satisfy
   it *by construction*. Rebuilt stubby rather than small; the closest pair is now ball/cake at
   0.180.

4. **Ball-band placement was absolute**, so it floated above the families that do not reach the top
   of the unit box. Now a fraction of each family's own height.

### Still open

- **Nothing here has been seen.** No visual verification was possible from this side — the browser
  extension is unavailable, so every claim above is measured or structural, never "it looks good".
  The silhouette test in particular is a *judgement*, and the tooling only sets it up.
- **The matcap is generated, not painted.** Good for tuning, and a real painted matcap will beat it.
- ~~**`trueVolume` exposes a live layout conflict.**~~ **RESOLVED — see §12.** A 3×3×3 ball drawn at true volume is
  `3 × cell × 0.9` tall — **0.70 units** at the demo's default 0.26 cell — against a 0.22 shelf
  gap, so a bulky yarn goes straight through the shelf above it. Drawn at 2.5D layer height instead
  it is 0.13 and fits, but then a "3×3×3" ball is a pancake. The overlay warns whenever the current
  settings clash. **The 2.5D layer height and the slot pitch were never reconciled for yarn** —
  notions are flat so it never came up — and this is the substantive layout finding of the spike:
  either the shelf gap grows with the bulkiest yarn a display accepts, or bulk stops meaning
  height. §4 flagged the stacking half of this; the build turned it into a number.
- **Yarn is raycast directly** in the demo, which the perf rules forbid at 1000 items. Fine at
  demo scale, and noted in the HUD, but the production path must go back to slot-plane picking.

---

## 8. Visual feedback — 2026-09-08, first look

The first judgement of the built shapes on screen. Recorded before iterating, because this is the
only kind of evidence the rest of this document cannot produce.

### Keep

- **The fake sheen rim reads well at full strength (`1.0`).** This is the load-bearing result of
  the whole spike: the rim is what buys the sheen *look* without `MeshPhysicalMaterial`, and it
  works. §2's recommendation stands, and the case for keeping real sheen off the shelf gets
  stronger.
- **A medium-weight ink outline beats a hairline.**

Both are now the defaults (`mcRim` 1.0, `outlineWidth` 0.016).

### Fix

**The skein reads as a garlic knot.** Wanted: *a figure eight, or two twists like a stick
pretzel.* The current curve is a 3-cycle wobble on a closed ellipse — which is, fairly, a garlic
knot. A figure eight is the simpler and more honest primitive anyway: a real twisted hank is a
loop folded once and twisted, which is a lemniscate, not a trefoil. **Cheap** — it is one curve
function, no change to anything downstream, same triangle count.

**The hank just looks like a donut.** Options, in order of laziness:

1. **Cut it.** Down to six families. Costs the one silhouette asset it was carrying: it is
   currently the only family with a *hole* in its outline, which is worth real legibility.
2. **Drape it.** A hank hangs; it is not a rigid ring. Squashing it over an implied peg, or tying
   it in the middle into a soft figure-eight, keeps the hole and stops it being a torus.
3. **Merge it into the skein.** They are the same object, twisted or not — which is precisely why
   both read as "loop of yarn".

Recommend **2**, and cut to **1** if it still does not earn its place. Note that if the skein
becomes a figure eight, a *tied* hank starts to collide with it — so these two want deciding
together, not separately.

### Add

**A yarn end on every family** — one little ink detail: curled around the base, sticking up, or
drawn from the outline in under the ball band. This is a good instinct and it is *the* cheap
anti-sameyness lever left, because it adds a hand-drawn read that no amount of proportion tuning
can. Implementation is already sitting there: it is the **ball band mechanism again** — one more
instanced family, one matrix per yarn family, one extra draw call for the whole shop. Because the
inverted hull outlines whatever geometry it is given, a tail built as a thin tube gets its ink
line for free.

**Strand hatching, and it is cheaper than expected.** *Measured* (`scratchpad/tm/uvcheck.mjs`):
every family already carries UVs whose **`u` axis runs in the winding direction** —

```
family      along u   along v   longer axis
ball         3.121     1.504   u
cake         3.121     1.546   u
skein        2.316     0.827   u
hank         1.251     0.654   u
cone         1.935     1.367   u
mini         1.854     0.780   u
booklet      0.110     0.900   v    (a book, correctly not wound)
```

TubeGeometry runs `u` along the tube; Sphere, Lathe and Torus all run `u` around their axis. In
every case that is the direction yarn is wound. **So strands are iso-`v` lines on all six wound
families at once**, and hatching is a single modulation of `v` in the fragment stage:

- No UV unwrap, no texture, no atlas, no per-family code — just a frequency, plus a per-family
  multiplier if density needs to differ.
- One `onBeforeCompile` patch, the same technique `notions.js` already uses for the card gradient.
- Frequency should scale with the item's grid bulk, or a 3×3 ball gets three times the strand
  density of a 1×1 at the same world scale.

> This works with matcap and toon alike, since it modulates the diffuse term rather than the
> lighting. It does **not** come from the matcap — a matcap is view-space and knows nothing about
> the surface — which is worth stating because it is the obvious wrong place to try to put it.

### Bug found and fixed in the same session

**The ball band was coming out the same colour as the wool.** Root cause was not the band: the
matcap's *midtone* was painted wool-brown, and a matcap is multiplied by `instanceColor`, so every
object sampling it inherited that hue. The band was the visible symptom; the **entire OKLCH palette
was also being multiplied by brown**, which quietly undid the perceptually-flat lightness the
palette exists to provide.

Fixed at the root: the matcap midtone is now achromatic, so it carries *lighting* and
`instanceColor` carries *albedo*. Hue stays in the light and the shadow — a warm key and a cool
violet shadow — which is a property of the room, not of what the object is made of. Guarded by an
absolute chroma bound in `lookcheck.mjs`, not just a comparative one.

---

## 9. Iterated on the feedback — 2026-09-08

### Shapes

**The skein is a figure eight.** Gerono's lemniscate (`x = cos t`, `z = sin 2t / 2`), with the two
lobes lifted in antiphase so the strand crosses *over* itself in 3D rather than intersecting flat.
This is also the more honest primitive: a twisted hank is a loop folded once and twisted back, and
the crossing in the middle IS the fold. The previous 3-cycle wobble was a knot, which is a
different object — hence the garlic knot read.

Guarded by a check that samples the tube's spine and asserts it passes through the centre at two
different heights. That is the property that separates a figure eight from a knot, and it is not
visible in a triangle count.

**The hank is draped, not deleted** (option 2). Same torus, deformed per-vertex at build time — so
it costs exactly what the donut cost — with four changes: tapered narrow at the top where it hangs
and wide at the bottom where the strands pool, stretched long under its own weight, flattened into
a bundle rather than a ring, and **leaned back 25°**.

The lean is not decoration. Standing upright, a flat hank measured `0.75 / 1.00 / 0.09` against
the booklet's `0.76 / 1.00 / 0.12` — effectively the same object to the silhouette metric, hole or
no hole — and the check refused it. Leaning takes depth from 0.09 to 0.49, which is also just what
a hank does when you stand one on a shelf. Closest pair across the whole set is now ball/cake at
0.180.

> Worth noting: the first attempt at the drape burst unit space (1.22 tall), because the stretch
> was applied *on top of* a torus already sized to fill the box. The radii now include the stretch
> in their budget. Both of those were caught by assertions, not by looking.

### The yarn end

One curl of strand per family — one and a bit turns of a shrinking spiral, ~100 triangles.
Structurally it is the ball band again: **one more instanced family, one matrix per yarn family,
one extra draw call for the whole shop**. Because the inverted hull outlines whatever geometry it
is given, the tail gets its ink line for free, which is what makes it read as a drawn detail
rather than as modelling.

Placement is varied per family on purpose — out from under the band on a ball, up out of the centre
pull on a cake, trailing off the taper on a cone, off one lobe of the eight on a skein. A tail in
the same place on all seven would be one more thing making them look alike. The end takes the
*yarn's* colour, not the band's paper colour: it is the strand escaping the wind.

### Strand hatching

Built, and it cost one shader patch. Every wound family's `u` axis already runs in the winding
direction (§8), so strands are iso-`v` lines and hatching is `abs(sin(v * freq))` against the
diffuse term. No unwrap, no texture, no per-family code. Frequency and depth are on sliders; the
band and the tail deliberately do **not** get hatched — paper is not wound, and a single hatched
strand reads as a tiny rope.

It declares its own varying rather than using three's `vUv`, which only exists when a material has
a map — a matcap does not, so the obvious version works under toon and silently does nothing under
matcap.

### Shared pick and place

`inventory/pick-place.js`, used by both scenes.

Adding yarn to the demo surfaced a real divergence: `store.html` had grown the good version of this
mechanic — forgiving screen-space pick, snap onto the nearest slot an item actually *fits* in,
layer awareness throughout — while the demo still ran the one-plane, one-layer original it was
ported from. That was invisible while every item was a flat notion, and broke immediately once
items had heights: **a three-layer bulky ball, picked up off a stack, came back down flattened
into one layer**, in three separate places (`putDown`, the drop preview, and `tidyPlane`).

The module owns the *geometry* of picking, not either app's drag bookkeeping. Each scene supplies a
two-function adapter — how a level is positioned, and how tall an item is — which is genuinely the
whole difference between them (`store.html` tilts its levels 45°; the demo stacks them flat and has
live sliders for the gap). `placeItem()` exists specifically so the layer count cannot be dropped
again: `place(g, keys, i)` is a perfectly valid call that silently makes a tall item one layer
tall, and nothing fails until something stacks into the space it was not occupying.

`fullyExposed` moved from `characters/visit.js` to `inventory/grid.js` on the way: it is pure grid
occupancy, the player's pick needs the same answer the NPC does, and `inventory/` must not depend
on `characters/`. Re-exported from `visit.js`, so every existing caller is unchanged.

One difference kept deliberately: the demo resolves *which display* by raycasting its floor panels
rather than by the picker's nearest-plane `hoverTarget`. Its two displays are physically separate
(a shelf unit and a peg board on a wall) and its levels stack into the same screen area, so
occlusion is the right question there. `store.html` can use `hoverTarget` because its tilted levels
do not overlap on screen.

---

## 10. Second look — 2026-09-08

### Approved

Texture reads well on **skein, cake, cone, mini and ball** — so the matcap + rim + hatching
combination is settled, and with it the spike's central recommendation: *no `MeshPhysicalMaterial`
on the shelf.* The yarn end reads well on **skein and mini**.

### Cut: the hank

Draping it stopped it being a donut, but it never earned its slot. It is a loop of yarn standing
next to a skein, which is also a loop of yarn — and once the skein became a proper figure eight,
the two were telling the same story. **Six families.**

`drape()` was deleted with it rather than left unused. Cutting the hank also removes the shape that
was crowding the booklet on proportions, which is why it needed the 25° lean in the first place.

### Cut: the cone's yarn end

It read as weird, and there is a reason worth keeping: a mill cone is *machine-wound onto a spool*,
so a loose hand-curled end is the wrong story for that object. Its taper is already the detail that
distinguishes it.

### Fixed: the ball's yarn end was invisible

Not misplaced — **buried**. It sat at 0.66 of the ball's height on a 0.42 radius, and the ball
band is a cylinder of radius 0.53 spanning 0.31–0.61. The tail was inside it. Moved over the
crown, where a strand curling off the top reads well and clears the band in height.

This is a bug class worth guarding rather than a one-off, so `yarncheck.mjs` now asserts every
tail clears its own band — a detail nobody can see is the same as no detail. Writing that check
immediately caught *my own* over-strict version: it flagged the skein and the mini, which the look
says are fine. The band on a log wraps along **x**, so its half-length and its radius are measured
on different axes than a band on an upright ball; both of those tails sit beyond the *end* of their
band, which is why they show. The geometry was right and the check was wrong.

### Where the budget landed

Six families, 94% carrying a band:

```
  chunky   107k tris   + ink outline: 215k
  low      177k tris   + ink outline: 355k
  med      308k tris   + ink outline: 615k
```

Unchanged conclusion: `low` sits inside the 264k scene already measured at 120fps, at one draw call
per family.

---

## 11. Third round — 2026-09-08

### The cone's band, and a worse bug behind it

The cone's base *was* poking through: the band spanned y 0.030–0.230 at r 0.31, and the cone's foot
is r 0.34 flaring to 0.31 over its first 0.07. Raised and narrowed to span 0.23–0.33, where the
cone runs 0.275 down to 0.254.

Writing the assertion for that — *the item must not pierce its own band* — immediately caught two
more, and one was serious:

**The skein's figure eight was passing through itself.** The crossings are at `t = pi/2` and
`3pi/2`, and the lift was `sin(2t)`, which is exactly **zero** at both — so the two passes of the
eight were separated by precisely nothing and the tube intersected itself. It renders as a
plausible pretzel right up until it z-fights, which is why nobody caught it by looking. Fixed with
`sin(t)` (one lift per loop, at its extremes exactly where the crossings are) and a twist that
exceeds the tube radius, so the fold is a real over-under: separation 0.34 against a 0.25 diameter.

The skein and mini bands were then too small — an x-axis band wraps the whole *bundle* at the
crossing, where both passes stack, not the single tube.

> Note the shape of this: the band check was written for a cosmetic bug and found a geometric one.
> An invariant stated about two objects tends to be worth more than the case that prompted it.

### The ball band is matte paper — and it was nearly free

`makePaperMatcap()`: no rim (the rim IS the fake sheen), a duller highlight, and a tighter
terminator, because paper does not scatter light into itself the way fibre does. Keeps the warm key
and cool shadow, so it still *turns* — matte, not flat.

**Cost: one more 128px texture. Nothing else.** No extra draw call (the band already has its own
instanced mesh), no extra material slot (it already has its own material), no shader work, no
branch. This is the strongest argument yet for matcaps over a lit material: "a different surface"
is just a different *picture of a sphere*. Under `MeshPhysicalMaterial` the same request would mean
a second lit shader variant compiled and switched between.

### Skein footprint: 2x1

A skein is a log, and at 1x1 it was the same size as the mini-skein beside it — the exact
comparison `P1-SPIKE-PLAN.md` warns about. Footprint now lives with the geometry
(`familyFootprint`), since the shape is the reason it needs the room. Bulk grows the short axis and
adds the same to the long one rather than multiplying, so a bulky skein is 4x3 and not 6x3.

This exposed a latent bug: `paintYarn` scaled both horizontal axes by `item.w`. Invisible while
every yarn item was square; wrong the instant one was not.

### Varying strand count per yarn: cheap. Yes, do it.

One `InstancedBufferAttribute` of floats — the same mechanism as `instanceColor`. **Four bytes per
instance, one varying, no branch, no extra draw call.** Behind a `USE_HATCH_SCALE` define so a mesh
that supplies no attribute behaves exactly as before.

Driven by yarn weight, which makes it one of the few variety axes that is *physically* real rather
than decorative: a lace-weight ball genuinely carries far more, far finer strands than a
super-bulky one. Multipliers are inverse to bulk **and then some** (1.8 / 1.0 / 0.62), because a
bulky ball is also drawn three times larger — without the extra falloff its strands would still be
finer on screen than a lace ball's.

### The moire limit: real, computable, and NOT a window-size cap

There is a hard limit and it is Nyquist: the pattern completes `freq` cycles across `v`, and a
cycle needs 2 pixels to exist at all, ~3 to read as stripes rather than shimmer. So
`freq_max ~= (pixels the v axis spans) / 3`.

But **a single global cap is the wrong instrument**, and the numbers say why:

```
viewport  distance   slot px   bulk1 max   bulk3 max
   800      1.2        252        130         390
   800      6.0         50         26          78
  1180      1.2        371        192         575
  2400      2.5        362        187         562
```

In the **same window, in the same frame**, an item at 1.2 units tolerates 130 strands and one at
6.0 units tolerates 26. A global cap has to take the lower and throws away **5x the detail on
everything in the foreground** — and it would still be wrong the moment anything moved.

The fix is per-pixel, and it is two ALU: `fwidth(phase)` measures how much the pattern's phase
changes across *this* pixel, and the hatch fades toward its own average as that approaches the
Nyquist half-cycle.

```
distance   slot px   cycles/px at freq 26   fade
    1.0      446           0.038            1.00
    4.0      111           0.151            1.00
    8.0       56           0.301            1.00
   16.0       28           0.602            0.00
```

Correct at every zoom, window size, distance and per-instance frequency, with nothing computed on
the CPU and no cap to tune. This is the standard fix for procedural stripes and it is why the
answer to *"should we compute a limit from the window size"* is **no — compute it per pixel, where
the limit actually lives.**

### Auto-turn on drop, in the shared code

A 2x1 skein could not go on a one-column peg board, though the 1x2 obviously fits — the peg mask
makes every other column usable, so no two adjacent columns ever exist and a 2x1 has *no* legal
placement anywhere on that board. Making the player rotate first is asking them to run the search
by hand.

`nearestSlot` and `anySlot` now try the quarter turn too, and report `turned` with the swapped
footprint. Fixed in `grid.js`, so **`store.html` gets it as well** — it has 2x1 and 1x2 notion
packages and displays masked into odd shapes by the counter, so the same dead end existed there.

Two details that matter:

- The turn carries a **distance penalty** (0.6 of a slot) rather than being free. Without it a
  turned slot a hair nearer would win and things would spin as the pointer wandered. A turn should
  happen when it is *needed*, not when it is marginally closer.
- Applying a turn means **swapping the footprint and nothing else.** Adding 90 degrees of yaw as
  well is the tempting bug: every renderer derives drawn size from `slotRect(w, h)`, so the swap
  has already rotated it and the yaw would spin it back.

`store.html`'s `putDown` was still hand-rolling the placement `placeItem` now owns, so it would
have silently dropped the turn. It routes through the shared function now — which is the whole
point of having extracted it.

---

## 12. `trueVolume` removed — 2026-09-08

The demo's yarn was visibly stacking through itself. The grid was innocent: it had been reserving
`bulk` layers correctly all along. The renderer was drawing something else.

**Two disagreeing notions of "how tall".** `trueVolume` drew yarn at `bulk x cell` while the grid
reserved `bulk x boxHeight`, and a 2.5D layer is far shorter than a slot is wide:

```
bulk   reserved (layers)   drawn (true volume)
  1        0.042                 0.234
  2        0.084                 0.468
  3        0.126                 0.702
```

A bulky ball drew **3.2x the entire shelf gap** into 0.126 of reserved height. It grew straight up
through whatever was stacked above it and through the shelf itself.

`store.html` never had this bug for a simple reason: **it has only ever had one height function.**
So does the demo now — `itemTall = layers x boxHeight`, the same number the grid reserves. The flag
is gone rather than defaulted off; a second, disagreeing notion of height is the defect, not a mode.

Guarded by `scratchpad/stackfit.mjs`, which asserts the identity directly (a stacked item's base is
*exactly* the item below's top) and keeps the old formula around as a negative control, so the
regression is described rather than merely absent.

### The consequence, stated honestly

Drawn height is now the vertical grid pitch, and that pitch is deliberately shorter than the
horizontal one. A bulky ball is therefore not a cube:

```
shelfGap  headroom  boxHeight   bulk-3 yarn        ratio
  0.22       4        0.055     0.70 w x 0.17 h     0.24
  0.30       4        0.075     0.70 w x 0.22 h     0.32
  0.34       3        0.113     0.70 w x 0.34 h     0.48
  0.45       3        0.150     0.70 w x 0.45 h     0.64
```

**Correction (same session):** the first version of this claimed `shelf spacing` was the lever and
that `boxHeight` would follow it. It did not. `boxHeight` was an independent slider that was merely
*clamped down* when it exceeded the gap — so raising the gap raised the ceiling and left the height
exactly where it was, and the yarn did not change shape at all.

The two numbers describe one physical thing (how tall a slot of the O axis is), so only one of them
can be an input. `boxHeight` is now **derived**: `(shelfGap / headroom) * boxFill`, recomputed
whenever any of the three changes, and shown in the GUI read-only. `boxFill` is the knob that
survives — what fraction of the available pitch a layer occupies, for a stack with air in it.

Now `shelf spacing` genuinely is the lever. Trading a shelf
level for chunkier stock (headroom 3 at a 0.34 gap) roughly doubles the ratio, and is the honest
trade: the O axis of an NxMxO grid is a fixed pitch, so "how chunky is bulky yarn" and "how many
shelves fit on a wall" are the same decision.

This is the layout question §4 raised and §7 turned into a number. It is now a **tuning** decision
with a single lever, rather than two renderers disagreeing.

---

## 13. Why the yarn reads as a "palette" — 2026-09-08

Asked after playing with the matcap colours and finding they changed nothing about it.

**First, the matcap is a red herring, and correctly so.** Since §11 the matcap is achromatic: it
carries *lighting*, and `instanceColor` carries *albedo*. Colour knobs on the matcap cannot move
the palette, by design — that separation is what stopped the ball band coming out wool-coloured.

The palette comes from `yarnColor()`, and it is using **about 0.6% of the reachable colour volume**:

```
  hue        8 anchors x 18deg = 144deg of 360   -> 40% of the circle,
                                                    but in 8 disconnected islands
  lightness  0.69 - 0.79                         -> 10% of the range
  chroma     0.085 - 0.140                       -> 15% of the range
```

### Deliberate, but not the part you would expect

Palette-constrained *hue* is a decision from `../P1-SPIKE-PLAN.md`, in the user's own words:
*"the theme defines N anchor hues; per-instance colour is an anchor plus small jitter in OKLCH…
uniform-random hue destroys the pastel read instantly."* So that half is intentional and load-bearing.

**But the hue constraint is not what is causing the artifact.** Measured — std-dev of delivered
luminance across 4000 samples:

```
  as shipped                            0.0502
  free hue, same lightness/chroma       0.0508     <- +1%. The 8 anchors cost almost nothing.
  same 8 hues, free lightness/chroma    0.2148     <- 4.3x
```

Freeing the hue buys **nothing**. What flattens the wall is that **lightness and chroma are pinned
to a single point** — everything is a mid-pastel at L 0.74, C ~0.11. That was my implementation
choice, not a spec requirement: the plan constrains hue and says nothing about collapsing the other
two axes.

A real yarn wall is not one lightness. It has undyed cream and oatmeal, charcoal and black,
saturated jewel tones and pale washes — and *that* range, not hue count, is what makes it read as
stock rather than as a swatch card. It is also what `YARN.md` is asking for with "an overwhelming
variety of colors", which currently sits in tension with the palette rule.

### And the tone mapper eats two thirds of whatever variety survives

```
  free lightness/chroma, authored       0.2148
  the same, after ACES @ 0.55           0.0677     (32% survives)
```

So there are two causes and they compound: a deliberate constraint applied one axis too broadly,
and the same tone-mapping compression already noted at the end of §12's session (the palette
arriving ~2x darker than authored).

### The fix that satisfies all three documents

Keep hue palette-constrained (P1-SPIKE-PLAN), open up **lightness and chroma** (YARN.md's
"overwhelming variety"), and carve out the reserved `characterRange` band so NPCs still cannot
camouflage against the stock (`../DESIGN-DECISIONS.md` §5, "Anti-camouflage"). That last point is
the one that makes it safe: the reason to constrain lightness was never "make it all one
lightness", it was "keep merchandise out of the band the characters live in".

Not yet built — recorded as a decision to take.

---

## 14. Wide palette, and the vertical model rebuilt — 2026-09-08

### Palette: wide in lightness and chroma, still curated in hue

`yarnColor(rng, target, { spread })`. **0** reproduces the original tight pastel exactly (nothing is
lost); **1** is the range a real shop carries. Measured, 4.5x the delivered-luminance variety at
full spread.

- **Hue stays anchored.** P1-SPIKE-PLAN.md is right and it costs nothing (1%).
- **Lightness and chroma open up** — cream and oatmeal through charcoal, pale washes through jewel
  tones. This is the 4.3x, and it was the accidental restriction.
- **The `characterRange` is carved out.** Felted animals live at mid lightness and low chroma, so
  that box stays empty at every spread — which is what makes opening the rest safe rather than a
  camouflage regression. Asserted at spreads 0, 0.5 and 1.
- Curation returns later as *themes* or *box sets*, on top of a wide range rather than instead of one.
- **Three colour families, not one box.** Bold 45% (L 0.52–0.72, C 0.13–0.20), muted/heather 40%
  (L 0.52–0.78, C 0–0.07), pastel 15% (L 0.80–0.93, C 0.04–0.11). A real shop is mostly saturated
  mid tones and heathers, with pastels a minority; one box makes any light, slightly chromatic
  colour a pastel and the wall reads as Easter. garments.test.mjs holds the bold and pastel shares.
- **A colour inside `characterRange` is nudged to its nearer lightness edge, not re-rolled**, so the
  distribution stays even. Only low-chroma colours can collide, so a saturated yarn may sit at any
  lightness.

One thing the check found: **`oklch()` clips out-of-gamut channels at zero, and clipping a channel
rotates the hue.** At full spread, 83 of 2000 samples were landing more than 12 degrees off their
anchor — quietly breaking the one constraint that was supposed to be inviolable. `oklchClamped()`
now reduces *chroma* until the colour fits sRGB, preserving hue and lightness. A duller version of
the right colour is right; a clipped version is a different colour.

> The mutation test earned its keep twice here. A first version of the hue assertion used a
> 30-degree tolerance — but the anchors are at most 56 degrees apart, so *every possible hue* is
> within 30 of one and the test could never fail. It passed a mutant with the anchors removed
> entirely. Tightened to 12, matching the actual jitter.

### Skeins turning into donuts, and everything floating: one bug

Both came from scaling each axis independently to fill the slot box. The families do **not** all
fill the unit box — a skein is 0.44 tall, a cone is 1.00 — so per-axis scaling distorted each one
by a different arbitrary amount:

- *Donuts*: a flat figure eight stretched to fill a tall layer becomes a fat ring. Measured, the
  skein's height/length ratio varied **8x** across an 8x change in layer pitch. It should not vary
  at all.
- *Floating*: the same defect from the other side. A family whose unit height is 0.44 drew 44% of
  the height it had reserved, so whatever stacked on it sat on air.

Now: **one uniform horizontal scale from the footprint, and the layer count derived from the height
that produces** — rather than the layer count being assumed from bulk and the shape stretched to
meet it. A flat skein reserves fewer layers than a round ball of the same footprint, which is both
what closes the gap and what is physically true. Measured after: proportions vary **1.06x**, and
drawn height equals reserved height to within 1e-9 for every family at every bulk.

A useful side effect: **a ball is a sphere at any shelf gap now.** Raising the gap to make balls
round is no longer necessary, because size comes from the footprint rather than the vertical pitch.

### The vertical model, third and final version

This got rebuilt twice in one session, so the current shape, plainly:

```
layer pitch = cell * layerRatio        a FINE quantum (default cell/8)
headroom    = floor(shelfGap / pitch)  derived: how many layers fit under the next shelf
item layers = ceil(natural height / pitch)
```

The two rejected versions and why:

1. **`boxHeight` an independent slider, clamped down by the gap.** Raising the gap raised the
   ceiling and left the height untouched — the reported "nothing changes".
2. **`boxHeight = shelfGap / headroom`.** Moved, but quantised far too coarsely: a rounded shape
   fits no whole number of coarse layers, so it either overflowed its reservation (overlapping
   whatever stacked on it) or fell short (holding that thing in the air). A ball at pitch 0.15
   overshot by 15%.

A fine pitch makes the rounding error a couple of percent, and `ceil` plus a settle-*down* (never a
stretch) closes it exactly. Only one number is an input; `boxHeight` and `headroom` are both shown
read-only.

Two consequences worth knowing:

- **The shelf gap must exceed the tallest yarn.** A 3x3x3 super-bulky ball is ~0.70 with the
  uniform fit, so the demo's gap default moved to 0.78 (and 2 shelves rather than 3). Bulk is also
  clamped to what the shelf can take, and the overlay says so — better than `fits` silently
  omitting all the bulky yarn.
- **The peg board's reach became a distance, not a layer count.** A fixed "3 layers" was 0.098 once
  the pitch became cell/8 — shorter than every yarn item, so nothing could hang on the board at all.

---

## 15. Fourth look — 2026-09-08

### Still donuts, because fixing the self-intersection made them round

The §11 fix raised the skein's twist to 0.17 so the two passes of the figure eight would clear each
other. It worked, and it also made them **thicker in profile** — measured:

```
              before   after §11
  skein h/w    0.44      0.62
  mini  h/w    0.48      0.86      <- essentially a ball with a dent in it
```

A thick figure eight is a knot. So: build with enough twist to clear, then **squash afterwards**
(0.58 for the skein, 0.50 for the mini — harder, because a short shape at the same twist is
proportionally much rounder). Back to 0.36 and 0.43.

Squashing is the right lever specifically because it is **safe for the clearance at any factor**:
it scales the separation between the passes and the thickness of the tube by the same amount, so
their ratio is invariant. Only the twist and the tube radius can bring them back together. It is
also what the object does — a skein on a shelf is a soft bundle settling under its own weight, so
an elliptical cross-section is truer than a round one.

The band radii were retuned to match (a band sized for the unsquashed bundle stood off it like a
hoop), and the crossing assertion now measures separation against **the tube's actual thickness**
rather than a fixed epsilon, and covers `mini` as well as `skein` — a twist drop on the mini had
been going unnoticed because only the skein was checked.

### The palette: I measured the wrong thing

§13 concluded that freeing hue "costs almost nothing", on the strength of a measurement showing it
moved delivered-**luminance** spread by 1%. That measurement was answering the wrong question.

**Luminance spread cannot see hue coverage at all.** The thing a yarn wall is judged on is whether
you can pull a *rainbow* out of it, which is purely a coverage question — and eight islands of 18
degrees leave real holes: there is no yarn between 218 and 252 degrees, so no arrangement of any
number of items can make a continuous spectrum.

The hue arc now widens with `spread` too — +/-9 degrees at 0 (the curated palette, unchanged) out
to +/-23 at 1, where 8 anchors x 46 degrees tiles the circle with a little overlap. The anchors
still *bias* the distribution, so a mid-spread palette still feels chosen; nothing is unreachable.

Measured as the largest hole in the hue circle across 1000 items:

```
  spread 0.00   38 degrees      curated: real gaps, by design
  spread 0.50   24 degrees
  spread 1.00   10 degrees      a continuous rainbow is buildable
```

> Worth recording as a method note, not just a result: the earlier conclusion was measured
> honestly and was still wrong, because the metric did not contain the property being claimed. A
> number is only evidence for the question it actually answers.

---

## 16. The dark scene — 2026-09-08

Reported as: everything looks dark unless the matcap midtone is set to pure white. That is normal,
and it is a real defect rather than a taste setting.

**A matcap is a MULTIPLIER.** `MeshMatcapMaterial` does `diffuseColor.rgb *= matcapColor.rgb`, so
with per-instance colour the matcap's lit midtone is a *gain* on the albedo and belongs at ~1.0. A
mid-grey matcap is built for use WITHOUT per-instance colour. Used with one it is a silent
darkening, and the tone mapper then darkens again on top of that:

```
a mid pastel is authored at 73% lightness. What arrives:

  matcap midtone      exposure 0.55   0.75   1.00   1.30
  #b4b0ad (was)          39%    48%    56%    64%
  #f0ebe3 (now)          58%    64%    70%    74%
  #ffffff                62%    70%    77%    82%
```

`#b4b0ad` is 0.46 in linear — a 2.2x cut before ACES sees it. Setting it to white, as the user did,
is the right instinct and lands within a few points of correct.

**Two changes, because there were two compounding causes:**

1. **Matcap midtone `#b4b0ad` -> `#f0ebe3`.** Contrast now comes from the shadow side descending
   rather than the midtone sitting low, which is how a multiply-matcap is supposed to be built.
2. **Exposure 0.55 -> 0.95.** The old value was tuned when the shelf held nothing but ink-on-card
   notions, whose lightness lives in the illustration rather than in a palette. Yarn's comes from a
   palette, and 0.55 was throwing most of it away. Now exposed on the GUI.

Together a pastel authored at 73% arrives at ~73%, so the palette's lightness work survives to the
screen. This is the third and final part of the thread that started with the maroon warning colour
in §8: **every tone-mapping surprise in this project has been something multiplying albedo before
ACES gets to it.**

Guarded: `lookcheck.mjs` now asserts the lit midtone is above 0.72, with the old mid-grey kept as a
negative control, and separately asserts the shadow side still descends — a near-white matcap with
no shadow would be flat, which is the opposite failure.

### Yaw jitter, shared

`scatterYaw()` and `settleYaw()` now live in `pick-place.js` beside the rest of the placement
logic. They had drifted into three copies at three different amounts — 0.18pi in the shop, 0.22pi
for notions in the demo, and **0.5pi for yarn**, which is nearly a quarter turn and reads as dumped
rather than arranged. One number, one place, and yarn now gets exactly what notions get. Booklets
are the exception: they stand square to the shelf like books, with no jitter.

`settleYaw` accumulates rather than re-rolling, which is the property worth protecting: a thing
never lands quite as it was lifted, but repeated pick-ups must not erase an arrangement.

> `../DESIGN-DECISIONS.md` §5 specifies jitter *derived* from `hash(itemId, slotIndex)` so it is
> stable across reloads and needs no storage. Still stored per item; noted at the definition,
> worth doing when items get stable ids, and visually identical today.

---

## 17. Into `store.html` — 2026-09-09

The spike's whole purpose. The shop now draws real yarn instead of a box with a printed silhouette
on it, and the assets, the shading and the fit arithmetic all come from the same modules the demo
uses, so the two pages cannot drift apart on what yarn looks like.

What moved, and what deliberately did not:

| | demo | shop |
|---|---|---|
| families | 6 (`ball cake skein cone mini booklet`) | the 3 the catalog sells |
| footprint | from the GEOMETRY (`familyFootprint`, skein 2x1) | from `catalog.js` — a yarn's WEIGHT |
| layer pitch | `cell/8`, fine | `BOX_H` 0.055, coarse and already tuned for notions |
| colour | rolled per item | a fixed index the sim carries (`colorIndex`) |

Both footprint answers are right and they are right for different reasons, which is why `yarnFit`
now **takes the footprint as an argument** rather than deriving it. In the demo a skein needs two
slots so it cannot be mistaken for a mini-skein — a legibility fact about the shape. In the shop a
yarn's footprint is its weight, and `PATTERNS.md` reads units off it: a 1x1 lace ball is worth 1
unit toward a pattern and a 3x3 super-bulky is worth 9. Forcing either to adopt the other's rule
would have broken something real. There is no mini-skein in the shop, so nothing is confusable.

### `yarnFit` is now shared

Lifted out of the demo into `yarn-geometry.js` unchanged. Same lesson as `pick-place.js`: this is
the function that had the donut bug and the floating bug in it, and a second copy is how one page
gets the fix and the other keeps the bug.

### Layers are derived here too, and that has furniture consequences

The shop keeps `catalog.js`'s footprint but **not** its `layers`, which is weight-derived. Height
has to follow the SHAPE or a flat skein reserves a ball's worth of space and holds up whatever
stacks on it. Deriving it exposed the vertical clash §4 predicted, in the one place it actually
bites — a **tilted** shelf:

```
shelf gap 0.453, of which 0.283 is the ramp itself
usable clearance 0.170  =  3 layers        a pile takes 12
```

Only the air above the ramp can hold anything, and that is 0.17 units. So:

```
  shape/weight    layers   wall?  pile?        shape/weight    layers   wall?  pile?
  ball/fingering    3       yes    yes         cone/worsted      8       -     yes
  ball/dk           5        -     yes         cone/bulky       12       -     yes
  ball/worsted      5        -     yes         skein/fingering   1       yes   yes
  ball/bulky        8        -     yes         skein/dk          2       yes   yes
  cone/fingering    4        -     yes         skein/worsted     2       yes   yes
  cone/dk           8        -     yes         skein/bulky       3       yes   yes
```

**Left as it is, deliberately.** The wall takes fingering balls and skeins of every weight;
everything rounder or bulkier falls through to a table or the floor, which is what `addItem`
already does and is not a wrong outcome — big yarn in floor baskets is what a real shop looks
like. But *a wall of worsted balls is the iconic yarn-shop image*, and that needs `SHELF_CLEAR`
raised from 0.170 to about 0.280 (5 layers). The cost is the top shelf rising from 1.84 to 2.17
units against a 2.6 wall, and "top shelf at roughly NPC head height" was a tuned decision — so it
is one named constant with the numbers written beside it, not something to change unasked.

`PILE_HEADROOM` did have to move, 10 -> 12: a super-bulky cone is 0.66 units and nothing in the
room could hold it, so `fillStock` would re-roll it forever and the shop would come up quietly
short. Asserted now rather than trusted.

### Index === instance slot

The demo keeps a slot-allocation pass (`restage`) because its meshes are packed. The shop does
not: every yarn mesh is allocated at `CAPACITY` and indexed by the item's own index, exactly like
the notion boxes. It costs a few mostly-empty matrix buffers and some zero-scale instances the
rasteriser discards; it buys keeping `refresh(index)` a single number, which every pick, place and
NPC purchase in that file already assumes. A second numbering scheme there would have been a bug
farm for no measurable gain.

Unused slots are written as an explicit degenerate matrix rather than left as the zero-filled
buffer three.js allocates — an all-zero matrix has `w = 0` too, so it divides by zero in the
perspective step instead of collapsing to a point.

### Exposure: nothing to do, and the reason is worth writing down

The shop grades through ACES at **0.40**, against the demo's 0.95. Measured, a pastel authored at
73% arrives at 48% there — and the instinct from §16 says raise the exposure. Wrong here: the
shop's notion cards are *unlit* too, so they take the same 0.40 and arrive at 52%. Yarn at 48%
sits exactly in the room it is in. The §16 defect was the matcap midtone cutting albedo **before**
the grade; a grade applied evenly to everything is a look, not a bug. Exposure left alone.

### The palette, and a coverage measurement that finally measures coverage

`colorIndex` was 12 wide and indexed 12 hand-written hexes — the artificial-restriction complaint
from §13 in its most literal form. Now 48, addressing the OKLCH generator.

Widening the count alone was not enough, and the numbers say why. Largest gap anywhere in the hue
circle, worst of 8 seeds:

```
  48 colours, anchors rolled       103 degrees      more than a quarter of the circle, empty
  48 colours, anchors walked in order  52
  48 colours, hues PLACED on a jittered even grid   25
```

Walking the anchors barely helped, because the heavy tail comes from the jitter **within** each
arc, not from which arc gets picked. A caller that owns a whole fixed index does not have to
sample at all — it can place the hues and bound the gap by construction, which is what the shop
does now (`yarnColor(..., { hue })`). Lightness and chroma still come from the generator, so the
range and the `characterRange` carve-out are untouched.

One real bug fell out of measuring it: the arc at full spread was 46 degrees, chosen as "8 anchors
x 45, with a little overlap". That would be right if the anchors were evenly spaced. They are not
— the gaps run 54, 26, 36, 54, 44, 36, 54, 56 — so four holes survived, the widest 10 degrees of
blue-purple no yarn could ever be. The arc has to clear the **largest** anchor gap: now 58.

### What an NPC walks out with

Also real yarn now. Geometry is borrowed from the shelf's instanced meshes (building a fresh ball
per sale would leak one per sale); the material is cloned, because a held ball needs its own colour
while the shelf's comes from `instanceColor`. `syncCarried`'s teardown had to learn the difference:
it disposes the clone and leaves the shared geometry alone. Disposing that would blank the shelf.

### Guards

`scratchpad/storeyarn.mjs` and `scratchpad/storesmoke.mjs`. Seven mutations caught between them.
Three things they got wrong first, all the same shape of error — **a metric that does not contain
the property it claims to check**:

1. *Drawn height == reserved height* is a comparison of a value to itself, because any bug that
   derives the vertical scale FROM the reservation satisfies it. Unclamping `settle` and setting
   `ky` straight from `layers * pitch` both survived. The property with teeth is the **asymmetry**:
   yarn may be squashed to meet the grid and never stretched to fill it, so `ky <= k`.
2. That invariant then had to be swept across **pitches**. At the shop's 0.055 the clamp is dead
   code — `ceil` never overshoots by enough to stretch anything — so both mutations stayed inert
   and a shipped-pitch-only check passed while the invariant was gone. It goes live around 0.18.
3. The hue-gap guard scored 39 on the shipped seed and 103 on the next one along. Measured over
   eight seeds now. A coverage claim from a single sample is not a coverage claim.

Not verified: **any of it visually.** No browser here.
