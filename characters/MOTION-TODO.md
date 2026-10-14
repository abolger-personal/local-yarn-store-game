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

Wired into the game: `cast.js` drives every customer through `stepMotion`, the walk layer and
`phaseStep`; `crowd.html` uses the same engine.

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

## Open decisions

Both decided. Interpolator: spring (§The interpolator bake-off). Pacing: `gameSpeed` sets walk
speed in units/s; `speed.test.mjs` holds ▶'s peak under the shortest legs' top speed.

---

## Next steps, in order

1. Delete hermite and smoothstep from motion.js and the lab.
2. Delete `POSES.walk`, `POSES['walk+carry']` and the `kneeAmount` rectifier.
3. Perf pass under 20x throttle.
4. Deliberating, chatting and waiting idles (the seated knitting loop is built).

---

## Known ceilings, marked in code

- No per-channel clamp on the additive layer. `POSES.delighted` authors `earPerk: 0.38` and a
  twitch on top can drive an ear through a skull. If that shows up, build limits from the ranges
  already in `BASE_GUI.pose` rather than a second table that will drift.
- Blink is a y-squash of the whole eye about its centre, so it reads as a squint rather than a
  lid coming down. At ~150px tall it does not matter.
- `hipFlex` drives the walk's bounce, and past ~0.12 the character walks in a crouch. A deeper
  bob needs a real pelvis-height channel.

## Waiting to bite, not caused by this work

- **NPCs pass through each other in transit** (`VISIT-POC-TODO.md:461`; steering is separate
  work). A real walk cycle makes this much more obvious — two characters merging while both sets
  of legs stride reads as a glitch in a way two gliding statues did not. **This may well be the
  thing that looks worst after the walk lands, and it will not be the walk's fault.**
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

## The interpolator bake-off: decided

**Spring.** Decided 2026-09-20 in the lab, by eye and then by measurement.

Smoothstep visibly twitches on every interrupt — its slope is zero at both ends, so an
interrupted move throws its speed away and relaunches from a standstill. That was the whole
premise of this work and it reads immediately on screen.

Spring and hermite are indistinguishable by eye. What separates them:

| a fresh move from rest | overshoot | settles |
| --- | --- | --- |
| spring, zeta 0.6 | **1.084** | 0.60s |
| spring, zeta 1.0 | 1.000 | 0.65s |
| hermite | 1.000 | 0.34s |
| smoothstep | 1.000 | 0.34s |

**Hermite is bit-identical to smoothstep on any move that is not interrupted** — measured max
difference 0.000000 rad. Its start tangent is seeded from incoming velocity, which is zero at
rest, leaving a cubic Hermite with both tangents zero, which *is* `t*t*(3-2t)`. And its end
tangent is hard-zero, so it can never overshoot — which kills the `zeta` dial that carries
Volatility vs Orderliness. Spring also keeps no interrupt bookkeeping at all (continuity is
structural) and has no `blend` duration to stay in sync with.

The one point for hermite: max |dv| at an interrupt is 0.48 against spring's 1.86. Looking at
both, that 1.4 rad/s is not visible.

**Note for whoever wires this up: the walk cannot decide this.** The walk and idle layers are
added *downstream* of the interpolator, so with a pose held the engine spread is exactly
0.0000 rad. Walking under spring and under hermite is bit-identical output.

Hermite and smoothstep are **still in the code**, as lab-only comparison rows behind the two
"also show" checkboxes, off by default. They are not deleted yet because tuning the spring is
worth being able to sanity-check against. The deletion is still owed: three grep-able places,
all named `mode`.

`zeta` was re-spanned from [0.60, 1.50] to **[0.45, 1.00]** at the same time. Measured overshoot:
0.45 → 19.6%, 0.55 → 11.6%, 0.65 → 5.7%, 0.75 → 2.0%, 0.85 → 0.2%, and everything from 0.85 up
is indistinguishable. Two thirds of the old span sat in that dead zone, which is why the bounce
read as flat across a cast.

## How the lab measures an interrupt

- **One event stream** drives every row, and the rows of one slot share params, traits, idle seed
  and stride phase, so they differ by the interpolator alone.
- **A cut is scripted, not clicked:** settle back to rest at real time (so every run starts from
  the same place), reach, cut to browse, hold to see the arrival. Only the reach and cut run
  slowed (`cutSlow`): velocity continuity is a sub-100 ms event. One press of Enter runs one cut;
  looping is opt-in.
