# Turtles in Twine: The Sweater's Revenge

**Teenage Mitten Knitting Turtles** in a co-op side scroller: the yarn store's crocheted animals, up to 5 players,
each on their own tablet, all on one team against CPU bad guys, in the spirit of the 90s TMNT arcade games
(decided 2026-11-09). Like the donut fighters (`spinoff/REUSE-SPEC.md`), this doc sorts what carries over from the
existing code, lists what's new, and is the place to look when it isn't clear what to do. A bare file name is in
`tmnt/`; other paths are from the repo root.

Nothing is built yet (2026-11-09). The mouse species exists (`characters/mouse.js`).

## Decided, planned, brainstorm

The same three kinds as `spinoff/REUSE-SPEC.md` §Decided, planned, brainstorm, with the same rules: **decided DATE**
(agreed with the designer; code follows it), **planned DATE** (agreed, not built, details may move; only the designer
promotes an idea to planned), **brainstorm DATE** (unbaked; nothing is built from it until it's decided). Text that
isn't accurate any more is removed, not kept as history.

When this doc doesn't say, do what the donut fighters do (decided 2026-11-09): their spec and code are the default
for anything not decided here. The rules in it that are about the world and not about fighting hold here too:
things are as big as they look, buttons mean one thing everywhere, touch only with pictures and no words needed,
`readFighter`-style trust at every way in.

## Names and where things live

Decided 2026-11-09:

- The heroes are the **Teenage Mitten Knitting Turtles**. The game is **Turtles in Twine: The Sweater's Revenge**
  (after *Turtles in Time*, 1991, and *Shredder's Revenge*, 2022).
- The folder is `tmnt/`, the release branches `tmnt-X.Y.Z`, the tags `tmnt-X.Y.Z`. The first branch is
  `tmnt-0.0.1`, from `donut-fight-0.0.9`.
- Battle cries the game must use somewhere: **"Cowl-abunga!"** and **"Tubular!"**. Cowl-abunga! comes off a launch from the
  swings or the bars (decided 2026-11-10, §Level 1). **Turtleneck** must be used
  in the game too; where is open.
- **The Sweater** is the final boss (in place of the Shredder).
- **The Sock Clan** are the foot soldiers (in place of the Foot Clan). They **wear socks**: the designer's sock
  garment in `characters/garments.js` (`socks`: crew, knee-high, over-knee, slouch, leg warmers, slipper socks).
  Before an owl is in the Sock Clan, fix the open `FULL=1` owl socks failure.

Brainstorm 2026-11-09: the mouse as **Sensei Spindle** (Splinter); **Bobble & Rock-Stitchy** (Bebop & Rocksteady);
the **Loom-o-drome** (the Technodrome); sock silhouette as Sock Clan rank (crew for footsoldiers, over-knee for
elites); **Purl Power!** (Turtle Power) on the title screen.

## The game

- **Up to 5 players, all heroes** (decided 2026-11-09). No playable bad guys for now: it is one continuous side
  scroller, so there's no second team to join. Bad guys are CPU only.
- **Co-op all the way** (decided 2026-11-09): everyone on one team, the way the arcade games were.
- **Side scrolling in 2.5D** (decided 2026-11-09): keep the donut fighters' depth band you walk around in; the
  camera scrolls along the level (x) only.
- **The level generator** (decided 2026-11-09): use the donut fighters' (`spinoff/generate.js`, a pure function of
  seed, difficulty and stage, `GENERATED-LEVELS.md`), changed to make one long level that only side scrolls.
  Planned 2026-11-09: the same problem kinds (hill, tall, puddle, moat, choke, step up), laid along the level
  instead of mirrored across an arena; the seeded `rng` so every tablet builds the same level from what the host
  sends.
- **The theme isn't breakfast** (decided 2026-11-09), so the kids don't mix the two games up. Not cake either.
  Which theme is open; the options so far (brainstorm 2026-11-09), none of them food:
  1. Sewing basket: spools and button stacks, pincushion hills, thread to swing on; moths as bad guys.
  2. The garden at mouse size: flowerpots, watering-can rain, snails, a grumpy gnome.
  3. Toy box: blocks, a train track to ride, wind-up robots.
  4. Tide pools: coral, bubbles, sideways crabs, jellyfish to bounce on.
  5. Rainy-day town: umbrellas, rain boots, puddle jumps, storm clouds.
  6. Snowy woods: mittens and sleds, snowball fights.
  7. Autumn forest floor: acorns, mushrooms, leaf piles to dive into.
  8. Bathtub harbour: rubber ducks, soap-bubble platforms, a toy pirate ship, drain whirlpools.
  9. Night-time campsite: tents, lanterns, fireflies, shadow bad guys.
  10. Bookshelf: book-stack stairs, page bridges, bookworms.

  The first level settles it for now: a real playground (§Level 1), at kid size, not mouse size.

## Level 1: the Capuano playground

**The first level is the Capuano playground** (decided 2026-11-10): Glen Park, 150 Glen St, East Somerville, on the
grounds of the Capuano Early Childhood Center. The real one, as it is, not a made-up playground; a kid who plays there
should know it. Turned into a 2D side scroll in the 2.5D band.

- **Behind it, the soccer field, barely seen** (decided 2026-11-10): Capuano Field (Glen Field) is right there, a
  turf field with white and yellow lines and tall light poles. Far back, pale, low contrast.
- **Comic-book art, the heroes standing out** (decided 2026-11-10): flat colours and ink lines like the logo, but
  **thinner ink on the level than on the characters**, so they read first.
- **The real playground's colours** (decided 2026-11-10) for the level's palette.
- **Its pieces are the obstacles and the cover** (decided 2026-11-10): fire poles and the play structures to get
  over, round and down, and for bad guys to jump out from behind; it's a side-scrolling brawler.
- **The equipment is played on** (decided 2026-11-10), even where a real side scroller wouldn't: heroes **climb the
  steps**, **ride the slides down**, **wobble across the clatter bridge** and **slide down the fire pole**. **A jump
  gets you on** (decided 2026-11-10): nothing grabs a hero walking past.
- **The fire pole is yellow** (decided 2026-11-10), **in the middle of structure A**: off the 6 ft deck, beside the top
  of the steps down to the bridge, under a yellow hoop (the designer's close-up, 2026-11-10).
- **Bad guys use the equipment too** (decided 2026-11-10): they slide, cross the bridge and drop down the pole, and
  hide behind the pieces to jump out.
- **Bad guys go a quarter of the heroes' speed** (decided 2026-11-10), on foot and on every piece (climbing, steps,
  the bridge, the pole): the donut fighters had to slow theirs to a quarter, since bad guys as fast as the heroes are
  far too hard for four-year-olds, and climbing would make it worse. One factor, used by every piece's movement.
  **Everything at a quarter**, slides and the pole too (decided 2026-11-10); the designer will change it after a
  playtest if it looks really weird.
- **The playground fades behind the heroes** (decided 2026-11-10): lighter and flatter than the real thing, with
  **thinner ink** than the characters', but **not all the way to pastel**; it stays the real playground's colours.
- **The violet spiral slide stays violet** (decided 2026-11-10), though purple is the Sock Clan's.
- **The heroes pop** (decided 2026-11-10): something behind them to lift them off the playground, an action glow
  or a shadow; which is open. With **URL params as sliders** to try it on a tablet, like the choosers' `?ink=` and
  `?pool=` (§Ink outlines): how faded the level is, how strong the glow or shadow is, and the outline (`?ink=0`
  tries the heroes with no outline at all).
  **Built for the chooser to try** (2026-11-10): `tmnt/choose.html?glow=0.6&shadow=0.4` (each 0 to 1; off without
  them), the glow in the scarf's colour (the gloves' with no scarf), the shadow a dark halo, both soft and behind
  the hero (`addPop` in `hero.js`). The level's fade slider comes with the level.
