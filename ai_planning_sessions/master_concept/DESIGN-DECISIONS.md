# LYS (Local Yarn Store) — Design Decisions Record

Consolidated from the planning session of 2026-09-05. Source concept: [LYS.md](LYS.md).

This document records **what was decided and why**. Where a decision closes off an alternative,
the rejected alternative and the reason are recorded too — those are the notes that stop a
decision being silently re-litigated later.

---

## Glossary

Several early terms collided with standard software vocabulary. These are the settled names —
use them consistently in code, comments and docs.

| Term | Means | Does **not** mean |
| --- | --- | --- |
| **display** | Shop furniture holding an N×M grid of slots — wall display, table display, basket | A *test fixture*. `fixture` is reserved for test setup only |
| **Guestbook** | In-world book NPCs sign after completing a craft loop; holds signatures, tells and hints | A storage journal, WAL, or rollback journal. Never use "journal" for either meaning |
| **bulletin board** | In-world board surfacing recent Guestbook entries as Customer of the Week | — |
| **Formation Atlas** | Record of formations the player has discovered | Part of the Guestbook; it is a separate thing |
| **stash** | An NPC's hidden, immutable inventory | The player's Ravelry import — always say **"imported stash"** for that |
| **ball band** | The paper wrapper around a skein (real yarn term) | The palette's `characterRange` |
| **`characterRange`** | Reserved lightness/chroma range keeping NPCs visually distinct from merchandise | A ball band |
| **`itemCatalog`** | Baked item-definition data | A shop's product catalogue — no such concept exists, there is no money |
| **slot** | One position in a display grid | — |
| **floor pile** | The universal inbox: deliveries, donations and gifts all land here | A display. It has no slots, by design |
| **destash** | End-of-day removal of least-loved items | Selling. There is no money |

---

## 1. Inviolable constraints

These come from the original concept and should be re-read before any design change.

- **No money. No accounting. No shop-optimisation mechanics. Ever.**
  There is no currency type in the codebase. A "purchase" is a state transition that removes an
  item from a slot, nothing more.
- **The player cannot craft.** No crafting UI exists. The only player verb is *arrange*.
  NPCs craft, and only in response to arrangement.
- Statically hosted, browser-local storage, no server.
- The architecture must permit a "coffee shop" variant later.
- Notions render at deliberately **non-realistic (oversized)** scale — at real scale they are invisible.
- Cosy. No end goal, no pressure. Time does not advance while the game is closed.

---

## 2. Stack

| Layer | Choice |
| --- | --- |
| Renderer | three.js |
| Scene glue | `@react-three/fiber` + `@react-three/drei` |
| Post FX | `@react-three/postprocessing` |
| State | `zustand` (UI only); plain TypeScript for simulation |
| Build | Vite + TypeScript |
| Storage | `idb` (IndexedDB) — localStorage is too small |
| Tests | Vitest (headless) |

**Deliberately not used:**

- **Physics engine** — grid slots make it unnecessary.
- **Navmesh library** (recast etc.) — one rectangular room, so grid A* suffices.
- **ECS library** — premature at this scale.

Babylon.js was considered and rejected: heavier, and a smaller community in this genre.
Vanilla three.js was considered and rejected: drei's helpers (`AccumulativeShadows`,
`Environment`, `Instances`, camera rigs) each represent real work we would otherwise repeat.

---

## 3. Architecture

```
src/
  sim/     ZERO three.js imports. Headless, unit-testable. Enforced by an ESLint rule.
    rng.ts        sfc32 seeded PRNG; every random draw traces to worldSeed
    clock.ts      fixed 10Hz tick, day cycle
    catalog/      item definitions, Ravelry-shaped schema
    grid.ts       display slot model, occupancy
    formations/   JSON rule definitions + matcher + dirty tracking
    npc/          spawn, hidden stash, affinity, WIP, browse, purchase, craft queue
    supply/       floor pile, delivery schedule, destash selector
    guestbook/    signatures, observed tells, customer-of-the-week selection
    world.ts      aggregate state + reducers
    save.ts       IndexedDB, versioned + migrations
  render/  Reads sim, writes matrices. NEVER owns state.
    geometry/     procedural yarn-form builders
    ItemInstances.tsx, NpcInstances.tsx
    theme/        theme tokens -> materials / lights / env / postfx
    portraits/    offscreen render-to-texture for finished-object cards
    camera/       orbit + focus-on-display
  ui/      React DOM overlay: tray, day indicator, morning summary
           (Guestbook and bulletin board are DIEGETIC — in-world, not overlay)
  data/    baked JSON catalogs
scripts/
  harvest-ravelry.ts   Node-only, .env key, NEVER bundled
tests/
```

The `sim` / `render` split is the load-bearing decision. It makes formation rules and NPC
behaviour testable without a browser, keeps simulation work off the React reconciler, and is
what makes the performance rules below achievable. **Enforce it with lint, not discipline.**

