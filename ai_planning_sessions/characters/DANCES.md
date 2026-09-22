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
| **Asymmetric arms** | needs `armOutAlt` (added for this). Before it the arms were mirrored by construction — measured across `armOut`, `armSwing` and `armSwingAlt`, the two hands never differed laterally by more than 0.00. |
| **Turning the body** | no pose channel does it. `applyPose` never writes `root.rotation.y`, and `spineTwist` (also added for this) turns the chest against the hips but not the whole character. A pirouette's turn is therefore a **root extra**. |

### Root extras

`turn`, `rise` and `travel` are what a dance asks of the root, which no pose channel can express.
They are returned as data and **never written to the root** — the root belongs to whoever placed
the character (the lab page, or `cast.js` in the shop), exactly as `built.groundOffset` already
works for grounding. They are absolute offsets from where the dance started, and a step that omits
one carries the previous value forward, so a pirouette holds its new facing instead of unwinding.

A **looping** dance may not use `turn` or `travel`: wrapping the index back to 0 would snap the
root back to the origin. `motion.test.mjs` asserts this rather than trusting it.

### What each one is made of

| dance | loops | built from |
| --- | --- | --- |
| **riverdance** | yes | Upper body locked flat (`armOut` 0.10, `elbowBend` 0.06, no spine channels at all), alternating high front knees through leg isolation, 0.17s holds with a plant between. |
| **floss** | yes | `armSwingAlt` ±0.85 with straight elbows, `spineTwist` counter-phase — shoulders against hips is the whole read — plus a matching `spineRoll` lean. |
| **attitude** | no | Free leg lifted behind, standing leg planted, and an asymmetric port de bras via `armOutAlt`. Held 1.4s, with a small `rise`. |
| **pirouette** | no | Plié, then passé with the arms rounded in while the root `turn`s a full 2π and `rise`s, then opens out. |
| **uptown-funk** | no | The **walk layer** running underneath (`walk: 0.75`) plus a torso pose on top: `spineTwist`/`spineRoll` swagger, bigger `armSwingAlt`, head accents, and 1.6 units of `travel`. The layers are additive, so this is a real walk with a strut over it rather than a second leg animation. |

### Known ceilings

This rig is chibi: **no ankles, no toes, no spine segments**. So a piqué is a root `rise` rather
than a foot articulation, and the ballet reads as a stylised nod at ballet rather than the real
line. Judge them at the `D` (150px) distance and under `B` (squint), because that is how the shop
actually shows them. If they need to read better than that, the upgrade is an ankle joint — not
more key poses.
