# Character motion — what is real, what is still a decision

Covers `characters/motion.js` (pure maths, `motion.test.mjs`), the rig changes in
`characters/npc.js`, and `characters/motion-lab.html` (the tuning surface).

Written at a deliberate stopping point, so the next session does not have to re-derive which
parts are settled and which are waiting on a judgement call.

```sh
npm run serve                        # port 8765 — see "running two checkouts" below
open http://localhost:8765/characters/motion-lab.html
node characters/motion.test.mjs      # the headless self-check; needs no browser, no three.js
```

**Nothing here is wired into the game yet.** `characters/store/sim/cast.js` still runs the old
smoothstep blend. The lab is the only page using the new engine. That is the next big step and
it is deliberately not started — see step 3.

---

## The problem this solves

`SPIKE-FUN.md:315` already diagnosed it: *"That is not evidence that long rounds are boring;
it's evidence that you have no idle state. The pacing problem and the animation problem are the
same problem."*

Three separate gaps, all now closed in the motion layer:

1. Interrupted blends discarded velocity. `cast.js` carried position across an interrupt but
   smoothstep's slope is zero at both ends, so a channel travelling at 3.7 rad/s was stopped
   dead in one frame. Measured: **97% of the velocity lost, at any frame rate.**
2. Nothing on a character varied with time. Once a blend finished, every joint held an exact
   constant forever.
3. No walk cycle. Movement held the static `walk` pose; the feet did not move.

---

## Built and working

- **`characters/motion.js`** — pure, no three.js, no DOM, same rule as `visit.js`. Owns the pose
  channel list, the named poses, both interpolators, the additive idle layer and the walk cycle.
  `npc.js` re-exports the pose data, so no existing import site changed.
- **Velocity-continuous interpolation**, two implementations behind one per-character switch.
- **The idle layer** — breathing, lateral weight shift, head movement, blink. Amplitude
  (`idleAmount`) and duty cycle (`idleDuty`) are separate controls; breathing is never gated by
  duty, because a character that stops breathing reads as switched off rather than as still.
- **The walk cycle** — phase driven by DISTANCE TRAVELLED, not time. Feet stay planted at any
  speed and any leg length; a slowing character freezes mid-stride with its feet down.
- **`spineRoll`** — the only lateral channel on the rig. Every other body channel rotates about
  X (fore-aft), so before this nothing on a character could move side to side at all.
- **Articulated head, neck and eyes** (`npc.js`). Cost measured in `crowd.html` at 14 x mixed @
  high, whole scene framed: **13 → 16 draw calls per character, 193 → 234 geometries**, and zero
  new materials. Node count is the budgeted metric; draw calls were retired in
  DESIGN-DECISIONS.md.
- **`headYawMax`** — per-species head-turn range, in the rig params next to `neckLength` because
  it is anatomy rather than temperament. Owl 4.60 rad (~264°), llama 1.90 (~109°), base 1.40.
  Adding a species' swivel is one line in its kit.
- **Per-species variation spans** — `BASE_MOTION_RANGES` plus per-kit `MOTION_RANGES`, reusing
  the shape `BASE_RANDOM_RANGES` already established. Personality decides where in a span a
  character lands; the species decides how wide the span is. A kit that invents a key simply has
  no effect, so "ADD or SCALE, never REPLACE" needs no validation code.
- **Walking style carried by ANGLES** — see below, this is the load-bearing idea.

---

## The load-bearing ideas, so nobody undoes them

**1. `cur[]`/`vel[]` hold the COMMANDED pose only.** The idle layer, the walk layer,
`clampArmOut` and `groundCharacter` are read-only consumers downstream. Nothing downstream is
ever written back upstream. Five things break if that is violated — the header of `motion.js`
lists them, and the `clampArmOut` one (a clamp that feeds back ratchets, so a llama's arms
slowly rise over a minute) is the one nobody would ever find.

**2. Walking STYLE must be expressed as angles, never as lengths.** A length is welded to leg
length: `stride` has to scale with the legs or the feet skate. An angle has no length in it, so
a 38° arm swing is 38° on a stumpy owl and on a stilt llama. This is why personality reads at
all. Measured, same body and opposite temperaments now differ **5x in arm swing and 9x in body
roll**, while the same temperament across a 3x leg-length change is identical in every style
angle. Size and character no longer compete for the same visual channel.

