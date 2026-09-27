# Visual Design of Finished Objects

This document is the **single source** for what finished objects (FOs) are and how they look, both
wearable and not: the types, their silhouettes, the texture and accessory vocabulary, and the
modifiers that turn a PATTERN plus an NPC's yarn and tools into one particular object.

Other docs defer to this one:

- `WEARABLE-FINISHED-OBJ.md` covers the worn slots and the lend/return loop.
- `WIP-AND-FINISHED-OBJ-FORMATION.md` covers how a WIP becomes an FO.
- `../inventory/PATTERNS.md` covers the pattern box and the yarn units table.
- `NEAR-MISS-AND-SUBSTITUTION.md` covers the verdicts (PERFECT, CHARACTERFUL, COMPROMISED …) and swatches.

Marks used below:

- **(proposed)**: an AI suggestion the user has not confirmed yet.
- **(open)**: deliberately deferred; listed at the end.

---

## 1. Types

### Wearable, one per slot

An NPC wears at most one FO per slot. The slot table (head, neck, shoulders, torso, bag, feet) lives
in `WEARABLE-FINISHED-OBJ.md`. **There are no mittens**, worn or decor: the characters have no
rendered fingers.

| Type | Slot | Spec'd silhouettes | Proposed additions to reach 5–10 |
| --- | --- | --- | --- |
| **Hat** | head | traditional knit hat, fisherman's hat, beret, hood, headband; pom-pom or not (an accessory) | slouch beanie, earflap/trapper, bucket hat (crochet), cloche, pixie hat with a long tip **(proposed)** |
| **Scarf** | neck | cowl, ascot, long scarf; one so long it trails on the ground | infinity (double-wrapped loop), skinny scarf, kerchief/bandana triangle, chunky fringed wrap **(proposed)** |
| **Sweater** | torso | vest, short sleeve, long sleeve × cardigan (open front) or pullover (closed front) | turtleneck, cropped, oversized tunic, raglan with a colour yoke **(proposed)** |
| **Shawl** | shoulders | triangle, half circle, rectangular wrap; closes or knots at the front; alone or over a sweater | crescent, capelet, shrug **(proposed)** |
| **Bag** | bag | shoulder bag, market bag, backpack; at least 3 sizes | drawstring bag, tote, bucket bag, crossbody pouch **(proposed)** |
| **Socks** | feet | a pair of socks | ankle, crew, knee-high, slouch, leg warmers (open foot), slipper socks with a pom **(proposed)** |

"5–10 visually distinct types" means **5–10 distinct silhouettes per type**. Texture, colour,
accessory and size multiply on top of those; they are not what makes a silhouette distinct.

**Scope and build order.**
- The first visual design pass builds **all 5–10 silhouettes per type up front**, not one form per
  slot. This supersedes P1-SPIKE-PLAN.md's "one form per slot, colour only" MVP.
- The order is **drape-y first**: scarf, shawl and the decor objects; then bag and socks; then the
  species-sensitive hat (lion mane, llama ears, owl tufts) and sweater (owl wings, llama fleece,
  tails) last.