- **The swings move and heroes ride them** (decided 2026-11-10): jump on, swing, and be **launched**; a swing can go
  **all the way round, 360°**, though real ones can't.
- **No hurry, no going back** (decided 2026-11-10): the game never pushes the players along. The camera follows
  forward and doesn't come back (the side-scroller rule), and **nobody gets further forward than the slowest player**
  lets the camera go.
- **The boss is a Sock Clan elite** (decided 2026-11-10), **a dragon** in **over-knee socks** and **a massive hat like
  a ninja's**, who **breathes fire**. Built in a later session; the level first.
- **The finale has a fire pole** (decided 2026-11-10): the heroes slide down it into the boss fight.
- **Route** (decided 2026-11-10): seen from Glen St, north to south (below).
- **No triple-deckers** (decided 2026-11-10). **The telephone pole and street signs stay**, and the **ONE WAY**
  sign points the way the level scrolls.

What it looks like (the designer's Google Maps screenshots, Street View from Glen St, August 2026, and overhead,
2026-11-10; colours eyeballed from them, to tune):
- **Two play structures** on a poured rubber floor: a smaller one by Glen St and a big one in the middle. Both are
  **royal-blue posts** (about `#2f3db8`) with **marigold-yellow railings and panels** (`#f0b648`), **teal-green
  hip roofs** like little pagodas (`#2e6b58`), dark decks, **green play panels** (a tic-tac-toe spinner, `#2f7a50`),
  a **dark green wavy slide**, a **teal curly slide** two decks high off the far tower (up a second flight of stairs), a **violet tube-and-spiral slide** (`#6b55d9`), a rope-and-plank **clatter bridge**
  (yellow ropes) between towers, ladders, steps, a grey rock-climbing dome joined to the tall tower's deck (and, from a 2011 write-up, a
  fire pole, a rock wall and stepping stools; not seen in the screenshots).