---

## 4. Performance rules

Confirmed ceiling: **1000 items placed in the scene at once.** The catalog may be far larger.

**NPCs are two separate numbers, and conflating them was an early mistake:**

| | Count | Notes |
| --- | --- | --- |
| **Concurrent in shop (rendered)** | **~10** design target, ~20-30 technical headroom | A small LYS with 10 people in it is already busy. Headroom reserved for post-MVP events like Stitch'n'Bitch |
| **Remembered roster (simulated)** | **bounded by formations solved** | Permanent once the player solves a formation for them; everyone else ages out of an LRU-capped pool. Records hold hidden stash, affinity, WIP, relationships, last-visit day, scheduled returns |

**The roster is event-driven, not tick-driven.** Only in-shop NPCs tick. Everyone else is a record
with a scheduled return date, costing nothing until their day comes. This is what makes a few
hundred remembered NPCs free.

> The cap is a **design win, not just a performance one.** The tells mechanic depends on the player
> being able to watch an *individual* NPC and infer their hidden inventory. At 100 concurrent that
> signal drowns in noise. At 10, each visitor is legible — which is exactly what makes a koala
> memorable as a repeat customer.

1. Simulation state **never** in React state. Per-frame motion mutates matrices in `useFrame`.
   Putting NPC positions in React state means a re-render per NPC per frame.
2. Items and NPCs render via `InstancedMesh` grouped by shape family. Target **under 30 draw calls**.
3. `instanceMatrix.needsUpdate` only on dirty.
4. The formation matcher runs only on dirty displays.
5. **Never raycast items.** Raycast an invisible per-display slot plane, convert the hit UV to a
   slot index, then look up the occupant in O(1). Raycasting 1000 instances per pointer move is
   the single biggest performance trap in this design. Side benefit: hovering an empty slot works
   identically to hovering a full one, which placement needs anyway.
   *Exception:* the floor pile (≤ ~40 items) is its own small raycastable `InstancedMesh`.
6. **Items do not cast into the shadow map.** 1000 shadow casters roughly doubles draw cost and
   reads as noise at this scale. Only the room shell and displays cast. Items get baked AO plus
   fake contact-shadow quads.
7. `InstancedMesh` capacity is fixed at allocation. Allocate per family with headroom
   (`nextPow2`) plus a free-list with swap-remove repacking — **or** use `BatchedMesh`
   (three r168+), which also gives per-instance frustum culling. Decide after measuring.
   *For NPCs specifically, `BatchedMesh` is the likely answer:* 8-12 species × head/ears/tail means
   many distinct small geometries, and `InstancedMesh` needs one draw call per distinct geometry
   while `BatchedMesh` does not.
8. `InstancedMesh` frustum-culls as a whole, not per instance. Acceptable here: one room, orbit
   camera, most items on screen anyway. Revisit if first-person visit mode ships.
9. **Simulation side:** with only ~10 NPCs in the shop, a naive scan of 1000 items per NPC per tick
   is ~10k operations — survivable. But keep per-display attribute summaries as **bitmasks**
   (colour families, weights, categories present) anyway, invalidated by the same dirty flag the
   matcher uses. It is nearly free, it reuses machinery that already exists, and it keeps headroom
   for event scenes. An NPC filters displays by bitmask, then scans only the winning display's
   ~50 slots.
10. Per-instance colour via `instanceColor`. Per-instance *sheen* would need an instanced
    attribute plus `onBeforeCompile` — default to uniform sheen per family unless P1 proves otherwise.

Memory is a non-issue: 1000 × `mat4` = 64 KB.

> **The real risk at 1000 items is visual sameyness, not performance.**

### Measured, 2026-09-06 — concept crowd view

First real numbers, from `characters/crowd.html` with 14 procedural owls plus 1000 instanced yarn
items on an Apple-silicon laptop:

| | Measured | Note |
| --- | --- | --- |
| Frame rate | 120 fps | ~8.3ms of a 16.6ms budget, on fast hardware |
| Draw calls | **407** | ~29 per character, un-batched |
| Triangles | 264k | 168k of that is the yarn; **~6.9k per owl** |
| Geometries | 98 | 4 are unique *per owl* — the merged feather shells |
| Textures / programs | 3 / 9 | negligible |

**What this changes:**

1. **Triangles were never the problem.** Character tessellation at `low` detail is ~6.9k each; at the
   design target of ~10 concurrent NPCs that is ~69k total. The 1000-item yarn ceiling is likewise
   trivial — **1000 items cost ONE draw call**, because they are a single `InstancedMesh`.
2. **Draw calls are the entire budget, and characters own nearly all of them.** This inverts the
   assumption the plan was written under, where the 1000-item ceiling got the attention. Merchandise
   is free; characters are expensive.
