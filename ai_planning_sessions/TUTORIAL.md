# Tutorial

How a new player learns the shop without being taught at. Built on the gameplay planned so far in
[LYS.md](LYS.md), [DESIGN-DECISIONS.md](DESIGN-DECISIONS.md) §5–6,
[PLAYING-AT-YOUR-PACE.md](PLAYING-AT-YOUR-PACE.md),
[characters/NEAR-MISS-AND-SUBSTITUTION.md](characters/NEAR-MISS-AND-SUBSTITUTION.md) and
[characters/REGULARS-AND-SHOP-CHARACTER.md](characters/REGULARS-AND-SHOP-CHARACTER.md). It runs
on [SCRIPTED-EVENTS.md](SCRIPTED-EVENTS.md): the tutorial is the first script.

The test bed is the menu-free game page, `characters/game.html`, which the front door opens onto.
This document is also the experiment's brief: **how far can "no menus except the Guestbook" be
pushed before something has to give?**

---

## The pillar

> **A game that rewards paying attention, but doesn't stress you out if you don't.**

Every decision below has to serve both halves. How the current ones do:

| Rewards attention | Never stresses |
| --- | --- |
| Witnessed behaviour is remembered in detail in the Guestbook (§7.3) | missed behaviour still leaves a gist, and the regulars come back with the clue again |
| Quiet, industrious customers only hint, but make the coolest projects (§7.4) | chatty customers say exactly what they need, so there is always someone easy to help |
| Picture bubbles reward watching a conversation (§7.4) | ▶ is slow, ⏸ is always there, and bubbles hold while paused (§3) |
| Chairs placed so customers sit and knit reveal their projects (§7.3) | nothing is lost by not doing it; it is a bonus, not a requirement |
| A good order means the right yarn is already there (§7.2) | a blank order line is filled by the supplier; never empty |
| The ball band rewards reading the stock (§7.1) | it appears on hover; nothing has to be memorised |
| Catching a hesitating customer (§5) | they decide on their own if you miss it |

**The test for a new mechanic:** what does a player who pays attention get, and what does a player
who doesn't lose? The answer to the second must be "a chance they can catch next time", never
progress, an item, or a person.

---

## TLDR

**The tutorial is the first three days of the real game, five to ten minutes of play.** There is
no overlay, no arrow pointing at a shelf, no "press E to continue", and nothing to skip because
nothing is separate from playing. It teaches the core loop and ends on its payoff:

1. **Day 1:** your first customer wants a pot holder; you put the yarn by the pattern; they buy it.
2. **Day 2:** what you put together sells together.
3. **Day 3:** your first customer comes back, sits down and finishes the pot holder in the shop,
   and their selfie is the first photo on the board.

**Everything after that is a discovery**, not a lesson: each system arrives the first time it
makes sense (§5), at most one a day.

**One character carries it:** the tutorial friend, randomly generated per game, the same person
throughout, in the shop every day.

---

## 1. Rules for the tutorial

