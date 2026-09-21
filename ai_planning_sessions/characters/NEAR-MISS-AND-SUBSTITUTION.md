# Near Miss and Substitution

How an NPC decides to accept something that is *nearly* what their pattern calls for, what that
does to the finished object, and how their personality decides both.

Companion to `CHARACTER-ATTRIBUTES.md` (the ten traits), `WIP-AND-FINISHED-OBJ-FORMATION.md` (what
a WIP wants), `../inventory/PATTERNS.md` (what a pattern specifies) and `../inventory/YARN.md`.
Trait names here are the exact ten from CHARACTER-ATTRIBUTES.md and are never substituted with
synonyms.

---

## TLDR

PATTERNS.md says a pattern carries a **recommended** material, **recommended** weight and a
**recommended minimum** number of colours. The code turned all three into requirements: a yarn
matches or it does not, and `satisfies()` returns a boolean. Everything in this document lives in
the gap between "recommended" and "required".

The gap is where personality gets to speak. An NPC high in Orderliness holds out for exactly what
the pattern says and is *euphoric* when the finished object comes out right. An NPC high in
Enthusiasm grabs whatever is pretty and ends up in a magnificently ill-advised striped sweater. The
same shelf, arranged the same way, should produce those two different afternoons.

**One design claim, which the rest of this document exists to support:** a fussy customer is harder
to serve, slower to finish, and worth much more when they do; a loose customer is easy, fast, and
worth less per object. The player reads which one they are off their behaviour, and stocks and
arranges accordingly. That is the difficulty curve, and it is made of character rather than of
numbers going up.

---

## 1. The spine: three numbers, resolved at three different times

The mechanic is **accept now, pay later**, and it is easier to keep honest if the three parts are
never collapsed into one:

| # | Number | Resolved when | Depends on |
| --- | --- | --- | --- |
| 1 | **MISS** — how far this item is from the want | at LOOK time | the item and the pattern. No personality at all |
| 2 | **TOLERANCE** — how much miss this NPC will accept | at CONSIDER time | the ten traits and crafter skill level |
| 3 | **VERDICT** — what the accumulated substitutions did | at FINISH time | the pattern's hidden attributes |

MISS is objective and belongs in `inventory/`-facing code. TOLERANCE is the character. VERDICT is
the payoff, and it is the only one the player ever sees directly.

---

## 2. MISS — what "near" means, per attribute

`miss(item, want)` returns `0` for an exact match, a small positive number for a near one, and
`Infinity` for "this is not that kind of thing at all". `satisfies()` becomes `miss(...) === 0`, so
there is one predicate and the two cannot drift apart.

Everything below is computed from data that already exists.

### Yarn

| Attribute | 0 (exact) | 1 (near) | 2 (far) | ∞ |
| --- | --- | --- | --- | --- |
| **weight** | the recommended weight | ±1 along the `YARN_WEIGHTS` ladder (lace → super-bulky) | ±2 | ±3 or more |
| **material** | a recommended material | same fibre family | different family | **an allergy** |
| **colour** | within the recommended count | — | — | — |
| **quantity** | `unitsShort === 0` | short by ≤ ¼ of the pattern | short by more | — |

Fibre families, from `YARN_MATERIALS`: **animal** (wool, alpaca, mohair, silk), **plant** (cotton,
linen, bamboo), **synthetic** (acrylic). Substituting alpaca for wool is a knitter's decision;
substituting acrylic for alpaca is a different garment.

**An allergy is `∞`, not a distance** — see REGULARS-AND-SHOP-CHARACTER.md §7. It is the one input
here that §3's tolerances cannot bend and §5's companions cannot argue with: no amount of
Enthusiasm makes somebody take the mohair. Every other rule in this document bends, which is
exactly why one that does not is worth having. An earned AVERSION behaves the same way for the one
attribute it names.

The weight ladder is the array order in `catalog.js`, **not** the 1/2/3 footprint size. Three
weights share each footprint, and going up one is a gauge decision while going up three is a
different craft.

Colour distance is free: `stock.js` places the 48 palette entries on an even hue grid, so the
wrapped index distance **is** hue distance. "Goes with" = within a few indices, or a deliberate
half-wheel away for a contrast. This is what makes "sort your stash by colour" mechanically real.

### Tool notions

