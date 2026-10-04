Inventory can be put on displays to aid formation. 

Gameplay mechanics: 
1. Displays are ALL contiguous 2.5D grids (modelable, though not necessarily implemented by, a connected graph) and may be any size. 
2. ALL displays share a uniform grid size so that inventory can be moved from 1 display to another. 
3. 2.5d Displays can be positioned and rotated ARBITRARILY in a 3D world, and some grids may have additional rules that make their connected graphs more restrictive than others. 
4. All displays may ALL hold ALL type of inventory (e.g. notions, yarn, patterns, etc), but display type may be factored into the likelyhood of an NPC interacting with the inventory on that display. 
5. Displays have rules that affect whether or not a formation (a group of adjacent inventory and a primary driver of NPC interaction) is effective at making the NPC buy something or changing their nood
6. A "formation" is a set of inventory adjacent in grids. 
7. Before internal rules apply, an NPC must "notice" a display. Rules for noticing a shelf are defined by a primary tier of logic so that internal display logic isn't running all the time. 
8. All display interactions take place within a round once the character has walked to that display in the previous game round. No interaction continues over multiple game rounds. 

9. An NPC may RESTRUCTURE a given display (Spread, Tidy or Rearrange - see the per-type scoring rules below) at most ONCE per visit. After that, further interactions with the same display can only Buy or Look.

10. The Player may MOVE entire displays whereever they want inside the shop as long as it follows the rules of: peg boards stay on the wall, and floor piles stay on the floor. All Inventory will stay with the move. Displays may be rotated as well. For MVP, rotations may be every 45 degrees.

   This is the rule that makes "Interaction Not Complete" terminate. The restructure happens, the NEXT round's interaction resolves into a Buy or a Look, and the NPC moves on. Without it, an NPC with an Orderliness of 1 or 5 re-tidies the same display every single round forever, because "Interaction Not Complete" prescribes another interaction with that same display.

   The budget is per NPC per display: a second NPC can still restructure a display the first one has already touched, and an NPC who leaves and comes back on a later visit starts fresh.

10. The Player may MOVE entire displays whereever they want inside the shop as long as it follows the rules of: peg boards stay on the wall, and floor piles stay on the floor. All Inventory will stay with the move. Displays may be rotated as well. For MVP, rotations may be every 45 degrees.

   Furniture moves the way stock does: click a piece to pick it up, it follows the pointer showing green where it may stand and red where it may not, and a second click sets it down (on touch: tap it, then tap where it goes — or press there and slide before lifting). Escape, or leaving furniture mode, puts a piece in hand back where it was picked up. Nothing may leave the room: a piece in hand is clamped to the floor inside the walls, and setting one down where it does not fit (into the counter, a chair, the doorway, another display) puts it back where it was picked up, as a box clicked down where it has no room goes home. Somebody must be able to stand in front of a display to browse it, so one may not be turned to face a wall closer than that.

   Wall shelves do NOT have to stand against a wall (changed from "wall shelves stay against the wall"). Two shelves back to back in the middle of the room is a fine shop, and the old snap-to-wall made it impossible. They may touch back to back but not overlap. A shelf carries its own back panel, so its "wall facing" X- edge (type B below) is the row against that panel wherever the shelf stands — against a wall, against another shelf, or with open floor behind it — and stays unnoticeable to NPCs either way. Sightlines and walking routes already treat any shelf as a solid box, so a free-standing one blocks the view across the room and is walked around like any other display.