1. **No menus.** The only things that open UI are the Guestbook on the counter (and the bulletin
   board's photos), the night screen, and the corner button stack (§3). Anything else the player
   must learn has to be learnable from an object in the room.
2. **Nothing is lost by ignoring a lesson.** It is the rule of PLAYING-AT-YOUR-PACE.md applied to
   teaching. A lesson the player misses comes round again: the customer returns, the note is
   still there, the Guestbook remembers. An idle player finishes the tutorial by watching.
3. **Teach rules, not facts** (NEAR-MISS §7). "Same-weight yarn side by side sells" is a lesson;
   "Marguerite wants aran" is not.
4. **Short.** Three days. Anything that is not the core loop is a discovery (§5).
5. **Every lesson has a success moment the player can see** without reading anything: a customer
   leaves holding the thing, a hop of delight, a new photo on the board.
6. **No money, ever** (LYS.md). Nothing in the tutorial counts, scores or rates.
7. **Complexity is earned.** The first project is the smallest thing a knitter makes: a pot
   holder. Bigger crafts and better rewards (scarves, sweaters, lent objects worth displaying)
   arrive as the shop and its regulars grow, never on day 1.
8. **The player can always pause** (§3). Pausing is a basic control, never a discovery.

---

## 2. How the shop teaches: the channels

Everything the tutorial says, it says through one of these. If a lesson fits none of them, that is
a finding (§6), not a reason to add a popup.

| Channel | What it is | What it is good for |
| --- | --- | --- |
| **Needle Tips** | the sticky note pinned with knitting needles. One on the front door; a second on the counter in the shop, by the Guestbook | one short rule a day, in ballpoint. The door's first tip is *"Come in, we're open!"* |
| **The delivery pile** | the morning's boxes on the floor (DESIGN-DECISIONS.md §6) | the place verb, with no instructions: things on the floor want to be on shelves |
| **Customers** | what they do, not what they say: lingering, picking up, hesitating, hopping | which arrangement worked, read off behaviour |
| **Speech bubbles** | a word or two, trait-flavoured (SPIKE-FUN.md D6) | the rare thing behaviour cannot say: *"Ooh, all the blues together!"* |
| **The Guestbook** | real entries with mood icons, selfies of finished objects | the record of what happened, consulted on the player's own time |
| **The counter** | the break card, the Guestbook, the note | where customers come to the player, and where new tools appear |
| **The night** | the shop's exterior between days: the door shut, *"Closed — back tomorrow"* on the note, tomorrow's order on a packing slip taped to the parcels on the step (§7.2) | what tomorrow brings, and the order. It waits; opening the door starts the day |
| **New objects** | something that was not in the shop yesterday | a discovery arriving: a line of your own on the packing slip, the hold shelf |

**The counter note is the tutorial's voice.** The shopkeeper's own reminder to themselves,
rewritten each morning. It never explains controls; it states one shop truth. If the player never
reads it, nothing breaks. It also introduces each discovery the first time, and never again.

---

## 3. The corner stack: the only controls

Top-left, a vertical stack of round buttons:

1. **The yarn-ball emblem.** Tap to fan out the rest; tap again to fold them away.
2. **Camera:** frame the room, with its view cube; opens the top-down and side views.
3. **Lock:** lock the camera.
4. **Furniture:** move-the-furniture mode (with turn buttons when something is held or selected).
5. **Speed:** one button, four states, each press the next: ▶ → ▶▶ → ▶▶▶ → ⏸. ⏸ is pause.
6. **Info, in brass:** *About this game*: the author, © 2026, all rights reserved, and the
   open-source libraries used.

Folded, the screen is the shop and one brass emblem. The tutorial never refers to these buttons.
The camera is learned by touching the screen; furniture moving is a discovery.

### Pause

Always available, from the first second of the game. It costs nothing.

- **One control, two faces:** the speed button in the corner stack, whose fourth state ⏸ is
  pause, and **the break card on the counter**, which flips face-out ("Back after this row")
  while paused. Clicking the card toggles pause too, so a player who never opens the stack can
  still find it in the room. *The card is to build; game.js marks where it hooks in.*
- **Keys:** **Space** steps the button on (▶ → ▶▶ → ▶▶▶ → ⏸), **P** pauses and resumes at the
  speed it left. Game page only: on store.html Space still advances a round.
- **The speeds:** ▶ (the default) is a stroll, slow enough to watch every customer shop; ▶▶ and
  ▶▶▶ are two and three times that, walking and rounds together. The setting lasts across days.
- **Stops rounds:** no new decisions, no purchases, nobody leaves, the queue waits outside.
- **Not animation:** characters finish the step they are on, then idle, chat, gesture, sit and
  knit. The room keeps breathing.
- **The player keeps acting:** pick up, place, move furniture, change the camera. Arranging while
  paused is the point.
- **The signals are objects:** the card, and the wall clock's pendulum stopping. No overlay.
- Holding an item still pauses on its own; the night screen is the pause the game gives every day.

---

## 4. The three days

Each day: what it teaches, how it arrives, what success looks like, and the fallback for a player
who does nothing. **Needs** is what has to be built first, in terms of PLAYING-AT-YOUR-PACE.md §7
and SCRIPTED-EVENTS.md §4.

### The tutorial friend

- **Randomly generated each game, the same character for the whole tutorial and after.** Species,
  name, colours and looks are random; only what the tutorial needs is fixed: beginner skill, a
  craft that can make a pot holder, and a friend's patience from day 1 (they wait for the player,
  where a stranger would not).
