# Store visit POC — what is real, what is a placeholder

Covers `characters/store.html` (scene) and `characters/visit.js` (pure sim, `visit.test.mjs`).
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
> down to knit is an NPC not browsing. Worth watching when MAX_ROUNDS gets its real formula.

---

## Moving the shop — DISPLAYS.md rule 10

Press **M** (or the `move displays` checkbox) to switch the pointer from arranging *stock* to
arranging the *shop*. Drag a display **or a chair** to move it. Release commits and leaves the piece
selected, with two curved-arrow handles floating over it — click either to turn 45°, or use **Q/E**.
A footprint shows green where it may land and red where it may not; a blocked release puts it back.
Pressing bare floor deselects.

Chairs move by the same verb as displays. Rule 10 only names displays, but having one of the two
things standing on the shop floor be immovable reads as a bug rather than as a rule.

The rotate handles are HTML, positioned each frame by projecting the selection (`tickRotator`),
rather than scene geometry: the browser does the hit-testing, they stay a comfortable 40px however
far away the camera is, and they cost no raycast. They call the same `rotateMovable` as Q/E, so the
touch path cannot drift from the keyboard one.

The restrictions are enforced in `constrainPose`:

| Type | Constraint |
| --- | --- |
| Wall shelf | Snaps to the nearest wall and takes that wall's facing. Slides along it, never off it. |
| Floor pile | Stays on the floor — its plinth height is 0 and the move path never touches Y. |
| Table pile | Free in XZ, 45° detents. |
| Chair | Free in XZ, 45° detents, clamped inside the room. |
| Peg board | Would clamp to a wall like a shelf, at wall height. Deferred with the rest of type C. |

"All Inventory will stay with the move" needed no code: an item's world matrix is composed against
its display's `frame` every time it is painted, so moving the frame carries the stock.

Still open here:

- **Slot holes are re-cut on landing** (`remaskDisplay`), so a shelf carved to fit beside the
  counter gets its cells back when it moves away. `remask()` refuses to revoke an *occupied* slot,
  which is what makes that safe — but it means a display shoved somewhere awkward can keep a cell
  it "shouldn't" have, purely because something is standing in it.
- **Off-axis cells are tested by circumradius**, not a real OBB. At the 45° detents that refuses
  placements which would just barely have fitted. Conservative, never wrong the dangerous way.
- **`WALL_GAP` is derived from `WALL_INSET`, not chosen.** It was chosen once, at 0.05 against an
  inset of 0.06, and the result was a wall shelf that snapped flush to a wall and was then refused
  for standing too close to it — red on every wall in the shop, droppable nowhere. Any standoff that
  the placement test can disagree with has to be derived from the same constant.
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
- **The player can wall a customer in.** Nothing stops a ring of displays around an NPC; there is
  no pathfinding for it to defeat yet.

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
- **Buying is legible.** See the delight placeholder above.

Still missing, and the bigger half of the "not as much fun" problem: **the stock is too easy to
find**. There is one notion family with three kinds, so an NPC's target is nearly always sitting in
plain sight. That is a catalog problem, not a browse-logic one — P6 owns it.

---

## Spec gaps found while building — these need a decision, not just code

1. **`MAX_ROUNDS` is undefined.** CHARACTER-VISIT.md ends with the heading "Calculation of
   MAX_ROUNDS from Character attributes:" and no body. Placeholder in use:
   `clamp(4 + Enthusiasm + Industriousness - Withdrawal, 3, 18)`.
2. ~~**Prescriptions have no termination bound.**~~ **RESOLVED, both in spec.** 22% of visits never
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
3. **Display "attractiveness weights" are undefined.** CHARACTER-VISIT.md requires each display to
   carry "a meta 'attractiveness' list of weights to use against a particular NPC". The placeholder
   has the right shape (per-NPC, 0..1, thresholded at 0.5) but invented weights.
4. **About a third of NPCs never reach a display at all** — they wander, wait and work on WIPs until
   MAX_ROUNDS. That follows from uniform random selection over the action set. If browsing should
   dominate, the action set needs weighting, not just more entries.
5. **Interaction outcome for "not complete" is ambiguous.** DISPLAYS.md says a tidy/spread
   "SOMETIMES" satisfies the buy condition afterwards. Currently it always resolves on the next
   interaction. What should "sometimes" actually depend on?

6. **Which notions have which attributes is not written down anywhere.** Today the rule lives in
   `SIZED_NOTIONS` in `store.html` — hooks have a millimetre size, stitch markers and darning
   needles have none. That belongs in the catalog schema (P6) alongside the Ravelry-shaped
   attributes, not in a page. It matters more than it looks: an attribute printed on a box is
   something the player is invited to *arrange by*, so a wrong one is a wrong game rule, not a
   cosmetic slip.

---

## Placeholders in the scene

- **The buy reaction is a placeholder.** `delighted` plus three decaying hops (`CELEBRATE_S`,
  `CELEBRATE_HOPS`, `HOP_H` in `store.html`), triggered the frame `npc.carrying` goes from null to
  something. Wants squash on landing and the ear perk timed to the apex. Delight outranks the walk
  pose, so an NPC who buys as they turn away stops to cheer rather than gliding out mid-celebration.

