# Inventory — Design Decisions Record

Yarn, notions, and how the player arranges them. Scoped to P1's original question: **what does
merchandise look like, and how does the player put it places.**

Written after the NPC spike, which produced measured evidence that changes several assumptions
here. Cross-references `../DESIGN-DECISIONS.md` (project-wide) and `../../P1-SPIKE-PLAN.md`.

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

Eight geometry families (skein, ball, cake, hank, cone, mini-skein, booklet, notions) means **eight
instanced meshes covering the entire shop** — eight nodes, eight draw calls, eight materials, at any
item count.

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

**Notion scale is contested between shelf and hand.** Notions are deliberately oversized so they read
on a shelf. At that scale, held, they may look absurd. Needs either a per-notion held-scale override
or an accepted single scale.

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
2. **Fuzz tiers vs family split vs custom shader** (section 2).
3. **Held scale vs shelf scale** (section 4).
4. **Does a notion's pose belong to the notion or to the activity?** Knitting-with-needles and
   knitting-with-a-different-needle-size are the same pose. Suggests poses attach to *activities*,
   with notions declaring which activity they belong to.

---

## 6. What P1 should actually build

Back to the original scope — this is a merchandise and arrangement spike, not a character one.

1. **Eight geometry families as instanced meshes**, with the variety axes applied per instance.
   The skein is the hero shape and deserves the most iteration.
2. **A display with a slot grid**, and placement by raycasting the slot plane rather than the items.
3. **The 1000-item wall**, checked for *sameyness* rather than frame rate — the perf question is
   already answered.
4. **A notion atlas** with 2-3 visual treatments (outline / gold / sparkle) to choose between.
5. **One two-handed held notion**, purely to surface the `clampArmOut` conflict early while it is
   still cheap to fix.
