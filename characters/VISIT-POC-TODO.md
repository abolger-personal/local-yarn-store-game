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
- **No pick-and-place.** The player cannot arrange anything in this view; it is NPC-side only.
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
