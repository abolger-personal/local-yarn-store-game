# Regulars and Shop Character

Who comes back, how the player decides that, who they bring with them, and how a cast of regulars
turns into the character of the shop.

Companion to `CHARACTER-ATTRIBUTES.md` (the ten traits), `CHARACTER-VISIT.md` (one visit),
`NEAR-MISS-AND-SUBSTITUTION.md` (§5 the outcomes that become the decor, §7 the hold shelf that
caps the cast) and `WEARABLE-FINISHED-OBJ.md` (objects lent to the shop). Trait names are the exact
ten and are never substituted with synonyms.

---

## TLDR

**The player chooses their cast, by serving people well.** Not from a roster screen — by solving
the arrangement puzzle for somebody, giving them a place on the hold shelf, and putting what they
made where everyone can see it.

Then the cast becomes the shop. A shop full of precise crafters stays tidy and fills with exact,
matched objects; a shop full of enthusiastic ones is chaos and fills with glorious nonsense. Same
room, same shelves, different place — and the player picked it.

Two things this document commits to that are worth stating up front:

1. **Nobody is ever turned away.** Curation is FREQUENCY, not membership.
2. **A friend brings a friend — but not someone with the same taste.** The bond correlates. The
   taste does not.

---

## 1. What exists today

Being honest about the starting line, because most of this is not built:

| Exists | Where |
| --- | --- |
| `npc.willReturn`, set on any purchase or crafting progress | `visit.js` |
| `world.returning` collected as NPCs leave; a module-level `roster` that survives the day | `sim/world.js` |
| `rejoin()` keeping traits, prefs, earned skill, WIPs and worn objects across days | `visit.js` |
| `npc.visits`, the only cumulative number an NPC carries | `visit.js` |
| The Guestbook, with real entries and tags | `visit.js` |

| Does NOT exist | Note |
| --- | --- |
| **Reputation, in any form** | no sales histogram, no drift, nothing accumulates but `visits` |
| Any player influence over who returns | `willReturn` fires on ANY sale, to anyone |
| Any limit on the roster | it grows without bound |
| Any relationship between NPCs | nobody knows anybody |
| `SHOP_RANGE` as a player choice | a frozen constant in `catalog.js`, with a TODO saying it should not be |

So today the cast is decided by **luck and array order**: whoever happened to buy something, in the
order they bought it, trimmed to `npcCount` by `roster.slice()`. Everything below replaces that.

---

## 2. Affinity is frequency, not membership

The obvious design — a roster with slots, where somebody gets bumped — is wrong for this game. It
turns a shop into a management screen and it requires rejecting people, which is the one thing a
cozy game must never make the player do.

So affinity does not decide *whether* someone may come back. It decides **how often, how long they
stay, and how much they will ask of you**:

| Tier | Comes back | In the shop | Asks |
| --- | --- | --- | --- |
| **Stranger** | rarely, by chance | short visit, no patience, cannot be helped in time | nothing |
| **Regular** | predictably | deliberates longer; will wait a moment for you | leaves a trace: a project bag, a request on the board |
| **Friend** | often, and on purpose | waits as long as it takes | comes to the counter and says what they need |
| **Fixture** | lives there, effectively | works: see §6 | offers rather than asks |

Nobody is refused. Some people simply become the furniture of the shop and others drift past, and
which is which is the sum of what the player did for them.

### The scarcity that makes it a choice

`NEAR-MISS-AND-SUBSTITUTION.md` §7 caps the hold shelf at about five project bags, so the player
can only actively carry a few people's projects at a time. **That cap is the curation mechanic.**
It is physical, visible, reversible, and expanding it is a real reward. The player's attention is
the scarce resource, exactly as it should be.

---

### Measuring it: shop affinity and bonds

Two measures, both hidden from the player, both shown only through behaviour. Every other spec
that says "affinity" or "acquainted" means one of these.

**1. Shop affinity: one number per customer, stored.** It is how they feel about the shop, and it
is banded into the four tiers above. It **never goes down**: neglect only means they visit less
often (§2), so there is no negative state to repair.

