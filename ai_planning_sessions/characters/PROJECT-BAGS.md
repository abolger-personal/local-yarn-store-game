# Project Bags

The canonical spec for a customer's **project bag**: the one object behind "the balls poking out of
their bag", "Marguerite's bag on the hold shelf", "fill a regular's bag", and "a bag on a chair
saves the seat". Nothing is built yet; several specs already lean on it, and §6 lists every one so
they stay consistent with this doc.

Trait names are the exact ten from `CHARACTER-ATTRIBUTES.md`.

---

## TLDR

1. **One object, two places.** Every customer with a project carries **their own** project bag. A
   regular who is stuck can **leave it with you**, and then it sits on the **hold shelf**. It is
   the same bag, with the same things in it, either in their hand or in your keeping. There is no
   separate "reserved bag".
2. **The bag is the project made visible:** their WIP, their yarn poking out, and their pattern
   tied to the handle. Carried, the player sees only what pokes out. Left with you, the tag can be
   read in full: that is what the hold shelf buys.
3. **The player only adds, never takes.** Shop stock placed in a left bag is reserved for them, in
   the order placed. A customer's own things are theirs: the player cannot move them out, so
   stash still changes hands only between customers (HOW-THEY-SHOP.md §2b).
4. **Finite, physical, reversible.** The hold shelf has a few slots (3, growing to 5). Which
   regulars get one is the player's choice (REGULARS §2), made by picking up a bag and shelving it.

---

## 1. One bag, one project

- A customer has **one project bag per visit**: the bag for the one project they are shopping for
  today (NEAR-MISS §7, cap 1), **plus whatever of their stash they brought along**. Their other
  WIPs, and the rest of the stash pile, stay at home (HOW-THEY-SHOP.md §2, "Stash is one slot").
- **Only what is in today's bag can be swapped away** (HOW-THEY-SHOP.md §2b step 2).
- The bag is a **drawstring bag** silhouette, tinted per customer (a colour from their own
  palette), so a regular's bag is recognisable on sight, like their handwriting
  (VISUAL-DESIGN-2D.md, "Customers' hands").
- **What is in it** is exactly today's WIP (its yarn, its tool, its notions, the WIP itself once
  started) and the stash yarn brought along. No new inventory: the bag is a view of the WIP (`characters/wip.js`), not a container
  with its own contents.
- A yarn-first customer with no pattern yet carries a bag of stash: yarn and nothing tied to the
  handle. A pattern-first customer with nothing yet carries the pattern tied on and an empty bag.

---

## 2. Carried: what the player can read

| What shows | Means |
| --- | --- |
| **Balls poking out**, countable, in their colours | the yarn they own for this project |
| **The pattern tied to the handle** (a small sheet) | they have a pattern; its ball band shows on hover only if their knitting was witnessed (TUTORIAL.md §7.1) |
| **Needles or a hook** sticking out | the tool |
| **Nothing tied on** | no pattern yet: object first or yarn first (HOW-THEY-SHOP.md §5) |

- Hidden-inventory rule (DESIGN-DECISIONS.md, NPCs) holds: the bag shows what they **own**, never
  their shopping list. The player works out the gap (PROJECTS-AND-AUTHORSHIP.md §1).
- While knitting seated, the bag sits beside the chair and the working ball sits on the floor by
  it, its strand running up to the work (the sit-and-knit draft, `characters/craft-anim.js`).
  "Running out" is the last ball leaving the bag, and then the floor ball shrinking to a tail.

---

## 3. Left with you: the hold shelf

### 3a. How a bag gets there

- **Who:** regulars and above (REGULARS §2 affinity tiers). Strangers never leave a bag.
- **When:** a regular leaving with an unfinished project that is **short of something the shop
  does not have out** (they are stuck) leaves their bag **on the counter** as they go. How they
  ask is personality (TUTORIAL.md §7.4): an Enthusiasm or Assertiveness 4+ customer's bubble shows
  the bag and the shelf; a quiet one just leaves it, with a little note.
- **The player accepts** by picking the bag up and placing it in an empty hold-shelf slot. **To
  decline,** leave it on the counter: at closing it quietly goes home with them. No penalty, no
  menu: one pick-and-place, which is the game's verb (REGULARS §3, "give them a hold-shelf slot").
- **The first time** this happens is how the hold shelf itself appears (TUTORIAL.md §5, the
  discoveries table; SCRIPTED-EVENTS.md `unlock: 'hold-shelf'`). Before that the bag simply goes
  home.
- While their bag is with you, that project **does not progress at home** (NEAR-MISS §7 cap 2).
  It was stuck anyway.

### 3b. What the player can do with it

- **Read it in full.** A bag on the hold shelf has a **name tag** and its pattern's ball band can
  always be read on the label (TUTORIAL.md §7.1): how many balls, what weight, what tool, and what
  is already in the bag. This is the hold shelf's reward: the player does not remember what
  Marguerite needs, they look at her bag (NEAR-MISS §7).
- **Add shop stock to it.** Placing a ball, tool or notion into the bag **reserves** it for them:
  it leaves general stock and no other customer can buy it. The order things go in is the order
  they are knitted in: the player's palette (PROJECTS-AND-AUTHORSHIP.md §2b).
- **Add a pattern** to a stash bag (nothing tied on): the player chooses what the stash becomes.
- **Never take out** what was theirs when they left it. Only what the player added can be taken
  back out, and returns to stock.
- **Move it** to a chair to save that seat for them (HOW-THEY-SHOP.md §2d, "Save a seat"); its
  hold-shelf slot stays reserved, showing the name tag, while it is out. At closing it goes back.
