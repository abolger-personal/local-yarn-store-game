# Roadmap

Everything the specs added up to 2026-10-03, merged into one build order. The specs stay the
source of truth for *what* each thing is; this file is only *what next, after what, and how we
know it works*. When a spec and this file disagree on design, the spec wins; on order, this file
does.

Sources: [TUTORIAL.md](TUTORIAL.md), [PLAYING-AT-YOUR-PACE.md](PLAYING-AT-YOUR-PACE.md) (PAYP),
[SCRIPTED-EVENTS.md](SCRIPTED-EVENTS.md), [VISUAL-DESIGN-2D.md](VISUAL-DESIGN-2D.md) (VD2D),
[DESIGN-DECISIONS.md](DESIGN-DECISIONS.md) (DD), and in `characters/`:
[ARRANGEMENT-RECIPES.md](characters/ARRANGEMENT-RECIPES.md) (RECIPES),
[PROJECTS-AND-AUTHORSHIP.md](characters/PROJECTS-AND-AUTHORSHIP.md) (P&A),
[HOW-THEY-SHOP.md](characters/HOW-THEY-SHOP.md) (HTS),
[PROJECT-BAGS.md](characters/PROJECT-BAGS.md) (BAGS), [DANCES.md](characters/DANCES.md),
[REGULARS-AND-SHOP-CHARACTER.md](characters/REGULARS-AND-SHOP-CHARACTER.md) (REG),
[NEAR-MISS-AND-SUBSTITUTION.md](characters/NEAR-MISS-AND-SUBSTITUTION.md) (NM),
[VISUAL-DESIGN-FINISHED-OBJ.md](characters/VISUAL-DESIGN-FINISHED-OBJ.md) (VDFO).

**Rules every item inherits:** rewards paying attention, never stresses you if you don't; no money;
no menus but the Guestbook, the board, the night screen and the corner stack; forgetting is cheap
(nothing missed is lost for good). Non-trivial logic leaves **one** small node check behind
(added to `npm run selfcheck`), named in each item's "done when".

Sizes: **S** an afternoon, **M** a day or two, **L** most of a week.

---

## TLDR: the next five

| # | Build | Why first |
| --- | --- | --- |
| 1 | **A1 Seeded rng in the sim world** | `makeWorld`/`makeNpc`/`maxRounds`/`buildOrder` default to `Math.random`. Nothing can be saved or replayed until the generator is a number. Unblocks A2, A3 and every pure-sim test after |
| 2 | **A2 `test:determinism`** | The regression net for every sim change below (and there are ~40). Cheapest while the sim is small; catches stray `Math.random` and iteration-order bugs |
| 3 | **A3 Autosave** | "No save button, ever" only works if the game saves itself. Doing it now forces every later system to stay plain data, instead of retrofitting 20 systems later |
| 4 | **B3 `miss()` + B4 tolerance (TAKE / HESITATE / PASS)** | Today 100% of considered items are bought, so arrangement cannot change an outcome. This is the first point where it does; tutorial day 2, recipes, companions and VERDICT all sit on it |
| 5 | **B7 The Guestbook as a witnessed event log** | The shared base for Guestbook detail, bonds, swap step 4, dance joiners, thank-you lines and gists. Put-backs, seats and chats are recorded with `witnessed`; note entries still have no `npcId`, and gifts aren't recorded |

---

## Already built (do not re-plan)