3. **A per-scene draw call target is the wrong metric.** Profiling later showed draw submission is
   only ~6% of frame time; node count and unique material count dominate. Budget those instead.
4. **Per-character generated geometry blocks instancing.** Each owl built its own merged feather
   shells, so no two characters shared geometry. **Fixed:** feather settings are quantised to 8
   `FEATHER_PRESETS`, and shells are now built in **unit space** and scaled at the mesh — so a shell
   no longer bakes in one character's torso dimensions. Geometry count is now flat in owl count.
5. ~~**The win came from state changes, not draw calls.**~~ **RETRACTED.** This was measured with a
   zoomed-in camera, so most of the crowd was frustum-culled and never drawn. The tell was in the
   overlay the whole time: it read *12 draw calls per character* for characters that have ~35
   meshes. Quantised feather geometry is still worth keeping for memory and build cost, but it did
   not produce the frame rate gain claimed here.

> **Measurement rule: frame the whole scene before reading the overlay.** Culled objects are not
> drawn, so a zoomed-in camera silently reports a fraction of the real cost. Sanity-check
> draw-calls-per-character against the known mesh count before believing any number.

### Profiled, 2026-09-06 — where the frame time actually goes

CPU profile at 40 characters under 20x throttle, self time:

| Cost | Share | Scales with |
| --- | --- | --- |
| `projectObject`, `updateMatrixWorld`, `multiplyMatrices`, `sort` | **~20%** | Object3D **node count** |
| `refreshMaterialUniforms`, `setProgram`, `markUniformsLightsNeedsUpdate` | **~11%** | **unique material count** |
| `renderBufferDirect` | ~6% | actual draw calls |

**Draw calls were never the dominant cost.** Node count and unique materials were. Every character
carried nine materials that differed *only by colour* -- `sheen`, `roughness` and `sheenTint` are
not randomised, so the whole cast already agreed on them.

### Decision: merge static meshes, share materials, colour by vertex

1. **Merge pass.** Everything beneath one articulated node shares its transform, so it is baked into
   one geometry. Joint nodes carry `userData.joint`; everything else flattens into its nearest
   joint. It runs *after* the species kit, so kits need no knowledge of it.
2. **Three shared materials** for the entire cast -- felt, knit, eye -- with colour moved into a
   vertex attribute. Replaces ~9 materials per character.
3. **Switchable**, because the trade is per-character geometry that cannot be shared between
   characters. The species checker leaves it OFF so its material sliders still edit one character.

**Measured, 40 NPCs at 20x CPU throttle:**

| | Before | After |
| --- | --- | --- |
| Draw calls per character | 35 | **15** |
| Frame rate, `low` quality | 11-12 fps | **35 fps** |
| Frame rate, `high` quality | — | **23 fps** |

Roughly 3x, with no visual compromise. 40 characters is 4x the design target of ~10 concurrent NPCs.

### Verification standard — 20x CPU throttle

**Target hardware is cheap tablets, not laptops.** All performance claims are to be measured in
Chrome DevTools under **20x CPU slowdown**, not on unthrottled Apple silicon.

Two things this standard does NOT cover, and they must not be forgotten:

- **DevTools throttles the CPU only. The GPU runs at full speed.** A cheap tablet is fill-rate and
  memory-bandwidth limited long before it runs out of draw calls. Use the `render scale` control in
  the crowd view to oversample as a GPU-side proxy, and cap `devicePixelRatio` in production.

  **Confirmed 2026-09-06:** switching geometry detail high -> low at 40 owls under 20x throttle moves
  frame rate *not at all*, while the triangle count drops ~4x. That is the expected result, not a
  bug — detail changes triangles per draw (GPU) but not the number of draws (CPU). It is positive
  evidence that the throttled test is **CPU-bound on draw submission**.

  Two consequences: **(a)** the lever that matters is draw calls per character (~29), not
  tessellation — which is the argument for mesh merging and material sharing; **(b)** *never conclude
  "tessellation is free" from a throttled run.* That must be re-tested on the real device, where the
  GPU is actually weak.
- **`MeshPhysicalMaterial` with `sheen` is one of the most expensive fragment shaders in three.js**,
  and the entire art direction currently rests on it. Clearcoat on the eyes adds more. CPU throttling
  will never reveal this cost. This needs a real device test before the material choice is locked.

> A frame rate at or near 60/120 is a **vsync ceiling, not a measurement**. If a test reports the
> refresh rate, it proves only that headroom exists somewhere below it. Raise the load until the
> number moves, then record that.

### Measured on device, 2026-09-06 — Android tablet

40 owls, `high` detail. Not the target configuration (4x the NPC count at 4x the tessellation),
so treat these as worst-case stress numbers, not the budget.