- **Kept from the start:** a `keep` role (SCRIPTED-EVENTS.md), exempt from roster eviction.
- **Visits every day,** first in the queue. On their own days they are the lesson; on others they
  browse, say hello and buy something small while another customer carries the lesson.
- **Recognisable:** theirs is the first Guestbook page, and from day 3 the pot holder is with them.
- **As built:** skill 1, patience `friend`, Assertiveness 5, Orderliness 3, Volatility 1 (they dig
  things out, don't tidy, don't storm off). Their one WIP starts blank, so the first thing they
  want is the pattern. They get the kit as they walk in; on day 2 they stay until they have found
  the hook and the ball, digging them out if buried.

### Day 0: the front door

- **Teaches:** the game is a place. Click the door and it opens.
- **Arrives as:** the front door (`index.html`), the sticky note's *"Come in, we're open!"*
- **Success:** the door swings and the shop is behind it.

### Day 1 opens: the Former Owner

- A random species, wearing a finished piece in all six wear slots and carrying 3–5 pot holders.
  They start at the Guestbook signing out (*"Shop's all yours! Make some fun stuff!"*), leave by
  the door and never come back: no queue, no purchase, no chair. The filed photo keeps the pile.
- The Guestbook opens by itself, top right, as day 1 opens (and every night), so the farewell is
  seen.
- Their farewell photo never goes on the bulletin board, so the board's first card is the
  player's first success (day 3).

### Day 1: put the yarn by the pattern