| What | Where | Commit |
| --- | --- | --- |
| Stock carries over between days; scripted days 1–10 + day 11+ supplier with soft throttle; deliveries land on the floor | `inventory/supply.js` (`carryOver`, `buildOrder`, `SCRIPT`), `supply.test.mjs` | 47c1638 |
| Tidy-the-shop button (playtest shortcut, not a mechanic) | `tidyShop` in `visit.js` | 47c1638 |
| Night screen: exterior, door opens tomorrow, packing slip with a dropdown on each player line | `store/ui/night.js`, `ui/exterior.js` | 47c1638, c038487, 95f8e99 |
| Front door, house lettering (47 glyphs), worn wood shared with the shop | `index.html`, `ui/lettering.js` + test, `scene/worn-wood.js` | 2123d60 |
| Game page: corner stack, top/side views, speed button ▶/▶▶/▶▶▶/⏸ (Space, P) | `characters/game.html`, `store/game.js`, `gameSpeed` in `core/config.js`, `speed.test.mjs` | c038487 |
| Sit-and-knit draft (plain one-colour rectangle) and the ready sparkle | `characters/craft-anim.js` + test, `sparkle.js`, `sit-and-knit.html` | 94be68a |
| Cable needle and buttons notions, wanted by patterns that call for them | `NOTION_NAMES` in `inventory/catalog.js`, `wantsFor` in `wip.js` | 6062a77 |
| Yarn palette in bold / muted / pastel families | `YARN_FAMILIES` in `inventory/yarn-look.js` | 27bce39 |
| three.js 0.186.1 | `package.json`, import maps | 907fb60 |
| Guestbook selfies, every day's pages, Customer of the Week board | `store/ui/book.js`, `board.js`, `photo.js` | fc0fbe5 |
| Five dances as data (riverdance, floss, attitude, pirouette, uptown-funk) | `DANCES` in `characters/motion.js` | — |
| Customers wearing their finished objects on `game.html` | `outfitOf`/`dressedCharacter` in `store/sim/world.js`, `sim/cast.js` | 2937627 |
| Sit-and-knit wired into the store (seated customers knit, ready sparkle) | `makeCraft`/`makeSparkle` in `store/sim/cast.js` | 2954c98 |
| Guestbook wording updated to the specs | `entryRows`/`DID` in `characters/guestbook.js` | aa836a2 |
| **D7** Running out and ready, sim side | `runningOut`/`readyWips` in `characters/wip.js`; sparkle from `checkReady` in `sim/cast.js` | 711c4e2 |
| **E5** Pot holder as a pattern type and a decor finished object | `PATTERN_TYPES` in `inventory/catalog.js`, `buildPotholder` in `garments.js` + test | 44499a5 |
| **F2** The ball band label; a customer click shows their tag | `store/ui/label.js` | 593619c, 098391c |
| **F3** Guestbook rows expand, detail or gist | `store/ui/book.js`, `entryRows` in `guestbook.js` | aa836a2 |
| **I1** The finishing push | `finishingPush` in `characters/visit.js` | a50f243 |

---

## The build order

Phases run top to bottom; items inside a phase can mostly run in parallel once their "after" is
met. Pure sim first (testable in node), then rendering, then content.

### Phase A: plain data (foundation)

| ID | Build | From | After | Size | Done when (the one check) |
| --- | --- | --- | --- | --- | --- |
| A1 | **Seeded rng in the world:** `world.rngState` is a number, `mulberry32` from `core/util.js` reads and advances it; every `rng = Math.random` default in `visit.js`, `wip.js`, `supply.js` takes the world's. Each morning it restarts at `hash(seed, day, attempt)`: only the dice reset, never the shop, so a day plays out from the seed and that morning's state alone. `attempt` lives in the save and goes up on every load, so a reload re-rolls the day (save-scumming is allowed, 2026-10-13) yet seed+day+attempt still replays exactly. Visual timing (pace, wait jitter, idle phase) never reads the sim's stream: it hashes `(seed, day, attempt, npc, round)`. Cosmetic-only code (npc looks, crowd, demos) keeps `Math.random`; an eslint `no-restricted-properties` rule bans `Math.random` in `characters/store/**` and the sim modules | DD §5 "Saving" | — | S | `visit.test.mjs`: `structuredClone` of a mid-game world compares deep-equal; two worlds from one seed take the same first 50 decisions; one morning run twice at one attempt matches, at attempt 0 vs 1 differs; `walk.test.mjs` no longer swaps `Math.random`. A3 adds: a load bumps `attempt` |
| A2 | **`test:determinism`:** a headless N-day runner (visit + wip + supply, no three.js), stable-stringify + small hash, two runs same seed match, different seed differs | DD §10.2 | A1, and a pure day hand-over (see conflict X1) | M | `tools/determinism.mjs` (or `sim/determinism.test.mjs`) passes for 100 days; add to selfcheck |
| A3 | **Autosave:** one `idb-keyval` slot, `set('save', world)` at every round boundary and on `visibilitychange`→hidden / `pagehide`; load settles walks, held items, reservations; `version` field | DD §5, §2; TUTORIAL §6 | A1 | M | `test:save`: clone round trip of a mid-game world equals, and continuing both copies a day gives the same A2 hash |

### Phase B: the puzzle core (pure sim)