| Configuration | fps |
| --- | --- |
| Real shadow map, characters casting | 11 |
| Characters not casting | 17 |
| **Blob shadows, at 20x CPU throttle** | **18** (vs 14 with real shadows) |

**Decision: characters do not cast into a shadow map. They get instanced blob shadows.**

The shadow map is a second full pass over every caster — roughly 29 extra draws per character,
plus re-transforming all their vertices. On a tile-based mobile GPU it is worse than that, because
the extra render target forces a tile resolve. Blob shadows replace all of it with **one instanced
draw for the entire cast**.

This composes with a decision already made: **the room shell is static**, so its shadows and AO can
be baked once. Between the two, the real-time shadow map can be removed from the project entirely.

Blob shadows are ellipses aligned to the key light's ground direction, not circles under each
character, and are offset along that direction. Shared orientation is what makes a crowd read as lit
by one lamp; per-character orientation reads as decals.

> Known limitation: blobs are placed at the character root, so they do not follow a leaning pose.
> Fixing that needs per-frame matrix updates, which gives back part of the win. Revisit only if it
> is visible in play.

### Graphics quality is a player-facing setting

**Decision: ship ONE "graphics quality" option with three tiers, persisted to storage.** Not three
separate technical switches — players do not have opinions about shadow maps and pixel ratios.

Each tier bundles the levers that measured as mattering, one per bottleneck:

| Tier | Tessellation | Render scale | Character shadows |
| --- | --- | --- | --- |
| Low | `low` | 0.75 | blob |
| Medium | `med` | 1.00 | blob |
| High | `high` | 1.00 | real shadow map |

Rationale for the split: **tessellation is GPU/vertex cost, shadow strategy is CPU draw cost plus a
tile resolve, and render scale is fill rate.** Those are three different bottlenecks, so a single
tier has to move all three or it will fail to help on whichever machine is limited by the one it
missed. Measured triangle count between `low` and `high` differs by **~10x**, so the tessellation
axis alone is worth more than first estimated.

Open questions, not yet settled:

- **Default tier selection.** Guessing from a user-agent string is unreliable. The honest options are
  to default to Medium, or to measure a few frames on first load and step down. Decide during P1.
- **Whether High ever earns its shadow map.** If baked room lighting plus blobs looks good enough,
  High may only differ by tessellation and resolution, and the real-time shadow path can be deleted
  entirely — removing a whole render pass from the codebase.

---

## 5. Core mechanics

### Placement — hybrid grid

Displays are N×M slot grids, so detection is cheap and deterministic.

**Jitter is derived, never stored:** `hash(itemId, slotIndex)` produces a small position offset and
a rotation of up to ±8°. Stable across reloads. This sells "hand-arranged" while keeping detection trivial.

### Camera

Orbiting diorama. First-person is deferred to a post-MVP "visit mode".

*First-person was considered and rejected for MVP:* you cannot read a spatial arrangement from eye
level, and the arrangement is the entire point of the game. A dual-mode compromise (walk freely,
dock to a display when arranging) was also considered and deferred.

### Formations — rules are data, not code

- A shape mask (relative slot offsets) plus a per-cell attribute predicate.
- Plus **gradient rules**: monotonic ordering of an attribute along an axis. This is what makes
  "sort your skeins by how pretty they are" an actual mechanic rather than a figure of speech.
- Adding formations is therefore content work, not engineering.
- The matcher runs on dirty displays only.

### NPCs

**Anthropomorphic animals on a shared base.** Species is the identity anchor — a koala is memorable
as a repeat customer in a way "person with brown hair" is not. It also sidesteps the human
representation burden, which matters in a fibre-arts game given Ravelry's community.

- **All species share one body** — torso, arms, hands, legs, feet, neck, identical proportions.
  Species differs **only above the neck and behind**: head, ears, muzzle, tail, markings.
  This is the Animal Crossing approach and it is what makes garments authorable once rather than
  once per species.
- **Base proportions are chibi: roughly 1/3 head, 2/3 body.** Not only a cuteness decision — the
  species signal lives in the head, so a third-of-the-figure head makes that signal proportionally
  huge at 150px. Also gives hats a bigger target, separates more cleanly from a busy yarn wall, and
  turns the walk into an easier-to-animate waddle.
  - **Consequence: the neck node must never have zero length.** At chibi proportions the neck is
    visually almost nonexistent, so a *multiplier* applied to a near-zero base stays near-zero and the
    llama breaks. Express neck length as an **absolute value**, and give the base neck real length
    concealed by head-and-torso overlap. The neck garment slot then works on every species, including
    apparently neck-less ones.
  - Chibi rules out the **giraffe**; the **llama** survives but is the most compressed species and
    should be checked first.
  - **Large eyes may make gaze direction readable** even though full facial expression will not be.
    An NPC visibly glancing at a shelf would be a cheap, legible tell. Worth testing in the spike.