- **Hand it back:** place it on the counter. They collect it on their next visit, with anything
  added; the slot is free.

### 3c. When they come back

- A regular whose bag is with you walks to the hold shelf (or the chair it is saved on) first.
- They **check the bag**: everything they accept is theirs, as a purchase (it counts toward
  tomorrow's order budget like any sale, TUTORIAL.md §7.2). Anything they will not accept
  (personality, NEAR-MISS §3: wrong dye lot for an Orderliness 4+ customer, a colour an
  Openness 1–2 customer would never pick) goes back out on the hold shelf's top, a visible "not
  that one", and returns to stock.
- With what they need, the WIP can start or continue: they may sit and knit then and there.
- If they are still short, they leave the bag again (back to 3a, no counter step: the slot is
  already theirs).

### 3d. The shelf

- A display kind in DISPLAYS.md terms: a shelf with **bag slots**, each a 2x2 footprint with a
  name-tag peg. Starts with **3 slots**; a bigger hold shelf (**5**) is a reward (the budget in
  NEAR-MISS §7 is at most 5 bags). Beyond 5 only if the budget is revisited.
- Reserved items are not stock: they do not count for tidying, destashing or the donation box.
- **Forgetting is cheap.** A bag waits forever. A customer with a bag in the shop is exempt from
  roster eviction (DESIGN-DECISIONS.md, roster retention), so they always come back for it.

---

## 4. Rules

1. **The bag is the WIP, seen.** No contents of its own; one source of truth in `wip.js`.
2. **Add only.** The player never takes a customer's own things. Stash moves between customers by
   swapping (HOW-THEY-SHOP.md §2b), never by the player.
3. **Their choice, at collection.** What the player adds is an offer; personality accepts or puts
   it back, exactly as on a display.
4. **No menus.** Leaving, accepting, filling, moving and handing back are all pick-and-place.
5. **Finite on purpose.** The slot cap is the curation mechanic (REGULARS §2) and the memory
   budget (NEAR-MISS §7).

---

## 5. Naming

- **"Project bag"** always means this object: a customer's bag holding one project.
- **"Bag"** as a pattern type (`PATTERN_TYPES`, the drawstring/tote/backpack silhouettes in
  VISUAL-DESIGN-FINISHED-OBJ.md) is a finished object a customer knits. A customer may one day
  carry a project bag they knitted from a bag pattern; that is a nice touch, not a rule.
- **"Hold shelf"** is the display; **"bag slot"** is one place on it.
- **"Stash"** is a customer's pile of extra yarn, one WIP slot's worth, mostly at home; a **stash
  bag** is a project bag whose project today is choosing a pattern for some of it.

---

## 6. Where other specs use it

| Spec | Uses the project bag for | Now reads as |
| --- | --- | --- |
| NEAR-MISS-AND-SUBSTITUTION.md §7, cap 3 and the budget | the hold shelf as the memory cap, ≤ 5 bags | §3; the TODO there is answered by §3d |
| REGULARS-AND-SHOP-CHARACTER.md §2, §3 | regulars leave a trace; "give them a hold-shelf slot" as curation | §3a (accepting is shelving the bag) |
| PROJECTS-AND-AUTHORSHIP.md §1 | the carried bag as evidence of what they own | §2 |
| PROJECTS-AND-AUTHORSHIP.md §2b | filling a regular's bag, in order, as authorship | §3b |
| PLAYING-AT-YOUR-PACE.md §4b | a planner stocks Marguerite's bag on Tuesday whether or not she is in | §3b; it waits (§3d) |
| HOW-THEY-SHOP.md §2, §5 | stash goes home in the bag; a stash return carries it | §1, §2 |
| HOW-THEY-SHOP.md §2d | a bag on a chair saves the seat for that regular | §3b, "Move it" |
| TUTORIAL.md Day 2, §5 | the friend's pot holder half done in their bag; the hold shelf as a discovery | §1; §3a, "the first time" |
| SCRIPTED-EVENTS.md | `unlock: hold shelf` | §3a |
| VISUAL-DESIGN-FINISHED-OBJ.md §4 | "project bag" vs the drawstring bag silhouette | §5 |
| DESIGN-DECISIONS.md, animation | "carry a bag or WIP" | §1 (one bag, carried) |
| LYS.md, finishing and general | project bags in the stock list | not this object: see open questions |

---

## 7. Build order

1. **The bag as a view of the WIP:** a drawstring bag mesh, tinted per customer, with the WIP's
   balls poking out. Carried; set beside the chair when seated.
2. **The pattern tag on the handle** and the label for a bag (owner; for a carried bag only what
   shows, for a held bag the full ball band).
3. **The hold shelf** as a display kind with bag slots and name tags.
4. **Leaving a bag on the counter, shelving it to accept,** and the closing rule (unshelved bags
   go home).
5. **Adding stock to a held bag** (reserved, ordered), and **collection** with accept or put back.
6. **Moving a bag to a chair** (with save a seat, HOW-THEY-SHOP.md §8).

---

## Open questions

- **Project bags as stock** (LYS.md lists them under finishing and general). A customer who buys a
  new project bag could switch to it, a cosmetic change and a lovely gift. Later, if at all.
- **What does the player get for a held bag that is collected?** Proposal: nothing extra beyond
  the sale and the affinity it already earns (REGULARS §3); the selfie's thank-you line can
  remember it (*"You kept my bag for two weeks. The green came in!"*).