**3. Grounding owns `root.y` absolutely, every frame.** `groundCharacter` writes it, offsets are
added on top via `built.groundOffset`. The seat lift and the arrival tween must go through that
offset or seated NPCs sink through their chairs — which is exactly what would have happened once
`applyPose` started running continuously.

**4. Posture sits ABOVE the idle early-out.** Posture is carriage, not fidgeting. Below it,
`idleAmount: 0` silently erased personality along with the movement.

---

## Open decisions — these need a judgement, not code

**1. Which interpolator wins.** Both ship, switchable per character, compared side by side in
the lab against smoothstep as the control. Measured in the renderer, max velocity step at the
interrupt:

| | spring | hermite | smoothstep (today) |
| --- | --- | --- | --- |
| max \|dv\| | 1.86 | 0.48 | 4.72 |

Hermite is quantitatively smoothest. The spring's larger number is partly genuine deceleration,
and it is the one that gives overshoot as a temperament knob (`zeta` below 1). **This is an eyes
call.** Open the lab, press Enter, and pick. Then delete the loser: three grep-able places, all
named `mode` — the branch in `integrate()`, the key in `MOTION_DEFAULTS`, and the one read of
`opts.mode`. Delete `smoothstep` too; it exists only as the control.

**2. Pacing. The cast moves roughly 3-4x faster than their legs can carry.** Peak ground speed
is about 2.1 units/s on a ~1.0-tall character at `S.travel = 1.4`, which at default proportions
is ~11 steps/second. The walk cycle cannot hide this — a distance-locked stride reports it
instead, and the lab's skate meter reads **24% at a speed of 0.55**. Clamping cadence does not
rescue it: the stride required would be 5.3x leg length, i.e. `asin(1.32)`, which is
geometrically impossible.

Believable `θmax ≤ 0.6 rad` caps honest speed near 1.2 units/s, so `S.travel` wants roughly
doubling to ~2.5, which pulls `S.autoSeconds` up from 3 (`config.js:110`, whose comment already
ties the two together). **This is a feel change to the game, not a tuning tweak**, which is why
it is flagged rather than done. `SPIKE-FUN.md` argues longer rounds become affordable exactly
when idles land — and they have now landed.

---

## Next steps, in order

1. **Bake off the interpolators in the lab, pick one, delete the loser and `smoothstep`.**
   Everything downstream is simpler once there is one engine.
2. **Decide the pacing question** (open decision 2). It changes `S.travel` and `S.autoSeconds`.
3. **Wire into `cast.js` / `world.js`.** The risky part is the root-Y reorder — *test a seated
   NPC first*, before anything else. Expected deletions: `BLEND`, the `blended` scratch,
   `blendedValue` (it exists only to re-derive the in-flight value, which stored velocity makes
   unnecessary), the hop-undo dance and its now-false comment, `wantedPose`'s `moving` branch
   and the `travelled > 0.05` hack, and `POSES.walk` / `POSES['walk+carry']` (both exist only
   because there was no cycle). `cast.js` should come out ~20 lines shorter than it went in;
   net deletion is the success signal.
   - `rec.walkDist` must accumulate real per-frame root displacement and **must survive
     `retarget`** (`world.js:378`), or every NPC foot-pops on the round boundary every 3s, in
     unison.
   - Do NOT use `rec.travelled` for this. Despite the name it is the route's total length, not
     distance covered.
   - Seed `rec.walkDist = Math.random() * strideLen` at spawn, or the queue walks in in perfect
     lockstep — `crowd.html:310`'s chorus line with extra steps.
   - `walkGain = 0` while `rec.celebrate > 0`, or an NPC hops and strides at once. The old code
     enforced "delight outranks the walk" by swapping poses; an additive layer cannot.
4. **Move `crowd.html` onto the shared engine**, deleting the fourth hand-inlined smoothstep and
   its separate `S.blend`. After that, smoothstep appears exactly once in the repo —
   `cast.js:248`, the walk *route* tween, which is not a pose blend. A helper for one call site
   is not a helper.
5. **Perf pass** under 20x CPU throttle, against the recorded baseline of 35fps `low` / 23fps
   `high` at 40 NPCs. Frame the whole scene first (`F`) and sanity-check draw-calls-per-character
   against mesh count. A reading near 60/120 is a vsync ceiling, not a measurement — for the
   motion-on/off A/B use CPU self time in a profile, not fps. `idleAmount: 0` is the A/B switch.
