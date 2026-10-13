# Store visit POC — what is real, what is a placeholder

Covers `characters/store.html` (page shell) and `characters/store/**` (scene, sim, goods, interact), plus `characters/visit.js` (pure sim, `visit.test.mjs`).
Written at the end of the session that built them, so the next session does not have to
re-discover which parts are load-bearing and which are scaffolding.

Run it with a static server (module imports need http, not `file://`):

```
python3 -m http.server 8899      # from the repo root
open http://localhost:8899/characters/store.html
node characters/visit.test.mjs   # the headless self-check
```

---

## Built and working

- **The round loop.** BROWSE then CLOSEOUT, manual advance, prescriptions honoured, MAX_ROUNDS.
- **The 10 personality assets**, exact names from CHARACTER-ATTRIBUTES.md, 1-5, driving MAX_ROUNDS,
  the approach-another-NPC chance, the wait-to-keep-chatting chance, and which display
  restructuring an NPC performs.
- **Physical door entry, one at a time.** A single-occupancy lock, taken by arrivals *and*
  departures, so a queue can actually form outside. Nobody may loiter within `doorClearance` of it.
- **Target formations** — one notion each: a crochet hook in a specific size, or stitch markers
  with no size attribute. **Hook size is printed on the box's top face as well as its side**, since
  the game looks down and a number only on the side is invisible in play — that number is what makes
  size arrangeable.
- **Displays in the same room as the NPCs**, both DISPLAYS.md types (wall shelf, table pile),
  sharing one uniform grid pitch. Count is a live dropdown over an authored pool of 6 positions,
  including shelves turned 90° against the side walls.
- **Seating.** Working on a WIP requires walking to a free chair first — an NPC knitting in the
  middle of the floor read as a bug, and doing it in front of a display blocked the display. Seats
  are exclusive, released implicitly by doing anything else, and the count is a dropdown (0-6).
- **NPCs never end a round standing inside each other** — pairwise relaxation against
  `personalSpace`, with the room bounds and the doorway applied as constraints inside the loop.
- **A bought notion is visible in the hand** — a real mesh on the rig's hold node, oriented to the
  hand rather than the camera, per `inventory/DESIGN-DECISIONS.md` §4.
- **Cutaway walls.** Any wall the camera is outside of is hidden, so you always look *into* the
  room and never at the outside of a box; the camera is fenced above the floor so the cutaway can
  never expose the underside of the set. Verified over 25,800 camera positions: never fewer than
  2 walls visible.