11. Interaction psuedocode routine for action inside a round:  
if (can Buy from pile): 
  NPC picks up all parts of visiable Inventory as part of round animation (MVP: 'bend,'reach', 'carry')
  Inventory removed from display 
  return "Interaction Complete"
else: 
  If (Rules for display result in Consideration)
    Animation for NPC considering yarn or notion plays (yarn should squish, and NPC should either be pleased or not depending on consideration outcome)
    return "Interaction Not Complete"
  else If (Rules for display result in Rearrange or Tidy):
    Inventory rearranged or tidy per Display logic and NPC attributes 
    Animation for NPC rearranging pile (default to a cartoon cloud Poof)
    return "Interaction Not Complete"
  else: 
    Animation for NPC is NPC bending over to look at pile and then standing back up
    return "Interaction Complete" 


BASE RULES TO HAVE AN NPC INTERACT WITH A DISPLAY IN THE FIRST PLACE: 
- See "CHARACTER VISIT" for how Display attributes are used to decide if an NPC is interacting with a display

DISPLAY TYPES (more may be added later): 
(Note: none of this section is meant to be visually prescriptive beyond orientation and size. Displays can be themed, so visual component must be separable and changeable)

A. Floor or Table Pile (arbitrarty grid size options, default 5x5x100 and 2x2x100)
Rules: 2.5d stacking with close-to-infinite headroom in the 2.5D direction. Giant Jenga tower style inventory stacks totally allowed

Formation scoring: Inventory should be XYZ adjacent. 

Interaction "Buy" scoring: An NPC can only notice a single inventory item or formation if part of it is on the TOP (Z+) of a 2.5D stack. A partial or full formation that is buried in a stack cannot be noticed or bought by an NPC. An item will be *bought* if it was *considered* in the previous round AND the consideration interaction came back 'true'.  

Interaction "Consideration" scoring: 
   An NPC with *OPEN WIP SLOTS* has a list of *wants* that can be satisfied by the items in the display inventory (see WIP-AND-FINISHED-OBJ-FORMATION.md). If any accessible items (Top Z+ layers) match a want (this is determined by Formation and is independent of NPC personality or preference), the NPC will *consider* the item. 
 
   MVP: For NOW, just add this mechanic in and 100% of considered items will be purchased. Later this wont be true 


Interaction scoring rules in order of satisfying: 
    NPC with an Orderliness attribute = 1 should "spread out" the stack to make a mess: all items will get randomly flattened to as low in Z as possible. (thus allowing them to SOMETIMES satisfy the "Buy" condition afterwards)

    NPC with an Orderliness attribute = 5 will "Tidy" the stack: items will get sorted by category in a single xz tower  (thus allowing them to SOMETIMES satisfy the "Buy" condition afterwards)
    
    NPC with an Assertiveness attribute > 3 will "Rearrange" a stack in place to move an item or formation they want to the top of the stack (thus allowing them to ALWAYS satisfy the "Buy" condition afterwards)
  
  

B. Wall Shelf (arbitrary grid size options, default 5x2x10 and 5x2x10)
Orientation: shelf levels are TILTED 45 degrees, like a Montessori forward-facing bookshelf — the wall edge high, the front edge low, so stock faces up and out toward the player rather than lying flat under the level above. This is a playability requirement, not decoration: a horizontal level seen from the shop's own camera is foreshortened to a sliver and is not a usable touch target on a tablet. The grid itself is unchanged; only the plane it sits on is angled.
Rules: A display with limited XY and 2.5d stacking with Z headroom stopped by the next level of shelf. X- edge is considered "wall facing": items on this edge will not contribute to formation scoring. Shelves do NOT have to be the same XY size or offset 

Formation scoring: Inventory for a formation can be counted if it is anywhere on the shelf AND on an outside "face" (X+, Y+, Y-, Z+)

Interaction "Buy" scoring: An NPC can only notice a single inventory item or formation if part of it is at the OUTSIDE of a shelf (edge can be defined as a boundary in X+-,Y+-, or Z+). Inventory is buried in the middle of a shelf cannot be noticed or bought by an NPC.  

Interaction scoring rules in order of satisfying:
  NPC with an Assertiveness attribute > 4 will "Rearrange" a stack in place to move an item or formation they want to the edge of the stack, thus satisfying the "Buy" condition. Remaining items should get randomly ordered, but pushed to the X+ edge. 
  
  
C. Peg Board (NOT PART OF MVP, DEFER)

A wall-display style for the user to use is an extension of the Table Pile, with a 90 degree orientation: it goes on a wall.  We can call this a "peg board".  It has additional restrictions for where items can be placed, as visually this wall display has an additional mechanic: there should be a "hook" that sticks out as far as the headroom allows in the top-center of some grid squares, indicating where a user can "hang" merchandise boxes or cylinders of yarn