# Adding a species

Status: decided, 2026-11-06. The recipe for a new species kit, with a turtle as the worked example of what its
file would declare. The turtle now exists (`characters/turtle.js`, 2026-11-06); the tables below are the plan it
started from, and the built kit departs from them where the designer's references did (BODIES.md §Turtle). What a body is and how a kit may change it
(add or scale, never replace) is BODIES.md; this file is the checklist.

## 1. The recipe

1. Write `characters/turtle.js`. It imports what it needs from `npc.js` and ends with one `registerSpecies({...})`
   call. It exports nothing unless a test needs a helper (the lion exports its mane maths for `rig.test.mjs`).
2. Add one line to `characters/species.js`, after the others: `import './turtle.js';`. Every page, the store, the
   game and the tests import `species.js`, so that line is the only wiring. Append, don't insert: the registry
   order is `speciesIds()`, and seeded draws in the store sim (`pick(speciesIds(), simRng)`) and the fighter
   roster (`spinoff/fighter.js` `SPECIES`, the registry reversed, so the chooser shows the newest first) index
   into it, so inserting reshuffles every seeded cast. Appending changes them too (the list is longer); that is
   expected.
3. Run `npm run check:all`. The generic suites build the turtle at its defaults, at its random-range corners and
   at random draws (section 4).
4. Open the species checker (`characters/species-checker.html`), pick the turtle in **character → species**,
   and go through section 5.

## 2. The kit

### Required