| Event | Gain |
| --- | --- |
| a sale | +1 |
| a near miss solved for them (NEAR-MISS §3) | +3 |
| their project bag kept and collected (PROJECT-BAGS.md §3c) | +3 |
| something they made displayed, or a lent object handed back (§3) | +3 |
| an in-shop finish, with its dance (DANCES.md) | +5 |
| dancing at someone else's finish | +1 |

| Tier | Affinity |
| --- | --- |
| Stranger | 0–4 |
| Regular | 5–19 |
| Friend | 20–49 |
| Fixture | 50+ |

First guesses, for playtesting; the shape matters more than the numbers: sales alone make a
regular slowly, attention makes a friend.

**2. Bond: between two customers, counted, not stored.** A bond is the pair's shared history, so
it is **counted from the Guestbook's record of the two of them** (TUTORIAL.md §7.3) rather than
kept as its own number. The book and the bond can never disagree, and the relationship is exactly
the transactions tracked over time.

| Shared event | Weight |
| --- | --- |
| chatted (standing, the `WAIT` chat) | 1 per visit |
| **sat in company** (HOW-THEY-SHOP.md §2c) | **1 per round** |
| danced together (DANCES.md) | 2 |
| a stash swap or gift (HOW-THEY-SHOP.md §2b) | 3 |
| treats brought back for a gift (PLAYING-AT-YOUR-PACE.md §5) | 3 |

Sitting in company counts **every round** they spend together, so a long afternoon side by side is
worth more than a quick chat, and seating people together is how the player grows a bond fastest.

| Band | Bond | Means |
| --- | --- | --- |
| Strangers | 0 | — |
| **Acquainted** | 1–9 | passes the swap's "know each other" step (HOW-THEY-SHOP.md §2b step 4) |
| **Friends** | 10–29 | choose seats in company with each other; the swap roll (step 10) is likelier; **join each other's finishing dance from anywhere in the shop** (DANCES.md) |
| **Close** | 30+ | arrive together sometimes (the group, §4b); walk over to dance beside each other |

- **Referral** (§4a) starts a pair at Friends: the friend who brought them.
- **Rivals** (§4b) are a relationship type, not a bond level: their bond can grow, but they never
  pass the swap's step 4.
- **The player reads bonds, never numbers:** who sits with whom, who arrives together, and the
  Guestbook page that lists who a customer gives to, swaps with and bakes for, most often first.

---

## 3. How the player chooses — with verbs that already exist

- **Solve their puzzle.** The core one. Arrange so that what they need is findable, in a form their
  personality will accept (`NEAR-MISS-AND-SUBSTITUTION.md` §3), and they leave with it.
- **Give them a hold-shelf slot.** Scarce, explicit, reversible: "I am keeping this for you." The
  regular leaves their project bag on the counter; shelving it is accepting (PROJECT-BAGS.md §3a).
- **Display what they made, prominently.** The best of the three. A lent object placed by the door
  is an honour; the same object in a back corner is not. **The arrangement verb becomes the
  relationship verb** — it needs no new interface, no menu and no dialogue, and it is exactly the
  player's one verb from LYS.md pointed at a person instead of at stock.