- **Blue arch swings**: a row of four along Palmer Ave and two more sets near the middle, **blue** hoop frames.
- **The floor** in big soft blobs: **slate blue** (`#7085b8`), **teal** (`#5e9e8f`) and **terracotta** (`#c48a5e`)
  under the big structure, with circles of the other colours dotted in it.
- **Round it:** black chain-link fence, black benches and picnic tables, a telephone pole and street signs on Glen
  St, big street trees, triple-deckers behind (left out), the school's brick to the south (Fountain
  Ave). Across Palmer Ave an asphalt yard **painted with a big teal and green labyrinth**, a red circle and hopscotch.
- **The field** to the east: green turf, white and yellow lines, white goals, light poles, a tall building far off.
  From Glen St it shows **through the structures**, so it really is the backdrop.
- From the 2014 renovation: the rubber floor, a picket gate, shade trees; a shade structure opened October 2025.

Brainstorm 2026-11-10:
- **Seen from Glen St, the way Street View is** (the route, decided 2026-11-10): the camera looks east, so the field is behind the structures, and
  the level runs **along Glen St, north to south**: the painted labyrinth and hopscotch across Palmer Ave (flat, the
  first fight) → the row of arch swings (swinging hazards) → structure A, unwrapped (§The pieces: the climbing dome
  with the bear cave under it, the squiggle climber, the fire pole, the steps down onto the clatter bridge, the
  tic-tac-toe tower, the climbing grid, the top deck and the teal curly slide), with B's violet slides behind it →
  the swing sets by the middle → out at the school's brick on Fountain Ave.
- **Where the Sock Clan come from:** behind the fire pole and the posts, down a slide, out of the bear cave, from
  behind the swings, over the fence from the field.
- **Layers:** the field and its light poles far back, the fence and trees behind the play band, the play pieces in
  it, a post or a swing chain passing close in front now and then.
- **The real pieces, recombined** (amended 2026-11-10): structure A as the real playground has it would take about
  twenty seconds to play, too short. So **every piece is its own module** (the dome and bear cave, the squiggle
  climber, the fire pole, the steps, the bridge, each tower, the grid, the top deck, each slide, the swings), and the
  generator (`spinoff/generate.js`'s seeded `rng`, so every tablet builds the same level from what the host sends)
  **strings them into a longer level**. The real playground is what the pieces look like, and how they fit together,
  not the one order they come in. Planned 2026-11-10 (§Pieces as modules): how the pieces join.


### Unwrapping the structures

**The real structures are 3D; the level is a side scroll** (decided 2026-11-10), so it takes liberties. The
screenshots look at the structures' backs: the climbing dome's face, the way up it, is on the far side of the
structure (Street View sees the crawl space under it). Climbing every side of the real thing would mean swinging the
camera round it, and the camera only scrolls along x (§The game). Ways to unwrap it, brainstorm 2026-11-10:

1. **Unfold it like a paper model:** walk round each structure in the route's order and lay every face it has side
   by side along x, each turned to face the camera, so the climbing dome's face shows. Decks, steps and slides keep
   their heights; only where they are along x is made up. Nothing new for the camera, the floors or the generator.
2. **Use the depth band:** the far side's pieces are at the back of the 2.5D band, the near side's at the front; the
   structure's near panels go see-through (a dollhouse cut-away) when a hero is behind them.
3. **A track that bends round the structures** (Klonoa, Kirby 64): the level is still a strip you walk left to
   right, but the strip curves through the 3D playground and the camera turns with it, staying side-on. The truest
   to the real place and the most work: the camera, the floors and the generator all learn curves.

**Corners straightened** (decided 2026-11-10): where the real structure turns a corner, the level goes straight on.
The first: off the tic-tac-toe tower, the stairs up to the top deck and the teal curly slide run at 90° to the first
tower and the clatter bridge; in the level they carry on in the same line.
The **climbing grid** on the structure's far side (opposite the tic-tac-toe panel, unseen in the photos) is moved
in between the lower and the higher decks, so the tic-tac-toe stretch has a climb.

**The pieces are the playground's, re-ordered for play** whichever way: what a kid recognises is the pieces (the
slides, the dome, the bridge, the pole, the panels, the bear cave), not where they are in plan.

