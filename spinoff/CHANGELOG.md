# Changelog

What's new in Donut Fighters, the L.Y.S. spinoff.

## 0.0.4 (in progress)

### Dress up
- **Swords!** Beat level 1 and a sword shows up next to the 🥊 boxing gloves on the dress-up page. Pick
  one or the other, in any colour. It's a chunky toy sword with its own moves: 🥊 stabs straight
  ahead, then slashes across, then stabs up at the sky, with a whoosh. A sword makes you a bit wider, so
  your hits land a little further out, and you're a little easier to hit.
- **Change your outfit without leaving your friends.** In a room, ✏️ is there in the lobby and on the
  score card between rounds. Dress up and tap 👍: you're still in the room, and everyone sees your new
  look. If the next round starts while you're dressing up, you wait with ⏳ and play the one after.
- **Tricks.** Tap your gloves or your sword again for a ✨ sparkle, 🫧 bubbles or a 🔥 flame that pops out
  when your punch lands. Tap again for the next one.

### Levels
- **Pick where to play.** 👍 in the lobby (instead of ▶️) shows the stages to choose from (🥞 breakfast
  for now), then a number pad of levels. Only the levels you have reached have a number; tap one
  and ▶️ to play it. In a room, the host picks and everyone else waits in the lobby until the host
  taps ▶️. A room only offers levels that everyone in it has reached.
- **Win a level to unlock the next one.** After a win, ▶️ on the score card plays the next level;
  after a loss or a tie it plays the same one again. Your tablet remembers how far you've got,
  even if you make a new fighter.

