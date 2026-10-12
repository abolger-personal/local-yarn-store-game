# Playing at Your Pace

How the shop stays fun to play, to solve and to spend time with, whether the player watches,
plans or reacts. This document pulls together the pacing ideas scattered across
[SPIKE-FUN.md](SPIKE-FUN.md), [characters/NEAR-MISS-AND-SUBSTITUTION.md](characters/NEAR-MISS-AND-SUBSTITUTION.md)
and [characters/REGULARS-AND-SHOP-CHARACTER.md](characters/REGULARS-AND-SHOP-CHARACTER.md) into
one plan, and adds the order for tomorrow as the planner's mechanic.

Where this document and SPIKE-FUN.md disagree, this one wins. SPIKE-FUN.md stays as the record of
the brainstorm.

---

## TLDR

**The player's pace only changes how many chances they catch, never whether they can progress.**

Nothing the player misses is lost for good: missed customers come back, requests stay on the
board, project bags wait, and a blank order slot is filled by the supplier. A slow player catches
fewer chances, a fast player catches more, and an idle player still sees the shop come to life.
Every mechanic in the game has to pass that test.

---

## 1. Where we are starting from

Measured against the code on 2026-10-03, not the specs:

| Today | Where | Why it matters |
| --- | --- | --- |
| Every customer acts on the same 4s round clock | `autoSeconds` in `store/core/config.js`, `advanceRound` in `visit.js` | a purchase takes two rounds, so the player has ~8s to react |
| 100% of considered items are bought | `visit.js`, the "MVP: 100%" comment | the arrangement cannot change the outcome |
| ~10 customers in the shop at once | `npcCount` | too many to read at diorama scale |
| The whole shop is rebuilt every morning | `restart()` in `store/sim/world.js` | nothing the player arranges survives the night |
| Each day's stock is seeded with what that day's customers want | `stockTheShop` / `seedWants` | stocking can never be wrong, so it can never be right either |

The last two are being fixed first (see §7, step 1), because no planning mechanic can be felt
while they hold.

---

## 2. Three players, one shop

| Player | What they do | Their mechanic |
| --- | --- | --- |
| **Idle** | watches | the shop runs itself: idle animations, dances, chatting, guestbook photos. Nothing decays |
| **Planner** | prepares | **the order for tomorrow** (§5), project bags, the request board, arranging between days |
| **Hands-on** | reacts | catching a customer who HESITATES, and handing them the thing |

No player type is required to touch the other two's mechanic. An idle player who never opens the
order form still gets deliveries; a planner who never catches a hesitation still sells.

---

## 3. Three timescales, each with its own control

| Timescale | What happens | How the player controls the pace |
| --- | --- | --- |
| **A moment** (seconds) | one customer decides on one item | **picking something up stops the round clock.** The wall clock's pendulum stops; that is the only "paused" signal |
| **A day** (minutes) | customers trickle in and out | **the break card on the counter** shuts the door and the queue waits outside. On game.html the speed button sets it: ▶ / ▶▶ / ▶▶▶ / ⏸, walking and rounds scaled together, ▶ by default; store.html keeps its auto checkbox and manual Space |
| **Many days** (sessions) | regulars, projects, requests, stock | **the order for tomorrow, project bags and the request board.** What a customer needs waits on a shelf or a form, not in the customer |

The round clock and the animation are already separate clocks (`advanceRound` is discrete, the
renderer interpolates), so stopping rounds never freezes the scene. The 30s experiment in
SPIKE-FUN.md failed because characters had no idle pose, not because long rounds are boring.

The speed is a WALKING speed (units per second), not a time per round. A fixed 1.4s of travel per
round made a long route a sprint: measured over 3,282 sim walks, median 2.85 units and max 8.66, so
3 to 12 units/s at the ease's peak against an honest top walk of 0.5 to 1.8 for these legs, with
the feet skating once the 3.4 steps/s cadence cap bound. At ▶ customers walk 0.24 units/s, under
every leg's top speed, and a round waits for its last walker (12s at the least); ▶▶ and ▶▶▶
multiply walking and divide the round and the departure stagger by 2 and 3, so the stagger stays
40% of a round as on store.html. See gameSpeed in characters/store/core/config.js.

