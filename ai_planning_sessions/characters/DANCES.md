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
| **riverdance** | yes | Upper body locked flat (`armOut` 0.10, `elbowBend` 0.06, no spine channels at all). Ten beats, two mirrored halves: **kick — hop — step-behind — high knee — hop**. A kick and a high knee are the same leg isolation with opposite knees (`kneeBend` 0.15 vs 1.90), and the difference shows up as **reach**, not lift: 0.239 forward against 0.152. The **step-behind** is the only beat with both feet on the floor — `legSwing` 0.72 at `hipFlex` 0, which puts a foot 0.155 back with the feet level to 0.0002 — and its splay squats the body, feeding the bounce. Every hop beat leaves the ground. Body height swings 0.109, about 11% of height where a human walk is ~3%. |
| **floss** | yes | Built from the wikiHow breakdown. Arms **straight** (`elbowBend` 0.04) travelling as a **pair** to one side — `armOutAlt` ±1.05 abducts one shoulder to 1.35 while the other adducts to −0.75, i.e. crosses the belly — with one arm in front and one behind (`armSwingAlt`). The spine leans *with* the arms and the **hips go the other way** (`shift` ∓0.038). That counter-motion is the joke of the dance. |
| **attitude** | no | Free leg lifted behind, standing leg planted, and an asymmetric port de bras via `armOutAlt`. Held 1.4s, with a small `rise`. |
| **pirouette** | no | Plié, then passé with the arms rounded in while the root `turn`s a full 2π and `rise`s, then opens out. |
| **uptown-funk** | no | **step — freeze mid-step and snap — step — freeze and snap on the other side.** The walk layer runs underneath the *step* beats and is switched off (`walk: 0`) on the *freeze* beats, so the legs hold where the stride left them. The freezes carry their own `legSwing`/`kneeBend` — without leg content the character tidily brings their feet together on every beat, which is a dancer coming to attention rather than one caught mid-stride. 33.9° of lateral lean at the snap; a step is short and a freeze is long, and that ratio is the groove. |

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
   drop-off as usual.

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
