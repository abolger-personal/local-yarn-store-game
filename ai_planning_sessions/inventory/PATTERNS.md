# Patterns MVP: 

## Appearance in Store: 
- A pattern is a 3D box like a notion, but should be given labels on the box and possibly additional details to make it look like a BOOK. Cover icons match pattern types. 
- Physical grid wise it is always 2x2x1. 
- Clicking or inspecting a pattern shows a detail screen with the BASE finished object, an offscreen render of the same generator that builds the 3D FO (see `../characters/VISUAL-DESIGN-FINISHED-OBJ.md` §2). No shop-level thumbnail.

## Pattern types

Every type in VISUAL-DESIGN-FINISHED-OBJ.md §1 except the swatch, which is a crafting step, not a pattern. 

| Type | Cover icon | Yarn cost, in balls (proposed) |
| --- | --- | --- |
| sweater | sweater | 8 |
| shawl | triangle | 5 |
| scarf (cowl, ascot, long …) | droopy donut | 4 |
| bag | bag | 4 |
| hat | hat with pom | 3 |
| amigurumi | species head (proposed) | 3 |
| socks | sock (proposed) | 2 |
| cozy | teapot (proposed) | 2 |
| chair cover | doily (proposed) | 2 |
| potholder | square (proposed) | 1 |
| mittens | mittens (proposed) | 2 |

**A pattern's yarn cost is a count of yarn ITEMS (balls, cones, skeins) of the pattern's own recommended weight, never more than 8.** One item is one unit, whatever its weight.

- Yarn weight still decides an item's size on the shelf: lace, fingering and sport are 1x1x1; dk, worsted and aran are 2x2x2; bulky and super-bulky are 3x3x3. That is space in the shop, not an amount of yarn.
- Yarn of a different weight still counts one item each, but it is a near-miss: it moves the FO's fit and can make it COMPROMISED. See NEAR-MISS-AND-SUBSTITUTION.md and the visual doc §3.
- Why not volume: items span 1 to 27 by volume, a 27x spread, so no single cost works across weights. A sweater priced sensibly for bulky needed 54 or more lace balls, which while it is true in real life, would stretch out gameplay for players looking to arrange yarn for NPCs in a obnoxious way.  


## Pattern attributes

- units of yarn required: the table above
- recommended number of yarn colors
- recommended material(s) 
- recommended yarn weight: ONE weight, because the yarn cost is counted in it (already in code as `weight`)
- recommended tool size: needle or hook, in mm (already in code as `toolSize`)
- craft type: knitting or crochet
- skill level 1–5 (proposed; see the skill mapping in the visual doc's open questions)
- **what it makes**, visible in the detail screen, invisible on the box; the vocabulary lives in VISUAL-DESIGN-FINISHED-OBJ.md §2:
    - silhouette (for example a beret, for a hat)
    - stitch texture
    - colourwork
    - edge
    - form (scarves and shawls)
    - accessory

## Notes recorded from spec questions

The visual spec asks for these to be kept here as they come up.

- 2026-09-26:
    - mittens dropped from wearable list (non wearable FOs)
    - cowl folded into scarf
    - swatch is not a pattern
    - units: first set to volume, then replaced the same day. A pattern costs 1–8 items of its own weight, because volume's 27x spread meant 54-ball sweaters
    - the 2D image is an offscreen render
    - tool size and yarn weight decide an FO's fit, so the recommended tool size and weight are what the player can match to get a good fit
