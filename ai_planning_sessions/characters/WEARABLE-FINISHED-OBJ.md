Types, silhouettes and how FOs look live in `VISUAL-DESIGN-FINISHED-OBJ.md`; this doc is the worn slots and the lend loop.

## Worn slots

An NPC wears at most one FO per slot. There are no worn mittens.

| Slot | Holds | Notes |
| --- | --- | --- |
| head | hat | |
| neck | scarf (including cowls and ascots) | characters start bare-necked |
| shoulders | shawl | its own layer, so a shawl can be worn over a sweater |
| torso | sweater | |
| bag | bag | |
| feet | socks | |

## Lending and wearing

- After an object is finished, the NPC will bring it to the finished objects drop area to let the store borrow it. The item should LEAVE the NPC's WIPs slots at this point.  That will make it available for the player to decorate a space with, however it's also pleasing to let the NPC *wear* their finished objects. Basic mechanic for now: 
    - if the NPC is not yet wearing an FO in that object's slot (table above), the NPC stores the FO in its "worn" slot and does not offer it to the shop to lend
    - decor FOs (potholder, chair cover, cozy, amigurumi) have no slot, so they are always lent
    - At any time IN THE SHOP, the player can choose to click on an FO and "return borrowed FO to NPC", which will, off screen, move that item into the worn slot for the NPC and place any *previously offscreen* item the NPC was wearing in a pile in the shop behind the guestbook. 
    - a COMPROMISED object can deviate from this default depending on its maker: see NEAR-MISS-AND-SUBSTITUTION.md §5b
