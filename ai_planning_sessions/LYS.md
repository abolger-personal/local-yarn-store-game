# LYS (Local Yarn Store)

> **Status:** original concept, updated 2026-09-05 with decisions from the first planning session.
> Sections marked **[DECIDED]** were open questions in the first draft.
> See [DESIGN-DECISIONS.md](DESIGN-DECISIONS.md) for the full technical record and
> [P1-SPIKE-PLAN.md](P1-SPIKE-PLAN.md) for the first phase of work.
> This file remains the source of truth for *intent*; the other two cover *execution*.

1. Elevator pitch for players (draft): 
That dream you always had of turning your stash into a local yarn store? 
Here it is, right in your browser, in glorious 3d rendered color and texture. 
Pull in your real stash and patterns from Ravelry, or make your own dream shop. Sort your yarns on shelves by how pretty the skeins are! Sell only vampire-themed notions! Make your NPCs (Non Player Crafters) happy and they'll come back wearing their finished work, or even gift it to you!


2. Background concept for AI to remind me about when decisions about directions or design come up: 

This game is inspired by my friend Levente's https://szabadkai.github.io/puzzle-city/ game, in the sense that I want a small, peaceful 3D sandbox game, statically hosted and storing user data in the browser, with a cozy vibe,  procedurally generated NPCs and events, lots of small detail stories to watch and be inspired by, but no actual end goal other than hanging out in the yarn shop. This game uses 3JS but I'm fine with exploring other browser-based alternatives. The BIG guidance here is that this is *not* the kind of game it is tempting to classify it as on the surface: it is NOT a "shop" game where you optimize for what customers want and buy and try to make money. This game shall *not* have any accounting function or have any mechanics whatsoever related to *money*.

**[DECIDED]** Sticking with three.js, wrapped in React Three Fiber + drei for the helper ecosystem. Babylon.js and vanilla three.js were both considered and rejected. Ceiling set at **1000 items placed at once**, with **~10 NPCs in the shop at a time** but a remembered roster of **a few hundred** — dormant NPCs are just records with a scheduled return date, so they cost nothing. Camera is an **orbiting diorama** — first-person was considered and rejected for MVP, because you cannot read a spatial arrangement from eye level and the arrangement is the whole point.

NPCs are **anthropomorphic animals on a shared body**, so species reads instantly at diorama scale and a koala is memorable as a repeat customer. Species differs only above the neck and behind — head, ears, muzzle, tail — which means knitted garments are authored once and fit everybody.

The no-money rule is treated as architectural, not aspirational: there is no currency type anywhere in the codebase, and a "purchase" is just a state transition that removes an item from a shelf. 

The main sandbox is a yarn shop (with an architecture that makes adding a coffee shop option later easy, but lets stick to yarn for now). Like Levente's town building tides game, the game-play mechanic for what the user can do in the sandbox should boil down to *creatively rearranging many,many,many kinds of yarn, notions, and patterns into displays*.  Different arrangements of these things, once discovered, should trigger events that are delightful, make the player feel like they are part of a community.  

