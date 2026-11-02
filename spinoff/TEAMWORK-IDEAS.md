# Teamwork ideas

Every idea here is `brainstorm 2026-10-17`: nothing is decided or planned. The rules these build on
are in `REUSE-SPEC.md` (§Lobby, §Multiplayer, §Forts, §Mode: donut capture the flag, §Scoring,
§Team powers, §Bad guys, §Handicap).

## What made joining a room work

The playtest's teamwork came before the match. A host and a guest got two tablets into the same
room. One kid tapped 🏠 and their tablet showed four treats. The other kid read those treats off
the first screen, or heard them said aloud, tapped the same four on their own 🔑 keypad, and then
the two waited for each other in the lobby until the host tapped ▶️. It works because:

- **Each kid holds half.** One tablet has the information (the code), and the other has the
  action (the keypad). Neither can finish alone.
- **They have to look or talk.** The code is on the *other* screen, so a kid leans over and
  points, or says "donut, cupcake, cookie, cherry".
- **The shared goal is clear.** Get into the same game. Nobody has to explain why.
- **Success shows on both tablets.** The newcomer pops onto the lobby floor with a cheer on every
  screen at once.

The ideas below try to give a moment those same four things. They use only taps, pictures, 🥊 and
🦶, with no reading. They **add to** the lobby flow rather than change it: 🏠 / 🔑 / treat code /
▶️ is decided (2026-10-14, amended 2026-10-16: "my 4 year olds understood the flow
immediately"). Nothing below blocks a start or adds a step to joining. A kid playing alone on
▶️ outside a room just never sees these.

What exists to build on: the room code (`ROOM_TREATS`, `codeHtml` in `roster.js`), the lobby floor
where everyone stands at the same `standingSpots` on every tablet, the newcomer's cheer
(`delighted` in `lobby.js`), `room.send` / `room.on` for any small lobby message, the end card
and ⏸ card showing the code, and every tablet's own camera in a match.

## Between tablets

### Thumbs up in the lobby ★ (brainstorm 2026-10-17)

- **What:** a guest in a room gets 👍. Tapping it makes their fighter on the lobby floor hold up a
  big 👍 on every tablet, and when everyone has one, the host's ▶️ starts to bounce.
- **Kid sees and does:** you're in, you tap 👍, and your fighter thumbs-up on your friend's screen
  too. The host sees all their friends' thumbs and taps ▶️.
- **Why two kids:** the host holds the start, and the guests hold "we're ready". It's the lobby's
  "waiting for each other" turned into something both screens show.
- **Cost:** small. One `ready` lobby message through `room.send`, a pose or a picture over the
  fighter, and a CSS bounce on `#go`. The build round already plans "every hero taps 👍"
  (§Forts), so this is the same signal one screen earlier.
- **Conflicts:** none if ▶️ still works without it. The host can start whenever they like, as
  decided. "A screen never shows both ▶️ and 👍" holds, because only guests get 👍 and only the
  host has ▶️.

### Everybody cheer the same ★ (brainstorm 2026-10-17)

- **What:** in a room, three cheer pictures (say 🙌 💃 🎉). Tap one and your fighter does it on
  every tablet. When everyone in the room picks the same one, they all do it together with a burst
  of sprinkles.
- **Kid sees and does:** a kid taps 💃 and their fighter dances on every screen. The others shout
  "do the dance!" and copy it, and the whole floor dances.
- **Why two kids:** you match a picture that is on your friend's screen. It only pays off when
  everyone agrees, which takes looking and talking.
- **Cost:** small. One `cheer` message, poses from the existing species animations (`delighted`
  and friends), and the burst from `fx.js`. A pure "everyone matches" check.
- **Conflicts:** it adds buttons to the in-room bar beside 👋 and ⏳. They're pictures, so this
  isn't a rule clash, but the bar gets busier.

### Lookout on the hill ★ (brainstorm 2026-10-17)

- **What:** a fighter standing on top of the middle hill or tower gets a zoomed-out camera on
  their own tablet that shows the whole stage.
- **Kid sees and does:** you climb the pancakes and your screen pulls back. You see the bad guy
  heading for your shelf and shout "he's coming!"
- **Why two kids:** the lookout has the information (where everyone is), and the kids on the
  ground have the action. It's the room code again: one screen knows, the other has to hear.
- **Cost:** drawing only, and local to that tablet: `stage.frame` already fits a camera to a box,
  and "standing on the hill" is a floor lookup the sim already does. Nothing crosses the network.
- **Conflicts:** none. It gives the hill a job beyond the middle third's open ground.

### Two pads open the gate (brainstorm 2026-10-17)

- **What:** a candy gate in a fort or across a shortcut stays open only while two teammates stand
  on two pads, far enough apart that they're on different screens.
- **Kid sees and does:** your pad lights up and the gate shows half a glow. You can't see the other
  pad, so you call "stand on yours!" and the gate swings open on both tablets.
- **Why two kids:** each kid holds half of the action, out of sight of each other.
- **Cost:** medium. Pads are round patches like syrup (`Stage` data). The gate is a brick that's
  solid or not depending on a "both pads stood on" check each tick. The playability check would
  need to treat the gate as closed, so it can only be a shortcut.
- **Conflicts:** §Scoring says every top must be reachable by one kid, so the gate can never be the
  only way to anything.

### Buddy picture ★ (brainstorm 2026-10-17)

- **What:** at the start of a match, heroes are paired. Each tablet shows its buddy's fighter
  in a corner frame, and tapping the frame walks you to them.
- **Kid sees and does:** "Who's my buddy? You're my buddy!" Kids find each other across the room
  by matching the picture to a fighter on a friend's screen.
- **Why two kids:** each tablet shows who the *other* kid is looking for.
- **Cost:** small. Pairs come from the sorted roster ids the way `standingSpots` works, so every
  tablet agrees with no message. The frame is a still of the fighter, and the tap is a fighter
  target (see the handoff below). With an odd number of heroes there's one group of three.
- **Conflicts:** none. It pairs naturally with the handoff and catching the spill (In-match
  teamwork), which give a buddy something to do.

### Fort plan in pieces (brainstorm 2026-10-17)

- **What:** in the build round, each hero's tablet shows faint outlines of where *their* blocks
  would make a fort shape (a gate, a tower). The whole shape only shows up when everyone builds
  their part. A finished shape glows and gets a bonus, such as the mixed-wall toughness.
- **Kid sees and does:** you see three ghost blocks your friend doesn't, and they see different
  ones. "Mine go here!" When the last block lands, the whole thing sparkles on every screen.
- **Why two kids:** the plan is split across tablets, like the code.
- **Cost:** medium, after the build round exists. The ⬇️ outline is already in that plan (§Forts),
  and the shape is a small table of grid cells dealt out by sorted ids.
- **Conflicts:** §Forts says "Nothing forces teamwork; the kids find it" for building. A plan is a
  nudge, not a force: kids can ignore the ghosts and still build anything.

### Pick by standing (brainstorm 2026-10-17)

- **What:** a team choice, such as which fort plan to build or which team hat to wear for the
  match, is made by walking your fighter onto one of a few big pictures on the floor. It's chosen
  when every hero stands on the same one.
- **Kid sees and does:** three pictures on the deck. Everybody runs around arguing, and the picture
  lights up when you're all on it.
- **Why two kids:** you can't choose alone, and you can see on your own screen where everyone is
  standing.
- **Cost:** medium. It's tap-to-move, so it works in the build round, where the sim already runs.
  In the lobby, fighters stand still at `standingSpots`, so it would need movement there. A team hat
  would be one known `HAT` entry, so `readFighter` still lets nothing new in from the network.
- **Conflicts:** the heroes' shelf is "a colour riot of their own fighters" (§Scoring), and kids
  love their own look. A team hat sits on top of their own fighter, and only for the match.

### Count it up together (brainstorm 2026-10-17)

- **What:** on the end card, the team's banked donuts drop onto the shelf one at a time, and each
  tablet makes its own kid's donuts pop bigger.
- **Kid sees and does:** "I got three!" "I got five!" Kids compare screens.
- **Why two kids:** each tablet holds a different part of the same total.
- **Cost:** small. Bank events already name the fighter (`donutEvents`, `kind: 'bank'`), so the
  host only needs to keep who banked each donut.
- **Conflicts:** it could read as a ranking. §Handicap's rule is "help may be visible if it looks
  like a power, never like a label", so this should celebrate everyone's donuts, never sort them.

Already in the spec, in the same spirit: **team powers** (§Team powers). A teammate's power rings
on your screen, and joining within 2 s takes looking or a shout of "now!".

## In-match teamwork (guarding and raiding)

Coordination inside the fight itself, on top of the guard rule (decided 2026-10-16). These still
need two kids, but the job is on the stage rather than between screens. Built today: tap to move
and tap a thing, 🥊 🦶 and the punch string, grab and bank, the one-donut bag, the guard, foes
solid and teammates not, bricks, ring-out. Not built yet: the power bar, team powers, CPU raiders
(only the dummy), the build round, passing (the power bar table counts passes, but nothing says how
a pass happens).

### Roles

#### Guarding fills the bar (brainstorm 2026-10-17)

- **What:** while a foe is near your shelf, standing guard fills your power bar a little.
- **Kid sees and does:** you stand at home with a bad guy nearby, and your icing donut fills up.
- **Why two kids:** staying home pays too, so the kid who guards isn't left behind on powers while
  the raider gets all the hits and banks.
- **Cost:** one row in the power-bar fill table once the bar exists. `guarding()` is already
  computed.
- **Conflicts:** none. It fits "heroes fill from giving", since guarding gives the team its
  donuts back.

### Handoffs and passes

#### Tap a teammate to hand over ★ (brainstorm 2026-10-17)

- **Follow-on if kids can ever drop a donut on purpose** (planned 2026-10-18, user): today only bad guys are held to
  "one donut at a time" (REUSE-SPEC.md §Scoring: a dropped donut still loose blocks its dropper's next grab), because a
  kid can only lose a donut to a hit. A voluntary drop (a handoff, putting one down) would let a kid farm a shelf the
  same way, so decide then whether kids follow the rule too.

- **The Greathammer too, later** (brainstorm 2026-10-18; left out of 0.0.6, user): handing the hammer over would
  use the same tap. Open then: does it fly back to its first owner or whoever holds it, and can a kid who
  hasn't beaten level 4 hold it?

- **What:** when two teammates meet and one of them tapped the other, a donut moves from the full
  bag into the empty one.
- **Kid sees and does:** you tap your friend. Your fighter runs to them, and the donut hops from one
  bag to the other with the grab's arc. It works whichever of you tapped and whichever of you was
  carrying.
- **Why two kids:** it's a relay. The raider stays at the bad guys' shelf with an empty bag and
  keeps grabbing, while the runner carries each donut home. That is home and visitor again, but on
  offence.
- **Cost:** small. In the sim, a fighter target already walks you beside that fighter (`thingGoal`
  → `besideGoal`) and teammates already overlap. The picker (`pickTarget` in `controls.js`) only
  picks foes today, so it needs teammates as well. The handoff itself is a few lines next to
  `touchDonuts`, plus a `pass` donut event for the bar. One sim test.
- **Conflicts:** none. The bag still holds one donut. The power bar's "passes a donut ↑↑" row
  finally gets something to count.

#### Hand it to the guard and it's banked (brainstorm 2026-10-17)

- **What:** a donut handed to a teammate who is guarding your shelf goes straight onto the shelf.
- **Kid sees and does:** the runner taps the guard, the donut hops over, and it lands on the shelf
  at once. The guard never has to leave their spot.
- **Why two kids:** the guard isn't just standing there any more. Every donut that comes home goes
  through them, so staying feels like a job that matters.
- **Cost:** free once the handoff exists. A guard stands where `standingAt` banks, so
  `shelfStep` banks the passed donut on the next tick.
- **Conflicts:** none.

### Protecting a teammate

#### A buddy catches the spill (brainstorm 2026-10-17)

- **What:** when a carrier gets hit, the donut that pops out lands in a nearby teammate's empty bag
  instead of on the floor.
- **Kid sees and does:** two friends run home side by side. A bad guy hits the one carrying, and
  the donut arcs into the other one's bag. You keep going.
- **Why two kids:** carrying alone is risky. Carrying with a buddy beside you is safe, so an escort
  becomes a job with an obvious reward.
- **Cost:** small. In `drop` (called from `strike`), look for a teammate within about a step who
  has an empty bag and give the donut to them. Same for both teams, so bad guys escort too.
- **Conflicts:** §Scoring says "any hit pops the carried donut… as a pickup". The donut still
  leaves the bag, but nobody can scramble for it. That rule would need an amendment if this is
  chosen.

#### Assist sparkle, made bigger (brainstorm 2026-10-17)

- **What:** the assist already in the power-bar table (hitting a bad guy who is attacking a
  teammate) also knocks that bad guy further than a plain hit.
- **Kid sees and does:** a bad guy is pounding your friend. You run in and kick, there's a
  sparkle, and the bad guy flies.
- **Why two kids:** the best hit in the game is one that saves a friend.
- **Cost:** small once a CPU bad guy that attacks exists. "Is attacking a teammate" means the
  bad guy's current `attack` has one of your teammates in `hit`, or did recently. That's one more
  multiplier in `strike`.
- **Conflicts:** none. It adds to the brainstorm assist row.

### Combined actions

#### Two on the guard knocks them clear (brainstorm 2026-10-17)

- **What:** two teammates who both hit the same guard within about a second launch the guard much
  further than one kid can.
- **Kid sees and does:** one kid alone shoves the guard a little, and it walks back. Two kids
  punching together get a big BAM and the guard sails off the deck, so the shelf is open.
- **Why two kids:** it's the guard rule from the raider's side. One kid keeps the guard busy, and
  the second arrives and finishes it.
- **Cost:** small. In `strike`, if the target was hit by a different teammate within N ticks
  (one stamp on the fighter: who hit it last, and when), multiply the knockback.
- **Conflicts:** §Team powers says CPU bad guys never combine, and §Bad guys says two CPU bad guys
  never chase one kid. So this should be heroes only, and grownup bad guys only if wanted. It
  would also make a ring-out much easier for a played bad guy who guards, which interacts with
  their `help -0.5`.

#### Two-kid brick break (brainstorm 2026-10-17)

- **What:** two teammates kicking the same fort piece within a second break it outright.
- **Kid sees and does:** a tall wall. Two kids kick it together and it crumbles.
- **Why two kids:** it mirrors the mixed-colour wall bonus (§Forts), so building and smashing both
  pay more with a friend.
- **Cost:** small, using the same "who hit last, when" stamp on the brick in `hitBrick`.
- **Conflicts:** none. Every piece can still be smashed by one kid.

#### Boost: jump off a teammate's head (brainstorm 2026-10-17)

- **What:** a teammate standing still is a step you can jump onto.
- **Kid sees and does:** your friend stands by the wall. You tap the top of the wall, run up onto
  their head, and hop over.
- **Why two kids:** one kid can't reach, and two can.
- **Cost:** medium to high. A head would have to count as a floor in `supportAt`, route-finding
  would have to plan with a moving step, and the network and drawing would need it too.
- **Conflicts:** §Scoring says every top must be reachable by one kid. So a boost can only be a
  shortcut, never the only way up.

### Dividing space

#### Two shelves per team (already brainstorm 2026-10-16, §Mode)

- **What:** a team has two shelves, so one guard can't cover both.
- **Why two kids:** one guard per shelf. The kids split the deck between them.
- **Cost:** the sim already finds shelves by team. `shelfOf` would need to become "the nearest
  shelf of that team" for grab, bank and guard.
- **Conflicts:** none. It's listed here because, of all the ideas, it creates the most guard work
  for the least new rule.

### Signalling without words

#### Shelf alarm (brainstorm 2026-10-17)

- **What:** while a foe is standing at your team's shelf, the shelf flashes on every teammate's
  screen, and its edge marker pulses when it's off screen.
- **Kid sees and does:** you're out raiding and home starts flashing red. You run back.
- **Why two kids:** the kid at home and the kid away both see who needs to be where. Without it,
  a raider never knows that home is being robbed.
- **Cost:** drawing, plus one snapshot bit per shelf. `standingAt(foe, shelf)` already answers the
  question.
- **Conflicts:** none.

#### Guard glow (brainstorm 2026-10-17)

- **What:** a fighter who is guarding gets a visible look, such as arms out or a ring on the floor
  in the team's colour.
- **Kid sees and does:** you stand at home and your fighter shows it's on duty. A teammate can see
  that home is covered and go.
- **Why two kids:** "I've got home" is said without words.
- **Cost:** drawing only. `guarding()` is already computed. The arms spreading is already a
  brainstorm from 2026-10-16.
- **Conflicts:** none.

#### Teammate footprints and call markers (already brainstorm 2026-10-13, §Team powers)

The spec already shows each teammate's tap target as a footprint. With handoffs, a footprint on
*you* means "I'm coming to you": the plainest "here, take it" there is.

### CPU teammates

None of the above needs a person on both ends, but the spec has no CPU heroes, only CPU bad guys.
Two things could fit:

- **The bad guys use these too.** Handoff, catching the spill and two shelves work the same for both
  teams, so the CPU state machine can use them. For example, Run home could hand to the Defend bad
  guy. Kids would *see* the bad guys relay, and that shows them how.
- **A CPU buddy for a kid alone** would be the same state machine on the heroes' side, roughly
  "Defend at home, take handoffs, follow the kid otherwise". That's new, and it's in the open
  questions.

## Top picks

1. **Thumbs up in the lobby.** It's the smallest addition, and it's the room-joining moment made
   longer: both screens show "we're ready" without touching the decided ▶️ flow.
2. **Everybody cheer the same.** Matching a picture on a friend's screen, with a payoff everyone
   sees. It's one message plus poses that already exist.
3. **Lookout on the hill.** One screen knows and the others have to hear. It's drawing only,
   local to one tablet, and works in matches as they are today.
4. **Tap a teammate to hand over.** The best in-match one: it turns raiding into a relay, and
   it's the only way the power bar's "passes ↑↑" row can fire.
5. **Buddy picture.** No network message, and it gives every kid one other kid to find and
   look out for. It makes the handoff and catching the spill easy to discover.

## Open questions

- **Do the kids sit together, or across the house?** Every idea in "Between tablets" assumes
  they can see each other's screens or hear each other, as they did when joining. If they're
  usually in different rooms, shouting still works (the lookout, the gate), but matching a picture
  on a friend's screen (the cheer, the fort plan) doesn't.
- **Should guests' 👍 ever hold back ▶️?** As written, ▶️ always works and the thumbs are only
  information, so the decided flow is untouched. A kid host might well tap ▶️ the moment the first
  friend lands, before a second friend is in. The late-joiner rule catches that friend next round,
  so waiting is a nicety, not a fix.
- **How much choosing can a team of 4-year-olds manage?** "Pick by standing" and the cheer only
  finish when *everyone* agrees. With six kids, one who won't move can hold the team up, and for
  the cheer that's harmless (nothing waits on it). For a fort plan or team hat, it may need a way to
  stop waiting, such as the build round's "hold 👍 to start now".
- **Should a hero's tablet ever show something a grownup bad guy can't?** The fort plan and the
  lookout give one team information. A grownup playing a bad guy sits in the same room and could
  just look. That's fine for a home game, but it decides whether these are hero-only.
- **Should a pass be something a kid asks for, or something that just happens?** As written, a
  pass happens when one teammate taps the other. A looser version would hand over any time a
  carrier and an empty-bagged teammate touch, which a 4-year-old would find by accident. But then
  kids running together would swap donuts back and forth without meaning to, and the bar would
  credit passes nobody chose.
- **Is losing the scramble worth safe escorting?** "A buddy catches the spill" means a hit carrier
  with a friend nearby never drops anything. The fumble scramble (§Scoring: "a real tactic, like a
  fumble in football") would happen less often. You'd be trading that for a reason to run in
  pairs.
- **Should a kid alone get a CPU teammate?** Today the spec has CPU bad guys only, and a lone hero
  is handled through `help` and the donut margin. A CPU buddy would let a kid alone learn the
  relay, but every between-tablets idea needs a second person anyway. It's also a second AI to
  tune for fairness, and with a buddy the kid could just let it do the work.
- **Should ganging up count for grownup bad guys too?** §Team powers lets two played bad guys
  combine powers. If two grownups can double-hit a kid who is guarding, that kid gets launched off
  their own shelf. Heroes only is the gentle choice. Symmetric rules are easier to learn by
  watching.
