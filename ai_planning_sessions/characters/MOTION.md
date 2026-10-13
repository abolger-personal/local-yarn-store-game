# Character motion: the rules

The rules `characters/motion.js` implements. The history, the measurements and the open
decisions are in `characters/MOTION-TODO.md`; the dances are in `DANCES.md`. This file only adds
what those two do not already say.

## Invariant

`cur[]` and `vel[]` hold the **commanded** pose only. The idle layer, the walk layer,
`clampArmOut` and `groundCharacter` read from it and never write back. Breaking this breaks five
things:

1. A spring that reads its own output oscillates: it chases the idle and emits a phase-lagged
   copy of it, which reads as a tremor.
2. Idle amplitude becomes trait-dependent by accident: a spring's response to a sinusoid depends
   on the idle frequency over `sqrt(stiff)`, so a stiff character would breathe deeper than a
   withdrawn one.
3. The interrupt handover stops being reproducible, so the lab can never hit the same interrupt
   twice.
4. A blink (a ~120ms snap) through a 0.35s spring becomes a slow droop.
5. `clampArmOut` forces `armOut` up, so fed back it ratchets: the arms rise over a minute.

The tail is the one deliberate exception, and it keeps its own state (see Tail).

## Channels and poses

- `holdItem` is a boolean and is not interpolated (it would show a carried item at 37% of a
  blend). It rides as the derived `hold` scalar. `blink` is not interpolated either: it is a snap
  the idle layer writes straight into the output.
- `armSwingAlt` is the anti-symmetric arm partner that makes counter-swing possible: positive is
  contralateral to positive `legSwing`.
- Every pose carries every channel. A missing key interpolates to NaN, NaN reaches the bounding
  sphere, and the renderer culls the whole character.
- `rest` has a resting `elbowBend`: an arm hanging dead straight reads as a doll, and a resting
  bend belongs to the pose, where no personality setting can remove it.
- `sit`: thighs horizontal, shins vertical (`kneeBend` matches `hipFlex`), and the tail lifted so
  it lies out behind rather than into the cube seat.

## Tuning defaults

- `zeta` is a damping **ratio**, never an absolute coefficient: absolute damping would silently
  under-damp the whole cast whenever stiffness rose.
- `idleAmount` is the master idle gain. 0 disables the layer: the reduce-motion answer and the
  A/B switch for measuring what continuous motion costs.
- `idleDuty` is how **often** they fidget, separate from how far. At 1 the sway is continuous,
  which reads as permanent swaying; below 1 it comes in bursts with real stillness between.
- `gateSpeed` 0.86: the speed at which the walk layer reaches full weight, so the legs ease in
  over most of the honest range instead of snapping to full stride.
- `cadenceMin`: below it a slow walker **shortens the stride** instead of stepping in slow
  motion. 0 (off) by default; the shop's slow stroll sets it, or a stilt llama at 0.24 units/s
  takes one step every 1.4 seconds.
- `sinMax` = sin(0.6 rad): the most scissor that still reads as walking.
- `idleRate` spans [0.60, 3.00]: a jittery character shifts about every 1.1s against 5.5s for a
  placid one. Narrower than that and nobody reads the difference.
- `kneeLift` is per species: a leggy animal placing its feet and a stumpy one scuttling are
  different gaits, not different moods.
- `sway` tops out at 15 degrees: big for a person, right for a stylised animal across a room.
- `headCock` (~11 degrees at the top) is a different axis from `headCarry`, so confidence (pitch)
  and curiosity (roll) cannot be mistaken for one another. Its sign is per individual, from the
  idle seed and fixed for life: a whole cast cocking left reads as a rigging error, and a head
  that changed sides would read as a twitch.
- `tailCarry`: up and out when outgoing, tucked when anxious, the same E-N read as `headCarry`
  so head and tail agree. An angle added to the species' resting droop, so every tail lifts by
  the same amount for the same temperament.

## Traits to motion

- Motion reads the five Big-5 **factors** (DeYoung's pairing of the ten assets, each factor the
  mean of its two), not the ten assets. The assets stay the stored, spec-named truth.
- A factor's position on a span is its **quantile** in the population, not its raw mean, so
  positions are uniform: there are five ways to average 3 and one to average 1, and a raw mean
  would bunch a cast in the middle of every dial.
- A coefficient driven by a **difference** of two factors is widened by `SPREAD` 1.9 about the
  middle, because a difference lands on a triangular distribution. 1.9 reaches the same ~87%
  p10..p90 occupancy as the single-factor dials; past it nothing improves and more characters
  pin at a limit.
- Mapping, beyond the factor table in MOTION-TODO.md: `stiff`, `idleAmp`, `armGain` and
  `tailCarry` from E-N; `headCarry` from N-E; `zeta` from C-N (N un-damps, C pulls toward
  critical); `sway` from E-C; `lean` from E+C; `idleRate` from N; `stride`, `kneeLift`, `attend`
  from C; `bounce` from E; `headArc`, `headCock` from O.
- `attend` (standing forward lean) crossfades with the walking `lean`; the two together stay under
  ~2x `browse`'s lean (0.28), past which a character reads as falling.

