# Spinoff: donut fighters

The same llama, lion (and owl) characters in a **2.5D platform fighter for up to 6 players, each
on their own tablet with their own camera**, on one shared home network: the kids' team against
a team of CPU bad guys in donut capture the flag. Decided with the players, 2026-10-13. This doc sorts the existing code by how much of it carries over, lists what
the fighter still needs, and sets out the network design. References are to `characters/` and
`inventory/` as of `d27156c`.

## Layout

Keep the spinoff **in this repo**, as pages under `spinoff/`, importing `../characters/npc.js`
directly. There is no build step and `serve.py` already serves the tree, so a sibling page costs
nothing. Copying the rig into a new repo forks it, and every tuning pass on the yarn store (motion,
tails, garments) would then have to be ported by hand.

Each kid makes their fighter on the spinoff's own **fighter chooser** page (see below) and it is
saved on their tablet, so each kid brings the fighter they made. The yarn store's
`dress-up.html` is a grown-up tuning tool (lil-gui panels, text everywhere) and stays one; the
chooser reuses its logic, not its screen.

## Tier 1: reuse as-is (no yarn-store coupling)

| Module | What it gives | Imports |
| --- | --- | --- |
| `npc.js` | Species registry, `BASE_PARAMS` body proportions, `createCharacter` (procedural build → one rigid-skinned mesh per material family), `applyPose`, `groundCharacter`, `stepMotion`, `setViewMode` (`felted` / `grey` / `silhouette`), randomiser, `disposeCharacter` | `three`, `motion.js` |
| `motion.js` | Spring-driven pose channels (19 joints + hold), interrupt-safe blending, idle layer (breath, weight shift, blinks, ear flicks), walk layer, `DANCES` step sequencer, `motionOf(traits)` personality → motion | nothing |
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
- **Personality already drives motion.** `motionOf(traits)` maps the ten traits to stiffness,
  overshoot (`zeta`), sway, head carry. A high-Volatility fighter already overshoots its poses.
- **Tails react to world acceleration.** `tailAcceleration` reads the tail root's world position,
  so a lion's tail swings on its own when the body turns, jumps or is knocked back.

## Tier 2: reuse with its dependencies

| Module | What it gives | Drags in |
| --- | --- | --- |
| `garments.js` | The costumer: `dress(built, outfit)` / `undress`, six garment types × many silhouettes, colourwork, fit to body | `inventory/yarn-look.js`, `inventory/catalog.js`, `store/core/util.js` |
| `selfie.js` | `shotFor` / `takeSelfie`: a camera that frames a character's face and outfit | `npc.js` |
| `dress-up.js` | Save/load shape for species params + outfit, rebuild-on-change loop. The chooser borrows these; its lil-gui screen is not for kids | everything above, `visit.js` for `randomTraits` |

The drag-ins are small and in the same repo, so reuse means importing them. Knitwear is the
charm: a fighter's alternate costumes are outfits. `selfie.js` is the victory screen camera.

## Tier 3: ideas to borrow, code to leave

- `visit.js` `TRAITS` / `randomTraits`: the ten-trait personality model (use the exact trait names,
  per `CHARACTER-ATTRIBUTES.md`).
- `guestbook.js`: trait-voiced lines. Could become taunts or win quotes, but it is wired to yarn
  vocabulary; treat it as a pattern.

Not reusable: the store sim, displays, inventory grid, pathing, puzzle, stock and HUD.

## What the fighter needs

### New

- **2D physics on the x/y plane:** gravity, jump, platforms, ledges, ring-out bounds. A few
  dozen lines of add/multiply; no physics library (see Determinism below for why add/multiply).
- **Percent and knockback:** hits raise a fighter's percent; knockback grows with it; leaving
  the stage bounds is a ring-out. Damage pops sprinkles (`sparkle.js` recoloured). A ring-out
  costs donuts, never playing time (see Scoring).
