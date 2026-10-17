# Stage ideas

Everything here is `brainstorm 2026-10-16` unless marked otherwise.

A brainstorm of new stages for Donut Fighters (2026-10-16; ideas, nothing decided or built). The
rules these build on are in `REUSE-SPEC.md` (§Stages and difficulty are separate, §Mode, §Bad
guys, §Handicap); layouts are in `GENERATED-LEVELS.md`.

## What a stage is

A stage is a place with its own treat theme **and its own play rule** (§Stages and difficulty are
separate). Today there are two (decided 2026-10-14):

- **Breakfast:** a waffle floor, waffle-stack decks, a pancake hill. Syrup slows you down, and
  butter makes you slide past where you tapped.
- **Cake:** gingerbread with an icing top, a gumdrop tower. Every jump goes half as high again
  (spongy bounce), and icing trampolines launch you way up.

Layout is not part of a stage. Where the hills, gaps, choke points, step ups and high shelves go,
and how wide a river is, belongs to the level generator, which lays out any stage at any difficulty
(`generateStage(seed, difficulty, stage)`). So each idea below says what makes the place *play*
differently from breakfast and cake, and in one line, which knobs the generator would turn to vary
it.

Today's limits on what a stage can say (the `Stage` shape in `match.js`): one ground, then decks
and hills that are solid down to the ground; round patches of syrup, butter or trampolines; a
bounce factor; pre-placed bricks; the ring-out box. Nothing moves, there are no pits, and gravity
is one number for the whole game.

## Constraints every stage keeps

- **Small tablet screens.** The camera is about 7 units wide and follows your own fighter. A
  stage's rule has to read at ~150 px fighter height, and a hazard has to show on screen before it
  matters.
- **At most two move buttons.** 🥊 and 🦶. A stage never adds a button; its rule acts when you
  step on something, or is answered with a tap and a jump.
- **No reading.** Kids are 4–6. The rule has to be obvious from how it looks and sounds the first
  time it happens: a whistle, a rumble, a glow. Emoji only.
- **No waiting.** A hazard knocks you about or spills your donut, never takes you out of play.
  Falling off drops you straight back in, as everywhere.
- **Side-on camera.** The stage is a depth band seen from the front, so a hazard crossing the band
  reads best running front to back, and nothing tall hides the front third.
- **Colour riot for heroes, grey/black/dark purple for bad guys.** Scenery is loud and saturated;
  the reserved bad-guy colours never appear on a stage.
- **Deterministic and fair.** Every rule is plain arithmetic in the host's sim, keyed to the tick,
  so every tablet sees the same thing; layouts stay mirrored.

## The building kit

Every stage rule is built from what the sim already does, or from one of a few small additions
that several stages share.

**Already there** (decided 2026-10-14): *slow* (syrup), *slippery* (butter), *launch* (trampolines), *bouncy* (the
bounce factor), *breakable* (bricks), *up* (decks and hills), *out* (the ring-out box).

**Small additions,** each plain host-side arithmetic that crosses the network with the stage:

- **Push strip:** a strip that pushes whoever stands on the ground in it at a steady speed (a
  river, a conveyor, a turntable). Like syrup, it only acts on the ground, so jumping skips it, and
  route-finding can ignore it.
- **Timed patch:** any patch that is only on for part of a repeating cycle, counted in ticks from
  the start of the match. Before it switches on it warns for a second or two (a whistle, a rumble,
  a glow), so a kid has time to react.
- **Knock strip:** a strip that, while on, hits whoever stands on the ground in it like a big kick:
  knockback toward the front edge, and the carried donut pops loose. With a timer, this is the
  train.
- **Stage gravity:** gravity as a per-stage number like `bounce`, so a stage can be floaty. The
  route-finding's reach already comes from the physics.

**Big additions,** each worth a stage only if kids love it: things that really move around the
stage, floors you can stand under (floating platforms), and pits (more than one ground).

## The kids' five

The kids asked for a waterfall, flowers, a train, pizza and a restaurant. Each is dressed as
treats so the world stays whole (see the open question on that).

### Candy Train

- **Theme:** a candy railway across the table: licorice rails, a gummy train with lollipop
  wheels, a sugar-cube station.
- **Signature rule:** every 10 seconds or so a train crosses the band front to back. A whistle
  and a rumble come first, then the track is a knock strip for a second: anyone on the rails, hero
  or bad guy, is knocked flying and drops their donut. Jumping over it is safe. Luring a bad guy
  onto the tracks is the kids' trick.
