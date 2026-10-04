# Projects and Authorship

How an observant player works out whether a customer has everything their project needs, and how
an attentive, organised player gets the exact finished object they want made: a rainbow sweater,
a fair isle hat, a pom-pom on top.

Companion to `NEAR-MISS-AND-SUBSTITUTION.md` (what a customer will accept, secret requirements,
VERDICT), `REGULARS-AND-SHOP-CHARACTER.md` (affinity, the hold shelf), `VISUAL-DESIGN-FINISHED-OBJ.md`
(how a finished object looks) and `../TUTORIAL.md` (the pillar, the Guestbook, chat). Trait names
are the exact ten from `CHARACTER-ATTRIBUTES.md`.

**The pillar** (TUTORIAL.md): a game that rewards paying attention, but doesn't stress you out if
you don't. An inattentive player still sees finished objects made from whatever customers happened
to buy. An attentive one gets projects completed. An organised one gets exactly what they designed.

---

## TLDR

1. **Reading a project.** The evidence is physical: the WIP growing in their hands, the pattern's
   ball band, the balls poking out of their project bag, and two live tells: *running out* and
   *ready*. No meters, no numbers.
2. **Authorship.** Colours already come from what a customer buys, in the order they bought it
   (`wornAs` in `characters/garments.js`). So **the shelf is the palette**: the order stock sits in
   becomes the order it is knitted in. Above that, a regular's project bag lets the player choose
   the exact balls, and a friend takes a suggested pattern too.
3. **Recipes.** A set of arrangement rules, each producing a look: stripes, fair isle, colour
   block, marled, ombré, a pom-pom, fringe, cables, lace. Each is a **rule** (universal, learned
   once), discovered by the player, and celebrated the first time.

---

## 1. Reading a project: has this customer got everything?

| Question | Evidence |
| --- | --- |
| **What are they making?** | The WIP in their hands: needles or a hook plus a partial object growing toward its finished silhouette (VISUAL-DESIGN-FINISHED-OBJ.md §4b). Their chat bubbles. The 🪑 Guestbook row, if the knitting was witnessed (TUTORIAL.md §7.3). |
| **What does it need?** | The pattern's **ball band**. Clicking a knitting customer whose knitting the player has witnessed shows their pattern's requirements on the label (TUTORIAL.md §7.1): how many balls, what weight, how many colours, what tool. |
| **What have they got?** | Their **project bag**, carried: the balls they own visibly poke out, countable, in their colours. Their purchases in the Guestbook. |
| **The gap, live: running out** | Knitting stops at the end of the yarn. They hold up the tail and glance at the yarn wall. A chatty customer's bubble shows the missing ball; a quiet one only sighs (TUTORIAL.md §7.4: explicitness is personality). |
| **The gap, closed: ready** | The moment they have everything the project needs (their wants empty, usually right after the buy that closes the gap), a **sparkle burst** pops on them, wherever they are: at a display, walking or seated. Not part of the knitting animation. Leaving like that means they will be back with the finished object. |

**The knitting is the progress bar.** The player compares the band, the bag and the tell, and works
out what is missing. Nothing states it.

- The hidden-inventory rule (DESIGN-DECISIONS.md, NPCs) holds: what is in the bag is what they
  own and carry; it was always meant to surface as tells. The shopping list itself stays hidden.
- The project bag is specced in **PROJECT-BAGS.md**: one bag per customer's project, carried or
  left with you on the hold shelf, the same object either way.

---

## 2. Authorship: getting the object you want made

Three levels, each rewarding more attention and organisation.

### 2a. The shelf is the palette (attentive)

- A customer picks up stock along a display in **reading order**, so the order yarn sits in is the
  order they buy it, and `wornAs` makes it the stripe order. **Shelf order is stripe order.**
- A run sorted into a rainbow, beside a sweater pattern, where an open, enthusiastic customer will
  find it: they buy the run, and come back in a rainbow sweater.
- This is the line in LYS.md that started the game, "sort your yarns on shelves by how pretty the
  skeins are", as a mechanic.
- **Personality gates it** (NEAR-MISS §3): high Openness and Enthusiasm take many colours gladly;
  high Orderliness wants one dye lot and will not. Knowing who is browsing is the skill.

### 2b. The project bag (organised)

- Add exactly the balls you choose to a regular's project bag on the hold shelf, in the order you
  place them. They knit from the bag first. The colours, and their order, are the player's;
  personality still accepts or puts back at collection (PROJECT-BAGS.md §3b–3c).