- **No walk cycle.** Movement is a straight-line lerp between the round's start and end positions
  holding the static `walk` pose. No pathfinding either — NPCs walk through the furniture.
  DESIGN-DECISIONS.md wants grid A* with string-pulling plus separation steering.
- **Separation is at REST only.** Two NPCs never *stand* inside each other, but they still walk
  through each other in transit, because the sim resolves a round as a teleport and the scene
  interpolates. Real steering during the walk is part of the pathfinding work above.
- **The carried notion is the shelf card, shrunk.** It reads at diorama distance, but the same doc
  says the held design is genuinely a second asset — and knitting is two-handed, which will surface
  the `clampArmOut` conflict the moment someone authors that pose.
- **Guestbook is a blockout** — a book-shaped object on the counter so the signing has somewhere to
  happen, but no signing animation, no entries, no finished object, no bulletin board. The Drop Off
  is still a coloured rectangle. LYS.md 5c is the real design.
- **A chair is a cube.** Wants to be a chair, probably with a small table. Seated height
  (`seatLift`) is an eyeballed GUI value, not derived — the rig grounds every pose to feet-at-zero,
  so it cannot be computed from the seat box.
- **WIPs are a count**, 1-3 random, with no pattern, yarn or progress behind them. Only the count
  matters today (it weights the action set). `maxWips` is computed and displayed but not enforced.
- **The room is a blockout** — five boxes and a doormat. DESIGN-DECISIONS.md wants a static shell
  with baked AO and no real-time shadow map at all.
- **No formations.** A "target formation" is literally one notion. The real matcher (shape mask,
  attribute predicates, gradient rules) is P3.
- **No floor pile / universal inbox, no deliveries, no destash.** Stock is scattered at startup.
- **Visibility ignores rotation.** Displays are treated as axis-aligned boxes; furniture that is not
  a display (the counter) does not block sight at all.
- **`headroom: 8` on the table pile**, not the spec's 100. A hundred-layer Jenga tower is legal by
  the rules and absurd on screen; revisit when stacking is something the player does.
- **Notions render as a copy of the `stash-and-stuff.html` painting code**, not a shared import —
  that file is a page, not a module. Extract `paintInstance`/`refresh` into `inventory/` once
  `stash-and-stuff.html` can be touched, or the two will drift.
- **Nothing rewards arranging yet.** The player can move stock around, but there is no formation
  matcher, so an arrangement has no effect on any NPC. That is P3 and it is the point of the game —
  today's pick-and-place only proves the *verb* works, not the loop.
- **Package footprints are authored, not derived.** `PACKAGES` in `store.html` lists the box shapes
  each notion ships in (1×1 and 2×1 for hooks, 1×2 for needles, 2×2 for marker tins). Like the size
  attribute, that belongs in the catalog schema at P6 rather than in a page.
- **No undo, no "put it back where it came from".** A misdrop is fixed by picking it up again.
- **Picking is not forgiving yet.** `inventory/DESIGN-DECISIONS.md` §7 records that an ink drawing
  fills a fraction of its slot, so an exact hit test feels like the item is not where it looks, and
  `pickSlot` should fall back to the nearest occupied slot within a grab radius. This port does the
  exact test only. Measured residual: **0.6% of clicks grab a neighbouring box**, all of them on the
  flat table at grazing camera angles, where the ray crosses a box's side rather than its top face.
  That is the number a grab radius would fix.

> **Fixed, and worth not regressing: picking on a multi-level shelf.** The ported version tested
> only the *active* plane (default 0, the bottom shelf) with a single cast against the shelf FLOOR,
> while the player had clicked a box TOP — a ~0.11 unit parallax error, over half a slot, which
> often landed outside the lattice entirely. The two-pass refine meant to correct it only ran once a
> column had been found, so on a tall shelf it never fired. Every occupied column now gets tested
> against its own box-top height, across all displays and all levels, nearest hit winning.
> Measured over 7,320 clicks × 48 camera angles, excluding items a higher shelf genuinely hides:
> **44.6% correct before, 99.4% after.** The pointer now also *sets* the active level, which
> previously could only be changed from the GUI slider.
- **Round advance is manual by design.** Auto-advance exists behind a checkbox at the spec's 30s.

---

## Scale notes, for when this meets the real art

An NPC normalises to ~1.0 units tall, so everything is a fraction of a customer:

| | value | note |
| --- | --- | --- |
| slot pitch (`CELL`) | 0.20 | uniform across all displays — DISPLAYS.md rule 2 |
| one 2.5D layer (`BOX_H`) | 0.055 | |
| shelf spacing | 0.28 | must exceed `headroom × BOX_H` or a stack pokes through the glass |
| wall shelf | 5 × 2 × 3 levels | 1.0 wide, on a 0.34 plinth, top shelf near head height |
| table pile | 5 × 5 × 1 level | 1.0 × 1.0, top at 0.44 |
| room | 6.4 × 6.4 × 2.2 | door 1.0 wide |

A notion box is a fifth of a person wide. That is deliberate per LYS.md — at real scale they are
invisible — but it is the number most likely to want tuning once yarn (which has honest volume)
shares the shelves.
