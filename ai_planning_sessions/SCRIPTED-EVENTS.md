# Scripted Events

One standard data and code structure for anything the game PRESCRIBES rather than rolls: the
tutorial first, and later holidays, a visiting dyer's trunk show, a knit-along, a destash swap
(SPIKE-FUN.md D8). A **new game** starts with a list of scripts; the tutorial is the first.

"Prescribed" in the sense CHARACTER-VISIT.md already uses it: the sim's random choices, overridden
for a reason.

---

## TLDR

**A script is data: a list of beats. A beat is a trigger and a list of actions.** A small
interpreter (one module) checks triggers at a few fixed hook points in the day and runs actions,
each of which calls code that already exists: spawn a customer, seed an item, write the counter
note, set tomorrow's order. Characters in a script are **roles** ("the friend"), generated once
and remembered by the game. Adding an event is writing data, not code, unless it needs an action
that does not exist yet.

---

## 1. The shape

```js
// A script: a name, and its beats in order.
{
  id: 'tutorial',
  roles: {
    // Generated when the script starts, remembered for the rest of the game.
    friend: { skill: 1, crafts: ['knit', 'crochet'], patience: 'friend', keep: true },
  },
  beats: [
    { when: { dayStart: [1, 3] }, do: [
        { cast: 'friend' },                                         // first in the queue, every tutorial day
    ] },
    { when: { dayStart: 1 }, do: [
        { seed: { pattern: 'potholder' }, on: 'table', facing: 'friend' },
        { seed: { yarn: 'for:potholder', count: 1 }, on: 'floor' },
        { note: "Shelves sell. Floors don't." },
    ] },
    { when: { bought: 'friend', what: 'potholder' }, do: [
        { returns: 'friend', after: 2, with: 'potholder' },         // lands on day 3
    ] },
    { when: { dayEnd: 1 }, do: [
        { order: [{ yarn: 6, family: true }, { pattern: 2 }] },     // tonight's order screen
    ] },
    // ...
  ],
}
```

Plain JS objects in a module, not JSON: comments are allowed, and a test can import and check it.
Frozen, like the other data tables.

### Triggers (`when`)

A small fixed set, each read at one hook point:

| Trigger | Fires | Hook |
| --- | --- | --- |
| `dayStart: n` or `[from, to]` | as day n (or each day in the range) opens, before customers arrive. A range repeats the beat each day | `restart()` |
| `dayEnd: n` | as day n closes, before the between-days screen | the day-end hand-over |
| `arrives: role` | a role's NPC walks in | the door, on entry |
| `bought: role, what?` | a role buys something (optionally a kind) | the BUY in `visit.js` |
| `signed: role` | a role signs the Guestbook | `signGuestbook` |
| `returned: role` | a role comes back with a finished object | the return |
| `after: beatId, days?` | another beat has run (optionally n days ago) | any of the above |

Calendar triggers (`dayStart`, `dayEnd`) for things that should happen on a date; event triggers
for things that should happen because of what the player did. The tutorial uses both: day 1 is a
date, the return is a consequence of a purchase.

### Actions (`do`)

Each is a thin call into existing or already-planned code. The set grows only when a script needs
something new.

| Action | Does | Calls |
| --- | --- | --- |
| `cast: role` | puts the role's NPC in today's arrivals, first in the queue | `spawnCast` / the roster |
| `seed: item, on, facing?` | places an item: `on` a display kind or `'floor'`, optionally on the display a role will face | `addItem` / `placeFrom` |
| `note: text` | writes the counter note (Needle Tips) | the counter note (new) |
| `say: role, text` | a speech bubble | speech bubbles (new) |
| `order: slots` | sets the order shown on tonight's screen and delivered tomorrow | `buildOrder` / `deliver` |
| `hand: n` | how many of tonight's order slots are the player's | the order screen |
| `returns: role, after, with` | schedules a return with a finished object | the return schedule |
| `unlock: thing` | a new object or system appears (hold shelf, break card) | per thing |
| `photo: role` | pins the role's selfie to the bulletin board | `photo.js` / `board.js` |

### Roles

A role is a name for a character the script cares about. Its entry says what has to be true of
them (skill, crafts, patience) and the rest is random, so every game's tutorial friend is
different and the same person throughout (TUTORIAL.md). The interpreter generates the NPC the
first time the role is needed and stores `role → npcId` in the game state.

- `keep: true` exempts them from roster eviction (DESIGN-DECISIONS.md, roster retention).
- A role can be referred to by any later beat, and by later scripts: a holiday event could send
  "the friend" a card.

### State

Per game, saved with it: which beats have run (a beat runs once unless it says `repeat`), the
role map, and each script's start day. Nothing else. Everything a script does lands in the normal
world state, so no system has to know it was scripted.

---

## 2. How it fits what exists

- **The order script moves in.** `SCRIPT` in `inventory/supply.js` is already a per-day list of
  order templates. It becomes the tutorial's `order` actions on `dayEnd` beats. `supply.js` keeps
  `resolveOrder`, the templates and the procedural supplier tail; a day with no scripted order
  falls through to the supplier, as day 11+ does now.
- **One interpreter module,** pure where it can be: deciding which beats fire is a function of
  (state, event) and is testable in node. Running an action needs the store, so the action table
  lives with the store code and the decision logic does not.
- **Hooks are few and named.** Day start, day end, arrival, buy, sign, return. Each calls one
  function, `scriptEvent(kind, detail)`. No script logic lives in `visit.js` or `world.js`
  beyond that call.
- **The playground** (`store.html`) runs no scripts by default; a debug option can start one at
  any day, which is how a script gets tested without playing through the days before it.

---

## 3. Rules for scripts

Scripts inherit the game's rules; writing one does not suspend them.

1. **Pace:** a script never makes a slow player lose progress. Every beat that asks something of
   the player has a fallback (TUTORIAL.md rule 2). An event trigger simply waits.
2. **No menus:** a script speaks through the channels in TUTORIAL.md §2: the note, speech
   bubbles, the Guestbook, objects.
3. **No money** (LYS.md). No action counts or scores.
4. **Additive:** a script adds to the world. It never deletes the player's stock, moves their
   furniture, or rewrites a fact the player has learned (NEAR-MISS §7).
5. **Roles over hard-coded characters.** A script names what a character must be, never which
   character.

---

## 4. Build order

1. **The data shape and the trigger decision**, pure, with a test: given a script and a stream of
   events, which beats fire, once each.
2. **The hooks:** the six `scriptEvent` calls.
3. **The first actions the tutorial's day 1 needs:** `cast`, `seed` (with `facing`), `note`,
   `order`. The counter note itself is new.
4. **Move `SCRIPT` out of `supply.js`** into the tutorial script.
5. **The rest of the tutorial's actions** as their systems exist: `returns`, `photo`, `hand`,
   `unlock`, `say`.

---

## Open questions

- **Can two scripts run at once?** The tutorial and a holiday on day 8 would both want the
  counter note. Proposal: yes, with the later-started script's note winning for that day.
- **Do event triggers need conditions** beyond the role and the kind ("bought a pot holder kit
  with the yarn the player placed")? Start without; add when a script needs one.
- **Where does a script's text live** if the game is ever translated? Inline for now.
- **TODO:** the friend role (a `keep` NPC, first in the queue) and the day-3 beat are still
  hard-coded in `store/sim/world.js`, not scripts; knitting at home (B2) in general. (Today: the table nearest
  the door, `openTutorial` in world.js.)