- Needs a regular who has left their bag with you, so it is earned (REGULARS §2, TUTORIAL.md §5).

### 2c. Suggesting a project (friend)

- At the friend tier (SPIKE-FUN.md's suggestion ladder) the player hands them a pattern with the
  bag: the design is the player's too.

### The rules stay honest

- A seven-colour rainbow needs at least seven balls and a pattern big enough to use them.
- The customer needs the skill for the technique (stripes are easy; fair isle and cables are not).
- Wrong weights mixed into the rainbow make a gloriously wonky, COMPROMISED or CHARACTERFUL
  sweater (NEAR-MISS §5). A failure that is a story.

---

## 3. Recipes: arrangement rules that make a look

**The canonical table is `ARRANGEMENT-RECIPES.md`:** a fixed schema, the shared rules (arrangement
words, order is meaning, held together, personality gates, layers and combining), and one table per
layer (yarn, colourwork, stitch, edge, accessory, fit), plus which recipes apply to which pattern.
New recipes are added there.

In short: each recipe is an **arrangement rule** the player can learn, a **look** it produces, and
the **people** who will go for it. Examples: a run of colours makes stripes in that order; a big
ball with small contrast balls beside it makes fair isle; two balls stacked are held together,
heavier, and marled if the colours differ, so a run of stacked pairs makes marled stripes.

Recipes are the NEAR-MISS §4 **secret requirements** seen from the arranging side: a pattern that
secretly wants stripes, a pom-pom or seamless colour gets them far more often when the player has
set out the matching recipe. They are **rules, not facts** (NEAR-MISS §7), unlocked gradually (§4),
and each only matters once someone who would go for it is in the shop.

---

## 4. Discovering recipes, and the reward

- **Hints come through the channels** (TUTORIAL.md §2), never a list:
  - an expert customer's picture bubble (a big ball and three small ones, then a fair isle hat);
  - a counter note now and then (*"Big ball, little balls…"*);
  - a supplier sample (DESIGN-DECISIONS.md / TUTORIAL.md §7.2) that suits one: a cable needle
    arriving the week aran first appears.
- **The first time a recipe fires,** the customer who buys from it reacts (a hop, hearts), and
  when they return with the finished object, it is celebrated: their selfie on the board, and
  **a recipe card** pinned in the back of the Guestbook.
- **The recipe cards** are the player's own notebook of what they have discovered: a drawing of
  the arrangement and the look it made. Undiscovered recipes show as blank cards, so the player
  knows there are more to find but not what they are. A memory aid, never a solution, like the
  rest of the Guestbook.
- Discovery fits the pillar: a player who never sets out a recipe still sees plain, striped and
  random finished objects; one who does gets the looks they chose.

### 4b. The thank-you line: closing the loop

Every selfie carries **one handwritten line from the customer** about where the object came from.
It is the feedback loop's last step: the player arranged something days ago, and the finished
object tells them, in a person's words, that it mattered.

**It is a memory, not a credit.** People don't say "thanks to the arrangement on shelf 3". They
remember a moment, a place, a sight, a person. So the line names something **the player can
recognise in their own shop**:

| What it remembers | Sounds like |
| --- | --- |
| **The sight** (the arrangement, as they saw it) | *"Couldn't walk past all those blues in a row."* |
| **The place** (where the display stood) | *"The little shelf by the window. Every time."* |
| **The neighbour** (what sat beside it) | *"The green was right next to the hat pattern, so…"* |
| **A person** (who nudged them) | *"Mira had the same one. I had to."* |
| **A gap** (what was missing, near-miss) | *"Ran out of red halfway, so the top's orange. I like it?"* |
| **A rescue** (stock off the floor or the donation pile) | *"Found this one on the floor, poor thing."* |
| **How it started** (pattern, object or yarn first, HOW-THEY-SHOP.md §6) | *"Bought the blues before I even had a plan."* |

- **Built only from facts.** At the BUY, the WIP records its **provenance**: which display, a
  **place word** derived from where it stood (*by the window, by the door, near the counter,
  the back corner, by the chairs, on the table, on the floor*), the items beside it, the recipe
  that fired if any, who else was in the shop, and anything substituted. The line is chosen from
  those, so it is always true, even if the shelf has since moved: it remembers the shop as it was.
- **The customer's words, never the game's.** A recipe is described by what they saw (*"two of
  the thin ones held together"*, *"the big ball with the little ones round it"*), never by its
  row name. Knitting words a customer would use are fine (*stripes*, *held double*); the recipe
  card in the Guestbook is where the game's name lives.
- **Voice is personality** (CHARACTER-ATTRIBUTES.md), as with chat (TUTORIAL.md §7.4):

  | Trait high | Their line leans |
  | --- | --- |
  | Enthusiasm | exclamations, gushing: *"THE BLUES!! by the window!!"* |
  | Politeness | thanks the shop: *"Thank you for putting the blues out."* |
  | Openness | the look: *"The blues together looked like the sea."* |
  | Orderliness | exact: *"Five blues, left to right, as shelved."* |
  | Intellect | technique: *"Held the two fingerings together. Worked a treat."* |
  | Assertiveness | their own call: *"Saw the blues. Knew instantly."* |
  | Compassion | who it's for: *"For my sister. She loves the sea."* |
  | Withdrawal | hesitant: *"Hope it's alright… the blues by the window."* |

  Quiet characters say less but still name **one** fact, usually the place: the attentive player
  can always trace it back. Open, chatty ones name the sight and the place.
- **Every object gets a line, not just recipes.** The inattentive player's random sweater still
  says *"Grabbed whatever was by the door, honestly."* That is feedback too, gentle and funny,
  and it quietly teaches what the attentive player already knows. Gaps and substitutions show up
  here as small stories, never as failures (NEAR-MISS §5).
- **The first time a recipe fires,** the line is the sight, said with delight, and the recipe card
  appears in the Guestbook beside it.
- **No repeats:** the same template is not reused within the last several cards on the board.

**Where it shows:**

- **Two lengths.** Every line has a **short form**, at most about 24 characters, for the polaroid
  (*"the blues by the window!"*), and a **full form** for the label and the Guestbook (*"Couldn't
  walk past all those blues in a row by the window. Thank you!"*). The templates are written in
  pairs; the short form keeps the one fact a quiet player needs to trace it back.
- **On the board:** the short form on the polaroid's white margin under their name, **in their own
  handwriting**, one font per personality (VISUAL-DESIGN-2D.md, "Customers' hands"). It is
  *their* writing, which is what makes it a note and not a label, and a regular's hand becomes
  recognisable.
- **Clicking a polaroid** shows the full note on the label (TUTORIAL.md §7.1), and if the display
  it names is still in the shop, it **glows briefly**: the photo points at the shelf.
- **In the Guestbook,** the selfie row keeps the full note forever.

**Credit phrases per recipe** (the sight, in a customer's words; a new recipe adds one, see
ARRANGEMENT-RECIPES.md §5):

| Recipe | They saw |
| --- | --- |
| stripes | all those colours lined up / the rainbow on the shelf |
| colour block | the two big ones side by side |
| seamless | the blues all sitting together / one colour, top to bottom |
| fair isle | the big ball with the little ones round it |
| held double | two of the thin ones together |
| marled stripes | the pairs stacked up in a row |
| fringe | the extra ball tucked at the end |
| pom-pom | the little ball on top |

---

## 5. Build order

1. **Shelf order is stripe order:** make the purchase order follow the display's reading order,
   and check `wornAs` keeps it. Pure sim; testable in node.
2. **The running-out and ready tells:** running out from WIP progress against the yarn in the WIP; ready when `wantsOf` empties.
3. **The project bag, carried and visible**, with its balls (PROJECT-BAGS.md §7).
4. **The pattern's ball band** for a witnessed knitter (extends TUTORIAL.md §7.1).
5. **Recipes as formation data**, starting with the three that need no new rendering: stripes,
   colour block, fair isle; then marled (stacking) and pom-pom.
6. **Provenance at the BUY and the thank-you line** (§4b): recording the display, place word,
   neighbours and recipe is pure sim, and choosing a line from them is a pure function with one
   test (every line names at least one recorded fact). Then the five self-hosted hands, the polaroid margin and the label.
7. **Recipe cards** in the Guestbook.
8. **The hold-shelf project bag and suggestions** (REGULARS build order).

---

## Open questions

- **Exactly how is "big" and "small" judged for fair isle?** By yarn weight (bulky vs fingering),
  by ball size on the grid, or both?
- ~~**Do recipes need a pattern beside them?**~~ No: see HOW-THEY-SHOP.md.
- **How many recipes at launch?** Fourteen is the full list; five or six may be the right start.
- **Can recipes combine?** A fair isle hat with a pom-pom is two recipes on one object.
