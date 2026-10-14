> **Superseded in part, 2026-10-03.** The pacing and patience ideas below (deliberation window,
> hold-to-pause, the out-to-lunch card, patience by affinity, staggered arrivals) are consolidated
> into [PLAYING-AT-YOUR-PACE.md](PLAYING-AT-YOUR-PACE.md), which wins where the two disagree. This
> file stays as the brainstorm record. The rejected ideas at the bottom are still rejected.

  Prompt for AI: 

❯ I've been working on this game but I feel stuck. I want a brainstorm session to get unstuck for what would make the game more fun. I'm thinking longer term mechanics over rounds, lists of better rewards to       
  pretty up your shop, but also making the puzzle harder, right now the "arrangement" is just a matching game and the NPCs solve it themselves mostly, also a list of NPC interactions that would make them more fun  
  to play with and more rewarding to help.                                                                                                                                                                            

Round 1 of response: 

  Why the arrangement isn't a puzzle yet

  Three lines of code are doing it:

  1. wantFor(npc, item) is per-item and binary. Arrangement contributes literally nothing to whether an item satisfies a want. The only thing placement controls is noticeable() — is it buried. That's a one-bit
     puzzle: "don't bury stuff."
  2. The NPC un-buries it themselves. Assertiveness > 3 → rearrange to top. Orderliness 1 → spread. Orderliness 5 → tidy. You wrote three rules whose job is to defeat the one bit the player controls. That's your
     "NPCs solve it themselves" — it's not a feeling, it's interact().
  3. MVP: 100% of considered items will be purchased. There's no room for arrangement to matter, because the outcome is already 1.0.

  So the loop is: NPC wants X → NPC digs X out → NPC buys X. The player is decorative. Everything below is aimed at that.

  ---

  A. Making the puzzle actually hard

  A1. Invert the information asymmetry — NPCs shouldn't be able to recognise a match unaided.
  This is the big one. Right now wantsOf() is a perfect shopping list and MatchObservedInventory is an oracle. Give each NPC perception gaps keyed to traits, and make the arrangement patch them:

  - Low Intellect → can't judge whether a yarn's weight suits their pattern. Needs it placed adjacent to a run of same-weight yarn (a comparison) or next to the pattern itself.
  - Low Openness → can't imagine a colour combination. Needs colours pre-grouped into a ramp before they'll buy more than one ball.
  - High Withdrawal → won't dig, won't take the last item off a stack, only shops the front edge. You must keep depth.
  - Low Assertiveness → won't restructure at all.

  Now traits are the puzzle spec, and "sort your skeins by how pretty they are" becomes load-bearing instead of a figure of speech. This is the single change that makes the player's verb necessary rather than
  optional.

  A2. Requirements that can't be satisfied one item at a time.
  minColors is already specced and flagged unenforced in wip.js. It's the cheapest real puzzle you own: a 3-colour pattern means three balls that go together, and "go together" should be a property of adjacency +
  attribute distance. Matching → composition, in one function.

  Same with unitsShort: a 20-unit sweater needs multiple matching balls. If your stock is singletons, nothing finishes. So keeping a deep, matched run together becomes a constraint the player can fail.

  A3. Score the formation, don't gate it.
  Purchase = base × formation × affinity × dwell × luck, with base low (~0.15). Your DESIGN-DECISIONS already says this; the code says 1.0. Dropping the baseline is what creates the space arrangement fills.

  A4. Make digging cost the player.
  Don't remove restructure — make it destructive and rare. An NPC who digs gets what they want AND wrecks the formation for the next three customers. Their self-service becomes your difficulty curve instead of your
  bypass. Tiny diff, big change in feel.

  A5. Shelf face as the scarce resource.
  fullyExposed/noticeable already exist. Give display types different virtues — a shelf reads attributes (numbers, weight), a pile reads colour mass and volume, a peg board reads silhouette. Then an item's best
  home depends on which attribute you need legible to which customer, and you're doing constrained bin-packing.

  A6. Hands are finite.
  Cap items carried per visit. A sweater now takes multiple visits, which makes reserving stock a mechanic: a "hold shelf" for Marguerite. New placement verb, zero new systems.

  A7. Layout as the second-order puzzle.
  A third of NPCs never reach a display. That's not a bug to fix, it's a mechanic to expose: make walk-to-display depend on sightlines and route, so moving furniture (M mode, already built) measurably converts more
  shoppers. Two puzzles that interact: what you stock vs. where you stand it.

  ---

  B. Long-term mechanics across days

  B1. The bulletin board takes requests. Highest-value item on this whole list. NPCs pin: "aran wool, sweater, back on day 12." Suddenly days connect, deliveries matter ("do I have this?"), and the player plans
  instead of reacts. The object is already designed; only the data is missing.

  B2. Affinity tiers that unlock behaviours, not stats.
  stranger → regular (predictable return, shows on a calendar) → friend (brings a friend, seeded with correlated taste = a knitting group arrives) → fixture (sits in your shop permanently, tidies a display for you,
  teaches a beginner). An NPC who works for you is the best cozy reward there is.

  B3. Shop reputation as the no-money currency.
  Keep a histogram of what actually left the shop. Sell mostly sock weight → you become known for it → the delivery generator and NPC generator drift toward sock knitters. The shop develops a personality from play.
  Cheap to build, and it's the progression system a no-money game is missing.

  B4. The week has texture. Delivery day, Beginner Night, Stitch'n'Bitch Friday (NPCs cluster, WIP progress ×2). All of these are modifiers on rolls you already make. "Stuck" often just means every day feels the
  same — this is the cheapest fix for that.

  B5. The FROG PILE, finally. A WIP abandoned too long gets frogged, and the yarn comes back to your shop as recycled yarn carrying its story ("this was going to be a sweater"). Supply source + emotional beat + a
  failure state that isn't punishing.

  B6. Lent finished objects become furniture. Already half-specced (lending exists, docs say gifted FOs can satisfy formations). Let the player hang them — a shawl over a chair, hats on a rack. Your shop gets
  literally prettier as a function of NPCs succeeding. That's the reward loop you're asking for and it's mostly built.

  B7. Mastery tracks. Skill caps at 5; make hitting 5 turn an NPC into a Teacher. A visible per-regular track — "Marguerite is one sweater from mastering" — gives every returning customer a reason to matter.

  ---

  C. Rewards that pretty up the shop

  Rule: every reward should be a placeable object that touches the grid or the formation system, so nothing is a dead trophy.

  Decor that also does something
  - Rug → a "cozy zone" where NPCs dwell longer / work faster
  - Woodstove or fireplace → warm zone, same
  - Teapot / coffee cart → NPCs stop for a cup, +1 round
  - A cat. Sits on displays, buries items, beloved. A reward and an antagonist
  - Armchair vs. stool → better seating, longer WIP sessions 
  - Record player → mood modifier for the day
  - Pattern library bookcase → unlocks "browse patterns" as its own action
  - Swatch wall → pin a swatch of a yarn and its attributes become legible to low-Intellect NPCs. Decor that directly solves A1
  - Ball winder + swift station → NPCs convert hank→cake in your shop. A service, not a sale
  - Mannequin/bust displaying a lent FO
  - Plants, window box, hanging ferns, bunting, hand-lettered chalkboard sign
  
  Pure cosmetic (the good kind)
  - New yarn is the best reward in a yarn game: rare fibres (qiviut, silk), indie hand-dyed skeins with a named dyer NPC, new colourways, new ball bands
  - Themes: cottage, midcentury, vampire (your own pitch promises it)
  - Seasonal decor rotating with the calendar
  - Framed guestbook photos, Customer of the Week board, trophy shelf of firsts
  - Floor/wall/wood-tone swaps, fairy lights, pendant lamps
  - Time-of-day light — your git log already wants "sunset and sunrise over the yarn store." That's the cheapest beauty win available and it makes days feel like days
  
  Systems as rewards
  - The hold shelf (A6), more chairs, more slots, a back room, a second floor
  
  ▎ One design note: unlock these on stories, not counters. "The day someone finished a sweater" unlocks the mannequin. Milestone-by-narrative reads as a gift; milestone-by-number reads as a grind.

  ---

  D. NPC interactions

  Today "chat" is two NPCs standing near each other waiting. Everything here is headroom.

  D1. Chat with a consequence. Two NPCs together should exchange something:
  - Swap a want — one mentions a yarn they saw, the listener now notices that display
  - Compliment a FO → dwell bonus for the wearer
  - Lend each other a hook → removes a want, costs you a sale. Charming and annoying, which is exactly right
  - Trait outcomes: Assertive + impolite criticises someone's project; a Volatility-5 target leaves in a huff; high Compassion helps a beginner and raises their skill
  
  D2. Relationships between NPCs. A knitting group of three who always arrive together. A mother and daughter. Rivals. An ex. If two who don't get along are in the shop at once, someone leaves early — so you're
  scheduling the shop socially. Entire new puzzle layer, built from traits you already roll.
  
  D3. NPCs asking you for help. The most rewarding thing in a cozy game is a request you can succeed at:
  - "Do you have anything that goes with this?" — they hold up a ball, you place a match nearby, they buy both
  - "Is this enough for a hat?" — a yardage question answered by grouping
  - "I'm stuck on this pattern" — seat them next to a higher-skill NPC
    Each is a micro-puzzle with a clean success moment. This is the direct antidote to "NPCs solve it themselves."
    
  D4. Reactions the player can read. Right now the only read is what they walk out holding. Cheap, huge:
  - Hesitation — pick up, turn over, put back. "So close." The single most informative animation you could add
  - Thought bubble with the want, fuzzy or partial for harder NPCs
  - Ear and tail language per species — a llama pinning its ears is a whole sentence
  - Hearts trailing over a display they love, a sigh at a messy pile
  
  D5. The Beginner. One NPC archetype, skill 1, who cannot succeed unaided. Teaching them over multiple visits is a complete emotional arc for almost no systems work.
  
  D6. Extend the generator model to in-shop one-liners. You already want trait-driven guestbook prose. Same templates, same vocabulary tables, spoken in the shop. Every NPC feels authored without authoring any of
  them.
  
  D7. Reciprocity. A friend brings you something on their nth visit — coffee, a plant, a rare skein. Reward delivery through a character rather than a menu.
  
  D8. Events. Beginner Night, Stitch'n'Bitch, a visiting dyer's trunk show, a charity knit-along where the cast collectively makes N hats, a destash swap where NPCs trade with each other. Each is a day modifier
  plus a seating arrangement — reuses everything you have.
  
  ---
  
  If you only do three things
  
  1. Kill the 100% purchase rule. base 0.15 × formation × affinity × dwell. Nothing else on this list can be felt until the outcome stops being predetermined.
  2. Enforce minColors with adjacency. Your smallest possible real formation, already specced, already TODO'd in wip.js. Turns matching into composition.
  3. Make restructure destructive. Digging works but wrecks the display. Converts "the NPCs solve it themselves" from your complaint into your difficulty curve.
  
  Then B1, the request board — it's the one system that makes day N+1 depend on day N.






