- **Teaches:** the place verb, through a customer.
- **Arrives as:** **an almost empty shop holding exactly three things:** the pot holder pattern,
  a hook and one ball of yarn (PATTERNS.md: potholder, 1 unit). The tutorial friend stands at a
  table looking at **the pattern, lying on the table directly in front of them**: always, whatever
  the furniture layout, because they go to the table where it is. **The hook and the ball are the
  morning's delivery, on the floor,** so bringing them to the table is the player's first action
  and what makes the sale possible. Nothing else in the shop competes for
  attention. (This overrules DESIGN-DECISIONS.md §6's "24–30 items, not 10" starting pile for
  the tutorial: an empty shop is the point, and day 2's delivery fills it.)
- **Counter note:** *"Shelves sell. Floors don't."*
- **Success:** the player puts a suitable ball by the pattern; the friend buys both and signs the
  Guestbook. The Guestbook shows something new, which invites the first click.
- **Fallback:** if the player never moves anything, the friend eventually finds the ball and hook
  on the floor themselves (floors are slow, not impossible), and the Guestbook still fills.
- **Needs:** a fresh tutorial game that starts with only these three items (today a fresh game
  fills to `stockCount` first); the scripted `cast` and `seed … facing` actions; pot holder as a
  pattern type (the decor finished-object types are a TODO in `inventory/catalog.js`); the kit
  growing to pattern + yarn + hook.

### Night 1: what comes tomorrow

- **Arrives as:** the night screen: the shop shut, tomorrow's order on the packing slip, read-only.
- **Teaches:** deliveries come from an order, and the screen waits for you.

### Day 2: what goes together

- **Teaches:** arrangement matters. Grouped stock sells better than scattered stock.
- **Arrives as:** the delivery: six balls in one colour family, plus patterns. The friend drops by
  with a pot holder half done in their bag.
- **Counter note:** *"Put the blues together."*
- **Success:** a customer stops at the grouped display, visibly delighted (hearts, a hop), and
  buys more than one ball.
- **Fallback:** ungrouped, the yarn still sells, only less. Nothing is withheld.
- **Needs:** `miss()` and the tolerance table (build step 3), so the purchase is no longer 100%
  and grouping can make a difference.

### Night 2: a line of your own

- **Arrives as:** one line on the packing slip is blank and the player's.
- **Door note:** *"Tomorrow's order is on the packing slip. One line is yours."*
- **Success:** the player's choice is in tomorrow's pile.
- **Fallback:** a blank line is filled by the supplier. Never empty.
- **Built:** a dropdown over the blank line on the slip (`store/ui/night.js`, `choicesFor()` in
  `inventory/supply.js`); `SCRIPT` marks day 3's order (set on night 2) with the player's first
  line, then every line from day 4. Not yet: §7.2's budget of 6 + sold as free lines, the
  "supplier's choice" button for the whole slip, and the supplier sample.

### Day 3: they come back

- **Teaches:** helping someone pays off later.
- **Arrives as:** the friend returns with **the pot holder** from day 1's kit a few rows from done,
  **sits down and finishes it in the shop** (decided 2026-10-04: the player has to see it happen),
  and **their selfie holding it goes up on the bulletin board**: the board's first card is the
  player's first success. Its thank-you line (PROJECTS-AND-AUTHORSHIP.md §4b) remembers day 1
  truthfully, e.g. *"First thing I ever made! The red one was right there on the floor."*, which
  quietly echoes the note. A pot holder has no wear slot (WEARABLE-FINISHED-OBJ.md: decor is
  always lent), so they also lend it to the shop at the drop-off, and it can be displayed.
- **Counter note:** *"Look who's back!"*
- **Success:** the player sees the selfie, and places the lent pot holder somewhere they will see
  it: the arrangement verb used as the relationship verb (REGULARS §3). Small on purpose.
- **Fallback:** the selfie stays on the board; the pot holder waits at the drop-off.
- **Built:** the pot holder is held short of done until day 3 (`holdAt` 90%, `wip.js`
  `progressLimit`), day 3 lifts the hold as knitted at home, and the finishing push (`visit.js`,
  ROADMAP I1) sits the friend down to finish it: round 3 of day 3, about half a minute at ▶
  (`store/walk.test.mjs` §6).
- **As built:** the hold is 90%, one beginner round from done. Day 3 lifts it even if the kit is
  incomplete, and the friend finishes it for any traits.
- **Needs:** pot holder as a
  renderable decor finished object; the selfie path (`store/ui/photo.js`, the board) taking a
  decor object in hand.

**After day 3** the tutorial is over without announcing it. The friend keeps visiting as a
regular. From night 3 the whole packing slip is the player's; what the supplier fills blank lines
with still introduces new weights and notions gradually (DESIGN-DECISIONS.md §6), which is pacing
the player never notices, not tutorial.

---

## 5. Discoveries

Each arrives the first time it makes sense, as an event-triggered script beat
(SCRIPTED-EVENTS.md), **at most one a day**, introduced once by the counter note. *Proposed, to
review:*

| Discovery | Arrives when | Why then |
| --- | --- | --- |
| **Catching a hesitation** | the first time a customer dithers over a near miss while the player is holding a better match | the lesson only makes sense with something in hand to give |
| **More order lines** | each night after a day on which the player shelved most of the delivery | they have shown they can handle more |
| **The hold shelf** | the first time a regular leaves disappointed with an unfinished project, and leaves their bag on the counter (characters/PROJECT-BAGS.md §3a) | that is exactly who it is for |
| **The friend asks at the counter** | the friend's third visit after the tutorial | friendship shown as them coming to you |
| **Bigger projects** (scarves, then sweaters) | customers get them as their skill grows from finishing smaller ones | complexity is earned |
| **Moving the furniture** | no trigger: the corner stack's furniture button is simply there | found, not taught |
| **Recipes** (stripes, fair isle, marled, pom-pom…) | one at a time, each hinted by an expert customer's bubble, a counter note or a supplier sample; celebrated with a recipe card the first time it fires | characters/PROJECTS-AND-AUTHORSHIP.md §3–4 |
| **Reading a project** (running out, ready, the project bag) | from the start: the tells are just there to notice | characters/PROJECTS-AND-AUTHORSHIP.md §1 |

---

## 6. Pushing "no menus": where it will strain

The point of the menu-free page is to find these by playing, not by arguing. Current guesses, with
a diegetic answer to try first:

| Pressure point | Diegetic answer to try | If it fails |
| --- | --- | --- |
| **Pause** | **decided:** ⏸ on the corner-stack speed button plus the break card on the counter (§3) | — |
| **Speed** | **built:** the corner-stack speed button, ▶/▶▶/▶▶▶ (§3) | a speed dial on the wall clock, still an object |
| **Saving** | autosave every round to browser storage. No save button, ever | — |
| **Starting over** | a "closed for renovation" option, maybe on the break card's back | open: genuinely needs a decision |
| **Graphics quality** | DESIGN-DECISIONS.md §4 makes it a player-facing setting | the About panel is the natural home: it is already the one "outside the game" surface |
| **Sound volume** | a radio on the counter: tap to change station or turn it off | — |
| **Ordering** | **decided:** the packing slip on the parcels on the night screen (§7.2); first line yours on night 2 | — |
| **Help and re-reading tips** | the counter note keeps the last few tips as a small pad, flippable | a page at the back of the Guestbook |
| **Who is this customer?** | recognition, not lookup: what they wear, their Guestbook page | tapping a customer to see their page, i.e. the Guestbook again |
| **Keyboard shortcuts** | F, L, M, Q, E, P, Escape and the arrows keep working, untaught | listed in the About panel |

**The measure:** a new player gets through day 1 to the first Guestbook entry with no text on
screen other than the note on the door, the note on the counter and speech bubbles. If they
cannot, the first failing step goes in this table with what was tried.

---

## 7. Information: what the player can see

Found by playing `game.html`. Each answer is an object, not a panel.

### 7.1 The label: a ball band

**Problem:** the player cannot see what anyone bought, or what they are arranging.

- **A paper ball band** on the right edge of the screen, like the bands on the yarn, in black
  house lettering (VISUAL-DESIGN-2D.md, Type).
- **Appears** when the pointer hovers over an item (mouse), or when an item is picked up (mouse
  or touch). It stays after the item is set down, until something else is hovered, picked up or
  clicked, so it can be read while arranging.
- **Shows only what a shopper could read off the real object:**
  - yarn: weight, fibre, colour family, shape (ball, cone, skein), and its units (1 UNIT, the word
    a pattern counts in);
  - pattern: title, what it makes, craft, needle or hook size, the yarn weight and how many units it takes;
  - notion: what it is, and its size.
  - A yarn's band and a pattern's use the same words (UNITS, the weight), so the player can match
    one to the other.
- **Clicking a customer** swaps it for their **tag: their name and the items they have bought.**
  Never their hidden wants: inferring those is the puzzle.
- **As built:** a press that moves more than 8px is an orbit drag, not a click. The tag grows as
  they buy. Pointing at a customer without clicking counts as watching them (§7.3).

### 7.2 The night order reads as a delivery, not a task

**Problem:** the clipboard read as a list of things to go and find. Its empty checkboxes say "tick
these off", a clipboard is what jobs come on, and "ORDER FOR DAY N" does not say who sends what.

- **Parcels on the step** by the shut door, waiting for morning: "things are coming" before a word
  is read.
- **A packing slip taped to the top parcel** replaces the clipboard: a supplier's name (e.g.
  WOOL & CO. SUPPLY), "FOR: LOCAL YARN STORE", "ARRIVES: DAY N, MORNING", and lines as
  quantity × item ("6 × WORSTED YARN, ONE COLOUR FAMILY"). **No checkboxes.**
