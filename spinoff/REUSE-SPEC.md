# Spinoff: donut fighters

The same llama, lion and owl characters in a **2.5D platform fighter for up to 8 players (6 heroes, 2 played bad guys), each
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

- **2D physics on the x/y plane:** gravity, jump, platforms, ledges, ring-out bounds. A few
  dozen lines of add/multiply; no physics library (see Determinism below for why add/multiply).
- **Percent and knockback:** hits raise a fighter's percent; knockback grows with it; leaving
  the stage bounds is a ring-out. Damage pops sprinkles (`sparkle.js` recoloured). A ring-out
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

- **Tail resets above 6 units/s.** `TAIL_TELEPORT = 6` in `npc.js` treats faster movement as a
  teleport and zeroes the tail spring. A character is about 0.75 units tall, so a strong
  knockback launch passes this. Raise it, or reset only on an actual respawn.
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

- **Tap a place:** the fighter goes to the nearest spot it can stand on there. A tap on a higher
  platform jumps there on its own: the host keeps a small map of the stage's platforms with jump
  links between them and walks the route. A tap straight above the fighter is a jump; another
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
- **Fort walls are not walked around.** A fighter heading for a target behind a wall stops at the
  wall, and the kid smashes through. No route-finding around forts.
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
whole-hand slap. Every level after adds one or two: a new power gesture, a situational move (dash
punch, air stomp, wall-kick jump, charged swing) or a species extra (the llama's headbutt, the
lion's roar, the owl's glide). A locked gesture falls back to the slap, so a full bar always does
something. Unlocks are per game like everything else, and a game that starts on a high level
starts with that level's moves. Hero and bad-guy unlocks live in **one move table keyed by level**,
so the two ladders can't drift apart. A first ladder, for tuning:

| Level | New for heroes |
| --- | --- |
| 1 | 🥊 punch, 🦶 kick, whole-hand slap |
| 2 | Two-finger swipe: donut roll |
| 3 | Air stomp (🦶 in the air) |
| 4 | Pinch on a bad guy: grab and throw |
| 5 | Species extra: headbutt / roar / glide |
| 6 | Spread: gust; dash punch (🥊 while running) |
| 7 | Two-finger tap on your shelf: icing dome |
| 8 | Wall-kick jump; charged swing (hold 🥊) |
| 9+ | The rest of the gesture table, one per level |

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
  purple frosting and a drizzled stripe across it. A donut keeps its look wherever it goes, which
  is how a stolen donut reads as stolen.
- **Donuts are never destroyed** (decided 2026-10-13, MVP). The 24 donuts are always somewhere:
  on a shelf, in a bag, or on the floor, so every donut the bad guys hold is one the kids don't.
- **Dropped donuts stay where they land** (decided 2026-10-13), as many as pile up, until someone
  taps one and picks it up (see Navigation: tap a thing). Scrambling for a loose donut is a real
  tactic, like a fumble in football; nothing rolls home on its own.

## Mode: donut capture the flag

Two teams, the kids and the bad guys (see Bad guys), and two bakery shelves, one at each end of
a stage wider than one screen. The per-tablet camera follows each kid's own fighter, so the
wide stage costs nothing new.

**The stage is in thirds** (decided 2026-10-13). One hand-made, mirrored stage for the MVP:

| Zone | Terrain | Forts |
| --- | --- | --- |
| Heroes' third | Their shelf on the ground, an upper ledge above it | Heroes build here only |
| Middle third | A gumdrop hill with a ledge each side, joining the upper and lower lanes | Nobody builds: always open ground to fight over |
| Bad guys' third | The mirror of the heroes' third | Bad guys build here only |

Two lanes, ground and upper, mean one wall never closes a side: builders choose which lane to
block, and a fort ringing the shelf has to cover the ledge above too. Terrain never breaks; only
fort pieces do, so routes stay predictable and the host's jump-link map is fixed for a match.
Later levels of Gingerbread World can bring new hand-made stages.

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
  in `DISPLAY_SLOTS` (`characters/store/scene/displays.js`), seen from the side: columns across,
  shelves up. The grab and bank rules are pure `grid.js` calls with no three.js, so they run in the node
  sim test.
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
- **World 1 is Gingerbread World, levels 1–10** (decided 2026-10-13). Other worlds wait until
  the game gets past level 10.
- **Fort pieces are gingerbread, coloured by their icing** (decided 2026-10-13). Brown
  gingerbread body; the builder's fur colour is the icing, flooded over most of the front with a
  thin gingerbread rim, so the colour still reads at tablet size (thin piped lines would just look
  brown). One gingerbread material for every piece, icing as vertex colour, the way garment
  colourwork already works, so a many-coloured fort draws in a few batches. Damage shows as
  cracks in the gingerbread with the icing crumbling off. Kinds differ by shape, one new kind per
  level, unlocked for the rest of the game:

  | Level | Piece | Shape |
  | --- | --- | --- |
  | 1 | Gingerbread brick | Plain block |
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
  white icing "glue" in the seam. Same-colour stacks get nothing. Toughness is computed from the
  grid when the build round ends (count different-colour teammate pieces directly above and
  below), a pure function with a node test, and drawing follows that count.
