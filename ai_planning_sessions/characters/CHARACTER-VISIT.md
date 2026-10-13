An NPC's Visit is defined by 2 phases of actions.  VISIT consists of BROWSE, then CLOSEOUT. When a VISIT starts, the NPC's VISIT gets a MAX_ROUNDS number based on their NPC attributes. 

BROWSE is a set of actions with order chosen randomly. At then end of each round (probably 15 minutes in-game time, likely defaulted to 30 seconds of real time to start), the remaining visit sequence options are recalculated, then another option is chosen at random.  The Browse sequence ends when there are no more items possible in the calculated set. Set actions include: 

- try to chat with any other NPC 
- Walk to a Noticed Display
- Interact with a Noticed Display 
- Work on a project from WIPs
- Move around the store a random amount 

(closing sequence is entered when no more options exist )
CLOSEOUT SEQUENCE: 
- ALWAYS 3rd to LAST: NPC moves to sign guest book (hardcoded). Event where a picture of a finished object gets added to the LYS guestbook (always happens. If if they made a finished object while in visit or if they brought one in with them, a picture generated of them holding object. The item in the PHOTO should be the most recently finished object, and the NPC should be pictured in/with it even if they are not currently wearing it (e.g. it is being lent to the shop). Otherwise, a note about whether or not they are happy (found what they are looking for) or disappointed (did not find what they needed) is added) 
- 2nd to LAST IF NPC HAS A FINISHED OBJECT: NPC (fancy animation here!) will all the player to borrow a finished object for display in the LYS, and hand the object over at the counter, where they just signed. 
- ALWAYS LAST: leaving through the door

RETURNING VISITORS:
- An NPC who manages to either *buy any items* or *work on a WIP* during a visit is marked for *return*: they go on a list of returning NPCs who can re-enter the shop at a later time.
- A returning NPC comes back as themselves: same traits and craft preferences, same crafter skill level (including any +1 earned by finishing something), same WIP slots at the progress they left them at, and still wearing whatever they were wearing.
- This is what lets a long project span more than one visit, and so is a primary driver of Finished Object count.

GUESTBOOK ENTRY ICONS (MVP: the entry is one line with a leading icon, so a page of the book reads at a glance):
- 📷 they made a finished object — the photo, of the most recently finished one. An object is photographed once: a regular who walks back in wearing yesterday's hat has nothing new to show and signs with a note instead
- 🙂 happy: they found what they were looking for (bought something for a WIP)
- 🙁 disappointed: they did not find what they needed. Buying anything counts as finding it; a customer who needed nothing, or sat and worked on a WIP, is 🙂, not 🙁
- 🧶 they bought yarn
- 📖 they bought a pattern
- 🪡 they bought a tool notion (hook or needles)
- 🏁 they finished a WIP and lent it to the shop (🎁 is kept for gifts between customers, TUTORIAL.md §7.3; ✨ is the in-shop sparkle when a customer has everything a WIP needs)
- 🧑‍🤝‍🧑 they chatted with another customer during the visit
- 🪑 they sat and worked on a WIP in the shop
- ⏳ they ran out of MAX_ROUNDS before finding anything
- 💨 Volatility 5: they gave up and left in a huff

(An entry always has exactly one MOOD icon — 📷 if they made something, otherwise 🙂 or 🙁 — plus any number of the others as tags on what happened during the visit.)



Recalculating the BROWSE action set: calculated when some round of "time" has passed (in game 15 min default, out of game 30s for animation probably)
 
State required to calculate the BROWSE action set for an NPC: 
- list of all visiting NPCs: their traits, their XYZ centroid, 
- list of all Displays: their XYZ centroid positions and their meta 'attractiveness' list of weights to use against a particular NPC

- HISTORICAL STATE for all NPCs: 

    Round N-1: What was the NPCs last chosen action?
    Round N-1: PRESCRIBED CALCULATED SEQUENCE: "is Round N PRESCRIBED by the results of N-1?  
    How many rounds has the NPC been in the store. 


IF THERE IS A PRESCRIBED NEXT ACTION, IT IS TAKEN. If there is NOT a PRESCRIBED NEXT ACTION, AND MAX_ROUNDS FOR AN NPC VISIT HAS NOT BEEN EXCEEDED, A RANDOM ACTION IS CHOSEN FROM THE FOLLOWING BUILT SET: 