| Attribute | 0 | 1 | 2 | ∞ |
| --- | --- | --- | --- | --- |
| **size** | the pattern's `toolSize` | ±1 step along `HOOK_SIZES_MM` | ±2 | ±3 or more |
| **kind** | hook for crochet, needles for knitting | — | — | **the other one** |

Tool kind is never a near miss. A crochet hook does not nearly knit; it is the wrong craft, and it
should read to the player as a different class of failure from the wrong millimetres.

### Patterns

| Attribute | 0 | 1 | 2 | ∞ |
| --- | --- | --- | --- | --- |
| **craft** | one the NPC does | — | — | a craft they do not do |
| **difficulty vs skill** | at or below their crafter skill level | 1 above | 2 above | 3+ above |
| **suits held yarn** | weight and material both match | one matches | — | — |

"I don't crochet" is absolute and always has been. Difficulty above skill is the interesting one:
it is accepted or refused by personality, and if accepted it is the main road to STALLED.

---

## 3. TOLERANCE — the personality table

This is the heart of the mechanic. Each attribute has its own tolerance, because being fussy about
gauge and being fussy about colour are different people.

Read the table as: **↑ tightens** means a high score makes them hold out for the exact thing; **↑
loosens** means a high score makes them accept the substitution.

| Attribute | ↑ tightens | ↑ loosens | The read in the shop |
| --- | --- | --- | --- |
| yarn **weight** | Orderliness, Intellect, skill | — | Gauge is the one a knowledgeable crafter will not fudge. A high-Intellect NPC understands *why* it fails; a skilled one has been burned. |
| yarn **material** | Orderliness | Openness, Compassion | Openness is an appetite for the new fibre. Compassion is the charity knitter: the recipient matters more than the fibre content. |
| yarn **colour** | Orderliness, Intellect | **Enthusiasm**, Openness, Volatility | The headline case. Enthusiasm grabs what is pretty and worries later. This is the crazy-coloured sweater and it should happen often. |
| yarn **quantity** | Industriousness, Orderliness | Volatility, Enthusiasm | Industriousness plans the whole project and buys enough. Volatility casts on with one ball and finds out later. |
| **tool size** | Orderliness | **skill**, Intellect | The one place skill *loosens*: an experienced crafter adjusts tension to compensate. A beginner cannot and should not try. |
| **pattern difficulty** | Withdrawal, Politeness | Assertiveness, Openness, Volatility | Ambition versus self-knowledge. This is where a stalled project comes from. |

### Skill cuts both ways, deliberately

Crafter skill level **tightens** what cannot be fixed later (weight, quantity) and **loosens** what
can be compensated for (tool size, a small colour difference). So:

- **High skill** refuses the wrong weight because they know exactly how it ends, and shrugs at the
  half-millimetre hook because they can adjust.
- **Low skill** accepts everything out of ignorance, and pays for it at the finish. That is the
  Beginner: easy to sell to, hard to give a good outcome to, and the character who most rewards the
  player learning to protect them from themselves.

### Two traits that refuse rather than substitute

- **Withdrawal** does not loosen anything. A high-Withdrawal NPC will not negotiate, will not dig,
  and will not ask — faced with a near miss they put it down and leave. Their failure mode is
  absence, not compromise.
- **Politeness** loosens *by refusing to be rude*: they will not take the last ball, and they will
  not wreck an arrangement to reach the exact one underneath. So they accept the near miss on top
  instead. The politest customers end up with the most substitutions, which is a joke the game
  should be allowed to make.

### Suggested shape for the number

    tolerance(npc, attribute) = clamp(BASE + Σ weightᵢ × (traitᵢ − 3) / 2, 0, MAX)

`(trait − 3) / 2` maps the 1–5 scale to −1…+1, so an average NPC sits at BASE and the table above is
just the sign of each weight. Start with `BASE = 0.5` and `MAX = 2`, and tune on the puzzle bench.

### The four bands

| Condition | Outcome | What the player sees |
| --- | --- | --- |
| `miss === 0` | **TAKE** | the existing delight beat |
| `0 < miss ≤ tolerance` | **TAKE**, recorded as a substitution on the WIP | takes it, no celebration — a small satisfied nod |
| `tolerance < miss ≤ tolerance + 1` | **HESITATE** — a roll the arrangement can tip | picks it up, turns it over, puts it back down or keeps it |
| `miss > tolerance + 1` | **PASS** | never picks it up |
| `miss === Infinity` | not a candidate | nothing |