- **Garment slots:** head, neck, torso, hands, feet, carried. NPCs must be able to wear the finished
  objects they make.
- **Rigid segmented** characters animated by node transforms. **No skeletons.**

#### Joint topology — settle this before P4, it is cheap and everything assumes it

```
root
└── waist                         variant boundary: legs | skirt
    ├── torso
    │   ├── neck ── head ── (ears / muzzle / horns / tufts)   [head garment slot]
    │   ├── shoulderL ── elbowL ── handL ── holdL             [hand garment + carry point]
    │   └── shoulderR ── elbowR ── handR ── holdR
    └── lowerBody
        ├── hipL ── kneeL ── footL                            [foot garment slot]
        └── hipR ── kneeR ── footR
```

Seventeen nodes. Trivial for rigid segmentation, and it is the minimum that supports the actions NPCs
actually need: **walk** (hip, knee), **reach for yarn on a shelf** (shoulder), **carry a bag or WIP**
(elbow bend to bring the hand forward, plus a `hold` node), and **sign the Guestbook**.

Two failure modes found by building the concept owl:

1. **A wing must not replace the arm chain.** Modelled as a single rigid blob there is no `hand` to
   attach a carried item to and no elbow to bring it in front of the body. Wing feather geometry
   hangs off the **upper arm**; the shoulder/elbow/hand chain underneath stays intact.
2. **Hips must sit *above* the waist plane, inserted into the torso.** Butting them against the waist
   leaves a visible gap, because the torso is a sphere and its surface at the leg offset is higher
   than at its centre.

> **Topology is validated with static poses, not an animation system.** If the arm can hold a skein
> in a plausible carrying pose and the legs can take a walk stance, the topology is proven. The
> animation evaluator remains P4 work.

> **The rationale for no-skeletons changed once the concurrent NPC count dropped to ~10.**
> It was originally a performance decision. At 10 concurrent, skinned meshes would be perfectly
> affordable — so that argument no longer holds. **Keep rigid segmentation anyway**, for two reasons
> that do still hold:
> 1. **Garments become trivial.** A garment is just another mesh parented to a body node — a sweater
>    is a larger torso shell, mittens are larger hand meshes, a hat parents to the head. No skinning,
>    no weight painting, no per-species refitting. With skinned meshes, every garment would need
>    rigging against every body.
> 2. It matches the diorama art direction.
>
> Recorded explicitly so this is not re-litigated later on the stale performance argument.

- **Prioritise drape-y garments** — shawls, scarves, cowls, socks and mitts fit any body and need no
  per-species work. Conveniently, that is most of what knitters actually make.
  - **Hats are the exception, and were initially misfiled as easy.** The head slot is the most
    species-sensitive one there is: ears, horns and antlers all occupy exactly the space a beanie
    wants. A rabbit needs ear holes, a moose needs the hat behind the palms, a musk ox competes with
    the horn boss. Knitters make a lot of hats so the slot cannot be dropped — but treat it as the
    **hard** slot and let neck, torso and hand garments carry the MVP.
  - Fitted sweaters are the other hard case, wanting per-species torso variants. Also a later addition.
- **Species shortlist:** aim for 8-12 with maximally *different silhouettes* rather than many similar
  ones. Koala, fox, bear, rabbit, deer, cat, owl, hedgehog, otter, sheep. (A sheep buying wool is a
  joke worth building in.)
- **Identity beyond species:** several koalas will exist, so memorable repeat customers need
  **species + fur palette + signature accessory** — *"the koala with the red scarf."*
- **Anti-camouflage:** the theme palette reserves a `characterRange` of lightness and chroma disjoint
  from the yarn anchors, so characters never dissolve into a wall of 1000 colourful objects.
- Grid A* with string-pulling, plus separation steering. No navmesh library.
- **Hidden inventory:** seeded at creation and **immutable for the NPC's lifetime**. The player can
  only infer it. Surfaced solely as *tells* — lingering near matching yarn, speech bubbles, colour
  families worn on return. The Guestbook logs observed tells so inference compounds across sessions.

### Roster retention — bounded by construction

**An NPC becomes permanent the moment the player solves a formation for them.** Everyone else ages
out. The roster is therefore bounded by the player's own successes, with no threshold to tune.

If someone solves 1000 formations, that is a wildly successful game and the scaling is a good
problem to have. **Explicitly out of scope.**

- **Non-permanent pool is LRU-capped** (~50-100), evicting least-recently-seen. Simpler and more
  predictable than counting days since last visit.
- **Aged-out NPCs are deleted outright, not tombstoned** — otherwise the roster still grows.
  Their IDs may be reused; nobody remembers them either.
- **Mark permanent at the purchase that schedules a return, NOT at the return itself.**
  This matters: marking on return creates a bug where an NPC ages out *before* their return date
  and the payoff never lands. **Any NPC with a pending scheduled return must be exempt from
  eviction**, in the same way formations-in-progress are exempt from destash.