- **Reuses:** knockback and donut spill from hits, ring-out.
- **Needs:** timed patch, knock strip. The train is only drawn crossing; the sim only knows the
  strip.
- **Art:** rails and sleepers, the train (a few carriages that slide across the band), a station,
  steam puffs, a whistle sound.
- **Cost:** small. A train that really runs along the stage pushing fighters ahead of it would be
  big.
- **Generator knobs:** how many tracks (one or two, mirrored), where they cross, how often the
  train comes.

### Chocolate Waterfall

- **Theme:** a chocolate fountain pouring down the back wall into a chocolate river, with
  marshmallow stones and wafer bridges.
- **Signature rule:** the river carries you. It's a push strip running front to back toward the
  front edge, so stand in it too long and you're washed off (a ring-out). Jump across, or use the
  stones and bridges.
- **Reuses:** ring-out, hills (stones), decks (bridges).
- **Needs:** push strip.
- **Art:** the falling chocolate at the back wall, a river surface that looks like it flows,
  splashes when a fighter lands in it.
- **Cost:** small.
- **Generator knobs:** how many rivers, how wide, how fast they flow, how many stones and bridges.
  (Merges Milkshake Rapids, which was the same river running sideways.)

### Frosting Garden

- **Theme:** giant buttercream flowers in loud colours, strawberry bushes, honeycomb, nectar
  puddles.
- **Signature rule:** flowers bloom and close. A flower head is a trampoline that only launches you
  while it is open; it opens and closes on a slow cycle, petals spreading as a warning. Catch a
  bloom and you fly; step on a bud and nothing happens. Honey is sticky (syrup).
- **Reuses:** trampolines, syrup.
- **Needs:** timed patch (on a trampoline).
- **Art:** flowers in two states (bud, open), petals opening, honey, bees as scenery.
- **Cost:** small.
- **Generator knobs:** how many flowers, how high they launch, how their cycles are staggered.
  (Merges Soda Geysers, Strawberry Patch and Beehive.)

### Pizza Party

- **Theme:** a giant dessert pizza (cookie base, chocolate spread, fruit "pepperoni") on a party
  table, pizza boxes as decks and fort pieces.
- **Signature rule:** the pizza spins. The round pizza in the middle is a turntable: a push strip
  whose push goes round in a circle, so standing on it carries you round to the other side. Ride
  it to get across, or get carried away from where you were going. Stringy cheese is syrup.
- **Reuses:** syrup, decks.
- **Needs:** push strip (its direction a formula of where you stand), a round floor drawn as a
  pizza.
- **Art:** the pizza and its toppings turning, boxes, cheese strings.
- **Cost:** small.
- **Generator knobs:** turntable size and speed, which way it turns, toppings as hills on it.
  (Merges Spinning Plates and Carousel.)

### The Restaurant

- **Theme:** a diner: counter, tables and stools, dessert cases as the shelves, a kitchen at the
  back.
- **Signature rule:** the kitchen doors swing. Swinging doors across the band are walls that open
  and close on a cycle: run through while they're open, or get bumped back when they swing shut.
- **Reuses:** bricks (a door blocks like one), decks (tables), hills (stools).
- **Needs:** timed patch on a wall. The catch is route-finding: it has to plan with the door's
  state, or wait at a shut door the way a fighter stands `blocked` at a wall today.
- **Art:** doors that swing, a kitchen hatch, diner booths, dessert cases.
- **Cost:** small new feature, with a route-finding catch.
- **Generator knobs:** how many doors, how long they stay open, tables as obstacles.

## More stages with their own rule

### Donut Shop