- **Evidence of the purchase is a nice-to-have.** A chunky red scarf that shows the NPC bought bulky
  red yarn is welcome where it falls out of the rules, but aesthetics and variety come first
  (P1-SPIKE-PLAN.md's "tells" idea).

Two silhouettes are named in the spec on purpose and must be reachable: **a scarf so long it trails
on the ground**, and **a hat so big it slips to the side**. Both are the oversized end of the size
modifier (§3).

### Non-wearable (decor)

These are placed in the shop by the player as decoration.

| Type | What it is | Skill | Proposed silhouettes |
| --- | --- | --- | --- |
| **Potholder** | small flat square, with a hanging loop | beginner | square, round, hexagon, granny square, heart **(proposed)** |
| **Chair cover** | sits over a stool like a doily; can also go on the shop counter; any symmetric shape | beginner–intermediate **(proposed)** | round doily, square, hexagon, octagon, star/flower, scalloped circle **(proposed)** |
| **Cozy** | a cover for a teapot, lamp and so on. Placed anywhere, it **always shows on a teapot** | intermediate | dome, bell, tall with a pom, pumpkin segments, cottage shape, "hat" with a bobble **(proposed)** |
| **Amigurumi** | a crocheted or knitted stuffy, ¼–⅓ an NPC's height, in the cast's species (llama, owl, lion); simplified, mostly spherical, with a head and a texture | intermediate+ **(proposed)** | per species: ball, pear, bean; sitting or standing **(proposed)** |
| **Swatch** | a 1x1x1 flat square: the smallest thing in the shop. **Not a pattern type.** See §4 | any | one square; variety comes from texture and colour only |

The **cozy ships with its own teapot mesh**, since the shop has no teapots for it to sit on. The
cozy and teapot are one placeable object. **(proposed)**

The **chair cover** is sized to the shop's cube chair top (`CHAIR_W` 0.34 in `store/scene/seating.js`)
and to the counter. When it is placed on a chair, it caps the cube. **(proposed)**

---

## 2. Visual attributes

Every FO is distinguished by **silhouette, size, colour, visual texture and accessory**. All of
these are attributes of the PATTERN the NPC uses, then modified by how it was made (§3).

The vocabulary is split five ways, so that one field never has to mean two things. It replaces
PATTERNS.md's old `["stripes", "star", "pom pom", "fringe"]` hint list:

| Kind | Values | Read at 150px as |
| --- | --- | --- |
| **Stitch texture** (relief) | knit: stockinette, rib, garter, seed/moss, linen stitch, cable. Crochet: single crochet (its plain base), waffle, puff, lace (holes). See §2b | surface bumps, or holes the background shows through |
| **Colourwork** (which colour goes where) | solid, stripes, checks, colour-block, motif (a star, heart and so on), fair isle, marled (two strands held together, speckled) | colour regions |
| **Edge** (hem and cuff treatment) | rolled, ribbed, fringed, picot, scalloped | a silhouette break at the edges; cheap, and it reads at 150px |
| **Form** (how it is worn; scarves and shawls) | draped, wrapped once, wrapped twice, tied, tucked | the same silhouette worn differently |
| **Accessory** (added geometry) | pom-pom, tassel, buttons, appliqué flower | a silhouette break |

Fringe is an **edge**, not an accessory. These additions (edge, form, marled) come from P1-SPIKE-PLAN.md's `WearableAppearance` sketch.

**Knit vs crochet (decided 2026-09-27, see §2b):**

- Both share every silhouette.
- Craft should read much more strongly than it does now: even cartoonish, **knit is smoother than
  crochet**. Each craft has its own plain base texture: knit is smooth V-rows, crochet is bumpier
  and more open.
- Stitch and craft are **not independent**: each stitch belongs to one craft (the §2 table).
- The amigurumi and the granny-square potholder are crochet by default.

**The 2D image.** When the player clicks or inspects a PATTERN, a detail screen shows the BASE FO:
the pattern's own silhouette, texture, colourwork and accessory, at its designed size, in its
suggested colours. It is an **offscreen render of the same generator that builds the 3D FO**, so
there is one source of truth. There are no shop-level thumbnails, since they would not be readable.

**How it's drawn.** These decisions supersede P1-SPIKE-PLAN.md's knit normal map and garment value band.

- **Stitch texture is big relief plus hatching.**
  - Ribs, cables, puff bumps and lace holes are geometry. Lace holes are cut into the mesh, not
    alpha-tested.
  - Fine stitches are the yarn's strand hatching (`inventory/yarn-look.js`).
  - No fine normal map: the felt one read as granular stone at crowd distance.
  - Relief respects the geometry detail tiers.
- **Stitch size follows the tool and yarn:** chunky yarn on big needles shows bigger stitches.
  Garment size alone never changes it.
- **Worn items:** knit material (the tighter sheen of `knitMaterial`) on felted bodies, plus a
  **rim highlight on garments only**. The rim is what separates a garment from the fur.
- **Colour is exact.** A garment is always its yarn's own colour; there is no lightness nudge and no
  garment value band. A tone-on-tone garment is separated by its rim, its silhouette break and the
  felt/knit material difference.
- **Decor objects use the merchandise look:** matcap, ink outline and hatching, the same as the
  yarn on the shelf beside them. They do not use knit sheen.

**Performance.** What each look choice costs, estimated and measured, is tracked in
`WEARABLE-LOOK-VS-PERFORMANCE.md`. Check it before committing to a look.

---

## 2b. Real-world inputs and what they drive (reference)

Check this when deciding what to model. It maps how each real-world input changes a real piece of
knitting or crochet onto the visual outputs the generator has (`characters/garments.js`). Tuning
still happens by eye in `characters/dress-up.html`.

The generator's outputs: **fit** (size relative to fitted), **stitch size** (stitch width, row
height, which is also stripe width, and relief depth), **fabric thickness**, **texture** (the
relief pattern), **sheen**, and **drape**.

1. **Tool size** (needle or hook). A bigger tool changes:
   - **gauge**, which shows here as **fit**
   - **stitch size**: stitch width, relief depth, and row height, which sets how wide stripes are
   - **drape**. This is possibly the biggest effect in the real world, but it is hard to show on
     screen. It is on hold (below).
