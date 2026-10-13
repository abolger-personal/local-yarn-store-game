# Patterns MVP: 

## Appearance in Store: 
- A pattern is a 3D box like a notion, but should be given labels on the box and possibly additional details to make it look like a BOOK. Cover icons match pattern types. 
- **TODO(spec), design later:** today's pattern boxes don't work — they read as just another notion box. A pattern must look like a book at a glance (spine, cover, pages), distinct from both notion boxes and yarn. To be designed fully; until then the placeholder covers in `characters/store/goods/art.js` stand in. (Decided 2026-10-12, when the stash demo's yarn-coloured "booklet" family was dropped for reading as a pattern or notion box.)
- Physical grid wise it is always 2x2x1. 
- Clicking or inspecting a pattern shows a detail screen with the BASE finished object, an offscreen render of the same generator that builds the 3D FO (see `../characters/VISUAL-DESIGN-FINISHED-OBJ.md` §2). No shop-level thumbnail.

## Pattern types

Every type in VISUAL-DESIGN-FINISHED-OBJ.md §1 except the swatch, which is a crafting step, not a pattern. 

| Type | Cover icon | Yarn cost, in balls (proposed) |
| --- | --- | --- |
| sweater | sweater | 8 |
| blanket | folded blanket (proposed) | 6 |
| shawl | triangle | 5 |
| scarf (cowl, ascot, long …) | droopy donut | 4 |
| bag | bag | 4 |
| hat | hat with pom | 3 |
| amigurumi | species head (proposed) | 3 |
| socks (incl. slipper socks, leg warmers) | sock | 2 |
| cozy | teapot (proposed) | 2 |
| chair cover | doily (proposed) | 2 |
| mittens | mittens (proposed) | 2 |
| potholder | square (proposed) | 1 |

**A pattern's yarn cost is a count of yarn UNITS of the pattern's own recommended weight, never more than 8.** A yarn's units come from its shape, never its weight (YARN.md, "Units"; revised 2026-10-12, it was one unit per item).

- Yarn weight still decides an item's size on the shelf: lace, fingering and sport are 1x1x1; dk, worsted and aran are 2x2x2; bulky and super-bulky are 3x3x3. That is space in the shop, not an amount of yarn.
- Yarn of a different weight still counts one item each, but it is a near-miss: it moves the FO's fit and can make it COMPROMISED. See NEAR-MISS-AND-SUBSTITUTION.md and the visual doc §3.
- Why not volume: items span 1 to 27 by volume, a 27x spread, so no single cost works across weights. A sweater priced sensibly for bulky needed 54 or more lace balls, which while it is true in real life, would stretch out gameplay for players looking to arrange yarn for NPCs in a obnoxious way.  


## Pattern attributes

- name: a punny title such as "the OwlyCowly", one of a finite set that the shop re-stocks, so a name identifies one design (in code as `title`; see WEARABLE-FINISHED-OBJ.md, "Pattern names")
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
- 2026-10-02:
    - mittens are a pattern and a DECOR finished object: knitted, never worn (no rendered fingers). VISUAL-DESIGN-FINISHED-OBJ.md §1 lists them under decor
    - blanket added as a decor type (6 balls, proposed): it drapes over the shop's chair backs and display tables, which record where it fits
    - ~~the code lags this table~~ Done 2026-10-03 for the wearables: `PATTERN_TYPES` in `inventory/catalog.js` makes sweater, shawl, scarf, bag, hat and socks at this table's costs, and `yarnUnits` counts one per item. Each named design carries the silhouette it makes (`silhouette`, garments.js's own words), and the finished object is built as that silhouette. The decor types are still not patterns: nothing draws a decor FO yet, so one would finish invisible; see VISUAL-DESIGN-FINISHED-OBJ.md §6
- `yarnUnits` also sets how many rounds a project takes (WIP-AND-FINISHED-OBJ-FORMATION.md): socks are
  a quick win, a sweater spans a visit or two. Decor types (only the pot holder so far) stay off random
  stock and customers' patterns until something draws them; the pot holder is put out by the tutorial alone.

## Open questions

- **TODO(spec):** tie a pattern's tool size to its difficulty; tracked in
  characters/NEAR-MISS-AND-SUBSTITUTION.md, open questions ("Difficulty is not a pattern attribute yet").