### Building
- **Build a wall before the match.** On level 2 a match starts with building time. Your blocks are
  the little heap next to you, topped in your own colour. Tap the heap to pick one up, walk to where
  you want it, and press ⬇️ to put it down in front of you; the outline shows where it will go. Stack
  blocks two high, too tall for anyone to jump. Tap one of your own blocks to pick it back up (not
  one with a friend's block on top).
- **👍 when you're ready.** The match starts when everyone has tapped 👍; tap it again if you want
  to keep building. Grown-ups and kids who can read can hold 👍 for two seconds to start straight away.
  Then 🥊 and 🦶 pop back in and the clock starts.

### Bad guys
- **A bad guy comes for your donuts on level 2.** It runs to your shelf, grabs a donut and runs home
  with it. A wall one block high it just jumps; a taller wall it kicks down, one block at a time.
  Once it has one of your donuts, it goes home and guards its shelf, so you have to knock it out of
  the way to get your donut back. On level 2 it never hits you, only your blocks.

### Fighting
- **Everyone has their own start spot.** Each hero starts the match in a spot of their own, out in
  front of the shelf, with room beside them for their blocks. Every tablet puts everyone in the same spots.
- **Bad guys guard their donuts.** Tap a shelf with a bad guy standing in front of it and you walk
  up to the bad guy instead, and it shakes "no". Knock it out of the way and you grab a donut. Kick
  the dummy off the stage and it pops back in right in front of its donuts.

### Fixes
- **Syrup is easy to spot.** It's a darker, thicker syrup now, so you can see the sticky puddles on the
  waffle even on a small tablet. The waffle's holes, the top of the pancake hill and the cake stage's gumdrop
  hill are a little darker too, so an orange or green fighter stands out on them.
- **Matches start more reliably on tablets.** Pressing ▶️ sometimes left both tablets stuck on an empty
  stage with only the score showing. When the game is played from a computer at home (`serve.py`), it now
  loads over far fewer connections, so a match comes up every time. Playing from the website was already
  fine.
- **Matches come up faster, and you see ⏳ straight away.** After ▶️ the ⏳ shows at once instead of a
  blank screen. While it waits for the other tablets, your tablet already sets up the stage and your
  fighter, so the match starts sooner once everyone's there, and the first moment of play doesn't stutter.
  On the dress-up page the choices show up straight away, before your fighter appears.

## 0.0.3 — 2026-10-16: Combos, and playing together that holds

### Play together
- **Playing together is much more reliable.** Tablets stay connected from the lobby through every
  round, so starting a match and ▶️ for the next round no longer leave anyone stuck on ⏳.
  - A friend who taps 🔑 and the code while the host is still on ⏳ comes along into this match.
  - A friend who goes back to the lobby mid-match and types the code again is back in the match.
  - If the host's game reloads mid-match, everyone starts the round again together.
  - If a tablet's game reloads while its fighter was sitting (screen off), the fighter stands back up.
  - Opening the lobby or a match from an old link goes through 🍩👆 first, so it stays connected too.
- Your own fighter walks smoothly on every tablet, not just the host's: it no longer stutters and
  jumps when the Wi-Fi is busy.
- **Late friends play the next round.** Tap 🔑 and the room's code while a match is on: your
  fighter waits in the lobby with ⏳ (👋 to leave), and when the host taps ▶️ on the end card you
  come along into the next round.
- The room's code (🍩🧁🍪🍒🍓🍰) shows on the end card, the ⏸ card and the ⏳ card, so a late friend
  can find it.
- When time runs out, the score shows on its own first; tap 👍 (or anywhere on it) to get ▶️ and
  👋, with the room's code underneath.

### Fighting
- **Punches look like punches**, and every punch that lands on a bad guy, the dummy or a fort brick moves you along a string: jab, cross, uppercut, uppercut, and round again. A miss waits; only a pause of a couple of seconds starts you again at jab, so chasing a bad guy you knocked back keeps your string going.
- **Kicks come in twos**: a quick front kick, and once it lands, a big movie-style thrust kick: the fighter throws its whole body way back, arms and head flung behind, and lunges in foot-first. Then round again; a miss waits, a pause starts again.

### Fixes
- A fighter whose bag is full shakes its head again when it tries for another donut.
- Fighters' legs keep up when they run: no more feet skating along under a gliding body.
- **Brighter colours, as you picked them.** Fighters, treats and sprinkles were coming out washed out
  and pastel. Now loud colours like hot pink stay hot pink, and the colour buttons on the fighter
  screen match the 3D fighter.
- The colour buttons go in rainbow order, and no two look alike any more (the two blues and the two
  pinks moved apart). A colour you already picked moves to the nearest new one.

### Buttons
- 👍 means "done, next" everywhere: the fighter chooser's ✅ is now 👍.

## 0.0.2 — 2026-10-15: Play together

### Play together
- **Play a match together.** In a room, the tablet that opened it (🏠) has ▶️: tap it and every
  tablet in the room goes to the same stage, everyone a hero against the training dummy. ⏳
  shows while everyone arrives, with 👋 to go back. Only the host can start.
- Tablets find each other within a few seconds when a match starts, even when their clocks are a
  little apart and lots of tablets share one home Wi-Fi.
- Each tablet's camera follows its own fighter.
- ⏸ on the host pauses everyone. Leaving the screen on the host pauses everyone too; leaving it
  on another tablet makes that fighter sit down until you're back.
- If the host leaves, everyone else sees 🏠💨 and 👋 back to the lobby.
- When time runs out, the end card shows on every tablet; ▶️ on the host plays again together.

### Playing at home
- **Tap 🍩👆 to play.** The game starts with one big button: tap it and the game fills the whole
  screen, and stays that way from the fighter chooser to the lobby to the match. Add the game to
  the home screen to hide the browser's bars for good.
- Pinching and double-tapping no longer zoom the game. (Triple-tap zoom is a tablet accessibility
  setting; turn it off in the tablet's settings if it gets in the way.)
- Served from a computer at home, the game needs its `https://` address so tablets can find each
  other; the first time, each tablet asks you to trust it once. An old `http://` link goes to the
  `https://` one.

### Small tablets
- The score and clock are much smaller, and the 🥊 🦶 ⏸️ 👋 buttons shrink to fit small tablets.
- The end card and pause card shrink to fit a small tablet turned sideways.

### Stages
- **Two stages, breakfast and cake.** While there's no button for it, pick one in the address:
  `play.html?stage=breakfast` or `play.html?stage=cake`. Plain `play.html` is still the practice
  stage where you break into the bad guys' fort.
- **Surprise stages, for testing.** Add `&seed=` with a number, and `&difficulty=1` to `5`, for a
  made-up stage (for example `play.html?stage=cake&difficulty=3&seed=8`): walls, gaps, syrup and
  hills laid out fresh from the number, the same stage every time for the same number, and fair
  to both sides. Higher difficulty adds narrower gaps, choke points and a higher deck. Surprise
  stages never put a donut somewhere you can't reach.
- The bad guys' wall in practice now goes all the way across and is too tall to jump: punch or
  kick a brick out of it to get to their shelf.
- **Butter is slippery.** On breakfast, step on a shiny yellow butter slick and you slide: it's
  hard to stop and turn, and you skid past where you tapped, then come back.
- **Cake is bouncy.** Every jump on cake goes half as high again, and you squish when you land.
- **Icing trampolines.** Bright blue icing pads with a pink rim on cake launch you way up when
  you step or land on one, and squash when they do.
- **A crazy tall cake stage,** with high decks you can only reach with a cake jump and a giant
  gumdrop tower in the middle you can only get up by bouncing off the trampoline in front of it.
- The butter and syrup that were only painted on the pancake hill are gone, so any butter you
  see is real and slippery.

### Fixes
- The hit wobble no longer goes glitchy-fast late in a round, or as a fighter calms down.

## 0.0.1 — 2026-10-14: Fun to hit, one tablet

### Choose a fighter
- Pick a lion, a llama or an owl, then its fur from twelve loud colours.
- Dress it in a hat, a cape and a bag, each in your own colour, and pick your boxing gloves.
  The owl wears its gloves on its wing tips.
- Tap the hat or cape you're already wearing to knit it in a new stitch: rib, garter, cable,
  crochet, waffle or lace.
- 🎲 makes a surprise fighter. Your fighter is saved as you go, with no save button.

### Lobby
- 🏠 opens a room with a four-treat code; 🔑 joins one by tapping the code in. Everyone in the
  room stands together on the floor.
- **Games stay in your home.** Tablets only play with other tablets on the same home Wi-Fi, and
  your fighters and games are never sent anywhere else. The internet is used just to load the
  game and to pass a scrambled hello so your tablets can find each other.

### Practice
- ▶️ in the lobby plays by yourself against a training dummy on a breakfast stage you can walk
  all around: across the waffle floor, toward the camera, away from it, and up onto the stacks
  of waffles and the big stack of pancakes in the middle.
- You can't walk through bad guys any more: bump into one and you shove them aside.
- Sticky syrup puddles slow you down.
- Falling off a waffle stack, you keep facing the way you walked off instead of spinning round. There's one in each gap around the bad guys' wall: wade
  through, or smash the wall instead.
- The more hits a fighter takes, the more it wobbles, and the further your next hit sends it.
  Knock a really wobbly one off the stage to spill its donut. Leave it alone for a few seconds
  and it steadies again.
- Tap where you want to go, 🥊 to punch and 🦶 to kick. Hits land with a BAM, a little freeze and
  a wobble; knock down the bad guys' wall of pancake stacks, stuck together with purple whipped
  cream (they burst into sprinkles), or find the gap in it.
- Grab a donut and it flies into your bag. Steal one from the bad guys' shelf for a happy dance, then run it home for
  confetti. Your bag holds one donut: try for a second and your fighter shakes its head.
- ⏸ pauses the game, clock and all; ▶️ plays on. Leaving the screen pauses it too, and the screen
  stays awake while you play.
- When time runs out, a card shows who has more donuts and gives the winners a 🏆, with ▶️ to play again and 👋 back to the
  lobby.