- **The slip IS the order: a budget of items, not fixed lines.** Each night the player has a
  budget of **6 + the number of items sold that day**, shown as that many blank lines on the slip.
  Fill some, all or none with **anything in the catalogue**: the limit is how many, never which
  kinds.
- **"Supplier's choice"** fills every line the player left blank, using the supplier logic.
  Pressed first, the whole order is the supplier's. Ordering is never a chore.
- **A supplier sample with every delivery,** outside the budget: one extra item the supplier
  includes on their own, so new weights and notions keep appearing (PLAYING-AT-YOUR-PACE.md §5).
  On the slip it is its own line: *"+ 1 supplier sample"*.
- The tutorial's scripted days set their deliveries completely; the player's lines start on
  night 2.
- **The donation box: the player's destash.** A box in the shop. Stock dropped in it leaves
  overnight. **It holds as many items as that night's order budget** (6 + sold): the shop can be
  reshaped a little each night, never emptied at once, so ordering stays a decision. No money and
  no other penalty; the cap is the cost. It replaces DESIGN-DECISIONS.md §6's automatic overnight
  destash: the player decides what leaves.
  - **Slow on purpose, and that makes a second puzzle:** a 20–30-item mistake takes 3–5 nights to
    donate away, so the player is nudged to get customers to take it instead. Arrange it beside a
    pattern it suits, put it where the loose, enthusiastic customers browse (they grab what is pretty
    and accept substitutes, NEAR-MISS-AND-SUBSTITUTION.md §3), pair it into a colour group. Clearing
    stock you regret becomes arranging, the game's core verb, and it is never stressful: unwanted
    stock just sits there harmlessly until it goes.
  - The dial if it feels too slow in play: the box's capacity (e.g. 2× the budget).
