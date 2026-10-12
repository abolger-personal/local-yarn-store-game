# Inventory — Design Decisions Record

Yarn, notions, and how the player arranges them. Scoped to P1's original question: **what does
merchandise look like, and how does the player put it places.**

Written after the NPC spike, which produced measured evidence that changes several assumptions
here. Cross-references `../DESIGN-DECISIONS.md` (project-wide) and `../P1-SPIKE-PLAN.md`.

---

## 1. What the NPC spike proved that applies to merchandise

The character work was profiled under 20x CPU throttle. Three findings carry directly over:

| Finding | Consequence for merchandise |
| --- | --- |
| Draw submission is only **~6%** of frame time | A draw call budget is the wrong thing to optimise |
| Node count (`projectObject`, `updateMatrixWorld`, `sort`) is **~20%** | **Every item that is an `Object3D` costs, whether visible or not** |
| Unique material count is **~11%** | Items must share materials; colour belongs in an attribute |

> The 1000-item yarn wall in the crowd view already cost **one draw call and one node**, because it
> was a single `InstancedMesh`. That was the cheapest thing in the entire scene, and it stayed
> cheap while characters ate the budget.

**The plan's original worry was backwards.** It treated the 1000-item ceiling as the risk and
characters as incidental. Measurement says merchandise is nearly free and characters are expensive.
The design note that already said *"the real risk at 1000 items is visual sameyness, not
performance"* was right, and is now proven rather than asserted.

---

## 2. Decision: merchandise is instanced, one `InstancedMesh` per geometry family

**Seven 3D families** (skein, ball, cake, hank, cone, mini-skein, booklet) plus **one billboard
family** for every notion, covering the entire shop — eight nodes, eight draw calls, eight
materials, at any item count.

### Notions are not a geometry family

The spike plan lists notions as the eighth *geometry* family, with a distinct mesh per notion:
needles as cylinder pairs, hooks as a cylinder with a bent tip, buttons as short cylinders. Going
2.5D (section 3) makes all of that unnecessary. **Every notion is the same quad**; what distinguishes
a hook from a button is which cell of the texture atlas it samples.

That is a larger simplification than it first appears:

- **A new notion is content, not code.** Adding one means drawing an atlas cell. No modelling, no
  geometry function, no new instanced mesh, no code change at all.
- **The 30-item notions list in `LYS.md` stops being a modelling budget.** It becomes an
  illustration budget, which is a far cheaper unit of work and one that can be handed to an artist.
- **Anti-sameyness does not apply to notions.** The variety-axes system exists to stop a shelf of
  yarn looking clone-stamped. A hook is already not a button; notions are distinct by definition and
  need *legibility*, not jitter.

> **Silhouette still matters — it just moves to the alpha channel.** The plan's core principle,
> that different silhouettes are what break clone-stamping, holds exactly as before. The design work
> does not disappear; it moves from modelling to illustration.

Per-instance data that is free because it lives in the instance matrix or colour buffer:

- uniform scale jitter (±10%)
- non-uniform squash
- rotation jitter (±8°)
- palette-constrained OKLCH hue, via `instanceColor`

**Placing an item writes one matrix into a buffer.** It does not add a node, does not touch the
scene graph, and does not invalidate anything. This is also *why* the existing "never raycast items"
rule works — the items are not raycastable objects in the first place. Raycast the display's slot
plane, convert to UV, index the slot. That rule was written for performance; instancing makes it
structural.

### Two variety axes do NOT survive instancing

Both apply to the **yarn** families only; notions are unaffected.

1. **Ball band variant.** A contrasting paper ring is separate geometry. Options: a second instanced
   family (doubles skein draws to 2 — trivially affordable), or bake the band into the texture and
   vary it by UV offset per instance. **Prefer the second family**: it keeps the band's colour
   independent of the yarn's, which is the entire readability win.
2. **Fibre fuzz (`sheenRoughness`).** This is a *material* property. It cannot vary per instance
   without a custom shader. The variety-axes list in `P1-SPIKE-PLAN.md` assumes it can, and that is
   wrong. Options:
   - quantise fuzz into 2-3 tiers, one instanced mesh per tier per family (16-24 draws, still fine)
   - drop per-item fuzz and let fuzz be a *family* trait — mohair is a different family
   - `onBeforeCompile` to read fuzz from an instanced attribute

   **Decide during P1.** The cheapest honest answer is probably fuzz tiers, since mohair vs cotton is
   a silhouette-and-halo difference more than a roughness difference.

---

## 3. Decision: notions are 2.5D billboards, and the performance argument agrees with the art

The briefing already leaned this way on art grounds. The rendering evidence supports it strongly,
and one idea in particular is *only* affordable this way.

