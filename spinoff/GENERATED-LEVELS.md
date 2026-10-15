# Generated levels: an exploration

Can Donut Fighters make its own stages, for replayability, so that a stage at difficulty N only
holds the kinds of problem a kid has already met by then? (2026-10-14; exploration, not a
shipped feature. The rules it builds on are in `REUSE-SPEC.md`.)

## Verdict

**Feasible, and cheap.** Since "Levels are data", a stage is a plain `Stage` object and every level
already runs through a playability test in the real sim. A generator only has to output that same
object; the proof of concept (`spinoff/generate.js`, ~90 lines) does, and 5,000 generated stages
pass the same checks as the hand-made levels. The hard part is not the generator but making
generated stages *good*: the proof of concept shows the terrain barely changes how long a raid
takes (median 4.6 s at difficulty 1, 5.4 s at difficulty 5), so variety has to be designed in, and
fun still needs a tablet and a kid.

## What a generator outputs, and what it must guarantee

Output: a `Stage` (`match.js`), exactly the shape of `LEVELS[n].stage`, plus a theme. Nothing else
in the sim, the page or the scenery changes; `scenery.js` dresses any floor by its kind.

| Guarantee | How the proof of concept gets it |
| --- | --- |
| One ground, the lowest; every floor a ground, deck or hill | by construction; `checkLevel` |
| Shelves stand on a floor | by construction; `checkLevel` |
| Syrup on open ground, clear of raised floors; no brick inside a raised floor | by construction (pieces live in fixed x slots, below); `checkLevel` |
| Every shelf reachable | `checkLevel` runs a hero from spawn to the bad guys' shelf in the real sim |
| The middle third (\|x\| < 3) never holds fort pieces | bricks only at x 4.6; only the hill and field syrup in the middle, as in Level 1 |
| Fair sides | terrain mirrored in x by construction (tested); the bad guys' pre-placed fort is on their side only, as in Level 1, since the heroes build theirs in the build round |
| Readable at tablet size (camera ~7 units wide, ~150 px fighters) | every gap a fighter must use is at least 0.8 (about two fighter widths); at most 4 problems per stage; fixed slots so nothing crowds |
| Same stage on every tablet | a pure function of `(seed, difficulty)` with its own PRNG (mulberry32, integer maths), numbers rounded to 0.1; no `Math.random` |

Two things the floor model can't express yet: pits (the stage has exactly one ground, so a gap in the
floor is impossible) and anything that moves. Neither is needed for a first version.

A note on determinism: the sim is host-authoritative, so in a room only the host runs it and guests
draw from snapshots. A guest still needs the stage to draw the scenery, but the host could just
send the `Stage` itself (about 1–2 KB of JSON) once at the start. The seed matters more for sharing a
level *between* rooms (a daily level) and for reproducing a bug. If seeds are what crosses the
network, the handshake must also carry a generator version, because changing `generate.js` changes
every seed's stage.

## Problem kinds

Each kind is one thing a 4–7 year old has to read and answer. The stage always has the deck-and-shelf
at each end and the bad guys' wall with gaps (the Level 1 fort); the kinds are layered on top.

| Kind | What the kid meets | Shape | First met | In the PoC |
| --- | --- | --- | --- | --- |
| Open run | Nothing in the middle: a straight dash | no hill | Level 1 (when the hill is left out) | yes |
| Hill | A bump in the middle to jump on or walk round | `hill`, 1.8–2.4 wide, 0.5–0.8 high | Level 1 | yes |
| Wall with a gap | The bad guys' wall across the band; go round through a gap or smash it | one-high bricks at x 4.6, back and front gaps 0.8–1.4 | Level 1 | always |
| Tall middle | Two bricks stacked where the wall is thickest, so hopping isn't the answer there | second layer on the middle two bricks | Level 1 | yes |
| Moat | Syrup in the wall's gaps: wade slow, or smash through | puddle r 0.45 in each gap | Level 1 | yes |
| Field syrup | A sticky patch in each half of the field | mirrored puddle, r 0.4–0.55, \|x\| 2–2.6 | Level 1 | yes |
| Choke point | Two tall pillars in each team's third leave one gap to squeeze through | `deck` pillars 1.5 high (above `JUMP_UP`), gap 1.0–1.4 | Level 3 (proposed) | yes |
| Step up | The shelf deck is too high to jump to from the ground; a step beside it | deck 1.8 high, step 0.9 | Level 5 (proposed) | yes |
| Split route | A long low deck in a third: over it or round the front | `deck` 0.6 high along the band | later | no |

