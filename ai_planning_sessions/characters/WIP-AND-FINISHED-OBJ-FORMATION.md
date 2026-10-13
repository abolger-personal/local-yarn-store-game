
An NPC has a variable set of slots called "WIPs" (works in progress) that, depending on player layout of items and store time, can either be encouraged to turn into Finished objects, left to linger, or abandoned to the FROG PILE.

A WIP is either: UNSTARTED, IN PROGRESS, FINISHED OBJECT, (or FROGGED, a post MVP mechanic)

An UNSTARTED WIP slot at NPC Generation time is initialized with: 
- 0 or 1 PATTERNS
- 0 to 1 items of YARN (a yarn item is 1 to 10 units by its shape, inventory/YARN.md "Units". A pattern costs 1 to 8 units of its own recommended weight. See inventory/PATTERNS.md)
- 0 or 1 TOOL NOTIONS (crochet hook or knitting needles)
- (POST MVP MECHANIC) 0 or 1 ACCESSORY NOTIONS (stitch markers)
- 0 percent "progress to completion"


The following Character attributes affect WIP initialization as hard coded rules: 
- If a WIP is initialized with a pattern, then other slots are zeroed out (NPC must shop)
- If a WIP is NOT initialized with a pattern: 
-  then TOOL NOTIONS must match one of the NPCs skill types (knit, crochet, both)

The following Character attributes *probabalistically* determine slot initialization:
- (Intellect + Orderliness)/10 determine how likely the WIP is to be initialized with a pattern in the first place (e.g. NPCs with 5 in both will always start with a pattern first approach)

- Without a pattern, a slot starts **object first** ("I want a hat") or **yarn first** (buys what catches the eye, then looks for a pattern): see HOW-THEY-SHOP.md for the weights and what each wants.

After a "Buy" in the game mechanic, WIPs can be moved from UNSTARTED to IN PROGRESS if: 
- 1 pattern exists
- 1 or more YARN units exist
- 1 or more Tool notions exist 

That is the threshold for STARTING (one unit, not the pattern's full count): they cast on with the yarn they have and buy more later. Work stops where the held yarn runs out, so a WIP short of yarn cannot finish.

Yarn is bought BY UNITS (items), until the WIP has what its pattern calls for. An NPC can end up with the wrong colour if the player has not stocked matching units together. Every colour a WIP ends up holding appears in the finished object (VISUAL-DESIGN-FINISHED-OBJ.md §3). How skill and personality decide those purchases is not specified yet (open).

A careful crafter may SWATCH before a WIP goes IN PROGRESS. The swatch affects whether the FO comes out well, and it leaves a 1x1x1 swatch object behind for the swatch wall (VISUAL-DESIGN-FINISHED-OBJ.md §4). Who swatches, and what exactly it changes, is not specified yet (open).

During the NPC's "Work on a WIP" action, a single round of a WIP can have progress incremented as follows: 
        1/(number of units of yarn called for by pattern) * characterWeight

        characterWeight = (NPC crafter skill level)/3 * Industriousness/3

NOTE(spec): the increment is a fraction (1/units) but the threshold is a percentage ("over 100"). Read as a fraction of completion: at characterWeight 1 a project takes exactly its yarn-unit count in rounds (2-unit socks are a two-round job, an 8-unit sweater a visit or two). The code stores it as a percent.

At the end of a "Work on a WIP" action, if progress is incremented over 100, the NPC now has a FINSIHED OBJECT they can show off in the guest book. 

Finishing a WIP (incrementing the progress over 100%) results in a permanent +1 to the NPCs crafter skill level up to a max of 5.  

 
HOW WIPs determine an NPC shopping list: 
- Function MatchObservedInventory(items[]) should take in what the NPC is looking at and return matches to wants. 
- WANTS matches: 
-- A WIP that has no yarn but a does have pattern should match on inventory where the yarn shares all attributes the pattern specifies (TODO: we can make this a messy match later if we want)
-- A WIP that has no notion tool but does have pattern should match on inventory where the notion is the correct size (hook or knitting needle size comparision match)
-- A WIP that has a YARN but no pattern, then notion tools should not match
-- A WIP that has a YARN but no pattern, then any pattern with the same yarn attributes (weight, material) will  match (at least for MVP)
-- A WIP that has a YARN but no pattern, then notion tools should not match
-- A WIP that has a YARN but no pattern, then any pattern with the same yarn attributes (weight, material) will  match (at least for MVP)

Crafter skill (1 to 5) also decides how closely the FO matches its pattern: below the pattern's skill level it comes out simplified, or wonky if well below (VISUAL-DESIGN-FINISHED-OBJ.md §3).

## Open questions

- TODO(spec): a pattern's `minColors` is an attribute it specifies too, but it belongs to the whole yarn collection, not one ball, so the per-ball match cannot check it. It wants a completeness test over the WIP's yarn once colour matters.
- TODO(spec): the yarn match is strict for now ("we can make this a messy match later").
- TODO: nothing refills a freed WIP slot. An NPC who finishes (and wears) a project mid-visit has room for a new one and no way to start it: the natural home for a "cast on something new" action.