HESITATE is the important band and the reason the whole thing is worth building. It is a visible,
legible "so close" that costs one pose, and it is the only tell the player gets about a want they
were never told. **Arrangement is what tips the roll**: the near-miss ball sitting next to the
pattern that would use it, or in a run of the same weight, or beside a perfect match, is the player
making the case for the substitution. That is the first point in the game where arrangement changes
an *outcome* rather than merely what is visible.

Every accepted substitution is recorded on the WIP: `{ attribute, miss, item }`. Nothing reads it
until the project finishes.

---

## 4. Secret pattern attributes

PATTERNS.md already gives every pattern "a (invisible to player) list of rendering metadata hints
that will turn into NPC clothing" — `["stripes", "star", "pom pom", "fringe"]`. Those hints are the
hook. Each one is given a **secret requirement**, and the requirement is checked only at the finish.

| Hint | Secret requirement | If unmet |
| --- | --- | --- |
| `stripes` | at least 2 distinct colours in the WIP's yarn | comes out plain |
| `star` | 2 colours **at the same weight** — colourwork is gauge-critical | puckers: the star is dropped |
| `pom pom` | 1 spare unit of any colour | bald hat |
| `fringe` | `yarnUnits + 2` rather than `yarnUnits` | comes out short and unfringed |
| `drape` *(new)* | a plant or silk fibre | stiff: the shawl hangs wrong |
| `seamless` *(new)* | every ball the same colour index — one dye lot | a visible line where the second ball started |
| `fitted` *(new)* | no weight substitution at all | comes out a size off |

### Who knows the secret?

An NPC **reads the pattern** if `Intellect + crafter skill level` clears a bar (start at 6 of 10).

- **They read it.** The secret requirement becomes a real want, visible in their shopping list and
  in their behaviour — they are now shopping for a second colour, and the player can see them do
  it without ever being told why.
- **They did not read it.** They buy what they think they need. The requirement bites at the
  finish, and the guestbook records what happened.

This is the spec's answer to "should hidden things be hidden": **the player never sees a secret
attribute directly, and learns them anyway, by watching finished objects come out wrong.** After
three shawls arrive short the player knows shawls eat more yarn than the pattern says, and starts
handing over an extra ball. That knowledge lives in the player's head, not in a stat panel, and it
is the longest-running puzzle in the game.

---

## 5. VERDICT — the outcomes

Resolved when progress crosses 100. Reads the substitutions recorded in §3 and the secret
requirements in §4.

| Outcome | Trigger | The object | The shop gets |
| --- | --- | --- | --- |
| **PERFECT** | no substitutions, every secret requirement met | rendered with every hint: the stripes, the pom pom, the fringe | the best possible object, and a customer who will absolutely be back |
| **CHARACTERFUL** | substitutions present, secret requirements still met | rendered *with the substitution visible* — the wrong-coloured stripe, the acrylic sheen | a one-of-a-kind object. Often the prettiest thing in the shop |
| **COMPROMISED** | a substitution collided with a secret requirement | the hint is dropped or rendered wrong — the plain hat, the stiff shawl | a diminished object, and a story |
| **STALLED** | never got the units or a usable tool; progress frozen | nothing yet — stays in the WIP slot | a reason to come back, and a bulletin-board request |
| **FROGGED** | stalled too long (post-MVP, per WIP-AND-FINISHED-OBJ-FORMATION.md) | undone | the yarn, returned to the shop carrying its story |

### How the NPC feels about it

The outcome is objective; the reaction is personality. One number, `joy`, from the outcome's base
plus the traits:

| Trait | Effect |
| --- | --- |
| **Orderliness** | large bonus on PERFECT, large penalty on CHARACTERFUL and COMPROMISED. The fussy customer's payoff and their punishment are the same trait |
| **Enthusiasm** | bonus on CHARACTERFUL — they love the mad thing they made |
| **Openness** | bonus on CHARACTERFUL; treats the substitution as the point |
| **Intellect** | penalty on COMPROMISED: they can see exactly what went wrong and why |
| **crafter skill** | penalty on COMPROMISED — they knew better, or ought to have |
| **Volatility** | amplifies whatever the reaction already is, in both directions |
| **Withdrawal** | damps the positive; a PERFECT gets a quiet nod rather than a hop |
| **Compassion** | on a project intended for someone else, outcome matters far less than *finished* |

