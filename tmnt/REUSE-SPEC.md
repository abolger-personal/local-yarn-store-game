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
- Battle cries the game must use somewhere: **"Cowl-abunga!"** and **"Tubular!"**. **Turtleneck** must be used
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
  - **Raphael's sai:** a long point and two prongs curving forward from the guard, a white grip.
  - **Master Splinter's cane:** a giant crochet hook (amended 2026-11-09: a hook's lip, throat and thumb rest, not a
    knob), which hangs straight down at rest like a walking
    stick and swings up out of that into the sword's moves. One length for every animal (amended 2026-11-09, so it
    reaches as far on all of them): a hand nearer the floor grips it further down the shaft, so the hook just clears
    the floor and the rest stands up past the hand.
  - **April's comically oversize microphone** (decided 2026-11-09; a giant video camera was the other idea): wielded
    as the Greathammer but never thrown. A dark handle, a band in the picked colour, a huge faceted silver grille,
    about half her height. It has the sword's effects, off the grille; April's preset starts on ✨ the stars
    (decided 2026-11-10), and tapping the mic again goes through the rest.
  - **Leonardo's katanas are a pair of knitting needles** (decided 2026-11-09), one in each hand: the right held
    and swung as the sword, the left held up at the sword's rest. Long points, a knob on each end.
  - **Michelangelo's nunchucks are two balls of yarn on one strand** (decided 2026-11-09, "more fun to animate"),
    held by the middle, swung as the sword. Each ball swings on its strand as a pendulum hung from the hand, so a punch
    flings them out and they swing back on their own. No tricks yet. A throw that spins out and comes back like the
    Greathammer's (`spinoff/hammer.js`) is planned 2026-11-09.
  - **Donatello's bo staff:** held in both hands and swung as the Music Scythe, with no blade; longer, for reach. A
    wooden pole with its grip wrapped in knitting (the scarves' stockinette) in the picked colour.
- **Each turtle's own things** (decided 2026-11-09), on top of the turtle-colour scarf:
  - **Raphael** (red): his sai and red over-knee socks.
  - **Donatello** (purple), nerdy: a cowl, a fanny pack (the crossbody pouch), purple knee-high socks and his bo staff.
  - **Michelangelo** (orange), happy-go-lucky: an open scarf (long, draped), short orange socks, an orange backpack,
    cheek-slash face paint, and his balls of yarn.
  - **Leonardo** (blue), straight-laced: the trailing scarf, high blue boots (over-knee socks), a blue drawstring bag
    and his knitting needles.
  - **Master Splinter** (the sixth preset, decided 2026-11-10): an orange mouse in a red vest and white crew socks,
    with his cane in red. Picking the mouse for any hero gives the cane.
  - **April** (the fifth default), leggy: **an orange llama** (amended 2026-11-09) in her jumpsuit (the yellow
    pullover), white over-knee boots, a blue drawstring bag, a heart on her cheek, and her microphone.
- 🎲 any animal, colours and pieces. **🍕 a preset** (decided 2026-11-10): **six presets**, the four turtles, April and
  Master Splinter, in turn from a random one, so two taps never give the same. The page opens on the saved hero, or a preset when none is saved.
  👍 saves; there is no lobby to go to yet.
- Every colour is one of the six hero colours; anything else read from a save or another tablet snaps to the
  nearest (`readHero`). `tmnt/hero.test.mjs` checks it.

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
- **Should Raphael hold a sai in each hand,** now that Leonardo's needles show two can be held?
- **Are weapons unlocked?** Unlocks from the fighting game carry over, or start fresh?
- **Which scarf colour does each player get?** One of the four at random, or each tablet in a room a different
  one, so a full room reads as the four turtles? A fifth player in taxi yellow would be the April.
- **Which animal is The Sweater?** Or a random one each time?
- **What should The Sweater's gauntlets look like,** and how do they attack?
- **Purple is a hero colour and a bad-guy colour.** Purple is one of the turtles' four, and the Sock Clan and The
  Sweater wear it too. Is that fine, as long as black and silver stay bad-guy only?
- **Where does "Turtleneck" go?** A power move, a pickup, a level name, or The Sweater's last form?
- **What does the booty shake do here?** It is a taunt in the fighting game, still open there too.
