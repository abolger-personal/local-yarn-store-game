# How They Shop: pattern first, object first, yarn first

Every project starts from something. Real knitters walk into a yarn shop in one of three ways: with
a **pattern** they mean to make, wanting **a kind of thing** ("I want to make a hat") but no
pattern yet, or with **nothing** and walk out in love with a yarn. Each WIP slot starts in one of
these three ways, and the way it starts decides what the customer looks at, what they buy first,
and what the player can do for them.

Companion to `WIP-AND-FINISHED-OBJ-FORMATION.md` (WIP slots, initialisation; this doc replaces its
"todo add more here later"), `PROJECTS-AND-AUTHORSHIP.md` (reading a project, the thank-you line),
`ARRANGEMENT-RECIPES.md` (the arrangements that catch each kind of shopper) and
`NEAR-MISS-AND-SUBSTITUTION.md` (what they will accept). Trait names are the exact ten from
`CHARACTER-ATTRIBUTES.md`. Object types are `PATTERN_TYPES` in `inventory/catalog.js`.

---

## TLDR

| Start | Arrives holding | Shops for, in order | Who (traits high) | Caught by |
| --- | --- | --- | --- | --- |
| **Pattern first** (built) | a pattern | its yarn, then its tool | Intellect, Orderliness | yarn that suits their pattern, a recipe that fits it |
| **Object first** (new) | a wish: one object type ("a hat") | a pattern of that type, then its yarn; **or** a project's worth of yarn for that type, then any pattern of it | Orderliness, Compassion, Industriousness | patterns of their type, a project's worth of yarn set out together |
| **Yarn first** (new) | nothing, or a ball of stash | yarn that catches their eye, then a pattern to suit it, maybe on a later visit | Enthusiasm, Volatility, Openness | the arrangement itself: a run, a new arrival, the display by the door |

- **Orderly customers are yarn first only when the yarn is a whole project**: a project's worth of
  one yarn, set out together (§3). Otherwise an orderly customer without a pattern is object
  first.
- **Yarn first is how stash happens:** yarn bought with no plan goes home in the bag, and the
  customer comes back looking for a pattern worthy of it.
- **It settles the recipes question** (ARRANGEMENT-RECIPES.md): a recipe does **not** need a
  pattern beside it. Yarn-first shoppers fall for the arrangement alone; object- and
  pattern-first shoppers want it beside, or matching, a pattern they can make.

---

## 1. Choosing the start

Per WIP slot, at generation (`makeWip` in `characters/wip.js`):

1. **Pattern first** with probability `(Intellect + Orderliness) / 10`. Unchanged; this is what
   the code does now.
2. Otherwise, **object first or yarn first**, weighted:
   - object first: `Orderliness + Compassion + Industriousness`
   - yarn first: `Enthusiasm + Volatility + Openness`

   so a customer of middling everything is an even toss, and a high-Enthusiasm, high-Volatility
   one is nearly always yarn first.
3. **The object type** of an object-first slot leans on the existing trait examples
   (CHARACTER-ATTRIBUTES.md): Industriousness toward big projects (sweater, shawl), Compassion
   toward hats (charity hats); otherwise any type in `PATTERN_TYPES` evenly.
4. **Stash from home:** a yarn-first slot may already hold a ball (the existing 50% chance). They
   fell for it somewhere else, and now want a pattern for it. The existing tool chance (60%)
   stays on both new starts.

A slot's start is stored on the WIP (`start: 'pattern' | 'object' | 'yarn'`) because it changes
what they want later, after the slot has picked things up.

---

## 2. What each one wants

Extends `wantsFor` (`characters/wip.js`). Pattern first is unchanged.

### Object first: "I want to make a hat"

- **Wants a pattern of their type** they can make (their craft, their skill). The existing
  `{ kind: 'pattern' }` want, narrowed by `type`.
- **Or a project's worth** (§3) of yarn that suits a pattern of their type: if they see one, they
  buy the yarn, and the slot now wants any pattern of their type that suits it (the existing
  "pattern for this yarn" branch).
- Having the pattern, they shop exactly like pattern first.
- If the shop has neither, they leave with the wish and come back with it. Nothing is lost.

### Yarn first: "Ooh."

- **Wants yarn that catches the eye** (§4), with no weight, material or count required. This is
  the only want in the game that is about taste rather than requirement.
- **How much they take:**

  | Customer | Takes |
  | --- | --- |
  | most | one ball: the one they fell for |
  | Enthusiasm 4+ | the whole run it sits in, up to their open slot's biggest type's units |
  | Orderliness 4+ | only a project's worth, all of it (§3), or nothing |
  | Volatility 4+ | one ball, from a different colour family to their last project |