**A kind is first met in a hand-made level.** The rule that keeps generated stages fair to a kid:
a hand-made level introduces each kind on a stage a grown-up designed to teach it, and the generator
may use a kind only at or after that level. `UNLOCK` in `generate.js` is that table. Levels 1 and 2
already use every Level 1 kind, so choke points and step ups wait for hand-made Levels 3 and 5.

### Difficulty table

Difficulty is the level number a generated stage stands in for. Everything else already scaled by
level number (`REUSE-SPEC.md` §Bad guys, §Forts, §Power moves) uses the same number, so a generated
stage at difficulty 3 plays with 3 CPU bad guys, 3 fort pieces each and Level 3's moves.

| Difficulty | Kinds allowed | Problems per stage | Wall gaps | Bad guys (no grownups) | Fort pieces each |
| --- | --- | --- | --- | --- | --- |
| 1 | hill, tall middle, moat, field syrup (open run = no hill) | 2 | 0.8–1.4 | 1 | 2 |
| 2 | same | 2 | 0.8–1.2 | 2 | 2 |
| 3 | + choke point (always in at 3, its debut) | 3 | 0.8–1.0 | 3 | 3 |
| 4 | same | 3 | 0.8 | 4 | 3 |
| 5 | + step up (always in at 5) | 4 | 0.8 | 5 | 4 |
| 6+ | all | 4 | 0.8 | up to 8 | up to 6 |

Plus the wall, always. A newly unlocked kind is always in on its debut difficulty, like the fort pile
"newest first". The real difficulty dial stays the bad-guy count and, later, auto-scaling by donut
margin: terrain is for variety, not for being harder. The proof of concept bears this out (raid
times below).

**But that is only true for an empty stage run by today's AI** (user, 2026-10-14). Once both
teams build forts, and grownups play the bad guys against the kids, the terrain is what each side
builds *with*: a choke point is worth walling, a high deck is worth defending, a syrup gap is
worth leaving open for the raiders to wade. Then terrain does change difficulty, through how
the players use it. The raid-time numbers here measure a lone hero on a bare stage, so they can't
see that. Two follow-ups: CPU bad guys need to use terrain too (build their fort at the choke
points, defend from the high deck, route raids round syrup), or terrain only ever helps the
humans; and a generated stage should be judged with forts on it, e.g. raid time through each
side's best fort at that difficulty's pile size, not only bare. When auto-scaling exists, the same donut margin can pick the *next* generated
difficulty: a big win steps it up by one, never past the highest hand-made level the room has
finished; a loss keeps it (the spec never drops a level).

## Fitting the sticker card

The card is a grid of the hand-made levels' places; a stamp is the level's picker picture with a
tally, and the reward ladder hangs off each level's tally. Endless seeds don't fit a grid, and a
stamp nobody recognises is not a sticker anyone wants. Three ways in, in order of preference:

1. **Variants of a hand-made level.** "Play Level 3 again, surprise me": a generated stage at
   difficulty 3 in Level 3's theme, which counts as a finish of Level 3 on the card. The card,
   its save format (`{ "3": 12 }`) and the reward ladder stay exactly as they are; replaying a
   favourite level just stops being the same stage every time. This is the smallest change and
   the one I'd do first.
2. **A daily level,** seeded by the date (e.g. `20261014`) at the family's highest finished level,
   so siblings on different evenings, or cousins in another house, get the same stage. It earns
   one extra place on the card, "today's table", whose tally counts days played. That changes the
   save format (a `"daily"` key) and needs the generator version pinned, so it waits.