- **Kicking is required** (the kids' own ask, 2026-10-13). Punch and kick are the two core
  attacks, each with its own button, so a 4-year-old never needs a stick-plus-button combo to kick.
  The rig already kicks: `motion.js` has `rd-kick-l` / `rd-kick-r` poses on the `legSwing`,
  `hipFlex` and `kneeBend` channels, used in a dance. A kick reaches further and launches flatter
  than a punch, and is a little slower. In the air it becomes a diving stomp. The owl's legs are
  short, so its kick is a talon swipe from a hop.
- **Moves:** ~6–10 per species as `DANCES`-style entries. Each move also carries its hit
  spheres per step (offset, radius, active steps), authored as data, not read off live joints
  (see Multiplayer: the spring rig is cosmetic and differs per tablet).
- **Hurt spheres:** sized from params (`headRadius`, `torsoW/H/D`, `legHeight`), fixed to the
  fighter's body position, not to animated joints.
- **Touch controls, and nothing else.** No keyboard path, not even for development. A virtual
  stick plus jump / 🥊 punch / 🦶 kick / special buttons, large enough for small hands, built on Pointer
  Events with `touch-action: none` so a stick thumb and a button thumb are tracked separately by
  `pointerId`. Development is tested by scripted inputs in node and on a real tablet.
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
- **A launching hit pops one donut** out of the bag as a pickup, so carrying is risky even
  without ring-outs.

Starting numbers to tune: 12 donuts per shelf, bag capacity 3, a ring-out spills the whole bag,
a 3-minute timer.

## Mode: donut capture the flag

Two teams, the kids and the bad guys (see Bad guys), and two bakery shelves, one at each end of
a stage wider than one screen. The per-tablet camera follows each kid's own fighter, so the
wide stage costs nothing new.

- **Many small flags.** Each shelf starts stocked with donuts. Every donut is a flag, so every
  kid can score something in a match, not only whoever reaches a single flag first.
- **Grab:** touch the enemy shelf and press attack. The top donut there is taken off the shelf
  (`lift` in `inventory/grid.js`) into your bag.
- **Bank:** touch your own shelf. Everything in your bag goes onto it on its own: `anySlot` finds
  the spot and `place` puts it there, both in `inventory/grid.js`. No dragging, so a 4-year-old
  banks by running home.
- **The bag shows what it holds.** Donuts poke out of the bag, countable at a glance: the
  existing house rule from `PROJECT-BAGS.md` §1–2 ("balls poking out, countable"), with donuts
  for balls. A full bag can't grab more.
- **Shelves are the shop's shelves.** A team shelf is a `grid.js` display like the wall shelves
  in `DISPLAY_SLOTS` (`store/scene/displays.js`), seen from the side: columns across, shelves up.
  The grab and bank rules are pure `grid.js` calls with no three.js, so they run in the node
  sim test.
- **Friendly fire is off, as a setting.** Teammates pass through each other's attacks. Every
  fighter carries a `team`, and whether one fighter can hit another is `canHit(a, b, match)` in
  `spinoff/roster.js`, with `MATCH.friendlyFire` false. A kid-against-kid mode later is that one
  setting, not a rewrite (decided 2026-10-13).

## Handicap: one `help` number per player

Players are 4–6 year olds and grownups in the same match. Each player has one number, `help`,
chosen when they join and sent to the host with their params. Every handicap knob is a straight
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
| Bag spilled on ring-out | 100% | 50% | 100% (never above all of it) | host sim |
| Bag capacity | 3 | 4 | 3 (2.5 rounds up) | host sim |
| Pickup reach | ×1.0 | ×2.0 | ×1.0 (never below pro) | host sim |
| Respawn invincibility (s) | 2 | 4 | 1 | host sim |
| Safety bounce below the stage, per fall | 0 | 1 (at help ≥ 0.75), recharges after 20 s | 0 | host sim |
| Turn to face nearest opponent on attack | off | on (at help ≥ 0.5) | off | host sim |
| Touch button size | ×1.0 | ×1.4 | ×1.0 | local UI |
| Placement grab radius / snap reach | 44 px / 1.6 cells | 64 px / 2.5 cells | 44 px / 1.6 cells | local UI (`makePicker` already takes both as functions) |

Starting points to tune in play, not measured values. Whole-number knobs round; on/off knobs
switch at the threshold shown. UI knobs never go below pro: a grownup is handicapped in the fight,
never with smaller buttons.

Suggested starting levels: age 4 → `1`, age 5 → `0.75`, age 6 → `0.5`, grownups on the kids'
team → `0` or `-0.5`. Bad guys never pick a level: a played bad guy is always `-0.5`, and CPU bad
guys play at `0` until auto-scaling exists (see Bad guys).

Design rules:

- **Help may be visible if it looks like a power, never like a label.** The Mario Kart test:
  kids happily take a big item they can see when they're behind; what stings is being marked
  as the easy one. So a safety bounce can be a showy bouncy-icing trampoline and a bigger hit can pop
  extra sprinkles, but there is no "easy" badge or help number in play. Levels are shown only on
  the join screen, as pictures (4–6 year olds don't read), and a grownup sets them.
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

No networking code in the repo, and the game ships as static files on GitHub Pages. The
seeded-rng work on `0.0.1` is so far a ROADMAP entry (A1); `mulberry32` exists in
`store/core/util.js` but the sim still defaults to `Math.random`. Neither blocks the design
below.

### Design: one host tablet, star topology

- **One kid's tablet hosts**, and that kid also plays. The host runs the only copy of the game
  state at a fixed 60 Hz tick. Each guest sends inputs to the host; the host sends each guest
  state snapshots. Guests never talk to each other: 6 players is 5 connections, not 15.
- **Transport is WebRTC data channels**, tablet to tablet over the home network. No server of
  ours. Connecting uses [Trystero](https://github.com/dmotz/trystero) (one CDN import) over its
  Nostr strategy: the host shows a random room code, guests type it. Signalling needs internet;
  play traffic stays on the local network.
- **Inputs** (a few bytes per tick) go on a reliable channel, or unreliable with each packet
  carrying the last ~5 inputs so a dropped jump is covered by the next packet.
- **Snapshots** (per fighter: position, velocity, facing, percent, donuts in bag, move id, move
  step, ~30 bytes; under 450 bytes for 14 fighters; plus each shelf's donut count and loose donut
  pickups as positions) go 30 times a second on an unreliable channel
  (`{ ordered: false, maxRetransmits: 0 }`). A newer snapshot replaces any lost one, so a drop
  never stalls the stream.
- **Guests draw other fighters ~1–2 snapshots behind**, interpolating between the last two.
- **No client prediction.** On home Wi-Fi a round trip is 5–20 ms, so a guest's own fighter
  answers about one frame late. `ponytail:` add prediction for the guest's own fighter only if
  that feels laggy in play.
- **Rollback is out.** It needs bit-identical simulation on every tablet, and mispredictions
  multiply with 6 players. Host-authoritative needs neither.

### What crosses the network and what doesn't

The split follows the A1 plan: gameplay is one authority, cosmetics are local.

| Crosses | Stays local on each tablet |
| --- | --- |
| Join: the `lys.fighter.v1` save (species, params, outfit, gloves) and `help`, about 2 KB of JSON sent once; or, for a bad-guy player, only "bad guy" (the preset comes from the sorted ids) | Building the character from those params (`createCharacter` is deterministic from params; randomness lives only in `randomise*`) |
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
bad-guy AI and 5 connections, all cheap. Stage art is the budget to watch.

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

Not built yet: the silhouette reveal on the animal tiles, and the grown-up long-press for the
`help` level.

## Lobby

Built: `spinoff/lobby.html` (page) on `spinoff/net.js` and `spinoff/roster.js`.

- 🏠 starts a game and shows a **picture code**: four treats out of six (🍩 🧁 🍪 🍒 🍓 🍰),
  1296 codes, readable by kids who can't read. 🔑 opens a six-treat keypad to type one.
- Everyone in the room stands together on a **grid floor** (`inventory/grid.js` display, drawn
  with `makeGridLines` from `inventory/notions.js`). `standingSpots` gives every tablet the same
  arrangement whatever order people joined in: front row first, from the middle out, 7 × 2
  cells, room for 14 (6 kids, 8 bad guys).
- A newcomer arrives with a cheer. 👋 waves bye and leaves the room (not a door: a door reads as going in as much as out); ✏️ goes back to the chooser.
- Network: Trystero 0.26 over Nostr, loaded from esm.sh through the import map, a devDependency
  for its types only (the same arrangement as `three`). Each tablet sends its fighter to each
  newcomer (`maxReceiveBytes` 64 KB). `ponytail:` every tablet talks to every other in the lobby;
  the host-authoritative star from §Multiplayer arrives with the match sim.

## Bad guys

The other team: up to 8 bad guys, drawn from **8 fixed presets**. A grownup can play one (below);
the host fills the rest of the team with CPU bad guys from the presets nobody took. Silly, not
scary, for 4–6 year olds.

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
- **AI is an input generator on the host.** The sim already takes one input per fighter per
  tick; a bad guy's comes from a small state machine instead of a touch screen:
  - head for the kids' shelf;
  - grab;
  - run home and bank;
  - break off to attack a kid who is carrying donuts nearby.

  One exact trait tunes it: **Assertiveness** sets how often a bad guy chases a carrier instead
  of grabbing. `ponytail:` one state machine for every bad guy; personalities per bad guy only if
  matches feel samey.
- **The bad-guy team grows level by level** (decided 2026-10-13). Level 1 is the grownups who
  tapped 🥷, or one CPU bad guy if nobody did. Each level after adds one CPU bad guy:

  ```
  badGuys(level, grownups) = min(8, max(grownups, 1) + level - 1)
  ```

  Two grownups on level 3 face the kids with 2 CPU bad guys beside them; no grownups on level 3
  is 3 CPU bad guys. Winning a match moves the room up a level; losing replays the level, never
  drops it. The level lives on the host for the evening (a new room starts at level 1).
- **No difficulty setting** (decided 2026-10-13). CPU bad guys play at `help 0`; the level (how
  many of them) is the only dial for now. `ponytail:` auto-scaling comes later: nudge the CPU bad
  guys' `help` (between `-0.5` and `0.5`, below the kids' safety bounce at `0.75`) from the
  previous level's **donut margin** (decided 2026-10-13). Matches keep the fixed 3-minute timer,
  never longer, so time can't be the signal: a big win nudges the next level harder, a narrow win or
  a loss nudges it easier.

Check: a node test runs one bad guy against an idle kid on the two-shelf stage and asserts the
bad guy grabs a donut and banks it.

## Milestones

1. **Fun to hit, one tablet.** One `spinoff/` page: a default fighter wearing boxing gloves,
   with touch controls, versus a second fighter as a standing training dummy, on one flat
   platform: jump, a punch and a kick as move entries, sphere hit test, knockback, ring-out with instant drop-back-in. A dummy
   rather than two players sharing a screen, since two kids' hands on one tablet is cramped and
   milestone 2 gives each their own anyway. Build it as the host from day one: the sim takes an array of per-player
   inputs per tick and produces a snapshot, and the renderer draws only from snapshots. Check:
   a node test that feeds scripted inputs to the sim and asserts a hit lands and launches,
   and that a ring-out spills the bag and the fighter is back in play the same tick. Also one
   enemy shelf and a bag: grab a donut from the shelf, bank it on your own, and assert the
   shelf counts change.
2. **Two tablets.** Done: the fighter chooser, the room code and the join handshake, with
   everyone standing on the lobby floor. Still to do: inputs up, snapshots down, interpolation,
   per-tablet camera.
3. **Kids vs bad guys.** Up to six tablets on one team, the bad-guy team with its generator,
   `ninja` hat and AI, two shelves on a stage wider than a screen, edge markers, the match timer
   and team shelf score, donut pickups, a results screen with `selfie.js` portraits.
4. **Content.** Full move lists per species, stages, alternate costumes, item drops with
   catch-up weighting.

## Open questions

- **Personality.** Should traits change how a fighter plays (a high-Volatility lion with
  stronger, slower moves), or only how it looks while moving?
- **The owl.** It is already a species in the code. Its wings are the one set of arms that
  would read, which makes it a natural third move set.
- **Does pick-and-place have a job in this mode?** Banking is automatic. The touch picker could
  run a short setup phase to arrange your shelf or place obstacles in front of it (the earlier
  obstacle-building idea), or stay out of this mode.