The mechanic used in other games that this is similar too is a cooking or crafting game mechanic, where gathering a set of items forms a path or tree to other items but what's important here is that the player *cannot* do the crafting: they have to get the NPCs to do it for them *only by arranging their store*. factors will include: 
- inventory (yarn, pattern, notion, etc) physical arrangement
- some random luck
- an NPC's affinity or existing inventory to complete the set of items. 
- an NPC's "WIP" (work in progress) inventory. 
- how long an NPC stays in the store (more friends and more other inventory and 

The player will also only know if it worked if the NPC then *comes back* some days later with a crafted item. 

3. Use Ravelry and it's API for asset generation
Information to use to seed the game for procedural assets can be easily obtained from one of the largest social media and fiber arts databases in the world: the Ravelry.com API. 

The actual *recipes* for a finished object is actually obtainable from Ravelry if we build out a database of patterns (which list supplies and notions). However, the recipe for a finished object will also include the pattern itself (as the NPC needs it to craft the object)

TODO: The point isn't a realistic game so there's some design consideration that needs to happen about what, if anything, to pull image data for.

**[DECIDED]** No image data at all for MVP. Every item is procedural geometry — yarn forms are lathes and swept tubes, so a skein, cake, ball, hank and cone all generate from a handful of builders. This means most of the 1000 items need no artist, and it sidesteps the hotlinking question entirely. Ravelry supplies *attributes* (weight, fibre, colour family, yardage), not pictures. 

TODO: we'll need to store local copies of much of the attribute data since hitting the Ravelry API live from a statically hosted game for it's entire database isn't going to work.

**[DECIDED]** Correct, and there is a second reason: the API key cannot be embedded in a statically-hosted client without leaking it. So the harvest is an **offline Node script** that bakes a curated subset to JSON at build time, with the key in `.env` and never in the bundle. MVP ships a synthetic catalog shaped to the real Ravelry schema, so the real harvest drops in later without touching gameplay code. Ravelry's terms on bulk caching need checking *before* that script gets written.  

4. Use Ravelry and it's API for initial user setup
I'm considering a feature that allows a user to log in to Ravelry and then asks that user for detailed stash information, letting them populate their store with their own stash to start with. This is not an MVP feature. 

5. Ideas for delightful events: 

- NPCs congregating around yarn arrangements
- NPCs turning into repeat customers, who will come back and bring more NPCs with them
- NPCs buying certain amounts of the yarn/notions/pattern and thus physically removing it from the puzzle configuration that caused the event and giving the player the chance to set it up again. 
- *Over time*,  NPCs contributing swatches, finished objects, or other items to your store to admire, which can in turn trigger other events. (note that this is a somewhat complex mechanic but I really want NPCs to produce Finished objects with the yarn they actually bought from the store)
- NPCs deciding to use your store for "Beginner nights", "Stitch N Bitch" or other special events, which come with special custom animations   

5b. Where inventory comes from, and where it goes **[DECIDED — this was a gap in the first draft]**

NPCs buying things permanently removes them. With no inflow the shop just drains and the sandbox quietly dies, so supply is a required system rather than a detail.

**The floor is the universal inbox.** Deliveries, NPC donations and gifted finished objects all land in a pile on the floor. One container, one renderer, one interaction. The floor is deliberately *not* a slotted display, so formations can never accidentally fire there.

- **You start** with an unsorted pile of ~24-30 items and empty shelves. This teaches the place verb with no tutorial overlay and sells the fantasy directly. The pile looks random but is secretly guaranteed to contain one solvable formation — the pile teaches *placement*, the loaded deck teaches *formations*.
- **Each morning** a delivery pile appears by the door. Days 1-10 follow an authored script (revised: the tutorial is days 1-3, and from night 3 the player orders, with the script filling only blank lines) (which doubles as difficulty pacing — notions are withheld early so yarn-only formations get mastered first), then a procedural tail takes over. The script specifies *templates* like "6 items, single colour family, introduce one new weight" rather than specific items, so deliveries stay relevant to what is actually happening in the shop.
- **NPCs occasionally donate** destash and leftovers. Rare enough to feel special.
- **At the end of each day**, things nobody wanted quietly leave — sorted by "last organised by the player, first out". This protects arrangements you have put work into precisely *because* you touched them, and it stops unsorted floor piles accumulating forever. Formations in progress, that day's delivery, and gifted finished objects are all exempt. A morning summary says what went, so nothing ever silently vanishes.

Later, that end-of-day clear-out can be re-skinned as an eBay order, a Hoarder NPC or a moth infestation without changing the underlying logic — the selection is the same, only the storytelling differs.

The same idea applies to the NPCs themselves. **The shop permanently remembers any crafter you solved a formation for** — they sign the Guestbook. Everyone else drifts away over time, the way people do. This keeps the roster bounded by your own successes rather than by an arbitrary limit, and it means being remembered is something the player earned rather than something the game hands out.

5c. The Guestbook and the bulletin board **[DECIDED]**

Both are **real objects in the shop**, not menu screens. Keeping them in the world rather than behind a button is the whole point — you should never have to leave the shop to enjoy the shop.

- **The Guestbook** sits on the counter. When a crafter comes back with something they made from your yarn, they walk over and *sign it*. The entry records who they are, what they made and what it was made from, plus anything you have managed to observe about them over time. Entries can carry hints, so the game can nudge without ever opening a tutorial box.
- **The bulletin board** hangs on the wall and shows the most recent signatures as **"Customer of the Week"**, with little rendered pictures of their finished objects pinned up beside them.

The signing is the emotional payoff of the whole loop: it is the moment the game tells you that the arrangement you built actually mattered to somebody.

6. What can be placed into the store by the player for arranging (note- this procedural evolution concept should be fleshed out with the help of AI and a little bit of research about the fiber arts and multiple hand manufacturing processes availabled)

- Notions and tools used in fiber arts (list below in 6a), make them pretty and easy to see what they are. Important note: Visually in the game, DO NOT care about realistic size- most of these are so small they'd be invisible at a realistic size.  
- Fiber and roving (data about attributes mined from Ravelry) 
--  NPCs can buy and turn this into: 
----- yarn or thread if they also own *spinning* notions)
----- felted (example evolution)

