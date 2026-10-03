Types, silhouettes and how FOs look live in `VISUAL-DESIGN-FINISHED-OBJ.md`; this doc is the worn slots and the lend loop.

## Worn slots

An NPC wears at most one FO per slot. Mittens are knitted but never worn: they are decor.

| Slot | Holds | Notes |
| --- | --- | --- |
| head | hat | |
| neck | scarf (including cowls and ascots) | characters start bare-necked |
| shoulders | shawl | its own layer, so a shawl can be worn over a sweater |
| torso | sweater | |
| bag | bag | |
| feet | socks (crew, knee-high, over-knee, slouch, leg warmers, slipper socks) | |

## Lending and wearing

- After an object is finished, the NPC will bring it to the finished objects drop area to let the store borrow it. The item should LEAVE the NPC's WIPs slots at this point.  That will make it available for the player to decorate a space with, however it's also pleasing to let the NPC *wear* their finished objects. Basic mechanic for now: 
    - if the NPC is not yet wearing an FO in that object's slot (table above), the NPC stores the FO in its "worn" slot and does not offer it to the shop to lend
    - decor FOs (potholder, chair cover, cozy, amigurumi, mittens, blanket) have no slot, so they are always lent
    - At any time IN THE SHOP, the player can choose to click on an FO and "return borrowed FO to NPC", which will, off screen, move that item into the worn slot for the NPC and place any *previously offscreen* item the NPC was wearing in a pile in the shop behind the guestbook. 
    - a COMPROMISED object can deviate from this default depending on its maker: see NEAR-MISS-AND-SUBSTITUTION.md §5b

## Pattern names

Every pattern the shop sells is a named **design**: cozy, punny, leaning on the cast (owls and birds, lions, llamas and alpacas): "the OwlyCowly", "Hoot Couture Sweater", "the Mane Event Hat", "Llamaste Shawl". The list lives in code as `PATTERN_TITLES` in `inventory/catalog.js`, keyed by pattern type and then by the silhouette the design makes (garments.js's words: the OwlyCowly is a scarf worn as a cowl), with at least six names per silhouette. The shop spreads its stock **evenly across silhouettes**, not across names: the cowl has more puns than the ascot, but neither turns up on the shelf more often.

- **A name is a design.** One title means one spec (type, silhouette, craft, tool size, weight, material) everywhere and always. Titles are unique across the whole set.
- **A craft pun is that craft.** A title punning on a knitting word (purl, cable, cast off, stockinette …) is a knitting pattern; one punning on a crochet word (hook, chain, granny …) is a crochet pattern. Animal, yarn and cosy puns can be either. The word lists are `CRAFT_TERMS` in `catalog.js`.
- **The set is finite and reused.** The shop's stock draws from these designs and nothing else, so the same pattern turns up again on later days and in more than one customer's bag. Two NPCs can both own, and both knit, the OwlyCowly.
- **The name follows the object.** A finished object is its WIP, and the WIP keeps the pattern it was made from, so every FO (worn, lent, in the Drop Off or the back pile) still knows its pattern's title (`fo.pattern.title`). Labels lead with it: the Guestbook reads "Hazel in the OwlyCowly — scarf pattern (…)".
- A one-off pattern with no title can still exist (the puzzle builder makes them). It just can't be part of a trend.

### Matchies and trends (NOT YET DESIGNED)

Placeholder for a planned mechanic. Nothing here is built or decided yet.

- **The idea:** NPCs who own finished objects made from the same named pattern can "go matchy". A trend starts, and they wear their matching FOs together: a pair of owls in OwlyCowlies, or a whole pride of lions in Mane Event Hats.
- **What already supports it:** the pattern name is the grouping key, and it already survives onto every FO (above).
- **Open questions:** what starts a trend (an FO lent to the shop and put on display? a regular's photo in the Guestbook? the player stocking several copies of one pattern?); whether a trend changes what NPCs want to buy (a pattern-name want, or plain demand for that design); whether matching wants the same colours or only the same pattern; whether it adds a Guestbook moment (a group photo); how long a trend lasts and how it fades.