- **Pick and place**, the player's only verb. Left-click to pick up, click again to set down;
  right-drag orbits. Hovering a different display re-targets the hold with no keyboard step;
  `[` `]` change shelf level, `Tab` cycles display. Ported from `stash-and-stuff.html` keeping its
  recorded decisions (never raycast items — cast the slot plane and index the column in O(1);
  click-to-pick rather than press-and-hold; pick against the card's height, not the floor).
  Generalised to N displays at arbitrary yaw, which needs no special case: every display's frame
  rotates about Y only, so all slot planes stay horizontal and one code path serves them all.
- **Multi-cell packages.** Notions ship in 1×1, 2×1, 1×2 and 2×2 boxes, per kind. Two rules had to
  change to accommodate them, both now pinned by tests:
  - A package straddling a shelf's wall row is **not** hidden — part of it reaches the outside face.
  - `fullyExposed()` replaces the old anchor-cell check. A package bridging two columns can have
    something stacked on just one half; it is then still the "top" of its other column, so an
    anchor-only test called it exposed. That mattered twice over — NPCs could buy a half-buried box,
    and the player's `lift()` (which pops every column the footprint covers) silently evicted
    whatever was resting on the covered half.
- **Piles actually pile.** Stock is seeded onto shared anchor columns so real towers form. Previously
  `addItem` took the first cell that FIT, spreading one item per cell, so nothing ever stacked no
  matter how much headroom a display had — which is what made piles look capped. Pile headroom is
  now the spec's 10; a shelf stays at 3 because its stack is physically stopped by the glass above.
- **Floor piles** (`form: 'floor'`) alongside table piles — same DISPLAYS.md type A mechanic, no
  plinth, distinguishable via `form` for when NPCs should treat them differently. Not to be confused
  with LYS.md §5b's unslotted delivery inbox.
- **Labels on all four sides plus the top**, with the size number under each. Four faces share one
  instanced mesh at 4× capacity (`index*4 + k`), so this costs no extra draw call over the
  single-sided version it replaced.
- **A held item leaves the simulation**, not just the grid. `available()` in `visit.js` excludes it,
  so an NPC cannot tidy around it, stack onto its column, or buy it out of the player's hand. If an
  NPC fills the column it came from while it is held, dropping it falls back to the first free slot
  rather than floating above a full stack.
- **Perf overlay** copied verbatim from `crowd.html`, so numbers are directly comparable.
- **Debug window** (per-NPC state, traits, action, prescription, seat, log) and **round/timer
  window** (manual advance, optional 30s auto, in-game clock, who holds the door).

Soak results, 400 seeds each, all terminating with no invariant violations — no overlap at rest,
nobody in the doorway, no seat double-booked or leaked:

| layout | visits | longest | bought target |
| --- | --- | --- | --- |
| 2-4 NPCs, 2 chairs | 1200 | 20 rounds | 57% |
| 8 NPCs, 6 chairs | 3200 | 25 rounds | 50% |
| 2-4 NPCs, **0 chairs** | 1200 | 20 rounds | 67% |
| 6 NPCs, all max sociability | 2400 | 30 rounds | 79% |

> Note the 0-chairs row buys *more*. Seats are a genuine competitor for rounds: an NPC who sits
> down to knit is an NPC not browsing.

---

## Moving the shop — DISPLAYS.md rule 10

Press **M** (or the `move displays` checkbox) to switch the pointer from arranging *stock* to
arranging the *shop*. Furniture moves the way stock does — click to pick, click to place, not
press-drag-release (DESIGN-DECISIONS.md §7: holding the button down the whole move is hard on the
hands). Click a display **or a chair** to pick it up; it follows the pointer, and a second click
sets it down and leaves it selected. The turn buttons or **Q/E** turn it 45°, in hand or selected.
A footprint shows green where it may land and red where it may not; a blocked click puts it back
where it was picked up, as stock goes home. **Escape**, leaving furniture mode, or a new day put a
piece in hand back too. Pressing bare floor empty-handed deselects (and orbits).

On touch there is no hover between taps, so it follows stock's aiming press: tap the piece, then
press where it should go — it jumps there, slide to adjust, lift to set it down. Every press while a
piece is in hand is the player's, so a one-finger orbit cannot steal it; a press-drag-release
still works too, as a drag and drop. A mouse leaving the canvas (for the turn buttons) leaves the
piece where it was rather than carrying it to the floor underneath them.

Chairs move by the same verb as displays. Rule 10 only names displays, but having one of the two
things standing on the shop floor be immovable reads as a bug rather than as a rule.

The rotate handles are HTML, positioned each frame by projecting the selection (`tickRotator`),
rather than scene geometry: the browser does the hit-testing, they stay a comfortable 40px however
far away the camera is, and they cost no raycast. They call the same `rotateMovable` as Q/E, so the
touch path cannot drift from the keyboard one.

The restrictions are enforced in `constrainPose`:

| Type | Constraint |
| --- | --- |
| Every display | Clamped inside the room by its slots' reach, so it can never be carried through a wall. |
| Wall shelf | Free in XZ, 45° detents — against a wall or free-standing, back to back with another. Its back panel is its wall. |
| Floor pile | Stays on the floor — its plinth height is 0 and the move path never touches Y. |
| Table pile | Free in XZ, 45° detents. |
| Chair | Free in XZ, 45° detents, clamped inside the room. |
| Peg board | Would have to snap to a wall, at wall height. Deferred with the rest of type C. |

"All Inventory will stay with the move" needed no code: an item's world matrix is composed against
its display's `frame` every time it is painted, so moving the frame carries the stock.

Still open here:

- **Slot holes are re-cut on landing** (`remaskDisplay`), so a shelf carved to fit beside the
  counter gets its cells back when it moves away. `remask()` refuses to revoke an *occupied* slot,
  which is what makes that safe — but it means a display shoved somewhere awkward can keep a cell
  it "shouldn't" have, purely because something is standing in it.
- **Off-axis cells are tested by circumradius**, not a real OBB. At the 45° detents that refuses
  placements which would just barely have fitted. Conservative, never wrong the dangerous way.
- Any wall standoff must come from `WALL_INSET` itself; a separate gap constant once made every wall
  refuse a flush shelf.
- **NPCs follow a display they are standing at** (`followDisplay`) but are not re-separated until
  the next round, so two customers can briefly overlap after a move.
- **A chair snaps to a 45° detent the moment it is grabbed**, losing its authored decorative angle
  (`chair-a` is at 0.62π). That is the price of one rotation rule for everything the player moves
  instead of two. If the authored angles turn out to matter, the fix is to snap only on an explicit
  rotate, not on a move.
- **A chair is tested against a display's whole rectangle**, not its usable slots, so it cannot tuck
  into a notch the counter carved out of a display. Displays get the finer test because they are the
  ones that come out funny shapes.
- **No undo.** Restart (R) is the only way back to the authored layout.
- **The player can wall a customer in.** `findPath` finds no route and falls back to a straight
  line, so the customer walks through the ring.

---

## The closeout, after the spec update

CHARACTER-VISIT.md changed two of the three steps, and both are implemented:

- **Signing always leaves an entry.** `world.guestbook` is real data now, one entry per visit. With
  a finished object it is a photo of them holding it; without one it is a note reading **happy**
  (they are carrying their target) or **disappointed** (they are not). Shown in the debug panel.
- **The Drop Off is conditional** on having a finished object to lend. The step no longer exists in
  the sequence otherwise, rather than being skipped at runtime — `closeoutFor(npc)` builds it.
- **Lending removes the object** from the NPC. It is a loan to the shop, so `world.dropOff` records
  it and `npc.finished` loses it.

Two things that needed deciding to make that work:

- **The closeout plan is frozen when closeout begins**, not recomputed each round. Lending empties
  `npc.finished`, and a recomputed plan would drop the Drop Off step out from under the NPC
  mid-sequence, leaving them with no step to take. Caught by the tests.

---

## Reading a visit from the outside

The player's only read on whether a customer found what they came for is what they walk out
holding. Three things had to be true for that to work, and one of them was broken:

- **Nobody enters carrying.** `holdItem` defaults false and is not in the randomiser's range table.
- **They carry the package, not a picture of it.** `makeHeldNotion` builds a small box at the
  shelf's own dimensions (`CELL * FILL` by `BOX_H`) with the notion on its top and front face and,
  for a hook, the millimetres — so what walks out of the shop is recognisably what came off the
  display. It was a bare 0.12 illustration card, which at diorama distance and seen edge-on read as
  nothing at all. Still oriented to the hand rather than camera-facing, per DESIGN-DECISIONS.md §4.
- **The held item is hideable.** It was not: the rig hid its placeholder skein correctly, and then
  `mergeCharacter` lifted that skein's meshes *out* of the hidden group and re-parented them into
  the always-visible joint, so every NPC walked in holding one and `.visible` had no effect. Fixed
  at the root in `staticMeshes` — a subtree flagged `userData.noMerge` is not static however much
  it looks like it. Any future toggleable attachment (a hat, a tote) inherits the protection.
  Belt and braces on top: `tickCast` now forces `built.held.visible = false` every frame,
  unconditionally. The rig's skein has no legitimate use in this game — a customer carries the real
  package or nothing — and relying on the pose to keep it off is what let it show, since `carry`
  and `walk+carry` both set `holdItem: true`.

> The HUD carries the `BUILD` stamp from `npc.js`. If a fix appears not to have worked, check that
> first: the page may be running an older module than the one on disk.
- **Buying is legible.** See the delight placeholder below.

---

## Yarn, patterns, WIPs and finished objects

The new specs are implemented. Three new pure modules, all node-testable:

| File | What it owns |
| --- | --- |
| `inventory/catalog.js` | What the shop sells: yarn, patterns, notions, and the shop's RANGE |
| `characters/wip.js` | WIP slots, the shopping list, the progress formula, wearing and lending |
| `characters/wip.test.mjs` | Self-check for all of the above — `node characters/wip.test.mjs` |

**Buying is now a two-round beat.** DISPLAYS.md's consideration rule means an NPC picks a thing up
in one round and decides in the next ("bought if it was considered in the previous round AND the
consideration came back true"). MVP: 100% of considered items are purchased.

**What an NPC shops for is now a property of their projects,** not a hardcoded target notion.
`MatchObservedInventory(npc, items)` answers for a whole shelf at once, per the spec's own naming.
The match is strict, and deliberately independent of personality or preference:

| WIP state | Wants | Matches on |
| --- | --- | --- |
| no pattern | a pattern, and nothing else | any pattern — or, if holding yarn, one whose weight and material suit it |
| pattern, short of yarn | yarn | material in the pattern's list AND the pattern's weight |
| pattern, wrong/no tool | that tool | the craft's tool kind AND the pattern's exact millimetres |

A WIP with yarn but no pattern generates **no tool want at all**, per the spec.

### Decisions this forced, which are worth a look

- **The shop needed a RANGE** (`SHOP_RANGE` in catalog.js). This is a balance decision, not a spec
  rule, and it is load-bearing. Measured against uniformly random stock, the chance one shelf item
  satisfies a given want is **0.9% for yarn and 0.5% for a tool** — roughly 117 and 192 items
  before one fits, where a display holds about twenty. Nothing would ever get made. Drawing both
  the stock and the NPCs' own patterns from a curated 4x4 palette lifts that to **3.4% and 1.5%**.
  It is also just true of a real yarn store: a curated range, carried deeply.
- **A finished object leaves the WIP slot — but WHEN depends on where it goes.** A WIP slot is a
  limited resource (`maxWips`), so an object cannot sit in one forever; finishing has to give the
  capacity back. Worn objects leave immediately ("store FO in a worn slot" is a move). Objects
  being **lent leave at the Drop Off**, which is 2nd-to-last — *after* signing, which is
  3rd-to-last. That ordering is the point: the NPC is photographed for the Guestbook still holding
  what they made, and hands it over on the next step. Getting this one step early is an easy and
  invisible mistake, so `visit.test.mjs` walks the three closeout rounds and asserts the object is
  still in its slot at signing time and gone after the Drop Off.
  **Nothing refills a freed slot**: an NPC who finishes mid-visit has capacity for a new project
  and no way to start one. That is the natural home for a "cast on something new" action.
- **`stow` refuses a null want** rather than filing an item into the nearest slot. A wrong guess
  there puts a hook in the yarn slot and is invisible until a WIP will not start.

### Still open here

- **`minColors` is unenforced.** It is a property of the whole yarn collection, not of one ball, so
  it cannot live in the per-item match. It wants a completeness test over `wip.yarn`.
- **The match is strict by design and flagged as loosenable** — the spec says "we can make this a
  messy match later if we want". That is a change to one function, `yarnSuitsPattern`.
- **Two regressions this session's work introduced, both now fixed and guarded:**
  - *Yarn rendered as flat slabs.* A super-bulky ball got its 3x3 footprint but `place()` only ever
    occupied one layer and the box was always `BOX_H` tall, so it drew as a 0.6 x 0.6 x 0.055
    pancake covering most of a table. YARN.md is 1x1x1 to 3x3x3 — the height scales too. `grid.js`
    now takes a `layers` count: `place` fills every layer an item is tall, `lift` pops all of them,
    and `fits` checks the whole height against headroom. Mutation-tested three ways.
  - *Notion art went blurry.* `extendAtlas` was scaling the loaded sheet UP to fit a 128px
    placeholder row, resampling every existing illustration. It now draws the source at native size
    and fits the new row to it.
- **Returning visitors — and they are what makes Finished Objects happen.** An NPC who buys
  anything or actually works on a WIP is marked for return and joins the shop's regulars;
  `rejoin(npc)` brings them back as themselves — same traits and preferences, same crafter skill
  including any +1 they earned, same WIP slots at the progress they left them at, still wearing
  what they were wearing. Only visit-scoped state resets (and DISPLAYS.md rule 9 says the
  restructure budget is one of those, so a regular may tidy the same display again).

  Measured over repeated days on the same shop, comparing with and without the roster:

  | Days | FOs with regulars | Without | Lift |
  | --- | --- | --- | --- |
  | 1 | 0.00% | 0.00% | — |
  | 3 | 3.33% | 0.14% | 24x |
  | 5 | 7.50% | 0.17% | 45x |
  | 10 | **23.54%** | 0.42% | **56x** |

  Day one produces nothing, which is correct: a 20-unit sweater is twenty rounds of *sitting*, more
  than one visit's rounds even before browsing. Nothing but a cowl could ever be finished in a
  single visit, which is exactly why the roster matters. It also supersedes the earlier note that
  "projects rarely finish" — they rarely finish *in one day*.

  `rejoin` lists every field it resets explicitly rather than rebuilding the NPC and copying a few
  back, because the dangerous failure is not a crash: it is a customer who quietly returns a
  stranger, with their skill or their half-knitted sweater silently gone. Mutation-tested four ways.

  The timer panel now has **two** checkboxes: `auto-advance rounds` paces the rounds, and
  `then roll into the next day` closes up and reopens once the shop is empty. They are independent
  on purpose — rolling the day is useful whether rounds are being advanced by the timer or by hand.
  `pause between days` (default 4s) holds the empty shop for a beat, because without it the
  changeover is a single-frame pop and you cannot see who left with what. The Advance button
  becomes "start next day" when the shop empties, so a manual player is never stuck on a disabled
  control. Day number shows in the timer panel; "all new customers" resets it to day 1, since
  wiping the regulars means there is no history to count.

  Still open: the roster is unbounded and unordered (everyone who qualifies comes back, oldest
  first, up to the NPC count) and lives only in memory. Who returns *when* wants to be a real
  scheduling decision, and it is the hook for LYS.md's day cycle.

- **Guestbook entries carry icon tags** from CHARACTER-VISIT.md's list: one mood icon (📷 photo, or
  🙂 / 🙁) plus tags for what happened — 🧶 📖 🪡 bought, ✨ lent, 🧑‍🤝‍🧑 chatted, 🪑 sat and worked,
  ⏳ ran out of rounds, 💨 left in a huff. Every one is read off state the visit already tracked, so
  the book cannot disagree with what happened. All ten fire across a 400-seed soak.
- **Pattern art is placeholder.** Procedural covers in `PLACEHOLDER_ART`
  (`characters/store/goods/art.js`). PATTERNS.md wants a box that reads as a BOOK. Yarn is real
  geometry now (`inventory/yarn-geometry.js`).
- **"Return borrowed FO to NPC" has no UI.** `returnToNpc()` implements it, including the displaced
  object landing in `world.backPile` "behind the guestbook", but nothing clicks it and nothing
  draws the back pile.
- **Craft preferences barely matter yet.** `prefs.materials` and `prefs.weights` are generated per
  CHARACTER-ATTRIBUTES.md and shown in the debug panel, but only `skill` and `crafts` feed any
  rule — because the spec is explicit that matching ignores preference. They want a home in
  attractiveness or in a satisfaction score.
- **The FROG PILE does not exist.** Post-MVP per the spec, and `WIP_STATE` deliberately has no
  `FROGGED` member rather than an unreachable one.

---

## Touch and small screens

- **Total inventory is a setting** (`total inventory`, default **100**). Customer seeds are placed
  first and count against the budget, then general stock fills the remainder — filling with random
  stock and then finding no room for anybody's yarn is the wrong way round. The console reports the split and says so if the shop had no room.
- **Rounds default to continuous.** Both timer checkboxes start ticked, the round interval is 4s
  (`12/k` at a game speed; just over the longest a staggered walk can take, so a round ends about when the motion does) and
  the pause between days is 0. At the old 30s the cast walked for ~1.5s and stood frozen for 28.
- **Grabbing was near-impossible on a tablet, and the measurement says it was bad everywhere.** A
  0.2-unit slot renders **12-20px** across at the framing camera once a diorama angle foreshortens
  it; Apple and Material both put the minimum touch target at 44px. The pick required the ray to
  land inside the item's own cell.

  There is now a **screen-space** grab radius (`grab slack (px, touch)`, default 44, halved for a
  mouse). Screen space is the point: the tolerance has to mean the same thing to a fingertip
  whatever the zoom, resolution or viewing angle. An exact hit still wins outright; failing that
  the nearest box centre within the radius is taken. Modelled against a 7px fingertip scatter,
  reachability goes from 13-58% to ~100%.

  **What it cannot fix:** on a packed shelf the boxes sit ~13px apart, which is closer than a
  fingertip is accurate, so ~42% of taps resolve to the box the player meant — and that is the same
  ~41% the strict test managed among the taps that hit anything at all. Slack is never worse, and
  on an isolated box (the common case at 10 items) it is 100%. The real fix for dense piles is
  making boxes bigger on screen — a closer default framing, or a zoom-to-display control.
- **The camera spun on touch. Two causes, both fixed; the first one I got wrong once.**
  1. *Ownership was signalled by rewriting `controls.touches.ONE`* from a capture-phase handler
     that runs BEFORE OrbitControls reads it. Replaced by withholding the event instead.
  2. *Withholding only the FIRST finger was not enough* — and this is why the spin survived the
     first fix. OrbitControls keeps its own `pointers` array built from the pointerdowns it
     receives. A second finger joining a player-owned drag still got through, so OrbitControls
     treated it as its *first* pointer, began a rotation from it, and its bookkeeping stopped
     matching the hand. Every later move measured against a start point for a finger that had
     already lifted, and a stale delta at damping speed is the view whipping round.

     Ownership is now decided once per GESTURE: the first finger decides, and while the gesture is
     the player's, *every* pointerdown is withheld until the last finger lifts. OrbitControls sees
     a whole gesture or none of it. The truth table asserts exactly that, in both directions — a
     player gesture leaks 0 of 3 pointerdowns, a camera gesture passes 2 of 2.
- **Two fingers PAN and zoom, they no longer rotate.** `TWO: DOLLY_ROTATE` was the default and it
  made every two-finger drag spin the room: dolly tracks finger SEPARATION while rotate tracks the
  midpoint, and separation is so much the more sensitive that a pan attempt reads as a spin. Now
  `DOLLY_PAN`, which is also what every map on a tablet does. Rotation stays on one finger over
  empty floor, and `screenSpacePanning` is off so the shop cannot be dragged off screen.
- **`frameRoom` now stands INSIDE the shop.** It used to fit the whole 6.4-unit room on screen,
  which is what made a slot 12-20px and no amount of grab slack could fix that. The distance is now
  solved FROM a target slot size (56px flat, ~34px foreshortened) rather than from how much room
  should be visible, clamped to the controls' range. Measured 1.6-2.9x bigger depending on screen,
  and it fixes the density problem the slack could not: on a packed shelf the intended box is now
  chosen **98%** of the time, up from 42%. Pinching out to see the whole room still works; the
  corner button is how you get back in.
- **Wall shelves are tilted 45 degrees**, Montessori-style: wall edge high, front edge low. A flat
  level is not so much hidden by the one above it as *foreshortened* — at the shop's camera
  elevation (35 degrees) a horizontal cell presents 58% of its area, which is what made a stack of
  three shelves unusable on a tablet. Tilted it presents 95%, so a cell is **1.64x bigger on
  screen**. 45 degrees is within 1% of the best angle available for this camera (55 degrees would
  be ideal), and past 60 it stops being a shelf and becomes a peg board.

  This needed a real refactor, not a rotation: a level used to be "the display frame, at
  y = shelf * gap", and a tilt cannot be expressed as a height. Each level now owns a **frame**,
  and painting, picking, the drop ghost, the grid lines and the furniture all go through it.
  `baseY(display, shelf, layer)` became `layerY(layer)` — height above the level — so a caller that
  forgets the matching level frame now gets an obviously wrong position rather than a subtly wrong
  one. Piles get an untilted frame, so nothing had to learn which kind it was holding.

  Three consequences worth knowing:
  - `SHELF_GAP` is now **derived** (`rows * CELL * sin(tilt) + 2 * BOX_H + margin`), because a
    tilted level eats vertical space and a constant is how levels end up intersecting the first
    time someone changes the row count. Checked: a full stack reaches 0.258u, the next level's low
    edge is at 0.311u.
  - **No plinth and no surface slab under a tilted shelf.** Both were horizontal boxes at y = 0,
    and the bottom level's front edge now hangs 0.141u below that — so each cut straight through
    the level it was meant to support. Removing them is also what the furniture actually is: a
    *wall* shelf is carried by its back panel, and a real one has nothing underneath. The back
    panel now runs from the floor to the top level and does the supporting. The low corner sits
    0.199u clear of the floor.
  - The shelf is **1.84u tall** overall against a ~1.0u customer. Tall for a person, normal for a
    shop, but it is the thing to revisit if shelves start blocking the view.
  - A tilted level takes up **less floor** than its grid is deep, so `applyTransform` and the slot
    mask both foreshorten it. Reporting the flat depth would fence off floor the shelf does not
    stand on — the sim routes NPCs around that box and rule 10 places furniture against it.
- **Two corner buttons** (bottom right, 48px each): reset the camera, and **lock** it. Locking
  disables OrbitControls outright rather than only rotation, because a pinch that dollies mid-drag
  is the same problem in another axis; the player's verb is untouched, since picking up and placing
  never went through the camera. Also on **L**, and latched in colour because it is a mode.

---

## Spec gaps found while building — these need a decision, not just code

1. ~~**Prescriptions have no termination bound.**~~ **RESOLVED, both in spec.** 22% of visits never
   ended before this; two prescription chains were unbounded, and both are now fixed in the specs
   rather than worked around in code.
   - *Re-tidying the same display every round* → DISPLAYS.md rule 9: an NPC may restructure a given
     display at most once per visit, after which interactions can only Buy or Look.
   - *"Wait a Round" prescribing another Wait* at `(Enthusiasm + Assertiveness)/10`, which is
     exactly 1.0 when both are 5 → CHARACTER-VISIT.md now specifies **/20** for this roll, capping
     it at a coin flip so the chat decays geometrically. The "Walk to closest NPC" roll stays /10;
     it is a one-shot and does not compound.

   > **Invariant to preserve: every prescription chain must be bounded.** A prescription outranks
   > MAX_ROUNDS by design, so anything that can prescribe itself needs either a hard cap or a
   > decaying chance. Re-check this before adding a new prescribed action.
2. **Display "attractiveness weights" are undefined.** CHARACTER-VISIT.md requires each display to
   carry "a meta 'attractiveness' list of weights to use against a particular NPC". The placeholder
   has the right shape (per-NPC, 0..1, thresholded at 0.5) but invented weights.
3. **Interaction outcome for "not complete" is ambiguous.** DISPLAYS.md says a tidy/spread
   "SOMETIMES" satisfies the buy condition afterwards. Currently it always resolves on the next
   interaction. What should "sometimes" actually depend on?

---

## Placeholders in the scene

- **The buy reaction is a placeholder.** `delighted` plus three decaying hops (`CELEBRATE_S`,
  `CELEBRATE_HOPS`, `HOP_H` in `store/sim/cast.js`), triggered the frame `npc.carrying` goes from null to
  something. Wants squash on landing and the ear perk timed to the apex. Delight outranks the walk
  pose, so an NPC who buys as they turn away stops to cheer rather than gliding out mid-celebration.

- **NPCs no longer walk through furniture.** `findPath` in `visit.js` builds a visibility graph over
  the corners of every display, chair and room solid, grown by a `PATH_CLEARANCE` berth, and runs
  Dijkstra over it; the renderer walks the resulting polyline at constant speed instead of lerping
  start-to-end, turning at each leg. Chosen over the grid A* DESIGN-DECISIONS.md asks for because
  the room holds under a dozen rectangles that the player can move at any moment (rule 10), so a
  graph over their corners needs nothing rebuilt when they do. Grid A* is still the right answer
  once there is real walkable geometry rather than a flat floor.

  Three things worth knowing about it:
  - **Endpoints inside furniture drop that obstacle.** That is how an NPC reaches a *chair* — the
    goal is inside the thing they are walking to — and how somebody escapes a display the player
    just dropped on them. Tested against the real box, not the berth: standing *near* a chair must
    not buy permission to walk through it.
  - **Endpoints inside the berth are nudged clear** before the graph is built. Without that, every
    ray out of them collides, they disconnect from the graph entirely, and the straight-line
    fallback walks them through the table the routing exists to avoid.
  - **A berth can seal a walkable gap** — a display parked a shoulder's width from a wall leaves a
    strip of real floor that 0.22 swallows whole. `findPath` retries at `TIGHT_CLEARANCE` before
    giving up, because squeezing past is right and walking through is not. The straight line
    remains the last resort: a customer frozen mid-shop with no explanation is worse than one who
    clips a table the player has deliberately boxed them into.

- **Separation is at REST only.** Two NPCs never *stand* inside each other and no longer stand
  inside furniture (`pushOutOfFurniture`, on a tighter radius than the routing berth so an NPC who
  has correctly walked up to a display is not shoved off it). They still pass through each other in
  transit: the sim resolves a round as a teleport and the scene interpolates. Steering during the
  walk is separate work.
- **Separation needed a tangential term.** Two NPCs pinned in the slot between two chairs are
  pushed apart along a line the furniture blocks, so the radial push cancels exactly against the
  push-out and the pair never separates however many passes it gets. Rotating the pair is the only
  escape from a collinear pin. It switches on only after progress stalls, and takes its sign from
  the pair's indices, so a seed still replays identically.
- **The Drop Off has no prop.** Signing is the `reach` pose at the guestbook; there is no signing
  animation of its own.
- **`maxWips` is computed and displayed but not enforced.**
- **No formation matcher.** An NPC's target is a per-item want from its WIPs. The real matcher is P3.
- **No destash.**
- **Visibility uses each display's rotated AABB, not its OBB, and the counter and props do not block
  sight.**
- **Two `paintInstance` functions**, `store/goods/paint.js` and `inventory/stash-and-stuff.js`. The
  matrices are shared in `inventory/notions.js`. The demo is experimental, so merge only if it stays.
- **Nothing rewards arranging yet.** Placement decides what an NPC can see and reach; no arrangement
  recipe pays off (P3).
- **Package footprints are authored, not derived.** `PACKAGES` in `store/goods/stock.js` lists the box shapes
  each notion ships in (1×1 and 2×1 for hooks, 1×2 for needles, 2×2 for marker tins). Like the size
  attribute, that belongs in the catalog schema at P6 rather than in a page.
- **No undo, no "put it back where it came from".** A misdrop is fixed by picking it up again.

> **Fixed, and worth not regressing: picking on a multi-level shelf.** The ported version tested
> only the *active* plane (default 0, the bottom shelf) with a single cast against the shelf FLOOR,
> while the player had clicked a box TOP — a ~0.11 unit parallax error, over half a slot, which
> often landed outside the lattice entirely. The two-pass refine meant to correct it only ran once a
> column had been found, so on a tall shelf it never fired. Every occupied column now gets tested
> against its own box-top height, across all displays and all levels, nearest hit winning.
> Measured over 7,320 clicks × 48 camera angles, excluding items a higher shelf genuinely hides:
> **44.6% correct before, 99.4% after.** The pointer now also *sets* the active level, which
> previously could only be changed from the GUI slider.
- **Rounds auto-advance by default** (`autoRounds`, 4s). Untick it for manual.
- **Dropping snaps; the drop feedback is per-display.** Three player-test findings, all touch:
> A drop used to demand the pointer land in a column the item happened to fit in. `nearestSlot`
> (grid.js) now takes the nearest slot within `S.snapCells` (1.6) that the item *actually fits in*,
> anchored on the footprint centre. Modelled against a 12px fingertip sigma on a part-full 5×2
> shelf: **83–86% of honest attempts landed before, 100% after**, and only 1–5% land on a neighbour
> of the intended slot. Reach is measured in the display's own plane, so it is a fixed number of
> slots at any zoom.
>
> A held item lifts along **screen up**, not the level's up. The level's up is nearly useless on the
> display that needed it most: a 45° shelf at a 35° camera elevation converts only `cos(80°)` of a
> world lift into screen rise, so the old 0.14 was worth **15px** there (69px on a flat table).
> `S.liftHeight` 0.30 along screen up is 84px everywhere. The shadow stays under the pointer.
>
> A display that cannot take the held item **anywhere** now says so: pointing at it washes the
> level red. Answered per item — a 3×3×3 super-bulky ball and a 1×1 hook get different answers
> about the same shelf.
>
> TODO: the wash paints the *active* level only, and the reach is a flat constant rather than
> scaling with pointer coarseness.
- **UI colour does not go through the tone mapper.** The warning red first shipped as `#a2382f`
and arrived on screen as maroon. The hex was not the problem:
> The shop renders through ACES at exposure **0.6** — a look chosen for felted wool, and ruinous
> for a signal colour, because the exposure halves the value in linear space before the curve even
> runs. `#a2382f` is delivered as `#640b0e`: **41% lightness down to 22%**. The old ghost green
> `#3f7f5a` fared worse, arriving at **17%**. No hex survives that, so every UI material now sets
> `toneMapped = false` and the colours can be plain: `GHOST_OK #25e06a`, `GHOST_NO #ff2d16`.
> Measured in `scratchpad/uicolor.mjs`, which ports three r160's ACES + sRGB encode exactly and
> also asserts the source keeps the flags — mutation-tested against re-tone-mapping each material.
>
> The held-item halo and the drop ghost now share `GHOST_OK` **by reference**, not by two matching
> hexes: the thing in your hand and the slot it is going into are two halves of one statement, and
> the player should not have to pair them up. Both nearly solid (`GHOST_ALPHA` 0.85); the halo
> pulses between 0.70 and 0.85 rather than fading to a hint. The red *wash* stays at 0.5 on
> purpose — it covers a whole display, and at full strength it hides the stock it is ruling out.

---

## Scale notes, for when this meets the real art

An NPC normalises to ~1.0 units tall, so everything is a fraction of a customer:

| | value | note |
| --- | --- | --- |
| slot pitch (`CELL`) | 0.20 | uniform across all displays — DISPLAYS.md rule 2 |
| one 2.5D layer (`BOX_H`) | 0.055 | |
| shelf spacing | ≈0.45, derived (`SHELF_GAP`) | must exceed `headroom × BOX_H` or a stack pokes through the glass |
| wall shelf | 5 × 2 × 3 levels | 1.0 wide, on a 0.34 plinth, top shelf near head height |
| table pile | 5 × 5 × 1 level | 1.0 × 1.0, top at 0.44 |
| room | 9.6 × 7.2 × 2.6 | door 1.2 wide |
