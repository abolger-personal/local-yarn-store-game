# Changelog

What's new in Turtles in Twine: The Sweater's Revenge, the Teenage Mitten Knitting Turtles' co-op side scroller, the
L.Y.S. spinoff's spinoff.

## 0.0.1 (in progress)

### The heroes
- **A hero chooser** (`tmnt/choose.html`): pick an animal, its fur, a scarf, a sweater, socks, a bag, face paint and
  a weapon, by pictures, no words needed. No hats or capes this time.
- **Six presets, 🍕 to go through them:**
  - **Leonardo** (blue), straight-laced: a trailing scarf, high boots, a drawstring bag.
  - **Donatello** (purple), nerdy: a cowl and a fanny pack.
  - **Michelangelo** (orange), happy-go-lucky: an open scarf, short socks, a backpack.
  - **Raphael** (red): red over-knee socks.
  - **April**: an orange llama in a yellow jumpsuit and white boots, with a heart on her cheek.
  - **Master Splinter**: an orange mouse in a red vest.

  A first visit gets one of the six; after that the page opens on your saved hero. 🎲 still makes a random one.
- **The weapons are craft tools:**
  - **Leonardo:** comically large safety scissors, a half in each hand, crossed in front of him like his katanas.
  - **Raphael:** a pair of knitting needles, for stabbing.
  - **Donatello:** a bo staff that is a giant drop spindle, with yarn wound on it in his colour.
  - **Michelangelo:** two balls of yarn on a strand, which swing and fling out when he punches.
  - **April:** a giant microphone, swung like the Greathammer, throwing stars.
  - **Master Splinter:** a giant crochet hook for a cane, hanging down to the floor like a walking stick.
  - Plus the boxing gloves. The fighting game's sword, scythe and hammer stay in the fighting game.
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