- **No UI for NPC aging.** Unlike items, a one-time visitor quietly not coming back is simply what
  shops are like — it needs no notification and would only add noise.
- Permanent NPCs **sign the Guestbook**. This is the payoff surface: the crafters whose projects you
  made possible. See the Guestbook section below.
- *Optional, cheap:* an NPC who bought something but has not completed a recipe could be promoted to
  the front of the LRU rather than made permanent — a "warm" tier. They are exactly the people who
  should come back, and it hands the player a second attempt at a formation they nearly solved.

> **This is the same shape as the item destash system:** a selector that picks the least-loved
> records, plus an exemption list. Worth implementing with the same structure.

### The Guestbook and the bulletin board — diegetic UI

Both are **in-world objects, not menu overlays.** This is a deliberate direction: it reduces DOM
overlay work and keeps the player inside the shop rather than inside a menu.

**The Guestbook** sits on the counter. NPCs physically walk over and sign it. Each entry holds the
signature (name, species, date), what they made and which yarn it came from, and the tells the
player has observed about them. Entries can also carry **hints**, which makes hint delivery
diegetic — no tutorial overlay needed.

> **Signing and permanence are two different events. Do not conflate them.**
> - The permanence *flag* is set at the **purchase that schedules a return** — invisible
>   bookkeeping, and what prevents the eviction bug described above.
> - The *signature* animation happens when the NPC **returns with the finished object** — the
>   visible payoff.
>
> Decoupling these lets the bookkeeping be correct while the ceremony stays in the right moment.

**The bulletin board** is wall-mounted and surfaces the most recent Guestbook entries as
"Customer of the Week", with small rendered pictures of their finished objects.

**Finished-object portraits — render to texture**

- Render each finished object **once** to an offscreen `WebGLRenderTarget` when it is created, then
  cache the texture. Not per frame.
- Use a **fixed neutral portrait rig** — its own camera and lights, independent of the active theme.
  Otherwise every card re-renders on a theme switch and the board stops looking like a matched set.
- 128×128 or 256×256 is plenty. Twenty cards at 256² RGBA is about 5 MB.
- **Never store the images in the save.** Persist the finished-object *definition* and re-render on
  load. Putting PNGs in IndexedDB would bloat the save for no benefit.

**Customer of the Week selection:** most recent signature, rotating. Cheap, and revisit only if it
feels arbitrary in play.

> **OPEN — decide before P5.** "Hints in Guestbook entries" is underspecified, and the two readings
> pull in opposite directions:
> - *"Marguerite has been eyeing the aran weight"* — a tell the player **observed**. Respects the
>   inference mechanic and rewards attention.
> - *"Marguerite already owns three of the four things she needs"* — information the player has
>   **no way to know**. Short-circuits the hidden-inventory design entirely.
>
> The first is a memory aid; the second is a solution. Pin this down before building the hint
> system, or it will quietly undermine the mechanic it is meant to support.

### The core loop

1. The player arranges items into a formation.
2. Purchase decision = formation bonus × affinity × hidden-stash completion × WIP need × dwell time × seeded luck.
3. The purchase **removes the item from its slot**, which breaks the formation, and the player rebuilds.
   This is the concept's central loop and deserves first-class visual treatment.
4. A completed recipe schedules a Return at `day + craftDuration`.
5. The NPC returns with the finished object. Gifted finished objects become placeable items that can
   themselves satisfy formation rules.

> **TODO (post-MVP): finished-object appearance should be DERIVED from the yarn it was made from.**
> Bulk from yarn weight, drape from fibre, colourwork from how many colours were bought, stitch
> pattern from the pattern used. This is not decoration — it turns a returning NPC's scarf into
> **visible evidence of a purchase the player made possible**, which feeds the tells mechanic without
> any extra UI.
>
> MVP ships colour variation only. The full `WearableAppearance` schema is sketched in
> [P1-SPIKE-PLAN.md](P1-SPIKE-PLAN.md) under "Which garments to prioritise". **Settle the schema
> before P5 builds the craft loop**, since that is where finished objects begin being generated from
> real purchases.

---

## 6. Supply system

> This addresses a gap the original concept did not cover: NPC purchases permanently remove items,
> so with no inflow the shop drains and the sandbox quietly dies.

### The floor is the universal inbox

Deliveries, NPC donations and finished-object gifts **all** land on the floor. One container, one
jumble renderer, one raycast exception, one interaction: `addToFloorPile(item, provenance)`.
Build it once, in P2.

- The floor is an **unsorted container, not a slotted display**, so formations cannot fire there
  *by construction*. A structural guarantee, with no validation burden.
- There is no physics engine, so piles need **deterministic jumble generation**: Poisson-disc
  scatter, random rotation, slight vertical stacking, seeded and stable across reloads.