Actions to be added to the Browse Action Set (build in a function called "DetermineNextBrowseAction") 

ACTIONS WITH PRESCRIPTIONS: 

- Interact with a Noticed Display 

    PRESCRIBED NEXT ACTION: If NPC finds something to interact with inside the noticed display (see DISPLAYS.md) then PRESCRIBED NEXT ACTION is once again "Interact with noticed display." Otherwise it's None

    PARAMETERS: Display Id


- Walk to a Noticed Display:
        
        If the NPC "walked to a display" "interacted" with a display in the last round, no new walking actions will be added to this rounds set as we want an NPC to stay at the current display. 

    For each display, calculate a boolean "visible" value for each display. Keep this simple: if there's nothing intersecting the vector between the NPC and the display centroid, it's "visible". Exception, the shop floor: floor tiles are walked on, so they never block a sightline (or a route), and a floor tile is seen at its point nearest the NPC rather than its centroid — a tile half under a shelf or a table has its centroid hidden, and what sits on its open half must still be noticeable. 
    
    For visible displays, calculate attractiveness of each display using weights. All displays with an attractiveness of more than 50% become unique actions added to the possible set: "Walk to display A".  
    A display (or floor tile) holding no items has attractiveness 0: nobody walks up to browse an empty place.

    PRESCRIBED NEXT ACTION: Interact with noticed display.

    PARAMETERS: Display Id

- Walk to closest NPC:
        
   Chance of this action getting added to the action set is:
        
        Enthusiasm+Assertiveness/10

    Action for "Walk to closest NPC" is calculated from XY position of NPCs at the LAST round. This means it's possible to walk to a spot where a target NPC is moving away from. C'est la vie, handle like in real life. NPC wait 1 round in case the other NPC wants to come over.
     
    PRESCRIBED NEXT ACTION: Wait 

ACTIONS WITHOUT PRESCRIPTIONS: 

- Work on a project from WIPs
        
    More than 1 "Work on a WIP" action can be added to the action set for choosing: more WIPs deliberately thus makes it more likely this action gets picked for a round.  

    Every round of work is drawn as a whole round of knitting or crochet in the chair, the round that finishes the WIP included: the Guestbook's 🪑 is always something the player could have watched.

    PRESCRIBED NEXT ACTION: None

- Wait a Round

    Stay still. Not offered on the doormat: an NPC parked there blocks the one way in and out. Drawn standing, not leaning in at the goods: a wait lands wherever a wander did, empty shelf or bare floor included.
    
    PRESCRIBED NEXT ACTION: If another NPC2 is within a small distance of NPC1, chance of "PRESCRIBED NEXT ACTION" being another 'Wait a round' to keep interacting is:
        
        Enthusiasm+Assertiveness/20
    
    Otherwise PRESCRIBED NEXT ACTION is None.

    NOTE: this is /20, NOT the /10 used by "Walk to closest NPC" above, and the difference is load-bearing. Approaching is a one-shot - it adds one option to a set that gets re-rolled next round anyway, so a chance of up to 1.0 is harmless. Waiting PRESCRIBES ITSELF, so the roll compounds: at /10 two NPCs with Enthusiasm 5 and Assertiveness 5 hit a chance of 1.0 and stand there waiting at each other forever, and the visit never reaches CLOSEOUT. At /20 the chance tops out at a coin flip, so the chat decays on its own and ends after a couple of rounds.

- Move around the store to a spot. 
    
    Generate a random XY target not inside a display (nor a chair, nor the doormat), and a path to move there. The shop floor's tiles don't count as displays here — the target may be anywhere on the floor, so a patient wanderer eventually sees the whole shop. 

    PRESCRIBED NEXT ACTION: None


Calculation of MAX_ROUNDS from Character attributes: 
    Starting value:  (Openness+Industriousness+Enthusiasm)*(Uniform random chance value from 1 to 2), for a range of MAX_ROUNDS from worst case 3 to longest visit 30. 

    - Volatility=5: an interaction with a Noticed Display that does not result in finding what they need will reduce original calculation of MAX_ROUNDS to 1, causing NPC to leave immediately. 


