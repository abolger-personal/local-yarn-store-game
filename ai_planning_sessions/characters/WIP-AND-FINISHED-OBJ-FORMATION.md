
An NPC has a variable set of slots called "WIPs" (works in progress) that, depending on player layout of items and store time, can either be encouraged to turn into Finished objects, left to linger, or abandoned to the FROG PILE.

A WIP is either: UNSTARTED, IN PROGRESS, FINISHED OBJECT, (or FROGGED, a post MVP mechanic)

An UNSTARTED WIP slot at NPC Generation time is initialized with: 
- 0 or 1 PATTERNS
- 0 to 1 items of YARN (note: 1 unit != 1 item. Units of yarn determined by physical grid size on that yarn item)
- 0 or 1 TOOL NOTIONS (crochet hook or knitting needles)
- (POST MVP MECHANIC) 0 or 1 ACCESSORY NOTIONS (stitch markers)
- 0 percent "progress to completion"


The following Character attributes affect WIP initialization as hard coded rules: 
- If a WIP is initialized with a pattern, then other slots are zeroed out (NPC must shop)
- If a WIP is NOT initialized with a pattern: 
-  then TOOL NOTIONS must match one of the NPCs skill types (knit, crochet, both)

The following Character attributes *probabalistically* determine slot initialization:
- (Intellect + Orderliness)/10 determine how likely the WIP is to be initialized with a pattern in the first place (e.g. NPCs with 5 in both will always start with a pattern first approach)

- todo add more here later. 

After a "Buy" in the game mechanic, WIPs can be moved from UNSTARTED to IN PROGRESS if: 
- 1 pattern exists
- 1 or more YARN units exist
- 1 or more Tool notions exist 

During the NPC's "Work on a WIP" action, a single round of a WIP can have progress incremented as follows: 
        1/(number of units of yarn called for by pattern) * characterWeight

        characterWeight = (NPC crafter skill level)/3 * Industriousness/3

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

