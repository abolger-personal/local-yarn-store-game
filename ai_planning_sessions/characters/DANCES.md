Desired Dances to use as rewards on a trigger for each character: 
- A ballet pirouette: https://balletaz.org/wp-content/uploads/2018/12/Blog-Pique_Gif.gif
- A ballet "Attitude": https://balletaz.org/wp-content/uploads/2018/12/Blog-Italian-Fouette_Gif.gif
- A 'floss' https://tenor.com/view/bluey-bingo-floss-flossing-gif-27348865
- A riverdance (irish step dance, stiff upper body and straight arms, all in feet)
- A walk and swing like Bruno Mars in "Uptown Funk" (https://giphy.com/gifs/brunomars-bruno-mars-uptown-funk-xULW8mLUitJ6aGpuow)

---

## How they are built

All five live in `characters/motion.js` as DATA (`DANCE_POSES` and `DANCES`), and play in the
species checker: pick one from the "victory dances" folder, or press `X` to cycle and `C` to
replay. Every character can do every dance for now — nothing maps a dance to a temperament yet.

A dance is **an ordered list of key poses with hold times**, not a curve per channel. That works
because `integrate()` spots a target change by object identity and carries the channel's velocity
across it, so the existing spring does all the in-betweening. It is also why the poses below are
authored as *positions to pass through*, and why each dance carries its own `stiff`/`zeta` — a
riverdance step is faster than any character naturally settles.

Three things the rig can and cannot do shape every pose, all measured rather than assumed:

| | |
| --- | --- |
| **Standing on one leg** | `hipFlex = -legSwing`. `legSwing` is anti-symmetric (`legSwing * side`), `hipFlex` is symmetric, so equal-and-opposite cancels one leg and doubles the other. Planted foot holds at y+0.01 while the free leg lifts +0.36 behind or +0.25 in front. |
| **Both feet planted, one behind** | The same two channels with `hipFlex` at **zero**: both legs rotate by equal and opposite angles, both feet rise the same amount, and grounding sets the body down on both. `legSwing` 0.72 puts a foot 0.155 back with the feet level to 0.0002, squatting the hips ~0.06. Needs a straight knee — `kneeAmount` bends the trailing leg harder, so a bent knee hovers the back foot. |
| **Asymmetric arms** | needs `armOutAlt` (added for this). Before it the arms were mirrored by construction — measured across `armOut`, `armSwing` and `armSwingAlt`, the two hands never differed laterally by more than 0.00. |
| **A leg out to the side** | `legOut` (both legs) and `legOutAlt` (one more than the other, like `armOutAlt`), added 2026-11-03 for the wuxia sweep. Each thigh turns out (`rotation.z`) inside its swing; a leg turned out keeps its knee straight, as a leg swung back does (`kneeAmount`); and `lowestFoot` follows the turn out, so the lowest foot still lands on the floor (rig.test: 40 random leg poses per species, within 1.2 cm; ignoring the turn out misses by 21 cm). With `legSwing = hipFlex` the out leg's thigh stays level while the standing leg folds: that's how one leg crouches while the other lies out. |
| **Turning the body** | no pose channel does it. `applyPose` never writes `root.rotation.y`, and `spineTwist` (also added for this) turns the chest against the hips but not the whole character. A pirouette's turn is therefore a **root extra**. |

### Root extras

`turn`, `rise`, `travel` and `shift` are what a dance asks of the root, which no pose channel can
express. They are returned as data and **never written to the root** — the root belongs to whoever
placed the character (the lab page, or `cast.js` in the shop), exactly as `built.groundOffset`
already works for grounding. They are absolute offsets from where the dance started, and a step
that omits one carries the previous value forward, so a pirouette holds its new facing instead of
unwinding.

`hop` is the odd one out and deliberately so: a transient **arc** within its own step, up and back
to zero, rather than a position that is held. That is what lets a *looping* dance leave the ground
— a sustained `rise` at the end of a cycle would snap to the floor at the wrap.

The extras are eased (an S-curve) within each step so the root never changes speed abruptly at
a key pose; the pose itself is left to the spring. A hop instead rides the step's *linear*
progress as a half sine, the ballistic shape (fastest leaving and landing, slowest at the apex),
because a sine of an eased progress hovers at the top. `rise` and the hop are summed, so a
consumer adds one number and a dance can hop off a held relevé.

`walk` (the walk layer's speed under the dance) is a **rate**, not a position, so a step that
omits it falls back to the dance's own value rather than carrying the last step's forward:
otherwise one `walk: 0` freeze would stop the walk for the rest of the dance.

A **looping** dance may not use `turn` or `travel`: those accumulate, so a wrap would walk the
character backwards. `rise` and `shift` may end a cycle anywhere, because the wrap lerps from the
last step's extras rather than from nothing. `motion.test.mjs` asserts both.

**`shift` moves the whole root, so the feet slide with the hips.** Real hip sway is the pelvis
moving over planted feet, which needs lateral rotation at the hip — a channel this rig does not
have and that grounding could not follow, since `lowestFoot` derives height from hip and knee
angles about X alone. At 0.038 units the slide is a few pixels at shop distance.

### What each one is made of

| dance | loops | built from |
| --- | --- | --- |
| **riverdance** | yes | Upper body locked flat (`armOut` 0.10, `elbowBend` 0.06, no spine channels at all). Ten beats, two mirrored halves: **kick — hop — step-behind — high knee — hop**. A kick and a high knee are the same leg isolation with opposite knees (`kneeBend` 0.15 vs 1.90), and the difference shows up as **reach**, not lift: 0.239 forward against 0.152. The **step-behind** is the only beat with both feet on the floor — `legSwing` 0.72 at `hipFlex` 0, which puts a foot 0.155 back with the feet level to 0.0002 — and its splay squats the body, feeding the bounce. Every hop beat leaves the ground. Ten beats is deliberately long: a four-beat cycle at this tempo reads as a twitch. Body height swings 0.109, about 11% of height where a human walk is ~3%. |
| **floss** | yes | Built from the wikiHow breakdown. Arms **straight** (`elbowBend` 0.04) travelling as a **pair** to one side — `armOutAlt` ±1.05 abducts one shoulder to 1.35 while the other adducts to −0.75, i.e. crosses the belly — with one arm in front and one behind (`armSwingAlt`). The spine leans *with* the arms and the **hips go the other way** (`shift` ∓0.038). That counter-motion is the joke of the dance. Two beats and no pause; the spring carries the arms through the middle. |
| **attitude** | no | Free leg lifted behind, standing leg planted, and an asymmetric port de bras via `armOutAlt`. Held 1.4s, with a small `rise`. |
| **pirouette** | no | Plié, then passé with the arms rounded in while the root `turn`s a full 2π and `rise`s, then opens out. |
| **uptown-funk** | no | **step — freeze mid-step and snap — step — freeze and snap on the other side.** The walk layer runs underneath the *step* beats and is switched off (`walk: 0`) on the *freeze* beats, so the legs hold where the stride left them. The freezes carry their own `legSwing`/`kneeBend` — without leg content the character tidily brings their feet together on every beat, which is a dancer coming to attention rather than one caught mid-stride. 33.9° of lateral lean at the snap; a step is short and a freeze is long, and that ratio is the groove (even holds read as a march), with an extra beat on the last freeze to land on. A freeze repeats the previous step's `travel`, so the body stops moving too. Its spring is under-damped (`zeta` 0.70) so a snap lands like a hit rather than a glide. |

### Known ceilings

This rig is chibi: **no ankles, no toes, no spine segments**. So a piqué is a root `rise` rather
than a foot articulation, and the ballet reads as a stylised nod at ballet rather than the real
line. Judge them at the `D` (150px) distance and under `B` (squint), because that is how the shop
actually shows them. If they need to read better than that, the upgrade is an ankle joint — not
more key poses.

### To do

- [ ] **Clap** — not built. Needed by the finishing dance (everyone who does not dance turns to
  face the finisher and claps). A small looping arms-only entry in `DANCES` in
  `characters/motion.js`: paws meet in front of the chest and part, feet planted, no root extras.
  Watch the short-arm limit found by the sit-and-knit work (`craft-anim.js`): the paws may not
  reach each other in front of a deep belly, so the clap may need to meet higher, at the chest.
- [ ] **Wiggle** — not built. The Withdrawal 4+ finisher's dance: a small happy shimmy, upper
  body only, feet planted, looping.

---

## Gymnastics (planned 2026-11-03)

For Donut Fighters' ring-out finishers (spinoff/REUSE-SPEC.md §After the lobby: the skilful finishers get a
gymnastics move instead of a dance). Whole-body rotations are what a chibi figure reads best, and a flip, a
cartwheel and a spin turn about three different axes, so they can't be mistaken for each other. First goal:
build every skill named after Simone Biles, play them side by side in the species checker, and pick the
favourite. The skills were checked 2026-11-03 against news coverage and Wikipedia's "Gymnastics elements named
after Simone Biles": five named skills, two on floor, one on beam, two on vault.

### Two new root extras: `flip` and `roll`

Like `turn`, they are absolute angles from where the move started, carried forward by a step that omits them,
returned as data and never written to the root by `motion.js`.

| extra | axis | + means |
| --- | --- | --- |
| `turn` (exists) | the body's own long axis | a spin; in the air, the twist |
| `flip` | the body's side axis | forward (a front tuck); − is backward |
| `roll` | the body's front axis | sideways, a cartwheel |

- **Rotate about the body's middle, not the feet.** The root sits at the feet; turning it there swings the body
  through the floor. Pivot at half the character's height, then move the root so the middle stays put. The
  spinoff's stomp backflip already does exactly this (`flip()` in spinoff/play.js), measured: the middle doesn't
  move, the head goes back first, the feet end where they started.
- **Order: placement, then flip, then roll, then turn.** So a twist spins about the *flipping* body, which is
  what a twisting somersault is; applying the spin first would just swing a flip round.
- **One helper, not three copies.** The species checker and dress-up each apply `turn`/`rise`/`travel`/`shift`
  to the root by hand. Add one function in `motion.js` that turns a dance frame into a quaternion and a root
  offset for a given pivot height, and have both pages (and the spinoff) call it.
- **In the air the rotation is linear.** Extras ease on an S-curve within a step; on a step with a `hop`, `flip`,
  `roll` and `turn` should instead ride the step's linear progress, as the hop does, or the body hangs still at
  take-off and whips round at the landing.
- **Looping dances may not use them**, like `turn` and `travel` (they accumulate); `motion.test.mjs` already
  asserts that for `turn`.
- **Every flip lands upright.** A move's final `flip` and `roll` are whole turns (multiples of 2π), and its last
  step's `rise` is 0. Asserted.

### Every flip is crouch, jump, land

1. **Crouch** (wind-up): knees bent, arms swung back, a short hold.
2. **Jump and rotate**: one step that hops *high* and rotates. The riverdance's hops are about 5 cm; a flip needs
   about half the character's height of hop for a single turn to read, and more for doubles. Hold ~0.6 s for a
   single, ~0.9 s for a double; exaggerate, these are cartoons.
3. **Land**: knees soak it, then **the salute** (arms up in a V, chest out, chin up: "stuck it").

### New key poses

| pose | how |
| --- | --- |
| **crouch** | deep `kneeBend`, `hipFlex` forward, arms swung back |
| **tuck** | both legs pulled up (`hipFlex` is symmetric, so it lifts both), knees fully bent, arms hugging the shins (`armSwing` forward, `elbowBend` high) |
| **pike** | `hipFlex` high with knees straight, arms reaching for the toes |
| **layout** | straight body, arms by the sides or overhead |
| **hands-down** | arms straight overhead, for a handspring or a round-off passing through a handstand |
| **salute** | both arms up and out (`armOut` high), chest out (`spineBend` back), `headPitch` up |
| **sweep freeze** | built as `wx-freeze`: crouched on one leg, the other straight out to the side on the floor, the middle hand (the swept leg's side) at the floor and the outside one raised (`armOutAlt` −1.5), a slight lean toward the low hand. A raised arm can't clear these big chibi heads (a hand tops out at about 0.65 of a standing body), so "up" means up beside the head |
| **wolf** | standing knee deep, the other leg straight out in front (`legSwing` + `hipFlex` isolation from the table above; `kneeAmount` already straightens the swung leg), arms out |

No props: no beam, no vault table, no floor springs. Everything happens on the stage floor, and a vault's
"hands on the table" becomes a handspring on the floor.

### The Biles skills, one entry each

| entry | the skill | built as |
| --- | --- | --- |
| `biles` | floor: the Biles (2013), a double layout with the half twist in the second flip | built 2026-11-04. A reach, an **aerial round-off** (`tb-star`, legs wide: `flip` π with `turn` π/2, so it is a cartwheel upside down, then on to 2π and π, landing facing back), a short rebound, a **whip back** (`tb-whip`, arched hard: the waist back 0.65 and both legs behind the hips, `hipFlex` −0.5, deepened from 0.35 when the designer saw it fly straight; `flip` on to 4π), a rebound, then the double layout (`tb-layout`, nearly straight on purpose: a layout is a stretched body, and judges take off for a pike or a big arch; `rise` 0.95: `flip` on to 8π in 1.45 s, the half twist all in the second flip, `turn` to 2π), land, salute. The flip runs one way throughout: once the round-off has turned the body to face back, the same world rotation is a back salto. The pass travels 1.3 the way the body first faced. Hands never touch the floor: with arms straight overhead the hands stop 21-56 cm short of the head's top (owl least, llama most), so upside down the head would land first; the hands-free versions are real skills (the whip is a hands-free back handspring). The run-in jumps are 0.7 high, like the back tuck: at 0.45 the llama's head went 6-9 cm through the floor, and tucking the chin swung the big head further out |
| `biles-ii` | floor: the triple-double (2019; some call it the Biles II on floor), a double back tuck with three twists | built 2026-11-04: the shared run-in (`RUN_IN` in motion.js, the floor Biles's), then tucked (`bt-tuck`), `flip` on to 8π with three twists spread through both flips (`turn` π to 7π), 1.45 s in the air like the others; lands facing back |
| `biles-beam` | beam: the Biles (2019), a double-twisting double back dismount | built 2026-11-03, from a standing jump (no beam): crouch, then up tucked (`rise` 0.95, `flip` −2π, `turn` 2π in 0.75 s) and down opening out (`flip` −4π, `turn` 4π in 0.70 s); 1.45 s in the air (tried 1.65, a touch slow), slowed from 0.96 because at real speed it was a blur on a small figure (the designer), so it hangs like a cartoon jump, land, salute. The twists spread evenly through both flips. Clearance upside down: llama 30 cm, lion 39, owl 55 |
| `biles-vault` | vault: the Biles, later Biles I (2018), Yurchenko half-on, straight front salto with two twists off; she no longer competes it | **skipped** (the designer, 2026-11-04): it is the one pass that needs hands on a table, and without hands the "onto the vault" moment is only a hop |
| `biles-ii-vault` | vault: the Biles II (2023), the Yurchenko double pike | built 2026-11-04: the run-in stands in for the board and the table, then a pike (`tb-pike`: `hipFlex` 1.8, knees straight, reaching for the toes), `flip` on to 8π, no twist; lands facing back |
| `wuxia-turn` | built 2026-11-03. Not a gymnastics skill: the *sǎo táng tuǐ* (扫堂腿), the hall-sweeping leg, from wushu, as wuxia films freeze it (the designer's; her video's frames: a deep squat on one leg, the other straight out to the side on the floor, both hands down). Crouch, one turn low with both hands down, then a dead-still freeze in the same shape with one arm thrown up. The arm up is for show: a fighter guards the face with it, wuxia raises it because it looks better | `wx-crouch`, `wx-sweep` (`legOut`/`legOutAlt` 0.6, `legSwing` = `hipFlex` 0.55, `kneeBend` 2.3: the out foot 30 cm to the side on the floor; `spineBend` 0.8 brings both hands within 6-10 cm of the floor) with `turn` 2π, then `wx-freeze` (the middle hand, on the swept leg's side between the feet, stays at the floor steadying the crouch, and the outside one goes up beside the head, the designer's correction; a `spineRoll` of 0.25 toward the low hand balances the two). Stiff and critically damped so the freeze stops dead. The spin turns about the root, between the feet, so the standing foot circles about 10 cm; a pivot on the standing foot is the upgrade if it shows |
| `biles-wolf` | a wolf-turn flourish instead of the salute: not named after her, but she made the 2½ wolf turn famous on beam at Rio 2016 | built 2026-11-04 on the beam dismount, for comparison with its salute: `wolf`, then `turn` 5π more in 1.4 s on the floor, and held. The rig straightens a knee only on a leg swung back or turned out, and a leg swung back drops lowest and becomes the one stood on; so both thighs fold the same (`hipFlex` 1.5) and the free leg turns out a little (`legOut`/`legOutAlt` 0.25), which straightens it: its foot 20 cm in front and 5 cm off the floor, the standing foot under the body |

### Leotards (built 2026-11-04)

Each Biles move wears one of her leotards as sparkle (the designer: sparkles, bright colours, some red, white and
blue, some Rio). `glitter` on the dance in `motion.js`, drawn by `characters/glitter.js`: small stars that cling to
the chest and twinkle the whole move, and in the air shed a trail that draws the flip's circle. Both lab pages show
it; the spinoff can use the same `stepGlitter` when the dances become celebrations.

| move | leotard | glitter |
| --- | --- | --- |
| `biles-beam` | Rio 2016 beam final: mostly red, blue and silver stripes along the V-neck | red, some blue and silver |
| `biles` | the Rio 2016 Games' colours (her Rio team and all-around leotard colours weren't confirmed) | green, yellow, orange, blue |
| `biles-ii` | Tokyo team final: a tri-colour fade top to bottom, 7,600 crystals | red, white, blue in bands, top to bottom |
| `biles-ii-vault` | Paris vault final, her 7th gold: "power color" red, 3,600 crystals | dense ruby, steady |
| `biles-wolf` | Paris "Luminous Legacy": a night-sky palette, a constellation of 10,000+ crystals | navy, white and pale blue, twinkling hard |

No goat: she wore it for her club; Olympic team leotards carry no personal imagery.

### Reading them

- **They read best side-on.** A flip about the side axis seen from the front is foreshortened to a nod. In the
  game fighters mostly face left or right, which is side-on; the species checker shows characters facing the
  camera, so it needs a "side view" toggle (or each move starts with a quarter `turn`) to judge them.
- **Travel goes the way the body faces.** A tumbling pass travels; `placeDancer` turns `travel` and `shift` by the facing `yaw` (built 2026-11-04), and the species checker's side view starts the pass half its length back so it ends as far past the slot.
- Judge at `D` and under `B`, as for the dances. Three twists in under a second may blur into a shimmer;
  if so, slow the twist, not the flip.

### Flips, worked out (planned 2026-11-03)

- **In the air, grounding has to let go.** Every frame `applyPose` sets the root's height so the lowest foot touches the
  floor (`groundCharacter`). A tuck pulls the feet up to the hips, so grounding would drop the whole body by a leg's
  length the moment the tuck starts, then pop it back at the landing. On a step with a `hop`, the body's **middle**
  follows the hop's arc instead (standing middle height + the hop), and grounding is skipped until the landing step.
  This is the one thing the plan above missed.
- **The pivot is the body's middle at rest**, half its standing height, measured once per character (species and
  size differ), so a lion and an owl flip about their own centres.
- **How high.** A real flip of airtime t needs a jump of g·t²/8: 0.6 s is 0.44 m, about 45% of a standing critter.
  Start a single at `hop` 0.45 of height and 0.6 s, a double at 0.8 and 0.85 s; cartoon-high is fine, and it is
  the dial to tune first. Rotation speed follows from turns ÷ airtime, linear in the air.
- **Upright at the end, feet first.** The air step's `flip`/`roll` end exactly on whole turns, and the landing
  step's pose has knees bent, so the feet meet the floor before the body settles.
- **One helper** in `motion.js`: given a dance frame and the pivot height, it returns the root's quaternion
  (placement × flip × roll × turn) and position (the pivot held on its arc), so the species checker, dress-up and
  the spinoff all place a flipping critter the same way. The spinoff's stomp `flip()` in play.js is the same maths
  and can move onto it later.
- **A side-view toggle in the species checker**, because a flip seen from the front is a nod. The game's fighters
  already face sideways.
- **`legOut` may need tuning on the way** (the designer): a tuck and a pike pull the legs in close, and a star jump
  or a round-off needs them wide, so check `legOut`'s range and knee rule as those poses get built.

**Built 2026-11-03: `back-tuck`**, and what building it changed:
- `flip`, `roll` and `air` are step settings in `motion.js`; `placeDancer` and `holdMiddle` in `npc.js` place a dancing
  character (the species checker, dress-up, and the spinoff's stomp all use them; the stomp's own `flip()` is gone).
  The species checker has a "side view (flips)" toggle.
- **The jump is two air steps**, up into the tuck and down opening out, not one: one step would land still tucked,
  and grounding would drop the body as it came back. On the way up the body lifts from where it crouched to
  standing height (`launch`), so leaving the crouch doesn't pop.
- **Turns are fastest at the top**, slow off the floor and settling at the landing, as a tucked gymnast's are.
- **0.7 high, not 0.45:** at 0.45 the curled head's ears went 7-9 cm through the floor just past upside down (the
  llama's most); at 0.6 nothing went through, but the llama's long neck passed 5 cm over the floor, which reads as
  smacking its head (the designer). At 0.7 the llama clears by about 16 cm, and the test asks for 10 cm clear
  upside down. The owl then jumps higher than it needs; a jump scaled to how far each body's head reaches from its
  middle is the upgrade if that shows.
- A foot mesh dips below the floor in any crouch (it tilts with the shin, no ankle); the test checks the body, and
  the feet by their joints, instead.

**Tests for the back tuck, per species** (rig.test, as for the sweep): the middle rises at least 90% of the hop
at the top; the rotation totals −2π and ends upright; nothing goes through the floor during the air step (the
body's lowest point stays above it); both feet are on the floor after the landing; and a tuck's knees are near the
chest (the tuck reads). Each move after it gets the same checks with its own turns and twists.

### Build order

1. `flip` and `roll` extras, the shared helper, both pages using it, the tests above.
2. The new key poses.
3. **One back tuck** first (crouch, jump, tuck, `flip` −2π, land, salute) to tune hop height and hold.
4. The five Biles entries and the wolf flourish; play them side by side in the species checker.
5. Pick the favourites, then wire them into the spinoff's finisher table.

---

## Finishing in the shop: the dance

A finished object usually happens at home (NEAR-MISS §7, cap 2: they knit at home), and comes back
as a selfie. **Finishing it in the shop**, in front of everyone, is the rare, earned version, and
it is celebrated with a dance.

### When it happens

- **The finish itself is built:** a seated customer's "Work on a WIP" round that takes progress
  past 100% (`workRound` in `characters/visit.js`, which already raises their crafter skill).
- **The finishing push (new):** a customer who is **ready** (PROJECTS-AND-AUTHORSHIP.md §1, their
  wants empty) and **close enough to finish in the rounds they have left** (the progress formula in
  WIP-AND-FINISHED-OBJ-FORMATION.md against their remaining visit) sits down to finish here rather
  than at home: *"just a few rows left!"*. A prescription (`WALK_TO_SEAT`, then work), as
  CHARACTER-VISIT.md uses them.
- **So the player earns it** by noticing someone is nearly done, closing their gap, and keeping
  them in the shop long enough (HOW-THEY-SHOP.md §2d, "Keeping someone in the shop"). Nobody is
  told; the evidence is the work itself, which grows toward the finished size as they knit
  (`characters/craft-anim.js`, the piece scaled by pattern type), and the Guestbook if their
  knitting was witnessed.
- It is naturally rare (most knitting is at home), so no cap. If two finish in the same round,
  the second waits for the first dance to end.

### The moment

1. **Cast off:** the last stitch, the work held up, and a bigger cousin of the ready sparkle
   (`characters/sparkle.js`).
2. **Wearable** (WEARABLE-FINISHED-OBJ.md): if the slot is free they **put it on**, and dance in
   it: the new hat bounces. If the slot is taken, they hold it up and dance with it, and it is lent
   as usual.
3. **Decor** (pot holder, blanket): held aloft through the dance, then lent to the shop at the
   counter as usual.

### The finisher's dance: personality

The finisher's strongest of these traits picks the dance (a pure function of traits, like their
handwriting, VISUAL-DESIGN-2D.md):

| Strongest trait | Dance |
| --- | --- |
| Enthusiasm | floss |
| Assertiveness | uptown-funk |
| Openness | pirouette (attitude for a second finish, so it varies) |
| Orderliness | riverdance |
| Withdrawal | **wiggle** (new: a small happy shimmy, upper body only, feet planted) |
| none 4+ | floss |

A finisher's dance is recognisable, like their hand: a regular who always riverdances is part of
who they are.

### Everyone joins: a unison group dance

- **Everyone in company with the finisher** (HOW-THEY-SHOP.md §2c: side by side, or the whole
  circle) **stands up and does the finisher's dance in unison**, starting on the same beat. A
  circle finishing together is the big version of this reward, and a shy finisher's tiny wiggle
  done by the whole circle is the sweetest.
- **The group's size is the player's to grow.** Every seat in company with the finisher is one
  more dancer, so a player who gets **many people sitting at once** (enough chairs in company,
  saved seats, tea and armchairs keeping them there: HOW-THEY-SHOP.md §2d) makes the dance
  bigger. A full circle at the moment someone finishes is the best version of this reward.
- **Friends dance from across the room.** Anyone with a **Friends** bond or closer with the
  finisher (REGULARS §2, "Measuring it") joins wherever they are in the shop, in unison, even if
  they are not in the circle: browsing, at the counter, in the quiet nook. A **Close** friend
  also walks over to dance beside them. So **the more friends the finisher has, the more of the
  shop dances**: a regular with a web of friends turns a finish into a shop-wide number, and the
  player's matchmaking over many visits is what built that web.
- **Elsewhere in the shop:** Enthusiasm 4+ customers join where they stand, in unison too.
  Everyone else turns to face the finisher and **claps** (a small looping clap: new, arms only).
- **Room to dance:** a dance that travels or turns (uptown-funk, pirouette) needs clear floor. A
  joiner without room does it on the spot (the dance's steps with `travel` zeroed); the finisher
  always gets the full dance.
- **Length:** about 4 seconds. Looping dances (floss, riverdance, wiggle) loop for that long;
  one-shot dances (pirouette, attitude, uptown-funk) play once, then they clap until the end.
  Seated joiners sit back down after.

### What it leaves behind

- **A group selfie** on the board: the finisher in the middle wearing or holding it, the dancers
  around them. Rarer than an ordinary selfie and recognisable as one, the trophy of an in-shop
  finish. (Needs `store/ui/photo.js` to frame more than one character.)
- **Affinity** (REGULARS §2, "Measuring it"): +5 for the finisher, +1 for every dancer, and dancing together adds to each dancer's bond with the finisher; every dancer becomes acquainted
  with the finisher (HOW-THEY-SHOP.md §2b step 4), which feeds swapping.
- **A Guestbook row** with a dance mark, and the thank-you line remembers it: *"Finished it right
  there in the shop! Everyone danced."*
- The existing +1 crafter skill.

### Pace

- The dance is animation, not rounds: it plays at any speed setting, and through pause (pause
  stops rounds, not animation, TUTORIAL.md rule 8). In the sim, the finish round is the
  finisher's, and joining is each dancer's action for that round.
- **The camera never moves itself.** The dance is there to be noticed, not shown.

### Build order

1. **The finishing push** (pure sim, with a test): ready + can finish in the remaining rounds →
   sits and finishes.
2. **Dance by personality** (pure) and **wiggle** and **clap** as two new entries in `DANCES`.
3. **Unison:** joiners chosen from in company (needs HOW-THEY-SHOP.md §2c) and Enthusiasm 4+,
   started together; travel zeroed for joiners without room.
4. **Put it on, then dance;** the cast-off sparkle.
5. **The group selfie** and the Guestbook mark.