**The black ink outline is expensive in 3D and free in 2.5D.** In 3D it means either an inverted-hull
pass (doubles every notion's draws) or a post-process edge detect (an extra render target, which is
disproportionately costly on the tile-based GPUs in the target tablets). Baked into a billboard
texture it costs nothing at all.

Consequences:

- **One texture atlas for all notions**, sampled by per-instance UV offset. One material, one draw
  call for every notion in the shop.
- **Alpha-test, not alpha-blend.** Cutout avoids back-to-front sorting entirely and is markedly
  cheaper on tile-based hardware. An ink-outlined flat illustration wants hard edges anyway.
- **Sparkle / halo effects** are additive instanced quads: one more draw call for all of them.
- **"All gold"** is the cheapest option of the three — a single shared emissive material, no texture
  variation needed.

> Billboards must still be **instanced**. One `Object3D` per notion would reintroduce exactly the
> node-count cost that dominates the character budget.

### Which way does the card face — decide in P1

The game is an **orbiting diorama**, so the camera moves and this choice is visible:

| Mode | Behaviour | Suits |
| --- | --- | --- |
| Full billboard | always faces the camera | floating, carried, or UI-ish items |
| **Y-axis billboard** | rotates only about up, stays upright | items standing on a shelf |
| Fixed card | no rotation at all | items lying flat, seen from a limited arc |

A full billboard on an item resting on a shelf looks wrong as the camera orbits — it pivots in place
like a cardboard cutout. **Y-axis is the likely default**, with fixed cards for anything lying flat.

Built: each notion is a box, for volume, with the illustrated card as a label flush on its forward
face (standing, like a product on a shelf) and a second copy lying flat on its top, so it reads both
from the side and from straight above.

### Flat notions next to 3D yarn is a feature, not an inconsistency

The briefing asks for notions to read "as if they are an ink drawing". Sitting flat, outlined and
stylised among fully modelled yarn is exactly that read. It also does useful work: it separates
*tools* from *stock* at a glance, without a UI element saying so.

---

## 4. Held notions: the rig data the briefing was missing

A held notion follows a hand and therefore **cannot be instanced** — it is a real mesh parented to a
joint. At the design target of ~10 concurrent NPCs that is ~10 extra meshes, which is negligible.
This is a genuine exception to section 2, not a contradiction of it.

The character rig as built supports most of what the briefing asks, with three gaps:

**The rig has two hold nodes, and only one is used.** `leftHold` and `rightHold` both exist on the
skeleton, but `buildHeldItem` attaches to one hand. Knitting is two-handed. The held-item slot needs
to become `one-hand | two-hand | lap | none`.

**`clampArmOut` will fight two-handed poses.** The clamp exists to stop a pose driving the elbow
inside the body, and it does that by forcing arms *outward*. Bringing both hands together in front of
the chest is the opposite motion. Either the clamp becomes pose-aware, or two-handed poses opt out of
it. **This will look like a bug when someone first authors a knitting pose.**

**A held billboard may not survive being held.** A camera-facing card in a hand pivots independently
of the hand holding it, which reads as detached. The likely answer is that held notions leave the
billboard family: the handful that matter get a small real mesh, or a fixed card oriented to the
hand rather than the camera. This is cheap either way — ~10 concurrent NPCs means ~10 held items —
but it means the shelf design and the held design are genuinely two different assets, which the
briefing already anticipated.

**Notion scale is per context, not per notion. DECIDED.** A notion carries a scale for each place it
can appear, and they are allowed to disagree:

| Context | Driven by |
| --- | --- |
| On a display | legibility at diorama distance — deliberately oversized |
| Player manipulating it | legibility and tactility, oversized is fine and probably better |
| Held by an NPC | looking right in a hand — usually the smallest of the three |

This removes the conflict rather than compromising on one number. The oversizing exists so the
player can see and grab things; an NPC holding a knitting needle the size of a fence post serves
nobody. Scale is a property of the *situation*, so it belongs with the situation.

> Worth watching for the transition: an item that visibly changes size when an NPC picks it up off a
> shelf. Either hide the change behind the pickup animation, or accept it as a cartoon convention
> — the game is already non-realistic about notion scale, so a second liberty is cheap.

### What the rig already gives us for free

- **Poses are species-agnostic and additive.** A pose is a delta on the species' rest state, so a
  "drop spindle" or "sitting at a wheel" pose authors once and works on owl, llama and everything
  after. This is what makes the briefing's per-notion-pose idea cheap.
- **Sitting works.** `hipFlex` plus `kneeBend` produce a seated pose, and grounding is computed from
  the leg chain, so a seated character rests correctly. A spinning wheel is therefore viable.