2. **Yarn size** (weight). Heavier yarn changes everything a bigger tool does, **plus fabric
   thickness**, where its effect dominates. Tool size does not change fabric thickness.
3. **Stitch** has the dominant effect on **texture**.
4. **Fibre**, in the real world, affects:
   - **Sheen:** silk and mercerised cotton are reflective. Modelled.
   - **Drape:** on hold, because it is hard to model cheaply. **To do:** find a cheap way.
   - **Pilling or halo, and durability:** not a game mechanic now, and not planned.
   - **Washability and care:** may become a mechanic later, since washing could shrink or felt a
     garment. Not now.
   - **Cost in money:** explicitly not part of this game.
   - **Softness:** not really modellable in a visual game.
5. **Craft** should have a much stronger visual effect than it does now. Even cartoonish, knit is
   smoother than crochet. Stitch and craft are not independent:
   - **Knit stitches:** stockinette, rib, garter, seed, linen stitch. Cable stays knit, as §2 had
     it.
   - **Crochet stitches:** waffle, puff, lace.

   This split is **not accurate to the real world**. For example, you can knit lace. It is set by
   the performance and graphics depth available now, and should be revisited in a later
   optimising pass.

---

## 3. Modifiers: from pattern to this particular object

The PATTERN says what the object is meant to be. The yarn, the tool, the NPC and what the player
did decide what it actually turns out to be.

### Type

A pattern can be any type in §1 except the swatch. A swatch is a crafting step, not a pattern (§4).

### Size is fit

Tool size (needle or hook) and yarn weight scale the object. The bigger both are, the bigger the
object comes out relative to the pattern's intended size.

- **Worn items: size is fit, within limits.** From a too-small end to an oversized end, with
  "fitted" in the middle. Both ends are allowed to look **deliberately silly or ill-fitting**:
  - a hat perched on top, or one slipping over an eye
  - a sweater with bare midriff, or one down to the knees
  - a scarf trailing on the floor
- **NPCs left alone often misfit.** A good fit should be attributable to **player involvement**:
  the player stocked the tool size and yarn weight the pattern asks for, where the NPC could find
  them together.
- **Decor items scale freely** from the same inputs, with no "fit".
- The fit limits, and how far off the tool and yarn have to be to reach them, are **(open)**:
  tune on the rig.

### Colour

- Colour comes from the yarn(s) the NPC used. **Every colour appears somewhere.** The colourwork
  decides where.
- Colours beyond what the colourwork has slots for go onto trim, the accessory, or extra stripes.
- **Purchase fallback:** if the NPC ended up with more colours than the pattern's colourwork has slots, the colourwork upgrades to make room: solid becomes stripes. Stripes repeat through any number of colours, so they need no further upgrade (P1-SPIKE-PLAN.md's purchase-history rule, kept as a fallback). The pattern still decides first.
  - **Decided 2026-09-27:** more colours on stripes is **not** a penalty and does not turn them into fair isle; in the dress-up page that looked a mess. Picking fair isle for extra colours is an NPC's taste, to be specified with personality.
- The result is never completely random.
- How many yarns a WIP ends up with is decided by shopping, not here. See
  `WIP-AND-FINISHED-OBJ-FORMATION.md`.

### Yarn weight and fibre shape it

- **Weight sets thickness (bulk).** A bulky scarf is fat and a lace one is thin, independent of
  size/fit. Weight also shares everything tool size drives (§2b).
- **Fibre sets sheen; its drape is on hold** (§2b). Where drape is drawn today, it picks among a few
  pre-shaped drape meshes, from stiff (linen, cotton) to fluid (alpaca, silk, mohair), with no
  cloth simulation. The fibre-to-drape order stays **(proposed)** until a cheap drape model exists.

### NPC skill

Textures and accessories carry a skill level. An NPC below the pattern's level makes a **worse
version of it, in two degrees (proposed)**:

- **A little below:** simplified. The texture falls back to a plainer one (cable becomes rib, lace
  becomes plain) and the accessory is dropped. It still reads as the pattern.
- **Well below:** wonky. Irregular stitch texture, uneven edges, colourwork slightly off. The
  mismatch is visible, and the player can see it even when the NPC cannot.

This is the visual form of NEAR-MISS-AND-SUBSTITUTION.md's **COMPROMISED** verdict ("the hint is
dropped or rendered wrong"). A compromised object from a bad substitution uses the same two looks,
whatever caused it.

### Species fit