- In the morning the delivery on the floor is those same parcels' contents.
- Works because day 1's shop is nearly empty (§4): the slip is obviously about what is coming.

### 7.3 The Guestbook tells you what happened, in detail

**Problem:** a Guestbook line (one mood icon plus tags) is too thin to solve anything with.

- **Click an entry's icon and its row expands.** What the row shows depends on what happened, and
  it is always **what the customer did, never what they wanted**:
  - **🙂 / 📷 bought something:** exactly what they bought, each item with its ball-band
    properties (§7.1): weight, fibre, colour family, pattern title and so on.
  - **🙁 disappointed:** what they **picked up and put back**: "turned over a dk wool ball, put
    it back". The near miss a shopkeeper would notice; the player infers the want.
  - **🪑 sat and knitted in the shop:** **the pattern they were working on.** Sitting in the shop
    becomes a mechanic: give customers chairs, and the ones who stay to knit show you their
    project, which tells you what they will need next. Chairs become part of the puzzle.
  - **🎁 gave, swapped or repaid:** a stash **swap** or **gift** between two customers, and the
    **treats** brought back for a gift (PLAYING-AT-YOUR-PACE.md §5, "Treats"; HOW-THEY-SHOP.md
    §2b). Written on both customers' pages: *"Gave Bramble two balls of blue"*, *"Brought
    biscuits for Mira"*. A treat tin on the counter is always recorded (it is an object in the
    shop); the swap itself only in detail if witnessed, otherwise a gist (*"swapped some yarn with
    Bramble"*).
  - **Transactions become a relationship.** The 🎁 rows between two customers add up over time:
    the book's page for a customer lists **who they give to, swap with and bake for**, most often
    first. That is the relationship between them, built from what actually happened, never
    declared (SPIKE-FUN.md D2), and it is what the player reads to know who to seat together.
- **The book remembers what the player SAW, not everything that happened.** Otherwise there is no
  reason to watch the shop: skip the day, read the book.
  - **Purchases are always recorded.** The till keeps receipts.
  - **Behaviour is recorded in detail only if witnessed:** put-backs (🙁), the pattern being
    knitted (🪑), what was said in a chat (§7.4). *Witnessed* = the customer was on screen and
    reasonably close to the camera when it happened, or the player was hovering or had clicked
    them.
    As built: on screen and within 12 units of the camera at the start of the round, or pointed
    at since the last round.
  - **Missed behaviour leaves a gist, without detail:** "chatted with Bramble about a project",
    "turned something over and put it back". The gist is what teaches the player what is worth
    watching; the detail is the reward for having watched.
  - Still pace-proof, because forgetting is cheap, not permanent: ⏸ and ▶ give time to watch, and
    the regulars come back, so a missed clue comes round again.
- This answers DESIGN-DECISIONS.md's open "hints in Guestbook entries" question: entries record
  observed behaviour (a memory aid), never hidden state (a solution).
- **As built:** the counter book opens at today and pages back through every day (LYS.md 5c).
  Entries expand as native `<details>`, so the keyboard works. Every finished day's page is kept; a
  photo entry stores the signer as they looked that day. A new game wipes the pages and resets the
  day counter.

### 7.4 Overheard chat: picture bubbles, like The Sims

**Problem:** customers chatting is the richest information channel in the game and is barely used.
The model is The Sims: conversations are pictures over murmured nonsense, read at a glance in
any language, with the mood in the icons.

- **In the shop, picture bubbles, no text.** Topic icons generated from real sim state: a ball in
  a colour, a pattern's silhouette (sweater, pot holder), a needle size, cables, a sad face over a
  ball ("couldn't find it"), a heart over the grouped blues. A sweater and a worsted ball says
  "my project is a worsted sweater" without a word.
- **What they talk about:** their project; their skill, shown in how they react (a beginner's
  bubble of cables wobbles nervously, an expert's sparkles); their taste; past frustrations; the
  shop and its arrangement; each other (friends, rivals, who taught whom).
- **Personality decides how much is said, including whether they state an exact need.**
  - **Open, chatty customers** (high Openness, high Enthusiasm) will say exactly what they need
    today: a bubble of *that* ball in *that* weight. They are easy to help.
  - **Quiet, industrious customers** (high Withdrawal or low Enthusiasm, high Industriousness)
    never say it outright. They hint: their project, a frown over the wrong weight. But they make
    the **cooler, more ambitious projects**, and helping them pays off more, if the player was
    paying attention.
  - High Orderliness is precise in whatever it does say.
  - The same difficulty curve as NEAR-MISS-AND-SUBSTITUTION.md: easy customers are generous with
    information and modest in reward; demanding ones are the reverse. Learning who is worth
    listening to is a skill.
- **Arrangement decides who talks:** customers seated near each other chat more, so the chairs
  are a social puzzle too.
- **In the Guestbook, words:** a 🧑‍🤝‍🧑 row translates a WITNESSED conversation into a line or
  two of text (§7.3); a missed one leaves only its gist.
- Bubbles hold while paused, and are paced to be readable at ▶.

---

## Decisions (2026-10-03)

- The tutorial friend is randomly generated per game and the same character for the whole
  tutorial.
- The friend visits every day.
- On day 1 the pot holder pattern is always on the table directly in front of the friend.
- The tutorial is three days, about five to ten minutes; everything else is a discovery.
- Pause is always available: a button that puts the break card in place, stopping rounds but not
  animation. It is the fourth state of the speed button (▶ → ▶▶ → ▶▶▶ → ⏸), not a button of its own.
- Scripted content uses one standard structure (SCRIPTED-EVENTS.md); the tutorial is its first
  script.
- Tutorial day 1's shop holds exactly three items: the pot holder pattern, a hook and the yarn.
  The pattern is on the table in front of the friend; the hook and ball are the morning
  delivery, on the floor.
- Information (§7): an item label (a ball band) on hover or pick-up; a customer's tag shows their
  name and what they bought; the night order reads as a delivery (parcels and a packing slip).
- The Guestbook (§7.3): clicking an entry's icon expands the row: purchases in detail; for 🙁,
  what they picked up and put back; for 🪑, the pattern they were knitting in the shop.
- The Guestbook remembers what the player saw: purchases always; behaviour in detail only if
  witnessed, otherwise a gist.
- Chat (§7.4): picture bubbles in the shop, like The Sims; witnessed conversations translated into
  words in the Guestbook.
- The night order is a budget of 6 + items sold that day, any items from the catalogue, on the
  packing slip; a "supplier's choice" button fills whatever is left blank.
- Every delivery includes one supplier sample, outside the budget.
- Destash is a donation box, player-filled, holding at most that night's order budget.
- How explicit chat is depends on personality: open, chatty customers state exact needs and are
  easy to help; quiet, industrious ones only hint, but make cooler projects for attentive players.

## Open questions

- **Stock growth when the player never donates:** 6 + sold still grows stock by 6 a day. Default
  unless overruled: the extra 6 eases off as the shop fills (never the replacement of what sold),
  as a safety net under the donation box.

- **The discovery triggers** in §5.
- **Does the counter note exist from day 1, or appear on day 2?** Day 1 might be better taught by
  the friend and the pattern alone.
- **What happens to a returning player on day 1 of a new game?** The tutorial cannot be skipped
  because it is the game. At five to ten minutes that may be fine; a second game might still want
  a faster start.
- **Where does a "new game" live** without a menu? See §6.
- TODO(spec): §7.3's 🎁 rows (gifts, swaps, treats) wait on stash swaps and the treat tin; the
  per-customer "who they give to" list waits on those rows.
- TODO(spec): a witnessed chat should be put into words (§7.4); until chat topics and picture
  bubbles exist, every chat is its gist.
- TODO(spec): REGULARS-AND-SHOP-CHARACTER.md's taste-change lines wait on tastes changing at all.
- ~~How much does a disappointed customer tell you?~~ **Resolved (§7.3):** what they picked up
  and put back; never what they wanted.