- **The cut lands at a fraction of the move**, not a time, so the duration knob changes only the
  move's speed and never where the cut lands.
- The peak-|dv| readout resets on the setup pose, never on the interrupt (that is the frame
  being measured). The skate readout shows the worst in the cast: skate is mostly leg length.
- The floor is a grid: against a featureless floor even total skate looks like walking.

## What a species kit may tune, and what it may not

Two tables in `motion.js`, and the split is enforced by the self-check rather than by
convention:

**`BASE_MOTION_RANGES` — seven spans, per species.** `stiff`, `zeta`, `idleAmp`, `idleRate`,
`stride`, `bounce`, `headArc`. A kit's `MOTION_RANGES` narrows or widens any of these; it may
never invent a key. This is "owls are snappy, llamas are languid".

**`STYLE_RANGES` — five spans, universal.** `armGain`, `sway`, `lean`, `headCarry`, `armTuck`.
Identical for every species, and `motionOf` does not consult a kit's ranges for them at all, so
passing them in a kit changes nothing.

Why style is locked: these are the ANGLES, and angles are what can carry personality, because a
40-degree arm swing is a 40-degree arm swing on any body while a length is welded to leg length.
The moment a kit narrows `sway`, "excitable characters roll when they walk" stops being true of
the game and becomes true of one animal — and reading a walk then requires knowing the species
first. Five species in, that is the difference between one body-language vocabulary and five.

It is also the maintenance argument: seven spans to consider per new kit instead of twelve, and
no way to flatten a style dial by accident and spend an afternoon wondering why one species
reads as having no personality.

Measured before splitting: neither shipped kit overrode any of the five — between-species share
of variance was 0% for all of them, and identical after the split — so this removed a capability
nobody was using.

**Not** in either table, because it is anatomy rather than temperament: `legHeight`/`hipInset`
(stride is a multiple of leg length, so gait is scale-free automatically), `headYawMax` (owl 264
degrees, llama 109, clamped in `applyPose`), `clampArmOut`. A new kit gets all of that by
setting its own body params, with no motion tuning at all.

## Speed has a ceiling, and it is set by leg length

`topSpeed(L, opts)` in `motion.js` is the fastest a body can honestly walk: cadence at its cap,
legs at full believable scissor. Measured on owl legs:

| legHeight | top honest speed |
| --- | --- |
| 0.085 (stumpy) | **0.40** |
| 0.215 | 0.89 |
| 0.345 (leggy) | 1.39 |

A mixed-height cast therefore has no single safe speed — the shortest legs set it. The lab prints
it as *"fastest honest walk for this cast"* and turns the skate readout orange past 25%.

Above the ceiling the body outruns the legs and the feet slide. That is allowed and is what
`skate` reports; it reads as hurrying. What is NOT allowed is the legs spinning to pretend
otherwise, which is what used to happen — see the bug list.

The game walks at `gameSpeed`'s units/s, each walker clamped to its own `topSpeed`
(`secondsPerUnit`, cast.js).

## Reading the motion range: the extremes matrix

`extremes, not random` in the lab replaces the random cast with the eight CORNER personalities.
Random casts are the wrong instrument for learning what the system can do — eight random
personalities cluster near the middle of every dial and you end up comparing near-duplicates.

Four factors drive motion, so "three at 5 and one at 1" has exactly four members and "three at 1
and one at 5" has four more. Eight, which is the whole cast, and each factor appears low twice
and high twice across it. Read DOWN a roster column and that factor's effect is attributable
rather than confounded.

Labels encode the values: **upper = 5, lower = 1**. `ENCo` is high on everything but Openness;
`encO` is low on everything but Openness. The odd-one-out cell is marked in the roster.

Everything that is not personality is held identical — body params, idle seed, stride phase —
because leg length dominates a walk far more than temperament does, and randomised bodies bury
exactly the thing the mode exists to show. The one exception is COLOUR, which cannot affect
motion: each corner gets its own hue, because eight identical grey owls is a correct experiment
and a useless one.

What the corners produce, on the shared spans:

| label | E | N | C | O | stiff | zeta | idle | stride | head |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `Enco` | 5 | 1 | 1 | 1 | **240** | 0.73 | **1.60** | 1.40 | 0.50 |
| `eNco` | 1 | 5 | 1 | 1 | **60** | **0.45** | **0.40** | 1.40 | 0.50 |
| `enCo` | 1 | 1 | 5 | 1 | 150 | **1.00** | 1.00 | **2.24** | 0.50 |
| `encO` | 1 | 1 | 1 | 5 | 150 | 0.73 | 1.00 | 1.40 | **1.50** |