---

## 4. Three merges

These are ideas from the three source documents that turn out to be the same object.

### 4a. The HESITATE beat is the reaction window

NEAR-MISS-AND-SUBSTITUTION.md's HESITATE (a customer unsure about a near-miss item) and
SPIKE-FUN.md's deliberation window are one beat. It serves:

- **the puzzle:** a near miss is where arrangement and adjacency argue for or against the item;
- **the hands-on player:** it is the moment there is time to act;
- **the characters:** its length and its pose are personality, readable from across the room.

It is built as a prescription the sim already supports: hesitate for N rounds, where N comes from
traits and affinity, and those rounds do not count toward MAX_ROUNDS. Every customer stays on the
one round clock.

### 4b. The hold shelf, project bags, the request board and choosing your regulars

The near-miss spec's cap 3 and the regulars spec's curation are already the same finite shelf.
It is also how a planner plays at their own pace: Marguerite's bag can be stocked on Tuesday
whether or not she is in the shop. The bag itself is specced in `characters/PROJECT-BAGS.md`.

### 4c. The counter is the only place to talk to customers

The guestbook, the break card, a friend asking for help and suggesting a project all live on the
counter. No menus. The order form is the exception: it is set between days, outside the shop at
night (§5, "Where the order is set").

### Patience grows with affinity

Strangers shop fast and cannot be helped in time. Regulars hesitate longer. Friends wait at the
counter until you get to them. The early shop is hard because nobody knows you; the late shop
relaxes around you because you earned it.

- **A friend's patience** (the tutorial friend): they do not run out of rounds while something they
  want is out where they can notice it, or buried where they can still dig. It ends as MAX_ROUNDS
  would once it is bought by someone else, never put out, or buried where they have already dug
  since their last buy there (DISPLAYS.md rule 9), so a day cannot stall.

---

## 5. The order for tomorrow

A real shop owner's biggest lever is what they order. This is the planner's mechanic.

### Rules

- **Ordering is optional.** A slot the player leaves blank is filled by the supplier. A player who
  never orders is not behind; they get the supplier's guess.
- **The order is a budget of slots, not money.** The game has no currency and this keeps it that
  way. The budget growing is a reward, like a bigger hold shelf.
- **Slots hold templates, not items.** "Worsted, wool, warm colours" or "a 5mm hook". The catalog
  picks the specific item at delivery, so there is still a surprise in the box, and what makes an
  order good is the player's knowledge of rules (NEAR-MISS §7), not memorised facts.
- **Deliveries land on the floor** in the morning, as DESIGN-DECISIONS.md §6 specifies. Sorting
  them opens the day.
- **Planners win by being right, not by working harder.** The payoff is the right yarn already
  being in the shop when the customer walks in.
- **Standing orders** ("always 2 sock-weight") let a planner set something up once and then play
  casually.
- The request board and the guestbook feed the form: "aran wool, back on day 12" is something to
  order on day 11.

### Treats: an order line, and a thank-you

Tea and biscuits keep people in the shop (HOW-THEY-SHOP.md §2d, "Keeping someone in the shop"),
and that is what lets a nearly-finished customer finish here and dance (DANCES.md). With no money,
treats are **earned** in two ways and **spent** by placing them.

**The object:** a **tin of treats** (tea and biscuits), a 1x1 item. A tin holds **4 servings**,
shown as biscuits on its open plate, so the player can see it emptying.

**Earned 1: an order line.** At night a line on the packing slip can be a tin of treats instead of
yarn or a notion (template `treats`). It costs one line of the budget (6 + yesterday's sales,
TUTORIAL.md §7.2), so tea is one fewer ball tomorrow: a real choice, earned by selling. The
supplier's choice never picks treats; only the player does.

**Earned 2: a thank-you for a gift of yarn.** When a stash **gift** (one-way, HOW-THEY-SHOP.md §2b
step 8) happens, the receiver owes one. On their next visit they bring a tin of treats and set it
on the counter: *"For Mira, and everyone."* Swapping already exists between customers; treats are
the swap back for a gift, so kindness in the circle comes back to the shop as the next party.