- **Then wants a pattern for that yarn**: the existing branch, any pattern whose weight and
  material suit it (`yarnSuitsPattern`), preferring one their units already cover. If a suitable
  pattern is in the shop and they pass it, they buy it now and the WIP can start.
- **If not, the yarn goes home as stash:** onto their stash pile (below). On a later visit they may
  bring some of it, wanting a pattern for it.
- **Topping up:** with a pattern that wants more units than they hold, they now shop like pattern
  first, for more of the same yarn. Another dye lot or colour is a near-miss (NEAR-MISS §5): a
  stripe they did not plan.

### Stash is one slot: a pile of extra yarn

A customer's **stash** is **one WIP slot holding a pile of extra yarn**: everything they own that
is not committed to a project. Their **other slots are actual WIPs**, with patterns, in progress
or waiting to start. (Decided 2026-10-03.)

- Yarn-first buys with no pattern go onto the pile. Choosing a pattern for some of it moves that
  yarn out of the pile into a WIP slot, which then shops like pattern first.
- **The stash is not all in the bag.** It lives at home. On a visit, the bag carries today's one
  project (PROJECT-BAGS.md §1) and **whatever stash yarn they brought along**, which is some, all
  or none of the pile.
- The impulse limit is the slots: a customer whose every other slot is a WIP still in progress has
  no free slot to start something new from the pile, however big it is.

### Stash is forever, unless it is swapped

Stash never expires and is never thrown out. The one way it leaves a customer without becoming a project
is **to a friend**, in the shop, while chatting or knitting together. This is SPIKE-FUN.md D1
("chat with a consequence") made concrete. The player becomes the matchmaker.

---

## 2b. Swapping: the either-or rules

Checked once per pair per day, at the end of any round the two spend **together** (§2c). Each step
either passes or ends the check; nothing here is a menu or a number the player sees.

| Step | Passes if… | Otherwise |
| --- | --- | --- |
| **1. Together** | they are **in company** (both seated, §2c) or **chatting** (standing within `personalSpace`, the existing `WAIT` chat in `visit.js`) this round | no swap |
| **2. Something to give** | the giver's **bag today** holds stash yarn: only the stash they brought along can be given, never the pile at home (PROJECT-BAGS.md §1) | no swap |
| **3. It moves toward a project** | the stash suits a **requirement** the receiver has: a pattern short of that weight and material (`yarnSuitsPattern`), or a project's worth for their object type (§3). A yarn-first receiver with no pattern does not count: stash only moves toward a project, never from one bag of stash to another | no swap |
| **4. They know each other** | they have chatted on an earlier visit, **or** both are regulars (REGULARS §2), **or** they are in the same **circle** right now (§2c), **or** they have given, swapped or repaid before (a 🎁 history: and each past exchange makes the step-10 roll a little likelier, so a relationship snowballs) | only a **stranger's gift** is possible: giver Compassion 5 |
| **5. Someone speaks up** | Assertiveness or Enthusiasm 4+ in either of them, **or** in anyone in their circle | no swap: two quiet people never bring it up, however good the match |
| **6. The giver will part with it** | **any one of:** Volatility 4+ (*"so over these blues"*); the stash is 3+ visits old; Compassion 4+; or they get something they want back (step 8) | no swap |
| **7. The receiver will take it** | the colour suits them: Openness 3+, **or** it is in a colour family they already chose for that project. An Orderliness 4+ receiver takes only a whole dye lot that covers what they are short | no swap |
| **8. Swap or gift** | **swap** if each has stash that suits the other's requirement; **gift** if only one way **and** the giver has Compassion 4+ or Volatility 4+ | no swap |
| **9. Politeness** | a Politeness 4+ receiver takes a one-way gift because they can repay it: they bring a tin of treats on their next visit (PLAYING-AT-YOUR-PACE.md §5, "Treats") | — (never ends the check) |
| **10. The roll** | one roll, chance by **setting** (§2c): chatting 0.2, side by side 0.4, circle 0.6 | try again on their next day together |

**What moves:** from the stash yarn in the giver's bag today, as many matching units as the receiver is short,
never more. An Orderliness 4+ giver never splits a dye lot: all of it, or none. What leaves their bag
leaves their stash pile (§2, "Stash is one slot").

