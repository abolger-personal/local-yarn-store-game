# Store Scene

How the 3D shop (`characters/store/`) looks and handles: the camera, input, the room, light and
the props. Rules about what customers do live in characters/CHARACTER-VISIT.md, about displays in
inventory/DISPLAYS.md, about the 2D UI in VISUAL-DESIGN-2D.md. Code points here with
`STORE-SCENE.md §Section`.

---

## Camera

- **The establishing shot.** The game opens on the whole shop, from past the cut-away right wall,
  looking 18° down: the bulletin board and the Guestbook counter on the left, the back wall on the
  right. Solved from the user's 2000×1141 reference screenshot (`SHOP_ASPECT`, `view.test.mjs`).
  A narrower screen backs off along the same line, keeping the Guestbook and the back-left corner
  in frame; on a portrait phone the board's near corner may be cropped. The Guestbook opens with
  the view, so day 1's Former Owner can't be missed.
- **Default framing (F, ↑, the frame button)** stands the camera inside the shop. Distance is set
  so one slot is about 56px tall (`TARGET_SLOT_PX`; above the 44px touch minimum, which a diorama
  angle foreshortens to ~34px), not by how much room shows: a place you stand in, not a diagram.
  Shallow elevation (eye vector 0.30, 0.62, 0.82) so labelled faces read, not shelf tops. Zoom out
  is a pinch. `frameRoom(at)` can frame one display (the puzzle bench does).
- **Plan and side views:** ↓ looks straight down at the whole room, door side at the bottom; ← / →
  are quarter turns round the sides, level, full width and wall height. Both lift the orbit limits
  and fit with a 1.08 margin (`FIT`); the next orbit or reframe restores them. The cutaway still
  hides the wall nearest the camera.
- **The fence:** polar angle at most 0.42π, so the camera never drops level with the floor (below
  it, the culled near walls would show the outside of the box). Distance 2.5–20: beyond ~1.3× the
  whole-room fit the shop stops reading as a diorama. Panning stays on the floor plane
  (`screenSpacePanning = false`) so the shop can't be dragged off screen.
- **Mouse:** left button is the player's verb, right-drag orbits, middle dollies (the same mapping
  as inventory/stash-and-stuff.html). **Touch:** one finger is the verb or the camera (see Input);
  two fingers pinch-zoom and pan, never rotate, like every map on a tablet.
- **Camera lock (L):** for tablets where stray drags orbit. Disables OrbitControls entirely,
  zoom included; pick-up and place are unaffected.
- **Keys:** a held key acts once (no auto-repeat). Shortcuts are ignored while typing in a field
  or inside an open dialog.

## Input

- Each gesture has one owner, decided by the first finger down: the player's verb when stock, the
  Guestbook or the bulletin board is under it, or something is already in hand; otherwise the
  camera, so dragging bare floor orbits on touch.
- Extra fingers during a player gesture never reach the camera.
- Up to 8 CSS px of movement (`TAP_SLOP`) is still a tap; more is an orbit drag, not a click.
- Grab slack is 44 CSS px for touch (the Apple/Material minimum), half that for a mouse.

## Pick and place

- Mouse and touch share one rule: the press previews, the release commits. No long-press timer.
- Releasing on the pickup without moving keeps the item in hand, so drag-and-drop, click-click
  and tap-then-press-adjust-lift all work.
- The pointer picks the display and the level together, from the nearest in-bounds plane, so the
  exposed front strip of a lower shelf is selectable.
- The camera never jumps while carrying. The aimed display stays chosen when the pointer wanders
  off, so the drop target persists.

## Held item

- Drawn 1.08× its shelf size, with a pulsing halo, because a finger covers it. The halo is a
  BackSide box (no post pass), padded in world units rather than scaled, so it reads "held", not
  "bigger". The pulse is mostly opacity and peaks fully opaque.
- With a mouse it hovers just over its drop point under the pointer (`MOUSE_HOVER` 0.03). On touch
  and pen it lifts along screen-up by `S.liftHeight` (~0.30) so the finger doesn't hide it; tune
  per device.
- Its contact shadow stays under the pointer on the plane, so it reads "lifted off", not "badly
  placed".
- A held item is out of the simulation (inventory/DISPLAYS.md §Stock).