- **The Guestbook keeps the books:** the gift, and the treats that repay it, are 🎁 rows on both
  customers' pages (TUTORIAL.md §7.3). Over many visits these transactions add up into a
  relationship between the two: who gives to whom, who swaps, who bakes for whom. The player
  reads it to know who to seat together.
- This also settles a polite receiver (HOW-THEY-SHOP.md §2b step 9): a Politeness 4+ customer **accepts** a gift
  because they can repay it, and always brings the treats. A gift to an impolite customer is
  never repaid, which is a little story too.

**Spent: placed where it should work.**

- A tin **serves** only when it is on a **side table or the counter**. A customer passing within
  reach stops for a cup and a biscuit: one serving, +1 round in the shop. Placement decides who it
  helps: by the circle (everyone stays, a bigger dance), or beside a nearly-finished customer's
  armchair (they finish for sure).
- **Anywhere else, it is saved.** Lids stay on. The player may pick up any tin, including a gifted
  one, and keep it on a shelf or under the counter for a better day: a knit night, a regular who is
  close to finishing, or a slow afternoon.
- **Treats never go stale,** an empty tin is cleared at closing, and nobody minds if there is
  nothing to eat. Forgetting is cheap.
- **Who stops:** everyone, once per visit; Enthusiasm or Compassion 4+ customers come over for it
  from across the shop, and Orderliness 4+ customers never eat near the yarn.
- Treats are not stock: they do not count for sales, tidying, the donation box or the budget.

### Where the order is set: outside, at night

When the last customer leaves, the shop closes for the night: the screen fades from the shop to its
exterior (the front door's entry, shared from `characters/store/ui/exterior.js`), the door shut,
the sticky note reading *"Closed — back tomorrow"*, and **tomorrow's order as a packing slip taped to
the parcels waiting on the step** (TUTORIAL.md §7.2). Not a clipboard: a clipboard reads as a list of
jobs to act on, and the order is something arriving, not a task (decided 2026-10-03). Opening the door (click it, or Enter, since it is a real link) swings it
open, starts the next day, and fades back into the shop.

- **It waits.** The screen never advances by itself and nothing happens while it is up, so it is
  also the natural pause between days: the player's pace changes how many chances they catch,
  never whether they progress. The playground (`store.html`) keeps its auto-day timer and has no
  night.
- **What is shown is what arrives.** The order is built once, at closing (`planTomorrow()` in
  `store/sim/world.js`), written on the packing slip, and that same order is handed to
  `restart({ order })`; `deliver()` builds its own only when none is passed (the playground).
- **Built today, to be replaced by the slip:** a read-only clipboard: one row per slot in plain words (*4 balls of yarn — worsted or dk*,
  *2 patterns — for worsted or dk*, *a kit*), from `describeSlot()` in `inventory/supply.js`, with an
  empty box against each slot that will be the player's (`playerChoosable`). Choosing is not built;
  this is the screen it will happen on. Under the slots, one line about the day that ended
  (*Day 3: 5 signed the Guestbook*). No stats and no money.
- **Schedule:** the tutorial is three days. Night 1 shows the order read-only; **the first player
  line is handed over on night 2**, and from night 3 every line is the player's (`SCRIPT` in
  `supply.js`, commit 078670b).

### The scripted delivery is the tutorial

DESIGN-DECISIONS.md §6's authored days 1–10 become an order form that is gradually handed over.
The form looks the same on day 1 and day 50; the tutorial is the real mechanic with the script's
choices already filled in.

| Order for | Set on | Order form | What it teaches |
| --- | --- | --- | --- |
| days 1–2 | (start), night 1 | filled by the script; the player watches it arrive | deliveries land on the floor, and sorting them opens the day |
| day 3 | night 2 | one line is the player's | you can choose part of the order |
| day 4 on | night 3 on | every line is the player's; a blank line is the supplier's choice | ordering is up to you from here |

The tutorial is three days. What fills a blank line still follows §6's authored curve for days
4–10 (new weights and notions arriving gradually), then the supplier's procedural tail: pacing,
not tutorial.