- **Caveat:** a finished-object gift silently joining a junk pile destroys the payoff the concept
  cares most about. Put the ceremony in the **handover** — approach, animation, speech bubble,
  Guestbook signature — not the placement.

### Onboarding — the starting pile

- Roughly 24–30 unsorted items on the floor, empty shelves nearby. Sized to meaningfully fill one
  or two displays. **Not 10** — that leaves the shop looking empty at the exact moment the player
  finishes their first real task.
- Teaches the *place* verb with no tutorial overlay, and sells the core fantasy directly.
- **The deck is loaded:** the pile looks random but is guaranteed to contain one solvable simple
  formation. The pile teaches *placement*; the loaded deck teaches *formations*. Two different
  lessons, both required.

### Delivery — scripted progression, 10 days

- Days 1–10 are authored. Day 11 onward is a procedural tail (weighted-random, using the day-10
  template as the steady-state shape). **Script exhaustion must be handled or day 11 is empty.**
- **The script specifies templates, not item IDs.** For example, day 12 becomes *"6 items, single
  colour family, introduce one new weight"*, resolved against the catalog at runtime via the world seed.
  - Hardcoded IDs produce dead deliveries — all lace-weight when the player has never met a lace knitter.
  - Templates keep authored control of the difficulty curve while staying robust.
  - Same curve for every player, different specifics per seed, so replay variety comes free.
- Doubles as tutorial pacing: withhold notions for the first few days so the player masters
  yarn-only formations first. Invisible to the player.
- Also testable — a fixed curve lets tests assert "by day 10 the player can build formation X".

### Homeostasis — stopping growth toward the 1000 ceiling

Three options were considered: **(a)** player-aware destash, **(b)** delivery throttle,
**(c)** a Hoarder NPC or Moth event.

Cost: **(b) cheapest ≪ (a) cheap ≪ (c) expensive.**

**MVP = (b) soft + (a). (c) deferred.** They operate at different layers and you need one of each.
Note that (b) alone can stall the game entirely — that is the serious-puzzle-game failure mode, and
the wrong vibe.

**Inflow — (b) soft throttle, day 11+**

- *Shrink* deliveries as occupancy rises. **Never hard-stop** — a hard stop turns this into a puzzle game.
- Enforce a **minimum delivery of 1–2 items**. The morning pile is the session-opening ritual and
  must never be empty.

**Outflow — (a) end-of-day destash, day 11+**

- Sort by `lastPlacedDay` ascending, nulls (never organised) first. Remove N.
- Self-balancing, and it rewards the core verb: curated arrangements are protected precisely
  *because* the player touched them.
- **Also solves an otherwise unflagged problem:** deliveries arrive daily, so unsorted floor piles
  would accumulate forever and eat the 1000 ceiling with junk.
- **Exemptions** — all required, all cheap:
  1. Items participating in a **matched formation** (the matcher already knows the slots — one line).
  2. **Today's delivery** — don't punish slow sorting.
  3. **Finished-object gifts, permanently** — losing one would feel awful.
  4. A player "keep" pin — post-MVP.
- **Legibility:** needs a morning summary ("4 skeins went to the charity box"). Silent
  disappearance reads as a bug.

**(c) is a re-skin of (a) — architect for it now**

The selection logic is identical for both: *pick the least-loved items*. Whether that is narrated as
an invisible overnight tidy-up (a) or as a Hoarder NPC or moths (c) is **presentation only**.

> Keep `selectDestashCandidates()` strictly separate from how its result is narrated.
> Then (c) ships later as a visual upgrade rather than a rewrite.

**Both homeostasis systems stay off during days 1–10.** Throttling fights the authored curve, and
destashing punishes new players. Clean boundary: days 1–10 pure authored, day 11+ systems on.

---

## 7. Art direction

**Soft pastel clay / miniature diorama.**

Rejected alternatives: flat low-poly with outlines (too narrow a theming ceiling — every theme looks
like the same game recoloured), and semi-realistic (N× texture cost per theme).

- Geometry can be genuinely simple. Yarn forms are lathes and swept tubes — a skein is a
  `TubeGeometry` along a Catmull-Rom curve, a cake is a `LatheGeometry`, a ball is a squashed sphere
  with a twist normal map. **Most of the 1000 items need no artist at all.**
- `MeshPhysicalMaterial` with `sheen` / `sheenColor` / `sheenRoughness` is three.js's cloth shading.
  Yarn *is* sheen. One material, per-instance colour.
- The cosiness comes from **lighting, not modelling**: warm key plus cool fill, soft contact shadows,
  a low-contrast pastel palette, gentle bloom, slight depth of field.
- **Theming rides on this for free.** A theme is JSON: `{palette, envMap, lightRig, displaySet, postFx}`.
  Different themes, zero new shaders, zero new geometry.