- yarn and thread in many shapes, sizes, and colors with tons of other attributes mined from the Ravelry API
- patterns, as physical booklets and leaflets — an NPC needs the pattern itself as part of a recipe, not just the materials
- finished objects gifted back by NPCs, which can themselves take part in formations

6a. Notions and tools list **[DECIDED FOR MVP]**

All rendered oversized and readable at a glance. Silhouette matters more than accuracy — these need to be identifiable from across the room.

- **Knitting** — straight needles, circulars, double-pointed sets, interchangeable tips, cable needles, needle gauge, stitch holders
- **Crochet** — hooks in aluminium, wood and ergonomic grips, Tunisian hooks
- **Spinning** — drop spindles, support spindles, hand carders, drum carder, combs, diz, niddy noddy, lazy kate, bobbins
- **Weaving** — rigid heddle loom, tapestry loom, shuttles, warping board, weaving needles
- **Felting** — felting needles, felting mat, foam block
- **Dyeing** — dye pots, dye jars, squeeze bottles, gloves, mordants
- **Finishing and general** — scissors and snips, tape measure, T-pins, blocking mats, blocking wires, darning and tapestry needles, pom-pom makers, yarn bowls, project bags, swift, ball winder, row counters, stitch markers, gauge ruler

6b. Craft evolution chains **[DECIDED FOR MVP]**

The recipe tree the NPCs work through. Each arrow needs both the materials *and* the right tool in the NPC's hidden inventory.

- raw fleece → *(combs, hand carders, drum carder)* → roving or top
- roving → *(drop spindle or wheel)* → singles → *(plying, lazy kate)* → handspun yarn
- roving → *(felting needles, mat)* → needle-felted object
- roving → *(soap, water, agitation)* → wet-felted object
- undyed yarn → *(dye, pot)* → hand-dyed yarn
- yarn + pattern → *(knitting needles)* → knitted finished object
- yarn + pattern → *(crochet hook)* → crocheted finished object
- yarn + pattern → *(loom, shuttle)* → woven finished object
- finished object → *(blocking mats, wires, T-pins)* → blocked finished object
- yarn scraps → *(pom-pom maker)* → pom-poms and tassels

**MVP ships only the yarn + pattern + needles/hook chain.** Spinning, felting, dyeing and weaving are the obvious expansion, and the recipe format is designed so adding them is content work rather than engineering.

7. What the first playable actually contains **[DECIDED]**

Small enough to find out whether the core loop is fun before building breadth on top of it.

**In:** one room, four displays, ~60 items across four categories, ~6-8 formation rules, NPCs that arrive, browse, buy and leave, hidden NPC inventories the player can only infer, and one complete craft loop where an NPC buys yarn and returns days later with the finished object. Plus the supply system in 5b, the Guestbook and bulletin board in 5c, save/load, and a single visual theme.

**Out for now:** Ravelry login and stash import, multiple rooms, the coffee shop variant, Beginner Nights and Stitch'n'Bitch, the spinning/felting/dyeing chains, NPC friend groups, audio, mobile touch, first-person mode, and additional themes. Theme *plumbing* ships in MVP even though only one theme does, so adding more later is content rather than a rewrite.

The riskiest and most open-ended part is not the engineering \u2014 it is authoring enough formation rules and NPC personalities to keep discovery feeling alive. That work is effectively unbounded and should be budgeted as ongoing.