---------------
 Before we do any of this I want to talk more about the puzzle spec and the relationships with helping NPCs. right now I do want to make the puzzle harder.... but it feels like the NPCs 
  leave the shop too quickly for me as a player to react to them. On the flip side, pre-arranging inventory and then letting all the npcs in means the player can't react to them until the next day. What are my     
  options here?                                                                                                                                                                                                       
  
⏺ Good — this is the right thing to be stuck on, because it's not a tuning problem. Let me put a number on it first.

  The window is off by about 3x

  From your own code: rounds are 3s, and consider→buy is a two-round beat. So the window to influence a purchase is ~6 seconds.

  What the player has to do inside it: notice which NPC matters → read their want → find a matching item somewhere in the shop → pick it up → orbit the camera → drop it on a display they'll reach. That's 15–20
  seconds for someone who knows the game, and much longer for someone who doesn't.

  So you can't fix this by nudging the clock. Even 10s rounds doesn't close it. There are exactly two levers — widen the window or make the action cheaper — and you need both.

  And note the older data point: at 30s rounds "the cast walked for ~1.5s and stood frozen for 28." Pure slowdown buys reaction time by paying in dead air. So widening has to be targeted, not global.

  ---

  The fork you're actually standing on

  Three shapes, and they're genuinely different games:

  A. Prep-and-watch (auto-battler). You arrange, you open the doors, the day plays out, you read the results. Loop Hero, Dorfromantik. Reaction lives between days. This is what you have now by accident. It's
  completely viable and very cozy-compatible — but it lives or dies on legibility: if you can't read why a customer failed, the prep phase has no feedback and the game is noise. Right now the only read is "what
  they walked out holding."

  B. Live shop. Few customers, staggered, long deliberations, direct verbs. Reaction lives within the visit. More interactive, but 10 concurrent NPCs at diorama scale will never be legible enough for this — you'd
  be capping at 2–3.

  C. Turn-based. Manual advance (which is already your default). Infinite thinking time, chess-like. Maximum control, but it kills the ambient "watch the shop live" fantasy that's most of the appeal, and 10 NPCs ×
  30 rounds is a lot of clicking.

  My read: B on the shop floor, A across the day. Live and reactive for the one or two customers in front of you; prep-and-watch for everything else. That's how a real shop feels, and it means you don't have to
  make every NPC interactive — just the ones you're paying attention to.

  ---

  Lever 1: widen the window (but only where it matters)

  Stagger arrivals so there are only ever 1–3 shoppers. You already have the single-occupancy door lock. Don't open the floodgates — trickle. The shop breathes: customer, quiet gap you use to rearrange, customer.
  This is the cheapest fix on the list and it kills the "pre-arrange then watch a mob" problem outright.

  Make consideration a visible, trait-length dwell. This is the one I'd build. An NPC picks up a ball and stands there deliberating — visibly, thought bubble, turning it over. The length is a trait: low Volatility
  deliberates for six rounds, Volatility 5 decides instantly. Now your pacing knob is character. A dithering customer is one you can save; a snappy one you had to have pre-arranged for. Same mechanic, two different
  puzzles, and the player learns to tell them apart by looking.

  Take deliberation off the round clock. While an NPC is considering, don't count rounds against MAX_ROUNDS. The world keeps moving; that customer's timer doesn't. Generous window, no frozen shop.

  Let the player buy dwell time. Tea, a good armchair, a woodstove, chatting at the counter — actions and decor that extend MAX_ROUNDS. Dwell becomes a resource you manage, which is a puzzle in its own right, and
  it makes the reward furniture from the other list mechanically real instead of decorative.

  Cut concurrency, lengthen visits. Your own soak table shows 2–4 NPCs is a workable band. 10 at once probably isn't legible at this camera regardless of what else you do.

  ---

  Lever 2: make the player's action cheaper

  Highlight matching stock while an NPC is considering. Collapses "find a matching item somewhere in the shop" to zero. This doesn't leak the puzzle — it shows what you can see about the customer in front of you,
  not what the NPC can see. Biggest single time saving available.

  A verb aimed at the customer, not the display. "Hand this to them" / "show them this" — click item, click NPC. Two clicks instead of pick-navigate-orbit-drop. That fits inside a 6-second window today, before you
  widen anything.

  A counter, physically. A small display next to where customers pass, reachable without orbiting. The place you put the thing you just thought of.

  You already have a real-time verb and may not have noticed. A held item leaves the simulation — available() excludes it. So the player can already deny a live NPC by picking something up mid-visit. You built an
  interactive mechanic by accident. You just can't currently offer fast enough to match it.

  ---

  The idea that joins this to relationships

  Make patience an affinity stat.

  - A stranger shops fast and cannot be helped. Correct — you don't know them yet. They leave, and the guestbook tells you what they wanted.
  - A regular deliberates longer. They'll give you a moment.
  - A friend who can't find something comes to the counter and asks, and waits indefinitely until you answer or they get bored. They want your help.

  This does three things at once: it fixes the pacing problem without touching the clock; it makes relationships mechanically load-bearing instead of a nice feeling; and it gives the game a difficulty curve that
  runs the right way — the early shop is hard because everyone's a stranger you can't reach, and the late shop is more interactive because you've earned the right to be asked.

  It also resolves your either/or. Prep-and-watch is what strangers get. Live intervention is what friendship unlocks. You don't have to pick.

  ---

  What I'd do, in order

  1. Stagger arrivals. Cheapest, biggest immediate change to how the day feels.
  2. Deliberation as a visible, trait-length, off-clock dwell. This is the actual fix — it's where all the interactivity should be concentrated.
  3. Highlight matching stock during deliberation + a hand-it-to-them verb. Closes the remaining gap in action cost.
  4. Patience scales with affinity. Ties it to the relationship system and gives the whole thing a curve.

  Then the request board handles everything you couldn't react to in time — which should stay most of it. The within-visit save should feel like a catch, not the default.

  ---

  One thing I need from you before going further on the puzzle spec: when a customer leaves without what they needed, how much should the player know about why? Everything ("Marguerite needed 4mm and you only had
  3.5") makes the game solvable but kills inference. Nothing keeps the mystery but makes the prep phase unfalsifiable. Your DESIGN-DECISIONS already flags this as open under the Guestbook hints question, and it's
  the load-bearing decision for how hard the puzzle can be — the harder you make the arrangement, the more feedback the player needs to have a fair shot at it.














❯ Is there a way to allow B or C, but not kill animation on "C" ? Give a pause a set of visual animations that keep the cozy feel while the player tries to solve a puzzle>                                           

⏺ Yes — and the good news is your architecture already did the hard part.

  You already decoupled sim time from render time

  advanceRound(world) is pure and discrete; the renderer walks the route polyline at constant speed and interpolates. The sim resolves a round as a teleport and the scene catches up. That means stopping the round 
  clock does not stop the scene — it never was the same clock. Everything below is a presentation change plus one condition on a timer.
  
  Your 30s test didn't fail on pacing. It failed on statues.

  From the POC notes: at 30s rounds "the cast walked for ~1.5s and stood frozen for 28." But also: "No walk cycle. Movement follows the round's route holding the static walk pose — the feet do not move."

  So what you measured was 28 seconds of a character frozen mid-stride in a walking pose. Of course that read as dead. That is not evidence that long rounds are boring; it's evidence that you have no idle state.
  The pacing problem and the animation problem are the same problem, and fixing the second one unlocks every option in the first.
  
  ---

  The pause verb should be your hands

  Don't add a pause button. Holding an item stops the round clock.

  Pick something up → the shop holds its breath. Place it → time resumes. No mode, no UI, no modal state, no barking at the player. It's completely diegetic and it delivers time exactly when the player needs it,
  because needing time and having your hand out are the same moment.
  
  You already have the state for it — drag.index >= 0 — and it makes your existing quirk coherent: a held item already leaves the simulation (available() excludes it), so "while you're holding something, the shop
  waits" is just that rule told honestly.
  
  Layer on top of it:
  - Deliberation dilates the clock rather than stopping it — a considering NPC stretches the round from 3s to ~12s. Automatic window, nothing freezes.
  - Spacebar for an explicit hold, always available, shop still breathing. 
  - The clock on the wall stops. That's your entire "time is paused" UI. Diegetic, cozy, one object.
  
  With this, B and C stop being different games. The clock runs continuously; the pauses are a consequence of the player's own hands.
  
  ---

  The animation set that makes a pause feel cozy

  Per-NPC idles — loopable forever, safe to hold on
  - breathing, weight shift
  - blink, ear flick, tail sway (this is your species signal — free character, and it's above the neck so it authors once per species and nowhere else)
  - head turns: toward the nearest NPC, toward the door, toward a display
  - browsing: lean in, hand hovering over the shelf
  - deliberating: turn the ball over, look at it, look back at the shelf, look at it again. This is the pause animation. Someone visibly thinking can hold indefinitely without ever looking broken
  - seated knitting: the needle loop. This is the money shot of the entire game
  - chatting: gesture, nod, laugh
  - waiting: shifting foot to foot
  
  Trait-flavoured idles — enormous character for almost nothing
  - high Volatility: foot tapping, impatient
  - high Withdrawal: arms in, small, glancing at the door
  - high Enthusiasm: bouncy, can't stand still
  - high Orderliness: absently straightens a nearby item (doesn't count as a restructure — it's a tic, not a move)
  - high Compassion: watches whoever else is in the room 
  
  World ambience, entirely independent of the sim
  - the sunbeam sweeping with time of day — you already want this
  - dust motes in it
  - steam off the teapot, flicker in the woodstove
  - the cat: tail, ear, blink, occasional stretch
  - plants swaying, a wind chime, a curtain
  - yarn fringe and tails swaying; a ball someone nudged rocking to a stop
  - the door bell still swinging after somebody came in







❯ Maybe an "out to lunch" card appears on the counter?                                                                                                                                                                

⏺ Yes — and it's better than the stopped clock, because it explains why the shop is waiting for you.

  But watch the fiction for a second: "out to lunch" says the shopkeeper is absent, and the moment you're pausing is the moment you're most present — hand out, mid-placement. So don't hang the card on the
  micro-pause. Hang it on the thing it actually describes.

  Two pauses, two meanings

  Hands full = a beat. Holding an item stops the clock. Free, unlimited, no card, no announcement. Maybe the wall clock's pendulum stops and that's all. Charging for this would be hostile — you're placing a thing,
  the game shouldn't tut at you for taking four seconds.

  Card on the counter = a break. A deliberate act: you flip it because you want to rearrange half a shelf, or think, or go make actual tea. This one is worth having character.

  Keep them separate or the card flickers on every single pick-up — which is your most common action in the game — and becomes noise inside a minute.

  The card is a request for patience, and patience is your affinity stat

  This is where it gets good. An "out to lunch" sign isn't a pause button, it's you asking the room to wait. Which is exactly the mechanic from earlier:

  - Strangers don't wait. They drift off.
  - Regulars wait a while.
  - Friends wait as long as it takes, because they know you.

  So the cost of a break is measured in the only currency the game has: you lose the people who don't know you yet, and never the people who do. Taking a long break in week one is expensive; taking one in month
  three costs you nothing, because the shop is full of people who'll happily sit and knit until you're back. The game visibly relaxes around you as you earn it. That's a much nicer difficulty curve than a timer.

  Make the cost the queue, not a meter

  You already built the single-occupancy door with a queue forming outside. Use it. Flip the card, take five minutes, flip it back — and there are six customers at the door. No penalty number, no abstract patience
  bar, just a line of people you can see. Strangers in that line wander off while you're away; regulars are still there.

  That's fully diegetic, it's already half-implemented, and it reads instantly from the diorama camera.

  The card itself

  Cheapest possible version is a plane with a texture and one boolean. Everything past that is flavour, and the flavour is free:

  - "BACK AFTER THIS ROW" — this is the one. Every knitter has said it, it's a lie every time, and it's exactly what your NPCs would say too
  - "GONE TO WIND A CAKE"
  - "TEA BREAK"
  - "OUT TO LUNCH", plain and honest

  And it's a perfect reward category: hand-lettered cards as gifts from NPCs. A friend letters one for you on their tenth visit. A collectible you swap by season or by theme, that costs you nothing to author beyond
  a texture, and that turns your pause button into a small archive of people who like you.

  One small charm if you want it: an NPC who walks up to the counter while the card is out reads it, and waits — or, if they're the impatient sort, sighs at it. One gaze target and an idle you already need.



There's already a hole in your code shaped exactly like this. From wip.js:

  ▎ "TODO: nothing refills a freed slot. An NPC who finishes a project mid-visit has capacity for a new one and no way to start it, which is the natural home for a 'cast on something new' action."

  That's the mechanic. Suggesting is casting on — with you choosing the pattern instead of the RNG.

  What you're actually being handed

  wantsFor(wip) derives the entire shopping list from the pattern. Material, weight, unit count, tool size — all of it falls out of which pattern is in the slot. So when you put a pattern in someone's head, you 
  author their demand.

  That is a much bigger deal than it sounds, because it's the answer to your pacing problem from the other end. You can't react to a stranger in six seconds — but you can have decided three days ago what Marguerite
  would be shopping for today, and stocked for it. Suggestion turns the arrangement puzzle from reactive to planned. It's the first mechanic where the player gets to set up a shot instead of catching one.

  And it stays honest, because the two halves don't collapse into each other: suggestion sets the target, arrangement still has to hit it. A suggested sweater is 20 matching units they still have to find, on
  displays you still have to compose. You've made the puzzle specific, not easy.

  The ladder

  Gate it on how well you know them, and let each rung give more control over their demand:

  ┌───────────┬────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │   Tier    │                                                                    What you may suggest                                                                    │
  ├───────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Stranger  │ Nothing. You don't know them. Stock and hope.                                                                                                              │
  ├───────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Regular   │ A pattern type — "you should make a hat." They choose which hat, in their own taste.                                                                       │
  ├───────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Friend    │ A specific pattern — you hand them the actual book. Now you own the whole shopping list.                                                                   │
  ├───────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Fixture   │ A pattern and a yarn. The pairing act — "make this, in this." This is the thing a real yarn store owner does, and it should feel like the top of the game. │
  ├───────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ (endgame) │ Suggest they make it for another NPC. A gift. Now you're brokering the room.                                                                               │
  └───────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

  That last rung is worth building toward: it produces finished objects that move between characters, which means a wearable turning up on someone who didn't make it — visible evidence that you know everybody.

  Why it's a relationship mechanic and not just a verb

  Because suggesting well requires everything the game has been quietly teaching you to observe. Their craft, their skill, their materials, their weights, their taste — all hidden, all inferrable, none of it
  stated. A suggestion is you saying "I think I know you," and the game telling you whether you were right.

  - Wrong craft → politely baffled. "Oh, I don't crochet." Costs a little warmth.
  - Above their skill → they decline, or they accept and it stalls and eventually frogs.
  - Dead in their taste → delight, big affinity gain, they cast on there and then.

  Which resolves the open question in your DESIGN-DECISIONS about Guestbook hints, for free. The book records only what happened — bought, made, happy, disappointed. It's a memory aid, never a solution. Suggestion 
  is what the memory aid is for. You consult the book before you suggest. That makes the guestbook a tool instead of a trophy case, and it's why the honest-observation reading was the right one.

  Cost, rejection, and where it happens

  - One suggestion per NPC per visit. Natural, polite, and it stops suggestion-spam being a trait-scanner.
  - A careless miss costs warmth; a near miss costs nothing. Wrong craft is careless. Right craft, slightly over their skill, is thoughtful-but-wrong — and should be free. That's the right moral shape for this
    game.
  - Rejection still teaches. "I don't crochet" is a tell you now own. A failed suggestion is never a wasted turn.
  - It happens at the counter. They come to you. Which consolidates nicely — guestbook, out-to-lunch card, and suggestions all live on one object and none of them is a menu.
  - You should have to be able to supply it. They'll only take a suggestion they can see the makings of. Don't suggest a sweater if there aren't twenty units in the room.

  Two things already in your numbers that this makes sing

  maxWips = Enthusiasm + Openness + Volatility. Slots are a real constraint — a high-Volatility NPC with twelve half-finished things has no room for your idea until they finish some, and an NPC whose three traits
  total 3 does one thing at a time, so being in their only slot means something. That's genuine character falling straight out of numbers you already roll. (Prerequisite: the POC notes maxWips is "computed and
  displayed but not enforced." Enforce it and this comes free.)

  The frog pile. A suggestion that was too ambitious stalls, then frogs, and the yarn returns to your shop carrying its story — this was going to be a sweater. Failure that is sad, legible, non-punishing, and feeds
  your supply. It's the perfect consequence for a mechanic whose whole risk is overestimating somebody.

  Smallest version that proves it

  1. Enforce maxWips, and add castOn(npc, pattern) — the freed-slot TODO, taking a pattern argument.
  2. One verb: hand a pattern to an NPC. Click pattern, click NPC. Accept if pattern.craft is in prefs.crafts and pattern.yarnUnits is within reach of their skill; otherwise decline with the reason spoken aloud.
  3. Gate it on one number — visits signed in the guestbook. Three visits unlocks suggesting.

  That's a function, a click handler, and a counter. If handing someone a pattern and watching them come back a week later wearing it doesn't feel good at that fidelity, no amount of tiering will save it — and if
  it does, the ladder above is all content.
















---- FROM HERE ON DOWN: REJECTED IDEAS FROM BRAINSTORMING- DO NOT IMPLEMENT OR RE-SUGGEST -----

 One free hint mechanic 
  While you're holding something, an NPC who wants it looks at it. That's your entire tells system, diegetic, costing one gaze target. The player learns to hold a ball up and see who turns their head.
  
  ---