The script uses the same templates the player will, so reading its orders is how a planner learns
what a good order looks like. §6's other promises survive unchanged: notions are withheld early
because the script owns those slots, the procedural tail and soft throttle start on day 11, and
blank slots are always filled, so the idle player is unaffected.

### Data shape

An order is an array of slots, `{ template, source }`, where `source` is `'script'`, `'player'` or
`'supplier'`. Delivery resolves templates against the catalog with the shop's seed. A
`playerChoosable` flag marks the slots the tutorial hands over. Player slots override script and
supplier slots.

---

## 6. Things this plan rules out

- **No mechanic may make a slow player lose progress.** Opportunity, yes; progress, never.
- **No pause button with a penalty meter.** Holding an item is free and unlimited.
- **Nothing that turns away a customer.** Curation is frequency, not membership
  (REGULARS-AND-SHOP-CHARACTER.md §2).
- **The rejected tells idea** at the bottom of SPIKE-FUN.md stays rejected.

---

## 7. Build order

Each step is playable on its own.

1. **Stock carries over between days, and a scripted delivery lands on the floor** (§5's data
   shape, days 1–10 script, day 11+ supplier tail with the soft throttle). Today's wants are no
   longer seeded, though seeding stays as a testing toggle. *Built 2026-10-03:*
   `inventory/supply.js` (pure, `supply.test.mjs`) and `restart()` / `deliver()` in
   `store/sim/world.js`. Still open: a fresh game fills to `stockCount` and THEN delivers day 1,
   so day 1 is not yet §6's "pile beside empty shelves" onboarding; changing the display or chair
   count rebuilds and loses stock; delivered items carry no provenance for destash yet.
2. **At most 3 customers in the shop, arriving a few at a time.** Config plus a door rule; it is
   also NEAR-MISS §7's attention budget.
3. **`miss()` and the tolerance table:** TAKE / HESITATE / PASS, replacing the 100% buy. Tune on
   `puzzle.html`.
4. **HESITATE as a visible beat,** several rounds long, length from traits, not counted against
   MAX_ROUNDS.
5. **Clock controls:** holding stops rounds, the pendulum, the speed setting, the break card.
6. **"Hand it to them":** click item, click customer, settles a hesitation in their favour.
7. **The order form** on the between-days screen, filling the slots the tutorial hands over.
   *Started 2026-10-03:* the screen exists on `game.html` (`store/ui/night.js`) and shows
   tomorrow's order. *2026-10-04:* the player's lines are chosen from a dropdown on the packing
   slip; the budget of free lines (TUTORIAL.md §7.2) is next.
8. **Affinity as a number,** controlling hesitation length and how often someone returns.
9. **Project bags, standing orders, the request board, suggestions.** Content, once 1–8 exist.

Steps 1, 3, 4 and 8 are pure simulation and testable in node next to `visit.test.mjs`.

### Already tried, outside this list

- **The Tidy the shop button** (`tidyShop` in `visit.js`) is a shortcut while playtesting. It
  becomes a mechanic only if the shop gets messier through the day and tidying costs something;
  Orderliness regulars would be the free version.
- **The floor stacks six big balls or four cones high** (`FLOOR_HEADROOM` in `config.js`, 48 layers).

---

## Open questions

- **Does a break cost anything?** (a) Free: the queue waits patiently. Fits this document's rule
  best and is the recommendation. (b) Strangers in the queue drift away, as SPIKE-FUN.md proposed.
- **Is a cap of 3 customers in the shop right?** The crowd could still appear as the queue outside
  and passers-by.
- **How much does a failed customer tell you?** Still open in DESIGN-DECISIONS.md under Guestbook
  hints. `puzzle.html` was built to answer it by playing at several reveal settings. It sets how
  hard step 3 may make the puzzle.
- ~~**Where does the order form appear?**~~ **Resolved:** automatically at closing time, on the
  between-days screen outside the shop at night (§5), not on the counter. It waits for the player.
- **Can the supplier ever say no?** Out of stock and backorders add texture but also frustration.
- **How big is the slot budget, and how does it grow?**