`joy` then drives: the celebration beat (the existing `POSES.delighted` and hop), affinity gained,
the tone of the guestbook entry, and how likely they are to come back.

---

## 5b. Where a COMPROMISED object goes

Not one destination. **The destination IS the reaction**, and it is the most expressive moment the
system has — the same flawed hat becomes a different object depending on who made it.

| Trait | What they do with it | What it reads as |
| --- | --- | --- |
| **Intellect** high | **Makes a SWATCH of it** — keeps the evidence, works out what went wrong | analytical, undefeated |
| **Orderliness** high | **FROGS it.** Cannot live with the thing | the fussy customer's punishment, in object form |
| **Volatility** high | Frogs it on the spot, in a huff | dramatic and memorable |
| **Enthusiasm** or **Openness** high | **Wears it anyway.** It is not compromised to them, it is characterful | joyful |
| **crafter skill** low | **Wears it proudly — they cannot tell.** The player can | the strongest quiet scene in the game |
| **Withdrawal** high | Says nothing and leaves it with the shop | the lent object |
| **Compassion** high | Gives it away regardless; it was never for them | finished is what mattered |

### Why frogging must NOT be the default

Frogging every compromised object destroys the evidence, and the evidence is the mechanic. §4's
whole loop — the player never being told a secret requirement and learning it anyway — depends on
the wrong object **existing and being visible**. Bin it and the lesson goes in the bin with it.
Worse, COMPROMISED would collapse into STALLED, since both would end in "the yarn comes back", and
an outcome that is mechanically identical to another outcome is not an outcome.

So frogging is one character's answer, not the rule. It is the destructive reaction of somebody who
cannot bear the object, and it should feel like that.

### Swatches

A swatch is what a crafter makes to avoid this exact failure. A compromised object IS "I should have
swatched first", so turning one into a swatch is the lesson made physical.

- **What it is:** 1x1x1, the smallest thing in the shop. A flat hatched square — `yarn-look.js`
  already has `applyHatching` and the palette, so it is close to free to render.
- **What it carries:** the yarn's material, weight and colour, the tool size it was worked at, and
  the requirement it failed.
- **What it DOES:** pinned up, it makes those attributes legible to NPCs who cannot judge them
  unaided — the perception gap SPIKE-FUN.md's A1 describes, where a low-Intellect NPC cannot tell
  whether a yarn's weight suits their pattern. A swatch of that weight in the room answers the
  question for them.
- **So the loop is:** failure produces knowledge produces fewer failures. Earned, not bought, and
  it satisfies SPIKE-FUN.md's rule that no reward may be a dead trophy — a swatch is placed, and
  what it does depends on where.

**The player never knits one.** LYS.md is explicit that arranging is the player's only verb, so
swatches come from NPCs: the analytical reaction above, and later the Teacher archetype leaving
them behind as gifts. That keeps the swatch wall a record of who has been in the shop rather than a
crafting menu.

TODO(spec): a swatch needs somewhere to live — a wall or board that takes only 1x1 swatches, which
is a new display form in DISPLAYS.md terms. And its reach needs deciding: shop-wide is readable and
cheap, per-display is more interesting and much fiddlier. Start shop-wide.

### The frog bin

Keeps the job WIP-AND-FINISHED-OBJ-FORMATION.md already gives it — where an abandoned WIP goes —
and gains two more: objects their maker rejects outright (above), and **anything the player chooses
to frog**. A lent object the player does not want as decor can go in the bin for its yarn, which
makes the bin a real piece of furniture and gives the shop a recycling verb that costs no new
systems.

---

### The asymmetry, stated plainly

- **High Orderliness**: refuses substitutions → slow, hard to serve, few finished objects → almost
  all of them PERFECT, each worth a great deal.
- **High Enthusiasm**: accepts nearly anything → fast, easy, many finished objects → mostly
  CHARACTERFUL, each worth less, and the shop fills up with glorious nonsense.
- **Low skill**: accepts out of ignorance → the COMPROMISED pipeline, unless the player protects
  them.