Every dial reaches both ends of its span across the eight, which is the check that the trait
mapping is actually wired.

## What each factor is worth, and where

| factor | standing | walking |
| --- | --- | --- |
| **E** Extraversion | fidget amount, head carried up | bounce, arm swing, sway, lean |
| **N** Neuroticism | fidget RATE, head carried down, arms tucked in | (via the above) |
| **C** Conscientiousness | **leans in, attending** | stride length, tidy line, lean |
| **O** Openness/Intellect | **head cocked**, looks around | — |
| **A** Agreeableness | nothing, on purpose — it is about how you treat people, and `visit.js` spends it |

Conscientiousness used to be **invisible standing still**: it moved `zeta`, `stride`, `sway` and
`lean`, and every one of those is walk-or-arrival. `attend` is its standing tell, and it
**crossfades** with the walking `lean` rather than adding — both are the torso going forward, and
summed they put a focused, purposeful character 20 degrees off vertical, which reads as falling.

## The neck

`neckShare` is DERIVED from `neckLength` rather than being a flat 0.35. Measured over four
simulated minutes of idling, the flat share had it backwards: the owl's 0.10 stub rotated 7.9
degrees in yaw while the llama's 0.38 neck rotated 6.5 — the long, obviously flexible neck was
the stiffer of the two. Now 12.9 against 7.5, and the head travels twice as far on the llama.

`neckCurve` gives the neck a rhythm of its own on top of its share of the look, because a neck
that only ever moves as a rigid extension of the head reads as a broom handle. The head
counter-rotates by the same amount, so a character glancing at a shelf still ends up looking at
the shelf.

**Both are free in the terms that matter.** Measured before and after: 44 nodes, 18 meshes, 5
materials, 18 geometries, unchanged for both species. The neck joint already existed and was
already written every frame — what it lacked was anything interesting to be told.

## Two constraints the walk was missing

**Head stabilisation.** The neck is a child of the spine, so every degree the torso rolls is a
degree the neck rolls, multiplied by how far up the head sits. Measured while walking: the
llama's head swung **112mm side to side per step, 11% of its own height**. Nothing about the neck
was wrong — it was faithfully riding a torso doing exactly what it was told.

Real long-necked animals do the opposite. A walking chicken, crane or camelid holds its head
almost fixed while the body sways underneath, and `neckStabilise` now does that, scaled by neck
length. Llama 112mm → **44mm**, and the llama is now steadier than the owl (4.3% of height
against 8.4%), which is the right way round.

**Roll only, deliberately.** Pitch carries posture — `attend`, and `POSES.browse` leaning in to
look at the goods — and a neck that cancelled pitch would undo the gesture those exist to make.
Roll has no posture on it.

**The sway rate cap.** Sway is an AMPLITUDE and says nothing about how fast the torso gets there:
peak roll rate is `amp · TAU · cadence / 2`, so the same 8 degrees of lean is 26 deg/s at a
stroll and **87 deg/s at a scurry**. The first is a swagger, the second is a vibration — which is
why the sway looked wrong at speed and looked right the moment the step rate came down.

`swayRateMax` caps the rate rather than scaling by cadence, so a character who already sways
gently is untouched and only someone asking for more roll than they have time for gets damped.

**And then the cap was set too low, which is a different bug wearing the same clothes.** At
`swayRateMax = 0.70` the cap was the binding constraint at *every* walking speed rather than only
fast ones. The boldest character in the cast asks for 9.7°:

| ground speed | cadence | cap | delivered |
| --- | --- | --- | --- |
| 0.30 (stroll) | 1.4 /s | ×0.93 | 9.0° |
| 0.50 (walk) | 2.4 /s | ×0.56 | 5.4° |
| 0.80+ | 3.4 /s | ×0.39 | **3.8°** |

So the top of the `sway` span was unreachable above about 1.4 steps/s, and *widening the span
would have delivered nothing* — the cap simply scaled it back to 0.70 rad/s again. This is
invisible from either number alone: the span looks generous, the cap looks physical, and the
symptom is "the sway slider does nothing", which is the report that found it.

Now `swayRateMax = 1.25` (72 deg/s) and `sway` tops out at `0.26` (15°). The cap still bites —
×0.65 at a normal walk, ×0.45 at full cadence — so hurrying still damps the roll; it just is not
also the ceiling on a stroll. Delivered roughly doubles everywhere: 14.9° / 9.7° / 6.7°.