- **Theme:** the donut shop counter (the spec's "Look" lists it): trays of donuts, glaze drips,
  the fryer at the back.
- **Signature rule:** conveyor belts carry you along the band, each one toward its own team's
  shelf. Riding your belt home with a donut is fast; raiding against the enemy's belt is slow, so
  go round the back.
- **Reuses:** floors, hills.
- **Needs:** push strip.
- **Art:** belts that look like they move, donut trays, glaze. The game's namesake, so a good
  third stage.
- **Cost:** small.
- **Generator knobs:** how many belts, how fast, which lanes. (Merges Jelly Bean Factory.)

### Ice Cream Parlour

- **Theme:** ice cream scoops, waffle cones, sprinkle-dusted wafer mats, a frozen floor.
- **Signature rule:** everything is slippery except where it isn't. The whole floor slides like
  butter, and the wafer mats are the only grip. The opposite of breakfast, where butter is the
  patch: here you plan around the places you can stop. Later, scoops could melt into slow puddles
  as the match goes on (the stage changes over time), which would be big.
- **Reuses:** butter's grip rule.
- **Needs:** a stage-wide default grip, with grip patches.
- **Art:** a shiny frozen floor, scoops as hills, wafer mats.
- **Cost:** small.
- **Generator knobs:** how many grip mats and where, scoops as hills. (Replaces Sugar Snow Day.)

### Jelly Sea

- **Theme:** under a blue jelly sea: seaweed licorice, gummy fish, bubble columns.
- **Signature rule:** floaty. Gravity is low, so jumps hang in the air and fall slowly, and you
  can steer a long way while you're up. Bubble columns lift you while you stand in them. Different
  from cake: cake jumps go higher, jelly jumps go slower.
- **Reuses:** trampolines (a bubble column is a gentle one).
- **Needs:** stage gravity.
- **Art:** a wobbly jelly tint over everything, bubbles rising, seaweed.
- **Cost:** small.
- **Generator knobs:** gravity within a safe band, how many bubble columns.

### Kite Picnic

- **Theme:** a picnic blanket on a windy hill, lemonade, kites, a sandwich hill, gummy ants.
- **Signature rule:** gusts. Every so often the wind blows across the whole field from one side,
  pushing everyone, in the air too; bunting flaps first. Hide behind a deck or the sandwich to stay
  put. Unlike the ground strips, wind moves you mid-jump.
- **Reuses:** decks and hills (as shelter).
- **Needs:** timed patch, a push that also acts in the air, shelter (no wind behind a raised
  floor).
- **Art:** bunting and kites blowing, grass bending, a wind sound.
- **Cost:** small. Fairness needs the gust to switch sides each time.
- **Generator knobs:** gust strength and rhythm, where the shelter is. (Merges Picnic Blanket.)

### Cotton Candy Clouds

- **Theme:** a sky of pink and blue cotton candy clouds.
- **Signature rule:** floating clouds you can walk under and jump up through, then stand on top.
  The first stage where a raised floor isn't solid to the ground.
- **Reuses:** decks.
- **Needs:** floating floors: the floor model, the route-finding and the playability check all
  assume solid blocks today.
- **Art:** clouds at several heights, a far-below ground.
- **Cost:** big.
- **Generator knobs:** cloud count, heights and spacing.

### Cereal Sea

- **Theme:** a giant bowl of milk and cereal.
- **Signature rule:** the milk is a pit. Most of the stage is cereal islands with milk between
  them; fall in and it's a ring-out. Knock a bad guy into the milk and their donut spills for
  everyone to scramble for.
- **Reuses:** ring-out and spill, the `help` table's safety bounce.
- **Needs:** pits (more than one ground), route-finding that jumps gaps, and never walking a
  tapping kid straight in.
- **Art:** milk, cereal islands, a splash.
- **Cost:** big.
- **Generator knobs:** island size and gap width, how many. (Merges Fondue Pots.)

### Glow Party

- **Theme:** a dark room at a sleepover: glow-stick frosting, glowing sprinkles, lit doorways.
- **Signature rule:** you only see near light. Heroes, donuts and pickups glow; the stage is dark
  past a small circle round each light, so kids find their way by the lights.
- **Reuses:** every existing rule; this is mostly a drawing change.
- **Needs:** a dark scene with glowing heroes and pickups. Bad guys' grey, black and purple vanish in
  the dark, so they show as outlines or glowing eyes and stay readable.
- **Art:** glow materials, light pools, a dark backdrop.
- **Cost:** small to medium (drawing only).
- **Generator knobs:** how many lights and where, how big each pool of light is.

### Popcorn Machine

- **Theme:** inside a popcorn machine: a hot kettle floor, kernels everywhere.
- **Signature rule:** kernels on the floor pop on a timer, with a sizzle first, knocking anyone
  standing on them into the air (a timed hazard that launches instead of knocking back).
- **Reuses:** springs (the pop is a spring that switches on).
- **Needs:** timed patch.
- **Art:** kernels that puff into popcorn, a sizzle and a pop sound.
- **Cost:** small once the timed patch exists.
- **Generator knobs:** kernel patches and their rhythm.

### Night Bakery (sneaking)

- **Theme:** the bad guys' bakery after closing, lit by their flashlights.
- **Signature rule:** bad guys see in a cone, drawn as a flashlight beam (no reading). Get past
  without being caught in a beam and you reach their shelf; caught, they chase you.
- **Reuses:** shelves, bricks as cover. Pairs well with Glow Party's darkness.
- **Needs:** the computer bad guys first (brainstorm 2026-10-13, not built), a vision cone, and sneaking without a
  third button: walking slowly, or tapping only a short way ahead, counts as sneaking.
- **Art:** flashlight beams, hiding spots.
- **Cost:** big (needs the bad-guy AI).
- **Generator knobs:** how many guards, their patrol routes, where the cover is.

## Goodies (not stages)

Ideas for rewards and dress-up that came up alongside the stages. Looks only, like the punch and
kick strings; any real reach or power change is a gameplay decision for the `help` table.

- **Light sabers:** the glove's look during the punch string becomes a glowing saber.
- **Magic wands:** a sparkle trail on the punch.
- **Elaborate masks:** a reward on top of the hats (the hood is already half a ninja mask). Silly,
  never scary, for the 4-year-olds, and never in the bad guys' colours.
- **Popcorn and pretzels:** treats beside the donuts, in the shop or the bag. A pretzel stand could
  be a stage once it has a rule of its own.

## Dropped, and why

The rest of the earlier brainstorm was reskins: a new look on syrup, butter, trampolines or bricks
with no rule of its own (gingerbread farm, mushroom forest, hot chocolate springs, sugar cube
castle, cookie jar, tea party, liquorice blocks and others), or layouts (choke points, step ups,
high shelves, rivers of a given width), which are the generator's job. Holidays (birthday,
Halloween, Christmas, Easter) are dressings that could go over any stage, not stages; Halloween
would have to avoid black and purple. Volcano, bumper cupcakes and rollercoaster were the train's
rule again, and the sweet shop lift was the restaurant's.