Serving all three well requires different stock and different arrangement, which is the point.

And the outcomes do not stop at the object. Two things accumulate from them, and both are in
REGULARS-AND-SHOP-CHARACTER.md:

- **The shop.** Finished objects lent to the shop become its decor, so a cast of one kind of
  crafter furnishes a visibly different room from a cast of another (§6 there).
- **The person.** A good outcome on a SUBSTITUTED attribute adds that attribute to their
  permanent taste; a COMPROMISED one can earn an aversion to it (§7 there). So the substitution
  the player talked somebody into is not spent when the object is finished — it becomes part of
  who that customer is, and changes what they will accept for the rest of the game.

That accumulation is what the whole of this document is ultimately for.

---

## 6. What the player can do about a near miss

Every one of these is an existing or already-specced verb:

- **Adjacency as argument.** Put the near-miss ball beside the pattern that would use it, or in a
  run of the same weight. That is the player's side of the HESITATE roll.
- **Stock the contrast.** A second colour within hue range, out where it can be seen, satisfies
  `stripes` and `pom pom` before the NPC ever learns they needed it.
- **One dye lot.** Keeping matching balls together — same colour index, adjacent slots — is what
  `seamless` needs, and it makes "tidy the stash" a real move.
- **Hand it over.** The direct verb: give them the exact thing (see SPIKE-FUN.md's suggestion
  ladder).
- **Protect the beginner.** Low skill plus an ambitious pattern is a COMPROMISED object waiting to
  happen. Stocking the safe substitution where they will find it is a kindness with a mechanical
  payoff.

---

## 7. What the player has to hold in their head

This mechanic adds depth by adding *things to notice*, and a game about noticing can quietly turn
into a game about remembering. Those are not the same pleasure. This section is the budget, and
nothing above may exceed it.

### Teach rules, not facts

Facts accumulate. Rules compound.

- **"Marguerite needs a 6mm hook"** is a FACT. One use, then it is dead weight in the player's
  head, and there is one of them per customer per project, forever.
- **"Shawls secretly eat two extra balls"** is a RULE. Always true, for every customer the shop
  will ever have, and knowing it makes the player permanently better at the game.

Everything in §4 is a rule: seven secret requirements, fixed, universal. So are the fibre families
and the weight ladder in §2, and the personality table in §3 — Orderliness means the same thing in
every customer who has it. **That is why this mechanic is affordable.** It adds a small, fixed,
permanently useful skill rather than an unbounded pile of per-person trivia.

The design rule that follows: push everything learnable toward what GENERALISES, and make the SHOP
hold the per-person facts. The player should never be the database.

### Learned facts may go stale. They may never go WRONG.

NPC taste is not fixed — REGULARS-AND-SHOP-CHARACTER.md §7 lets a good finished object add a new
preferred material or weight. That is only affordable because the change is **additive**: somebody
who has learned to love silk still loves wool. A player who has been away is out of date, never
misinformed, and being out of date costs a missed opportunity rather than a wrong move.

Any future mechanic that would make a learned fact FALSE — a taste lost, a trait drifting, a want
silently rewritten — breaks this budget, because it makes having paid attention worse than not
having bothered. Changes to what the player already knows are announced in the Guestbook for the
same reason.

### Four structural caps

| # | Cap | What it bounds | What it costs |
| --- | --- | --- | --- |
| 1 | **One project per visit.** `maxWips` may stay at 15; an NPC only ever SHOPS for the one they brought | the working set becomes (customers in the shop) x 1, not (regulars) x 15 | a filter in `wantsOf` |
| 2 | **They knit at home.** WIPs advance between visits, not only during a "Work on a WIP" action | a 20-unit sweater becomes 3-4 shopping touchpoints instead of 20 rounds of vigilance | progress applied in `rejoin()` |
| 3 | **The hold shelf is finite.** A regular with an open project gets a named PROJECT BAG, physically on a shelf, holding what they still need | the number of people being actively tracked is capped by furniture, and WHICH people is the player's choice | a new display form; see the TODO below |
| 4 | **Affinity gates who can be helped at all.** Strangers cannot be; regulars leave a trace; friends come to the counter and say so | the trackable set is exactly the set the player chose to invest in, growing at their pace | already in the affinity ladder |

Cap 1 is the highest-value and the cheapest: it is a constraint, not a feature.

