Desired Dances to use as rewards on a trigger for each character: 
- A ballet pirouette: https://balletaz.org/wp-content/uploads/2018/12/Blog-Pique_Gif.gif
- A ballet "Attitude": https://balletaz.org/wp-content/uploads/2018/12/Blog-Italian-Fouette_Gif.gif
- A 'floss' https://tenor.com/view/bluey-bingo-floss-flossing-gif-27348865
- A riverdance (irish step dance, stiff upper body and straight arms, all in feet)
- A walk and swing like Bruno Mars in "Uptown Funk" (https://giphy.com/gifs/brunomars-bruno-mars-uptown-funk-xULW8mLUitJ6aGpuow)

---

## How they are built

All five live in `characters/motion.js` as DATA (`DANCE_POSES` and `DANCES`), and play in the
species checker: pick one from the "victory dances" folder, or press `X` to cycle and `C` to
replay. Every character can do every dance for now — nothing maps a dance to a temperament yet.

A dance is **an ordered list of key poses with hold times**, not a curve per channel. That works
because `integrate()` spots a target change by object identity and carries the channel's velocity
across it, so the existing spring does all the in-betweening. It is also why the poses below are
authored as *positions to pass through*, and why each dance carries its own `stiff`/`zeta` — a
riverdance step is faster than any character naturally settles.

Three things the rig can and cannot do shape every pose, all measured rather than assumed:

| | |
| --- | --- |
| **Standing on one leg** | `hipFlex = -legSwing`. `legSwing` is anti-symmetric (`legSwing * side`), `hipFlex` is symmetric, so equal-and-opposite cancels one leg and doubles the other. Planted foot holds at y+0.01 while the free leg lifts +0.36 behind or +0.25 in front. |
| **Both feet planted, one behind** | The same two channels with `hipFlex` at **zero**: both legs rotate by equal and opposite angles, both feet rise the same amount, and grounding sets the body down on both. `legSwing` 0.72 puts a foot 0.155 back with the feet level to 0.0002, squatting the hips ~0.06. Needs a straight knee — `kneeAmount` bends the trailing leg harder, so a bent knee hovers the back foot. |
| **Asymmetric arms** | needs `armOutAlt` (added for this). Before it the arms were mirrored by construction — measured across `armOut`, `armSwing` and `armSwingAlt`, the two hands never differed laterally by more than 0.00. |
| **Turning the body** | no pose channel does it. `applyPose` never writes `root.rotation.y`, and `spineTwist` (also added for this) turns the chest against the hips but not the whole character. A pirouette's turn is therefore a **root extra**. |

### Root extras

`turn`, `rise`, `travel` and `shift` are what a dance asks of the root, which no pose channel can
express. They are returned as data and **never written to the root** — the root belongs to whoever
placed the character (the lab page, or `cast.js` in the shop), exactly as `built.groundOffset`
already works for grounding. They are absolute offsets from where the dance started, and a step
that omits one carries the previous value forward, so a pirouette holds its new facing instead of
unwinding.

`hop` is the odd one out and deliberately so: a transient **arc** within its own step, up and back
to zero, rather than a position that is held. That is what lets a *looping* dance leave the ground
— a sustained `rise` at the end of a cycle would snap to the floor at the wrap.

A **looping** dance may not use `turn` or `travel`: those accumulate, so a wrap would walk the
character backwards. `rise` and `shift` may end a cycle anywhere, because the wrap lerps from the
last step's extras rather than from nothing. `motion.test.mjs` asserts both.

**`shift` moves the whole root, so the feet slide with the hips.** Real hip sway is the pelvis
moving over planted feet, which needs lateral rotation at the hip — a channel this rig does not
have and that grounding could not follow, since `lowestFoot` derives height from hip and knee
angles about X alone. At 0.038 units the slide is a few pixels at shop distance.

### What each one is made of

| dance | loops | built from |
| --- | --- | --- |
| **riverdance** | yes | Upper body locked flat (`armOut` 0.10, `elbowBend` 0.06, no spine channels at all). Ten beats, two mirrored halves: **kick — hop — step-behind — high knee — hop**. A kick and a high knee are the same leg isolation with opposite knees (`kneeBend` 0.15 vs 1.90), and the difference shows up as **reach**, not lift: 0.239 forward against 0.152. The **step-behind** is the only beat with both feet on the floor — `legSwing` 0.72 at `hipFlex` 0, which puts a foot 0.155 back with the feet level to 0.0002 — and its splay squats the body, feeding the bounce. Every hop beat leaves the ground. Body height swings 0.109, about 11% of height where a human walk is ~3%. |
| **floss** | yes | Built from the wikiHow breakdown. Arms **straight** (`elbowBend` 0.04) travelling as a **pair** to one side — `armOutAlt` ±1.05 abducts one shoulder to 1.35 while the other adducts to −0.75, i.e. crosses the belly — with one arm in front and one behind (`armSwingAlt`). The spine leans *with* the arms and the **hips go the other way** (`shift` ∓0.038). That counter-motion is the joke of the dance. |
| **attitude** | no | Free leg lifted behind, standing leg planted, and an asymmetric port de bras via `armOutAlt`. Held 1.4s, with a small `rise`. |
| **pirouette** | no | Plié, then passé with the arms rounded in while the root `turn`s a full 2π and `rise`s, then opens out. |
| **uptown-funk** | no | **step — freeze mid-step and snap — step — freeze and snap on the other side.** The walk layer runs underneath the *step* beats and is switched off (`walk: 0`) on the *freeze* beats, so the legs hold where the stride left them. The freezes carry their own `legSwing`/`kneeBend` — without leg content the character tidily brings their feet together on every beat, which is a dancer coming to attention rather than one caught mid-stride. 33.9° of lateral lean at the snap; a step is short and a freeze is long, and that ratio is the groove. |

### Known ceilings

This rig is chibi: **no ankles, no toes, no spine segments**. So a piqué is a root `rise` rather
than a foot articulation, and the ballet reads as a stylised nod at ballet rather than the real
line. Judge them at the `D` (150px) distance and under `B` (squint), because that is how the shop
actually shows them. If they need to read better than that, the upgrade is an ankle joint — not
more key poses.