- Hue variation **must** be palette-constrained (anchor hues plus small perceptual jitter).
  Uniform-random hue destroys the pastel read instantly.

---

## 8. Ravelry data

- The API is entirely behind a login wall; the schema could not be fetched during planning.
  **An API key is available**, so the next step is capturing real sample payloads.
- Auth is HTTP Basic with a read-only personal access key (a username/password pair).
- Endpoints to **verify** (unconfirmed): `/current_user.json`, `/yarns/search.json`,
  `/yarns/{id}.json`, `/patterns/search.json`, `/patterns/{id}.json`, `/yarn_weights.json`,
  `/yarn_attributes.json`, `/color_families.json`, `/needles/list.json`,
  `/pattern_categories/list.json`, `/people/{user}/stash/list.json`
- **Security: the key must never enter the client bundle.** Use `.env` plus gitignore, keep the
  harvest Node-only, and commit only the baked JSON output.
- **Check the terms of service on bulk caching and image hotlinking *before* implementing the
  harvest**, not after — they may constrain what you are allowed to store.
- MVP uses a synthetic/curated catalog shaped to the real schema, so the harvest drops in later.

---

## 9. Phases

| Phase | Contents |
| --- | --- |
| **P0 Foundations** | Vite/TS/R3F, sim–render split plus ESLint guard, seeded RNG, fixed tick, IndexedDB save stub, Vitest harness, GH Actions → Pages |
| **P1 Look & feel spike** | See [P1-SPIKE-PLAN.md](P1-SPIKE-PLAN.md). Runs parallel with P6 research |
| **P2 Placement** | Slot model, derived jitter, pick/place, orbit + display-focus camera, tray UI, floor pile as universal inbox, jumble generator, `lastPlacedDay`, 1000-item stress test |
| **P3 Formation engine** | Rule DSL, matcher, dirty tracking, discovery feedback, Formation Atlas UI, headless tests. Parallel with P4 |
| **P4 NPCs** | Shared base rig + species kits, garment slots, spawn, grid A*, steering, rigid animation, batched rendering, **persistent roster of a few hundred with event-driven scheduling**, ~10-concurrent cap. Parallel with P3 |
| **P5 The loop** | Hidden stash/affinity/WIP, purchase-removes-item, tells, craft scheduling, return-with-FO, Guestbook + signing + bulletin board + FO portraits, delivery schedule + template resolver + exhaustion fallback, donations, throttle, destash selector + exemptions + morning summary |
| **P6 Data** | Derive Ravelry schema from real payloads, harvest script, catalog, validator |
| **P7 Ship** | Save migration test, performance pass, onboarding, deploy |

**P1 comes before gameplay deliberately.** Art direction is the one thing that gets exponentially
more expensive to change later, and "cosy" is the entire product thesis.

---

## 10. Verification strategy

1. `test:sim` — formation matcher: given a slot grid, assert exactly the expected rule IDs fire.
   **Include negative cases** — near-miss arrangements must *not* fire.
2. `test:determinism` — run 500 simulated days twice from the same `worldSeed`, assert identical
   world hashes. This is the regression net for the entire simulation.
3. `test:loop` — place a known formation, assert purchase, assert the slot is empty, advance N days,
   assert the NPC returns with the correct finished object.
4. `test:save` — write a v1 save, migrate, assert v2 loads without data loss.
5. Performance overlay (`P` key): 1000 items plus ~10 concurrent NPCs, measured under **20x CPU
   throttle** (see "Verification standard" in section 4). Target 60fps. The old "draw calls under 30"
   budget is retired — it was never achievable for un-batched characters, and draw call count turned
   out to be the wrong metric anyway. **Fail the build on regression.**
   Separately assert that a **large dormant roster costs nothing** — tick time must not scale with
   roster size, only with NPCs actually in the shop.
6. `test:roster` — assert an NPC with a **pending scheduled return is never evicted**, and that an
   NPC who completed a craft loop survives an arbitrary number of LRU evictions.

---

## 11. Explicitly out of MVP

Ravelry login/import, multiple rooms, the coffee shop variant, special events (Stitch'n'Bitch,
beginner night), spinning/felting/dyeing chains, NPC friend groups, audio, mobile touch,
first-person mode, Hoarder/Moth narration, multiple shipped themes (plumbing only — one theme ships).

---

## 12. Size assessment

- **MVP:** roughly 10 systems, 35–45 modules, 7–10k lines of TypeScript.
- **Full concept:** roughly 3–4× the MVP.
- **Most expensive and riskiest:**
  1. Formation rule **content** authoring — effectively unbounded. This is design work, not
     engineering, and it never really ends.
  2. NPC craft-chain simulation.
  3. Making 1000 procedural items look varied rather than samey.
- **Cheapest leverage:** procedural geometry, instancing, JSON-driven rules.