Cap 3 is the one worth building for its own sake. The player does not remember what Marguerite
needs — they look at Marguerite's bag. And because the bag is furniture, the memory budget becomes
a visible, physical, player-controlled resource, which makes "a bigger hold shelf" one of the
better rewards in the game.

It also does a second job: REGULARS-AND-SHOP-CHARACTER.md §2 makes that same cap the mechanism by
which the player CHOOSES their cast. One shelf, two purposes — what you can hold in your head and
who you have decided to look after are the same finite thing, which is true of shopkeeping.

### Attention compounds into the ARRANGEMENT, not into a to-do list

This is the answer to "how do we reward paying attention without demanding memory".

The arrangement IS the player's memory. Sorting the alpaca by weight last week because three
people wanted it is remembered BY THE SHELF. The reward for attention is a shop that is already
right for a customer the player has completely forgotten about — the win arrives passively, days
later, because past-you was thoughtful.

That is the cozy loop, and it is the exact opposite of a chore list. Two things have to hold it up:

- **Forgetting must be cheap.** A missed customer comes back: the request board, the return roll,
  the unfinished WIP that is still unfinished next week. Never a permanent loss. If forgetting
  costs progress the game becomes anxious, and the genre fails.
- **Recognition over recall.** When somebody walks in, the shop should say who they are before the
  player has to think: they are WEARING what they made here, their swatch is on the wall, their
  page is in the guestbook. WEARABLE-FINISHED-OBJ.md's lent objects already build a memory palace
  out of other people's projects. That is the recognition system, and it is half built.

### The budget, so it can be checked

At any one moment the player should face:

    <= 3 customers in the shop, one want-set each
    <= 5 project bags on the hold shelf
    = 8 things, every one of them a visible object in the room, none of them in the player's head

Any change that pushes past that has to earn it. The count is deliberately checkable on
`characters/puzzle.html`, which is where a want-set can be read at the size the player will meet it.

TODO(spec): the project bag needs the same treatment the swatch wall does in Section 5b — it is a
new display form in DISPLAYS.md terms, holding items reserved out of general stock. Reserving is
also the first mechanic that lets the player say "this is spoken for", which SPIKE-FUN.md's A6 asks
for and nothing currently provides.

---

## 8. Build order

1. **`miss()` in `wip.js`**, pure, with `satisfies()` redefined as `miss(...) === 0`, plus a
   self-check. No behaviour change yet — the game keeps working exactly as it does.
2. **The tolerance table**, also pure, also in `wip.js`. Now `interact()` can return TAKE /
   HESITATE / PASS instead of the current unconditional buy, and the substitution is recorded.
3. **The HESITATE beat** in `sim/cast.js`, mirroring the existing `celebrate` timer and pose.
4. **Secret requirements and VERDICT** at `workRound`'s completion branch in `wip.js`.
5. **Rendered outcome variants** on the finished object. Last, and the most expensive: everything
   above is legible in the guestbook and the debug panel without it.

Steps 1–2 and 4 are pure functions over data that already exists, so they are tunable on
`characters/puzzle.html` — one customer, one shelf, every trait editable — before anything is
animated.

---

## Open questions

- ~~Does a COMPROMISED object get lent rather than worn?~~ **Resolved in §5b**: it depends on the
  maker, and only compromised objects deviate from WEARABLE-FINISHED-OBJ.md's default. A narrow
  exception rather than a rewrite of that rule — but it is still an exception, so that document
  should gain a line pointing here.
- **Is hue adjacency the right colour model?** It makes "these go together" computable for free,
  but a knitter's idea of a good combination is not just a small hue distance — complementary pairs
  and neutrals both break it.
- **Can an NPC swap a substitution out later?** Having bought acrylic and then seeing the alpaca
  they wanted is a very real yarn-shop moment, but it needs a "return to the shelf" action that
  does not currently exist.
- **Does the player ever get told a secret requirement outright?** The proposal here is no, ever —
  only the finished object and the guestbook. Worth confirming, because it sets the ceiling on how
  hard the puzzle can fairly be.
- **Difficulty is not a pattern attribute yet.** `makePattern` rolls `toolSize` flat, and
  CHARACTER-ATTRIBUTES.md wants difficulty tied to Intellect. §2's pattern row needs it to exist.