| field | what | turtle |
|---|---|---|
| `id` | the registry key, lower case; saved fighters and checker slots store it | `'turtle'` |
| `label` | shown on name plates and NPC cards | `'Turtle'` |
| `emoji` | the fighter chooser's animal button (`spinoff/choose.js`) | `'🐢'` |
| `firstFur` | a new fighter's fur, one of the riot swatches in `spinoff/fighter.js` `RIOT` | `'#1fd18b'` (jade) |
| `defaults` | every param: `{ ...BASE_PARAMS, name, ...the kit's own }` | `name: 'Shelly'`, a short `tailLength`, `headYawMax` for a neck that tucks, the shell params |
| `randomRanges` | `{ ...BASE_RANDOM_RANGES, ... }`; a key the kit draws itself is filtered out (the lion's `DRAWN_AS_ONE`) | narrow `legHeight`, wide `torsoD` |
| `motionRanges` | `{ ...BASE_MOTION_RANGES, ... }` (BODIES.md §Owl/§Llama/§Lion for what each spring does) | a slow `stiff`, low `idleRate`, short `stride` |
| `headShape` | the head ellipsoid's three radii in `headRadius` (x across, y up, z forward) | `[0.90, 0.80, 1.20]`, a long low head |
| `buildKit(ctx, P)` | builds everything above the neck and whatever the kit bolts on | see section 3 |

### Optional

| field | default when left out | turtle |
|---|---|---|
| `gui` | no rows of its own; the base rows still show | `'head & face'`: beak, nostrils; `coat`: shell rows |
| `coatBulge(P)` | 0; how far a torso coat stands proud, so the arms clear it | `(P) => coatBulge(P, 'shell', 'scute')` if the shell is a scallop coat |
| `coatColorKey` | none: no coat colour, nothing derived or shared | `'scuteColor'` |
| `coatOf(fur)` | `deriveCoatColor`; the coat colour from the fur (the lion's is `deriveManeColor`) | the default |
| `presets` + `presetKey` | none; both or neither (`rig.test.mjs` checks the pair), the preset slider applies `presets[i]` | 6 scute layouts, `'scutePreset'` |
| `vary(P)` | none; the kit's own draws after the base draw, before the preset (the owl's tail clamp) | keep a long tail off the floor, as the owl's `shortenTail` |
| `randomise(P)` | `randomiseKit`: base draw, `vary`, a random preset, the coat colour. Write your own only when a draw must come in a different order (the lion: body, tail and snout before the preset, mane sides after) | the default |
| `paint` | no painterly look: `{ style: 'fur', accent: [materials with their own stroke size] }` or `{ style: 'ink', accent: [materials that fray] }` (BODIES.md §Painterly) | `{ style: 'ink', accent: ['scute'] }` |
| `delighted` | `POSES.delighted`; a cheer for a body whose arms don't read (the llama's ears, the lion's tail) | a head bob: `{ ...POSES.delighted, headPitch: -0.4 }` |
| `wingShape(P)` | none; the owl's wing ellipsoid, for craft-anim's hands | none |
| `gloveAnchors(built, hand)` | gloves on the hands; where the fight gloves go when the hands are buried, each glove at least `hand` across (the owl's wing tips) | none, unless the flippers swallow the hands |

## 3. The helpers

All in `npc.js`. Reuse them before writing geometry.

- `addHead(ctx, P)`: the head ellipsoid from `headShape`, in the body felt; first thing in `buildKit`. Its radii
  are then `ctx.headScale`, which `addEyes`, `addEars` and any shell on the head take as `head`.
- `addEyes(ctx, P, { head, squash })`: eyes seated on the head, and the face paint (BODIES.md §Eyes and ears).
- `addEars(ctx, P, opts)` / `addConeEars`: leaf or cone ears on the skull (BODIES.md §Eyes and ears).
- `addTail(ctx, P, { segments, dress })`: the sprung tail; `dress(node, i, len)` hangs the kit's geometry on each
  segment (BODIES.md §Tail). Every species has one; `rig.test.mjs` checks it clears the floor and the seat.
- Coats (BODIES.md §Coats): name the params `${coat}Rows`, `${coat}PerRow`, `${coat}Top`, `${coat}Bottom`,
  `${coat}Size`, `${coat}Flat`, `${coat}Proud`, `${coat}Stagger` (and `${coat}AutoSize`, `${coat}Touch` for a coat
  sized to touch; optional `${coat}Sides` for faceted plates, `${coat}Gap` for a bare front), and `addTorsoCoat(ctx, P, { on, coat, material })` lays the torso shell while `P[on]`,
  `coatBulge(P, on, coat)` is the kit's bulge, `coatSize(P, coat, shape)` sizes a shell on another part (the
  llama's neck ruff). For anything else, `scallopGeometry` + `scallopMesh`.
- `feltMaterial(P, colour)` through `ctx.addMaterial`, and `ctx.mat.<name>` so tests and paint can find it.
- `part(geometry, material, { pos, scale, rot })` over the shared `GEO` primitives; `named(...)` from `faces.js`
  for a part a test looks up by name.
- `applyPreset(P, kit, i)`, `randomPreset(P, kit)`, `randomiseBase(P, ranges)`, `randomiseKit(P, kit)`: the
  preset and randomise steps, for a kit that writes its own `randomise`.

The turtle's `buildKit`, in words: `addHead`; its shell and beak materials; eyes with `head: ctx.headScale`; a beak
on the front of the head (the owl's `addBeak` is the model, a shaped-faces variant under `P.shapedFaces`); no ears;
the shell as a torso coat of flat scutes (`flat` near `proud`, so a low `coatBulge`); a short tail through
`addTail`.

## 4. What the tests check

- `characters/species.test.mjs` registers a stub species (only the required fields, head, eyes and tail) and runs
  `faces`, `paint`, `face`, `craft-anim` and `rig` with it among the species. It also checks every kit has an
  emoji, a first fur and a three-radius `headShape`, that `randomise` derives the coat colour, and that every gui
  row names a real param in one of `GUI_SECTIONS`. When the stub was first added, the rig suite caught its
  base-length tail going through the floor on the shortest legs: a new species meets the same checks.
- The per-species tables are optional: a species without an entry gets the generic checks, not a crash.
  `faces.test.mjs` `OFF` (the face before shaped faces) and `CHECK` (what its shaped face must have),
  `rig.test.mjs` `SPREAD` (ear depth), `selfie.js` `SHOTS` and `FACE_SIZE` (fall back to `all`/0.55). Add the
  turtle's entries once its face is settled.
- `garments.test.mjs`, `walk.test.mjs` and the fighter tests loop over every species too; `spinoff/*.test.mjs`
  loop over `SPECIES`, so the turtle fights, wears every costume and holds every weapon in them.

## 5. In the species checker

Menus, top to bottom (`characters/species-checker.js` `buildGui`):

1. **character**: editing slot, species, name, randomise slot/all, link shared params, edit all slots at once (a trait row or preset changed on the
   editing slot goes to every slot whose species has it), reset, export.
2. **look**: the style switches (look-at, eye glint, painterly, shaped faces), then **paint**, its sliders named
   by paint style (`fur …`, `ink …`).
3. **body**, 4. **head & face**, 5. **coat**, 6. **tail**, 7. **rig**: the param folders. BASE_GUI's rows come
   first, then the kit's `gui` rows for the same section. A kit's `gui` is keyed by these section names
   (`GUI_SECTIONS` in `npc.js`); an empty section shows no folder.
8. **animation**: animate, idle and walk layers, the pose picker, **victory dances**, and the raw pose sliders
   in a closed **debug pose** (a kit may add rows there under `'debug pose'`).
9. **view**: view mode, match camera, look at partner, geometry detail, spacing, frame, 150px test, squint,
   exposure, tone mapping.

Look at, for the turtle: the 150px test and the silhouette view (it must read as a turtle as a flat shape); the
match camera (side on, as a fight sees it); painterly on, with the `ink …` sliders if its paint style is ink;
randomise all with link shared params against each other species (the slots should differ only where the kits
do); each victory dance (`delighted` if the arms vanish); the debug pose sliders at their ends for clipping.