### Pieces as modules

Planned 2026-11-10: each piece in the table below is a module the generator can place again and again.
- **A module knows its ends:** how high it is where you come in and where you leave (the steps: in at 6 ft, out at
  4 ft; the bridge: 4 in, 4 out; the grid: 4 in, 7.5 out; a slide: in at its deck, out at the ground), how wide it is,
  its decks, climbs and rides, and its hiding and burst spots.
- **The generator joins ends that match:** after a piece that leaves at 4 ft comes one that starts at 4 ft (the
  bridge, the tic-tac-toe tower, the grid); after one that leaves at the ground, a ground stretch or a way up (the
  dome, the squiggle climber, a swing). So the decks and slides always meet the way they do on the real structure,
  and a structure can be as long as the level needs: up the dome, across, down the steps, over a bridge, up the grid,
  down the teal slide, and round again with a different order.
- **Between structures, ground:** fights on the rubber floor, the swings, the painted labyrinth.
- **A level takes 90 seconds to 2 minutes for the designer to play, fighting included** (decided 2026-11-10); kids
  take longer. The
  real structure A takes about 20 seconds, so a level is roughly four to six structure-strings with ground fights
  between. Planned 2026-11-10: the generator measures length as the time a hero takes to get through each module
  (walking, climbing, riding at hero speed, plus its fights), not as distance, and stops adding when the total
  reaches the target; a check in its test.
- **The real structure A is one of the strings** (the order in §The pieces), a good first one to build and test.
- Brainstorm 2026-11-10: a roof caps a tower at most every so often; the bear cave and the fire pole come as a pair,
  facing each other, as on A.

### The pieces

Planned 2026-11-10, drafted from the screenshots; the designer corrects them before any level code. The side views
are `tmnt/level1-pieces.svg` (seen from Glen St, left = north = where the level starts; feet; dashed pink = a guess;
every piece has an `id`). **Heroes are kid-sized** (decided 2026-11-10): about 3 ft 10 in, so a 4 ft deck is chest
high and the towers' roofs are about three heroes up. In the game's units a hero's own height sets the scale.

Every piece is solid (simple posts, boxes and tubes in flat colours and thin ink), so heroes walk in front of and
behind it in the 2.5D band. **A jump gets you on** anything; nothing grabs a hero walking past. What's new to the
code: today a level knows only flat floors (`Floor` in `spinoff/match.js`, ground, deck or hill). Decks are decks;
**slide, pole, swing, bridge and burst** are new kinds.