6. **Content, once the engine is settled** — the authored idle vocabulary in `SPIKE-FUN.md:341`
   is the list: deliberating, chatting, waiting, and the seated knitting loop that `:347` calls
   "the money shot of the entire game".

---

## Known ceilings, marked in code

- `armTuck` is a constant elbow offset, so it also bends the arm of a character reaching for a
  shelf. Capped low enough to read as "holds themselves in" rather than as a broken reach. The
  real fix is posture that fades while a pose needs a specific arm shape.
- No per-channel clamp on the additive layer. `POSES.delighted` authors `earPerk: 0.38` and a
  twitch on top can drive an ear through a skull. If that shows up, build limits from the ranges
  already in `BASE_GUI.pose` rather than a second table that will drift.
- Blink is a y-squash of the whole eye about its centre, so it reads as a squint rather than a
  lid coming down. At ~150px tall it does not matter.
- `hipFlex` drives the walk's bounce, and past ~0.12 the character walks in a crouch. A deeper
  bob needs a real pelvis-height channel.

## Waiting to bite, not caused by this work

- **NPCs pass through each other in transit** (`VISIT-POC-TODO.md:502`; steering is separate
  work). A real walk cycle makes this much more obvious — two characters merging while both sets
  of legs stride reads as a glitch in a way two gliding statues did not. **This may well be the
  thing that looks worst after the walk lands, and it will not be the walk's fault.**
- **`clampArmOut` vs two-handed poses** (`inventory/DESIGN-DECISIONS.md:147`: "this will look
  like a bug when someone first authors a knitting pose"). Not triggered yet. It bites the moment
  the seated knitting pose lands, which is the next piece of content anyone will want.
- **Blob shadows sit at the character root** and do not follow a lean. `QUALITY.high` disables
  them, so this is a low/medium-tier artifact — i.e. exactly the cheap tablets that are the
  target.

---

## Gotchas learned the hard way this session

- **rAF stops in a backgrounded tab.** A scripted or devtools-driven probe of the lab reads a
  frozen scene and every number comes back `0.00`. This looked convincingly like a broken
  slider twice. Foreground the tab, or read the roster, which is written on change rather than
  per frame.
- **Running two checkouts at once**: `serve.py` binds one port, so a second checkout needs
  `python3 serve.py 8766`. Loading 8765 while working in a worktree silently tests the *other*
  checkout's code. Check the `BUILD` marker on the page before believing any result.
- **A stale ES module survives a query-string reload** in some cases. If a control shows a value
  the source says it cannot have, reload with a fresh query before assuming a bug.
- `npm run serve`, never `python3 -m http.server`. This branch adds a module and new exports,
  which is precisely the case `readme.md:13` warns renders a blank white page.

## Bugs this work found and fixed, worth not reintroducing

1. **50% foot skate.** The foot-lock condition is that peak-to-peak foot travel, `2·L·sin(θ)`,
   equals the stride the body covers. The code used `asin(stride/4)` — confusing
   excursion-from-centre with peak-to-peak — putting true travel at exactly 0.500x stride,
   identically at every leg length.
2. **`headArc` had no default.** It lived only in `BASE_MOTION_RANGES`, so a caller using
   `MOTION_DEFAULTS` alone multiplied by `undefined` and put NaN on all three head channels.
   NaN reaches the bounding sphere and culls the *entire character* — it does not look like a
   broken head. Every key the layers multiply by must have a default; asserted.
3. **Five lab sliders silently did nothing.** `coeffs()` spread `motionOf()` over the globals, so
   every key it returns overwrote the knob of the same name. The knobs now scale the
   per-personality value after the merge, so both work. The shape of that merge is asserted.
4. **Build-time and runtime posing had drifted.** Each build function seeded its own joint from
   params and knew only the channels that existed when it was written, so a new channel silently
   did nothing in `species-checker.html` (whose sliders rebuild rather than re-pose).
   `createCharacter` now seeds through `applyPose`, so there is one path.
5. **`minArmOut` was a staircase**, returning the first failing sample index. Invisible while
   `armSwing` only moved during a 0.35s blend; it would chatter every frame under a continuous
   walk. Now interpolated between bracketing samples.

Every one of these was found by measuring rather than by reading, and each has an assertion that
was verified to fail when the fix is reverted.
