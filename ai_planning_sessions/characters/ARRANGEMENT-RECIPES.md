# Arrangement Recipes

**The canonical table** of arrangement recipes: how stock set out in the shop becomes a particular
look on a finished object. Built to be added to: a new recipe is a new row that follows §1's
schema and §2's shared rules.

Why recipes exist, how they are discovered and rewarded, and how a player reads a project are in
`PROJECTS-AND-AUTHORSHIP.md`. Who will accept what is `NEAR-MISS-AND-SUBSTITUTION.md` §3. What
can be drawn is `characters/garments.js` (COLOURWORKS, STITCHES, EDGES, ACCESSORIES) and
`VISUAL-DESIGN-FINISHED-OBJ.md`. Trait names are the exact ten from `CHARACTER-ATTRIBUTES.md`.

*Every row is proposed until tuned by play; the Status column says which are decided.*

---

## 1. The schema: one row per recipe

| Column | Meaning |
| --- | --- |
| **ID** | short stable key, used in code and on recipe cards |
| **Recipe** | the name the player learns |
| **Tier** | **basic** (learnable from day 1), **intermediate**, **advanced** (needs a skilled customer, or combines other recipes) |
| **Layer** | which part of the object it decides: `yarn`, `colourwork`, `stitch`, `edge`, `accessory`, `fit` (§2.5) |
| **Arrange** | the arrangement rule, in words a player could say. Precise terms (adjacent, run, stacked, beside) are defined in §2.1 |
| **Makes** | the look: the `garments.js` field and value it sets, or the yarn it effectively becomes |
| **For** | pattern types it applies to (`sweater shawl scarf bag hat socks`, later `potholder` and the other decor types); `any` for all |
| **Skill** | minimum crafter skill (1–5) |
| **Who goes for it** | the traits that make a customer adopt it, and any that refuse it |
| **Hint** | how a player is nudged toward it (PROJECTS-AND-AUTHORSHIP.md §4) |
| **Draws** | **yes** if `garments.js` already renders it; **new** if rendering is to be built |
| **Status** | proposed / decided |

---

## 2. Shared rules every recipe obeys

### 2.1 Arrangement words