| Piece (`id`) | Size (ft) | Stand on | On, what it does, off | Bad guys | Seed varies |
|---|---|---|---|---|---|
| Painted labyrinth and hopscotch (across Palmer Ave) | flat, ~30 | ground | the start; flat, the first fight | walk in from the left edge | how many |
| Arch swings, a row of four (`swings`) | hoops 9.5 tall, 7 apart; seats 2 up, one a bucket | the seat | jump on; swings by itself, faster the more you ride; jump off **launched** along the swing; can go **all the way round** | ride them too; launched at you | when each seat's swing starts |
| Green wavy slide (`a-wavy-slide`) | from the 7 ft deck, 9 long | — | down only: jump on at the top, carried down fast, off at the bottom | slide down at you | — |
| Tower with a roof (`a-tower-high`) | deck 7 (check), roof 15 | the deck | a deck; posts are cover | hide behind posts, jump out | — |
| Low deck (`a-deck-low`) | deck 6 (check) | the deck | a deck | hide behind the panels | — |
| Yellow fire pole (`a-fire-pole`, moved 2026-11-10) | ~10, from the 6 ft deck | — | in the middle of A, across from the bear cave: jump to grab it from the deck, **slide down** to the ground | slide down at you | — |
| Squiggle climber (`a-squiggle-climber`, confirmed 2026-11-10) | ground to the 6 ft deck | the rungs | a yellow **squiggle climber**: one upright pole, its rungs snaking left and right up it: **climb** it | climb after you | — |
| Steps (`a-steps`) | 4 steps, the low deck down to the bridge; **not to the ground** (corrected 2026-11-10) | each step | between the deck and the bridge, walked either way | come down them at you | — |
| Climbing dome (`a-climbing-dome`, grey, under the tall tower) | 8 wide, up to the deck | its face, then the deck | **a rock-climbing dome joined to the tall tower's deck** (decided 2026-11-10): its climbing face is on the structure's far side, turned to the camera here (§Unwrapping); jump on and **climb up it** onto the deck. **Underneath it is the bear cave** (decided 2026-11-10; none on B): kids crawl in, and **bad guys burst out** of it, in waves | burst out of the cave; climb the dome after you | how many come out, when |
| Clatter bridge (`a-bridge`) | 11 long at 4 ft | the planks | a deck that **wobbles** as anyone crosses, more with more feet | cross it at you | — |
| Tower with the tic-tac-toe panel (`a-tower-b`) | deck 4, roof 13 | the deck | a deck; the panel is cover (spinnable? brainstorm) | hide behind the panel | — |
| Climbing grid (`a-climbing-grid`, added 2026-11-10) | a ladder-grid about 4 or 5 rungs, the 4 ft deck up to the top deck | the rungs | **climb** it, like the dome; another way up beside the stairs | climb after you | — |
| Stairs up (`a-stairs-up`, added 2026-11-10) | 5 steps, the tic-tac-toe tower's 4 ft deck up to the top deck | each step | walk up | come down at you | — |
| Top deck (`a-deck-top`, added 2026-11-10) | 7.5 ft, small | the deck | the top of the curly slide | hide, jump out | — |
| Teal curly slide (`a-curly-slide`) | from the top deck, **two decks high** (corrected 2026-11-10) | — | down only, curling; the longest, fastest ride in A | slide at you | — |
| Step-downs (`a-step-downs`) | 3, 2, 1 | each | down off the structure | — | — |
| **B** (behind A; from Palmer Ave, Nov 2020, 2026-11-10). **Mostly scenery** (decided 2026-11-10): bridges kids chase each other round, less fun to play on than A. Its pieces stay in the drawing; only its two yellow bars join the kit. | | | | | |
| Spinner panel (`b-spinner-panel`) | a round panel at the deck's end | — | a white disc with coloured dots; spin it? (brainstorm) | hide behind | — |
| Violet curly slide (`b-spiral`) | from the 4 ft deck | — | down only, curling (the violet spiral seen from Glen St? check) | slide at you | — |
| Long deck (`b-deck-long`) | ~22 long, 4 ft (check), yellow panels | the deck | a long walkway | fight along it | its length |
| Blue arches (`b-arches`) | two hoops over the deck | — | over the deck; climbed or hung from? (brainstorm) | — | — |
| **Two yellow bars** (`b-bars`, decided 2026-11-10, corrected: not monkey bars; in the kit) | two single bars side by side, **one higher than the other** (decided 2026-11-10), like uneven bars, waist to chest high on a kid (about 3 and 3.5) | — | the designer's kids do gymnastics off them: **jump to grab** a bar, **swing round it, all the way round**, and **let go to fly**, launched the way you're swinging: **fly from one bar and catch the other**, an uneven-bars routine; **launch up onto a deck**; or **launch into bad guys** to knock them over. **"Cowl-abunga!"** comes off a launch from the bars or the swings (decided 2026-11-10). The swings' ride and launch, round a fixed bar | a quarter as fast, as everything | where they go (on the ground or under a deck to launch onto it), how many, **their heights** |
| Stairs (`b-stairs`) | ground up to the deck | each step | walk up | come down at you | — |
| Tower (`b-tower`) | deck 5 (check), roof 14, violet panel | the deck | a deck | hide, jump out | — |
| Violet slide (`b-straight-slide`) | from the tower | — | down only, short | slide at you | — |
| Rubber floor (slate blue, teal, terracotta) | the whole band | ground | ground | — | where the blobs fall |
| Chain-link fence, benches (`d-fence`, `d-bench`) | fence 4 | — | the front edge of the band, close to the camera | climb over from the field? (brainstorm) | — |
| Telephone pole, ONE WAY and NO PARKING (`d-telephone-pole`) | ~30 tall | — | in front, now and then; **ONE WAY points the way the level goes** | — | — |
| The field (backdrop) | far | — | far back, faded, seen through the structures | — | — |
| The finale's fire pole | tall | — | the heroes slide down it into the boss fight (the boss, a later session) | — | — |

## Rooms and the lobby

**Keep and reuse every room and coordination screen** (decided 2026-11-09): the lobby, joining with a picture
code, the session that outlasts every screen, late joiners, kept rooms, the host's 👍 and ▶️
(`spinoff/REUSE-SPEC.md` §Lobby, §Multiplayer). The same host-authoritative WebRTC star.

**Keep the emojis and what they mean** (decided 2026-11-09): 🏠 starts a room, 🔑 types a code, 👋 waves bye and
leaves, ✏️ goes back to dress up, 👍 moves on, ▶️ plays.

**The room code is four out of six dated 90s things instead of desserts** (decided 2026-11-09): ☎️ 📼 👾 💾 🕹️ 📟
(telephone, videotape, space invader, floppy disk, joystick, pager), picked by the designer for the spread of
colours. Six, like the fighters' treats (`ROOM_TREATS` in `spinoff/roster.js`), so the same keypad and 1296 codes.