- **Ears, spine and hips are all animatable channels**, so a notion pose can carry personality
  (leaning in, ears perked) rather than just hand placement.

---

## 5. Open questions for P1

1. **Communicating notion attributes.** A 1mm and a 30mm crochet hook cannot be distinguished by
   silhouette at diorama scale. Non-diegetic number, an inspect panel, or colour coding? The project
   is committed to *mostly* diegetic UI, so this needs an explicit exception, not a drift.
   *Prototyped:* a crochet hook's size is a millimetre number printed on the box's side face,
   perpendicular to the front label. EU/metric only for MVP; US/UK/manufacturer sizing varies too much.
2. **Fuzz tiers vs family split vs custom shader** (section 2).
3. **Does a notion's pose belong to the notion or to the activity?** Knitting-with-needles and
   knitting-with-a-different-needle-size are the same pose. Suggests poses attach to *activities*,
   with notions declaring which activity they belong to.

---

## 6. What P1 should actually build

Back to the original scope — this is a merchandise and arrangement spike, not a character one.

1. **Seven 3D geometry families as instanced meshes**, with the variety axes applied per instance.
   The skein is the hero shape and deserves the most iteration.
2. **A display with a slot grid**, and placement by raycasting the slot plane rather than the items.
3. **The 1000-item wall**, checked for *sameyness* rather than frame rate — the perf question is
   already answered.
4. **A notion atlas** with 2-3 visual treatments (outline / gold / sparkle) to choose between, and
   the billboard facing mode settled against an orbiting camera.
5. **One two-handed held notion**, purely to surface the `clampArmOut` conflict early while it is
   still cheap to fix.

---

## 7. Build state — 2026-09-06

### Done

**Atlas pipeline** — `illustrations/notion_processing.py`. Bakes a default set plus per-theme
overrides into one atlas, a UV manifest, and a reviewable preview sheet. Three placeholder notions
exist (`crochet-hook`, `darning-needle`, `stitch-markers`) purely to exercise the path; they are
throwaway art.

**Placement mechanic** — `inventory/stash-and-stuff.html` and `inventory/notions.js`. Notions on a
slot grid, draggable between slots, with a green/red drop marker. Measured: **4 draw calls total**,
independent of notion count. Section 2's central claim is now demonstrated rather than argued.

### Decided while building

**Thickness comes from an edge pass, not geometry.** A dark copy, grown slightly and pushed behind
the card, delivers thickness *and* the ink outline in **one extra draw call for the whole field** —
because it shares the main field's instance attributes rather than maintaining a synced copy. A
fragment-stage gradient across the card adds form with no geometry at all. Billboards stay
billboards. Because labels stand flush on box faces, the outline copy is biased in the depth test
(`polygonOffset`) rather than pushed behind the card.

**Picking uses a plane at the card's mid-height, not the floor.** An upright card is drawn well
above its own footprint, so a floor hit test asks the player to click empty grid below the thing
they can see. Still one plane intersection, still O(1), still never raycasts an item.

**Picking is forgiving by design.** An ink drawing occupies a fraction of its slot, so an exact hit
test feels like the item is not where it looks. `pickSlot` falls back to the nearest occupied slot
within a grab radius. Click to pick up, click again to put down (press-and-hold is hard on the hands
for the core mechanic). Each occupied column is tested against its own plane at the item's middle
height, so a tall item is grabbable over its whole body. An exact hit wins (nearest the camera);
otherwise the nearest item within a **screen-space** grab radius (44 CSS px on touch, half for a
mouse) measured to the item's vertical axis, so the tolerance means the same at any zoom. Among near
misses the closest on screen wins, then the closest to the camera. Hovering to *read* uses the nearest
item box the ray meets, buried or not, so the visible edge of a lower item shows that item.

**Dropping.** A drop lands in the nearest slot the item actually *fits*, within 1.6 slots, never
"the cell under the pointer", which is often full, and a silent no-op reads as broken. Reach is in
slots, in the display's plane, so it does not drift with zoom. Footprints covering the pointer beat
ones that don't; among those the most centred wins (a 3x3 centres on the pointed cell, a 2x2 takes
the side the pointer is nearer). Each occupied column is aimed at as a solid block, floor to stack
top, so pointing at a tall item's top or front stacks onto it. The targeted level is the nearest one
whose lattice is under the pointer, with half a slot of slack past the edge so outer rows can be
aimed from outside. The "display is full" warning tries the quarter turn too, per item. An item set
back home whose column filled while it was in hand goes to the first free slot on its home display.

**Placeholder art shares the one atlas.** Yarn and pattern placeholder shapes are composited into the
notion atlas, drawn white so they recolour per instance: no extra draw calls.

> `GridHelper` only draws squares. On a non-square grid it silently draws the wrong pitch, so the
> player aims at lines that are not the slots. Use `makeGridLines`.