- **Bad guys' pieces are all one colour and skip the teamwork rules** (decided 2026-10-13): dark
  chocolate gingerbread with dark purple icing. Any bad guy can place or move any bad-guy piece,
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
(`spinoff/net.js`, Trystero; see Lobby): every tablet swaps fighters with every other. Inputs,
snapshots and the host are not built yet. The yarn store's seeded rng (ROADMAP A1) draws from
`world.rngState` (`draw` in `characters/store/core/util.js`); the spinoff doesn't depend on it.

### Design: one host tablet, star topology

- **One kid's tablet hosts**, and that kid also plays. The host runs the only copy of the game
  state at a fixed 60 Hz tick. Each guest sends inputs to the host; the host sends each guest
  state snapshots. Guests never talk to each other: 8 tablets is 7 connections, not 28.
- **Transport is WebRTC data channels**, tablet to tablet over the home network. No server of
  ours. Connecting uses [Trystero](https://github.com/dmotz/trystero) (one CDN import) over its
  Nostr strategy: the host shows a random room code, guests tap it in on the picture keypad (see Lobby). Signalling needs internet;
  play traffic stays on the local network.
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
| Join: the `lys.fighter.v1` save (species, params, outfit, gloves) and the saved highest level (`lys.level.v1`, see Bad guys, Saving progress), about 2 KB of JSON sent once; never `help`, which the host sets; or, for a bad-guy player, only "bad guy" (the preset comes from the sorted ids) | Building the character from those params (`createCharacter` is deterministic from params; randomness lives only in `randomise*`) |
| Inputs, guest → host | Spring rig, idle layer, blinks, ear flicks, tail sway (`motion.js` `Math.random`) |
| Snapshots, host → guest: move id + step drives the guest's rig toward that move's pose | Camera, edge markers, sparkle effects, sound |

Send params, never a seed: a seed would regenerate the character through `randomise*`, which
calls `Math.random`.

### Determinism

Only the host simulates, so cross-device determinism is not required. Keep the physics on
add/multiply anyway and the gameplay out of the spring rig: it costs nothing now and leaves
rollback or replays possible later.

### Network gotchas

- **Client isolation.** Guest networks and some mesh Wi-Fi systems block devices from reaching
  each other. Symptom: everyone joins the room but no data channel opens. Use the main network.
- **Host leaves, match ends.** `ponytail:` no host migration; the room shows "host left" and
  everyone rejoins. Add migration only if it happens often.
- **Room code is the only gate.** Random, shown on the host, not a word.

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
- Network: Trystero 0.26 over Nostr, loaded from esm.sh through the import map, a devDependency
  for its types only (the same arrangement as `three`). Each tablet sends its fighter to each
  newcomer (`maxReceiveBytes` 64 KB). `ponytail:` every tablet talks to every other in the lobby;
  the host-authoritative star from §Multiplayer arrives with the match sim.

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
  the first moves. The one thing kept is the heroes' highest level (see Saving progress).
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
- **Saving progress: only the highest level** (decided 2026-10-13). Each tablet saves one number,
  the highest level its kid has unlocked (by winning the level before it), under its own key
  (`lys.level.v1`), apart from the fighter so changing animals never loses it. Everything else
  starts over each game: `help`, earned moves, power bars. When a room forms, its heroes send
  their saved level with their fighter, and the room can start at the **highest level every hero
  has reached** (the lowest of their saved levels). A kid who is new to the game brings the
  room's start down to where they are. Before the first build round every tablet shows **two
  pictures**, "1" and the shared level (decided 2026-10-13); the first tap chooses for the room
  (the host settles two taps at once). When the shared level is 1, there is nothing to choose and
  the pictures are skipped. Bad-guy players don't count: the level is the heroes'
  progress. The number is checked on the way in, like the fighter: a whole number from 1 to the
  last level.
- **No difficulty setting** (decided 2026-10-13). CPU bad guys play at `help 0`; the level (how
  many of them) is the only dial for now. `ponytail:` auto-scaling comes later: nudge the CPU bad
  guys' `help` (between `-0.5` and `0.5`, below the kids' safety bounce at `0.75`) from the
  previous level's **donut margin** (decided 2026-10-13). Matches run on a fixed timer
  (90 seconds to start, never over 3 minutes), so time can't be the signal: a big win nudges the next level harder, a narrow win or
  a loss nudges it easier.

Check: a node test runs one bad guy against an idle kid on the two-shelf stage and asserts the
bad guy grabs a donut and banks it.

## Milestones

1. **Fun to hit, one tablet** (planned 2026-10-13). On one tablet, your fighter on the stage in
   thirds against a training dummy: tap to move, 🥊 and 🦶, knock the dummy's donut loose and
   scramble for it, grab from the enemy shelf and bank on yours, and kick through a few
   **pre-placed gingerbread bricks** (no build round yet) that fall when the one under them
   breaks. Built as the host from day one: the sim takes per-player inputs per tick and produces
   a snapshot, and the page draws only from snapshots.
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
   - **Shared rig fix first, on `0.0.1`:** `TAIL_TELEPORT` resets the tail above 6 units/s, which a
     knockback launch passes. Reset it only on a real teleport, then merge into this branch.
   - Out of scope: networking, the build round, bad-guy behaviour, powers, levels, `help`
     changes, team combos.
2. **Two tablets.** Done: the fighter chooser, the room code and the join handshake, with
   everyone standing on the lobby floor. Still to do: inputs up, snapshots down, interpolation,
   per-tablet camera.
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