## Hero chooser

**Very like the donut fighters' chooser** (decided 2026-11-09; `spinoff/REUSE-SPEC.md` §Fighter chooser,
`spinoff/choose.html` on `spinoff/fighter.js`), with its own colours and defaults.

**The colours are fewer and specific, not the full rainbow** (decided 2026-11-09):

| Colour | Who | What it's for |
|---|---|---|
| orange `#ff6a00`, blue `#0056d6`, purple `#874efe`, red `#b51a00` | heroes | the four turtles' colours |
| turtle green `#4f7a28` | heroes | the turtle's skin |
| bright taxi yellow `#f5ec00` | heroes | April O'Neil's jumpsuit |
| white `#ffffff` | heroes, clothes only | April's boots (decided 2026-11-09); never fur |
| black, silver | bad guys only | |

The chooser offers the six hero colours. Black and silver go only to bad guys, the way the donut fighters keep
dark purple and grey for theirs (`isBadGuyCloth` / `isBadGuyFur`).

**Kids can pick any animal** (decided 2026-11-09): turtle, mouse, lion, llama, owl or dragon, as in the fighters'
chooser. The turtle is only the default.

**The defaults** (decided 2026-11-09): a turtle in turtle green wearing either
- **a scarf** in one of orange, blue, purple or red (the four turtles), or
- **a yellow jumpsuit** in taxi yellow (April), which is a yellow `sweater` from the existing wardrobe
  (`characters/garments.js`), not a new garment, with **white boots**: white knee-high `socks` (amended 2026-11-09);

with **a weapon** (the sword for now; which one is open) and no hat.

**What a hero picks** (decided 2026-11-09): animal, fur, **scarves, sweaters, socks, bags, face paint and the
weapons**. **No hats and no capes** this time. The sweater row is how a kid makes April's jumpsuit. **The scarf
worn "wrapped twice" is the Sock Clan's**, so heroes never get it; the other forms (draped, wrapped once, tied,
tucked) they do.

Built 2026-11-09: `tmnt/choose.html` on `tmnt/choose.js` and `tmnt/hero.js`, over the fighters' `buildFighter`
(whose `outfitOf` now also dresses a scarf, sweater and socks when a look has them) and their chooser pictures
(`spinoff/icons.js`).
- Scarves: trailing, long, cowl; tapping the one you wear again ties it another way.
- Sweaters: pullover, turtleneck, vest. Tapping the sweater you wear again works it in the next colourwork (solid,
  stripes, checks, colour-block, motif, fair isle, marled; decided 2026-11-09, so a sweater reads as a sweater when
  the characters are small on a tablet): its own colour first, then the other five hero colours.
- Socks: crew, knee-high, over-knee. Tapping them again knits them in the next stitch, as the fighters' hats do.
- Bags: the fighters' three, or none.
- Weapons: the gloves and the heroes' own; not the fighters' sword, Music Scythe or Greathammer (decided 2026-11-10;
  a saved one comes back as gloves). No unlocks yet; tapping again changes the trick. The heroes' own (decided
  2026-11-09):
  - **Master Splinter's cane:** a giant crochet hook (amended 2026-11-09: a hook's lip, throat and thumb rest, not a
    knob), which hangs straight down at rest like a walking
    stick and swings up out of that into the sword's moves. One length for every animal (amended 2026-11-09, so it
    reaches as far on all of them): a hand nearer the floor grips it further down the shaft, so the hook just clears
    the floor and the rest stands up past the hand.
  - **April's comically oversize microphone** (decided 2026-11-09; a giant video camera was the other idea): wielded
    as the Greathammer but never thrown. A dark handle, a band in the picked colour, a huge faceted silver grille,
    about half her height. It has the sword's effects, off the grille; April's preset starts on ✨ the stars
    (decided 2026-11-10), and tapping the mic again goes through the rest.
  - **Leonardo's katanas are comically large kid's safety scissors** (decided 2026-11-10), a half in each hand,
    crossed in front of him at rest like his two katanas (each half aimed past the middle; amended 2026-11-10: as
    big as needed for his short arms to cross them; a handle shank four times the loop, so the blades reach well past
    each other; the handles very long ovals, amended 2026-11-10): a long blade with a rounded tip, a chunky
    handle loop round the hand in the picked colour, a pivot screw. The right swung as the sword, the left held up at the sword's rest.
    As a punch starts both halves uncross out to their own sides (`SNIP_GUARD`, 2026-11-10), so the blades don't cut
    through him on the way. Brainstorm
    2026-11-10: snipping shut as a hit lands.
  - **Raphael's sai are a pair of knitting needles** (decided 2026-11-10: stabbing, in pairs, like sai), one in each
    hand, the right swung as the sword, the left held up at its rest. Long points, a knob on each end. The sai has left
    the game (decided 2026-11-10).
  - **Michelangelo's nunchucks are two balls of yarn on one strand** (decided 2026-11-09, "more fun to animate"),
    held by the middle, swung as the sword. Each ball swings on its strand as a pendulum hung from the hand, so a punch
    flings them out and they swing back on their own. No tricks yet. **Planned 2026-11-10, with the levels:** the
    swing is worked out in his own space, so only his arm moving (a punch, the idle bob) swings them; running,
    jumping, landing and the chooser's turning don't. Work it out in the level's space instead, so the yarn trails
    behind a run and bounces on a landing. A throw that spins out and comes back like the
    Greathammer's (`spinoff/hammer.js`) is planned 2026-11-09.
  - **Donatello's bo staff is a giant drop spindle** (amended 2026-11-10, was a pole with a knitted grip): held in
    both hands and swung as the Music Scythe, with no blade; longer, for reach. A wooden shaft to a point, a chunky
    whorl near the top with a hook above it, and a cop of spun yarn in the picked colour under the whorl, wound
    round in a spiral, its strand running up over the whorl to the hook. The hands hold the bare shaft below it.
