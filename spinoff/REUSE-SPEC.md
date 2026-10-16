# Spinoff: donut fighters

The same llama, lion and owl characters in a **2.5D brawler (a depth band you walk around in) for up to 8 players (6 heroes, 2 played bad guys), each
on their own tablet with their own camera**, on one shared home network: the kids' team against
a team of bad guys (CPU, or grownups who join as one) in donut capture the flag. Decided with the players, 2026-10-13. This doc sorts the existing code by how much of it carries over, lists what
the fighter still needs, and sets out the network design. A bare file name is in `characters/`;
other paths are from the repo root.

## Layout

Keep the spinoff **in this repo**, as pages under `spinoff/`, importing `../characters/npc.js`
directly. There is no build step and `serve.py` already serves the tree, so a sibling page costs
nothing. Copying the rig into a new repo forks it, and every tuning pass on the yarn store (motion,
tails, garments) would then have to be ported by hand.

Each kid makes their fighter on the spinoff's own **fighter chooser** page (see below) and it is
saved on their tablet, so each kid brings the fighter they made. The yarn store's
`dress-up.html` is a grown-up tuning tool (lil-gui panels, text everywhere) and stays one; the
chooser is its own code in `spinoff/fighter.js`, with its own save.

## Tier 1: reuse as-is (no yarn-store coupling)

| Module | What it gives | Imports |
| --- | --- | --- |
| `npc.js` | Species registry, `BASE_PARAMS` body proportions, `createCharacter` (procedural build → one rigid-skinned mesh per material family), `applyPose`, `groundCharacter`, `stepMotion`, `setViewMode` (`felted` / `grey` / `silhouette`), randomiser, `disposeCharacter` | `three`, `motion.js` |
| `motion.js` | Spring-driven pose channels (19 joints + hold), interrupt-safe blending, idle layer (breath, weight shift, blinks, ear flicks), walk layer, `DANCES` step sequencer | nothing |
| `llama.js`, `lion.js`, `owl.js` | Species kits: defaults, random ranges, presets (fleece / mane / feathers), per-species motion ranges, species `delighted` pose | `npc.js` |
| `sparkle.js` | Timed particle burst on a character | `three` |
| `inventory/room-environment.js` | The lighting environment the felt look was tuned under | `three` |

What matters more for a fighter than it did for a shop:

- **Interrupts are already solved.** `MOTION-TODO.md` documents the move from smoothstep to
  springs specifically so a pose interrupted mid-move keeps its velocity. In a fighter every hit
  is an interrupt. A flinch is "retarget to a hurt pose", and a bigger hit can also add to
  `motion.vel` directly for a whip.
- **`DANCES` is already a move-list format.** Each dance is a list of `{ pose, hold }` steps with
  per-move `stiff` / `zeta` and root extras (`rise`, `turn`, `travel`, `shift`, `hop`). An attack
  is the same shape: wind-up, strike, recovery. `hold` becomes frame data; `stiff` becomes how
  snappy the move looks. New attacks are data entries, not new code.
- **Tails react to world acceleration.** `tailAcceleration` reads the tail root's world position,
  so a lion's tail swings on its own when the body turns, jumps or is knocked back.

## Tier 2: reuse with its dependencies

| Module | What it gives | Drags in |
| --- | --- | --- |
| `garments.js` | The costumer: `dress(built, outfit)` / `undress`, six garment types × many silhouettes, colourwork, fit to body | `inventory/yarn-look.js`, `inventory/catalog.js` |
| `selfie.js` | `shotFor` / `takeSelfie`: a camera that frames a character's face and outfit | `npc.js` |

The drag-ins are small and in the same repo, so reuse means importing them. Knitwear is the
charm: a fighter's alternate costumes are outfits. `selfie.js` is the victory screen camera.

## Tier 3: ideas to borrow, code to leave

- **Personality is left out** (decided 2026-10-13). The yarn store's ten-trait model (`visit.js`
  `TRAITS`, `motionOf(traits)`, the trait-voiced `guestbook.js`) doesn't fit a fighter, so the
  spinoff uses none of it. Every fighter moves with the same idle style (`IDLE` in `fighter.js`).
- **`dress-up.js`'s save and rebuild loop.** The chooser does the same job (species params plus
  outfit, rebuilt on every change) in `spinoff/fighter.js`, saved under `lys.fighter.v1`; it
  imports nothing from `dress-up.js`.

Not reusable: the store sim, displays, pathing, puzzle, stock and HUD. The inventory grid is
reused: `inventory/grid.js` for the lobby floor, team shelves and forts, and
`inventory/pick-place.js` for fort placement (see Forts).

## What the fighter needs

### New

- **Physics in a depth band** (decided 2026-10-13, replacing the earlier flat x/y plane): fighters
  walk in x (along the stage) and z (toward and away from the camera), and jump in y onto raised
  floors. Gravity, jumps, raised floors, ring-out off the front and the two ends; the back is a
  wall. Add/multiply only; no physics library (see Determinism below for why add/multiply).
- **Percent and knockback:** hits raise a fighter's percent; knockback grows with it; leaving
  the stage bounds is a ring-out. **No health bar** (decided 2026-10-14): nobody is ever knocked
  out, so a bar running down would promise an ending that never comes. Percent shows as
  **wobble** instead: the whole fighter rocks on its feet like a Weeble, growing to ~22° each way
  at 4.5 times a second by 80% (`wobbleAt` in `fighter.js`), about where a hit starts ringing a
  fighter out (measured: punches ~60%, kicks ~96%); a few hits already rock it ~7°. It tilts the
  whole body, so it shows while walking too. Not the idle layer: scaling that up (tried first)
  sped up its head tilts and read as puzzled (playtest 2026-10-14). **Keep it** (playtest 2026-10-14:
  "incredibly satisfying and cartoon-like. It looks like a spring"); springy whole-body motion is
  the house style for showing a fighter's state. Movement reads at any size
  where fur detail wouldn't. A ring-out resets percent, so the wobble stops.
  **Percent steadies** (decided 2026-10-14): a fighter nobody has hit for 1.5 s drains 30% a
  second (`CALM_TICKS`, `CALM_DRAIN` in `sim.js`), so a full wobble is gone about 4 s after the
  last hit. It drains in the sim, so the wobble and the real launch stay in step: wobbly always
  means easy to launch. Keep hitting to build it. Damage pops sprinkles (`sparkle.js` recoloured). A ring-out
  costs donuts, never playing time (see Scoring).
