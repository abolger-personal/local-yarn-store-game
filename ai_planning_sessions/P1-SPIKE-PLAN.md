# LYS — P1 Spike Plan: Visual Look & Feel + Themes

**Prerequisite:** P0 foundations (Vite/TS/R3F scaffold).
**Runs parallel with:** P6 Ravelry schema research.
**Companion:** [DESIGN-DECISIONS.md](DESIGN-DECISIONS.md)

---

## Purpose

De-risk the three things that get exponentially more expensive to change later:

1. Does the soft-clay diorama look actually feel **cosy**? (the entire product thesis)
2. Does the theme-token system produce genuinely different-feeling shops with **no new geometry**?
3. **Do NPCs read as characters against a wall of 1000 colourful objects, or do they camouflage?**

This is a **rendering testbed**. No simulation, no save, no gameplay, no formations, no NPC
behaviour — but it does include static NPC blockouts and one walk cycle, for the reason in the
NPC section below.

---

## Graduation policy — the spike is not throwaway

Build it as a `/spike` route inside the real repo, not as a separate project.

| | |
| --- | --- |
| **Graduates to production** | `render/geometry/*` builders, `render/theme/*` token system, material definitions, the variety-axis system, the instancing setup, **the anthropomorphic base rig and garment slot system** |
| **Throwaway** | Scene assembly, the debug switcher UI, hardcoded shelf layout |

Keeping these two separate from day one is what makes the spike worth doing rather than a detour.

---

## Geometry families

Minimum eight. Different **silhouettes** are what break clone-stamping — not different colours.

1. **Skein** (twisted hank) — `TubeGeometry` along a Catmull-Rom folded twist.
   **The hero shape.** Hardest and most important; budget the most iteration here.
2. **Ball** — slightly oblate sphere plus a wound-yarn normal map.
3. **Cake** (centre-pull, from a ball winder) — `LatheGeometry`, flat top with a concave centre.
4. **Hank** (untwisted loop) — flattened, draped torus.
5. **Cone** (mill end / weaving yarn) — `LatheGeometry` cone.
6. **Mini-skein** — scaled skein variant; must read as distinct, since these come in bundles.
7. **Pattern booklet** — thin box plus cover plane. A completely different silhouette, and therefore
   excellent for visual rhythm on a dense shelf.
8. **Notions** — needles (cylinder pairs), hooks (cylinder plus bent tip), buttons (short cylinder),
   scissors, stitch markers, tape measure.
   **Deliberately oversized** per the concept — at real scale they are invisible.

---

## Variety axes

This is the real deliverable — the anti-sameyness system.