The self-check pins **both directions**: faster cadence must roll less, *and* a strolling
character must be delivered ≥90% of what the span authors.

This has a consequence worth knowing: **style is leg-length-independent at matched CADENCE, not
at matched ground speed.** A short-legged character at a given speed steps faster, so the cap
binds sooner on them. That is a physical constraint applying to everyone identically, not a
style difference, and the self-check compares at matched cadence for exactly that reason.

## armTuck is an emotion, not a trait

Holding your arms in against your body reads as tense — a state you are in now, not a way you
are — and wired to Neuroticism it made every anxious character permanently braced. `motionOf`
pins it at zero; the channel, its span and its knob remain for an emotional layer to drive.
It is the one coefficient exempt from the span-occupancy check, by name and with the reason.

## The lab was tuning a species that does not ship

Found while raising the llama's knee lift: `S.ranges` was seeded from `BASE_MOTION_RANGES` once
at load and never reseeded, and `coeffs` used it for everything except "compare species". So
picking *llama* built a cast from the SHARED defaults, not the llama's own spans. A maxed-out
llama read `stiff 235` in the lab against `187` in the game, and knee lift capped at the base
0.78 where the kit authors 1.00 — every number in the variation folder was about an animal
nobody ships.

Switching species now loads that kit's spans into the folder, so what you see, edit and copy to
the clipboard is what the kit actually ships. The slider BOUNDS come from the union across all
registered kits rather than from the base alone, or a kit authoring a bolder span than the
default would have its own value undialable — which is exactly what had happened to `kneeLift`.

**And then the padding that fixed that created its own bug.** Padding 1.5× either side put the
floor of **all eight** span sliders below zero, on channels that are amounts. Reported as *"why
can I drop how much they fidget to negative? Isn't that an amplitude?"* — and it is worse than a
confusing label:

| below zero | what happens |
| --- | --- |
| `stiff` | `spring()` takes `sqrt(stiff)` → damping is **NaN** → NaN reaches the bounding sphere → the renderer culls the character. The "popping in and out" failure, reachable by dragging a slider. |
| `zeta` | negative damping **injects** energy. Measured at −0.5: 3× past the target after one second, still climbing. |
| the amounts | a negative amplitude is the same wobble phase-flipped; a negative rate is the same clock backwards. Indistinguishable on screen from the positive twin, so half the slider travel is a decoy. |

`bounce` is the **one real exception** — negative cancels the free bob that comes from the legs
scissoring, which is documented in `walkLayer` and is a genuine setting. That is why this is a
`SIGNED_SPANS` list rather than a blanket clamp.

The padding rule now lives in `motion.js` as `spanBounds(k, lo, hi)`, next to the table it pads,
because *which channels may go negative* is a fact about the channels rather than about the
panel — and because the self-check can then reach it. The lab's `sliderBounds` does only the
union across kits. Zero stays reachable on every channel: no wobble, no bounce, no knee lift are
all legitimate settings, and a span whose pad crosses zero stops **at** zero rather than at its
own low end.

## The head must stay attached to the body

> "We've broken breathing somehow in idle mode — the owls look like their heads are going to
> come off when they fidget because the bodies are perfectly still."

Two separate couplings had come apart, both leaving the chest behind, and neither was visible
until the other change exposed it.

**1. Breath depth was scaled by `idleAmp` — the *fidget* amplitude.** Breathing is not a fidget.
Everyone breathes, at roughly the same depth; a calm animal breathes *slower*, not shallower,
which is exactly what `breathRate = 0.65 + 0.35·idleRate` already says. On the owl's own span
(`idleAmp` bottoms at 0.30) a placid owl breathed **1.55° peak to peak**, which is a statue.

This was invisible for as long as the head was *also* multiplied by `idleAmp` — body and head
went quiet together, so the character read as calm rather than as broken. Decoupling `headArc`
from `idleAmp` (`0998bd7`, correct in itself: E was driving the head twice) made the head 1.4×
to 3.3× bigger, and the fidget-clock speed-up made it ~3× faster. Neither touched the chest.

`breathDepth(amp) = 0.65 + 0.35·amp`, the same curve as `breathRate` so the two read together:
the quietest breather is still 65% of the liveliest, never a tenth. `idleAmount` still gates it,
because that is the master dial and the reduce-motion answer.