- **Kicking is required** (the kids' own ask, 2026-10-13). Punch and kick are the two core
  attacks, each with its own button, so a 4-year-old never needs a combo to kick.
  The rig already kicks: `motion.js` has `rd-kick-l` / `rd-kick-r` poses on the `legSwing`,
  `hipFlex` and `kneeBend` channels, used in a dance. A kick reaches further and launches flatter
  than a punch, and is a little slower. In the air it becomes a diving stomp. The owl's legs are
  short, so its kick is a talon swipe from a hop.
- **Moves:** ~6–10 per species as `DANCES`-style entries. Each move also carries its hit
  spheres per step (offset, radius, active steps), authored as data, not read off live joints
  (see Multiplayer: the spring rig is cosmetic and differs per tablet).
- **Hurt spheres:** sized from params (`headRadius`, `torsoW/H/D`, `legHeight`), fixed to the
  fighter's body position, not to animated joints.
- **Touch controls, and nothing else.** No keyboard path, not even for development. Development
  is tested by scripted inputs in node and on a real tablet. See Navigation: tap to move.
- **Per-tablet camera:** each tablet frames its own fighter and the nearest opponents, with
  edge markers for fighters off screen. Purely local; nothing about it crosses the network.

### Fixes in the shared rig

- **Tail resets above 6 units/s: fixed** (`425df37` on `0.0.1`, 2026-10-13). The tail now resets
  only on a real teleport (faster than 50 units/s, or more than 3 units in one step), so a
  knockback launch swings it.
- **No per-channel joint limits** (`MOTION-TODO.md` §Known ceilings). Exaggerated attack poses
  plus an idle twitch can push an ear through the skull.

### Arms read, thanks to the gloves

The species kits' `delighted` comments say arm poses don't read through fleece and mane
(`coatBulge`), which is why the llama cheers with its ears and the lion with its tail. That was
about bare arms moving inside the coat. Gloves fix it (see Costumes): the glove is what the eye
follows, so punches are fine as signature moves (checked by eye on dozens of random fighters,
2026-10-13). The neck, tail, mane and wings are extras on top, not substitutes.

## Navigation: tap to move

No joystick (decided 2026-10-13). Tap where you want to go and your fighter goes there. The only
buttons are 🥊 punch and 🦶 kick, which attack where the fighter is, while it keeps moving.

**It's a depth band, not a flat line** (decided 2026-10-13, after the first playtest felt like "2D
with 3D graphics"). The stage is a floor you walk around on, like a belt-scrolling brawler: a
tap on the floor is a spot in x and z, and raised floors (decks, the middle hill) are reached
by jumping. Facing is a direction on the floor (a yaw), not just left or right. Hits only land on
fighters at about the same depth (`HIT_DEPTH` in `match.js`), and every fighter casts a round
shadow on the floor so kids can see who is lined up with whom. The camera looks down at the
floor at an angle and follows your fighter.

- **Tap a place:** the fighter goes to the nearest spot it can stand on there. A tap on a higher
  platform jumps there on its own (or bounces up off a trampoline): the host keeps a small map of
  the stage's platforms with jump links between them and walks the route. A tap straight above the fighter is a jump; another
  tap higher, in the air, is the next mid-air jump. There is no jump button.
- **Tap a thing:** the fighter goes to it and acts. A bad guy: chase them. A loose donut: pick it
  up. The enemy shelf: grab. Your own shelf: bank. The fighter **ends facing what was tapped**.
- **Facing follows the direction of travel, for everyone** (decided 2026-10-13). A punch or kick
  goes the way the fighter is walking, or last walked. Turning is a small tap just in front of or
  behind the fighter. Facing is never a handicap knob: a rule that switched on and off with `help`
  would make the game work differently for a kid as their help changes.
- **Holding a finger down** makes the target follow the finger, until it lifts.
- **Walking stops at a ledge.** A tap beyond the edge of the stage walks to the edge, never off it.
  Only a jump, or being hit, leaves the stage.
- **Hits don't cancel the target.** After a launch, or a ring-out and drop-back-in, the fighter
  carries on to where it was going, so nobody has to re-tap after every hit.
- **Attacking on the move.** A punch is layered on the upper body over the walk on the legs, so
  the fighter keeps going. A kick needs the legs: the fighter pauses for the kick and walks on.
- **Fort walls: around if there's a way, stop if there isn't** (depth band, 2026-10-13). On a
  floor you can walk around things, so a tap behind a wall routes through a gap if one exists.
  If the fort is closed, the fighter goes as close as it can and stands `'blocked'`, facing the
  wall, and the kid smashes through. (In the flat version it always stopped; with a depth band
  that looked broken next to an open gap.)
- **Two thumbs at once.** One thumb taps the stage while the other presses 🥊 or 🦶, tracked
  separately by `pointerId` (Pointer Events, `touch-action: none`). A touch that starts on a
  button never counts as a move. Tested 2026-10-13 on the Android tablet with
  `spinoff/touch-test.html`: many fingers at once, each tracked separately, with the buttons held
  alongside ("like a piano keyboard"). Still to test on an iPad.
- **Buttons are big,** sized for small hands.

## Power moves: gestures behind a power bar

Many-finger gestures are extra moves inside the fighter, unlocked only when a power bar is full
(decided 2026-10-13). Tap to move and the two buttons stay the whole game for a kid who never finds
a gesture.

- **One finger always moves.** Two or more fingers on the stage at once is a gesture, and only
  when the bar is full; otherwise extra fingers are ignored and the first one steers.
- **The bar is a donut filling with icing**, next to the buttons. It fills a little with time,
  and more for landing hits, picking up donuts and banking, so even a kid who is struggling gets a
  power now and then. A full donut glows, and a ghost hand shows one gesture as a picture, no words.
  Using a power empties it.
- **Any gesture works when the bar is full.** Whatever a kid does with several fingers, something
  big happens (the slap, below, is the fallback). A deliberate player chooses which.
- **Recognised on the tablet, sent as one input.** The tablet turns the finger tracks into "power
  X at point P" and sends that to the host, a few bytes. The recogniser is a pure function of
  pointer tracks, tested in node with scripted tracks.
- **Same gestures, species flavour.** Each gesture does the same job for every fighter but looks
  like its species: the lion's slap is a roar, the llama's a stomp, the owl's a wing gust.

**Heroes unlock lots of moves by level** (decided 2026-10-13). Level 1 is 🥊, 🦶 and the
whole-hand slap. The air stomp is on from Level 1 too (decided 2026-10-14), because kids press
🦶 mid-jump anyway, but nothing teaches or highlights it, and early stages have nothing tall
enough to make jumping down onto people the obvious play. Every level after adds one or two: a new power gesture, a situational move (dash
punch, air stomp, wall-kick jump, charged swing) or a species extra (the llama's headbutt, the
lion's roar, the owl's glide). A locked gesture falls back to the slap, so a full bar always does
something. Unlocks are per game like everything else, and a game that starts on a high level
starts with that level's moves. Hero and bad-guy unlocks live in **one move table keyed by level**,
so the two ladders can't drift apart. A first ladder, for tuning:

| Level | New for heroes |
| --- | --- |
| 1 | 🥊 punch, 🦶 kick, whole-hand slap; air stomp (🦶 in the air), there but not taught |
| 2 | Two-finger swipe: donut roll |
| 3 | Open: the next gesture from the table below |
| 4 | Pinch on a bad guy: grab and throw |
| 5 | Species extra: headbutt / roar / glide |
| 6 | Spread: gust; dash punch (🥊 while running) |
| 7 | Two-finger tap on your shelf: icing dome |
| 8 | Wall-kick jump; charged swing (hold 🥊) |
| 9+ | The rest of the gesture table, one per level |

**Idea: a falling attack off something tall** (playtest 2026-10-14, kept for later). The owl
falling off a tall waffle stack swung round toward the stack on the way down. That was a facing
bug, now fixed (facing holds in the air), but the swing looked like a wind-up, so keep it as a
move: press 🦶 while falling from a height and the fighter turns, tucks and drops onto whatever
is below, landing harder the further it fell (a bigger BAM, a longer hit-stop, knocks fort
pieces loose). It's the big brother of the air stomp (Level 1 below), so it slots in as a later
unlock or a power move.

Candidate gestures (brainstorm, 2026-10-13; first ones to try are marked ★):

| Gesture | Power | For |
| --- | --- | --- |
| ★ Whole-hand slap (4+ fingers at once) | Ground pound: a sprinkle shockwave that launches bad guys and knocks fort pieces loose | The fallback; what a 4-year-old does anyway |
| ★ Two-finger swipe | Donut roll: charge across the stage that way, bowling bad guys over | Getting home fast with a full bag |
| ★ Pinch on a bad guy | Grab and throw them | Precision, for confident hands |
| Spread (reverse pinch) | Gust that pushes everyone near you away | Defending your shelf |
| Two-finger twist | Spin attack, a little tornado | Crowds |
| Three-finger swipe up | Rocket jump to the top of the stage | Reaching the sprinkle donuts up high |
| Two fingers held apart | Candy-cane bridge between them, for a few seconds | Building mid-match |
| Two-finger tap on your shelf | Icing dome over your shelf for a few seconds | Last-second defence |
| Drumming (many quick taps) | Sprinkle cannon | Mashers |

### Team powers

Teamwork makes the dream work (decided 2026-10-13). Teammates who fire powers close together get
a bigger, combined power, and every tablet shows what teammates are doing so they can find each
other.

- **Who can combine:** heroes, and bad guys played by people (decided 2026-10-13). Two grownup bad
  guys can join bolts. CPU bad guys never combine: perfectly timed CPU combos would be too much for
  4-year-olds.
- **Nobody waits.** The first power fires at once, as usual. It opens a **2-second join window**:
  any teammate who fires a power inside it adds the team bonus on top. Missing the window costs
  nothing.
- **Combos:** the same gesture twice is a bigger version (two slaps: an earthquake across the
  whole stage; two donut rolls: a donut parade). Different gestures make a mix, decided per pair
  as powers get built. A third or later teammate in the window adds more sprinkles and a bigger
  push, not new rules.
- **Joining shows.** A sparkly ribbon in the team's colours links the fighters in the combo, and
  the combo pops a burst big enough to see from across the stage.

Visual indicators, so each kid can tell what their teammates are doing:

- **Everyone's power bar is visible.** A small icing ring floats over every teammate's fighter;
  along the screen edge, one donut per teammate in their fur colour fills as their bar does.
  A full one glows.
- **A fired power calls the team.** The firing fighter glows with the power's picture over its
  head, and on every teammate's screen a big pulsing ring and the same picture appear on that
  fighter, or on its edge marker if it is off screen, with the ring shrinking as the window
  closes. "Join now" is told by picture and timing, no words.
- **Where teammates are heading.** Each teammate's tap target shows as a small footprint in their
  fur colour, so "I'm going for the shelf" is visible without talking. The target already goes
  to the host as an input, so this costs one more snapshot field.
- **The network side is small.** Each fighter's bar level (one byte), current target and power
  state ride in the snapshot; the host alone decides whether a power joined a window.

## Scoring: everyone plays the whole time

No lives, no elimination, no waiting to respawn. A match runs on a timer and every player is in
it from start to finish.

- **The score is the team's shelf.** Donuts banked on your team's shelf count; donuts in a bag
  are in transit and count for nobody yet. When the timer ends, the team with more donuts on its
  shelf wins (see Mode: donut capture the flag).
- **A ring-out drops donuts, not the player.** The faller's bag spills across the stage as
  pickups, and they are back at once: dropped in above their own shelf, fully controllable on
  the way down, with respawn invincibility so nobody is waiting at the spawn point. Their
  percent resets to 0.
- **Anyone can grab the spilled donuts**, the faller included, on the way back in. A ring-out
  turns into a scramble instead of a pause.
- **Any hit pops the carried donut** out of the bag as a pickup, so carrying is risky even
  without ring-outs.

- **Everyone carries one donut at a time to start** (decided 2026-10-13). A grab fills the bag;
  the carrier has to run home and bank before grabbing again, and any hit knocks the donut loose.
  A bigger bag comes later, as an unlock (see Open questions). Bad guys follow the same limit.

Starting numbers to tune: 12 donuts per shelf, one donut per bag, a ring-out spills the whole bag,
a **90-second** match to start (decided 2026-10-13; the kids will say if it's too short), never
over 3 minutes.
- **How donuts look** (decided 2026-10-13). Heroes' donuts are beige dough with frosting in the
  heroes' own colours: the shelf's donuts share out the fur colours of the heroes in the room, so
  the kids' shelf is a colour riot of their own fighters. Villains' donuts are black dough with
  purple frosting and a squiggly zig-zag drizzle across it (a wavy line, never a straight bar; decided 2026-10-13). A donut keeps its look wherever it goes, which
  is how a stolen donut reads as stolen.
- **Donuts are never destroyed** (decided 2026-10-13, MVP). The 24 donuts are always somewhere:
  on a shelf, in a bag, or on the floor, so every donut the bad guys hold is one the kids don't.
- **Dropped donuts stay where they land** (decided 2026-10-13), as many as pile up, until someone
  taps one and picks it up (see Navigation: tap a thing). Scrambling for a loose donut is a real
  tactic, like a fumble in football; nothing rolls home on its own.
- **So every top a donut can land on must be reachable** (playtest 2026-10-14: a generated
  difficulty-5 stage dropped a donut on a pillar too tall to jump, and it was lost for the match).
  The playability check (`check-level.mjs`, every hand-made and generated level) taps a hero onto
  every raised top and fails the level if one can't be stood on. That means no top higher than
  the stage's jump reaches above something you can stand on, or a trampoline's launch reaches
  above a trampoline touching its edge. Route-finding takes both from the physics (`reachUp` in
  `sim.js`: `JUMP_MARGIN` 0.78 of the jump's height v²/2g, leaving time to get over the edge):
  1.3 on breakfast, 1.95 on cake, 3.9 off a cake trampoline.
- **Terrain height and movement scale together** (decided 2026-10-14). Taller terrain only comes
  with a way up that every kid has: a double jump the route-finding plans (today a second jump
  exists only by tapping above yourself mid-air, and routes never use it), or a flight goodie.
  Raising one without the other just makes lost donuts. Whichever comes first sets the new
  height limit in the playability check. Cake's spongy jumps and icing trampolines are the first
  such way up (Stages and difficulty are separate, below): cake stages go taller because every
  kid jumps higher there.

## Mode: donut capture the flag

Two teams, the kids and the bad guys (see Bad guys), and two bakery shelves, one at each end of
a stage wider than one screen. The per-tablet camera follows each kid's own fighter, so the
wide stage costs nothing new.

**The stage is in thirds** (decided 2026-10-13). One hand-made, mirrored stage for the MVP:

| Zone | Terrain | Forts |
| --- | --- | --- |
| Heroes' third | A raised deck against the back wall with their shelf on it | Heroes build here only |
| Middle third | A hill in the middle of the band, to jump on or walk around (breakfast: a stack of big pancakes) | Nobody builds: always open ground to fight over |
| Bad guys' third | The mirror of the heroes' third | Bad guys build here only |

The band is wide enough to walk around things, so one wall never closes a side: a fort is a ring
on the floor grid around the deck, and a raider looks for the gap or the weakest piece. Terrain
never breaks; only fort pieces do, so routes stay predictable. Milestone 1's bad-guy fort is a
wall across the band (two high in the middle) with gaps at the back and front.
Later levels can bring new hand-made stages.

- **Many small flags.** Each shelf starts stocked with donuts. Every donut is a flag, so every
  kid can score something in a match, not only whoever reaches a single flag first.
- **Grab:** tap the enemy shelf (see Navigation); on arrival the fighter grabs. The top donut there is taken off the shelf
  (`lift` in `inventory/grid.js`) into your bag.
- **Bank:** touch your own shelf. Everything in your bag goes onto it on its own: `anySlot` finds
  the spot and `place` puts it there, both in `inventory/grid.js`. No dragging, so a 4-year-old
  banks by running home.
- **A carried donut is oversized** (decided 2026-10-13): about two-thirds of head size, poking out
  of the top of the bag over the shoulder, so who is carrying reads from anywhere on screen (a
  donut drawn at bag scale would be ~10 px at tablet size). It's the house rule from
  `PROJECT-BAGS.md` §1–2 ("balls poking out, countable"), scaled up. Heroes' donuts
  and villains' donuts look different (below), so a bad guy carrying the kids' donut is visibly
  carrying *theirs*. Edge
  markers show it for carriers off screen, and a hit sends it flying out in an arc. A full bag
  can't grab more.
- **Shelves are the shop's shelves.** A team shelf is a `grid.js` display like the wall shelves
  in `DISPLAY_SLOTS` (`characters/store/scene/displays.js`), standing against the back wall on its
  team's deck: columns across, shelves up, facing the camera. The grab and bank rules are pure `grid.js` calls with no three.js, so they run in the node
  sim test.
- **Foes are solid, teammates aren't** (decided 2026-10-14, playtest: "fighter can walk straight
  through another fighter on the other team"). Bodies on different teams push each other apart,
  half each, so walking into a bad guy shoulders them aside rather than passing through; a jump
  over is clear once your feet are above their head. Teammates overlap freely, so six heroes never
  jam a doorway.
- **Wading, not routing round** (decided 2026-10-14): a fighter tapped past a syrup puddle walks
  straight through it and is slowed; getting round it is the player's call.
- **Friendly fire is off, as a setting.** Teammates pass through each other's attacks. Every
  fighter carries a `team`, and whether one fighter can hit another is `canHit(a, b, match)` in
  `spinoff/roster.js`, with `MATCH.friendlyFire` false. A kid-against-kid mode later is that one
  setting, not a rewrite (decided 2026-10-13).

## Forts: build it, then knock it down

Every level is two rounds (decided 2026-10-13): a **build it** round, where each team fortifies
its own shelf, then the **knock it down** round, the timed capture-the-flag match. Builders
and smashers each get a round that is theirs.

- **The build round has no timer.** It ends when both teams are ready: every hero has tapped 👍
  and every bad-guy player has tapped 👍. Tapping 👍 again takes it back, to keep building.
  Nobody is rushed, and a careful builder can take as long as their team lets them.
- **Readers can force the start** (decided 2026-10-13). Beside 👍 is the written line "hold 👍 to
  start now". Holding 👍 for 2 seconds, with a ring filling around it, starts the round for
  everyone. Reading is the gate, not a grown-up/kid label: nobody is marked as anything, and a
  kid who can read the line has earned the button. The 2-second hold keeps a 4-year-old's
  ordinary tap from setting it off.
- **CPU bad guys build their fort and are ready at once.** With no grownup bad guys, the bad
  guys' side is ready from the start, so only the heroes decide when to go.
- **Placement is the shop's touch picker** (`inventory/pick-place.js` on the team's
  `inventory/grid.js` floor), with the `help` table's grab radius and snap reach for small hands.
- **Stages and difficulty are separate** (decided 2026-10-14). Past the tutorial, a *stage* is a
  place with its own look and terrain rules, and *difficulty* is how hard the match is (bad-guy
  count, fort pile, moves, generated terrain problems). Anything tried at several difficulties
  must be playable on every stage. For now there are two stages, **breakfast** and **cake**,
  plus the tutorial (on breakfast). Each stage's terrain rule makes it play differently, not
  just look different. Terrain lives in the `Stage` data (`butter`, `springs`, `bounce`), so it is
  deterministic and crosses the network with the stage.
  - **Breakfast:** syrup slows you, **butter makes you slippery** (built): on a butter patch
    (`Stage.butter`, round patches on any top, like syrup) a fighter's velocity only eases
    toward the one it wants (`BUTTER_GRIP` of the gap a tick), so it keeps sliding the way it was
    going, takes longer to stop and turn round (about 13 ticks to reverse, against 1), and slides
    past where it was tapped to stop, then comes back. Once it has slid past, the comeback stops
    on the spot, so a small slick can't keep it sliding off and back forever; it only counts as
    arrived once it has stopped, and stepping off butter gives your grip back at once. Butter is
    drawn as a pale, glossy, opaque slick with a pat in the middle, never like the dark,
    see-through syrup. The hand-made breakfast stage has a slick in front of each deck (you jump
    up off a slide) and one on the pancake hill; generated breakfast stages get the same.
  - **Cake: spongy** (decided and built 2026-10-14). **Bouncy sponge:** every jump on cake goes
    `BOUNCE.cake` (1.5×) as high (`Stage.bounce`), and landings squish and spring back on the
    page (drawing only: the sim never bounces you on its own). **Icing trampolines**
    (`Stage.springs`): round patches on a top, drawn as a flooded icing disc with a piped rim in
    a loud colour different from the plain cake icing, always icing, never a mechanical
    trampoline; it squashes when used. Stepping or landing on one launches you `SPRING_LIFT`
    (2×) as high as a cake jump; landing back on the one that just launched you doesn't, so a
    bounce settles instead of looping. Route-finding bounces off a trampoline to reach a top it
    touches the edge of. **Cake stages can be crazy tall,** because higher jumps and trampolines
    are a way up every kid has (Terrain height and movement scale together, above): the
    hand-made cake stage's decks are 1.8 high (a sponge jump, out of reach on breakfast) and
    its middle tower is 3.6 high, reached only off the icing pad at its foot. The playability
    check still proves every top can be stood on.
- **Each stage has its own treat theme** (decided 2026-10-14, replacing "World 1 is Gingerbread
  World"). The theme dresses the stage and the fort pieces. `spinoff/scenery.js` `THEMES` holds
  one entry per stage. While there's no stage button, the address picks: `play.html` is the
  tutorial, `play.html?stage=cake` (or `breakfast`) a hand-made stage, and adding `&seed=8` (and
  `&difficulty=1` to `5`) a generated one on that stage. `?level=` is gone.
- **The tutorial makes you break in** (decided 2026-10-14). It's the tutorial, so the bad guys' fort
  shuts their end off completely: a wall right across the band, two high (too tall to hop), no
  gap at the front or back. Walking round it can't teach that forts break; this way the first
  steal needs a punch or a kick. One broken brick drops the one above it to hop height, so one
  good kick opens a way. `breakIn: true` on the level makes the playability check prove both
  halves in the real sim: no route to the shelf without breaking, and a hero who kicks when it
  stands blocked gets in (about 7 s, 3 bricks). The hand-made stages go back to the wall with gaps.
- **Levels are data** (2026-10-14): `spinoff/levels.js` holds `TUTORIAL` and `STAGES` (one
  hand-made layout per stage), each a layout (a `Stage`: floors, each a `ground`, `deck` or
  `hill` that the theme dresses by kind, the back wall, shelves, zones, ring-out, bricks, syrup,
  butter, trampolines and bounce) and the name of its stage; `levelFor` reads the address. The
  stage is passed in, never imported: `createMatch(entrants, stage)`, and the page's taps,
  shadows and scenery take the same stage. `spinoff/levels.test.mjs` plays the tutorial and
  every stage in the real sim (a hero tapped to the bad guys' shelf gets there, every top can be
  stood on) and checks shelves stand on floors, every patch lies on a floor clear of higher ones
  and no brick starts inside a raised floor.
  - **Breakfast:** a waffle floor (golden ridges, dark pockets on a 0.5 grid); each
    deck is a stack of waffles; translucent syrup drips off the front edge; the middle hill is a
    stack of big pancakes, its corners rounded in the rules too
    (`Floor.round`), so you never stand on thin air past the drawn pancake. Any butter drawn on
    it is real butter. The top layer of a stack is always exactly the floor you stand on.
  - **Sticky syrup** (decided 2026-10-14): round puddles (the stage's `puddles`) slow anyone walking
    on the ground through them to `SYRUP_SLOW` (0.45×) of walking speed; jumping over is full
    speed. Placed to make choices: one in each gap round the bad guys' wall (smash through the
    wall, or wade round it) and one in each half of the field. Routing ignores syrup for now.
    A level with no syrup passes no puddles. Fort pieces are **little
    pancake stacks, mortared with whipped cream in the builder's colour**: three pancakes with a
    cream layer above each, the cream wider than the pancakes so the colour shows from any side.
    Bad guys' stacks are chocolate pancakes with dark purple cream. Damage slides the top
    pancake off and leans the stack.
  - **Cake and sprinkles:** the first playtest's look: gingerbread with an icing top, the
    house-style sprinkles (Theme: treats), white icing drips, the green gumdrop hill (now the
    3.6-high tower), icing trampolines, and gingerbread-panel fort pieces (cookie panel, piped
    border, flooded icing, cracks). The playtest said the hill and panels don't read as baked
    yet; fix them when the cake stage gets its own pieces.
  - Gingerbread as its own theme, and worlds beyond, wait until there are more levels.
- **Fort pieces are coloured by their topping, in the builder's colour** (decided 2026-10-13;
  whipped cream on breakfast, icing on cake), flooded big enough to read at tablet size (thin
  piped lines would just look brown). One material per kind, colour per piece, so a many-coloured
  fort draws in a few batches. Kinds differ by shape, one new kind per level, unlocked for the
  rest of the game. The table below was written for gingerbread; later rows get re-dressed in
  each level's theme:

  | Level | Piece | Shape |
  | --- | --- | --- |
  | 1 | Pancake stack | Three pancakes mortared with whipped cream |
  | 2 | Gable wall | House front with a peaked roof |
  | 3 | Gumdrop bouncer | Low slab with a giant gumdrop to bounce on |
  | 4 | Candy-cane post | Tall striped pillar, for reaching the top shelf |
  | 5 | Gingerbread-man shield | A gingerbread man standing guard; takes extra hits |
  | 6+ | More house parts | Windows, doors, chimneys |

- **Heroes place only their own pieces** (decided 2026-10-13). Every hero's pieces carry their
  fur colour (plus a small pattern when two kids share a colour). A hero can place and move only
  their own pieces, never a teammate's, and can stack on anything: their own or a teammate's.
  Nothing forces teamwork; the kids find it.
- **Mixed walls are tougher, and look it** (decided 2026-10-13). Where a hero's piece rests on a
  teammate's piece of another colour, both pieces in that joint take one extra hit. A piece
  bonded twice (the middle of a three-colour stack) takes two extra. Bonded pieces are drawn
  thicker, bulging toward the camera and overhanging their cell a little, with a fat bead of
  cream or icing "glue" in the seam. Same-colour stacks get nothing. Toughness is computed from the
  grid when the build round ends (count different-colour teammate pieces directly above and
  below), a pure function with a node test, and drawing follows that count.
- **Bad guys' pieces are all one colour and skip the teamwork rules** (decided 2026-10-13): dark
  chocolate pastry (pancakes, gingerbread) with dark purple cream or icing. Any bad guy can place or move any bad-guy piece,
  and their walls never get the mixed bonus, so only the heroes can build chunky walls.
- **Pieces are fixed by level and number of players** (decided 2026-10-13). Each player gets their
  own small pile to place, so siblings never fight over pieces and every kid builds something:

  ```
  piecesEach(level) = min(6, 2 + floor((level - 1) / 2))      team pieces = piecesEach × team size
  ```

  Level 1 is 2 each, level 3 is 3 each, up to 6 each from level 9. The pile mixes the unlocked
  piece kinds, newest first, so a new level's piece is always in hand. CPU bad guys count
  toward their team's size and place theirs instantly. The team's grid floor caps the total, so
  a big team on a small stage can't fill every cell.
- **Every fort piece can be smashed** in the knock-it-down round, by anyone, so a fort slows the
  other team down without ever walling a 4-year-old out. Kicks hit fort pieces hardest. A piece
  must rest on something when placed (the grid's support rule).
- **Pieces on top fall with a broken piece** (decided 2026-10-13). When a piece breaks, everything
  resting on it drops straight down until it lands on something, and stays whole: knocking out
  the bottom of a tall wall brings the wall down a level. Mixed-joint toughness is recounted when
  pieces land, so a fallen wall can lose (or gain) its bonus.

## Handicap: one `help` number per player

Players are 4–6 year olds and grownups in the same match. Each player has one number, `help`,
that nobody chooses: the game sets it from how they play (below). Every handicap knob is a straight
line between a **pro** value and a **full help** value:

```
knob(help) = pro + (fullHelp - pro) * help        help ∈ [-0.5, 1], in steps of 0.25
```

`help = 0` is the game as designed. Positive values help. Negative values extend the same line
the other way, so a grownup at `-0.5` is handicapped by every knob at once without a second
system.

| Knob | Pro (0) | Full help (1) | Grownup (-0.5) | Where it applies |
| --- | --- | --- | --- | --- |
| Knockback taken | ×1.0 | ×0.55 | ×1.23 | host sim |
| Damage dealt | ×1.0 | ×1.5 | ×0.75 | host sim |
| Own hit-sphere radius | ×1.0 | ×1.5 | ×0.75 | host sim |
| Input buffer (ticks a press stays live) | 4 | 14 | 0 | host sim |
| Mid-air jumps | 1 | 3 | 1 (never below pro) | host sim |
| Power bar fill rate | ×1.0 | ×1.6 | ×0.7 | host sim |
| Pickup reach | ×1.0 | ×2.0 | ×1.0 (never below pro) | host sim |
| Respawn invincibility (s) | 2 | 4 | 1 | host sim |
| Safety bounce below the stage, per fall | 0 | 1 (at help ≥ 0.75), recharges after 20 s | 0 | host sim |
| Touch button size | ×1.0 | ×1.4 | ×1.0 | local UI |
| Placement grab radius / snap reach | 44 px / 1.6 cells | 64 px / 2.5 cells | 44 px / 1.6 cells | local UI (`makePicker` already takes both as functions) |

Starting points to tune in play, not measured values. Whole-number knobs round; on/off knobs
switch at the threshold shown. UI knobs never go below pro: a grownup is handicapped in the fight,
never with smaller buttons.

**Nobody sets `help`; scoring does** (decided 2026-10-13, the Mario Kart way). Every hero starts at
full help, `1`. After each level the host compares each hero's banked donuts with their fair share
(the team's banked donuts ÷ the number of heroes):

- more than 1.5× their share: `help` drops a quarter, down to `-0.5` at the lowest;
- less than half their share: `help` rises a quarter, up to `1`;
- in between: no change.

**A hero playing alone** has the whole team's total as their share, so the rule above could never
move. With one hero, the share is the bad guys' banked donuts instead: the same thresholds, the
same signal (the donut margin) that will scale the CPU bad guys. Any donuts against the bad guys'
none counts as more than 1.5×.

So a grownup on the heroes' team who keeps scoring slides down to `-0.5` on their own, and a kid
who is struggling climbs back up, with no age, no label and no grown-up deciding. `help` stays
fixed during a match (the sim stays plain arithmetic) and changes only between levels. It is
not saved: every game starts every hero at `1` again (see Bad guys, Saving progress). Starting numbers (1.5×, ½, a quarter
a level) are for tuning in play. A grownup who passes donuts to a kid instead of banking them
keeps their help, which is the behaviour the game wants anyway.

Bad guys are outside this: a played bad guy is always `-0.5`, and CPU bad
guys play at `0` until auto-scaling exists (see Bad guys).

Design rules:

- **Help may be visible if it looks like a power, never like a label.** The Mario Kart test:
  kids happily take a big item they can see when they're behind; what stings is being marked
  as the easy one. So a safety bounce can be a showy bouncy-icing trampoline and a bigger hit can pop
  extra sprinkles, but there is no "easy" badge or help number in play. Levels are never shown
  anywhere; they change on their own (above).
- **Catch-up items are the visible, automatic half.** Once item drops exist (milestone 4), weight
  them by standing: the team behind on its shelf gets the best drops. This adjusts within a
  match on its own, while `help` stays the fixed per-player baseline.
- **Host-side and plain arithmetic.** Sim knobs are multiplies and adds on the host, so they keep
  the determinism rule. `help` is quantised to quarters so every value is exact.
- **One number, not a menu.** A new knob is a new table row with its two endpoints. No per-knob
  settings screen.

Check: the milestone 1 node test runs the same scripted hit against fighters at `help` 1, 0 and
-0.5 and asserts launch distance goes down as `help` goes up.

## Multiplayer

### Where things stand

The game ships as static files on GitHub Pages. The lobby's networking is built
(`spinoff/net.js`, Trystero; see Lobby): every tablet swaps fighters with every other. Shared
matches are built too (0.0.2): `spinoff/multiplayer.js` is the host and guest logic over any
link (`send(type, data, to)` / `on(type, fn)`), `spinoff/together.js` is the play page's glue,
and `spinoff/multiplayer.test.mjs` runs a host and guests over an in-memory link that loses and
reorders snapshots. What was built, and what the build decided (2026-10-14, to confirm):

- **Starting together.** In a room, the tablet that opened it (🏠) gets ▶️; the others don't.
  ▶️ sends `go` to everyone in the room, and every tablet loads `play.html?room=CODE` (the host's
  with `&host=N`, N the guests it expects, counted before `go` goes out: the guests leave the lobby
  the moment it arrives, and a count taken after it found none, so the host waited for nobody). A page load drops the lobby's connections, so the
  match has its own Trystero room (`donut-CODE-play`), apart from the lobby's; everyone rejoins it
  with the same home-network check, guests a random 0–2 s apart (see Relay rate limits). The host waits for its N guests' fighters (60 s at most,
  `ponytail:`, then it starts with whoever came), then sends `start` once. ⏳ shows meanwhile,
  with 👋 back to the lobby.
- **`start`** (host → each guest, once): the level as data (`theme` and the whole `Stage`,
  opaque: the guest never rebuilds it), the roster (`id`, `team`, and each player's fighter save,
  or `dummy: true` for the training dummy, which every tablet dresses the same), and the round
  settings (`seconds`). Ids are Trystero peer ids. Every player is a hero; the dummy is the bad
  guys, as in practice. The guest checks it: a known theme, exactly one ground floor, floors with
  numbers, shelves with a team, every number finite, each fighter through `readFighter`, and
  itself in the roster; anything else is ignored. The sender of the first good `start` is the
  host from then on; `snap` and `again` from anyone else are ignored.
- **`input`** (guest → host, reliable): the `Input` from `controls.take`, sent only when it says
  something (a new target, a 🥊 / 🦶 press, or `away`). The host keys it by the sender's peer id,
  never by anything in the message, so no tablet can steer another's fighter, and ignores
  senders outside the roster and malformed or absurd inputs (non-finite or huge numbers, unknown
  teams or things, over-long ids). Inputs arriving between ticks merge: the last target, any press.
- **`snap`** (host → guests, 30 Hz): the `Snapshot` with numbers rounded to 3 decimals, plus
  `seq`, `paused`, and `events`. The host keeps sending while paused and on the end card, which
  doubles as its heartbeat. A guest keeps a snapshot only if its `seq` is newer than the last.
  Bricks and shelves (over half the bytes) are left out unless they changed in the last half
  second, and sent anyway every 15th snapshot; guests carry the last ones over. Measured: 2
  fighters about 0.9 KB on average (3.9 KB with bricks and shelves), 8 fighters about 2.5 KB
  (5.8 KB); `start` is about 3.6 KB for 2 and 16 KB for 8 (the fighter saves).
- **Events survive a lost snapshot:** every snapshot repeats the last half second's hits,
  `fullBag` and `donutEvents`, each group tagged with its tick, and a guest plays only the
  groups newer than the newest tick it has seen. So a guest that loses up to about seven
  snapshots in a row still gets every BAM and steal, exactly once.
- **Guests draw:** no sim; every fighter, the guest's own too, is drawn one to two snapshots back
  (2–4 ticks), between the two snapshots either side, position and facing; everything else comes
  from the newest snapshot. (Drawn from the newest snapshot, a guest's own fighter moved only every
  other frame, and jumped when snapshots arrived in clumps: decided 2026-10-15.) Each tablet's camera follows its own fighter.
- **Channel, as built:** Trystero 0.26 has no per-action channel options: every action rides one
  reliable, ordered data channel, snapshots too. `ponytail:` a negotiated
  `{ ordered: false, maxRetransmits: 0 }` channel on the peer connection if snapshots stutter.
  The design above doesn't depend on reliability, so the switch is local to `net.js`.
- **Pause, away, gone:** see Network gotchas. A guest who drops out mid-match sits where it stopped
  for the rest of the round (the sim can't take a fighter out, and a sitting fighter can still
  be hit and still drops its donut). Its tablet can't rejoin that match.
- **Again:** ▶️ on the host's end card sends `again`; every tablet reloads into a fresh match the
  same way it started (rejoin, ⏳, `start`). Guests' ▶️ on the end card and the ⏸ card is hidden,
  and so is their ⏸. 👋 goes back to the lobby's first screen, out of the room.
- **Late joiners play the next round** (0.0.3). The roster stays fixed for a round. Once `start` is
  out, the host's match page also joins the lobby room (`donut-CODE`, same `openRoom`, same home
  check; opened after `start` so its relay hellos don't land with the guests', and once per round,
  as the page reloads). A tablet that arrives there gets `playing` from the host, once, and its
  lobby shows ⏳ beside 👋 (its own fighter and the host's stand on the floor) until `go`, or until
  the host leaves the lobby room. ▶️ on the host's end card sends `go` to every late joiner still
  there (`lateJoiners` in `multiplayer.js`) and counts them into the next round's `host=N`, so they
  load the match like any guest. `playing` is the only extra message: a joiner learns the room is
  mid-match from the host answering it, not from anything announced. One that taps 🔑 while the
  host is still on ⏳ (before `start`) sees nobody until `start` goes out. `?debug=1` on the host
  notes each `lobby: XXXX waits for next round`. The room code (the lobby's treats) shows on the end,
  ⏸ and ⏳ cards, never on the in-play HUD.

The yarn store's seeded rng (ROADMAP A1) draws from
`world.rngState` (`draw` in `characters/store/core/util.js`); the spinoff doesn't depend on it.

### Design: one host tablet, star topology

- **One kid's tablet hosts**, and that kid also plays. The host runs the only copy of the game
  state at a fixed 60 Hz tick. Each guest sends inputs to the host; the host sends each guest
  state snapshots. Guests never talk to each other: 8 tablets is 7 connections, not 28.
- **Transport is WebRTC data channels**, tablet to tablet over the home network. No server of
  ours. Connecting uses [Trystero](https://github.com/dmotz/trystero) (one CDN import) over its
  Nostr strategy: the host shows a random room code, guests tap it in on the picture keypad (see Lobby).
- **Home network only** (decided 2026-10-13). The game is published as static files (GitHub
  Pages), and every household plays only with the tablets on its own Wi-Fi; nothing about a game
  or a fighter leaves the house. Three layers, in `spinoff/net.js` and `spinoff/roster.js`:
  - **No STUN servers** (`rtcConfig: { iceServers: [] }`, which replaces Trystero's Google and
    Cloudflare defaults). A tablet never learns its public address, so it can't leak it, and
    WebRTC has no way to build a route across the internet. Browsers also hide home addresses
    behind random `.local` names.
  - **The room code scrambles the introductions** (Trystero's `password`), so the public Nostr
    relays only pass along encrypted connection details. The code is a label that sorts tablets
    within a house, not a lock: two households on the same code just fail to connect.
  - **Each tablet checks the real route** (`remoteOf` + `isHomeRoute`): after connecting, it asks
    its own browser which route the connection uses and hangs up unless the far end is a
    home-network address (private IPv4, IPv6 local ranges, or a hidden `.local` host). Nothing is
    sent or accepted before the check. This covers the one gap no STUN leaves: a modified copy
    advertising a public IPv6 address. The check runs on the honest tablet, so editing a copy of
    the game can't get around it.

  What still crosses the internet: the page itself (from GitHub Pages), and the scrambled
  introductions through the relays, which see that a tablet connected to them (its public IP, as
  any website does) but not what it says. A household that can't reach the relays can't start a
  game, even though play never leaves the house.
- **Inputs** are a move target (a point or a tapped thing), 🥊 / 🦶 presses and a fired power
  ("power X at point P", see Power moves), sent only when they change, a few bytes each, on a
  reliable channel. A lost packet costs little: the target stays where it was. The host does the route-finding.
- **Snapshots** (per fighter: position, velocity, facing, percent, donuts in bag, move id, move
  step, ~30 bytes; under 450 bytes for 14 fighters; plus a few bytes each for bar level, tap
  target and power state, see Team powers; plus each shelf's donut count and loose donut pickups
  as positions) go 30 times a second on an unreliable channel
  (`{ ordered: false, maxRetransmits: 0 }`). A newer snapshot replaces any lost one, so a drop
  never stalls the stream.
- **Guests draw other fighters ~1–2 snapshots behind**, interpolating between the last two.
- **No client prediction.** On home Wi-Fi a round trip is 5–20 ms, so a guest's own fighter
  answers about one frame late. `ponytail:` add prediction for the guest's own fighter only if
  that feels laggy in play.
- **Rollback is out.** It needs bit-identical simulation on every tablet, and mispredictions
  multiply with 8 players. Host-authoritative needs neither.

### What crosses the network and what doesn't

The split follows the A1 plan: gameplay is one authority, cosmetics are local.

| Crosses | Stays local on each tablet |
| --- | --- |
| Join: the `lys.fighter.v1` save (species, params, outfit, gloves) and the sticker card (`lys.stamps.v1`, see Bad guys, Saving progress), about 2 KB of JSON sent once; never `help`, which the host sets; or, for a bad-guy player, only "bad guy" (the preset comes from the sorted ids) | Building the character from those params (`createCharacter` is deterministic from params; randomness lives only in `randomise*`) |
| Inputs, guest → host | Spring rig, idle layer, blinks, ear flicks, tail sway (`motion.js` `Math.random`) |
| Snapshots, host → guest: move id + step drives the guest's rig toward that move's pose | Camera, edge markers, sparkle effects, sound |

Send params, never a seed: a seed would regenerate the character through `randomise*`, which
calls `Math.random`.

### Determinism

Only the host simulates, so cross-device determinism is not required. Keep the physics on
add/multiply anyway and the gameplay out of the spring rig: it costs nothing now and leaves
rollback or replays possible later.

### Network gotchas

- **Clocks that disagree** (found 2026-10-15). A Nostr relay only passes a subscriber the messages
  stamped after the subscriber's own "now", so a tablet whose clock runs behind another's goes
  unheard by it until its clock catches up. After its first 7 s Trystero announces only once a
  minute, so tablets that join together (every match start) and are more than a few seconds apart
  missed each other for a minute; the lobby hid it, because its tablets join minutes apart.
  `net.js` asks the relays from 10 minutes earlier (`clockSlack`; the messages are never stored, so
  nothing old comes back). `?debug=1` shows each tablet's clock (UTC) to compare side by side, and
  `heard` (tablets whose relay messages arrived) apart from `peers` (tablets connected).
- **Only on https** (found 2026-10-15). Trystero hashes room names and scrambles the hellos with
  `crypto.subtle`, which browsers only give a secure page: https, or `localhost`. On plain
  `http://192.168.…` joining fails without an error and the lobby just never sees anyone. GitHub
  Pages is https; at home `serve.py` serves https when a home-made `cert.pem`/`key.pem` sits beside
  it (each tablet taps past the warning once), and redirects a plain http request to https.
- **Relay rate limits** (found 2026-10-15). Every tablet in a home reaches the public relays from
  one internet address, and each announces 5 times in its first ~9 s in a room. Three tablets
  starting a match together, after an evening of reloads, got `rate-limited`, and Trystero skips a
  relay that limits it for a minute or more. Rooms use 10 relays (`relayConfig.redundancy`; a
  hello needs only one), and guests join a match's room up to 2 s apart. `ponytail:` signalling
  through `serve.py` would keep even the hellos at home, but GitHub Pages players would still need
  the relays.
- **Hidden addresses** (found 2026-10-15). Browsers hide a tablet's own addresses behind `.local`
  names. A tablet that connects by resolving the other's `.local` name shows up as a peer-reflexive
  route with no address; that only works on the same network, so the home check accepts it (and
  still hangs up on a hidden server-reflexive or relayed route, or a visible non-home address).
- **Client isolation.** Guest networks and some mesh Wi-Fi systems block devices from reaching
  each other. Symptom: everyone joins the room but no data channel opens. Use the main network.
- **Leaving the screen** (decided 2026-10-14). A browser stops running a page that isn't on screen
  (background tabs are throttled, then frozen; a dark screen stops everything), and the game only
  runs on the host, so who leaves matters:
  - **Screens stay on in a match:** every tablet holds a screen wake lock (`navigator.wakeLock`)
    during a round, re-asked on every resume, so a tablet never dims and sleeps mid-fight.
  - **A guest who leaves sits down.** The page sends `away: true` on `visibilitychange`; the
    fighter drops its target and sits on the floor where it stopped (move `'sit'`, the shop's sit
    pose with legs out), ignoring taps and buttons, until `away: false`. The match carries on
    round them; they can still be hit and still carry.
  - **The host can pause everyone.** ⏸ beside 👋 stops the match and the clock on every tablet;
    every screen shows the ⏸ card, and ▶️ on the host plays on. The host leaving the screen pauses
    the same way: the page gets a moment's notice when it's hidden, enough to send "paused"
    first. The snapshot carries `paused`, and guests show the card without a ▶️ (built, 0.0.2).
- **Host gone for good, match ends.** `ponytail:` no host migration; if the host stays away (a
  minute, to tune) or its connection drops, the room shows "host left" and everyone rejoins. Add
  migration only if it happens often. Built (0.0.2): a guest that has had no snapshot for 60 s
  (`HOST_GONE_SECONDS`), whose host peer leaves, or whose `start` never comes, shows 🏠💨 with 👋
  back to the lobby.
- **The room code is a label, not a lock.** Random, shown on the host, not a word. The home-network
  rules above keep strangers out; 1,296 picture codes only need to keep one house's games apart.

## Performance budget

Measured on the shop: ~15 draw calls per character, 40 characters at 35 fps under 20× CPU
throttle (`WEARABLE-LOOK-VS-PERFORMANCE.md`). Every tablet renders at most 14 fighters (6 kids,
8 bad guys) plus a stage, well under that measured 40; the host also runs a 14-body 2D sim, the
bad-guy AI and 7 connections, all cheap. Stage art is the budget to watch.

Measured on fighters (2026-10-13, headless): 14 dressed fighters are **142 draws** (about 10 each),
a quarter of the 600 that ran at 35 fps. Triangles are the GPU's side and are unmeasured on a
tablet: a fighter is about 86k triangles at `high` geometry detail (100–109k with cable hat and
cape), 29k at `med` and 16k at `low`. So the chooser (one fighter, close up) builds at `high`, and
the lobby and the match build at `med`: 14 fighters are about 0.5M triangles instead of 1.4M.
Drop to `low` if a real tablet stutters. With super-bulky hats and capes (see Costumes) the
heaviest fighter at `med` is 37k triangles, 14 of them about 0.5M, and every stitch still shows.
Lobby squares are 1.4 wide, so the widest fighter
(1.26: a llama in a super-bulky capelet, gloves out) never overlaps a neighbour
(`fighter.test.mjs`: 40 random bodies, each in that widest outfit; sampled, not seeded, because
species `randomise` only uses `Math.random`).

## Look

**Palette rule: when unclear, colour riot** (decided 2026-10-13). Main characters' fur does not
have to be a natural colour: a hot-pink lion and a cyan owl are the point. Quiet, natural and
grey colours belong to the bad guys.

**Hit-stop is our rumble** (playtest 2026-10-14: "that little freeze feels AWESOME"). Tablets
have no controller rumble, so a short freeze of everyone involved (`HITSTOP_TICKS`, 5 ticks at
60 Hz, about 80 ms) is how an impact is felt. Use it more, scaled by how big the moment is:
landing a hit, a brick breaking, knocking a donut loose, a steal, a power move going off, a
ring-out. Keep it short, and in the sim so every tablet freezes on the same tick.

**Grabs fly into the bag, keep it** (playtest 2026-10-14: "Love the flying donut"). A grabbed
donut arcs from where it lay (or off the shelf) into the bag, growing to carried size, in about a
third of a second (`placeCarried` in `play.js`). Good things show the thing travelling to you;
never stars round a head, which reads as dazed (a hit).

**Banking bursts sprinkles off the shelf, keep it** (playtest 2026-10-14). Banking a donut at
home throws 30 sprinkle bits in the riot colours up from the shelf (`fx.burst` with
`confettiMats` in `play.js` `onDonut`) and bounces the team's HUD count. It matches the house
sprinkles, so celebrations reuse it.

Keep `felted` (the shop look, free), or try `toon` / `matcap` shading from
`inventory/yarn-look.js` `SHADING` for a punchier arcade read. `setViewMode(root, 'silhouette')`
gives a "who's that?" character-select reveal. Stages from the bakery: a giant cake, a stack of
pancakes, a donut-shop counter, a cookie jar.

## Theme: treats

The spinoff is about donuts, not yarn. The yarn store keeps its `inventory/` untouched; the
spinoff gets its own small `spinoff/treats.js` and reuses the generic parts.

| Existing | Treats use | Change |
| --- | --- | --- |
| `inventory/grid.js` | Team shelves (grab and bank), obstacle and platform placement | None. Its `round` rule (a round item must rest on centres) stacks donuts and donut holes as it stacks yarn balls |
| `inventory/pick-place.js` | Touch placement of treat obstacles | None |
| `inventory/yarn-look.js` | `matcap` / `toon` shading, `oklch` frosting palette, `bakeVertexAO`, `makeHull` outlines, `CHARACTER_RANGE` (keeps treats from matching fur colours) | None; skip `applyHatching`, which is the yarn texture |
| `inventory/notions.js` + `notion_processing.py --theme` | Flat treat pickups and icons (sprinkles, cookies, cherries) from black line art; colour is applied at runtime | A new `treats` theme of line-art PNGs next to `themes/cottage/` |
| `inventory/yarn-geometry.js` | The pattern: a profile per family, lathed or tubed, seated on the floor | Copy the pattern into `treats.js`; the yarn file stays yarn |
| `sparkle.js` | Sprinkle burst | Recolour |
| `garments.js` bag (`GARMENTS.bag`, `buildBag`) | The fighter carries donuts in a worn bag, poking out | Donut meshes placed at the bag's opening in the spinoff; `garments.js` unchanged |
| `inventory/catalog.js` | — | Not used; the treat list is a few lines in `treats.js` |

Treat shapes are mostly three.js built-ins: a donut is `TorusGeometry` with a second, flatter
torus on top for icing; a donut hole is a sphere; a cake is a lathe (the yarn `CAKE_PROFILE` is
already a cake). Frosting colour, sprinkles and glaze are material and colour, not new geometry.

**House style, keep it** (playtest 2026-10-14: "sprinkles and donut frosting look spectacular").
Sprinkles are one instanced capsule (radius 0.03, 0.1 long, roughness 0.5), each instance tinted
from `RIOT`, laid flat at a 2.4 rad turn per index and spread by the R2 sequence (`scatter` in
`play.js`), so no random seed. Frosting is a squashed second torus at roughness 0.45 over matte
dough at 0.7: the shine difference does the work. Every new treat surface reuses both.

The characters stay the yarn store's characters, so hats and capes stay knitwear from
`garments.js`. Boxing gloves are the one costume piece that isn't knitted (see Costumes).

## Costumes: hats, capes, bags, boxing gloves

Every fighter wears a bag and boxing gloves; a hat and a cape are the kid's choice. Each piece is
in colours the kid picks.

- **Hats:** `garments.js` hat, as-is. Ten silhouettes already (beanie, beret, bucket, earflap,
  pixie, …); the chooser offers a handful.
- **Capes:** built. `cape` is a row in `garments.js`'s `SHAWL` table: short in front, long
  behind, open at the front. It is **not** in the shop's shawl silhouette list yet: the shop's
  pattern designs take their stats from their position in `PATTERN_TITLES`
  (`inventory/catalog.js`), so adding cape titles would re-roll every scarf, bag, hat, sock and
  potholder design after them. The shop gets the cape once designs are seeded by title.
- **Boxing gloves revisit "Nobody wears mittens"** (`VISUAL-DESIGN-FINISHED-OBJ.md`, "the
  characters have no rendered fingers"). That reason never applied to a boxing glove: it is a
  padded ball with a cuff, no fingers. Each hand already has a hold point on the skeleton
  (`built.holds`, one per hand, also handed to garments as `bodyFit(built).holds`), so a glove is
  a mesh parented to it, riding the hand with no skinning work: about two meshes per fighter.
  Gloves are leather, not knit: a plain shiny `MeshStandardMaterial`, not `garmentMaterial`.
  They live in the spinoff, not in `garments.js`; the yarn store's mittens rule stays as it is
  unless decided separately.
- **The owl wears its gloves on its wing tips** (kept, 2026-10-13). Its wing hangs from the upper
  arm and buries the hand at its middle, so a glove on the hand showed only as a lump halfway
  down the wing. The glove sits at 80% of the way down the wing instead, sized to swallow the
  tip whatever the owl's wing size (up to about 1.8 times a hand glove), so the wing is the arm
  and the glove is its fist. Owl punches are wing swings from the shoulder.
- **Gloves fix the vanishing arms.** Bare arms disappear into fleece and mane (Arms read,
  above), but a big coloured glove at the end of each arm is the most readable thing on screen,
  so punches can be signature moves after all.
- **Bags:** `garments.js` bag, as-is (`GARMENTS.bag`, built by `buildBag` on the chest joint).
  Seven silhouettes; the backpack and the drawstring bag read best from the side. The bag is
  what carries donuts (see Mode: donut capture the flag), so the hands stay free for gloves.
  The rig's own held skein (`buildHeldItem` in `npc.js`) is simply never shown.
- **Stitch texture on hats and capes** (`TEXTURES` in `fighter.js`): stockinette, rib, garter,
  cable, single crochet, waffle, lace. Seed, puff and linen stitch are left out (6–18× the
  triangles in worsted). Colourwork (stripes, fair isle, …) is free (vertex colours) and is the
  next texture to offer.
- **Fighters knit in super-bulky yarn** (`YARN` in `fighter.js`, decided 2026-10-13). In worsted, a
  llama's rib, garter and cable were drawn smooth at lobby and match size by the shop's
  `LOOK.viewPx` rule (stitches under 1.5 px become plain), so the chooser showed a stitch the
  match never did. Super-bulky stitches are big enough to survive on every species, and fewer of
  them means fewer triangles: a beanie plus cape is 7.1k (stockinette) to 13.4k (garter), against
  up to 24k in worsted. Chunky knits also suit the toy look. `fighter.test.mjs` checks every stitch
  shows on every species at `med` detail with the shop's `viewPx`.
- **Kids wear whatever they like** (decided 2026-10-13): any hat or none, any cape or none. Only
  the bag is required, since it carries donuts. Bad guys always wear the `ninja` hat.

## Fighter chooser

Built: `spinoff/choose.html` (page) on `spinoff/fighter.js` (everything a fighter is). Touch
only, pictures and colour, no words needed; every button has an `aria-label` for screen readers.

1. **Pick an animal.** Three big tiles (🦁 🦙 🦉). The new animal does its species `delighted`
   pose.
2. **Pick fur.** Twelve colour-riot swatches (`FUR`, the same for every animal), never a colour wheel: a 4-year-old can tap a
   swatch but not aim inside `<input type="color">`. The coat (fleece, mane, feathers) follows
   through the existing `deriveCoatColor` / `deriveManeColor`.
3. **Pick clothes.** Hat pictures and cape pictures (each with a "none" tile), bag pictures (no
   "none": every fighter carries a bag), each followed by its colour swatches (`CLOTH`: the riot
   colours plus white), then
   glove colour. Icons are drawn in the colour currently picked. Tapping the hat or cape you
   already wear knits it in the next stitch; the icon shows the stitch as a pattern. Each tap rebuilds the fighter
   (about 17 ms) on a gently turning preview.
4. **Surprise me.** 🎲 runs the species' `randomise` plus a random outfit.
5. **Done.** ✅ saves `{ species, params, look }` to `localStorage` under `lys.fighter.v1` and
   goes to the lobby. That same object is what the join handshake sends.

Saving: there is no save button. Every tap overwrites the one saved fighter (about 2 KB) in
`localStorage`, and asks the browser to keep it (`navigator.storage.persist()`). Not a cookie: a
cookie is sent to the server with every request, has a 4 KB limit (the fighter is 2.8 KB
encoded), and on Safari a cookie written by JavaScript expires within 7 days anyway. On an iPad,
Safari can clear a site's storage after 7 days without a visit; adding the game to the Home
Screen exempts it.

Colours: `CLOTH` and `FUR` are checked against `isBadGuyCloth` / `isBadGuyFur` (black, dark
purple, grey), so no kid can dress as a bad guy. The rig's default fur (`#a0a6ba`) is itself
bad-guy grey, which is why a new fighter always starts from a `FUR` swatch.

Trust boundary: `readFighter` is the only way in, from storage or from another tablet. It keeps
only known param keys with the right type (finite numbers, booleans, `#rrggbb` colours, a name
from the rig's `NAMES`), and only known hats, capes, bags and kid colours.

Not built yet: the silhouette reveal on the animal tiles. There is no `help` control anywhere:
scoring sets it (see Handicap).

## Lobby

Built: `spinoff/lobby.html` (page) on `spinoff/net.js` and `spinoff/roster.js`.

- 🏠 starts a game and shows a **picture code**: four treats out of six (🍩 🧁 🍪 🍒 🍓 🍰),
  1296 codes, readable by kids who can't read. 🔑 opens a six-treat keypad to type one.
- Everyone in the room stands together on a **grid floor** (`inventory/grid.js` display, drawn
  with `makeGridLines` from `inventory/notions.js`). `standingSpots` gives every tablet the same
  arrangement whatever order people joined in: front row first, from the middle out, 7 × 2
  cells, room for 14 (6 heroes, 8 bad guys).
- A newcomer arrives with a cheer. 👋 waves bye and leaves the room (not a door: a door reads as going in as much as out); ✏️ goes back to the chooser.
- In a room, the tablet that opened it also has ▶️, which takes everyone in the room into one
  match (see Multiplayer, Where things stand); ▶️ outside a room still plays by yourself.
- Network: Trystero 0.26 over Nostr, loaded from esm.sh through the import map, a devDependency
  for its types only (the same arrangement as `three`). Each tablet sends its fighter to each
  newcomer (`maxReceiveBytes` 64 KB). `ponytail:` every tablet talks to every other in the lobby,
  and swaps fighters in a match's room too; in a match only the host's star carries play.

## Bad guys

The other team: up to 8 bad guys, drawn from **8 fixed presets**. A grownup can play one (below);
the host fills the rest of the team with CPU bad guys from the presets nobody took. Silly, not
scary, for 4–6 year olds.

- **Eight tablets at most: 6 heroes and 2 played bad guys** (decided 2026-10-13). Up to six
  people play heroes. A seventh or eighth person plays a bad guy whether they tapped 🥷 or not:
  the latest arrivals, in the order the host saw them join, so nobody who was already a hero is
  moved. At most two people play bad guys; once two have, 🥷 greys out. A ninth tablet is
  turned away with a "room full" picture. CPU bad guys fill the rest of the bad-guy team, up to 8.
- **Grownups join as bad guys with one button** (decided 2026-10-13). 🥷 in the lobby swaps your
  fighter for a bad guy; tap it again to go back. Nothing to pick: you get the first preset no
  other grownup in the room has. Which one is worked out the way `standingSpots` places people:
  every tablet sorts the bad-guy players' ids and hands out presets in order, so all tablets agree
  with no extra messages. Your own fighter stays saved; the bad guy is not written to
  `lys.fighter.v1`.
- **A bad-guy player sends only "bad guy", never a look.** Every tablet builds the preset from the
  table in code, so `readFighter` still never lets a bad-guy colour in from the network, and a kid
  still can't dress as one.
- **Bad-guy players get the penalty** (decided 2026-10-13). A bad guy a person plays is fixed at
  `help -0.5`, the grownup end of the table, because the grownups are the ones playing them: more knockback taken, less damage dealt,
  smaller hit spheres, no input buffer, shorter respawn invincibility. Nobody picks that level: it
  comes with the 🥷 button. CPU bad guys are adjusted by level instead (below).
- **The 8 presets look different from each other**, so two grownups (and the kids watching them)
  can tell bad guys apart within the reserved colours. Each pair differs in at least two things a
  kid sees from across the stage: species, size, cape or capelet, bag shape, black or purple
  gloves, and fur shade. A node test checks every pair.
- **Look:**
  - Grey fur: near-zero chroma, mid-dark lightness. The coat (fleece, mane, feathers) follows
    through `deriveCoatColor` (`npc.js`) and `deriveManeColor` (`lion.js`), so it comes out a
    matching grey.
  - Black and purple hats, capes, bags and gloves.
  - Every bad guy wears a `ninja` hat pulled down to the brow, eyes still showing.
- **The `ninja` hat** is one more row in `garments.js`'s `HAT` table. It starts from `hood`,
  which already frames the face with the eyes uncovered (`face: true, eyesOut: true`), and sits
  lower (`seat`) so the edge reaches the brow. The eyes stay visible on purpose: light eyes on
  a dark hood read as a goofy villain, a hidden face as a scary one. **Spinoff only** (decided
  2026-10-13): like the cape, it stays out of the shop's silhouette list, since a new shop
  silhouette re-rolls every pattern design after it in `PATTERN_TITLES`.
- **Reserved colours.** Black and dark purple belong to the bad guys alone; the fighter chooser
  leaves them out of the kids' swatches. This follows the anti-camouflage rule
  (`DESIGN-DECISIONS.md` §5, `CHARACTER_RANGE` in `yarn-look.js`), which reserves a colour range
  so characters never blend into the stock. Here it stops a bad guy blending into the kids' team.
- **Presets, not a generator.** The 8 bad guys are fixed params in `spinoff/` code (designed once,
  using the species `randomise` for a starting shape), identical on every tablet. A preset index is
  all that crosses the network.
- **Their colours stay inside the reserved range:** every preset colour passes `isBadGuyCloth` /
  `isBadGuyFur`, so "purple" means the dark purple the kids' swatches leave out, never the kids'
  violet or magenta.
- **Names:** a short list of silly villain names, shown only as pictures and voice, never as
  text the kids have to read.
- **Bad-guy moves are a shared pool, not per preset** (decided 2026-10-13). Any bad guy can use
  any move it has. CPU bad guys gain moves as the levels get harder; grownup bad guys earn them
  through success in play (donuts, hit streaks and the like). The details of earning are being
  worked out on the Final Fantasy VII Limit Break model. The grape fizz bolt below is the first
  move in the pool.
- **Everybody starts over each new game** (decided 2026-10-13). Moves earned in a game (a room,
  from 🏠 to leaving) last only for that game. Next game night, grownup bad guys start again from
  the first moves. The one thing kept is each player's sticker card (see Saving progress).
- **Starting high gives grownup bad guys that level's moves** (decided 2026-10-13). A game that
  starts on a high level hands every grownup bad guy the moves of that level's tier up front, the
  same moves CPU bad guys have there. Either the grownup knows how to use them or they figure it
  out in play; earning carries on from there.
- **A bad guy's power bar fills from taking hits** (decided 2026-10-13), the FF7 Limit gauge: the
  more the kids clobber a bad guy, the sooner it can strike back. Heroes' bars never fill from
  being hit.
- **Heroes fill from giving, and teamwork fills fastest** (decided 2026-10-13). Starting weights,
  for tuning in play:

  | Event | Hero's bar | Bad guy's bar |
  | --- | --- | --- |
  | Time passing | a little | a little |
  | A hero lands a hit on a bad guy | ↑ (the hero) | ↑ (the bad guy hit) |
  | A hero banks donuts | ↑ | — |
  | A hero passes a donut to a teammate | ↑↑ | — |
  | Assist: hitting a bad guy who is attacking a teammate (with a sparkle, so the kid sees it) | ↑↑ | ↑ |
  | A team power lands | ↑ for everyone in the combo | **nothing**: team combos never charge a bad guy |
  | A bad guy hits a hero | — | — |

  Hurting a kid never charges anyone. Ganging up with plain hits charges the bad guy, but a team
  combo doesn't, so the kids' best answer to a glowing bad guy is to combine.
- **First bad-guy power: the grape fizz bolt** (decided 2026-10-13). A cartoon lightning bolt,
  made cute: a chunky, rounded zig-zag like a gummy candy, grape purple with white fizz sparkles
  trailing, with a kazoo "bzzzt" rather than thunder.

  | Part | Starting rule |
  | --- | --- |
  | Trigger | Full power bar, then a swipe with two or more fingers |
  | Direction | Leaves the bad guy in the swipe's direction, wherever on screen the swipe is |
  | Speed | Slow enough to see and step away from (about walking-and-a-half), after a short wind-up glow |
  | Hit | **Static frizz:** the coat (fleece, mane, feathers) puffs into a fuzzy ball, eyes swirl, a hop, one donut pops out, a light push, never a ring-out |
  | Blocked by | Fort pieces: the bolt breaks the first one it hits |
  | Fill rate | A played bad guy's bar fills at the `help -0.5` rate, ×0.7 |

  The frizz is meant to be funny, so being zapped is something kids laugh at. To check before
  building: whether the coat can be scaled on its own after `mergeCharacter`, or the puff needs
  its own mesh.
- **AI is a fake player on the host.** A CPU bad guy produces the same inputs a tablet does (a
  tap target, 🥊 / 🦶, a power gesture), played through the same sim, so it can do nothing a
  player can't, and the scripted-input sim tests cover it. The training dummy of milestone 1 is a
  bad guy whose input is "nothing". `ponytail:` one state machine for every bad guy.

  | State | When | Does |
  | --- | --- | --- |
  | Raid | Default, bag not full | Heads for the kids' shelf, breaking through the fort (below) |
  | Grab | At the kids' shelf | Takes one donut about every second until the bag is full or the shelf is empty |
  | Run home | Bag full, or shelf empty | Heads home and banks |
  | Chase | A kid carrying donuts comes in range and a chance roll says chase | Follows and attacks in reach; gives up after a few seconds, or when the kid banks or drops |
  | Defend | A kid is grabbing at the bad guys' shelf | The nearest bad guy goes home to stop them |
  | Scoop | A loose donut is close by | Picks it up on the way |
  | Power | Bar full | Fires an unlocked move at the nearest kid, with the normal wind-up |

  With two or more CPU bad guys, one stays home as a defender and the rest raid. In the build
  round, CPU bad guys stack their pile as a wall in front of their shelf, instantly.
- **CPU bad guys break walls** (required, 2026-10-13). The basic hero fort is a ring of walls with
  the donut shelf in the middle, so a bad guy that can't get through is no opponent. A raider
  heads straight for the shelf, never routing around the fort. At a wall one piece high it jumps
  over; at anything taller it kicks the lowest piece in its way until it breaks, then carries on.
  It goes for the weakest piece within reach of its path (fewest hits left), so a mixed wall
  steers it toward a single-colour gap: the kids' best walls really do protect them. Breaking a
  piece charges nobody's bar.
- **Targets: the nearest hero** (decided 2026-10-13), kid or grownup alike; no one is singled out.
  The fairness rules below still apply on top (no two bad guys on one hero, grace after a hit).
- **Fair to 4-year-olds.** About half a second of reaction delay before acting on anything new;
  at most one attack about every 0.8 s; two CPU bad guys never chase the same kid; after hitting a
  kid, a bad guy leaves that kid alone for a few seconds; no waiting at the stage edge to knock a
  falling kid off again; powers aim where the kid was about half a second ago. Chase chance,
  reaction delay, attack pace and grace time are plain numbers that auto-scaling can tune later.
- **MVP subset:** Raid (with wall breaking), Grab, Run home and Chase first; Defend, Scoop and
  Power once matches work.
- **The bad-guy team grows level by level** (decided 2026-10-13). Level 1 is the grownups who
  tapped 🥷, or one CPU bad guy if nobody did. Each level after adds one CPU bad guy:

  ```
  badGuys(level, grownups) = min(8, max(grownups, 1) + level - 1)
  ```

  Two grownups on level 3 face the kids with 2 CPU bad guys beside them; no grownups on level 3
  is 3 CPU bad guys. Winning a match moves the room up a level; losing replays the level, never
  drops it.
- **Saving progress: a sticker card per player** (decided 2026-10-14, replacing "only the highest
  level"). Every player has a stamp card, saved on their own tablet under its own key
  (`lys.stamps.v1`), apart from the fighter, so re-rolling or re-dressing a fighter never touches
  it: kids get bored of a look but keep their card. Everything else still starts over each game
  (`help`, earned moves, power bars).
  - **A stamp for finishing a level** (decided 2026-10-14, for now). Playing a level all the way
    to the end card stamps every hero still in the room, win, tie or loss, kept for good. Quitting
    early (👋, or a match that ends because the host left) gives nothing. **Finishing it again
    counts on the stamp:** the stamp gains a number, ×2, ×3 and up, like a sticker with a tally,
    so replaying a favourite level still fills the card.
  - **A stamp looks like a kid's craft rubber stamp** (decided 2026-10-14; not a postage stamp):
    the same picture that shows the level in the level picker, pressed in one sepia ink. Simple
    bold shapes, ink patchy where the stamp didn't press evenly, soft edges, a little crooked, never
    two exactly alike. The ×2, ×3 tally is stamped beside it the same way. The card is a grid of the levels' places; an unwon level's place is empty.
  - **The save is level number → times finished** (e.g. `{ "1": 3, "2": 1 }`), checked on the way in
    like the fighter: keys are whole levels from 1 to the last level, counts whole numbers from 1
    (capped at 999, so the 100th finish still counts); anything else is dropped. A guest sends its
    card with its fighter when it joins.
  - **Tally milestones unlock themed special items** (idea, 2026-10-14). Each stamp's count is a
    ladder: finishing a level enough times unlocks an item themed on that level, e.g. the pancake
    level's 100th finish gives a **magic spatula**. Items belong to the player like the card (they
    survive re-rolling the fighter) and **go with them to every level** (decided 2026-10-14): the
    spatula earned on pancakes works on the cake stage too. The theme only says where an item is
    earned, not where it can be used. The card is the one record, so items need no save of their
    own: what you have is worked out from the counts. **Three kinds, all used together, each with
    its own name** (decided 2026-10-14), and **no equipment**: nothing is equipped, loaded out or
    slotted. A milestone can give any kind.
    - **Dress-ups** (looks): extra pictures in the fighter chooser that the kid toggles on and off,
      like hats and capes.
    - **Tricks** (moves that look like items): a trick adds a move to its owner's set wherever
      they play, and its animation shows the item (the spatula pops into the glove, flips a bad
      guy, and vanishes). A move like the others in the move table, fired the usual way (a button
      or a gesture behind the power bar), only for the player who earned it.
    - **Goodies** (things on the level): a goodie appears on the stage during a match, to grab
      and use there, like a loose donut. Owning one is what makes it turn up, on any level.
      **Anyone can grab a goodie** (decided 2026-10-14), teammate or bad guy, not only its owner:
      sharing and passing need that, and teamwork rewards for them may come later.
    **Starting ladder, per level** (2026-10-14, to tune). The very first finish already gives
    something besides the stamp, so a kid learns at once that the card hands out stuff:

    | Finishes | Reward |
    | --- | --- |
    | 1 | The stamp **and** a small dress-up |
    | 10, 30, 60, 80 | A dress-up |
    | 20, 40, 70, 90 | A goodie |
    | 50 | A trick |
    | 100 | The big trick (pancakes: the magic spatula) |

    **Every 10 finishes, evenly** (decided 2026-10-14): kids don't respond well to rewards that
    get further and further apart, so the gap never grows. Tricks sit at 50 and 100, so a kid who
    plays more gets prettier before they get stronger. Past 100 is open. The end card presses the stamp, pops the reward out of it, and shows the next
    milestone's reward as a shadow with its number, so more is visibly coming.
    Open: how often goodies turn up and tricks charge, which is where `help` (Handicap) can even out a kid with a big card.
  - Open (2026-10-14): whether stamps open levels (a stamp on N opens N+1) or every level can be
    picked from the start; whether unlocked moves and fort pieces follow the chosen level or the
    card; whether winning should show on the stamp too; whether grownup bad-guy players have
    cards.
- **No difficulty setting** (decided 2026-10-13). CPU bad guys play at `help 0`; the level (how
  many of them) is the only dial for now. `ponytail:` auto-scaling comes later: nudge the CPU bad
  guys' `help` (between `-0.5` and `0.5`, below the kids' safety bounce at `0.75`) from the
  previous level's **donut margin** (decided 2026-10-13). Matches run on a fixed timer
  (90 seconds to start, never over 3 minutes), so time can't be the signal: a big win nudges the next level harder, a narrow win or
  a loss nudges it easier.

Check: a node test runs one bad guy against an idle kid on the two-shelf stage and asserts the
bad guy grabs a donut and banks it.

## Milestones

1. **Fun to hit, one tablet** (planned 2026-10-13; released as 0.0.1, 2026-10-14). On one tablet, your fighter on the stage in
   thirds against a training dummy: tap to move, 🥊 and 🦶, knock the dummy's donut loose and
   scramble for it, grab from the enemy shelf and bank on yours, and kick through a few
   **pre-placed gingerbread bricks** (no build round yet) that fall when the one under them
   breaks. Built as the host from day one: the sim takes per-player inputs per tick and produces
   a snapshot, and the page draws only from snapshots.
   - **The contract is `spinoff/match.js`** (2026-10-13): the stage layout's shape (`Stage`; the
     layouts themselves are in `spinoff/levels.js`), and the `Input`, `Snapshot` and `Entrant` types both phases build against, so Phase A and Phase B run
     in parallel and the type checker catches any drift. The snapshot is also what milestone 2
     sends over the network.
   - **First playtest (2026-10-13), and the rework it caused.** The flat x/y version felt like "2D
     with 3D graphics", so the stage became a depth band (see Navigation) and the contract moved
     to x/y/z: floors are rectangles, facing is a yaw, hits need `HIT_DEPTH`, snapshots carry `z`,
     each fighter's `height`, `over`/`winner`, and brick `icing`; `Input` can say stop. Also from
     the playtest: an end screen when the clock runs out (it looked frozen), a `'blocked'` state
     when a fighter stands at a wall it can't hop (it walked in place forever), shelves standing
     behind the fighters' floor (the lion walked into its own shelf), and the villain drizzle as a
     squiggle.
   - **Contact you can feel** (playtest, 2026-10-13: "you don't even see any contact made";
     punches couldn't reach at all, only kicks broke bricks). Attacks connect from a visible gap
     (punch about 0.35 between bodies, kick about 0.5, with a short lunge), and every hit that
     lands is cheated the way fighting games do: a comic BAM starburst at the contact point sized
     by the hit, a sprinkle puff, **hit-stop** (both fighters freeze `HITSTOP_TICKS`), the target
     squashing and flinching, a brick wobbling and shedding icing chunks, and a small screen
     shake on kicks and stomps. The snapshot carries the tick's `hits` for the page.
   - **Bricks look like gingerbread, not cubes:** upright cookie panels with rounded, bevelled
     edges, a thick white piped-icing border, flooded team-colour icing inside with a few white
     dots, a slight random tilt per piece, and thick dark cracks as hits drop. They still fill one
     `BRICK` cell in the sim.
   - **"Your bag holds one" has to show** (playtest: it was only clear to the game designer). When
     a fighter already carrying a donut touches another loose donut or reaches the enemy shelf,
     the snapshot's `fullBag` says so once, and the page answers in pictures: the fighter shakes
     its head, its carried donut pulses big, and the touched donut hops away a little. A grabbing
     arm never closes on a second donut.
   - **Raised floors are solid** (playtest: the lion walked straight through the gumdrop hill,
     which the flat version treated as a pass-under platform). In the depth band, a raised floor
     is a block from the ground up: you jump onto it or walk around it, never through it.
   - **Stealing a donut is a victory moment** (playtest, 2026-10-14). The snapshot's `donutEvents`
     says when a donut is stolen from the enemy shelf, banked, or picked up. A steal gets a
     sparkle burst (`sparkle.js`, recoloured), the species' `delighted` pose for a beat while it
     keeps moving, and the donut popping up into the bag. Banking gets a bigger one: a sprinkle
     confetti burst over your shelf and the shelf count bouncing. A pickup off the floor gets a
     small sparkle.
   - **Phase A, the sim** (`spinoff/sim.js`, pure, no three.js, fixed 60 Hz `tick` +
     `snapshot`): stage as platform data with jump links, shelves on `inventory/grid.js`,
     navigation (tap a point or a thing, routes with jumps, ledge stop, tap-above jump, facing
     follows travel, target kept through hits), punch and kick as data with per-step hit spheres,
     body spheres from the fighter's proportions, percent and knockback, ring-out with instant
     drop-back-in, one-donut bags, grab and bank, popped donuts that stay until tapped, bricks with
     hit counts and collapse, and the dummy as a bad guy whose input is "nothing".
     `spinoff/sim.test.mjs` drives it with scripted inputs, and asserts **the donut total never
     changes**, every tick.
   - **Phase B, the page** (`spinoff/controls.js`, `spinoff/play.html` + `play.js`): Pointer
     Events per finger from `touch-test.html`, taps to targets, 🥊 / 🦶 buttons; gingerbread
     platforms and bricks, two-torus donuts, fighters at `med` detail walking on the rig's walk
     layer (as `dress-up.js` does), punch and kick poses, the oversized carried donut, a camera
     that follows your fighter.
   - **Shared rig fix, done:** the tail resets only on a real teleport (`425df37` on `0.0.1`, merged
     into this branch).
   - Out of scope: networking, the build round, bad-guy behaviour, powers, levels, `help`
     changes, team combos.
2. **Two tablets.** Done: the fighter chooser, the room code and the join handshake, with
   everyone standing on the lobby floor. Done in 0.0.2 (see Multiplayer, Where things stand):
   the host's ▶️ starts one match for the whole room, the level and roster travel as data, inputs
   up, snapshots down at 30 Hz with events that survive a lost one, interpolation, a per-tablet
   camera, pause / away / host-left, and ▶️ again for everyone. Tested in node only; still to
   try on real tablets on home Wi-Fi.
3. **Kids vs bad guys.** Up to eight tablets (six heroes, two played bad guys), the bad-guy team from its 8 presets,
   `ninja` hat and AI, two shelves on a stage wider than a screen, edge markers, the match timer
   and team shelf score, donut pickups, a results screen with `selfie.js` portraits.
4. **Content.** Full move lists per species, stages, alternate costumes, item drops with
   catch-up weighting.

## Open questions

- **The owl's move set.** Its punches are wing swings with the gloves on its wing tips (see
  Costumes) and its kick a talon swipe from a hop; the rest of its moves are still to design.
- **The bigger bag.** Carrying more than one donut is a later unlock. Is it a level unlock (from
  some level on, everyone's bag holds 2, then 3), or a power (a full bar or a gesture gives a big
  bag for a while)? Either way, the hit table (punch knocks 1 loose, kick 2, powers the whole bag)
  only matters once bags hold more than one.
- **Generated levels.** Whether stages could be generated per difficulty, and how they'd stamp: see `GENERATED-LEVELS.md`.