## Integration

- `dt` is clamped to 1/30s inside motion.js, so every caller inherits it: explicit Euler on a
  stiff spring diverges past ~0.129s, and divergence ends in NaN and a culled character. A hitch
  slows motion instead of exploding it.
- The spring substeps at 1/120s, which keeps overshoot independent of frame rate. Without it the
  bounce tuned on a laptop flattens on a throttled tablet, the hardware the personality is for.

## Idle

- **Two clocks.** Breathing and fidgeting run on separate clocks and only breathing is damped
  toward the middle (`breathRate = 0.65 + 0.35 * idleRate`): a keyed-up character fidgets several
  times faster, but breathing three times faster is panting. Fidget ~3.3s per shift at
  `idleRate` 1, ~1.1s at 3; breath ~4s.
- **Incommensurate rates.** Every rhythm, and each character's sub-rhythm rates, are deliberately
  not multiples of each other, and the per-character rates spread ~2.9x: rhythms that share a
  period read as one mechanism, and a visible repeat reads as an animation rather than life.
- Clocks advance with the real `dt`, not the clamped one: a breath that jumps through a hitch
  reads better than one that stalls.
- **The duty gate stops the fidget clock**; it does not fade the lean. When you stop shifting
  about you stay on whichever foot you were on, rather than gliding back through upright.
- **The weight shift dwells.** It is a `tanh`-flattened sine: you stand on one foot, move your
  weight across, and stay on the other. A plain sine is always mid-crossing, which reads as a
  cast seasick on an invisible boat.
- The hip part of the weight shift fades out as the character folds up (`hipFlex` toward 0.9):
  seated, the same wobble becomes a whole-body bounce through grounding, and nobody shifts weight
  between their feet while sitting on them.
- **Blink and ear flick** ride Poisson-ish timers, not the idle sine: a blink on a sine is
  metronomic, and ears on a sine flap in a breeze. The flick rate follows `idleDuty` but is never
  fully stilled. Both ears share one channel pair, so the asymmetry is in the splay: one ear
  cocking.
- Breathing lifts the arms a little with the chest: an arm that stays put while the ribcage moves
  reads as detached.
- The head scans at a fraction of the fidget clock: a head whipping around at tapping speed reads
  as alarmed rather than interested.
- The tail sways slowly on the fidget clock, so it holds still when they do.
- The wag clock follows `idleRate` only partly (`0.7 + 0.3 * idleRate`, ~2 wags/s at 1), or an
  anxious lion's tail buzzes.
- Delight (the buy cheer) is `POSES.delighted` plus decaying hops (`HOP_H` 0.15 in cast.js). A
  species may swap in its own `delighted` pose, which stepMotion uses in its place: the lion lifts
  and wags its tail harder (`tailLift` 0.9, `tailWag` 1.6) and the llama flaps its ears
  (`earFlap` 1), because their arms vanish against mane and fleece. The owl keeps the base pose.

## Tail

A passive spring, the one thing on the rig meant to lag: a phase-lagged copy of the body's
motion is follow-through, and overshoot is the tail settling. It filters the **composed** target
with its own state and never touches `cur[]`.

- Two inputs: the target (carriage, wag, idle sway) and the acceleration of the tail's base in
  the body's frame, which throws it the other way, so a stop, a turn, a hop or a pirouette reaches
  the tail with nothing telling it. The forcing is a pendulum's: the push perpendicular to the
  tail, over its length, so a hanging tail swings fore-aft on a stop and a level one bounces with
  the step.
- **Counter-swing** against the body's roll (`TAIL_COUNTER` 2.5) is put in the target, because
  inertia alone barely moves a tail whose base sits near the roll's pivot. It still arrives
  through the spring.
- The tip's spring is softer than the root's (0.55x), so the tail whips rather than swinging as a
  stick. Output clamped at 1.3 rad, past which a tail folds back on itself.
- Stiffness is per species, not per temperament, so a wag's size does not depend on personality
  by accident. Resonance makes a keyed-up character's wag up to ~10% bigger; that is tuned
  through `WAG_AMP`, not fought.

## Walk

- **Two stride lengths.** `gaitLen` is what the cadence demands and is unbounded, so cadence can
  never exceed `cadenceMax`: that makes the knob a real cap. `reach` is what the legs can
  physically swing and is bounded by geometry. The difference is reported as `skate`, which reads
  as hurrying; legs spinning faster would read as a broken rig.
- **The phase is accumulated per frame**, `moved / gaitLen`, never total distance over the
  current stride: the stride length changes with speed, so dividing a growing total by it makes
  the phase leap when a walk ends.
- The swing-leg knee bends only over the swing half (rectified per side in `applyPose`), so each
  leg is straight through its stance and there is a real stance phase.
- `walkGain` is exactly 0 at zero speed, so a standing character is bit-identical to its pose.
  Its decay is the "bring your feet together" beat: the phase freezes and the gain closes the
  scissor over a few tenths of a second.
- The bounce cannot be exaggerated with root Y, because grounding writes Y absolutely; the lever
  is `hipFlex`, which shortens both legs together.