3. **A surprise level button** with no stamp at all: fine for a quick game, but kids notice when
   something gives nothing, so only as a fallback.

## Risks, and numbers that catch some of them

| Risk | Numeric guard | What the PoC measured |
| --- | --- | --- |
| Samey stages | distribution of kind combinations per difficulty; spread of raid times | 6 combinations at difficulty 1–3, 10 at 4–5, 15 at 6; raid median 4.6 s → 5.4 s from difficulty 1 to 5, so stages *play* alike |
| Same seed, same family | a seed's stage at difficulty d and d+1 share their picks | true today (the PRNG draws in the same order); use `seed * 31 + d` if that matters |
| Unfair sides | open-field raid time, heroes vs bad guys, within 10% (fort removed) | ratio 0.99–1.07 over 5,000 stages; the spread is the 0.2 nav grid against mirrored edges |
| Too slow or too quick to reach the enemy shelf | hero raid time through the fort in a band (2–12 s) | 4.3–6.3 s; Levels 1 and 2 are 5.0 s and 4.4 s |
| Clutter | problems per stage ≤ 4 | by construction |
| Unfair spawns | spawn is the sim's (next to the own shelf), so mirrored terrain mirrors spawns | covered by the fairness ratio |
| Too tight to squeeze through | narrowest gap ≥ 0.8 | by construction; not measured from the grid yet |
| No room to build | free cells in the heroes' build zone ≥ the team's fort pile (`piecesEach × team size`) | not checked; matters once the build round exists |
| Feels worse than hand-made | none; playtest | — |

What the playability test can't catch: whether a stage is fun, whether a choke point reads as a
squeeze or as a mistake, whether the camera frames the interesting part, and how CPU bad guys
behave on it (they don't exist yet, though they will route through the same nav grid). One small
known wart: the training dummy spawns at x −3, right against a choke pillar's edge.

## What the proof of concept showed

- `spinoff/generate.js`: `generateStage(seed, difficulty)` returns a `Stage`; `UNLOCK` is the
  kind-to-difficulty table. ESLint and typecheck clean.
- `spinoff/check-level.mjs`: the checks from `levels.test.mjs`, moved into `checkLevel(stage, at)`
  and `ticksToShelf(stage, team)` so both tests share them. `levels.test.mjs` is now three lines.
- `spinoff/generate.test.mjs` (in `npm run selfcheck`): 40 seeds × difficulties 1–5 by default,
  `SEEDS=` for more.

| Measure | Result |
| --- | --- |
| Pass rate, `checkLevel` | 5,000 / 5,000 (seeds 1–1000 × difficulties 1–5) |
| Determinism, same (seed, difficulty) → deep-equal stage | 100% |
| Terrain mirrored | 100% |
| Fairness, open-field raid ratio heroes / bad guys | 0.99–1.07 |
| Hero raid through the fort | 4.3–6.3 s |
| Time to generate one stage | ~0.002 ms |
| One sim raid (spawn to steal) | ~2.7 ms |
| All checks for one stage (three raids) | ~7 ms; the selfcheck's 200 stages take ~1.4 s |

Pass rates are 100% because the generator places things in fixed slots and so can't produce most
failures. That's the right design for a kids' game, but it means the test is guarding against
future edits, not proving the generator clever.

**Try one on the tablet:** `play.html?seed=123&difficulty=2` (hill-less, tall middle and moat) or
`play.html?seed=8&difficulty=5` (hill, choke points, step up, syrup). `levelFor` in `levels.js` builds
the stage from the query string in the breakfast theme; without `seed` nothing changes.

## Recommendation

Don't ship random levels yet. Next, smallest step: play five or six seeds on the tablet with a kid
(the two above plus a few more at difficulties 3 and 5) and see whether the choke point and step up
read at all. If they do, use the generator first as a design aid: generate, pick the good seeds by
eye, and keep them as hand-made levels or as the "surprise me" variants of a level (option 1 above),
which needs no change to the card. The daily level waits for multiplayer and a pinned generator version.