**2. `headTilt` rides `w` — the *body's* weight-shift wave — but took its amplitude from
`headArc` while the body took its own from `idleAmp`.** In phase, on one wave, at wildly
different sizes:

| | body roll | head tilt | ratio |
| --- | --- | --- | --- |
| calm owl | 2.9° | 13.6° | **4.7×** |
| lively owl | 10.7° | 17.6° | 1.6× |

A head swinging nearly five times as far as the shoulders it sits on does not read as alert, it
reads as loose — and the ratio *changing with the fidget dial* is what made it worst on exactly
the calm characters the report named. The tilt is postural follow-through, not a glance;
curiosity already has its own sideways tilt in `headCock`, held rather than oscillating. It now
takes the same `g · still` the weight shift uses, so the ratio is a constant 0.8 across the span
and fades out with the body when they walk.

After both: calm owl breathes 3.9° (was 1.55°), tilts 2.4° against 2.9° of roll. Yaw is
unchanged at 35° — looking around is a separate intent and is supposed to be the big one.

Pinned as **ratios**, not absolute sizes: the amplitudes are a tuning choice, but the channels
staying attached to each other is not.

### …and at exactly zero it stopped breathing anyway

> "Owls are not breathing once I set the fidget dial to 0."

`compose` early-outed on `idleAmount * idleAmp <= 0`, which made the two dials interchangeable
at their bottom end. They are not the same dial:

| | means |
| --- | --- |
| `idleAmount = 0` | **run no idle at all.** The reduce-motion answer and the A/B switch for measuring what continuous motion costs. Returning early is correct, and is what makes that measurement honest. |
| `idleAmp = 0` | **this character does not fidget.** A temperament, not an off switch. |

So the breath-depth fix above worked everywhere *except* at exactly zero, because that line meant
`breathDepth` never ran. The early-out is now on the master dial alone; every fidget term already
carries `a` (or `g`, which is `a` gated), so they reach zero on their own. Breathing and blinking
do not, which is the intent.

| | breath | roll | ears | blinks/2min |
| --- | --- | --- | --- | --- |
| `idleAmp 0` | **1.68°** | 0 | 0 | 25 |
| normal | 2.58° | 4.87° | 17.2° | 27 |
| `idleAmount 0` | 0 | 0 | 0 | 0 |

Head **yaw stays at 10.3° with the fidget dial at zero**, and that is deliberate: looking around
is `headArc` from Openness, decoupled from `idleAmp` on purpose so Extraversion stopped driving
the head twice. A character who holds still but watches the room is the intended reading. If that
ever wants its own off switch it is a separate dial, not a re-coupling.

## The idle fades where the walk already does the job

Standing fidget and walking gait were running at once on the same joints, at incommensurate
frequencies. Measured on a lively owl:

| | amplitude | period |
| --- | --- | --- |
| walk sway (`spineRoll`) | ±0.166 rad | 0.6 s |
| idle weight shift (`spineRoll`) | ±0.092 rad | 1.6 s |

The idle was **55% of the walk's amplitude on the same axis**, beating against it — a
bobble-head, and unreachable from the sway slider because the sway slider was not what was doing
it.

**The weight shift now fades to zero with `walkGain`.** Shifting your weight foot to foot *is*
what walking is; the two are the same physical act and only one of them should be running. While
walking, `sway` is the only thing rolling the spine, which is what the slider name promises.

**The head scan only fades part way**, to 40%. Looking around is a separate intent the walk does
not cover, so it should quieten rather than stop — someone on the move mostly watches where they
are going, but curiosity does not switch off because your feet moved. Owl head yaw ±23° standing
→ ±9° walking.

`still` is one frame stale, because `compose` runs before `walkGain` each tick. Invisible at any
frame rate, and much simpler than reordering the pipeline for it.

## Bugs this work found and fixed, worth not reintroducing

1. **Foot skate, twice — and the second time was my own "fix".** A phase is one CYCLE, which is
   TWO steps, and each leg is planted for exactly half of it. So while one foot is down the body
   advances `strideLen/2`, and that is the distance the foot must cover backwards relative to
   the body: `2·L·sin(θ) = strideLen/2`, i.e. `asin(stride/4)`. An earlier pass changed this to
   `asin(stride/2)` on the strength of a probe that watched one leg for a whole cycle instead of
   its stance half — the same off-by-a-half, just on the other side — and halved `stride` to
   0.85–1.12 to hide the result. Measured on the real stance window, slip is **10.7% of stride**
   at `/4` and **55.7%** at `/2`. Restored, and `stride` is back to 1.40–2.24.
   **The lesson: measure a foot over its STANCE, never over a cycle.** A cycle-long window
   averages the two legs together and every wrong answer looks symmetric.
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