- **Suggest a project** (see SPIKE-FUN.md's suggestion ladder) and **hand back something they
  lent**, both of which already read as generous.

None of these is a "befriend" button. Affinity is the residue of play.

---

## 4. Who walks in the door

Two channels, and **reputation is not one of them** (see §8):

1. **Walk-ins.** A baseline random stream, as now. The shop is on a street.
2. **Referrals.** Somebody who likes the shop brings somebody with them.

### 4a. The correction: correlate the BOND, not the TASTE

The tempting version — a friend arrives "seeded with correlated taste, so a knitting group walks
in" — is both untrue to life and bad for the game.

Untrue, because people do not befriend each other by fibre preference. A real knitting group is
bound by **time and place** — they meet on Thursdays — and its members have wildly different taste.
That difference is most of the fun of one.

Bad for the game, because a friend with the same taste is a **duplicate**: the same want, solved by
the same shelf, for no extra thought. Two people with the same bond and different taste is a real
puzzle — one shelf, two incompatible shopping lists, and the player has to find an arrangement that
serves both.

So, when a referral is generated:

| Correlates with the bringer | Rolled fresh |
| --- | --- |
| **when they arrive** — together, and they leave together | preferred materials |
| **social traits** (Enthusiasm, Assertiveness, Compassion, Politeness) — the bringer's decide whether anyone is brought at all, and warm people know warm people | preferred weights |
| **craft**, loosely — a knitting group mostly knits | crafter skill level |
| the **relationship type** below | the other six traits |
| | patterns and projects |

### 4b. Relationship types

Each is a different mechanical shape, not just a label:

| Type | Who | What it does |
| --- | --- | --- |
| **The beginner** | brought by someone high in Compassion, or high skill | crafter skill 1, no pattern, needs everything. Their mentor's presence raises their skill or their tolerance. A teaching arc across visits |
| **The dragged-along** | brought by anyone | does not craft at all. No wants, no shopping list. Sits, waits, and extends the crafter's dwell — and may be CONVERTED (§4c) |
| **Family** | mother and daughter, most often | shared craft, opposite taste. One will buy for the other |
| **The group** | three or four, on a schedule | arrive and leave together, thoroughly mixed taste. They talk to each other, which matters mechanically (§5) |
| **The rival** | mutual high Assertiveness | competes for the same stock, will take the last ball, digs through arrangements |

### 4c. The non-crafter conversion

The best of them. Somebody who does not craft sits in the shop, waits for their friend, and looks
around. If they sit long enough, and something catches them, they leave with a first project.

They arrive with **no taste at all** — no preferred materials, no preferred weights. So what they
fall for is decided by **what the player put where they were sitting**. The player does not just
acquire a customer; the player *forms* one, and that crafter's preferences — which will shape
their shopping for the rest of the game — are a direct fossil of one afternoon's arrangement.

This is the warmest mechanic in the document and it costs one flag on an NPC plus a seat.

### 4d. Referral is the diversity pump

Worth stating as a design property, because it is what stops the shop narrowing to a single note:

A shop whose inflow is driven by "more of who you already have" homogenises. Twenty hours in, the
cast is eight versions of the same person and the puzzle is solved forever. **Because referral
correlates the bond and not the taste, it is the channel that keeps bringing in people the player
did not select for.** It is the counterweight, not the accelerant, and it is free — it comes from
getting the correlation right rather than from a system built to fix it later.

---

## 5. Companions change what a customer will accept

The social layer earns its place by touching the near-miss roll, and nothing else needs building.

`NEAR-MISS-AND-SUBSTITUTION.md` §3 defines a HESITATE band: the customer picks the near-miss item
up, turns it over, and a roll decides. A companion standing with them modifies that roll:

| Companion | Effect | What it sounds like |
| --- | --- | --- |
| high **Enthusiasm** | loosens: the substitution is likelier to be taken | "oh that's gorgeous, get it" |
| high **Orderliness** | tightens: they put it back | "that's not the weight it calls for" |
| high **Compassion** | loosens, on a project meant for someone else | "they'll love it whatever it's made of" |
| high **Politeness** | tightens slightly; will not encourage taking the last one | — |
| the **rival** | loosens, badly — competition makes people grab | — |

So **who is in the shop together** becomes a puzzle variable. A customer the player could not have
sold to alone will take the near miss because of who walked in with them, and the player can
influence that by arranging where people end up standing — seating, displays, and the routes
between them.

---

## 6. What a cast does to the shop

### Behaviour — the regulars ARE the difficulty setting

Already implemented, and currently landing on random strangers: `interact()` in `visit.js` has
`Orderliness === 5` tidying a pile by category, `Orderliness === 1` spreading it into a mess, and
`Assertiveness` over the gate digging an arrangement apart to reach what they want.

Point those rules at a cast the player CHOSE and they stop being noise. An orderly shop stays tidy
by itself; a lively one is chaos that needs re-arranging every day. The player opted into that
difficulty by deciding who to serve, and can change it by cultivating somebody else.

### Look — the shop is a portrait of its regulars

The decor is made of lent finished objects, and `NEAR-MISS-AND-SUBSTITUTION.md` §5 decides what
those objects ARE:

- a cast high in Orderliness lends **PERFECT** objects: exact, matched, quiet
- a cast high in Enthusiasm lends **CHARACTERFUL** ones: wild colour, mismatched stripes
- a cast of beginners lends **COMPROMISED** ones, and the swatch wall fills with what went wrong

Every near-miss verdict accumulates into the thing the player looks at. That is the payoff of the
whole near-miss mechanic, and it is why these two documents are companions.

### Staff — what a Fixture becomes, by trait

The top tier is somebody who works in the shop, and which job they do is who they are:

| Trait | The job |
| --- | --- |
| high crafter skill | **Teacher** — raises a beginner's skill, makes ambitious patterns survivable |
| high **Orderliness** | **Tidier** — restores one display's formation between customers |
| high **Compassion** | **Charity night** — runs an event; the cast collectively makes N of something |
| high **Enthusiasm** | **Draw** — raises the walk-in rate while they are present |
| high **Intellect** | **Reader** — reads a pattern's secret requirements aloud, so the shop learns them |

That last one is a deliberate release valve on `NEAR-MISS-AND-SUBSTITUTION.md` §4: the player can
eventually *earn* a character who tells them what the patterns secretly need, rather than being
told by the interface.

---

## 7. Taste changes. A few things never do.

An NPC's preferences are not who they are — they are **what they have tried so far**. Finishing an
object is how that list grows, and the player is the reason it grows.

### The split

| Never changes | Changes |
| --- | --- |
| the ten traits (`CHARACTER-ATTRIBUTES.md`) | preferred materials |
| **allergies** (below) | preferred weights |
| | crafter skill level — already does, +1 per finished object |
| | craft, rarely and only when taught (below) |

Traits are permanent because the Big Five are stable in adulthood and because
CHARACTER-ATTRIBUTES.md treats them as the person. It is also the right game design: temperament
learned once stays learned, so the player's read on somebody's character never expires.

### The rule that keeps this affordable: additive, never contradictory

**A taste change ADDS.** "I love silk now" puts silk into their preferred materials; it does not
take wool out. So nothing the player has learned about somebody can ever become WRONG — only
incomplete.

That guarantee is load-bearing for `NEAR-MISS-AND-SUBSTITUTION.md` §7's memory budget. A player who
has been away is *out of date*, not misinformed, and being out of date costs a missed opportunity
rather than a wrong move. A mechanic that could invalidate learned facts would make paying
attention feel punished, which is the exact failure §7 exists to prevent.

It also means NPCs **broaden** over time rather than narrowing — a quiet force against the
homogenisation §4d worries about.

### What triggers it

At the FINISH, never at the buy — it reads the substitutions recorded in
`NEAR-MISS-AND-SUBSTITUTION.md` §3:

1. the finished object used a material or weight **not** in their preferences, and
2. the outcome was **PERFECT** or **CHARACTERFUL** (§5 there — a good result), and
3. a roll against **Openness**, the appetite for the new.

Then the substituted attribute joins their preferences, permanently.

So the substitution the player engineered becomes part of who somebody is. **You did not sell
somebody a ball of silk; you made somebody who likes silk.** That is the longest-reaching
consequence of the arrangement puzzle in the game, and it costs one branch at the completion of a
WIP.

### The other direction: aversions

A **COMPROMISED** outcome on a substituted attribute may produce an aversion — "never again" —
rolled against Volatility (amplifies) and Openness (protects).

An aversion is a soft `∞` in the §2 miss table: they will not substitute *that* attribute again,
whatever their tolerance would otherwise allow.

Note the moral shape, because it is unusual and worth keeping: **the game's only lasting penalty is
one the player caused by pushing a substitution that did not work out.** It is not a punishment for
neglect or for being slow. It is the consequence of being pushy, and it is recoverable by being
generous afterwards.

### The ceiling: taste broadens, then sets

Somebody who likes everything has no puzzle left in them, so growth is bounded — and the bound is
**the generation range that already exists**. CHARACTER-ATTRIBUTES.md rolls 2-6 preferred materials
and 2-6 preferred weights; 6 is also the ceiling. No new number.

That gives a pleasing spread for free:

- generated with **6** — already set in their ways, and cannot be changed by anybody
- generated with **2** — a specialist, with four slots of room, and the most rewarding person in
  the shop to open up

Note it is BREADTH, not fussiness. How fussy somebody is about matching the pattern is §3's
tolerance, which is personality. How many fibres they have ever liked is experience. A two-material
specialist may be perfectly relaxed about substitutions; they have simply not met much yarn.

**Approach the ceiling with diminishing odds rather than a wall.** Scale the §3 Openness roll by the
room remaining, so a person becomes gradually harder to surprise instead of converting freely and
then stopping dead. That reads as somebody settling into themselves.

**The ceiling is rolled independently of personality**, because CHARACTER-ATTRIBUTES.md is explicit
that craft preferences are "completely unrelated to personality". Openness governs the RATE — whether
a given conversion lands — not the CEILING. Keeping those separate is deliberate; tying breadth to
Openness would quietly make that line untrue.

When somebody at their ceiling declines a conversion they would otherwise have taken, the Guestbook
says so, ONCE: *"I know what I like."* The player needs that, or they will keep engineering
substitutions for a person who can no longer be moved.

### Preferences are monotonic

Worth stating outright, because it is what makes the whole of §7 safe rather than merely
well-intentioned:

**A preference, once gained, is never lost.** The aversion mechanism cannot take one away, and this
is true by construction rather than by rule — an aversion is only ever rolled on a SUBSTITUTED
attribute, and an attribute already in somebody's preferences is not a substitution. A silk lover
whose silk project comes out COMPROMISED is disappointed; they do not stop liking silk.

So the set of things the player knows about a person only ever grows, exactly as the person's own
taste does. That is the guarantee `NEAR-MISS-AND-SUBSTITUTION.md` §7 depends on.

### What the ceiling does to the shop

Old regulars stop being malleable. That is not a dead end — it is the engine that keeps the shop
from settling:

- the people the player can still CHANGE are always partly newcomers, so §4's referral stream stays
  valuable long after the cast is established
- a Fixture (§6) is somebody at their ceiling in every sense: fully known, fully formed, and now
  useful as staff rather than as a puzzle
- it gives an honest late-game answer to "why would I want new customers" that is not a number
  going up

### Allergies: permanent, and not the player's fault

Rolled at generation — zero or one per NPC, never changes, never learned out of. Mohair itch, wool
sensitivity, cotton.

Mechanically an allergy is a **hard `∞`** in `NEAR-MISS-AND-SUBSTITUTION.md` §2's miss table, not a
tolerance question. No amount of Enthusiasm, no companion in §5, no adjacency argument will move
it. It is the one place in the whole system where personality does not get a vote, and that is why
it is worth having: every other rule bends.

It is also the *best* kind of fact for §7's memory budget — permanently true, never goes stale,
learned once. And it makes an otherwise perfect arrangement fail for exactly one person, which is a
puzzle rather than a nuisance.

TODO(spec): an allergy has to become visible before it can be respected, or the first failure reads
as arbitrary. Two candidates: a Friend-tier NPC says so at the counter, or the first refusal writes
the Guestbook line and THAT is the teaching moment. Prefer the second — one wasted visit is a fair
price for a fact that is true forever.

### The Guestbook announces every change

This is the constraint that makes the mechanic fair, and it is a deliberate exception to
`NEAR-MISS-AND-SUBSTITUTION.md` §4, where the game tells the player nothing.

> **Secrets are for what the player can discover by observation. Changes to what the player already
> knows must be announced.**

Otherwise learned knowledge rots silently and the shop starts feeling arbitrary — the player would
be punished for having paid attention, which is backwards.

So every taste gained, aversion earned and allergy discovered writes a Guestbook line, in that
NPC's own voice via the generator model CHARACTER-ATTRIBUTES.md asks for:

| Change | Enthusiasm 5 | Orderliness 5 | Withdrawal 5 |
| --- | --- | --- | --- |
| gained silk | "Pickles made me try silk — I love it now!" | "Substituted silk for the recommended wool. It held its blocking." | "The silk was alright, I suppose." |
| aversion to acrylic | "Never again!!" | "The acrylic was a mistake. Noted." | "I would rather not, next time." |
| allergy found | "Turns out mohair and I are not friends 🤧" | "Mohair. Unwearable. Please do not." | "..." |

The Guestbook stops being a trophy case and becomes **the changelog of the people in it** — which
is what SPIKE-FUN.md wants it to be: the thing you consult before you suggest.

### Craft change, rarely

Learning the other craft is the largest change available, because it rewrites every tool want they
will ever have. It should stay rare and taught: a **Teacher** fixture (§6), or high Openness plus a
companion who does the other craft (§4b, §5). Worth a whole Guestbook page when it happens.

---

## 8. What reputation is NOT allowed to do

Reputation does not exist today, and it must not become the thing that decides who walks in.

If a hidden number is choosing the cast, the player is not choosing it — which contradicts the
first line of this document. A drifting generator also cannot be read: the player has no way to
tell a reputation effect from a random roll, so it is invisible work.

**Inflow is relationships plus walk-ins. Nothing else.**

If a shop identity is wanted later, it should be:

- **Visible and player-made** — the decor, the swatch wall, what is actually on the shelves. The
  shop already looks like what it sells; that IS its reputation, and it needs no number.
- **Limited to SUPPLY, never to people** — what deliveries offer, and what the bulletin board asks
  for, may reasonably follow what the shop is known for. `SHOP_RANGE`'s TODO in `catalog.js`
  already wants to become a player decision, and that is the right home for it.

---

## 9. Build order

1. **Affinity as a number per NPC**, banded into the four tiers of §2 ("Measuring it"), raised by
   the events in its table. **Bond** as a count over the Guestbook's shared events for a pair:
   a pure function, with one test.
   Replaces the boolean `willReturn` as what decides who comes back and how often.
2. **Return frequency and patience keyed to the tier.** This is also the pacing fix from
   SPIKE-FUN.md: strangers cannot be helped in time, friends will wait.
3. **Referral**, with §4a's correlation table. One new NPC generated with a bond, arriving and
   leaving with their bringer.
4. **The dragged-along and the conversion** (§4c) — one flag and a seat.
5. **Companion modifiers on the HESITATE roll** (§5), once the near-miss band exists.
6. **Allergies** (§7) — one field, a hard `∞` in the miss table, and a Guestbook line. Cheap, and
   it is the first permanent fact the player can learn about a person.
7. **Taste change on a good finish** (§7) — additive, bounded by the ceiling, at `workRound`'s
   completion branch, next to the `skill += 1` that is already there and has exactly this shape.
8. **Aversions on a COMPROMISED finish** (§7), once VERDICT exists.
9. **Fixture jobs** (§6), one at a time. The Tidier is the cheapest and the Teacher the most
   valuable.

Steps 1–3 are pure sim and testable in node, as `visit.test.mjs` already tests visits.

---

## Open questions

- ~~**Does affinity ever go DOWN?**~~ **No** (§2, "Measuring it"): they visit less, nothing worse. The original question: Failing somebody repeatedly probably should cool them off, but a
  cozy game should not punish neglect — "they visit less" may be enough, with no negative state.
- **How does the player see a tier?** Nothing should say "REGULAR" in a panel. Candidates: how they
  greet you, whether they have a bag on the hold shelf, how many pages they have in the Guestbook.
- **Do groups arrive on a real schedule?** "Thursdays" needs a calendar with days of the week,
  which SPIKE-FUN.md's B4 wants anyway. Until then, a group is simply an arrival that brings two
  or three at once.
- ~~Can a converted non-crafter be steered wrong?~~ **Resolved in §7**: their first taste is formed
  by whatever was arranged around them, but it is not a life sentence — taste is additive and they
  can broaden later. Only allergies are permanent, and those are not the player's doing.
- **Do aversions fade?** An allergy must not, but an aversion is an experience rather than a
  fact about the body, and a shop that has been generous since might reasonably earn its way back.
  Fading would need its own announcement, or it is an invisible change.
- ~~Is there a ceiling on preferences?~~ **Resolved in §7**: yes, and it is the 2-6 generation
  range itself, approached with diminishing odds. Growth STOPS at the ceiling — it never cycles,
  because dropping an old preference to make room would make a fact the player had learned become
  false.
- **Does the rival relationship risk being unpleasant?** Competition is a real yarn-shop dynamic,
  but the tone has to stay warm. Possibly they compete over stock and are perfectly nice about it.
