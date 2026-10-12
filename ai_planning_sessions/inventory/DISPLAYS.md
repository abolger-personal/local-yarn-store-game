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

9. An NPC may RESTRUCTURE a given display (Spread, Tidy or Rearrange - see the per-type scoring rules below) at most ONCE per visit. After that, further interactions with the same display can only Buy or Look. Exception (decided 2026-10-12): a purchase at a display earns that NPC ONE more restructure of it, since the purchase restacks the display and can bury the next thing they want. A reticent NPC, who only ever takes what is on top, gains nothing from it; and every extra restructure costs an item, so it still terminates.

   This is the rule that makes "Interaction Not Complete" terminate. The restructure happens, the NEXT round's interaction resolves into a Buy or a Look, and the NPC moves on. Without it, an NPC with an Orderliness of 1 or 5 re-tidies the same display every single round forever, because "Interaction Not Complete" prescribes another interaction with that same display.

   The budget is per NPC per display: a second NPC can still restructure a display the first one has already touched, and an NPC who leaves and comes back on a later visit starts fresh.

10. The Player may MOVE entire displays whereever they want inside the shop as long as it follows the rules of: peg boards stay on the wall, and floor piles stay on the floor. All Inventory will stay with the move. Displays may be rotated as well. For MVP, rotations may be every 45 degrees.

   Furniture moves the way stock does: click a piece to pick it up, it follows the pointer showing green where it may stand and red where it may not, and a second click sets it down (on touch: tap it, then tap where it goes — or press there and slide before lifting). Escape, or leaving furniture mode, puts a piece in hand back where it was picked up. Nothing may leave the room: a piece in hand is clamped to the floor inside the walls, and setting one down where it does not fit (into the counter, a chair, the doorway, another display) puts it back where it was picked up, as a box clicked down where it has no room goes home. A moved display's new mask never revokes a cell that holds stock: the stock moved with it and there is nowhere to evict it to. Somebody must be able to stand in front of a display to browse it, so one may not be turned to face a wall closer than that.

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

GRID AND STACKING RULES (all display types):
- Footprints run 1x1 up to 3x3, and items have a height in layers too (YARN.md: 1x1x1 to 3x3x3). A masked-off slot is a hole: a shop window or fancy shelf where only certain positions exist.
- An item rests on the tallest column under its footprint, bridging shorter ones, and occupies every layer it is tall. Headroom counts its whole height.
- Round supports: only the middle of a ball's or cone's top is a surface. Anything resting on a round item must cover a centre cell of it (the middle cell along an odd side, either middle cell along an even side; a 2x2's centre is the corner all four cells touch). Each round support is checked separately, so half on a flat box and half on a ball's rim hangs. Flat supports are unrestricted; off-centre stacks are wanted (precarious is fine, only a round rim is not). The rule lives in the grid, so the player's drop, NPC restructuring and stock seeding all obey it.
- Exposure: an item can be lifted, or noticed by an NPC, only if it tops EVERY cell of its footprint. A package bridging two columns with something stacked on its other half is buried.
- Drawn height is visual only: the grid keeps whole layers, but items rest on each other's real surfaces, not their bounding boxes (each yarn family's top and bottom are sampled as a height map). An item is drawn lowered until it touches what is beneath it and a stack settles together; never above its grid height or below the level. At a rim, settling errs toward a hair of air rather than overlap.

OVERNIGHT: closing the day removes what was bought and leaves everything else as the player arranged it — displays, positions, slots. A stack comes back as the same stack; anything that sat on a bought item drops onto what is left. If that would leave it on a round rim it moves to the first legal spot on the same display; if there is none it stays put, since losing stock overnight is worse than an overhang.


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

    NPC with an Orderliness attribute = 5 will "Tidy" the stack: items will get sorted by category in a single xz tower  (thus allowing them to SOMETIMES satisfy the "Buy" condition afterwards). (Experimental, demo only right now: stash-and-stuff.) Tidy groups by kind — a notion by its name, yarn by its family — one tower per kind, overflowing into another tower of the same kind at headroom.
    
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

Hooks are column-sparse, not a checkerboard: a hook sits in one column of holes and items hang below it, spanning rows but never columns. Every other column is usable, so 1-wide items of any height hang and anything 2 columns wide cannot (the shared drop auto-turns a 2x1 to 1x2). How far a stack sticks out from the wall is a distance (the hook's reach), not a layer count.

IN THE STORE (as built in characters/store/; code points here with `DISPLAYS.md §Section`)

### Scale
- Everything is sized against a customer about 1.0 tall. Notions are deliberately oversized (a 0.2 slot is a fifth of a person) so the player can see and grab them.

### Wall shelves
- Tilted 45° (type B), 2 rows deep; the gap between levels is derived from the tilt. The top shelf sits at about customer head height.
- The air above a level (2 layers + 0.06) decides what yarn fits: fingering balls and skeins today. Bulkier yarn goes to a table or the floor. Each extra 0.055 of clearance adds one layer.
- Yarn reserves the layers its mesh actually needs by shape (a skein fewer than a ball on the same footprint).

### Piles and the floor
- A pile's headroom is 12 layers, the tallest super-bulky cone (0.66), so every item has somewhere to go; a shelf is limited by the glass above it. A boot check asserts the cone is exactly 12 layers.
- The shop floor is itself a row of type A piles: the room, not furniture. It can't be added, removed, moved or turned, and is masked last, so it is exactly the floor you can stand a box on. It is walked on, not around, and doesn't block sight.
- It is cut into tiles of 4×4 cells (0.8 units, about a real heap of yarn), because an NPC chooses where to walk per display: one room-sized grid sent everyone to the same spot. Edge tiles take the remainder; a footprint must fit inside one tile. A tile with no cell left or nowhere to stand beside it (the floor under a table) is dropped.
- Floor headroom is 4 cones (48 layers, 2.64 units): about wall height, enough for 5–6 big bulky balls. The floor is where yarn heaps.
- A customer stands 0.65 in front of a display; a floor pile has no front, so they take its first side clear of walls and everything else.
- Slots inside a wall, the counter, a chair, the doorway or an earlier display are masked out when the display is built, so a display can come out a funny shape (a 4×4 pile against the counter becomes a 3×2). Where two overlap the earlier keeps its cells.

### Stock
- By default the shop puts out 100 boxes; the GUI goes to 200 and CAPACITY is the hard ceiling. A crammed shop is both the look and the sorting game.
- Random stock is 55% yarn, 20% patterns, 25% notions (yarn leads because WIPs use most of it), dealt round-robin over places (the whole floor counts as one place) and stacked 1–3 high, so piles read as piles and burying means something.
- On a fresh shop each customer's wants are seeded first, against the same budget: one copy where it can be noticed (off the wall row, spread across places) and one buried under a lid, so the Assertiveness dig-out still happens. On later days seeding only runs with `S.seedWants`, a testing switch: planning stock is the game.
- A held item is out of the simulation: NPCs can't tidy around it, stack on its column or buy it.

### Moving displays (rule 10, as built)
- Every rotation snaps to 45°, chairs and props included, so a chair loses its authored angle the first time it is touched.
- A display may land only if every usable slot is clear of the walls, counter, chairs, doorway and other displays, and its standing spot is not inside a wall.
- Customers at, or walking to, a moved display follow it; a customer sitting in a moved chair rides with it.
- TODO: a peg board snapping to a wall at wall height is deferred with type C.
