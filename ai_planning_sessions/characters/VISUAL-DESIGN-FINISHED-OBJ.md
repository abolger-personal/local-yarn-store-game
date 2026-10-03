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
in `WEARABLE-FINISHED-OBJ.md`. **Nobody wears mittens**: the characters have no rendered fingers.
Mittens are still knitted, as decor (below).

All six wearables are built, with every silhouette below, by `characters/garments.js`
(`GARMENTS[type].silhouettes`, which is the source of truth; `garments.test.mjs` asserts the
catalog's pattern names cover exactly these). Try any of them on in `characters/dress-up.html`.

| Type | Slot | Silhouettes (built) | Notes |
| --- | --- | --- | --- |
| **Hat** | head | beanie, slouch, fisherman, beret, earflap, hood, headband, bucket, cloche, pixie | pom-pom or not is an accessory, not a silhouette |
| **Scarf** | neck | cowl, infinity, ascot, long, trailing, skinny, kerchief, chunky wrap | "trailing" is the one so long it trails on the ground; cowl is a scarf silhouette, not its own type |
| **Sweater** | torso | pullover, cardigan, vest, turtleneck, cropped, tunic, raglan | sleeve length is not a silhouette |
| **Shawl** | shoulders | triangle, half circle, rectangular wrap, crescent, capelet, shrug | worn draped or tied (a form); alone or over a sweater |
| **Bag** | bag | shoulder bag, market bag, backpack, tote, bucket bag, crossbody pouch, drawstring bag | |
| **Socks** | feet | crew, knee-high, over-knee, slouch, leg warmers, slipper socks | slipper socks cover the foot and carry a pom; leg warmers are open-footed. An ankle sock was dropped: too like a crew sock to tell apart |

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
| **Mittens** | a pair, never worn: laid on a table, pinned to the bulletin board or clipped to a line **(proposed)** | intermediate **(proposed)** | plain, thumbless, convertible flip-top, colourwork cuff, joined by a string **(proposed)** |
| **Blanket** | a throw that drapes: over a chair back, folded on a display table, or across the counter **(proposed)** | intermediate **(proposed)** | granny-square throw, striped, chunky cable, ripple/chevron, fringed, folded vs draped **(proposed)** |
| **Swatch** | a 1x1x1 flat square: the smallest thing in the shop. **Not a pattern type.** See §4 | any | one square; variety comes from texture and colour only |

**Where decor goes.** The shop's plain furniture is built for it: every piece records the surface a
finished object fits in `userData.cozy` (`store/scene/seating.js`, `props.js`), so decor is fitted to
real dimensions rather than guessed. The furniture itself stays bare on purpose — the shop is cosy by
its light and building, and decor comes from finished objects.

- The **cozy** fits any of the shop's cylinders: a floor or table lamp's ceramic base or its drum
  shade, or a flower pot (`cozy.base`, `cozy.shade`, `cozy.pot`: radii top and bottom, height). On its
  own it still ships with a teapot mesh, so a cozy placed anywhere else always shows on a teapot; the
  cozy and teapot are then one placeable object. **(proposed)**
- The **chair cover** is a doily or seat pad on a chair seat (`cozy.seat`, `CHAIR_W` 0.34 square at
  `SEAT_H`) or on the counter. **(proposed)**
- The **blanket** drapes over a chair's raked back (`cozy.back`: width, height, rake) or lies folded
  on a display table top. **(proposed)**
- **Mittens** lie flat as a pair, or pin to the bulletin board. **(proposed)**

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

**Scarf shapes (decided 2026-09-27).**
- **A scarf with ends is one band.** It runs from one tip, round the neck as often as the form
  says, and down to the other tip. It lies flat where it hangs and bunches narrow and thick round
  the neck. The part round the neck rides the neck joint and the ends ride the chest: one sheet cut
  in two places, so the pieces share their edge rows. Before, a ring round the neck and two
  strips starting at the chest read as separate parts, and wrapped ends didn't connect.
- **Turns by form.** Draped: none, so a U over the nape, with the ends hanging either side of the
  neck. The U meets each end straight above it, over the shoulder. Wrapped once or tied: one turn.
  Wrapped twice: two turns, each above the last, and the top turn stops under the eyes so they
  peep over an oversized chunky wrap.
- **Ends lie on the body,** at no angle to it, on the torso where they actually hang (it curves
  back to the sides), with only the band's thickness between. Below the chest's widest point
  they hang straight.
- **Trailing ends go behind,** like a scarf flung back. In front they trailed under the feet.
- **Infinity is a closed loop gone round twice.** Its two strands have to pass each other, so they
  sit at different heights at the back and one in front of the other at the front, where the
  outer strand hangs lower. It rests on the shoulders and reaches no higher than the bottom of
  the head: up a short neck it wrapped the face.
- **Infinity and cowl have no form.** With no ends there is nothing to drape, tie or tuck, so the
  dress-up page hides the menu and the builder ignores it (`hasForm`).
- **Ascot at fit 1 is a small tie at the throat:** ends 0.2 of the torso long, 0.7 as wide.
  Ends shorter than 0.4 of the torso ride the neck with the rest of the scarf, so they turn with
  the head. On the chest they stayed put and hung in midair. Longer ends stay on the chest,
  because on the neck they would swing through the body.
- **Llama:** the ends come down outside its ruff.
- **Cost:** 1–2k triangles more than before (the band has thickness where the strips didn't). A
  cable long scarf is 7.6–9.2k.

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
   - **Sheen:** silk and mercerised cotton are reflective. **Not modelled yet:** every garment shares
     one material. **To do:** a cheap per-fibre sheen, for example a vertex attribute the shared
     shader reads, rather than a material per fibre.
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

**As built (2026-09-27, `fabric()` in `characters/garments.js`), at fit 1:**

| Output | Driven by | How |
| --- | --- | --- |
| Real stitch width | yarn weight and tool | `yarn ** 0.4 × tool ** 0.6`: both bigger, bigger stitch; the tool is the larger share. Each weight has a usual tool (`TOOL_MM`, knit and crochet) |
| Drawn stitch width | real stitch width | Real width times the stylisation (`LOOK.stitchScale`, **2.1**). Weights keep their real ratios; a `spread` knob to squeeze them was tuned to 1 and removed. Neighbouring weights stay at least 5% apart |
| Fit | real stitch width | `madeItem(pattern, used)`: what was made over what the pattern asked for. Made to pattern is exactly 1; worsted on a fingering pattern is about 1.16. It can be forced |
| Row height (and stripe width) | stitch width, craft, stitch | knit 0.75 of width, crochet 1.05; garter 0.6x, linen stitch 0.65x, puff 1.15x |
| Fabric thickness | yarn weight alone, the real spread | Crochet is 1.3x knit. The tool never changes it |
| Relief depth | stitch, in stitch widths | from 0 (stockinette, single crochet) to 0.9 (cable), times `LOOK.relief` (**1.8**). Puff is 0.5: low for its width, see below |
| Relief at a distance | on-screen stitch size | Built for `LOOK.viewPx` (150, the game's crowd). A stitch under 1.5px there is built as its craft's plain: no relief, bumps or lace holes. Colourwork, hatching, edges and silhouette still carry it. The dress-up page builds close-up by default |
| Craft texture | craft | Crochet adds a bump (0.35 stitch widths) under every stitch except puff, one knot per two stitches and two rows; knit is smooth. A knot per stitch would need ~100k triangles on a lace hat |

**Puff stitch reads as poofs (decided 2026-09-27, by eye).** Three things had made the puffs spikes,
and each has a rule now:
- **Low for their width.** At the tuned relief (1.8), puff's own depth of 0.9 made puffs 0.75 as
  tall as wide: cones. At 0.5 they are 0.30 as tall as wide. The self-check holds them under 0.4.
- **No crochet bumps on puff.** Stacked on a puff they peaked into points. Laid between the puffs,
  they were as loud as the puffs. Puff is crochet's texture on its own.
- **A dome that eases into the fabric.** `(1 - d²) ** 1.5` over a 3-stitch by 3-row pillow, the
  rows bricked. A fuller dome walled up at its edge, and a sharpened sine peaked. At 2.5 segments a
  stitch, about 7 across a puff, so it is drawn round.

**Cable reads as ropes (decided 2026-09-27).** One wavy ridge every 8 stitches read as rows of
bumps. A cable is now a rope: two round strands that swap sides every 6 rows, with the strand
crossing over standing higher. Ropes repeat every 16 stitches, so there are half as many, with
10 plain stitches between them. That's about 4 ropes round a lion's hat. The cost is about
the same as before: 1.5 segments a stitch across and 1 a row.

A stitch from the other craft falls back to the item's craft's plain one (`craftStitch`). Drape
(beyond the per-fibre placeholder) and sheen are not inputs yet.

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
  - 3: rib, seed, waffle, colour-block, pom-pom, fringe, hat, socks, bag, cozy, chair cover, mittens,
    blanket
  - 4–5: cable, lace, puff, fair isle, motif, sweater, shawl, amigurumi
- Every **(proposed)** mark above.

## 6. Code that will need to follow this spec

Listed so nothing is missed; struck through where done.

- ~~**`characters/wip.js`** `WEAR_SLOTS` / `WEAR_SLOT_FOR`: drop hands and mittens; add shoulders (shawl),
  bag and feet (socks); scarf replaces cowl.~~ Done 2026-10-03; `garments.test.mjs` asserts the
  slots match `GARMENTS[type].slot`.
- **`inventory/catalog.js`**:
  - `PATTERN_TYPES`: ~~cowl → scarf~~, ~~add the new types~~, ~~replace `hints`~~. Done 2026-10-03
    for the six wearables, at PATTERNS.md's costs; `hints` is gone. Each named design carries its
    **silhouette** (`PATTERN_TITLES` is keyed by type and silhouette), and `wornAs` in
    `garments.js` builds the finished object as it. Still open:
    - the **decor types** (blanket, potholder, cozy, chair cover, amigurumi, mittens). The sim
      copes (no slot, so always lent), but nothing draws a decor FO, in the shop or in the
      Guestbook photo, and they have no cover icon.
    - a design's **texture, colourwork, edge, form and accessory**. A shop FO is still the
      silhouette's defaults, with stripes when it is knitted in more than one colour.
  - ~~`yarnUnits`: **1 per yarn item**, not footprint.~~ Done 2026-10-03. Pattern costs are 1–8 items of the pattern's weight (PATTERNS.md), and a wrong-weight item is a near-miss, not a conversion.
- ~~**`characters/npc.js`** `scarf` default off~~ Done 2026-10-02, further: the rig's placeholder
  torus scarf (`buildScarf`, `scarf` / `scarfColor`) is deleted. Characters are bare-necked, and the
  neck slot is only ever an FO.
- **`P1-SPIKE-PLAN.md`**'s `WearableAppearance` sketch should be reconciled with §2's vocabulary.
- Implementation to-dos from tuning on the dress-up page are in `FINISHED-OBJ-TODO.md`.