## Suggested first

The **Candy Train** is the best first new stage: it's the kids' own idea, "jump now!" needs no
reading, it gives heroes a way to beat bad guys with the stage, and its two additions (timed patch,
knock strip) unlock the Frosting Garden and the Restaurant too. The **Chocolate Waterfall** is
next: the push strip it needs also makes the Donut Shop and Pizza Party.

## Progression is a separate question

Which stage a room plays next, and in what order, is not part of this doc. Two facts for whoever
picks it up: level 2 is planned as the building tutorial on breakfast (planned 2026-10-17,
`REUSE-SPEC.md` §Forts: Level 2), and breakfast is the tutorial stage (planned 2026-10-17); today ▶️
on the end card still replays whatever the page was opened on, and the host's `start` message
sends the level as data but carries no level number, which the sticker card will need.

## Open questions

**How far does the treat world stretch?** The game's world is treats, and each idea here dresses
the kids' places as treats: a gummy train, a chocolate waterfall, buttercream flowers. But the kids
asked for a train, not a gummy train. Would they rather see the thing they asked for, dropped into
the treat world (a toy train running across the breakfast table), and does it matter to them that
it's made of sweets?

**Should hazards hit your own team?** The kids' train idea is that bad guys on the tracks get
knocked off, and it's fun because it's a trap for them. If the train knocks heroes too, it's fair
and something to dodge; if it only knocks bad guys, it's a weapon. Friendly fire is off between
players, but the stage isn't a player. Which way round makes the better game for these kids?

**How much warning is enough?** The train, the flowers, the doors and the wind all act on a
timer. A 4-year-old needs to see it coming, understand it, and tap in time. A whistle and a rumble
a second or two ahead may be plenty at 6 and too little at 4. Should the warning time be a row in
the `help` table, so kids who need it get a longer warning, and would they see that as a label?

**Does every theme need its own rule?** The spec says each stage plays differently, not just looks
different, and this doc holds to that. It means a new sim rule for every new place a kid asks for.
Could a much-wanted place borrow a rule (an ice cream truck that is just cake's trampolines in a
new coat), and would kids notice or mind?

**Can a stage have two rules?** Breakfast already has two (syrup and butter), and cake two
(bounce and trampolines). Several ideas here pair a new rule with an old one (pizza's turntable
and stringy cheese). Is one new rule per stage the limit for this age, with the second always
something already met?

**How do you sneak without a button?** Night Bakery asks kids to sneak, but there are only two move
buttons and both are taken. Walking slowly, or tapping only a short way ahead, could count as
sneaking. Will a 4-year-old discover that on their own, or does sneaking need something they can
see, like their fighter crouching whenever it's moving slowly?

**Are goodies only looks?** A light saber that only changes how the punch looks is safe for
fairness. A saber that reaches further is far more exciting, but it changes who wins, and the
`help` table would have to balance it. Are rewards for showing off, or for getting stronger?