| ID | Build | From | After | Size | Done when |
| --- | --- | --- | --- | --- | --- |
| B1 | **Cap 1: one project per visit** (`wantsOf` filters to today's WIP) | NM §7 cap 1; BAGS §1 | — | S | `wip.test.mjs`: an NPC with 3 WIPs wants only one slot's items |
| B2 | **Cap 2: knit at home** (progress in `rejoin()`) | NM §7 cap 2; TUTORIAL day 3 | — | S | test: a started WIP advances across `rejoin` and can finish between visits |
| B3 | **`miss(item, want)`**, `satisfies` = `miss === 0`; pattern **difficulty** as an attribute (`makePattern`) | NM §2, §8.1; NM open q. | — | S | test: the §2 tables (weight ±1/±2/±3, fibre family, tool kind ∞, allergy ∞) |
| B4 | **Tolerance table and bands:** `interact()` returns TAKE / HESITATE / PASS; substitutions recorded `{attribute, miss, item}` | NM §3, §8.2; PAYP §7.3 | B3 | M | test: an Orderliness 5 and an Enthusiasm 5 NPC at the same shelf diverge as §3 says. Tune on `puzzle.html` |
| B5 | **At most 3 in the shop, a few at a time** (door rule; `npcCount` is 2 today) | PAYP §7.2; NM §7 budget | — | S | test: arrivals never put a 4th NPC inside |
| B6 | **HESITATE as a beat:** N rounds from traits (+affinity once C1), not counted against `maxRounds`; arrangement adjacency tips the roll | PAYP §4a, §7.4; NM §3 | B4 | M | test: hesitation rounds don't shorten the visit; a near-miss beside its pattern is taken more often over 1000 seeded rolls |
| B7 | **B7 rest:** `npcId` on note entries; 🎁 gift rows (put-backs, seats and chats are already recorded with `witnessed`, `visit.js`) | TUTORIAL §7.3; REG §2 | — | S | test: every note entry carries an `npcId`; a gift yields a 🎁 row |
| B8 | **Bond = a count over the log** for a pair (chat 1/visit, in company 1/round, danced 2, swap/gift 3, treats 3) and its bands | REG §2 "Measuring it", §9.1 | B7 | S | test: a hand-built log gives the expected band for each pair |

### Phase C: who comes back (pure sim)

| ID | Build | From | After | Size | Done when |
| --- | --- | --- | --- | --- | --- |
| C1 | **Shop affinity per NPC**, never decreasing, banded Stranger / Regular / Friend / Fixture; replaces `willReturn` | REG §2, §9.1; PAYP §7.8 | A1 | M | test: the event table's gains band correctly; no event lowers it |
| C2 | **Return frequency and patience by tier** (friends wait at the counter; strangers can't be helped in time); hesitation length reads it | REG §9.2; PAYP §4 "Patience grows" | C1, B6 | S | test: over 30 seeded days a Friend returns more often than a Stranger |
| C3 | **Roster retention reconciled with affinity:** keep-pins for script roles, pending returns, bags on the hold shelf; LRU for the rest | DD §5 "Roster retention"; SCRIPTED §1 roles; BAGS §3d | C1 | S | `test:roster` (DD §10.6): an NPC with a pending return or a held bag is never evicted |

### Phase D: how they shop (pure sim)

| ID | Build | From | After | Size | Done when |
| --- | --- | --- | --- | --- | --- |
| D1 | **`start` on the WIP** (pattern / object / yarn), chosen from traits | HTS §1, §8.1 | A1 | S | test: starts come out in trait proportion over 10k seeded WIPs |
| D2 | **`wantsFor` branches** for object first and yarn first; yarn-first take amounts; stash goes home | HTS §2, §8.2 | D1, B1 | M | test per row of the "How much they take" table |
| D3 | **Shelf order is stripe order:** buys follow the display's reading order; `wornAs` keeps it | P&A §2a, §5.1; RECIPES §2.2 | — | S | test: a 5-colour run bought left-to-right yields stripes in that order |
| D4 | **Project's worth detector** over a display grid (shared with recipe matching); add the row to RECIPES | HTS §3, §8.3; RECIPES open q. | — | M | test: 8 matching blues read as a sweater's worth, 3 as a hat's; split by a shelf, neither |
| D5 | **Eye-catch weights** in browsing (run, new in, unlike last, first display, prefs; never the floor) | HTS §4, §8.4 | D2 | S | test: a yarn-first Openness 5 NPC picks the run over a lone ball most of the time |
| D6 | **Recipes as formation data:** stripes, colour block, fair isle; then held double/marled (stacking) and pom-pom; one recipe per layer, nearest-the-pattern wins | P&A §5.5; RECIPES §2–§4 | D3, D4, B4 (personality gates) | M | `test:sim` (DD §10.1): each recipe fires on its arrangement and NOT on a near-miss arrangement |
| D8 | **Provenance at the BUY:** display, place word, neighbours, recipe fired, who else was in, substitutions, start, giver. Partly built: place, beside, alsoIn (`provenance` in visit.js); left: start, recipe, substitutions, giver | P&A §4b, §5.6 | D1, D6, B4 (later fields fill in as their systems land) | M | test: a buy records a place word from the display's position and its actual neighbours |
| D9 | **Thank-you line:** pure chooser over provenance × the strongest trait; short (≤24 chars) and full forms; no template repeat in the last several cards. Partly built: trait lines short and full (guestbook.js); left: the no-repeat rule and the later provenance fields | P&A §4b, §5.6; HTS §6 | D8 | M | test: every chosen line names at least one recorded fact, and every short form fits 24 chars |

### Phase E: scripts and the tutorial

| ID | Build | From | After | Size | Done when |
| --- | --- | --- | --- | --- | --- |
| E1 | **Script data shape + trigger decision** (pure): given a script and an event stream, which beats fire, once each; roles stored `role → npcId` | SCRIPTED §1, §4.1 | A1 | M | test: a 3-day event stream fires each beat once, `dayStart: [1,3]` three times |
| E2 | **The six hooks:** `scriptEvent(kind, detail)` at day start, day end, arrival, buy, sign, return | SCRIPTED §2, §4.2 | E1 | S | test: a fake script logs all six kinds over one headless day |
| E3 | **Day-1 actions:** `cast`, `seed … facing`, `note`, `order`; **the counter note** (Needle Tips on the counter) | SCRIPTED §4.3; TUTORIAL §2 | E2 | M | test: day 1 of the tutorial script seeds the pattern on the table the friend faces |
| E4 | **Move `SCRIPT` out of `supply.js`** into the tutorial script (day 1's 3-item shop and the night-2 line are built: `tutorialDay1`, `SCRIPT` day 3 `pick`) | SCRIPTED §4.4; TUTORIAL day 1, night 2; PAYP §5 | E3 | M | `supply.test.mjs` + a script test: day 1 holds exactly pattern + hook + ball; night 2 has one `playerChoosable` slot |
| E6 | **Tutorial days 1–3 end to end:** the friend role (`keep`), `returns` after 2 days, `photo`, decor selfie. Built hard-coded in `world.js` (`openTutorial`, `TUTORIAL_HOLD`), checked by walk.test.mjs; what's left is moving it onto E1–E4 | TUTORIAL §4; SCRIPTED §4.5 | E4, B2, C3 | M | headless test: an idle player reaches day 3 with the friend's pot holder selfie on the board |

### Phase F: controls and information (rendering + UI)

| ID | Build | From | After | Size | Done when |
| --- | --- | --- | --- | --- | --- |
| F1 | **Clock controls:** holding stops rounds; the wall clock's pendulum; the **break card** on the counter mirrors ⏸ ("Back after this row") | PAYP §3, §7.5; TUTORIAL §3 | speed button (built) | S | `speed.test.mjs`: holding an item and ⏸ both stop `advanceRound`, neither stops animation |
| F4 | **"Hand it to them":** click item, click customer, settles a hesitation in their favour | PAYP §7.6 | B6 | M | test: a handed item during HESITATE resolves TAKE |
| F5 | **The order form:** the packing slip on parcels by the door, budget 6 + sold, any template, "supplier's choice", one supplier sample outside the budget | TUTORIAL §7.2; PAYP §5, §7.7 | E4 (seam `chosen` already in `buildOrder`) | M–L | `supply.test.mjs`: budget = 6 + sold; blank lines filled; sample always present and outside the count |
| F6 | **Donation box:** player-filled, holds ≤ that night's budget, empties overnight; replaces automatic destash | TUTORIAL §7.2 | F5 | M | test: overflow stays in the box for the next night |
| F7 | **Treats:** tin (4 servings) as an order line, serves only on a side table or the counter, +1 round, lids on elsewhere; not stock | PAYP §5 "Treats"; HTS §2d.4 | F5 | M | test: a tin on a shelf serves nobody; on the counter serves each passer once per visit |
| F8 | **Picture bubbles** from sim state; explicitness by personality; held while paused; the `say` action | TUTORIAL §7.4; SCRIPTED actions | B7 | L | test: a chatty NPC's bubble names the exact want, a quiet one's only the project |
| F9 | **Audit rounds against what's drawn:** for every action, does its round read on screen as what the sim did? Rounds need not be real time, and per-NPC offsets keep the shop from ticking like a clock, but with one customer in the shop every gap shows. Found so far (2026-10-12): the round that finishes a WIP drew no craft; a lent piece was never drawn; a sit round reads as "thinking" before the work round; waits leaned in at empty displays | playtests of 0.0.1 | — | M | a headless per-action table over seeded days: every action's round has a pose that shows it, no seated or standing idle longer than ~1 s before the action it leads to, and one-customer days look continuous |
| F10 | **Seasonal colourway packs:** add-on name packs (`COLOURWAY_PACKS` in `inventory/css-colours.js`, a yarn's `namePack`), e.g. Christmas red, Spooky Spider red; TODO(spec): how a pack arrives (a seasonal order line? a supplier sample?) and whether pack yarn is a limited run | VISUAL-DESIGN-2D.md "Yarn colour words" | — | S | a yarn with `namePack: 'halloween'` reads its pack's word on the band, and every pack has one word per palette colour |

### Phase G: project bags and the hold shelf

| ID | Build | From | After | Size | Done when |
| --- | --- | --- | --- | --- | --- |
| G1 | **The bag as a view of the WIP:** drawstring mesh tinted per customer, balls poking out, beside the chair when seated | BAGS §7.1; P&A §5.3 | B1 | M | test: the bag's visible balls equal today's WIP yarn (no own contents) |
| G2 | **Pattern tag on the handle + bag label** (carried: only what shows; held: full ball band); the witnessed knitter's ball band | BAGS §7.2; P&A §5.4 | G1, F2, B7 | S | test: a carried, unwitnessed bag's label hides the requirements |
| G3 | **Hold shelf** display (3 bag slots, 5 later); leaving a bag on the counter, shelving to accept, unshelved bags go home at closing; first time is `unlock: 'hold-shelf'` | BAGS §7.3–4; TUTORIAL §5 | G1, C1 (regulars), E3 | M | test: a regular stuck on an unstocked want leaves the bag; at closing an unshelved bag goes home |
| G4 | **Add stock to a held bag** (reserved, ordered) and **collection** with accept or put back | BAGS §7.5; P&A §2b | G3, B4 | M | test: an Orderliness 5 owner puts back a different dye lot; accepted items count as sales |
| G5 | **Stash returns** carrying the bag | HTS §8.5 | G1, D2 | S | test: a yarn-first slot with stash comes back wanting a pattern for it |

### Phase H: company, swaps and seats

| ID | Build | From | After | Size | Done when |
| --- | --- | --- | --- | --- | --- |
| H1 | **In company and circles:** pure over seat `x/z/facing` and the line-of-sight ray (2.4 m, dot ≥ −0.2) | HTS §2c, §8.6 | — | S | test on the default layout: at least one pair in company, not a full circle |
| H2 | **Personality seat choice + half-rate knitting in company** | HTS §2d.1–2 | H1 | S | test: a Withdrawal 5 NPC picks the quiet chair when one exists |
| H3 | **The swap check:** ten steps as one pure function of two NPCs + setting; records 🎁 rows and the giver in provenance | HTS §2b, §8.7 | H1, B8, D2, C1 | M | one failing case per step (10 asserts) |
| H4 | **Gift repaid with treats** (Politeness 4+ receiver brings a tin next visit) | PAYP §5 "Earned 2"; HTS §2b.9 | H3, F7 | S | test: a gift to a Politeness 4 receiver schedules a tin; to Politeness 2, none |
| H5 | **Save a seat:** the chair seat as a one-layer stacking surface; `WALK_TO_SEAT` prefers a saved chair whose item suits; a held bag moved to a chair | HTS §2d, §8.8; BAGS §7.6 | H2, G3 | M | test: a pattern on a chair draws the NPC it `satisfies`, then seat choice still applies |
| H6 | **Relationships on a customer's Guestbook page** (who they give to, swap with, bake for) | TUTORIAL §7.3 | B8, F3 | S | test: the page lists partners by bond, most first |

### Phase I: finishing in the shop

| ID | Build | From | After | Size | Done when |
| --- | --- | --- | --- | --- | --- |
| I2 | **Dance by personality** (pure) + **clap** + **wiggle** in `DANCES` | DANCES BO 2, "To do" | — | S | `motion.test.mjs`: picker matches the table; clap and wiggle are looping with no root extras |
| I3 | **Unison joiners:** in company + Friends-bond anywhere + Enthusiasm 4+; everyone else claps; travel zeroed without room | DANCES BO 3 | I2, H1, B8 | M | test: joiner set for a hand-built shop equals the rule |
| I4 | **Put it on, then dance;** cast-off sparkle (bigger cousin of `sparkle.js`) | DANCES BO 4 | I1, wearing (in progress) | S | — (render; covered by I1/I3 tests) |
| I5 | **Group selfie + Guestbook dance mark;** affinity +5/+1 and bond +2 | DANCES BO 5; REG §2 | I3, C1, B7 | M | test: one finish with 3 dancers adds +5, +1×3 and three "danced" log events |

### Phase J: rendering and art

| ID | Build | From | After | Size | Done when |
| --- | --- | --- | --- | --- | --- |
| J1 | **Customers' hands:** five self-hosted OFL fonts in `fonts/` + `hands.css`; hand = pure function of traits; board awaits `document.fonts.load()`; About lists them; polaroid margin is name + short line; clicking a polaroid shows the full note and glows the named display | VD2D Type, log 22–24; P&A §4b, §5.6 | D9 | M | test: `handFor(traits)` picks per the tie order; a `measureText` check holds x-height ≥ 7px at margin size (falls back to Caveat if not) |
| J2 | **The full sit-and-knit piece:** colours in `wornAs` order showing the recipe as it grows; the silhouette's generator clipped by progress; where it rests (hanging / pooling / folded) | VDFO §4b TODO | D3, D6, in-progress wiring | L | `craft-anim.test.mjs`: at 50% a striped scarf shows the first half of its stripes, in order |
| J3 | **Recipe cards** in the back of the Guestbook (blank until found) | P&A §4, §5.7 | D6, F3 | M | test: a recipe's first fire adds its card once |
| J4 | **Running-out tell rendered** (tail held up, floor ball shrinking) | P&A §1; BAGS §2 | D7, G1 | S | — (render of D7) |

### Phase K: content and depth

| ID | Build | From | After | Size | Done when |
| --- | --- | --- | --- | --- | --- |
| K1 | **Secret requirements and VERDICT** at `workRound`'s finish | NM §4–5, §8.4 | B4 | M | test: a `seamless` pattern with two dye lots comes out COMPROMISED |
| K2 | **The rest of the recipes** (halo, fade, checks, ombré, motif, seamless, contrast trim, cables, lace, rib, fringe, picot, tassel, buttons, flower, oversized, project's worth) | RECIPES §3 | D6 | L (content) | each row's positive and negative case in `test:sim` |
| K3 | **Discoveries** as event-triggered beats, at most one a day | TUTORIAL §5 | E2, the system each unlocks | M | test: two triggers on one day defer the second |
| K4 | **Referral** (bond correlates, taste doesn't) | REG §4, §9.3 | C1, B8 | M | test: a referral shares arrival and social traits, rolls prefs fresh |
| K5 | **Dragged-along and conversion** | REG §4c, §9.4 | K4, H2 | S | test: a non-crafter's first prefs come from what sat by their seat |
| K6 | **Companion modifiers on HESITATE** | REG §5, §9.5 | B6 | S | test: an Enthusiasm 5 companion raises the take rate |
| K7 | **Allergies** (hard ∞, Guestbook line on first refusal) | REG §7, §9.6; NM §2 | B3 | S | test: no trait moves an allergic NPC to TAKE |
| K8 | **Taste change on a good finish, aversions on a bad one** (additive, ceiling 6, announced) | REG §7, §9.7–8 | K1 | S | test: a preference once gained is never lost |
| K9 | **Rendered VERDICT variants** | NM §8.5 | K1 | L | — (render) |
| K10 | **Standing orders, request board, suggestions** | PAYP §7.9; REG §3 | F5, C1 | M | test: a standing order fills its line every night until removed |
| K11 | **Offer a seat, introduce** (customer as a pickable actor) | HTS §2d "later" | H5, F2 | M | test: an introduced pair passes swap step 4 and step 5 once |
| K12 | **Fixture jobs** (Tidier first, Teacher most valuable) | REG §6, §9.9 | C1 | M each | test per job |
| K13 | **Knit night, swap basket, swatch wall, frog bin** | HTS §2d.5–6; NM §5b | E1, H3, K1 | M each | test per item |

**Count:** 3 + 8 + 3 + 9 + 6 + 8 + 5 + 6 + 5 + 4 + 13 = **70 items**.

---

## Cross-spec dependency chains

The ones that cross documents, so nobody builds the far end first:

1. **Plain data:** A1 seeded rng → A3 autosave → A2 `test:determinism` → `test:save`. Every pure-sim
   check below reuses A1's seed.
2. **Attention → relationship → reward:** B7 witnessed log → F3 Guestbook detail → B8 bonds counted
   from the log → H3 swap step 4 ("they know each other") → I3 dance joiners (Friends dance from
   anywhere) → I5 group selfie.
3. **Bags → shelf → seats:** G1 carried bag → G3 hold shelf (needs C1 "regulars and above") → G4
   filling a bag (needs B4 to accept or put back) → H5 save a seat (a bag on a chair).
4. **Provenance → line → handwriting:** D8 provenance at BUY (fields from D1 start, D6 recipe, B4
   substitutions, H3 giver) → D9 thank-you line → J1 hands on the polaroid.
5. **In-company geometry:** H1 → H3 swaps (setting and the 0.2/0.4/0.6 roll), H2 seat choice and
   half-rate knitting, H5 save a seat, I3 dance joiners, B8 bond weight "1 per round".
6. **Near miss → everything after:** B3 → B4 → B6 HESITATE → F4 hand it over, K6 companions, C2
   patience; B4 → G4 bag collection, D6 recipe gates, K1 VERDICT → K8 taste change.
7. **Tutorial:** E1–E4 scripts → E5 pot holder → B2 knit at home (bought day 1, back day 3) → E6.
   Tutorial day 2 ("grouped sells better") needs B4, or grouping can't change anything.
8. **Treats:** F5 order lines → F7 tins → H4 repaid gifts (also needs H3) → I1 keeping a finisher in
   the shop.

---

## Conflicts and gaps

| # | Conflict or gap | Where | Proposed resolution |
| --- | --- | --- | --- |
| X1 | **The day loop is not headless.** `restart()`/`deliver()` live in `store/sim/world.js`, which imports three.js, the scene and module-level state (`let roster`). `test:determinism` (DD §10.2) and `structuredClone(world)` (DD §5) both assume the sim world is one plain object | DD §5, §10; code | Pull the day hand-over (close, `carryOver`, `buildOrder`, arrivals, `rejoin`) into a pure `nextDay(world)` beside `visit.js`; `world.js` calls it and rebuilds meshes. Move `roster` into the world. Part of A2 |
| X3 | **Order shape: fixed slots vs a budget.** PAYP §5: an order is fixed slots, some `playerChoosable`, holding templates. TUTORIAL §7.2: a budget of 6 + sold, "anything in the catalogue". Also: items or templates? | PAYP §5; TUTORIAL §7.2 | Budget of 6 + sold lines, each line a **template** (keeps PAYP's "surprise in the box" and rules-not-facts). The script's fixed slots become script-filled lines |
| X5 | **Destash.** DD §6: automatic overnight destash from day 11 by `lastPlacedDay`. TUTORIAL §7.2: the player-filled donation box replaces it | DD §6; TUTORIAL §7.2 | Donation box wins. Keep `selectDestashCandidates()` unbuilt unless F6 proves too slow in play (then it only *suggests*, by putting the least-loved items in the box) |
| X6 | **Hidden stash "immutable for the NPC's lifetime"** (DD §5 NPCs) vs stash that moves between customers (HTS §2b) and preferences that grow (REG §7) | DD §5; HTS §2b; REG §7 | Amend DD: traits and allergies are immutable; stash and prefs change only by observable events (a swap, a finish), each written to the Guestbook |
| X7 | **Swaps need stash in the shop, but bags leave it at home.** BAGS §1: "Their other WIP slots, stash included, stay at home." HTS §2b step 2 needs the giver to *have* a stash slot in the shop | BAGS §1; HTS §2b | **Decided 2026-10-03:** stash is one WIP slot holding a pile of extra yarn, mostly at home; only the stash brought along in today's bag can be given (HTS §2, §2b step 2; BAGS §1). Was proposed: A giver can only give the stash in today's bag. Today's one project may *be* a stash bag (yarn-first with no pattern), which is exactly when they're looking. Say so in HTS §2b step 2 |
| X8 | **Bonds counted from the Guestbook, but the Guestbook only details what was witnessed.** If bonds read the player-visible book, unwatched friendships never grow, and attention becomes required | REG §2; TUTORIAL §7.3 | **Decided 2026-10-03:** bonds count the full log, witnessed or not, so friendships grow without attention; events the player fostered count ×3, so they grow much faster with it (REG §2 "Measuring it") |
| X9 | **Guestbook entries name NPCs by `name`.** Bonds, pages and swaps need a stable id; note entries have no `npcId` today | `signGuestbook` in `visit.js` | B7: every entry carries `npcId` |
| X10 | **Concurrent customers: ~10 vs ≤3.** DD §4 targets ~10 in the shop; PAYP §7.2 and NM §7 cap at 3 (config has 2) | DD §4; PAYP §7.2 | ≤3 shopping customers inside; the crowd is the queue outside and seated knitters. Keep ~10 as the render budget (events, knit night). Note in DD §4 |
| X11 | **"Colour family" means two things.** Order templates and the ball band use hue *colour family* (`family: true`); the palette now has *families* bold / muted / pastel (`YARN_FAMILIES`). NM §2 also says wrapped hue index **is** colour distance, which ignores lightness and neutrals (muted includes chroma 0) | supply.js; yarn-look.js; NM §2 | Rename the palette ones **tones** (bold / muted / pastel tone). "Goes with" = near hue index **and** same tone; greys (chroma < ~0.03) go with everything. Answers part of NM's open hue question |
| X12 | **No external fonts vs five font files.** VD2D Principles: "No external fonts" | VD2D Principles vs Type | Already reconciled in VD2D (self-hosted, customers only, house lettering stays paths). Reword the principle to "no network fonts" |
| X13 | **How many recipes at launch:** P&A says fourteen; RECIPES has 25 rows. "Can recipes combine?" is open in P&A but answered in RECIPES §2.5 (one per layer). "Big/small for fair isle" is open in P&A, defined in RECIPES §2.1 (weight size class) | P&A open q.; RECIPES §2 | RECIPES is canonical: close those P&A questions with links. Launch set = RECIPES' six (stripes, colour block, seamless, fringe, pom-pom, held double) + fair isle, since it already draws |
| X14 | **WIP progress vs "knits at home".** DANCES' finishing push uses "the progress formula against their remaining visit"; `workRound` is per-round in the shop, and cap 2 (knit at home) has no rate yet | DANCES; NM §7; `wip.js` | B2 defines home progress as k × `workRound` per day away; I1 reads the same formula |
| X15 | **The `bag` wear slot.** `WEAR_SLOTS` includes `'bag'` (a knitted bag pattern worn); BAGS §5 says the project bag is a different object | `wip.js`; BAGS §5 | Keep both; a worn knitted bag *becomes* their project bag's look (BAGS §5 "nice touch"). Name check only |
| X16 | **Undefined references:** the progress formula (DANCES → WIP-AND-FINISHED-OBJ-FORMATION.md, which doesn't give one); `DISPLAYS.md` (cited by BAGS §3d, NM §5b: it exists at `inventory/DISPLAYS.md`, but has no hold-shelf display kind yet); the rug's effect "a little faster" (HTS §2d.4) and the armchair "+2 rounds" have no home in code; knit night needs a weekday calendar (REG open q.) | various | Define where built: X14 for progress; add the hold shelf as a display kind in `inventory/DISPLAYS.md`; rug = ×1.25 knitting, first guess; weekdays when K13 needs them |
| X17 | **Reader fixture vs never telling secrets.** NM open q. proposes the player is never told a secret requirement; REG §6's Reader reads them aloud | NM §4; REG §6 | Not a contradiction if the Reader is earned late (Fixture tier). Close the NM question: "only through a Reader, earned" |

---

## Open questions (deduplicated)

Each with the spec's own proposal where it has one. ✅ = proposal recorded, needs a yes; ❓ = no
proposal yet.

| Question | From | Proposal |
| --- | --- | --- |
| Does a break cost anything? | PAYP | Decided: TUTORIAL §3 (free) |
| Cap of 3 customers right? | PAYP; NM §7 | ✅ Yes, crowd as the queue outside (X10) |
| Stock growth when the player never donates | TUTORIAL | ✅ The extra 6 eases off as the shop fills (never the replacement for what sold) |
| How big is the order budget and how does it grow? | PAYP | Decided: TUTORIAL §7.2 (6 + sold) |
| Can the supplier say no (out of stock, backorders)? | PAYP | ❓ Suggest no for MVP: frustration with no attention payoff |
| Donation box too slow? | TUTORIAL §7.2 | ✅ Dial: capacity 2× the budget |
| Does the counter note exist from day 1? | TUTORIAL | ❓ |
| Returning player on day 1 of a new game; where does "new game" live without a menu? | TUTORIAL §6 | ✅ (partly) "Closed for renovation" on the break card's back |
| The discovery triggers | TUTORIAL §5 | ✅ The §5 table, at most one a day |
| Two scripts at once? | SCRIPTED | ✅ Yes; the later-started script's note wins that day |
| Event-trigger conditions beyond role and kind | SCRIPTED | ✅ Start without; add when a script needs one |
| Script text and translation | SCRIPTED | ✅ Inline for now |
| How much does a failed customer tell you? | PAYP; DD | ✅ Resolved: what they picked up and put back (TUTORIAL §7.3) |
| Default graphics tier; does High earn its shadow map? | DD §4 | ❓ Default Medium or measure on first load; home is the About panel (TUTORIAL §6) |
| The tutorial friend's start | HTS | ✅ Always object first, type pot holder |
| Is the start shown on the label? | HTS | ✅ Behaviour only |
| Swap numbers (half rate, 2.4 m, −0.2, 0.2/0.4/0.6) | HTS | ✅ First guesses; tune in play |
| Hooved species carrying a bag | BAGS | ✅ Across the body, or at their feet |
| Project bags as stock | BAGS | ✅ Later, if at all |
| Reward for a collected held bag | BAGS | ✅ Nothing extra beyond sale + affinity; the thank-you line remembers it |
| How many recipes at launch | RECIPES; P&A | ✅ Five or six first (X13) |
| Held double and the units rule (a held-double sweater = 16 balls) | RECIPES | ❓ Maybe scale a pattern's units with weight |
| Big/small for fair isle; can recipes combine? | P&A | ✅ Answered in RECIPES §2.1, §2.5 (X13) |
| Fades and marled stripes need new rendering | RECIPES | ✅ Worth it for the advanced tier (K2, J2) |
| How does the player see a tier? | REG | ❓ Candidates: greeting, a bag on the hold shelf, pages in the Guestbook |
| Do groups arrive on a schedule? | REG | ✅ Until a weekday calendar exists, a group is an arrival of 2–3 at once |
| Do aversions fade? | REG | ❓ If so, the fade must be announced in the Guestbook |
| Is the rival unpleasant? | REG | ✅ Compete over stock, perfectly nice about it |
| Is hue adjacency the right colour model? | NM | ✅ Partly: X11 (tones + neutrals) |
| Can an NPC swap a substitution out later? | NM | ❓ Needs a "return to shelf" action |
| Is a secret requirement ever told outright? | NM | ✅ No, except via an earned Reader fixture (X17) |
| Pattern difficulty doesn't exist yet | NM | ✅ Build it in B3, tied to Intellect per CHARACTER-ATTRIBUTES.md |
| Who swatches, and what it changes | VDFO §4 | ❓ Open in the WIP / near-miss systems |
| Swatch wall reach | NM §5b | ✅ Shop-wide first |
| Allergy visibility | REG §7 | ✅ The first refusal writes the Guestbook line |
| Saving: `idb-keyval` or `localStorage` | DD §5 | ✅ Decide at A3: `localStorage` + JSON if the save stays well under 1 MB |