- **Beside / adjacent:** occupying grid cells that share an edge, on the same display level.
- **Run:** three or more items in a line of adjacent cells on one level, read in **reading order**
  (left to right, front row first, from the customer's side of the display).
- **Stacked:** one item resting on another (the grid's layers). On a round ball the round-centre
  rule applies (`inventory/grid.js`: anything on a 3x3 ball covers its centre cell).
- **Ringed:** every cell around a centre item is occupied by the stated items.
- **Big / small:** by yarn weight class: size 1 (lace, fingering, sport), size 2 (dk, worsted,
  aran), size 3 (bulky, super-bulky). "Small beside big" means a lower size class beside a higher.
- A pattern **beside** the arrangement scopes it to that pattern's type. Without one, the recipe
  applies to whatever project the customer is already carrying, if its type is in **For**.

### 2.2 Order is meaning

A customer buys along a display in reading order, so **the order stock sits in is the order it is
used**: stripe order, ground before accents, main before trim. `wornAs` in `garments.js` keeps
purchase order when it turns yarn into colours.

### 2.3 Held together (the basis of the advanced yarn recipes)

**Two balls stacked are two strands held together.** Knitters do this to make a heavier yarn from
lighter ones, to marl colours, and to add halo. The pair counts as **one unit** toward the pattern
(PATTERNS.md: one item, one unit; a held pair is one working strand), so holding double costs twice
the balls.

**Weight of a held pair**, after common knitting practice (two strands of a weight knit roughly
like the weight two steps up):

| Held together | Knits as |
| --- | --- |
| lace + lace | fingering |
| fingering + fingering | dk |
| sport + sport | worsted |
| dk + dk | aran |
| worsted + worsted | bulky |
| aran + aran | bulky |
| bulky + bulky | super-bulky |
| two different weights | the heavier one, one step up (capped at super-bulky) |

- A pattern asking for **dk** is fully satisfied by **two fingering held together**: an advanced
  player can serve a dk knitter from a shop full of fingering.
- Mohair or another fuzzy fibre held with anything adds **halo** to the other yarn's weight
  without changing it much: weight of the other strand, one step up at most.

### 2.4 Personality and skill gates

A recipe only fires for a customer who would go for it (**Who goes for it**) and has the **Skill**.
Gates read the ten traits on their 1–5 scale; "high" is 4–5, "low" is 1–2. A customer who would
not go for it treats the arrangement as ordinary stock and takes what suits them, so a recipe
never blocks a sale: at worst it just does not happen.

### 2.5 Layers and combining

- An object has one recipe per **layer**: one yarn treatment, one colourwork, one stitch, one
  edge, one accessory, one fit. Recipes on different layers **combine** (a fair isle hat with a
  pom-pom is `colourwork` + `accessory`).
- The **yarn** layer feeds the others: held pairs become the "balls" a colourwork recipe reads,
  so a run of stacked pairs is a run for stripes (that is how marled stripes works).
- Two recipes on the same layer: the one nearer the pattern wins; a tie goes to reading order.

### 2.6 Rules, not facts

Every row must be true for every customer for the whole game (NEAR-MISS §7). A recipe that only
works for one named person is not a recipe; that belongs in a script (SCRIPTED-EVENTS.md).

---

## 3. The recipes

**Notions for these recipes:** **cables** needs a cable needle and **buttons** needs buttons. Both
are now in the catalogue (`'cable-needle'` and `'buttons'` in `NOTION_NAMES`, `inventory/catalog.js`),
stocked and ordered like any notion. Ahead of the recipes, a design already asks for them: a design
whose title says "cable" carries `notions: ['cable-needle']` and every cardigan `['buttons']`, and
`wantsFor` (`characters/wip.js`) turns each one not yet held into a `notion` want.

### 3.1 Yarn: what the working strand is

| ID | Recipe | Tier | Arrange | Makes | For | Skill | Who goes for it | Hint | Draws | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `held-double` | Held double | intermediate | two balls of the **same colour** stacked | one strand, weight per §2.3; solid colour | any | 2 | Industriousness; practical tastes | an expert's bubble: two balls becoming one thick strand | yes (weight drives bulk) | proposed |
| `marled` | Marled | intermediate | two balls of **different colours** stacked | `marled`, weight per §2.3 | any | 2 | Openness; cosy tastes | a bubble: two colours twisting into one | yes | proposed |
| `halo` | Mohair halo | advanced | a mohair (fuzzy) ball stacked on any ball | the other yarn's colour with a soft halo | sweater shawl scarf hat | 3 | Openness, Enthusiasm; refused by low Openness | a supplier sample of mohair | new (fuzz shell) | proposed |
| `fade` | Fade | advanced | a run of stacked pairs where **one strand changes at a time**: A+A, A+B, B+B, B+C… | colours blending gradually along the object | sweater shawl scarf | 4 | Openness and Industriousness both high | an expert's bubble: a row of pairs, each sharing a colour with the next | new (blended stripes) | proposed |

### 3.2 Colourwork: where the colours go

| ID | Recipe | Tier | Arrange | Makes | For | Skill | Who goes for it | Hint | Draws | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `stripes` | Stripes | basic | a **run** of different colours; order is stripe order | `stripes` | any | 1 | most; high Orderliness keeps it to 2–3 colours | the first multi-colour delivery | yes | proposed |
| `marled-stripes` | Marled stripes | advanced | a **run of stacked pairs**, each pair a different colour mix | `stripes` whose stripes are marled | sweater scarf hat socks | 3 | Openness, Enthusiasm | a bubble: stripes of twisted pairs | new (marled per stripe) | proposed |
| `fair-isle` | Fair isle | intermediate | one **big** ball (the ground) with **small** balls of contrast colours beside it (the accents) | `fair isle`: ground from the big ball, pattern from the small ones | sweater hat socks bag | 3 | Openness; skilled | a fair isle hat on a returning regular | yes | proposed |
| `colour-block` | Colour block | basic | two or three **big** balls of clearly different colours side by side, same size class | `colour-block` | sweater bag scarf | 1 | Enthusiasm; bold tastes | a bubble: three bold squares | yes | proposed |
| `checks` | Checks | intermediate | two colours alternating in a **checkerboard** of at least 2x2 | `checks` | bag scarf sweater | 2 | high Orderliness | the counter note | yes | proposed |
| `ombre` | Ombré | intermediate | one hue in a run sorted **light to dark** | stripes graded through the hue | any | 2 | Orderliness and Openness | a bubble: one colour, lighter, darker | yes (as ordered stripes) | proposed |
| `motif` | Motif | intermediate | one bright ball **ringed** by balls of a single neutral | `motif` on a plain body | sweater bag hat | 2 | sentimental tastes; often a gift | a gift-giving regular's bubble: a heart | yes | proposed |
| `seamless` | Seamless | basic | several balls of the **same colour** (one dye lot) together, nothing else between | a flawless solid; NEAR-MISS `seamless` met | any | 1 | high Orderliness, euphoric | an orderly customer's frown at mixed dye lots | yes | proposed |
| `contrast-trim` | Contrast trim | basic | a run of one colour with **one different ball at its end** | the odd ball on cuffs, hem and edges | sweater hat socks scarf | 1 | most | a returning regular with contrast cuffs | yes (overflow colour goes to trim) | proposed |

### 3.3 Stitch: the fabric's texture

| ID | Recipe | Tier | Arrange | Makes | For | Skill | Who goes for it | Hint | Draws | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cables` | Cables | advanced | a cable needle beside **aran-weight wool** and its pattern | `cable` stitch | sweater hat scarf | 4 | Industriousness; skilled | a supplier sample: a cable needle the week aran first arrives | yes | proposed |
| `lace` | Lace | advanced | **fine** yarn (lace or fingering) beside stitch markers and a shawl pattern | `lace` | shawl scarf | 4 | patient: low Volatility | a bubble: a shawl with holes in it, admired | yes | proposed |
| `rib` | Ribbed | basic | a pattern with the **smallest** needles in the shop beside it | `rib` | hat socks sweater | 1 | Orderliness | the counter note | yes | proposed |

### 3.4 Edge: how it finishes

| ID | Recipe | Tier | Arrange | Makes | For | Skill | Who goes for it | Hint | Draws | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fringe` | Fringe | basic | skeins laid along the **front edge** of a scarf or shawl pattern | `fringed` edge | scarf shawl | 1 | most | a regular's fringed scarf | yes | proposed |
| `picot` | Picot | intermediate | a small ball of a contrast colour at each **front corner** of the pattern | `picot` edge in that colour | shawl scarf socks | 3 | sentimental tastes | a bubble: a tiny scalloped edge | yes | proposed |

### 3.5 Accessory: what is added

| ID | Recipe | Tier | Arrange | Makes | For | Skill | Who goes for it | Hint | Draws | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `pom-pom` | Pom-pom | basic | a **small** ball **stacked on** a hat pattern | `pom-pom`, in that ball's colour | hat | 1 | Enthusiasm | the tutorial friend's second project | yes | proposed |
| `tassel` | Tassels | basic | a skein stacked on a scarf, shawl or bag pattern | `tassel` | scarf shawl bag | 1 | most | a bubble | yes | proposed |
| `buttons` | Buttons | basic | a buttons notion beside a cardigan pattern | `buttons` | sweater (cardigan) bag | 1 | most cardigan knitters | the first buttons in a delivery | yes | proposed |
| `flower` | Flower | intermediate | a small bright ball beside a hat or bag pattern, with a crochet hook | `flower` | hat bag | 2 | sentimental tastes; crocheters | a crocheter's bubble | yes | proposed |

### 3.6 Fit: how it sits

| ID | Recipe | Tier | Arrange | Makes | For | Skill | Who goes for it | Hint | Draws | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `oversized` | Oversized and cosy | intermediate | **bulky** yarn beside a pattern written for a lighter weight | a deliberately roomy fit (NEAR-MISS: the near miss, chosen) | sweater scarf hat | 2 | Enthusiasm; refused by high Orderliness | a regular in a roomy jumper, delighted | yes (size is fit) | proposed |

---

## 4. Which recipes apply to which pattern

| Pattern | yarn | colourwork | stitch | edge | accessory | fit |
| --- | --- | --- | --- | --- | --- | --- |
| **sweater** | all | stripes, marled stripes, fair isle, colour block, checks, ombré, motif, seamless, contrast trim | cables, rib | — | buttons (cardigan) | oversized |
| **shawl** | held double, marled, halo, fade | stripes, ombré, seamless | lace | fringe, picot | tassel | — |
| **scarf** | held double, marled, halo, fade | stripes, marled stripes, colour block, checks, ombré, seamless, contrast trim | cables, lace | fringe, picot | tassel | oversized |
| **hat** | held double, marled, halo | stripes, marled stripes, fair isle, ombré, motif, seamless, contrast trim | cables, rib | — | pom-pom, flower | oversized |
| **socks** | held double, marled | stripes, marled stripes, fair isle, ombré, seamless, contrast trim | rib | picot | — | — |
| **bag** | held double, marled | stripes, fair isle, colour block, checks, ombré, motif, seamless | — | — | tassel, buttons, flower | — |
| **pot holder** (decor) | held double | stripes, checks, colour block, seamless | — | — | — | — |

---

## 5. Adding a recipe

1. Give it a row in the right layer table, with every column filled.
2. Check the arrangement uses §2.1's words, so it is unambiguous on the grid.
3. Check it is a **rule** (§2.6): true for every customer, forever.
4. Check it does not collide with an existing row on the same layer; if it does, say which wins.
5. Add it to §4's matrix.
6. If **Draws** is **new**, add it to VISUAL-DESIGN-FINISHED-OBJ.md §6 ("code that will need to
   follow this spec").
7. Give it a hint (PROJECTS-AND-AUTHORSHIP.md §4) and a recipe card drawing.
8. Give it a **credit phrase**: what a customer saw, in their words, for the selfie's thank-you
   line (PROJECTS-AND-AUTHORSHIP.md §4b).

---

## Open questions

- **How many at launch?** 23 rows here. A first set of five or six (stripes, colour block,
  seamless, fringe, pom-pom, held double) covers every layer but stitch.
- **Held double and the units rule:** a held pair counts as one unit, so a held-double sweater
  needs 16 balls. Realistic, but it may need the pattern's unit count to scale with weight.
- ~~**Does a recipe need a pattern beside it?**~~ **No** (HOW-THEY-SHOP.md): yarn-first shoppers
  fall for the arrangement alone; object- and pattern-first shoppers want it beside, or matching,
  a pattern they can make.
- **Add the project's worth row** (HOW-THEY-SHOP.md §3): a group of one weight and material with
  a pattern type's units, one colour for orderly customers.
- **Fades and marled stripes need new rendering** (per-stripe blends); worth it for the
  advanced tier's showpieces.