- **Each turtle's own things** (decided 2026-11-09), on top of the turtle-colour scarf:
  - **Raphael** (red): his knitting needles and red over-knee socks.
  - **Donatello** (purple), nerdy: black-rimmed glasses, a cowl, a fanny pack (the crossbody pouch), purple knee-high socks and his bo staff.
  - **Michelangelo** (orange), happy-go-lucky: an open scarf (long, draped), short orange socks, an orange backpack,
    and his balls of yarn.
  - **Leonardo** (blue), straight-laced: the trailing scarf, high blue boots (over-knee socks), a blue drawstring bag
    and his safety scissors.
  - **Master Splinter** (the sixth preset, decided 2026-11-10): an orange mouse in a red vest and white crew socks,
    with his cane in red. Picking the mouse for any hero gives the cane.
  - **April** (the fifth default), leggy: **an orange llama** (amended 2026-11-09) in her jumpsuit (the yellow
    pullover), white over-knee boots, a blue drawstring bag, a heart on her cheek, and her microphone.
- **The face** (decided 2026-11-10): none, the mask (rings round the eyes), a heart, or **black-rimmed glasses**;
  not the NFL eye black, which doesn't show on a turtle. The mask is the scarf's colour, so a turtle's sync up (the
  fur's complement with no scarf), and narrow on a turtle's big eyes (`faceOf`). Glasses are a rim round the front
  of each eye, and a bridge when the eyes are far enough apart (`buildHero`). **All four turtles start in their
  masks** (amended 2026-11-10, the kids asked), Donatello's glasses over his; the face row still picks one or the other.
- 🎲 any animal, colours and pieces. **🍕 a preset** (decided 2026-11-10): **six presets**, the four turtles, April and
  Master Splinter, in turn from a random one, so two taps never give the same. The page opens on the saved hero, or a preset when none is saved.
  👍 saves; there is no lobby to go to yet.
- **The hero turns all the way round** (decided 2026-11-10), to the shell at the back, before turning back the other
  way; the fighters' chooser only sways.
- Every colour is one of the six hero colours; anything else read from a save or another tablet snaps to the
  nearest (`readHero`). `tmnt/hero.test.mjs` checks it.

**The chooser sets the scene** (planned 2026-11-10). Today it's the donut fighters' plain cream (`makeStage`'s
`background`, `--cream` in `spinoff/spinoff.css`), which says nothing about the story. It gets a logo and a backdrop.

- **The logo is the splash screen** (decided 2026-11-10). It goes where the donut fighters' splash is, the
  tap-to-play button in `spinoff/index.html` that goes fullscreen, loads the rooms and opens the chooser in a frame.
  `tmnt/index.html` is that page with the logo as the button. Draft: `tmnt/logo.svg` (2026-11-10), each part named
  by `id` so it can be edited by hand or in an editor.
  - **After the 1987 cartoon logo, not the arcade games** (decided 2026-11-10): *Teenage Mitten Knitting* in
    white on a red banner, **TURTLES** big, green and arched with a thick black outline, and *Turtles in Twine:
    The Sweater's Revenge* under it. **A giant silver ball of yarn** behind it all, where the cartoon has its sewer
    lid, its end trailing out. The logo is the one place outside the bad guys that silver shows.
  - **TURTLES is knitted** (decided 2026-11-10): stockinette Vs all over the letters, in place of the cartoon's
    lumps; the edges wobble a little, hand-made. The draft uses Luckiest Guy (Google Fonts), each letter set on the
    arch by itself and stretched to the same width, so it lands the same whichever font draws it.
  - **🐢👆 under the logo, as emoji** (decided 2026-11-10), like the fighters' 🍩👆, so a player who can't read
    still sees what to do: tap. They're on the page, not in `logo.svg`.
