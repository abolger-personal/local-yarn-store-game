# To do

- [ ] **0.0.8: the other dances and gymnastics as moves** (added 2026-11-04). The wuxia sweep worked (playtest:
  "fun and entertaining", the sweep "a success"), so the rest of the dance lab comes into the fight the same way:
  each a discoverable move, always unlocked, with a job, a way to do it, and its own look (REUSE-SPEC.md
  §Discoverable moves). Ideas: the round-off or back tuck as an escape that backs you up, Uptown Funk as a taunt,
  the Biles passes as big committed moves. Also: curved paths for trick shots (lob, bob, wave, spiral, one homing),
  knockdowns beyond the sweep, and a tutorial for each move.
- [ ] **Art pass: characters that look alive** (added 2026-11-04, from Audubon's Carolina Parrot plate). In a side-on
  fighter they look vacant ("drugged"). First: heads that turn to the camera when idle and to the foe when fighting,
  pupils leading; a glint in each eye. Then a contrasting ring round the eye, one hot accent colour around the face,
  and patterning as one shared texture. Judge from the match camera in the species checker before the game.

- [ ] **Twenty levels: four areas of five** (added 2026-11-03). Breakfast is the five-level tutorial area and
  has four; it needs a fifth, and three more areas need choosing and building. REUSE-SPEC.md §Forts, near
  "The breakfast stage is the tutorial stage". Every area's fifth level (5, 10, 15, 20) is a boss; ideas
  (bigger, another species, a boss who fights with the recorded dances) in the bullet before it.

- [ ] **A power that turns bad guys into weird objects** (added 2026-11-03). The rules and open
  questions are in REUSE-SPEC.md §Power moves. The sim side is built (`TOY` in sim.js, `toy` in the
  snapshot); the objects aren't drawn yet.
- [ ] **Earned tricks** (added 2026-11-03). Tricks are earned by beating levels, like weapons, once for every
  weapon they're on, about one a level; a new one gets a big pop-up on the end card and opens the chooser on the
  trick row with it picked. A first order and open questions are in REUSE-SPEC.md §After the lobby.
- [ ] **Dances for the kids** (added 2026-11-03). Pure celebration, done in the 3 s after a ring-out. The move
  that rang them out teaches its dance (punch: floss, kick: attitude, stomp: riverdance, Greathammer: Hammer
  Time, spin: pirouette, a toy: I'm a Little Teapot, and more). Needs `move` on the ring-out event. The weapon
  disappears while dancing (gloves show). REUSE-SPEC.md §After the lobby.
- [ ] **Tricks that steal donuts** (added 2026-11-03, brainstorm). Some tricks let a hit take a donut: straight
  into your bag (pickpocket), popped toward you instead of away, floated to you in a bubble, knocked off the
  enemy shelf by a trail, or fetched back by the thrown Greathammer. To decide: which tricks, on every hit or
  only some (a string's last punch, a stomp), whether bad guys can, and whether shelf swipes get round the guard.
  Fits "no status effects": it happens at the hit and leaves nothing behind. In REUSE-SPEC.md §Power moves.
- [ ] **Effects on the stomp's spin and backflip** (added 2026-11-03). Pressed on the way up a stomp
  spins (a jump kick), on the way down it backflips; every tablet knows which and how far round from
  the snapshot (`turn` and `step`, play.js `stompTurn`), so effects need no new sync. Tricks today
  ride a fist or a blade tip; these need effects that ride the body or the floor. To work out:
  - **Spin:** a ring of the trick's bits round the waist that whips round with the turn.
  - **Backflip:** a trail off the feet drawing the flip's circle in the air.
  - **The dive and landing:** speed lines while diving, a ring across the floor where it lands.
  - **Whose effect:** the fighter's chosen trick, so a glove or sword trick has a stomp version, or
    one effect for everyone.
- [ ] **A tutorial for each discoverable move** (added 2026-11-04). Moves are never unlocked; every fighter has them,
  and a tutorial shows how to do each (first: hold 🦶 and let go, the sweep). REUSE-SPEC.md §Discoverable moves.