## Drop feedback

Three outcomes:

- **Fits:** a green ghost on the target slot, in the target's footprint, so a turned drop is
  previewed. Same green as the held halo, so the eye pairs them (VISUAL-DESIGN-2D.md §Signal
  colours).
- **No room on this display:** a red wash over the whole level, drawn through the stock at 0.5
  opacity. A wash reads "no"; a solid block reads broken. Never red away from the pointer.
- **Otherwise:** "no room here — click puts it back".

## Grids

- Floor grids show only while hovered, or while they are a carried item's drop target. Shelf and
  table grids stay on. The game hides the floor lattice entirely (a lattice across open floor
  reads as a bathroom; the drop ghost shows where an item lands); the playground keeps it.
- The aimed level is drawn `#5e2408` at full opacity, other levels `#6f6456` at 0.6.
- "Show grid" and the hover highlight are one decision.

## Move mode

Displays, chairs and props move by one verb (inventory/DISPLAYS.md rule 10 for where they may go).

- A latched mode on **M**, with `aria-pressed`, not a modifier chord.
- Click to pick, click to place. A tap on a fresh pickup keeps it in hand; a drag drops it. With a
  piece in hand every press aims it; a press on bare floor deselects and orbits. The grab keeps
  its offset from the pointer.
- Entering move mode puts back any held stock. Esc, leaving the mode, or a new day puts back a
  piece still in hand.
- A blocked pose shows red where it is; setting it down there sends it home.
- The piece stays selected after it is set down, its footprint shown.
- Turn buttons are a fixed cluster: hidden outside move mode, dimmed with nothing selected so the
  cluster keeps its width. **Q / E** do the same. A held piece stays put while the pointer goes to
  the turn buttons.

## Room

- 9.6 × 7.2, walls 2.6 high. The door is 1.2 × 2.0, generous enough to read as a door for
  1.0-tall customers and the 1.33 llama.
- Shop exposure 0.6, brighter than the character studio's 0.4, because the shop is a lit room.
- **You never see the outside of a wall.** Any wall between the camera and the room is hidden
  (the Sims / Two Point cutaway), and the camera fence keeps it above the floor. A hidden wall
  still casts its shadow, through a merged invisible stand-in on the sun's shadow layer.
- **Cosy by its building, not its decor.** Decor is what finished objects become, so the room gets
  warm materials and good light and nothing a knitted thing should later stand in for. Sage
  plaster `#b7c09c` above a cream tongue-and-groove wainscot `#eee2c8` to a 0.9 chair rail; honey
  oak floorboards. All painted canvases, seeded, no image files.
- **The bulletin board** hangs on the left wall over the signing spot, high enough to clear a peg
  board: 1.76 × 1.12, from 1.24 to 2.36 up the wall, scaled 1.6× so its photos read from the
  default camera.
- The counter (with the Guestbook) and the Drop Off area are still blockout markers.
  TODO: real diegetic objects NPCs animate against (LYS.md 5c).

## Daylight

- The shop opens on a bright morning and closes on a cosy late afternoon; the light follows
  `shop.dayT` between two authored looks (a lerp, not a sun model).
- The sun is the key light and comes in through the **windows**: high from the back-left in the
  morning, lighting more than 70% of the floor; low and amber from the back-right in the
  afternoon, so the walls shade most of the floor and the sun lands in pools through the windows,
  3–30% of the floor (`checkSunPools`).
- The afternoon sun is low enough (sunDir y 0.30) that the back wall's shade reaches the front
  wall, so no strip of sun lands by the door that no window explains.
- **Windows:** the back and right ones catch the afternoon, the left one the morning. Three on the
  back wall, with a shelf and a pot in the piers. The afternoon pools fall on open floor between
  the reading corner and the tables. Kept clear of authored furniture and the bulletin board; the
  player may still push furniture in front of one.
- **Lamps** are off through the morning and come up over 0.45–0.8 of the day. Only floor lamps
  carry a point light (warm, reach 3.2, no shadow map), because every point light costs on every
  lit pixel; the counter lamp's shade glows but lights nothing. All shades share one glowing
  material.
- The shown light eases toward the hour (time constant 1.2s), so a round's jump in `dayT` drifts
  rather than steps; the overnight reset eases too, as a short dawn.