A garment is **authored once**. The species kit supplies what the garment must clear:

- ear openings or tuft holes in hats (llama ears, owl tufts)
- the lion's mane, which a hat sits on or behind
- a tail gap in sweaters
- coat bulge (llama fleece, owl plumage)
- sleeves over owl wings
- **neck length:** scarves and cowls scale to the neck, so a llama gets more wraps or a taller cowl
  ("a llama in a very long scarf is a feature", P1-SPIKE-PLAN.md). Size/fit applies on top.

The rig already exposes most of this: `coatBulge`, the ear joints, `joints.tail`, `neckLength`.

### Geometry on a moving rig

- **Long hems may clip.**
  - Tunics, a knee-length oversized sweater and long shawls hang past the hips.
  - The legs are allowed to poke through when walking: it is chibi and stylised.
  - No waist attach point or leg-parented skirt panels. This supersedes P1-SPIKE-PLAN.md's
    per-lower-body long garments.
- **Only scarf ends move.**
  - Long scarf ends, including the floor-trailing scarf, swing on the same passive spring as the
    tails (`tailStep` in motion.js).
  - Everything else is rigid: shawl tips, pom-poms, fringe.
  - Each moving end is its own joint: +1 node and +1 draw.

---

## 4. Swatches

A swatch is **both a crafting step and a leftover object**.

- **As a step:** careful crafters swatch before starting. A swatch affects whether the FO comes out
  well, which is the reward. The rule for who swatches, and what it changes, belongs to the WIP and
  near-miss systems **(open)**.
- **As an object:** whatever made it, the swatch is the 1x1x1 flat square from NEAR-MISS §5b. It
  carries its yarn's material, weight and colour and the tool size it was worked at, and it goes on
  the swatch wall. A compromised object turned into a swatch (the high-Intellect reaction) gives the
  same object.
- The "NPC dislikes their swatch and abandons the FO" mechanic is **deferred**, along with FROGGED.
- The player never knits one: arranging is the player's only verb.

---

## 4b. A WIP in hand

While an NPC knits or carries a WIP, it shows as **needles (or a hook) plus a partial object that
grows with progress**. It starts as a swatch-sized piece and builds toward the finished silhouette.
It is the same generator as the FO, clipped by progress, in the WIP's yarn colours. Holding it needs
the two-handed knitting pose that NOTIONS.md flags.

"Project bag" names the NEAR-MISS hold-shelf display form, not a bag silhouette; the bag silhouette
is the "drawstring bag".

## 4c. Identity before the first FO

Characters start bare-necked, and nothing is spawned in place of the old default scarf. The species
kit variety carries a new NPC's identity: mane, tail, ears, fur colour and body size. The signature
accessory ("the lion with the red scarf") arrives with their first finished object, and that is the
payoff. This supersedes P1-SPIKE-PLAN.md's "species + fur + signature accessory" from day one.

## 5. Open questions

- **Size-to-fit tuning:** the fit limits, and how far tool and yarn may be off before each end.
- **Yarn per WIP:** NPCs buy by units, and may end up with the wrong colour when matching units are
  not stocked together. The rules come from skill and personality; not specified yet.
- **Who swatches, and what a swatch changes:** the swatch as a step.
- **Skill levels** per texture, accessory and type, on the 1–5 crafter scale. Proposed default:
  - 1–2: plain, stripes, potholder, scarf
  - 3: rib, seed, waffle, colour-block, pom-pom, fringe, hat, socks, bag, cozy, chair cover
  - 4–5: cable, lace, puff, fair isle, motif, sweater, shawl, amigurumi
- Every **(proposed)** mark above.

## 6. Code that will need to follow this spec

Not changed yet; listed so nothing is missed.

- **`characters/wip.js`** `WEAR_SLOTS` / `WEAR_SLOT_FOR`: drop hands and mittens; add shoulders (shawl),
  bag and feet (socks); scarf replaces cowl.
- **`inventory/catalog.js`**:
  - `PATTERN_TYPES`: cowl → scarf, add the new types, and replace `hints` with texture, colourwork
    and accessory.
  - `yarnUnits`: **1 per yarn item**, not footprint. Pattern costs are 1–8 items of the pattern's weight (PATTERNS.md), and a wrong-weight item is a near-miss, not a conversion.
- **`characters/npc.js`** `scarf` default off: characters start bare-necked, and the neck slot is an FO.
- **`P1-SPIKE-PLAN.md`**'s `WearableAppearance` sketch should be reconciled with §2's vocabulary.
- Implementation to-dos from tuning on the dress-up page are in `FINISHED-OBJ-TODO.md`.