- Geometry family (8+)
- Per-instance uniform scale jitter (±10%)
- Per-instance subtle non-uniform squash
- Rotation jitter (±8°, matching P2's derived jitter)
- **Palette-constrained hue.** The theme defines N anchor hues; per-instance colour is an anchor plus
  small jitter **in OKLCH**.
  > OKLCH is perceptually uniform, so it keeps lightness consistent in a way HSL does not — and
  > lightness consistency is exactly what holds a pastel palette together.
  > Uniform-random hue destroys the pastel read instantly.
- **Ball band variant** (≥2) — a small contrasting paper ring on the skein. A large readability win for
  almost no cost.
- Fibre "fuzz" level — vary `sheenRoughness` and normal intensity to distinguish mohair from cotton.

---

## NPCs — anthropomorphic animals on a shared base

**Why this is in a look-and-feel spike at all.** NPCs are the harder art problem, not yarn. At
diorama scale a character is roughly 100-200px tall, so faces are invisible and everything the
tells mechanic depends on has to communicate through silhouette, colour and motion alone.

But the specific reason it belongs *here* is narrower: **the camouflage problem.** A character
standing in front of a wall of 1000 saturated pastel objects will visually disappear unless the
palette deliberately reserves a value and saturation range for characters. That is a **theme token
decision**, it must hold across all three themes, and discovering it at P4 means re-tuning three
palettes plus the yarn colour-jitter range after everything else already depends on them.

Secondary coupling: depth of field tuned purely for shelved yarn will likely blur NPCs at the back
of the room into mush. Better to know while the settings are still soft.

### The shared base rig
**Base proportions: roughly 1/3 head, 2/3 body.** Chibi, and deliberately so — this is not only a
cuteness choice, it directly serves the 150px readability constraint. The species signal lives in the
head (ears, muzzle, horns, eyes), so making the head a third of the figure makes that signal
proportionally huge. Every cosy and mobile game uses these proportions for exactly this reason.

Secondary benefits: hats get a bigger, more readable target; large flat colour masses separate more
cleanly from a busy yarn wall; and short legs mean the walk is a waddle rather than a stride, which is
both easier to animate and more charming.

> **Big eyes may partially rescue facial expression.** The working assumption has been that faces are
> invisible at diorama scale. With chibi proportions and large eyes that is only half true — full
> expression will not read, but **gaze direction and blinks probably will**. An NPC visibly glancing
> at a shelf is a tell the player can catch, which is a cheap and legible addition to the
> hidden-inventory mechanic. Worth testing during the spike blockouts.
Species is the identity anchor \u2014 a koala is memorable as a repeat customer in a way that
"person with brown hair" is not. But **all species share one body**: torso, upper and lower arms,
hands/paws, upper and lower legs, feet, neck. Identical proportions throughout.

Species differs **only above the neck and behind**: head shape, ears, muzzle, tail, markings.
This is the Animal Crossing approach, and it is what makes garments authorable once rather than
once per species.

| Layer | Contents |
| --- | --- |
| **Shared body** | torso, arms, hands, legs, feet, neck \u2014 identical across all species |
| **Species kit** | head, ears, muzzle, tail, markings |
| **Garment slots** | head (hat) · neck (scarf, cowl) · shoulders (shawl) · torso (sweater) · bag · feet (socks). No mittens. Superseded by `characters/VISUAL-DESIGN-FINISHED-OBJ.md` |

> **Superseded for finished objects (2026-09-26).** The garment research below is kept for its
> reasoning, but where it disagrees with `characters/VISUAL-DESIGN-FINISHED-OBJ.md`, that spec wins.
> Superseded here:
> - "one form per slot, colour only"
> - the knit normal map and constant gauge
> - the garment value band
> - colourwork from purchase history (now only a fallback)
> - the slot list
> - "most NPCs wear 0–2 items"
> - waist-hung long garments
> - identity by signature accessory from day one
>
> Look costs are tracked in `characters/WEARABLE-LOOK-VS-PERFORMANCE.md`.

### Rigid segmentation makes garments *easier*, not harder

The no-skeleton decision and the wearable-finished-objects requirement are synergistic. Because
characters are rigid segmented, a garment is just **another mesh parented to a body node** \u2014 a
sweater is a slightly larger torso shell, mittens are slightly larger hand meshes, a hat parents to
the head node. No skinning, no weight painting, no per-species refitting.

Had we chosen skinned meshes, every garment would need rigging against every body.

### Which garments to prioritise

**TODO (post-MVP): wearables need appearance attributes beyond colour.**

The spike's scarf is a `TorusGeometry` placeholder — it reads as a collar, not a scarf. It has no
length, no ends, no drape and no fringe. Colour is currently the *only* thing that varies, which is
nowhere near enough for a game where the finished objects are the point.

**The key idea: derive appearance from the source yarn and pattern, do not author it per object.**
The catalog already carries weight, fibre and colour family. A scarf knitted from bulky wool should
be thick and stiff; one from laceweight silk should be thin and drapey. That link is not decoration —
**it makes a returning NPC's finished object into visible evidence of what they bought**, which feeds
the tells mechanic directly. The player sees a chunky red scarf and can infer the purchase.

Sketch of the schema:

```
WearableAppearance = {
  slot:       'neck' | 'head' | 'torso' | 'hands' | 'feet' | 'carried'
  form:       how it is worn - draped | wrapped once | wrapped twice | tied | tucked
  dimensions: { length, width, bulk }        // bulk derived from yarn WEIGHT
  drape:      0..1                           // derived from FIBRE (stiff linen .. fluid alpaca)
  edge:       'rolled' | 'ribbed' | 'fringed' | 'picot' | 'scalloped'
  stitch:     'stockinette' | 'garter' | 'rib' | 'seed' | 'cable' | 'lace'
  colorwork:  { type: 'solid' | 'stripe' | 'fairisle' | 'marled', colors: [] }
}
```

Notes on the pieces:

- **`stitch` is the procedural texture**, as a normal map. Must be **object-space projected** so gauge
  stays constant regardless of garment size — see the material section. Cables read best when small.
- **`colorwork` can derive from purchase history.** Two colours bought together implies stripes;
  three or more implies fair isle; a marled look implies held-together strands. More visible evidence.
- **`edge` and `form` are the silhouette-break work** already identified as the most reliable way to
  make a worn garment read at 150px. Fringe in particular is a strong silhouette cue.
- **`drape` may be fakeable without simulation** — pick from a few pre-shaped meshes rather than
  computing cloth. Worth testing before anything expensive is attempted.

**Post-MVP.** MVP ships one form per slot with colour variation only. But the *schema* is worth
settling before P5 builds the craft loop, because that is where finished objects start being
generated from real purchases.

Original priority note follows.

Most knitting output \u2014 shawls, scarves, hats, socks, mitts \u2014 drapes on any body and needs no
per-species fitting. **Lean on those categories first.** Fitted sweaters are the one category that
genuinely wants per-species torso variants, so treat them as a later addition rather than a
launch requirement.

### Species shortlist

Aim for roughly 8-12 shipped species with **maximally different silhouettes** rather than many
similar ones — memorability comes from distinctiveness, not count. The candidate set below is
grouped by *what carries the silhouette*, because that is the axis that has to differ.

**Pick at most one or two per family.** Within a family the shapes converge, and at 150px they
become the same character in different colours.

### Ears carry it

| Species | Fibre | Rig notes |
| --- | --- | --- |
| Rabbit | Angora | Easy. Tall soft ears, iconic |
| Koala | — | Easy. Round ears, round everything |
| Fennec fox | — | Easy. Enormous triangles |
| Elephant | — | Easy. Ears + trunk, both additive |
| Bat | — | Wings — see the wing note below |
| Donkey | — | Easy, but converges with rabbit |

### Neck carries it

| Species | Fibre | Rig notes |
| --- | --- | --- |
| Llama | Alpaca, camelid | Easy. `neckScale` — the reference case for the scale rule |
| Giraffe | — | Easy. More extreme llama; pick one, not both |
| Camel | Camel down | Easy. Neck + hump, dual signal |
| Goose | Down | Wings — see below |

### Head or face carries it

| Species | Fibre | Rig notes |
| --- | --- | --- |
| Owl | — | Flat disc face, no visible neck. Very distinct. Wings |
| Goat | Mohair, cashmere | Easy. Horns, beard, rectangular pupils |
| Moose | — | Easy. Palmate antlers, droopy snout |
| Frog | — | Easy. Wide flat head, eyes on top |
| Toucan | — | Beak dominates. Wings |

### Body mass and stance carry it

| Species | Fibre | Rig notes |
| --- | --- | --- |
| Bear | — | Easy. Tall heavy mass |
| Sloth | — | Easy. Hunched, long arms. A natural slow browser |
| Hippo | — | Easy, but converges with bear |
| Pig | — | Easy, but converges with bear |
| Penguin | — | Flippers, no visible legs. Awkward on a bipedal base |

### Shell or carried structure carries it

| Species | Fibre | Rig notes |
| --- | --- | --- |
| Snail | — | Spiral shell echoes a yarn cake. **No legs — awkward on the base** |
| Tortoise | — | Easy. Dome shell, stubby limbs |
| Armadillo | — | Easy. Banded shell, pointed snout |
| Hermit crab | — | Claws instead of hands. Garment slot conflict |

### Surface texture carries it

| Species | Fibre | Rig notes |
| --- | --- | --- |
| Sheep | Wool | Easy. Fleece as a cloud-shaped mass |
| Hedgehog | — | Easy. Spiky dome |
| Porcupine | — | Easy. Quills. The needle joke writes itself |
| Musk ox | **Qiviut** | Easy, and a standout. Floor-length fleece skirt plus a helmet-like horn boss — two signals at once. Qiviut is the most expensive fibre in the world |
| Yak | Yak down | Easy. Very long side fringe, small horns |
| Bison | Bison down | Easy. Shoulder hump dominates |
| Highland cow | — | Easy. Wide horns plus a fringe over the eyes. Extremely cosy |

> **Collision warning — the shaggy horned herbivores.** Sheep, musk ox, yak, bison, goat, highland
> cow and ram all converge at 150px. They *are* separable — sheep is cloud fleece with small horns,
> musk ox is a floor-length skirt and helmet boss, goat is angular with a beard and back-swept horns,
> yak is a long side fringe, bison is a shoulder hump — but it takes deliberate care.
> **Ship sheep plus at most one other from this group.**

### Extra limbs or appendages carry it

| Species | Fibre | Rig notes |
| --- | --- | --- |
| Spider | Silk | Additive limbs. See the arachnophobia caution above |
| Octopus | — | Eight arms, no legs. Awkward on the base |
| Peacock | — | Tail fan. Wings |

### Horns and antlers are not the same problem

**Horns work. Most antlers do not.** Horns (musk ox, goat, ram, bison, highland cow) are solid curved
masses and read cleanly when small.

Antlers split by type, and it is the same finding as the spider's legs:

- **Palmate antlers** — moose, fallow deer. Broad flat paddles, so they are *masses* and survive being
  small. These work.
- **Tined antlers** — elk, red deer. Thin branching structures that alias into a fuzzy halo at
  150px. **Avoid.**
- **Reindeer** sits between the two; its flattened brow shovels help, but treat it as risky.

> **Antlers and horns collide with the head garment slot.** They emerge from exactly where a beanie
> sits. See "Two rig cautions" below — this is a bigger problem than it first appears.

### Two rig cautions

**Birds: wings must ADD to arms, not replace them.** If a wing substitutes for the arm node, mittens
have nowhere to go and every garment needs a bird variant. Give birds normal arms with wing-feather
geometry attached. Same rule as the spider, different animal.

**Some species fight the bipedal base.** Snail, octopus and penguin have no legs to speak of;
hermit crab has claws where hands go. All are charming and none are MVP material — they need the
base rig proven first.

### The waist split — one upper body, two lower bodies

The legless species are worth accommodating, and doing so is far cheaper than it first appears
**provided the split is at the waist.**

Define the base as two halves. The **upper body is always shared** — torso, arms, hands, neck, head.
The **lower body is a variant**: `lowerBody: 'legs' | 'skirt'`.

| Garment slot | Legged | Skirt |
| --- | --- | --- |
| Head | works | works, unchanged |
| Neck | works | works, unchanged |
| Torso | works | works, unchanged |
| Hands | works | works, unchanged |
| Carried | works | works, unchanged |
| **Feet** | works | **only slot that breaks** |

Five of six slots survive untouched. Socks are the sole casualty, and socks on a snail were never
viable anyway — a gastropod is literally a "stomach-foot". Skip the slot for skirt species, or author
one cosy foot-cover variant.

**Unlocks:** penguin, snail, slug, octopus (the arms *are* the skirt), jellyfish — anything sessile
or gliding.

**It makes animation cheaper, not dearer.** Skirt-base characters glide or waddle rather than walk:
no leg IK, no foot placement, no contact timing. That removes the hardest part of the one genuinely
animation-shaped task in the spike.

**Do not build the skirt base in MVP.** The trio is sheep, llama and owl, all legged. What *is* nearly
free right now is **deciding where the waist node sits** — retrofitting that boundary later means
touching the rig and every garment attachment point. Same pattern as the theme tokens: ship one, build
the plumbing. A height offset on the waist node lets a skirt torso sit sensibly without legs, which
the add-or-scale rule already covers.

#### Where the waist node goes — decided

```
root
└── waist                    <- the variant boundary
    ├── torso                   shared, always
    │   ├── neck -> head -> ears / muzzle / horns
    │   ├── armL -> forearmL -> handL
    │   └── armR -> forearmR -> handR
    └── lowerBody               variant: legs | skirt
        └── legL/legR -> shin -> foot
```

**Put the boundary at the hip line** — the bottom of the torso, the top of the legs.

The governing principle: **the boundary must sit below the hem of any torso garment**, so no garment
ever crosses the swap point. Placing it at the anatomical waist (the narrowest point) puts a sweater
hem *below* the boundary, which forces every torso garment to handle both lower bodies. A ribcage
split is worse still.

**Joining the halves.** With no skinning the two meet at a hard seam. Prefer to **disguise it as a
form transition** — a penguin's belly line, a snail's mantle edge, a musk ox's fleece skirt — and fall
back to a slight geometry overlap where no natural line exists. Blending would require skinning and is
ruled out.

**Cheap insurance: give the waist node its own garment attach point.** Long garments — cardigans,
dresses, wraps — hang below the hip and therefore do cross the boundary. Hanging them from the waist
means they are authored **per lower body (two variants)** rather than per species. This costs nothing
now and defers the whole question of long garments safely past MVP.

> **Guardrail: two lower bodies maximum, and never a quadruped base.** A horizontal-spine rig breaks
> every torso garment and abandons the anthropomorphic conceit. Written down explicitly because
> "well, a real llama walks on four legs" is exactly the reasonable-sounding suggestion that turns up
> at month four.
>
> **It turned up within the hour.** Reference art for the llama was quadruped, and the decision was
> **bipedal**. Recording the reasoning so it does not have to be re-argued:
> - A quadruped rotates the torso horizontal, so sweaters become coats and the whole torso garment
>   set needs re-authoring.
> - Front legs become the arms: hooves on the floor mean no mittens, no project bag, no carrying a WIP.
> - It is a genuine second rig, not a lower-body variant. The waist split does not help, because what
>   changes is *above* the waist.
> - It undercuts "they come back wearing their finished work", which is the payoff of the core loop.
>
> **What to borrow from quadruped reference art:** the neck curve, head shape, ear shape and scalloped
> fluff outline. At 150px the **neck-and-head profile does nearly all the identifying work** — leg
> count barely registers in the silhouette. Stand the same shape upright and it still reads llama.
> This is the Animal Crossing idiom, where every villager is bipedal regardless of real anatomy.

**Hermit crab is not solved by this.** Its claws are a *hand* problem, not a lower-body one, and
mittens on claws fail. Leave it out.

**The head garment slot is the most species-sensitive slot, by a wide margin.** Ears, horns and
antlers all occupy the space a hat wants. A beanie on a rabbit needs ear holes; on a moose it has to
sit behind the palms; on a musk ox it competes with the horn boss. Every long-eared or horned species
is a special case.

This is worth knowing because knitters make a *lot* of hats, so the slot cannot simply be dropped.
But it should be treated as the **hard** garment slot rather than an easy one, and neck, torso and
hand garments should carry the MVP.

**Fibre-bearing species are worth favouring.** Sheep, llama, goat, rabbit, musk ox, camel and spider
all come with a built-in affinity that makes hidden-inventory tells legible without explanation.

> Suggested MVP trio: **sheep, llama, owl.** Sheep is the thematic bullseye and tests fleece as a
> texture silhouette. Llama exercises `neckScale`, which is the rule most likely to be wrong.
> Owl has no visible neck at all and a head-dominant silhouette, so it stresses the opposite end.
> Three different pressures on the rig, all uncontroversial, two with fibre affinities.

> A sheep buying wool is a joke worth building in. So is a snail who takes all day to choose, and a
> llama with strong opinions about alpaca blends.

**Species kits may ADD or SCALE, never REPLACE.** This is the rule that keeps garments authorable once. A kit
may attach extra geometry to existing body nodes — ears, muzzle, tail, shell, additional limb pairs
on the torso — but may not substitute different geometry for the shared torso, arms, legs or neck, though it may apply
a *scale* to a shared node. Anything that changes the base skeleton is a second rig, and a second rig
means re-authoring every garment.

Scaling is safe because the node hierarchy is unchanged and only the transform differs, so anything
parented below a scaled node still inherits correctly.

*Worked example: a llama.* Its defining feature is a long neck, and the neck is shared-base
equipment, so a llama is illegal under a strict add-only reading. Under add-or-scale it becomes a
neck-length parameter. The hat still sits on the head, the sweater still sits on the torso, and the
walk cycle is untouched because the legs never moved. The only consequence is that the **neck garment
slot must be length-aware** — one parameter, one slot. A llama in a very long scarf is a feature.

> **Chibi proportions break a naive multiplier here — use an absolute neck length.**
> At 1/3-head proportions the neck is visually almost nonexistent, so a `neckScale: 2.5` multiplier
> applied to a near-zero base is still near-zero. Two fixes, and the second is better:
> 1. Express neck length as an **absolute value**, not a multiplier.
> 2. Give the base neck **real length that is visually concealed** by head-and-torso overlap. The
>    owl reference shows this exactly — head and body merge into one mass with no visible neck, while
>    the node underneath still has usable length.
>
> Option 2 keeps the neck garment slot working on every species, including the ones with no apparent
> neck at all. **The neck node must never have zero length**, however hidden it is.

**Target llama proportions: 1/3 head, 1/3 neck, 2/3 torso-and-legs.**

**The neck ADDS height. It must never compress the torso.** This is the whole point:

| | Head | Neck | Torso + legs | Total |
| --- | --- | --- | --- | --- |
| Owl | 1/3 | ~0, hidden | 2/3 | 1 |
| Llama | 1/3 | 1/3 | 2/3 | 1⅓ — the tallest species |

The torso keeps identical absolute dimensions across both, so a sweater authored once fits everyone.
The failure mode is the other reading — fixing total height and letting the neck eat into the torso,
which gives the llama a shorter torso than everyone else and forces per-species sweaters. Same trap as
before, reached by a different route.

*Casualty of chibi:* the **giraffe** does not survive these proportions and should be dropped
(llama or giraffe was always an either/or). The llama itself is the species most compressed by chibi
— a stubby llama still reads, but it is the one to check first.

> The tempting alternative, redefining the split as "species owns the head *and* neck", is
> conceptually cleaner but worse in practice. It makes scarves and cowls per-species, and those are
> exactly the drape-y categories being prioritised because they fit any body. Scaling keeps that
> slot universal.

*Worked example — a spider.* Silhouette-wise excellent: instantly recognisable and radically unlike
the mammals. But a literal spider is eight legs, no neck, no tail, and a horizontal body — a whole
second rig, and a sweater with eight armholes. Built **anthropomorphic** instead (upright, standard
two arms and legs, extra limb pairs added to the torso, extra eyes on the head) it costs nothing
beyond a normal species kit.

Two cautions if it gets built:

- **Thin limbs do not survive diorama scale.** What makes a spider legible in an illustration is thin
  legs radiating into negative space; at 100-200px those alias away and leave a blob. The stylised
  chunky version reads *better* than the accurate one here. Contrast the llama, whose long neck is a
  chunky mass and therefore survives being small.
- **Arachnophobia is a real consideration for a cosy game specifically**, where the entire promise is
  low-stress. Animal Crossing and Stardew both use spiders as threats rather than villagers. The
  soft-clay direction mitigates a lot, but an accessibility toggle may be warranted later.

Thematically it is the strongest candidate on the list — spiders spin, which makes them the obvious
archetype for the post-MVP spinning chain, and a regular who produces their own silk and therefore
never buys anything is a good joke. Just prove the base rig on uncontroversial shapes first.

**Favour species with built-in fibre affinities.** They give the hidden-inventory tells something
legible to hang on: sheep (wool), llama (alpaca and camelid blends), spider (silk), rabbit (angora).
An NPC who will only buy one fibre — or who is faintly offended by it — is a tell the player can read
without any explanation at all.

**Do not assume ears are the species signal.** It varies, and building the kit system around "swap
the ears" will fail the moment you reach the llama:

| Species | Primary signal |
| --- | --- |
| Rabbit, koala | Ears |
| Llama | Neck length |
| Snail | Shell |
| Bear | Body mass and stance |
| Owl | Head shape and eyes |
| Spider | Extra limbs |

The kit system therefore needs to address head, ears, muzzle, tail, added geometry **and node scale**
as equal citizens, rather than treating ears as the primary axis with the rest as extras.

**On borrowed reference material.** Animal-ear mask sets and similar stock collections are a poor
base for this, for two reasons. They over-represent near-identical silhouettes (cat, dog and wolf
ears are barely distinguishable at 150px) because they optimise for costume variety rather than
readability at scale. And they are front-facing only, whereas an orbit camera shows characters mostly
at 3/4 and side — a flat frontal ear shape can vanish in profile. Useful as a *negative* checklist for
spotting which species collapse into each other; not useful as modelling reference.

Also check the licence. Stock licences generally do not cover deriving game assets from the artwork,
and adapting into 3D is usually outside even extended terms.

### Identity beyond species

With many NPCs present, species alone is not a unique identifier \u2014 there will be several
koalas. Memorable repeat customers need **species + fur palette + a signature accessory**:
*"the koala with the red scarf."* This matters *more* with only ~10 in the shop at a time, not less:
the player sees the same species recur across days, so recognising an individual is the point.
Worth blocking out in the spike, because it affects how much palette range characters need.

### What the spike actually builds

- The shared base rig plus **3 species kits** (enough to prove the swap works)
- **One walk cycle** on the shared rig
- **2-3 garment slots** populated, to prove garments parent cleanly and read at scale
- A reserved **`characterRange`** in the theme palette schema, validated across all three themes

Not in the spike: the procedural character generator, behaviour, pathing, facial expression,
the remaining species.

### Draw call note

Only **~10 NPCs are ever in the shop at once** (the remembered roster of a few hundred is
event-driven and costs nothing while dormant), so the character budget is comfortable.

It is not free, though: species variety means many distinct small geometries (8-12 species × head,
ears, tail), and `InstancedMesh` needs one draw call per distinct geometry. Ten characters rendered
naively as individual part meshes is roughly 150 draw calls — survivable, but wasteful.
**This still tips the earlier "decide after measuring" call toward `BatchedMesh` for NPCs**, which
handles many distinct geometries in a single draw call.

Garment slots are cheap in practice: an unoccupied slot renders nothing, and most NPCs wear zero to
two items.

### Concept art — what helps, what hurts

2D concept art **helps a great deal for this project, but only certain kinds.** The distinction is
whether the artwork is a *specification* or an *illustration*.

**Helps — do these:**

| Artefact | Why |
| --- | --- |
| **Flat black silhouette thumbnails** | Silhouette is the primary readability channel at diorama scale. You can draw 20 species in the time it takes to model one, and it directly pre-tests exit criterion 6 |
| **Orthographic turnarounds** (front + side) of the shared base | Loads straight into Blender or three.js as reference planes. Not just inspiration \u2014 an actual modelling aid |
| **Base proportion studies** (head-to-body ratio, limb length, stance) | Every species kit and every garment depends on these. Cheap to iterate on paper, expensive to change once the rig exists |
| **Colour keys** \u2014 small paintings of characters against a yarn wall | Tests `characterRange` in minutes rather than building the 3D scene first. Squint at it; if the character dissolves, the range is wrong |
| **Garment sheets** \u2014 how each slot sits on the base | Answers where a sweater ends, how a scarf drapes, what carrying a blanket looks like |

**Hurts — avoid these:**

- **Rendered hero portraits.** They set an expectation the low-poly 3D cannot meet, and they bake in
  form that only reads from one angle. The orbit camera has to work from *every* angle.
- **Detailed faces.** 2D naturally wants them; at 100-200px they are invisible. Concept art will make
  you want facial detail the game cannot use.
- **Dynamic action poses.** These characters walk, stand and browse. Nothing else.
- **Unbuildable detail** \u2014 fur, floaty hair, asymmetric trims, complex overlapping forms. All free in
  2D, all expensive in rigid segmented low-poly.
- **Anything at a camera angle the game never uses.**

> **The trap is emotional, not technical.** A beautiful piece of concept art creates attachment, and
> the 3D will inevitably diverge from it. That divergence then feels like failure rather than
> translation. Specification-style art (silhouettes, turnarounds, colour keys) does not create that
> attachment, which is part of why it is the useful kind.

If generating the art rather than drawing it, constrain hard toward flat orthographic turnarounds
and silhouettes \u2014 generative tools default to exactly the painterly, detailed, view-inconsistent
output listed above.

---

## Material

One `MeshPhysicalMaterial` per family with `sheen` / `sheenColor` / `sheenRoughness`, a shared fuzz
normal map, and per-instance colour via `instanceColor`.

**Sheen needs environment light to read at all**, so the `<Environment>` is not optional.

Defer per-instance sheen (instanced attribute plus `onBeforeCompile`) unless the spike proves the need.

### Characters are FELTED. Garments are KNITTED.

This single decision does two jobs at once: it separates worn garments from bodies, and it keeps the
whole look clear of Animal Crossing.

| | Surface | Sheen | Normal |
| --- | --- | --- | --- |
| **Body** | Needle-felted fibre — fuzzy, light-scattering | High `sheenRoughness`, diffuse | Soft, broad |
| **Garment** | Knitted — defined stitches | Tighter, crisper highlights | Stitch pattern |

Needle-felted animals are a real fibre craft, they are naturally chibi-proportioned, and a shop full
of felted creatures is thematically exact. It also means **garments separate by material response
before any colour contrast is spent on it.**

### Making a worn garment read at 150px — in priority order

1. **Silhouette break. Geometry, not shading.** The only fully reliable method at this size. A ribbed
   cuff that flares, a rolled hem, a chunky collar. Shading is subtle when small; a changed outline is
   not. Cheapest, most effective, and it is modelling work rather than shader work.
2. **Material differential** — the felted/knitted contrast above. Effectively free, since sheen is
   already in the budget.
3. **Value contrast via a garment sub-range** in the palette, alongside `characterRange`. Fur occupies
   one lightness band, garments another.
4. **Knit normal map \u2014 projected in OBJECT SPACE, not UV space.** If the stitch pattern is UV-mapped,
   stitch size scales with garment size, so a large sweater gets large stitches. **Real knitting holds
   consistent gauge regardless of garment size, and this audience will notice immediately.** Triplanar
   or object-space projection keeps gauge constant. Swappable patterns worth having: stockinette,
   garter, ribbing, cable. Cables survive small sizes best, being large-scale relief.
5. **A cheap Fresnel rim on garments only.** Emphasises the boundary, which is precisely what reads as
   "wearing something" at small scale.

### Staying clear of the Animal Crossing read

Chibi proportions and upright animals are shared with Animal Crossing, so the differentiation has to
come from material and light. Most of these axes already diverge \u2014 listed so they are not casually
given back:

| Axis | Animal Crossing | LYS |
| --- | --- | --- |
| Material | Matte moulded plastic, no specular | Fibre \u2014 sheen, felted fuzz, knit relief |
| Faces | **2D textures on a 3D head** | Geometry. **Avoid the texture-face look** \u2014 it is their single most recognisable feature |
| Palette | Saturated, high-key | Pastel, low-contrast, theme-driven |
| Lighting | Flat, even, minimal shadow | Warm key, cool fill, soft contact shadows, rim |
| Post FX | None | DOF / tilt-shift \u2014 reads "miniature diorama", not "game world" |
| Camera | Ground-level third person | Orbiting into a box |

**Material and depth of field carry the most weight.** Flat even lighting on matte characters with no
DOF *is* the Animal Crossing look, and both halves are already rejected. The one thing to actively
avoid is the flat texture face.

---

## Lighting rig

- Warm key directional (the shop window), cool hemisphere fill, subtle rim.
- drei `<Environment>` with a soft indoor HDRI. Use the built-in presets first — custom HDRIs cost
  download size on a statically-hosted game.
- Static room shell: `<AccumulativeShadows>` or baked AO.
- **Items cast no shadows** (locked performance rule #6).

---

## Post FX

This is where the "miniature" feeling actually comes from.

- **Bloom** — subtle, high threshold.
- **Vignette.**
- **Depth of field** — *the* miniature lever, giving the tilt-shift read. Also the most expensive
  pass, so plan for a quality toggle.
- **Tone mapping** — try **AgX** (three r160+) before ACES. AgX handles pastels better and avoids
  the saturation crush ACES applies to soft palettes.
- **Chromatic aberration** — off. Wrong vibe.

---

## Theme token schema

```ts
type Theme = {
  id: string
  name: string
  palette:  { anchors: string[]; wood: string; wall: string; floor: string; metal: string; accent: string
              // Reserved lightness/chroma range for characters so NPCs never camouflage
              // against the merchandise. Must not overlap `anchors`.
              characterRange: { lightness: [number, number]; chroma: [number, number] }
              fur: string[] }
  env:      { hdri: string; intensity: number; rotation: number }
  lights:   { keyColor: string; keyIntensity: number; keyAngle: number
              fillColor: string; fillIntensity: number; rimColor: string }
  material: { sheenRoughnessBase: number; clearcoat: number }
  displaySet: string
  postFx:   { bloom: number; dof: number; vignette: number; toneMapping: 'agx' | 'aces' }
}
```

The `characterRange` is the anti-camouflage mechanism. Yarn hues are drawn from `anchors`;
character fur is drawn from a range that is deliberately disjoint in lightness and chroma, so a
character always separates from the wall behind them regardless of which theme is active.

---

## The three spike themes

Chosen to prove **range**.

1. **Cottage** — warm oak, cream walls, dusty pastels, golden-hour key. The default cosy.
2. **Gothic / Vampire** — the concept explicitly mentions vampire-themed notions. Dark walnut and
   black, deep jewel tones, candlelight warm-on-dark, higher contrast, more bloom.
3. **Nordic** — pale birch, white walls, cool grey-blue light, desaturated, minimal bloom.

> **Rigour rule: keep displays and geometry identical across all three.**
> Vary only palette, lighting and post FX. If three shops still feel different under that
> constraint, theming is proven, and display variation later becomes a bonus rather than a
> requirement. Allowing display swaps in the spike would make it look better while proving much less.

---

## Steps

- **A. Single-object gate** — scaffold, skein geometry, sheen material, light rig, post FX.
  **This is a go/no-go gate.** If one skein under this rig is not appealing, stop and iterate here.
  Do not build seven more shapes on top of a look that is not working.
  - **Also drop in a grey capsule at character height** beside the first shelf, **at chibi
    proportions (1/3 head, 2/3 body)** rather than a plain cylinder — the head mass is a third of the
    silhouette and affects how the shop reads. Not a species, not a rig, not animated — a scale
    reference. Shelf height, slot size and item size are all implicitly relative to how tall a
    customer is, and discovering the proportions are wrong after 200 items exist means re-scaling
    everything. Scale reference and NPC blockout are **different things at different times**; this is
    the cheap one.
- **B. Remaining seven families** — parallelisable, independent builders.
  - *In parallel, on paper:* the **flat-black silhouette pass** for sheep, llama and owl. Answers
    "are these three distinguishable?" before any 3D character exists, and costs nothing.
- **C. Variety axes and instancing** — OKLCH colour jitter, scale/rotation/ball band variants,
  `InstancedMesh` per family, populate a dense shelf wall.
- **D. Scale test** — render 200 for visual judgement, then bump to **1000** purely as a performance
  check. It is just a number in the spike, so test the real ceiling now while it is free.
- **E. NPC blockouts** — *depends on C, parallel with F.* Shared base rig, 3 species kits, one walk
  cycle, 2-3 populated garment slots. Stand them in front of the dense shelf wall. **This is the
  camouflage test**, and it is the reason `characterRange` exists in the schema.

  > **Why NPCs come after the yarn, despite being the harder art problem.** The camouflage test
  > *requires* merchandise to exist — you cannot check whether a character dissolves into a wall of
  > 1000 objects without the wall. Building characters first means discovering the problem later and
  > re-tuning the character *and* three palettes. The grey capsule in step A covers the one thing
  > about characters that genuinely cannot wait: scale.
- **F. Theme system** — token schema, the three themes, keyboard switcher (1/2/3), side-by-side
  screenshot harness. `characterRange` validated across all three.
- **G. Tuning and judgement.**

---

## Exit criteria

Go/no-go before P2.

1. A dense wall of **200 items reads as a curated stash, not clone-stamped.**
   Judge on **stills**, not in motion — motion hides repetition.
2. All **three themes feel like different shops** despite identical geometry and displays.
3. **1000 items: draw calls ≤ ~12, 60fps on integrated graphics.**
4. A single skein, viewed close, holds up.
5. **NPCs separate clearly from the merchandise in all three themes.** Test this the honest way:
   squint, or blur the screenshot heavily. If the character dissolves into the shelf behind them,
   `characterRange` is wrong.
6. **Species is identifiable in silhouette alone.** Render the blockouts as flat black shapes —
   if you cannot tell the koala from the fox, the species kits need stronger shapes, not better
   materials.
7. **The walk cycle reads at diorama distance** and survives the depth-of-field settings.
8. **A garment parents cleanly to the shared rig** and stays readable at scale.9. **A worn garment is obvious at 150px in a blurred screenshot.** If the sweater only reads when
   you zoom in, the silhouette break is not doing enough work and no amount of shader detail will
   rescue it.
10. **Nobody's first reaction is "Animal Crossing".** Show a still to someone cold. If that is the
    first comparison, the material contrast or the lighting is not pulling its weight.
> If (1) fails, fix it **here** by adding variety axes. Fixing it after P2 means rewriting the
> instancing attribute layout that everything else sits on.

---

## Risks

- **Skein geometry is the hardest single asset in the game** and also the most-seen. Expect real
  iteration; do not timebox it aggressively.
- `sheen` adds measurable shader cost — measure it at 1000, not at 10.
- Depth of field is the most expensive post pass and may need a quality toggle for weaker GPUs.
- HDRI download size matters for a statically-hosted game. Prefer drei presets or small compressed maps.
- **Judging "cosy" is subjective.** Mitigate with the screenshot harness and side-by-side comparison,
  decide from stills, and get a second pair of eyes.
- **The walk cycle is the one genuinely animation-shaped task in the spike**, and rigid segmented
  characters make walking harder to get right than skinned ones — there is no deformation to hide
  behind, so the timing and the arc of each limb carries everything. Budget for iteration, and
  consider exaggerating the bounce rather than aiming for realism.
- **Fitted sweaters may not survive contact with varied species silhouettes.** If the spike shows a
  torso garment reading badly, fall back to drape-y categories (shawls, scarves, cowls) and treat
  fitted knitwear as a later problem — it is most of what knitters make anyway.