## Shadows

- One key-light shadow map whose box is the room's half-diagonal plus the wall tops.
- Customers use blob shadows: one instanced draw for the whole cast, no second shadow pass,
  offset away from the key light.

## Furniture and materials

- **Farmhouse, not flat-pack:** rounded milled boards, lathe-turned legs and spindles, shaped
  panels with routed edges.
- Every piece of furniture is merged into one mesh per material: one draw call.
- **One worn-wood texture for everything,** shared with the front door: the shop is not new, so
  grain, two knots, rubbed-pale patches, dents and needle scratches. Painted near-white and tinted
  per stain: honey `#d4a575` tables, shelves and counter top; darker `#b27c51` chairs; walnut
  `#97653f` counter body. UVs are laid in metres along the grain, so it reads at one scale on a
  spindle and a counter top.
- **Wall shelves** have no plinth: the back panel (tongue-and-groove, moulded cap, curved end
  panels) carries them from the floor. A tilted level carries its own board and a lip along its
  low edge, so stock reads as resting, not sliding off.
- **Tables** are farmhouse tables: thick rounded top, apron with a bead, four turned legs.

## Chairs

- The third kind of place a customer occupies, after a display's standing spot and the counter.
  Working on a WIP in the shop needs a chair.
- The chair count is a live control: positions are authored for the largest count and taken from
  the front.
- Seat 0.22 high (about one chibi leg), 0.34 wide. The back is raked and stands behind the seat,
  because seated bodies reach past the cushion (`rig.test.mjs`). `seatLift` (0.01) is the only
  chosen sink; the rest of the sit is measured per body (CHARACTER-VISIT.md §Sitting).
- Deliberately bare: a cushion or a blanket is a finished object's job, so the chair says where
  they go (`userData.cozy`).

## Props

- Pots and lamps are furniture the player arranges in move mode. Unlike displays and chairs they
  are built once and kept across days: a pot put by the window is still there tomorrow.
- Bare on purpose, and each says where a knitted thing would go (`userData.cozy`): a cosy round
  the pot, a cover over the shade. Lamp bases are broad ceramic drums because a knitted cosy is a
  tube and needs a fat plain cylinder to go round.
- **Plants** grow from a seed: one of bush, snake plant, cactus or trailing; the seed picks leaf
  count, height, lean and green. Greens jitter off one anchor per form (DESIGN-DECISIONS.md §7).
  Leaves are lumps, not cut-outs. Same seed, same plant, every load.
- **The authored seeds and spots:** the opening shop shows four different forms (snake plant,
  bush, trailing, and the cactus on the counter). Only one floor corner is potted, leaving the
  others free for a moved shelf or chair. Spots are clear of displays, chairs, windows and the
  door's swing.
- The counter's lamp and pot are part of the counter and don't move on their own.
- Pots and lamps are refused on the counter and on displays; customers walk round them.

## Stock rendering

- Notion boxes are labelled on all four sides and the top (the camera orbits and looks down). A
  hook or needle's mm size is on every face and a top corner, because size is what the player
  arranges by. The illustration sits above the size strip, never over it.
- An item at rest sits where it touches down on what's under it, not at its grid layer.
- An item's index in `items[]` is its instance index in every instanced mesh (boxes, labels, yarn,
  band, tail, shadow).

## The shop clock

The HUD clock runs 10:00 at opening to 17:00 when the last customer leaves, in 15-minute steps
stretched across the day, so it always agrees with the light (`shop.dayT`).

## The puzzle bench (`puzzle.html`)

- One customer and one display, with a reveal switch on every fact the sim knows. It exists to
  answer SPIKE-FUN.md's open question: how much should the player know about why a customer left
  without what they needed?
- Default: the Guestbook shown; traits, taste, projects and the shopping list withheld, so
  everything about the person is inferred.
- "Hand it to them" is the "suggest a project" verb.
- Verdicts come from `visit.js` and `wip.js`, so the bench can't flatter the game.

## Open questions and TODO

- TODO: the room shell is a blockout. DESIGN-DECISIONS.md wants a static shell with baked AO and no
  real-time shadow map.
- TODO: the painting code in `scene/displays.js` is a copy of inventory/stash-and-stuff.html's;
  extract it into inventory/.