### Awaiting the next round of visual feedback

- thickness and outline settings (`edgeGrow`, `edgePush`, gradient) \u2014 all live in the GUI
- lying flat vs upright, now that upright picking works
- whether placeholder line weights are consistent enough to judge anything
- notion scale against slot size

### Yarn asset spike — 2026-09-08

The seven 3D yarn families are built: `inventory/yarn-geometry.js` (geometry) and
`inventory/yarn-look.js` (shading), compared live in `inventory/stash-and-stuff.html`. Full
write-up in [YARN-ASSET-SPIKE.md](YARN-ASSET-SPIKE.md).

**Section 2 of this document stands; `YARN.md`'s reversal of it does not.** YARN.md (09-08) says
yarn is 2.5D because "a flat illustration is cheaper than a model". Measured against the built
geometry, all 1000 items at the `low` tier cost **174k triangles** in a scene already running
120fps at 264k — at the same one node, one material, one draw call a billboard field costs. The
`chunky` tier (106k) is cheaper than the billboards it would replace, ink outline included. The
outline half of that argument is also gone: the inverted hull is the same trick section 7 above
already adopted for the cards.

**The real constraint is the fragment shader, not the polygon count** — which §4's own finding
(tessellation high→low moved frame rate *not at all*) already implied. So `MeshMatcapMaterial` is
the recommendation: measured from `THREE.ShaderLib`, it evaluates **no lights at all** while
keeping instancing and `instanceColor`, so the OKLCH palette system is untouched. A rim in the
matcap approximates sheen, which also collapses the section 2 "fuzz cannot vary per instance"
problem into a texture swap. Sheen stays, but only for close-ups: the inspect popup and the
portrait rig.

Two things the build corrected that the analysis alone had wrong: the mini-skein cannot be a
*scaled* skein (identical proportions read as the same object at shelf distance, which
P1-SPIKE-PLAN.md warned about and a uniform scale cannot satisfy by construction), and **bulk-as-
height clashes with the shelf gap** — a 3×3×3 ball at true volume is 0.70 units against a 0.22 gap.
That one is unresolved and is the substantive layout question the spike surfaced.

### Pick and place is now shared — 2026-09-08

`inventory/pick-place.js`, used by both `characters/store.html` and `inventory/stash-and-stuff.html`.
Extracted from the former, which had grown the better version while the demo still ran the original
it was ported from. The divergence was invisible while every item was a flat notion and broke the
moment items had heights: a three-layer bulky yarn, picked up and put back, returned as one layer,
in three separate call sites. `placeItem()` now carries the layer count so it cannot be dropped
again.

`fullyExposed` moved from `characters/visit.js` into `grid.js` — it is pure grid occupancy, the
player's pick needs the same answer the NPC does, and `inventory/` must not depend on `characters/`.
Re-exported from `visit.js`, so existing callers are unchanged.

Holding an item across displays: hovering onto another display activates it for the drop, with no
key press; hovering over dead space returns to the display it came from. An incidental switch
mid-hold never moves the camera; an explicit one (D, the dropdown, a fresh pick-up) recentres it. A
keyboard plane or display switch re-aims the drop at once. On a click the forgiving item pick runs
first; only if it finds nothing does the click select the display under the pointer.

### Yarn is in the shop — 2026-09-09

`characters/store.html` draws real yarn: the three shapes `catalog.js` sells, from the same
`yarn-geometry.js` / `yarn-look.js` the bake-off used, with the same matcap, ink outline, ball band
and strand hatching. `yarnFit` moved into `yarn-geometry.js` so both pages share the arithmetic
that had the donut and the floating bugs in it. Full write-up in `YARN-ASSET-SPIKE.md` §17.

Three things worth carrying forward from it:

- **Section 3's "flat notions next to 3D yarn is a feature" now has a picture.** It is real in the
  shop, not just in a demo, and it is the first time the two are side by side under one grade.
- **A tilted shelf has far less usable height than its gap suggests** — 0.170 of 0.453, the rest
  eaten by the ramp. That is what decides which yarn can go on a wall, and it is now one named
  constant (`SHELF_CLEAR`) rather than a hand-typed headroom of 3.
- **Section 4 (held notions) is half done.** An NPC carries the real ball out of the shop now,
  sharing the shelf's geometry and cloning only the material. The rig side of section 4 — a notion
  posed in the hand rather than a group tipped out of the fist — is still untouched.

### Not started

Held notions on a character (section 4) as specified — an NPC carries real yarn now, but through
the same tipped-group placeholder, not the rig work that section describes. And the 1000-item
sameyness check: the tooling exists (one button in the demo), but nobody has looked at it yet.
