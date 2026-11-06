# Bodies: the shared rig and the species kits

How a character's body is built and posed (`characters/npc.js`) and what each species kit adds
(`owl.js`, `llama.js`, `lion.js`). The governing rule is P1-SPIKE-PLAN.md's **species kits may ADD or
SCALE, never REPLACE**: npc.js owns torso, arms, hands, legs, feet, neck and the shared machinery; a
kit owns everything above the neck plus whatever it bolts on (wings, fleece, mane, tail dressing). The
base never builds head geometry, wings or a coat — baking one in is how a shared rig becomes a
single-species rig.

Everything is judged at play distance: characters are ~150px tall.

## Rig

- Node names follow the VRM humanoid bone set (hips, spine, chest, neck, head, upperArm, lowerArm,
  hand, upperLeg, lowerLeg, foot), so retargeting stays a mapping table. The character faces +Z; its
  right side is -X.
- Proportions normalise total height to ~1.0 for the owl.
- **Neck length is real even when concealed, never zero.** A multiplier on a near-zero neck stays
  near-zero, which would make a long-necked species impossible.
- Hips sit *into* the torso (`hipInset`) and above the waist plane, so the thighs penetrate the torso
  sphere; butted against it, they leave a gap.
- The spine pivots at the waist plane, so a lean folds the upper body rather than shearing it.
- The leg chain splits 55/45 femur/tibia (`femurOf`/`tibiaOf`); building, grounding and seating all
  use the same split.
- Limbs are tapered segments (`LIMB_TAPER` 0.78, baked into the shared geometry — a per-character
  taper would mean per-character geometry) with a sphere at each visible joint. Flat-capped cylinders
  butted together read as a robot arm. Caps are skipped where a joint is buried in the torso.
- The neck and head rotate in YXZ order: XYZ applies pitch before yaw and injects a parasitic roll
  into a head that is turned and tilted down.
- The held item (a skein with a band) is always built and only shown/hidden, so poses change without
  a rebuild. Wings, for species that have them, attach to the upper arm.

### Pose channel conventions

- `armOut`: shoulder outward rotation; ~1.57 straight out sideways, ~3.0 overhead.
- Positive `armSwing` takes the arm *backward*, so carrying wants a small negative swing — the upper
  arm stays near vertical and the elbow does the work.
- Positive `kneeBend` takes the heel backward (the natural knee).
- `hipFlex` moves both legs forward together; positive brings the knees *up* (opposite sign to
  `legSwing`, because flexion reads that way).
- `spineBend` positive folds the chest toward +Z. `spineRoll` positive leans to the character's left —
  the only side-to-side motion on the rig. `spineTwist` positive turns the chest left while the hips
  stay put; shoulders-against-hips is the read of a floss and half of a strut.
- `armSwingAlt` is anti-symmetric arm swing; positive is contralateral to positive `legSwing` (the walk
  counter-swing). `armOutAlt` is anti-symmetric arm elevation; positive raises the left arm and lowers
  the right. A port de bras needs it, and it is clamped per side.
- `headYaw` positive turns left; `headPitch` positive looks down; `headTilt` positive takes the top of
  the head left.
- `earPerk` hinges the ear forward/back (the expression channel); `earSplay` adds outward tilt *on top
  of* the species' resting tilt.
- `tailLift` raises from the species' resting droop (negative tucks); `tailWag` 0 still, 1 a happy wag.
- `earFlap` swings the ears outward on the wag clock, 0 still, 1 a flap of `FLAP_AMP` (0.9 rad).
- `blink` 0 open, 1 shut; never interpolated (MOTION.md).
- `pose` sliders apply without a rebuild; `rig` sliders change the mesh and need one.

## Arms

- Arms sit at the torso surface plus the species' **coat bulge** (how far the coat stands proud of the
  torso, in torso-radius fractions), or a thick coat swallows the limb and only the hand shows.
- `clampArmOut` (opt-in per species) is the smallest `armOut` that keeps the elbow outside the body,
  coat included. Species whose arms are meant to be visible turn it on; a concealed arm (an owl's,
  inside its wing) stays inside. It is scanned (24 samples over a quarter turn, interpolated between the
  bracketing samples so it is smooth in `armSwing`) and allocation-free because it runs per character
  per frame.