NPC Visitors who manage to either *buy any items* or *work on a WIP* should be marked for *return* to the shop: they go on a list of returning NPCs. 

## In the shop: how a visit looks (as built; code points here with `CHARACTER-VISIT.md §Section`)

### Rounds and the door
- Customers queue outside in single file and enter one at a time. Each day's round clock starts full, so the first customer comes straight in. Nobody loiters within 0.8 of the door. The day clock (`dayT`) never winds back.
- A round lasts just over the longest staggered walk (`autoSeconds`); in the game each round also waits for its last walker, and the day ends at the door and waits for the player.

### Staggered departures
The sim is lockstep; the animation must not be.
- Each customer starts at a random point in their gait.
- Departures each get one shuffled slot inside `travelJitter` (stratified, not uniform), the order reshuffled every round. The customer coming in through the door is not staggered.
- Each customer has their own pace (±25%) and their own cheer timing.
- `travelJitter + travel·(1 + paceJitter)` must fit inside a round.

### Walking
- Speed is constant along the route, so corners don't stall; a longer route takes longer, not faster (PLAYING-AT-YOUR-PACE.md §3 for the speeds).
- Speed is capped so the eased peak never exceeds the legs' top speed: no skating. The slowest walker clears the gait gate, and the longest legs (the stilt llama) still step at `cadenceMin`. In the shop `gateSpeed` is 0.1 and `cadenceMin` 1.5 steps/s, so a slow walk is short steps, not slow-motion strides (`speed.test.mjs`).
- The gait phase follows distance, not time. Facing follows the leg of the route being walked.

### Turning and pausing
- Bodies turn at 8/s (a half turn in ~0.4s), never snapping. At a display they turn to face it and only reach once within 0.35 rad.
- ⏸ eases the walk to a stop over a step or two (ease rate 4/s) and resumes along the same route at the same pace.

### Sitting
- They don't fold to sit until they've arrived. The walk ends 0.06 in front of the chair's front edge; sitting moves back onto the cushion, standing up is a step forward, not a rise straight up. Seated, they face the chair's facing.
- Lift, fold, turn and slide are one motion, with a forward lean of 0.30 rad peaking halfway.
- Seat height is measured per body (its lowest resting part) and calibrated on first sit, so leggy and stumpy characters sit flush on the same chair. `S.seatLift` is the gap between hip joint and cushion.

### Knitting in a chair
- A seated customer with an IN_PROGRESS WIP shows the craft: tool (needles or hook) from the pattern, the piece sized by its type, pace by skill, the running-out tell from their yarn, the ball on the floor by the chair. It starts only once they are seated (>90%). On a round change the hands go back before the craft is put away. A WIP not started, or with no pattern, shows no craft.

### What they carry out
- Nobody walks in carrying anything: "are they carrying something?" is how the player reads a successful visit.
- The held item is the thing taken off the shelf. Yarn is a real ball at its shelf size. A notion is a shelf-sized box shrunk to one layer, labelled on the top and front only, with the mm sticker if it has a size, tipped toward the hand and never a camera billboard. ~10 customers means ~10 non-instanced meshes, which is fine.
- A customer carries the real package or nothing; the rig's placeholder skein never shows in the shop. The package is hidden while they knit (the right paw holds a needle).
- A finished piece shows on the wearer the same round it is finished. A dressed body costs +1 draw call; bodies are rebuilt only when the outfit changes, at most one per frame.

### Celebration
- Buying (nothing in hand to an item) plays `delighted` plus decaying hops; putting an item down never does. Delight outranks every other pose and the walk, so they stop and cheer.
- Each customer rolls their own cheer at spawn: delay 0–0.55s, duration 0.8–1.25 × 1.6s, 2–4 whole hops (the last one lands), height 0.75–1.3 × 0.10, so customers who buy on the same frame don't cheer in unison.
- A sparkle plays when a purchase makes one of their WIPs READY; none for a WIP already ready when they walked in.
- TODO: the celebration is a placeholder (P1-SPIKE-PLAN): squash on landing, an ear perk at the top of the hop, and the cheer delay derived from Enthusiasm once the emotion layer exists.