## The walk cycle: what was wrong, and the ceiling that is left

Fixed 2026-09-20, all four measured on the rig rather than argued:

1. **No knee at all.** `walkLayer` drove `legSwing` and nothing else, on the plan's reasoning
   that `kneeAmount` would derive the knee from `legSwing`. It does not: `POSES.rest` has
   `kneeBend: 0`, so `kneeAmount` returned 0 identically and the legs were rigid sticks. Measured
   swing-foot ground clearance: **5mm on a 1.0-tall character**. Worse, two rigid legs driven by
   `legSwing * side` are exact MIRRORS, so both feet reached the floor at the same instant twice
   a cycle — there was no stance phase at all, both feet planting and lifting together. That is
   the stomp that reads as a limp. New `kneeSwing` channel, rectified per side in `applyPose`;
   clearance is now **9% of leg length**.
2. **Bounce was half a cycle out of phase.** Footfall is max scissor — phase 0.25 and 0.75 — not
   phase 0, which is the passing pose where the hips are HIGHEST. Measured root height: -0.0003
   at phase 0, -0.0416 at phase 0.25. The term used `+cos`, so it added its crouch at the top of
   the bob and cancelled the free one.
3. **The arms swung WITH the legs.** `applyPose` computes `armSwing - side * armSwingAlt`, so a
   positive `armSwingAlt` sends side +1's arm back — exactly when side +1's leg goes back too.
   The layer used `-=`. Counter-swing is the single biggest readability cue in a walk and it was
   inverted.
4. **The foot-lock divisor.** See the bugs list above.

**Which half of the cycle is stance**, since everything above depends on it and it is invisible
in a still frame: a limb hangs along -Y, so `+rotation.x` puts its far end at -Z, and the
character faces +Z (`POSES.browse` leans in with `spineBend: +0.14`, and the spine points up, so
the same sign tips the head to +Z; `POSES.reach` puts the arm forward with `armSwing: -1.15`).
So positive `legSwing * side` puts that foot BEHIND. Side +1's foot travels backwards relative
to a body moving +Z exactly while `cos(TAU * phase) > 0`, so **side +1 is in stance around phase
0 and mid-swing at phase 0.5.**

### The mirrored-leg ceiling: LIFTED

The note below described the limitation and its upgrade path. The upgrade landed when a raised
knee lift produced a **butt kick instead of a march**: knee flexion peaks at mid-swing, and at
mid-swing the plain sine puts the hip at exactly 0.000 — thigh straight down — so bending the
knee there could only send the heel backwards. More lift bought a harder kick, never a march.

A march needs the thigh FORWARD while the knee bends, which is a per-leg hip lift, and
`legSwing * side - hipFlex` looks like it cannot express one. It can, because that is
`a + b · side`: given a shape `f(p)` for one leg with the other at `f(p + 0.5)`,

    legSwing = (f(p) - f(p + 0.5)) / 2
    hipFlex  = -(f(p) + f(p + 0.5)) / 2

recombines to exactly `f(p)` and `f(p + 0.5)`. The `hipFlex` term looks like it should disturb
the stance leg — it is applied to both — and the `legSwing` term cancels it there precisely.
Measured: stance slip unchanged at 11.4% of stride before and after.

`marchRatio` is how much of the lift goes to the thigh rather than the shin: 0 is a pure butt
kick, ~0.5 reads as a march. It is a RATIO of `kneeLift` rather than its own amount so "pick
your feet up" stays one control — two would drift apart and give a high knee with a dangling
shin.

The knee is still one rectified harmonic: one extra contact flicker near footstrike.

### Still to do here

- `POSES.walk` and `POSES['walk+carry']` are frozen single frames from before the cycle existed,
  and the lab now says so in its pose banner. They are still in the list; the plan deletes them
  when `cast.js` is wired.
- `kneeAmount`'s `max(0, tanh(...))` is a half-wave rectifier, so knee response is asymmetric in
  `legSwing` — with a biased `legSwing` (which `POSES.walk` has) it produces a discontinuous
  6cm vertical pop. Harmless while the walk runs from `rest`, which has `kneeBend: 0`; it dies
  with those two poses.