**Afterwards:** the receiver's yarn records where it came from (the giver), for the Guestbook (a 🎁 row on both pages, TUTORIAL.md §7.3) and
the thank-you line (PROJECTS-AND-AUTHORSHIP.md §4b: *"Mira's blues, from her stash. I owe her
one."*). It adds to their bond (REGULARS §2, "Measuring it").

**Later, not now:** rivals (SPIKE-FUN.md D2) never pass step 4; an ex snatches it back.

---

## 2c. Together: side by side, circles, and the room

The setting is a property of **the chairs as the player has arranged them**, read from the seats'
`x`, `z` and `facing` (`SEAT_SLOTS` in `characters/store/scene/seating.js`, moved by the player in
move mode).

- **In company:** two occupied seats are in company when
  - they are **within 2.4 m** of each other (centre to centre: about across a small circle of
    chairs), **and**
  - **neither is turned away** from the other: each chair's facing is within about 100° of the
    direction to the other (a dot product of at least −0.2). Side by side (both facing the same
    way, turned 90° from each other's direction) passes; across a circle passes; back to back
    fails, **and**
  - **nothing solid is between them**: the existing line-of-sight check (`visit.js`, the
    display-visibility ray) against displays and the counter. A shelf between two chairs splits
    them, however close.
- **Side by side:** a pair in company, with no third seat in company with both.
- **A circle:** **three or more** occupied seats, each in company with every other. A circle is
  the best setting: every member can swap with every other, anyone in it can speak up for the
  quiet ones (step 5), and sitting in one makes members acquainted (step 4).
- **Not by crow-flies distance alone.** Two people knitting at the same time across the shop, or
  through a shelf, are not together: nobody shouts across a yarn shop to trade. Distance without
  facing and a clear line is just two strangers in a room.
- **Standing chat** (the existing `WAIT` near another customer) is the weakest setting: brief, and
  only the speaking-up pair, no circle.

*Check at build time:* the six default seats sit within 2.25 m of each other; confirm which pairs
the facing rule passes for the default layout, so a new game starts with at least one pair in
company but not a full circle (the circle is the player's to make).

---

## 2d. Encouraging it: why the chairs are not set once and forgotten

Arranging chairs into a circle once would solve swapping forever, so the circle needs a **cost**,
and the player needs **daily** reasons to rearrange.

1. **Company slows knitting.** A round spent chatting in company is not a round of knitting: a
   seated customer in company knits at **half rate** while they chat. A circle swaps stash and
   makes friends; a quiet chair finishes objects sooner. The player chooses per day which they
   want more, and the answer changes with who is in.
2. **Seats are chosen by personality.** A customer walking to sit picks:
   - Enthusiasm or Assertiveness 4+: a seat in company with someone already sitting;
   - Withdrawal 4+ or Industriousness 4+: a seat **not** in company with anyone, if there is one;
     if every chair is in the circle, they sit anyway, but shorter.

   A shop with only a circle loses its quiet, industrious knitters' big projects; a shop with only
   scattered chairs loses the swaps. **A circle and a quiet nook** is the good layout, and getting
   the right people into each is the puzzle.
3. **Something on the circle's table starts a conversation.** A pattern (or a project's worth) set
   on a small table inside a circle is seen by everyone in it. If it suits someone's stash, it can
   be the occasion: one buys the pattern, another gives the yarn for it. This changes daily with
   who holds what stash, which the attentive player has been reading (§5).
4. **Keeping someone in the shop.** More rounds in the shop means more rounds together (more
   chances at step 10), and more rounds of knitting, which is what lets a nearly-finished
   customer **finish here and dance** (DANCES.md, "Finishing in the shop"). The levers, all
   objects the player places (SPIKE-FUN.md's dwell ideas, made concrete):

   | Lever | Does |
   | --- | --- |
   | **Treats** (a tin on a side table or the counter: an order line, or a thank-you for a gift of yarn; PLAYING-AT-YOUR-PACE.md §5) | a customer passing it stops for tea and a biscuit: +1 round, one of the tin's 4 servings |
   | **An armchair** (better than a stool) | seated sessions last longer: +2 rounds before they get up |
   | **A rug** under the seats | a cosy zone: knitting on it is a little faster |
   | **Save a seat** (above) | brings the right person to the right chair in the first place |
   | **Close their gap** | a ready customer close to finishing sits down to finish (DANCES.md) |
   | **Affinity** | regulars and friends are more patient anyway (REGULARS §2) |

   **The finishing choice:** company halves knitting (1 above), so a nearly-done customer in the
   circle may run out of rounds; in a quiet armchair with tea they finish for sure, but dance
   alone. Seat them in the circle with tea and an armchair, and the whole circle dances with
   them. Noticing who is close (their work is nearly full size) is the attention the reward
   asks for.
5. **Knit night** (a scripted event, SCRIPTED-EVENTS.md, earned later): once a week, regulars
   arrive together in the evening, and only the circle counts. The player sets up the circle for
   that night, then puts the nook back.
6. **The swap basket** (later unlock): a basket placed in a circle holds stash a giver leaves for
   anyone. It does not need two people at once, but it is slow and only takes customers' stash,
   never the shop's stock, so it is not a second donation box.

### Seating people: the player's verbs

Chairs alone leave matchmaking to chance: the player arranges the room, but the customers choose
where to sit. So the player gets verbs for **who** sits **where**, through objects and the
click-to-pick gesture, never a menu. Every one is optional, and every refusal is charming, never a
penalty.

**Save a seat (build first).** An item placed **on a chair** is a place card. On their next
decision to sit (`WALK_TO_SEAT`), a customer goes to a saved chair first if its item suits them,
sits, and picks it up to look:

| On the chair | Draws | Then |
| --- | --- | --- |
| **a pattern** | whoever has a want it suits: an object-first customer of its type, or a **stash holder whose yarn suits it** | it is a buy candidate as if on a display; a stash holder who buys it can start the stash on the spot |
| **a ball, or a run on a side table** | a yarn-first shopper it catches (§4) | a buy candidate |
| **a regular's project bag**, moved from the hold shelf (PROJECT-BAGS.md §3b) | that regular, and only them | they collect it there (PROJECT-BAGS.md §3c) and may sit and knit from it |

- **Suits** is the same test as a display's (`satisfies` against `wantsOf`), so there is no new
  matching rule to learn. A chair whose item suits nobody in today is just a chair with something
  on it.
- **Personality still answers:** the seat-choice rule (2 above) is applied *after* the save, so a
  Withdrawal 4+ customer drawn by a pattern on a chair in the circle picks up the pattern, then
  asks to take it to the quiet nook (the item moves with them, and the save is spent).
- **One item per chair,** 1x1 or 2x2 (a pattern) on the seat; the chair seat is a stacking surface
  with headroom for one layer. Customers leave the item on the chair if they do not buy it.
- **The matchmaker's move:** a pattern that suits Mira's stash, on the chair beside the chair the
  knitter whose project wants blue is sitting in. Mira sits, buys the pattern, and the two are in
  company with something to talk about.
- **Pillar:** a player who never saves a seat loses nothing. A save that misses is a display.

**Offer a seat (later).** Click a customer, then a chair: *"Have a seat!"* Politeness or Enthusiasm
4+ accept; Withdrawal 4+ decline a chair in company but accept a quiet one; Assertiveness 4+ may
choose their own anyway; someone already seated stays put. Needs clicking a customer to pick them
as an actor, which today only shows their label (TUTORIAL.md §7.1).

**Introduce (later).** Click one customer, then another: they meet and chat (standing), which makes
them acquainted (§2b step 4) and makes sitting together likelier for the rest of the visit. The
only way two quiet people ever swap without a circle, because step 5 still needs someone to speak
up, and an introduction counts as the player speaking for them, once.

The pillar: an inattentive player's default chairs still produce the odd swap; an attentive one
notices the wanderer's blues and seats them by the knitter whose pattern wants blue.

---

## 3. A project's worth

The thing that makes an orderly customer buy yarn without a pattern, and an object-first customer
buy yarn before one.

**A project's worth** is a group of yarn on one display, **beside or in a run** (ARRANGEMENT-RECIPES
§2.1), of one weight and one material, with at least as many units as a pattern type calls for
(`PATTERN_TYPES[type].yarnUnits`: 8 for a sweater, 3 for a hat).

- **For an orderly customer (Orderliness 4+)** it must also be **one colour**: a single dye lot,
  as NEAR-MISS §3 says they want.
- **An object-first customer** needs a project's worth for **their** type. Three matching blues
  are a hat's worth, not a sweater's.
- **An orderly customer without a type** takes the biggest project the group covers: eight
  matching blues read as a sweater.
- Held-double pairs count as one unit each, as everywhere (ARRANGEMENT-RECIPES §2.3).

This is a recipe in all but name: set out a sweater's worth of one blue and an orderly customer
buys the lot. It belongs in ARRANGEMENT-RECIPES.md as a yarn-layer row, **project's worth**.

---

## 4. What catches a yarn-first eye

A **rule** the player can learn (rules not facts, NEAR-MISS §7), weighted by personality:

| Draw | Who it catches most |
| --- | --- |
| **A run** (a colour run, a rainbow, a fade): any colourwork recipe set out | Openness |
| **New in:** this morning's delivery, and the supplier sample above all | Enthusiasm |
| **Unlike their last project** (colour family, weight) | Volatility |
| **The display they meet first** (by the door, at eye level) | everyone, a little |
| **Their own preferences** (`prefs.materials`, `prefs.weights`) | everyone |

- **Yarn on the floor still never catches the eye** (Needle Tips: shelves sell, floors don't).
- A yarn-first customer who falls for a ball inside a recipe takes the recipe's look home with it:
  their stash *is* a set of stripes waiting for a pattern.

---

## 5. Reading them

All in the channels (TUTORIAL.md §2), explicitness by personality (TUTORIAL.md §7.4):

| Start | How they move | Their tell | Guestbook gist (TUTORIAL.md §7.3) |
| --- | --- | --- | --- |
| **Pattern first** | purposeful, straight to the yarn wall | a pattern in hand, glanced at; bubble: the pattern's yarn | *"Had a pattern in mind."* |
| **Object first** | to the patterns first | bubble: the object's silhouette and a "?"; a hand to their own head for a hat | *"Wants to make a hat."* |
| **Yarn first** | slow, wandering, picks up and puts back (the put-backs the Guestbook already witnesses) | hearts at a ball; after buying, bubble: the ball and a "?" | *"Fell for the blues."* |
| **Stash return** | in carrying their own ball | the ball held up beside patterns | *"Still looking for a pattern for those blues."* |

The player helps each differently, which is the point:

- **Pattern first:** put the right yarn where they will walk.
- **Object first:** put a pattern of their type out, or a project's worth of yarn for it.
- **Yarn first:** make something beautiful, then put a pattern that suits it nearby, today or by
  their next visit.

---

## 6. The thank-you line knows how it started

The start is one more fact the selfie's line can remember (PROJECTS-AND-AUTHORSHIP.md §4b):

| Start | Sounds like |
| --- | --- |
| Pattern first | *"Found the perfect yarn for this one."* |
| Object first | *"Wanted a hat. The pattern was right by the blues."* |
| Yarn first | *"Bought the blues before I even had a plan."* |
| Yarn first, from stash | *"Those blues waited three weeks for this pattern."* |

---

## 7. The pillar

- **Inattentive player:** everyone still shops. Yarn-first customers buy what catches their eye
  and go home with stash, object-first customers find some pattern eventually, and finished
  objects keep coming.
- **Attentive player:** learns that the wanderer with hearts is yarn first and needs a pattern
  nearby, and that the one holding their head wants a hat.
- **Organised player:** sets out a sweater's worth of one blue for the orderly regular, and keeps a
  pattern for the stash-holder's yarn by the door for their return.

---

## 8. Build order

1. **`start` on the WIP and the choice** (§1) in `makeWip`. Pure; one test that the starts come
   out in proportion to the traits.
2. **`wantsFor` branches** for object first and yarn first (§2), and the yarn-first buy amounts.
   Pure, testable in node.
3. **A project's worth** (§3): a detector over a display's grid, shared with the recipe
   formations. Add the **project's worth** row to ARRANGEMENT-RECIPES.md.
4. **The eye-catch weights** (§4) in the browsing choice.
5. **Stash returns** with the slot's yarn carried (needs the carried project bag, PROJECT-BAGS.md §7).
6. **In company and circles** (§2c): a pure function over seats and obstacles, with a test on the
   default layout.
7. **The swap check** (§2b) as one pure function of two NPCs and their setting, with a test per
   step that fails. Then personality seat choice and half-rate knitting in company (§2d 1–2).
8. **Save a seat** (§2d): the chair seat as a one-layer stacking surface, and `WALK_TO_SEAT`
   preferring a saved chair whose item suits them. Offer a seat and introduce come after the
   customer becomes a pickable actor.
9. **Tells and gists** (§5) as bubbles and the Guestbook rows exist.

---

## Open questions

- ~~**Does a stash slot ever give up?**~~ **No:** stash is forever, unless swapped with a friend
  (§2b).
- **Do the swap numbers feel right?** Half-rate knitting in company, the 2.4 m and −0.2 facing
  thresholds, and the 0.2 / 0.4 / 0.6 rolls are first guesses for playtesting.
- **The tutorial friend's start:** day 1 seeds a pot holder pattern in front of them, which fits
  object first ("something small to start with"). Proposal: the friend is always object first,
  type pot holder.
- **Should the start be visible on the label** when the player clicks a customer, or only read from
  behaviour? Proposal: behaviour only, like the rest of personality.
