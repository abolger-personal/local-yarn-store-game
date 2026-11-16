# Changelog

What's new in Turtles in Twine: The Sweater's Revenge, the Teenage Mitten Knitting Turtles' co-op side scroller, the
L.Y.S. spinoff's spinoff.

## 0.0.3

### The playground
- **The whole pizza shows.** A spinning slice was half hidden behind its own starburst. Not any more.
- **A bridge that tips you off.** Run across and you're fine. Stand around on it and after four sways it tosses
  you off onto the ground.
- **Smaller slices.** The pizza slices to find, and their sparkles, are a bit smaller.
- **No more flicker.** The orange and green spots on the ground don't flash blue any more, and pieces that
  stand side by side don't flicker where they meet.
- **A fairer Sock Clan.** A soldier who knocks you down waits till you're up and lets you get away, instead of
  punching you again and again against the back fence.

### Choosing your hero
- **Quicker 🍕.** Flipping through the ready-made heroes is faster, and coming back round to one you've seen is
  instant. The chooser opens a little sooner too.

### Build my playground
- **Make your own playground.** Tap the 🔧 next to the level numbers. Drag swings, slides, bridges and climbing
  frames onto the ground and they snap into place. Then press ▶️ and play it. Your playground is saved on your
  tablet.
- **Every piece in your colour.** Tap a colour, then drag a piece on, or tap one that's already there to repaint
  it. Tap a piece and press 🗑️ to take just that one away.
- **Monkey bars.** Walk off the step to swing across, or jump up and walk along the top. They're in the
  playground levels too, with pizza hanging under the middle.
- **Oops-proof.** ↩️ takes back your last change, even ♻️ start again, so a playground cleared by mistake comes
  back.
- **Build, play, build.** While you play your playground, tap the 🔧 to go straight back to building it.
- **Arrows for more pieces.** ⬅️ and ➡️ flip through the pieces, no tiny scroll bar to grab.
- **Clearer pictures on the pieces.** The monkey bars, the bridge, the bars and the bear cave each look like
  themselves now.

## 0.0.2

### The playground
- **Level 3: the Sock Clan.** A soldier guards the pizza after every climbing frame and comes for you if you get
  close. Knock it out of the playground and it tumbles over the back fence, where it stands looking sad for two
  minutes before it's allowed back. Watch out: its punch can knock you out too, back to the start.
- **Get the giant pizza.** It's right in front of the gate now. Walk into it on your way out and it's yours: eight
  slices at once.
- **Pizza comes back.** A slice you ate is back in its place 20 seconds later, so you can stay and play.
- **Tap the pizza to go for it.** Tap a slice while you're on a swing or a bar and you fly right through it. On
  foot, your hero walks under it and jumps for it.

### Heroes
- **A smoother chooser on tablets.** Turtles are much lighter to draw.
- **The Sweater hides more of its face.** Its scarf wraps up to its hat, so only the tops of its eyes show.
- **The mask keeps its colour.** Take a turtle's scarf off and the mask matches the hands, not purple.

## 0.0.1

### The playground
- **Jump forward.** Hold an arrow and press Space, or double tap a spot, to jump toward it. Do it again in the air
  for a double jump, and steer while you fly.
- **Dismounts off the bars and swings.** Tap where to go, then press 🥊 and 🦶 as the turtle spins round and takes
  off. Different buttons give different Simone Biles dismounts, with "Cowl-a-bunga!" across the screen. Press
  nothing and you just land.
- **Find the pizza.** A sign at the start points the way, and a giant glowing pizza waits at the end. Pizza slices
  hang in the tricky spots along the way: halfway down the slides, on the wobbly bridge, at the top of the fire
  pole, and up in the air past the bars and swings.

### Getting in
- **A splash screen** (`tmnt/`): the logo, knitted TURTLES on a silver ball of yarn, with 🐢👆 under it. Tap it and
  the game goes fullscreen and stays there from screen to screen.

### The heroes
- **A hero chooser** (`tmnt/choose.html`): pick an animal, its fur, a scarf, a sweater, socks, a bag, face paint and
  a weapon, by pictures, no words needed. No hats or capes this time.
- **Six presets, 🍕 to go through them:**
  - **Leonardo** (blue), straight-laced: a trailing scarf, high boots, a drawstring bag.
  - **Donatello** (purple), nerdy: black-rimmed glasses, a cowl and a fanny pack.
  - **Michelangelo** (orange), happy-go-lucky: an open scarf, short socks, a backpack.
  - **Raphael** (red): red over-knee socks.
  - **April**: an orange llama in a yellow jumpsuit and white boots, with a heart on her cheek.
  - **Master Splinter**: an orange mouse in a red vest.

  All four turtles start in their masks, Donatello's glasses over his.

  A first visit gets one of the six; after that the page opens on your saved hero. 🎲 still makes a random one.
- **The weapons are craft tools:**
  - **Leonardo:** comically large safety scissors, a half in each hand, crossed in front of him like his katanas.
    They uncross out to the sides when he punches, so they don't cut through him.
  - **Raphael:** a pair of knitting needles, for stabbing.
  - **Donatello:** a bo staff that is a giant drop spindle, with yarn wound on it in his colour.
  - **Michelangelo:** two balls of yarn on a strand, which swing and fling out when he punches.
  - **April:** a giant microphone, swung like the Greathammer, throwing stars.
  - **Master Splinter:** a giant crochet hook for a cane, hanging down to the floor like a walking stick.
  - Plus the boxing gloves. The fighting game's sword, scythe and hammer stay in the fighting game.
- **Faces:** a mask round the eyes in the scarf's colour (narrow on a turtle), a heart, or black-rimmed glasses.
- **The hero turns all the way round** on the chooser, so you see the shell, then back the other way.
- **The logo** (`tmnt/logo.svg`): after the 1987 cartoon's, *Teenage Mitten Knitting* on a red banner, **TURTLES**
  knitted in green, on a giant silver ball of yarn. Not on a page yet.
- **A mouse**, the sixth animal: the lion with big round ears instead of a mane, and a bare tail.
- **The hero colours** are the turtles' four (orange, blue, purple, red), turtle green, taxi yellow and white for
  clothes. Black and silver are for bad guys only.
- **Sweaters read as sweaters when small:** tap the one you're wearing again for stripes, checks, fair isle and the
  rest, in the hero colours.

### For the designer
- **The plan is in `tmnt/REUSE-SPEC.md`:** the names, the Sock Clan and The Sweater, up to 5 players all on one team,
  the fighting game's rooms and lobby kept (with ☎️ 📼 👾 💾 🕹️ 📟 for the room code), and what's still open.

### Under the hood
- **Saves are kept apart:** the hero is `tmnt.hero.v1`, so it never overwrites a donut fighter on the same site.
- **Shared with the fighting game:** the chooser's pictures (`spinoff/icons.js`), and a fighter's build can now wear
  a scarf, sweater and socks and hold the heroes' weapons. Donut fighters look and play as before.
- **Checked by `tmnt/hero.test.mjs`:** the presets, what a save or another tablet can and can't set, every piece on
  every animal, and how each weapon hangs, crosses and swings.