- The clamp is applied to the output only, per side, and never written back into the interpolator
  (MOTION.md invariant).

## Legs and grounding

- **Leading leg bends, trailing leg stays nearly straight** (`kneeAmount`): the swing leg tucks, the
  push-off leg doesn't. With no swing (standing, sitting, crouching) both knees take the full bend.
- The walk layer's knee lift is rectified per side (`swingKnee`): the swing leg flexes, the stance leg
  stays straight. Grounding and posing must both use it.
- Grounding drops the root so the lower foot rests on y = 0, from hip and knee angles alone — pure
  arithmetic, every frame. `groundOffset` is added on top (seat lift, arrival tween).
- Lateral lean lives on the spine, not the hips, so it never desyncs grounding.

## Seating

- Hips go one femur-length behind the chair's front edge (knees at the edge, thighs along the
  cushion), clamped at the back edge: a thigh longer than the seat perches on the back of the cushion.
  A seated body clears the chair back (`CHAIR_BACK_Z`).
- The seat drop is measured from the lowest *resting* vertex — per vertex, through the skin — skipping
  limbs (arms, legs, tail) and `userData.prop` meshes (e.g. a ball of yarn on the floor).

## Head and neck

- Each species sets `headYawMax`, how far it can physically turn its head. It is anatomy, not
  personality, so it lives with the body, not the motion ranges. Base ~80° (a mammal); owl ~264°,
  llama ~109°, lion ~74°. Clamped on output only.
- A look is shared between neck and head. The neck's share is derived from neck length
  (`0.20 + 1.3 × neckLength`, clamped 0.20–0.72): a long neck does most of the turning, as a llama or
  goose does. Shares sum to 1, so the head still points where asked.
- `neckCurve` is a neck-only S-curve with the head counter-rotating, so a long neck doesn't read as a
  broom handle.
- **Head stabilisation:** the neck counter-rotates the spine's *roll* by `min(0.75, 1.6 × neckLength)`,
  so long-necked animals hold their head steady while the body sways. Roll only — pitch carries
  posture (`attend`, `browse`) and must not be cancelled.

## Eyes and ears

- Eyes are glassy against the matte felt; the contrast is what makes them read. Placement is species
  business, construction is shared.
- An eye's white always stands proud of the skull by at least 25% of its own depth (`EYE_PROUD`), so a
  ring of white shows around the pupil. The seat only ever pushes eyes *out*.
- `pupilDepth` > 0, or pupil and white z-fight. Each eye is a joint so a blink can squash it.
- An ear base is kept inside the head ellipsoid at 0.95 of the surface (`EAR_SEAT`), so the ear can't
  float off at extreme spread/lift. The ear pivots at its base. Ear shapes: `cone` (owl tufts) and
  `leaf` (a flattened ellipsoid: the mammal ear).

## Look-at

Built 2026-11-04 (the art pass: "less drugged"; Audubon's Carolina Parrot plate: body side on, head 3/4 to
the viewer so both eyes show).

- **Decided.** `built.lookTarget` (a world point, or null) and `lookAt` (a param, off by default till the designer picks it, like every style switch). Inside
  `stepMotion`, after the pose and its layers, the head turns toward the target: yaw clamped to 0.8 rad
  (3/4 on to a side-on body), pitch to 0.35, eased at 5/s. The pupils take whatever the head does not
  (clamped to 1 rad, eased at 18/s), so they glance ahead of a turn and finish it when the head is clamped.