- **The backdrop** (planned 2026-11-10): somewhere in the story, not a flat colour. Brainstorm 2026-11-10:
  - the turtles' lair: the yarn store's back room or under its floor, at mouse size; yarn bins as walls, a
    pizza box, a TV, Master Splinter's rug;
  - a city at dusk behind them, the 90s cartoon's skyline, with a water tower and rooftop to stand on;
  - a preview of the first level once the theme is picked (§The game), so the chooser is where the story starts;
  - The Sweater hinted at: a giant silhouette, a pulled thread running off screen, a "wanted" poster;
  - built like the levels will be, flat painted layers at a few depths (2.5D), plus a floor the hero stands on.

**Ink outlines on the characters, to match the logo** (brainstorm 2026-11-10). Today the painter (`characters/paint.js`)
draws no line round a character: the ink style frays at the silhouette (`fray`) and darkens towards it (`pool`, 0.45,
not on the species checker's dials). Ways to get a cartoon outline, cheapest first:
  - **pool turned up**: darker towards the silhouette, already in the shader; reads as a soft brush edge, not a line,
    and is thicker where a part curves away slowly;
  - **a back-face shell**: each mesh again, black, seen from inside, pushed out along its normals, as the fighters'
    sticker finish does in white (`adorn` in `spinoff/fighter.js`). A real line outside the silhouette and round
    every piece (scarf, socks, weapon). Clean to a few pixels wide; wider, it splits at sharp corners and swallows
    thin things (fingers, needles, scissor blades). Twice the meshes to draw;
  - **an edge pass over the whole picture** (depth and normals): even lines everywhere, creases too, but a full-screen
    pass every frame on a tablet GPU.

On the species checker to try (2026-11-10), off in every game: **ink pool** (the owl's, as before), **fur pool**
(the same darkening for every other animal, `PAINT.edgePool`, 0 in the games) and **ink outline** (the back-face
shell, `inkOutline` in `characters/paint.js`, width 0 and hidden in the games; only the checker adds it). Never
round the eyes, so no line on the pupils (2026-11-10). Saved characters can be checked on either chooser with
`?ink=0.002&pool=1` on its address; without it the choosers are as before.

**Keep this game's saves apart from the donut fighters'** (decided 2026-11-09). Both games are on the same site,
so they share `localStorage`. The fighters' keys are `lys.fighter.v1` and `lys.progress.v1`; the hero is
`tmnt.hero.v1`, so a hero never overwrites a fighter.

## Bad guys

All CPU (decided 2026-11-09). Their colours are purple, black and silver.

**The Sock Clan** (decided 2026-11-09) wear
- **socks** (`socks` in `characters/garments.js`), each sock colour drawn at random from purple, black and silver;
- **large scarves that cover their faces**, ninja style. The existing scarf forms all sit below the face, so a
  face-covering scarf is a new scarf form (planned 2026-11-09);
- **hats** (the existing ones);
- **no sweaters**: the sweater is The Sweater's.

**The Sweater** (decided 2026-11-09) is **gigantic**, in a gigantic silver and purple `sweater`, a silver hat and a
purple capelet (`capelet` is one of the fighters' capes). Gigantic means everything scales up together: things are
as big as they look, so the boss's hit box and reach grow with the drawing.

**The Sweater's gauntlets** (planned 2026-11-09): a new weapon, after the Shredder's clawed gauntlets, made for The
Sweater. Heroes don't get them. The design is open.

## Open questions

- **Which theme?** Pick from the list in §The game.
- **Are weapons unlocked?** Unlocks from the fighting game carry over, or start fresh?
- **Which scarf colour does each player get?** One of the four at random, or each tablet in a room a different
  one, so a full room reads as the four turtles? A fifth player in taxi yellow would be the April.
- **Which animal is The Sweater?** Or a random one each time?
- **What should The Sweater's gauntlets look like,** and how do they attack?
- **Purple is a hero colour and a bad-guy colour.** Purple is one of the turtles' four, and the Sock Clan and The
  Sweater wear it too. Is that fine, as long as black and silver stay bad-guy only?
- **Where does "Turtleneck" go?** A power move, a pickup, a level name, or The Sweater's last form?
- **What does the booty shake do here?** It is a taunt in the fighting game, still open there too.