- **Decided: blend out, per channel, rather than add with a clamp.** A target pose that sets `headYaw` or
  `headTilt` itself (a dance's head turn, the full-bag head shake) blends the yaw out over the first 0.1 rad
  it sets; one that sets `headPitch` (hurt, the flips) blends the pitch out. Added on top, a 0.45 dance
  turn plus a 0.8 look would land somewhere neither meant. Off its feet (a flip, a trip) the look fades with
  how far the body is from upright.
- A pupil slides over its white, held on the white's surface, only as far as the white shows above the
  skin in that direction (sampled at build), so it never goes under the skull. Each pupil is a joint (a
  bone when merged), so it moves and blinks with its eye after the merge.
- The spinoff's tablet picks the target from the snapshot (`play.js lookTarget`): the fighter it traded a
  hit with for 1.5 s (HitEvent `by`/`target`), the nearest foe while it punches, kicks, sweeps or winds up,
  else the camera. No sim or network change.
- Measured from the match camera (species checker "match camera", 800x500 px): head 90° from the camera
  turns to 41°; eye pixels owl 104+31 → 168+106, llama 159+41 → 175+87, lion 74+18 → 113+65
  (`face.test.mjs`).

## Face

Built 2026-11-04 (the same plate: a hot face, a glint in each eye).

- **Glint** (`eyeGlint`): a small flat white dot up and out on each pupil, self-lit so it reads white from any
  light, a child of the pupil so it moves with it, in the eye family (no new draw). Tuned 2026-11-05: smaller
  (0.22 pupil radii) and nearer the pupil's edge; the lit one shaded grey.
- **No eye ring or iris** (2026-11-05): a skin band round the eye, then a rim like an eyelid, then a coloured
  iris cap on the white were all tried and taken out.
- **Face accent** (`faceAccent`, `faceAccentSize`, `faceAccentColor`): a mask round the eyes, 3 mm off the
  skull. Blank colour = derived from the fur: its complement, straight across the HSL hue
  circle (hue + 0.5), saturation 0.85, lightness 0.55; scarlet on grey fur (saturation under 0.12), which has no
  hue. 2026-11-05: it had been the first hot hue (scarlet, orange, amber, pink) at least 0.15 from the fur's,
  which was scarlet for nearly every fur. The owl's reads as a facial disc. Cheek blush was
  tried on the lion and sat hidden under the muzzle and mane from the match camera (0 px), so every species
  wears the mask, sized per species (owl 1.0, llama 0.8 on its big eyes, lion 1.0 eye radii).
- The accent is a patch of a sphere around the skin point under the eye, scaled onto the head
  ellipsoid: it lies on the skull at any head shape, is felt (merged, no new draw; the ring too), and a hat brim
  presses it like the skull. Both colours have pickers in "eyes & face"; untouched, they follow the fur.

## Painterly

Built 2026-11-04, off by default (`painterly`, per character; the species checker's style folder, "painterly", set on both slots).
`characters/paint.js`.

- **Fur** (lion, llama), from Franz Marc's Blue Horse I: no highlights (roughness 1, sheen, specular and
  clearcoat off, and the lighting replaced); light to shadow is a colour shift: the light falling on a
  fragment (direct plus indirect diffuse, as a share of what the base colour gets) picks a place on a ramp
  from a shadow colour (hue turned -0.22 rad, saturation x1.6, value x0.62) through the base to a light
  colour (the base x1.2, as saturated: 2026-11-05, it had been washed 55% toward white, which greyed
  every lit surface, blue 0.87 to 0.51 saturation), in 3 bands with near-hard edges (`soft` 0.06). A plane texture on the
  existing UVs (which run round each sphere and capsule, so strokes follow the form), a dozen broad swaths a
  tile, once a part (`size` 1), shakes the band edges and adds a faint value streak. Changed 2026-11-05: the
  first brush (90 thin dabs, 3x2 a part, soft 0.16) read as hair, too real for Marc's broad planes; the ink
  keeps it. The llama gets fur too: its fleece is a broad pale mass, like the horse, and its scalloped fleece
  geometry already gives the wool its edge; ink pooling would grey a cream fleece toward dirty, and a fray
  on top of the scallops reads moth-eaten (the cute rule).
- **Ink wash** (owl), from Ohara Koson's crow and Bada Shanren's Two Chicks: a ramp in the body colour's
  own family (value x0.55 to 22% paler), darker where the ink pools toward the silhouette (N·V), faint
  feather rows (a scallop texture, plumage only) and a frayed outline: near the rim (N·V under 2x `fray`)
  plumage fragments are discarded on a brush-noise pattern. Alpha-test discard, not blending: no sorting,
  one draw. Only the plumage frays (the owl's `feather` material); the body sphere under it never does, so a
  fray opens only at the outline (worst case from the match camera: 59 of 2746 px, all within 2 px of the
  outline). Merged, plumage is marked by its uv lifted by 2 whole tiles.
- **Brightness** (2026-11-05): the ramp picks only the colour; its brightness is the base's times the light the
  fragment gets, as felt. Fur rounds that light *up* to the top of its band (`paintBright`; bands 2 x `light` /
  `bands` apart, the soft edge set just past the top), so a painted character is never darker than the felt
  one, only up to a band brighter; ink keeps the light as it is. `light` (the checker's "paint band spacing")
  now sets band spacing and where the ramp reaches its light colour, not brightness. The brush still shakes a
  band edge either way, so a stroke can sit up to half a band under. Before, the ramp colour times `light`
  (0.8) capped every lit surface near the base colour: darker than felt under any light over 1.
- Ink fray default 0.4 (was 0.22, which opened 59 of 2746 px from the match camera: invisible); 103 px now,
  still within 3 px of the outline. Slider up to 0.8.
- One shader variant per style (`customProgramCacheKey`), every painted felt material one family
  (`paint-fur`, `paint-ink`), so a merged character is still one felt draw and the cast shares a material.
  The knobs are shared uniforms (`PAINT`: bands, soft, size, brush, streak, light, pool, fray, feather), live in the
  species checker's style folder. Cost: three 128x128 canvas textures for the whole cast (a grey pixel in
  node), two or three texture reads a fragment, no extra meshes, draws or passes.
- Off, the felt is exactly as before (same material, no shader hook).

## Tail

- Every species has one, a chain of joints on the **chest** (rides the spine's lean and roll), leaving
  the body 0.55 rad below the torso equator, seated at 0.9 of the torso so the root is buried.
- Length and droop are the silhouette; stiffness and damping are the spring, per species. Under-damped
  on purpose: a tail that settles without swinging is a stick.
- The wag swings across the root-to-tip chord, so a hooked tail still swings its whole length.
- The root takes the whole lift/tuck/wag; later segments share out only how far the tip lags.
- The tail spring feels the body's real world motion (walking, turning, dancing, hopping). A step faster
  than 50 units/s, or longer than 3 units, is a teleport (spawn, reset) and is ignored; a knockback
  launch (20-30 units/s) is real motion and swings the tail.

## Coats: scallop shells

- Owl plumage, llama fleece and lion mane are one operation: overlapping scallops laid over a body
  part. **Low frequency on purpose** — high-frequency relief (a noise normal map, a fuzz shell) reads
  as grain or stone at crowd distance; a handful of large scallops reads as coat. Felt is about how
  light diffuses, not surface bumps.
- Scallops are domes (soft: plumage, fleece) or faceted spikes with ≥3 sides (fur: a dome has no
  direction, so a mane of domes reads as wool).
- Columns are laid symmetrically about the face (+Z), so a face gap (`skipFront`) cuts symmetrically.
- Shells are built in unit space and scaled onto the part, and settings are quantised into presets,
  so geometry is shared between characters.
- Touching size is derived from the row/column counts, so a coat that must read as a continuous mass
  stays closed as counts change.
- A shell may be *seated* on a part (`inside`): every base sits on the part's surface, pulled in or
  pushed out, so the shell wraps round underneath and buried spikes don't leave gaps between tips.
  Seated scallops point out of the part's own surface; `sweep` folds the lower half toward the way hair
  falls (down and back), ramped from the middle row to the last. An underfur skin under a seated shell
  shows coat colour in the gaps.

## Colour

- Fur hue is uniform; variety comes from saturation and lightness, drawn from weighted modes: natural
  45% (browns, greys, cream, charcoal), tinted 35%, vivid 20%. A single narrow band collapses every hue
  into pastel.
- Coat colour is derived from the body colour (same hue family, lightness step 0.12–0.30, a 22%
  minority with a real hue shift): a free second colour reads as two animals glued together.
- Knitted garments read crisper than the body: tighter sheen, less roughness.
- The name list is consumed, not cycled: a name is never handed to a second character.

## Randomisation

- **Two tiers.** Tier 1 silhouette carriers, roughly ±50%, let you tell characters apart as flat black
  shapes at 150px. Tier 2 supporting dimensions, roughly ±15%, keep the cast reading as one species.
- Body mass is tier 1 (at ±12% every character was the same blob). Garments scale from the same
  params, so per-character spread is free; what must not happen is species differing *systematically*
  in torso.
- `shareRandomParams` copies every parameter two species randomise the same way, so a pair differs only
  where their kits differ. Keys whose range a species overrides are skipped.

## Rendering

- Draw calls per character are the bottleneck. Every static mesh is baked into one rigidly skinned
  mesh per material family (felt, eye, knit), so a character, clothes included, is ~3 draws. Colour
  moves into vertex colours so one material per family serves the whole cast.
- Meshes shown/hidden at runtime (`userData.noMerge`, e.g. the held item) stay unmerged.
- Merging is switchable: it costs per-character geometry, which only pays while draw submission
  dominates. Part shadows are switchable too (roughly double a part's cost).
- Geometry detail levels differ by ~10× triangles.

## Owl

- Identity is plumage on the torso. Snappy: commits fast, holds still between movements.
- Head swivel ~264° (`headYawMax` 4.60) — the species tell.
- Wings bolt onto the shared upper arm, slightly outboard, and always enclose it (a floor on wing size
  from limb thickness). Anything held is gripped at the wing surface.
- Ear tufts fill the ear slot so they can express. Five-feather tail fan; stiff (a bird's tail flicks).
- Feather presets: `featherProud` well under 0.5, or a wide scallop reads as a ball stuck on. Head
  plumage leaves a face gap for the eyes.
- Plumage sinks in more than it stands out, so it never pushes the shoulders.
- Motion: stiff 140–300, idle rate 1.20–3.00 (twitchy, never fully still), widest head arc 1.20–2.20,
  stride 1.30–1.90.

## Llama

- The reference case for SCALE: identity is neck length plus a fleece ruff at the neck base. Torso
  matches every species (one sweater fits all), so the long neck makes the llama the tallest species.
  Bipedal: the quadruped silhouette (neck, head, ears, fluff) stood upright.
- `neckLength` is absolute, never a multiplier. Small head so the neck reads as the long part; head sits
  on a visible neck.
- Wedge skull (narrow, deep). Eyes wide-set on the sides of the head, smaller than the owl's.
- Muzzle is a long, **blunt** tube with a rounded cap; short and tapered reads as a beak. Camelid
  philtrum nose. Near-upright banana ears.
- Fleece: larger, rounder curls than plumage, sized from the counts so they always touch (presets start
  at 4 rows). Ruff tracks neck length and thickness; radius capped at 1.7× its own half-height or it
  reads as a disc collar. The ruff is the second silhouette carrier.
- Arms ride on the fleece surface (`shoulderOut` 1.0) with `clampArmOut` on.
- Short, stiff fleecy stub tail: it bobs, it doesn't swing.
- Motion: languid. Stiff 55–190, idle rate 0.60–1.60, head arc 0.90–1.80 (wider reads rubbery, since the
  long neck already sweeps further). Almost no bounce (0–0.02: bounce on something this leggy reads as
  a limp). Long stride 1.78–2.20 (2.26× leg is the geometric ceiling). Picks its feet up: knee lift
  0.70–1.70 (13%–53% swing-foot clearance); the ceiling is taste.

## Lion

- Identity is a **mane on the head**: a halo framing a bare face, not a collar. It hangs from the head
  (the base neck is too short for fleece, and the neck slot belongs to scarves) and uses a big face gap.
  It turns with the head — right for cheek fur, overstated for shoulder mass.
- Broad, slightly flattened skull (1.04 × 0.94 × 1.00); short neck. Forward-set predator eyes.
- **Snout:** short, broad and tapering (a blunt tube reads camelid, a taper reads cat), capped by a
  sphere tangent to the taper's end so no machined rim shows. It starts near the skull surface because a
  short snout on a broad head otherwise buries itself. The nose pad stands 30% of its depth proud of the
  cap at every roundness.
- **Snout gap** — bare snout between skull and nose, over the nose's depth — is what separates a lion
  from a fox: drawn in 0–0.45 (past ~0.5 reads fox or rodent), and `muzzleLength` is *solved* from it.
  If that would leave a stub under 0.030, `muzzleStart` gives way instead.
- Cat ear: the llama leaf plus a point (`earPoint`), sized from the ear's own half-width at the join.
- **Mane:** faceted spikes (4–6 sides; 3 is too sharp, 0 the dome that reads as wool), longer than
  wide (`maneProud` ≥ 1.0). At least 5 rows (fewer reads as a wolf ruff or hedgehog); must reach at
  least the skull's equator (`maneBottom` ≥ 0.5, above which it's a cap). Bases are seated on the skull
  at 0.95 so the mane wraps the head; underfur at 1.02 of the skull fills the gaps. Presets run
  `maneBottom` 0.58 (high tight halo, the default) to 0.97 (shoulder length); `maneProud` is solved per
  preset for a target stand-off. `maneTop` keeps its bald-patch end reachable on purpose — the crown
  gap depends on the counts (`maneCrownGap`).
- Mane ranges: face gap 2.60–3.80 (floor: the 13-column preset only clears the eyes from 2.45; past 3.8
  the halo thins). `manePush` ≤ 0.22 (eyes clear from 0.24). `maneHug` ≤ 0.9 (flatter reads as a
  collar). `maneDrop` ≥ 0 (negative bunches the rows round the crown).
- **Mane colour** is its own mass, not a tonal coat: at least 28 L* from the body (target 28–44),
  usually darker and richer (75%), sometimes blond, same hue family.
- **Size variety:** torso and arm size are each drawn as *one* draw with small per-axis jitter
  (body 0.72–1.30, arm 0.75–1.30), so a crowd spreads instead of averaging out. Arm length is capped at
  0.70 of legs plus torso so knuckles clear the floor. Legs 0.120–0.300 (~2× spread). Pupil 0.28–0.58 of
  the eye; past ~0.6 it covers the eye white.
- Tail: a hanging J-hook rope (3 segments) with a mane-coloured tuft — the tuft is what makes it a
  lion's, not a rat's. Length is drawn at 0.85–1.00 of the tail base height so it clears the floor.
- `coatBulge` is 0: nothing on the torso reaches the elbows.
- Motion: heavy and deliberate — unhurried but committed. Stiff 70–210, idle rate 0.55–1.35, head arc
  0.70–1.30, some bounce 0.01–0.05, stride 1.30–1.75, knee lift 0.45–1.05 (a cat pads). Starting values.

## Shaped faces

*Built 2026-11-04.* Cartoon animals are expressive in the face, but there's no budget for animating
beaks or mouths at fighter size, so the effort goes into **static** shapes: built once, merged with the
character, no per-frame cost. `shapedFaces` (per species, default **off**: off is today's face exactly)
switches them on; the species checker has it as **style → shaped faces**. Code: `characters/faces.js`
plus each species' face builders; checks in `characters/faces.test.mjs`.

- **Cute is a hard rule.** Small, soft, rounded shapes, set low, so the big eyes stay the focus. No
  teeth, gums, fangs, big jaws, wide-open mouths, sneers or raptor hooks; nothing that sharpens or ages
  a face. When unsure, smaller and rounder. Everything is sized from existing params (beak size, muzzle
  thickness, muzzle width/depth), so every random-range corner works; the test walks min, max and
  random corners.
- **Owl:** a short beak (protrudes under `beakSize`) whose blunt tip curls gently down — a tapered
  cylinder bent by t³, 0.36 beakSize of drop at the tip, and nothing else: a lower mandible and a cere bump
  were tried (2026-11-04) and read as three beaks at fighter size, so came off 2026-11-05.
- **Llama:** the muzzle's round tip becomes two soft lobes with the llama cleft between (the nose's stem
  runs down into it); a small jaw below, its front only a hint past the lips (0.04 muzzle thickness,
  tested under 0.08).
- **Lion:** a small rounded inverted-triangle nose (same place and size as the old one), two puffy
  whisker pads in muzzle colour.
- **No line art** (2026-11-05): the black mouths (smile, smug, deadpan, o), the owl's gape corners and
  the lion's whisker dots came off: shape only.
- **Triangles** (default params, high detail, merged): owl +952; llama −1792 and lion −1312, because the
  shaped parts use small fixed low-poly spheres (16×12) where the old tip and nose used the 48×32
  `GEO.sphere` (counted with the line art; a little lower without it).

## Open questions

- Lion: a second mane shell on the chest if the head-anchored mane reads too light.
- Lion: quantise the drawn mane values if a big crowd shows the per-lion geometry memory.
- Shaped faces (brainstorm 2026-11-04): the low-poly face spheres ignore geometry detail; tie them to
  `GEO_DETAIL` if faces get close-ups. The owl's beak root sits near eye height (tested only
  below the eyes' tops), as the old beak did.
- Blink: see MOTION-TODO.md §Known ceilings (`characters/MOTION-TODO.md`).
- Lion motion ranges still to be tuned in the motion lab, as the llama's were.
