# Visual Design — 2D

The flat, screen-space art: front door, loading and title screens, signage, lettering, emblems,
and anything drawn in SVG/CSS rather than rendered in the 3D shop. The 3D look (felted characters,
knitted garments, lighting, themes) lives in [P1-SPIKE-PLAN.md](P1-SPIKE-PLAN.md) and
[characters/VISUAL-DESIGN-FINISHED-OBJ.md](characters/VISUAL-DESIGN-FINISHED-OBJ.md).

Record the exact values and the reason for each, so the next screen can match without
re-deriving them.

---

## Principles

- **Diegetic first.** The 2D screens are objects from the shop's world (a door, a sign, a
  guestbook page), not app chrome. Same rule as the in-world Guestbook and bulletin board
  (DESIGN-DECISIONS.md §5).
- **Warm against cool.** Warm wood, brass and lamplight sit against a cool painted surround, so the
  thing to look at is always the warm thing.
- **Weathered, like the shop.** Wood and paint carry the interior's worn-wood texture, so the door
  belongs to the room behind it.
- **Inline SVG and CSS, no image files.** Crisp at any size, no load, no asset pipeline, and a
  loading screen that itself needs loading defeats the point.
- **No external fonts.** Display lettering is drawn as SVG paths; anything set as text uses a
  system stack. The screen never waits on a network font.
- **Quiet over busy.** Each surface does one job: the name on the frieze, the emblem on the
  glass, the note on the panel. Say a thing once.

---

## Palette

| Token | Hex | Used for |
| --- | --- | --- |
| wall | `#4a5d73` | clapboard around the entry; New England slate blue (not sage, which is not a New England house colour). Radial lifts to `#5a6f86` at centre; a 2px shadow line every 28px makes the boards |
| trim | `#f7f5ef` | white-painted trim: pediment, frieze, pilasters, casing. A touch warm, so it reads as paint, not paper |
| trim shade | `#ebe7dd` tympanum, `#e4e0d5` recessed casing, `#e6e2d8` pilaster edge, `#dcd7cb` / `#cfc9bb` / `#d3cdbf` hairline shadows | depth in the white surround: each step back is a shade darker |
| reveal | `#cfc2a6` | the door's jamb, seen when it swings |
| granite | `#9c9e9d`, lit edge `#c4c6c4` | the step, speckled with fine noise |
| post-it | `#fbe98a` → `#f1d462`, curl `#fbeea8` | the tip-of-the-day note |
| ink | `#2f4a7a` | handwriting on the note: blue ballpoint |
| maple | `#ddb987` | door leaf base colour |
| maple, panel | `#dfbd8c` field / `#c9a26f` surround | raised lower panel |
| wood shadow | `#a87c4c` / `#9e7442` | mouldings, lock rail, panel lower and right edges |
| wood highlight | `#f0d3a6` / `#f3d7ab` | moulding and panel upper and left edges |
| glow | `#ffcf86` | the lit shop inside; also the focus ring |
| glass | `#f6dcae` → `#e2a85f` | lamplit window, top to bottom |

### Brass

One gradient for every brass surface, lit from above:

| Stop | Hex |
| --- | --- |
| 0 | `#fbe9a3` |
| .35 | `#e0b64d` |
| .65 | `#b8862b` |
| 1 | `#7d5517` |

Round raised brass (the door knob, the note's needle ends) uses a radial version with its
highlight at (.35, .3): `#fff3c4` → `#e2b650` → `#a06d1e` → `#6a450f` (`#brassBall`). The emblem
no longer uses it: its ball read as a lit sphere, and the emblem is a flat plate.

**The emblem is an engraved flat brass plate** (`#plate`): flat `#e0b64d` (the gradient's .35
stop) with one gentle diagonal sheen, `#ecc764` → `#e0b64d` → `#cc9d3a`, in user space across
the drawing's bounds (113,551 → 302,718), so it is one piece of metal and does not restart per
needle, knob, tail or ball. No radial anywhere on it.

Brass is **raised**: a dark lip below (`#3b2408` at 55%, 2.5px down) and a bright lip above
(`#fff6d6` at 60%, 1px up). Without the lips it reads as yellow paint.

Engraved lines in brass (the emblem's yarn wraps and the ball's rim) are cuts: a dark line,
`#6a450f`, over a pale copy of the same line in `#fbe9a3` (the gradient's top stop) shifted down,
so the cut's lower wall catches light from above. Door: cut 2.5 units, lit edge .6 below. Nine
wraps (five across, four diagonal) plus a cut rim at r 57 inside the ball's r 58, so the ball
still parts from the needles on the flat plate. Full opacity; the old wraps were `#7d5517` at
75% over the shaded ball.

### Signal colours

The 3D shop's yes/no signals are `#25e06a` (fits) and `#ff2d16` (no room), at 0.85 alpha. They are
UI, not paint, so their materials skip tone mapping (`toneMapped = false`). The held item's halo
and the drop ghost share the green so the eye pairs them (STORE-SCENE.md §Drop feedback).

### Yarn colour words

A ball band's colour word comes from the drawn swatch's OKLCH (`YARN_PALETTE`), not its hue alone:
C < 0.03 is *grey*; L < 0.5 is *dark* (*brown*, *olive*, *navy*); L > 0.75 is *pale* (*peach* for red
and orange); C < 0.08 is *dusty* (*tan* for orange); otherwise the bare hue word.

---

## Type

- **Gold leaf** (the emblem, the frieze lettering) gets a dark keyline, `#4a2f0c`, from a dilate
  filter (`#keyline`), as a real sign writer outlines leaf. Raised brass (the knob, the note's
  needles) gets the two-lip emboss instead.
- **Handwriting** (the note): `"Bradley Hand", "Segoe Print", "Marker Felt", "Comic Sans MS", cursive`,
  in blue ballpoint ink.
- **Customers' hands: a handwriting per personality.** Anything a customer writes (the selfie
  thank-you line, PROJECTS-AND-AUTHORSHIP.md §4b) is in their own hand, so a regular's writing
  becomes recognisable: one more thing an attentive player learns. Real font files, unlike the
  house lettering, because no glyph table can fake five people's handwriting.

  | Their hand | Font (Google Fonts, OFL) | Feels |
  | --- | --- | --- |
  | Orderliness | **Patrick Hand** | neat, careful print |
  | Enthusiasm | **Gochi Hand** | loose, chunky, cheerful |
  | Openness | **Playwrite US Trad** | joined-up, flowing |
  | Withdrawal | **Shadows Into Light Two** | light, small, wispy |
  | everyone else | **Caveat** (weight 600) | relaxed marker |

  - **Which hand** is a pure function of the ten traits (CHARACTER-ATTRIBUTES.md): of
    Orderliness, Enthusiasm, Openness and Withdrawal, the highest, if it is 4 or more; ties go in
    that order; otherwise Caveat. Traits never change, so neither does a hand, and nothing is
    stored.
  - **Ink:** dark ballpoint blue `#1f2a5c` for every hand, darker than the note's blue so it
    reads on the polaroid's white. One ink: the hand is the tell, not the colour.
  - **Legibility floor:** at the polaroid margin the hand must hold an x-height of at least 7px
    on the 880px board canvas. Playwrite and Shadows Into Light are the ones at risk; if either
    fails, it keeps the full note on the label and the margin falls back to Caveat. A numeric
    check (`measureText` on the short line at margin size), not a screenshot.
  - **Self-hosted**, not loaded from Google: the game has no build step and should run offline.
    `fonts/` at the repo root, one latin-subset `.woff2` per family (about 20–60 KB each), each
    with its `OFL.txt` beside it as the licence requires, and all five listed in *About this
    game* with the open-source JavaScript. One `@font-face` stylesheet, `fonts/hands.css`.
  - **Canvas waits for the font:** the board awaits `document.fonts.load()` for a hand before
    painting a polaroid with it, so the first card never comes out in a fallback face.
  - **Only customers.** The shop's own writing (the Needle Tips note, the packing slip) stays
    the house lettering or the note's system hand, so a customer's hand never reads as the
    shop's.
- **The house lettering.** The Massachusetts "bookleaf" town line signs' highway sans (Mass. DPW,
  1930s on; the 1950 "Entering Woburn" sign is the reference) is the shop's display face, from
  here on, everywhere text is shown in the 2D art or painted into the 3D shop:
  - **Gold for large text:** the brass gradient over a dark `#4a2f0c` keyline (1.2 units at cap
    28). The frieze, the Customer of the Week headline, the info button's "i".
  - **Gold lettering paint is `userSpaceOnUse`, never the default `objectBoundingBox`.** A
    straight vertical or horizontal stroke (the `i`'s stem, I, L, T, E, H, F, `-`) has a zero-width
    or zero-height bounding box, and SVG paints nothing with a bounding-box gradient on one: the
    info button's "i" showed only its dot. `svgLettering(…, { gold: true })` strokes with
    `#letterGold` (`GOLD_DEFS` in `lettering.js`, put once per page), in cell units 0–28, so each
    glyph's transform gilds it top to bottom; the frieze's `#brassH` is userSpaceOnUse for the same
    reason. `#brass` stays for filled shapes. The canvas (`drawLettering`) has no bounding box.
  - **Black for small text:** `#1c1712`, no keyline. Captions, labels, anything under ~16px cap.
  - **Capitals.** Names and titles are uppercased to letter them; the one lowercase glyph is `i`,
    for the info button.
  - **One source:** `characters/store/ui/lettering.js`. Each glyph is one stroked centreline in a
    28-unit cell (cap 28, stroke 4.4, letter gap 7, word gap 18), with round dots for `.` `:` `!`
    `?` `i`. `svgLettering()` for SVG, `drawLettering()` for a canvas; both shrink a line to a
    `maxWidth` rather than overflow. A character with no glyph draws as a space, so a name never
    breaks the board.
  - 47 glyphs: A–Z, 0–9, `. , : ! ? - — ' / &`, and `i`. `lettering.test.mjs` checks every
    customer name and pattern title has its glyphs, and that LOCAL YARN STORE still measures the
    370 units the frieze was drawn at.
    - The first ten glyphs (L O C A Y R N S T E) are the frieze's originals, byte for byte, or the
    door's lettering moves. The lowercase `i`'s dot clears its stem so the keylines don't touch at
    the info button's cap 20.
- No font file: no system font has these letterforms, and a loading screen must not wait on one.
  - *Unverified:* the reference image could not be loaded, so the letters follow the general
    highway-sans model of the era, not a tracing of the sign. Check against the real sign and
    correct the glyph paths if they differ.
- **Where it is used now:**
  - **The frieze:** LOCAL YARN STORE, gold, the only place the shop's name appears.
    `dressExterior()` (`ui/exterior.js`) letters it into `#frieze`; `#brassH` spans the line so the gilding does not restart per letter.
  - **The bulletin board:** CUSTOMER OF THE WEEK in gold (cap 34); each polaroid's customer name in
    black (cap 15), and under it the customer's **short thank-you line in their own hand** (see
    "Customers' hands"), replacing the design's title, which moves to the label and the
    Guestbook with the needle size and fibres. NO PHOTOS YET in black on an empty board.
  - **The info button:** a gold `i` (cap 20 in a 24 box), lettered by `game.js`.
  - **The night's packing slip** (decision 25): all black — the supplier (cap 20), FOR and
    ARRIVES (cap 12), each line as quantity × item (cap 18) with its limits under it (cap 11, on
    two lines broken at a comma when long). See "The night".
- **Earlier wordmark, removed:** `L.Y.S` over a rule over italic *localyarnstore*, on the glass.
  It said the name twice and, with the emblem and the note, made the door too busy.

---

## The front door (`index.html`)

The game's front door and loading screen. The store page with its debug menus
(`characters/store.html`) stays as the playground; this is how a player arrives.

**One drawing, two pages.** The entry and the door live in `characters/store/ui/exterior.js`
(`exteriorMarkup()` for the SVG, `dressExterior()` for the lettering and worn wood, `swingOpen()`
for the swing) with their CSS in `exterior.css` beside it. `index.js` puts them on the front door;
`ui/night.js` puts them on the between-days screen. Change the door there, once.

**The entry**, in a 600x1110 drawing: an exterior door with white trim, modelled on the
Concord Museum's front entry (Concord, MA). **Charming, not civic** — the same vocabulary a
courthouse uses, held back:

- **Low pediment**, about 15° pitch: a white raking cornice around a faintly shaded tympanum.
- **Frieze board** under an overhanging cornice band, then a thin architrave. Each step gets a
  hairline shadow. The frieze carries the name, gilded, as the Concord Museum's does.
- **Wide flat pilasters**, 72 wide, with base blocks. A soft shade toward the inner edge; no
  flutes.
- **Recessed inner casing** one step in, in light shadow, framing the door. This step is most of
  what makes it look built rather than drawn.
- **Granite step**, the New England stoop.
- **Slate-blue clapboard** around it all, drawn in CSS.
- **Weathered paint:** the same worn wood at 45%, multiplied through every white board, tiled
  smaller (220 units). Old paint on old wood, so the trim is not a fresh white cut-out.
- **Grain runs along each board.** Upright on the pilasters and side casings; level on the
  cornice, frieze, architrave, head casing and tympanum; along the slope on each raking board of
  the pediment (15.6° off level). One rotated pattern per direction, clipped to its boards. A
  single direction everywhere was the first try, and level boards with upright grain looked wrong
  at a glance.

**What made earlier tries wrong**, so they are not repeated:

- *Steep pediment + dentils + fluted pilasters* read as a courthouse or a bank. Pitch and
  ornament are the difference, not the presence of a pediment.
- *An arched casing with a sunburst fanlight* was the wrong shape for this town's doors.

**Resolved: lettering on the frieze.** The name went on the frieze and came off the glass, so it
appears once.

**The door**, 360x830, set in the opening at (120, 300):

- **Classic shop door:** glazed top half, solid bottom half, light maple.
- **Worn wood:** the SAME texture as the shop's furniture: `paintWornWood` in
  `characters/store/scene/worn-wood.js` (grain, two knots, rubbed-pale patches, dents, needle and
  scissor scratches, fixed seed). Painted to a canvas by `dressExterior()` and multiplied over the maple,
  the way `room.js` tints it per stain. One tile stretched over the leaf and one over the panel;
  stretching runs along the grain, so it hides, and there are no seams.
- **Window**, 260x330, top half. It shows the shop lit inside: a warm glass gradient, a blurred
  low shelf with six skeins in yarn colours, and one diagonal glint.
- **On the glass, only the emblem:** two knitting needles stuck in a ball of yarn, with a loose
  tail; drawn at full size and scaled to 0.8, centred. An engraved flat brass plate, not a
  shaded ball: flat `#plate`, engraved wraps (see Palette), and the dark keyline (`#keyline`,
  1.2 units, `#4a2f0c`) as the plate's crisp edge, because a plate on glass has no depth to cast
  a shadow. Needles, knobs and tail are flat brass, edged only by the keyline. The name lives on the frieze,
  so the door stays quiet: emblem on the glass, note on the panel, knob.
- **Lock rail** at y≈418, a shadow line where glass meets panel.
- **One raised panel** below, bevelled: light edges top and left, dark edges bottom and right.
  Kept bare except for the note.
- **The tip of the day:** a yellow sticky note on the panel, tilted -4°, with a curled corner,
  pinned by a crossed pair of brass knitting needles. Headed *Needle Tips* (needle tips, twice
  over), one tip in ballpoint below. `#tip` is the text slot a rotating tip will fill. The first
  tip, at the beginning of the game, is the welcome: *"Come in, we're open!"* That replaced a
  hint line under the door, so the door carries its own invitation.
- **Brass knob** on a rounded backplate, right stile, at mid height (y≈410), with a keyhole below.
  Raised brass, unlike the gold leaf on the glass.

**Behaviour**

- The door is a plain link to the shop. The drawing itself now comes from script (it is shared with
  the night screen), so without script the page shows a plain link in a `<noscript>` instead.
- Clicking swings the leaf on its left hinge (`rotateY(-78deg)`, 1.1s ease) over the warm interior,
  then the page changes. Under `prefers-reduced-motion` the link just follows.
- A focus ring in the glow colour, for keyboard players.

**Layout:** the entry keeps its proportions and fills 90% of the screen height, or 96% of the
width on a narrow screen. Every layer is positioned in percentages of the same 600x1110 drawing,
so the interior and the swinging leaf always line up with the opening.

**Not yet:** it is not a real loading screen. Nothing loads behind it; it links to
`characters/game.html` (the game view, below). Once the game boots in-page, the door should stay shut while assets load
and open when they are ready.

---

## The night: between days (`characters/game.html`, `#night`)

When the last customer leaves, the game closes for the night and shows the shop's **exterior**: the
front door's entry, drawn from the same module (`ui/exterior.js`), full screen over the shop. It
will grow into the order screen; today it shows tomorrow's order read-only, on a packing slip. It **waits**: nothing
advances it but the player opening the door.

- **Arrival:** the screen fades in over the emptied shop, 0.9s ease (`@starting-style` on the open
  dialog). Leaving, it fades out over the new day the same way. No fade under
  `prefers-reduced-motion`.
- **Night:** an inset shade of `rgb(16 24 44 / .38)` over the clapboard, under the entry, so the
  wall goes dusky and the doorway stays lit like a porch. The glass stays lamplit: a night light.
- **The door is shut,** and the sticky note reads *"Closed — back tomorrow"* in the note's
  ballpoint, under the same *Needle Tips* heading. The shop says it is closed with its own note,
  not a banner.
- **Opening tomorrow is the door.** Click it, or Enter (it is a real link, and focused when the
  screen opens): it swings as on the front door (`swingOpen`), the next day starts, and the screen
  fades into the shop. No other button. Escape does nothing.
- **The parcels on the step** (decision 25; TUTORIAL.md §7.2): tomorrow's delivery waits on the
  ground to the right of the door, standing on the same line as the granite step. A 420x660
  drawing (`#parcels`): a tall carton on a flat one, each a front in kraft `#c89f6a`, a lit top
  `#ddb886` and a shaded side `#a9804f`, with a strip of parcel tape `#d9bb84` and a soft shadow
  where the top one sits; the door's drop shadow. Things are coming before a word is read.
  - **The packing slip,** `#fbf8ef` paper with the note's shadow (`#note`), taped to the top
    carton by four strips of yellowed clear tape `#efe4c4` at its corners. In the house lettering,
    black: *WOOL & CO. SUPPLY*, a rule, *FOR: LOCAL YARN STORE*, *ARRIVES: DAY N, MORNING*, a rule,
    then one line per slot as quantity × item (*6 × UNITS OF YARN*: units, not balls, since yarn also comes as skeins, cakes and cones) over its limits (*WORSTED OR DK,
    ONE COLOUR FAMILY*). **No checkboxes.** Words from `describeSlot()` in `inventory/supply.js`;
    the template's words, never an item's. The `×` is its own glyph in `lettering.js`.
  - **A slot that will be the player's** (`playerChoosable`) is lettered as its selection,
    underlined as the player's (`slipLine()`): *5 × SUPPLIER'S CHOICE* by default, with no limits
    under it, then the pick's own words (*5 × UNITS OF YARN* over *WORSTED, ONE COLOUR FAMILY*).
    A native `<select>` lies see-through over it after the quantity (pointer cursor, a faint wash
    on hover, a focus ring): *supplier's choice* (the planned slot arrives; on the handover nights
    it names that slot, *supplier's choice: 5 units of yarn, worsted or dk*) or that count of yarn,
    one-family yarn or patterns in a weight the line allows, or notions (`choicesFor()`). For now
    the counts are a seeded random split of the day's planned total, each line at least one.
  - The slip has an `aria-label` reading the same lines, since the lettering is paths.
  - The clipboard's foot line (*DAY N: 5 SIGNED THE GUESTBOOK*) went with it: a supplier's slip
    does not know who signed the book, which is the Guestbook's to say.
- **Why beside the door, not on it:** the lower panel already holds the note, and the window the
  emblem ("say a thing once"). Parcels are left on the step, by the door, not hung on it.
- **Layout:** the entry and parcels side by side, bottoms aligned, sized as 600 + 20 + 420 units
  of drawing: `--door-h: min(86vh, 94vw * 1110 / 1040)`. On a tall narrow screen (aspect under
  4:5) they stack, the entry at 56vh and the parcels under it.
- **A modal `<dialog>`:** the shop behind it is inert and its shortcut keys are ignored, with no
  script for either.
- *Unverified in a browser* at the time of writing: the fade, the slip's legibility at phone
  size, and the porch shade's strength.

---

## The corner stack and About (`characters/game.html`)

The game as a player sees it: the shop full screen, and no menus but the in-world Guestbook and
bulletin board. The test is how far "no menus" can be pushed; what survives is one stack of round
buttons in the top-left corner, folded into the door's emblem. `characters/store.html` keeps every
debug panel as the playground. Both boot through `characters/store/boot.js`; the game's entry is
`characters/store/game.js`.

**The stack**, top-left, 16px from the corner, a column with a 10px gap:

| # | Button | Does | Key |
| --- | --- | --- | --- |
| top | emblem | folds the rest out and back in (`aria-expanded`) | — |
| 1 | camera | reset and frame the camera | F |
| 2 | lock | lock the camera; latches (`aria-pressed`) | L |
| 3 | furniture | move mode; latches. The two turn buttons appear to its right in move mode, dimmed until something is selected | M, Q / E |
| 4 | speed | game speed, four states, each press the next: ▶ → ▶▶ → ▶▶▶ → ⏸. ⏸ is pause | Space steps, P pauses / resumes |
| 5 | info | opens *About this game* | — |

- **Top-left, not bottom-right** where the playground has its camera buttons: the Guestbook and
  photo open on the right, and the stack must never sit under them.
- **Folded by default.** The shop is the screen; the stack is one emblem until asked for.
- **Size:** 48px buttons, over the 44px minimum touch target; the emblem 58px, a size up, so it
  reads as the thing the others come out of.
- **Face:** white trim `#f7f5ef`, a soft radial from `#fff` at (40%, 30%) to `#e6e2d8`, so it is
  a painted knob, not a flat disc. The emblem's face is the door's lamplit glass instead
  (`#fbe7c0` → `#f6dcae` → `#e2a85f`), because the emblem lives on the glass.
- **Rim:** 3px of the brass gradient (the four stops above), painted under a transparent border
  (`padding-box` face over a `border-box` gradient). CSS only, no image.
- **Shadow:** `0 3px 8px` in `#3b2408` at 35%, the emboss's dark lip colour, so the buttons sit
  on the scene the way brass sits on the wood.
- **Icons:** 26px, 2px stroke, round caps, in the wall slate `#4a5d73`: the cool colour, so the
  warm brass rim is the thing that catches the eye. Drawn as inline SVG; the lock draws both
  states and CSS shows one by `aria-pressed`.
- **The speed button** draws all four states in one SVG and CSS shows one by `data-speed`: one,
  two or three filled play triangles, or two pause bars, in the same slate (filled, with the 2px
  round-joined stroke softening the points). Not latched, since it is a cycle, not a mode; the
  `aria-label` and `title` name the state and what the next press does ("Strolling. Press for
  double speed"). Space on the game page only: on the playground it advances a round.
- **Latched** (lock, furniture): the face turns to lamplight (`#fff1d6` → `#ffcf86` →
  `#e2a85f`) and the icon to `#4a2f0c`. On is lit, like the shop behind the door. Not the
  playground's orange `#c2703f`, which is not in this palette.
- **The emblem** is the door's emblem, copied exactly (needles, ball, wraps, tail, `#brass`,
  `#plate`, `#ball`), drawn at full size and framed by a viewBox in place of the door's translate
  and scale. The viewBox (`53 533 254 254`) is a square centred on the **ball** (180,660), not on
  the drawing's bounds: the tail is left out of the centring, so the ball sits dead centre in the
  round button (the user's call). The square is the smallest that clips nothing: the tail reaches
  x 305 with its keyline, 125 right of the ball's centre (the needle ends need only 112 above),
  so half is 127. The cost is size: 46px over 254 units, the ball is ~21px across. The earlier
  framing centred the bounds (`103.5 530.5 208 208`), which pushed the ball left and up.
- **One deliberate difference from the door: heavier engraving.** At 46px a unit is ~0.18px, so
  the door's weights vanish. The menu copy has cuts of 6 units (~1.1px), the lit edge 1.4 below,
  and its own keyline filter `#emblemKeyline`, 3.5 units (~0.63px), since `#keyline` (1.2) is
  shared with the info glyph. The geometry is otherwise identical to the door's.
- **The info button** is a gold `i` in the house lettering (see Type), on the trim face: a brass
  stem and a round brass dot over the keyline. It reads as part of the shop's signage, not an app
  icon. It replaced a serifed brass "i" drawn separately.
- **Unfolding:** each button slides out of the emblem (`translateY(-58px × place)`, scale .4 →
  1) and fades in, 240ms with a slight overshoot (`cubic-bezier(.3, 1.3, .5, 1)`), staggered
  30ms by place. Folding is 200ms with no overshoot. `visibility` flips after the fade, so a
  folded button is out of the tab order and the accessibility tree. Under
  `prefers-reduced-motion` there is no transition at all.
- **Focus:** a 3px ring in glow `#ffcf86`, 3px out, on `:focus-visible` only — as on the door.
- **The stack takes no clicks itself** (`pointer-events: none`, the buttons `auto`), so an orbit
  drag started in a gap still reaches the shop.

**The camera views.** The frame button's icon is a **view cube**: a little shop-box, 18px, in
CSS 3D, turned every frame to the camera's azimuth and elevation (`game.js`, `turnCube`). Front
(+z, the door's side) is lit `--glow` with a slate door mark; top is trim; sides are slate tints
(`#b7c2cf`, `#a3b0bf`, back `#8c9bb0`). It shows which way the player faces; it is not clickable
face by face.

- Clicking the frame button reframes, as before, and fans out two buttons beside it
  (`aria-expanded`), as the turn buttons sit beside the furniture button:
  - **frame with a down arrow:** the whole room from straight above, door at the bottom
    (`viewTop` in `ui/framing.js`);
  - **frame with a left arrow:** level from a side, the whole width and wall height in view; each
    press is a quarter turn round the room (`viewSide`).
- Both views step past the diorama's fences (the 0.42π polar limit and the 20-unit distance cap);
  the fences come back on the next orbit or reframe. The cutaway hides whichever wall the camera
  stands outside of, unaided.
- **Arrow keys** do the same, on both pages: ↑ frame, ↓ top-down, ← and → step round the sides.
- **Rejected: a clickable view cube.** Its faces are 15–20px on a 48px button, under the 44px
  touch minimum the shop is tuned for; 20 of its 26 views are useless here (the floor fence rules
  out everything from below); and it reads as CAD chrome, against "charming, not app chrome".

**About this game**, a native modal `<dialog>`:

- Trim face, 3px brass rim, 14px radius, `0 10px 30px` shadow; the world behind dims to the wall
  slate at 55%. Up to 520px wide, never wider than the screen less 32px.
- Title in italic Georgia 24px (the board's *Customer of the Week* face); body in the system
  stack. The ballpoint hand is for notes, not credits.
- **Credit:** Adrienne Bolger, © 2026, All rights reserved.
- **Open-source software:** every library and tool, with version, licence and link, in a list that
  scrolls inside itself (at most half the screen high) so the Close button is always on screen.
  Runtime from the import map (three.js and the four addons the shop loads); development from
  `package.json`. Versions and licences read from `node_modules/*/package.json` and the files' own
  headers, not from memory. A new dependency means a new line here.
- **Closing:** the Close button (a `method="dialog"` form) or Escape, both native. Focus returns
  to the info button. Shortcut keys are ignored while the dialog has focus.
- Links in the note's ballpoint blue `#2f4a7a`.

**What runs without a menu:** the timer panel is gone, so the shop plays itself. The two clocks
read `S.autoRounds` and `S.autoDay` (both on by default) instead of the playground's checkboxes,
which now write those values. On the game the speed button writes `S.autoRounds` (off is ⏸) and
the pacing (`gameSpeed` in `core/config.js`): rounds advance every `S.autoSeconds` once the last
walker has arrived, and `S.dayGap` after the last
customer leaves the game hands the changeover to the night screen (`onDayEnd` in `bootShop`); the
playground opens tomorrow by itself.

---

## The label

The ball band (TUTORIAL.md §7.1), in the house lettering: the heading drawn 300 units wide (150px)
at cap 26, ruled off like a printed ball band.

## The bulletin board

- Customer of the Week is the 4 newest selfies across all days, newest first, as tilted polaroids
  under the gold headline: the one place a photo shows without opening anything.
- Pressing a polaroid opens its photo; pressing anywhere else on the board opens the Guestbook.

## The selfie backdrop

- Every selfie rolls its own city skyline under a day, dusk or night sky, plus the ground they
  stand on. It is painted in 2D under the render, because the studio's tone mapping (ACES, 0.4)
  would mute a sky, and it uses the studio camera's horizon, so a lens tilted down shows mostly
  ground.
- The ground is quiet: low contrast, muted, fading out about 8 world units from their feet, and
  tinted by the sky (dusk warms, night darkens). It never pulls the eye from what they made.
- Skyline in frame: pavement. Looking down with no skyline: pavement, floorboards or lawn at random.

---

## Decision log

The front door, 2026-10-03, in the order it was decided. Kept so a later screen does not walk
back into a choice already tried and dropped.

1. **A door as the loading screen**, light maple, glazed top, solid bottom, brass knob. The store
   page and its menus stay as the playground; `index.html` is the front door.
2. **Emblem on the glass, not the panel.** The lower half is one bare raised panel, kept for the
   tip of the day.
3. **The tip of the day is a sticky note pinned by knitting needles,** headed *Needle Tips*. The
   pun is the point.
4. **Exterior door, white trim, Lexington and Concord architecture.**
   - Steep pediment, dentils, fluted pilasters: **rejected**, read as governmental.
   - Arched casing with a sunburst fanlight: **rejected**, wrong shape.
   - **Chosen:** the Concord Museum's entry. Low pediment, plain frieze, wide flat pilasters,
     recessed inner casing.
5. **Slate blue, not sage.** Sage is not a New England house colour.
6. **Weathered with the shop's own worn wood,** shared from `worn-wood.js`, not imitated. Grain
   runs along each board, including the slope of the pediment.
7. **Town-sign lettering** (Massachusetts bookleaf signs), still gold.
8. **The welcome goes on the note** (*"Come in, we're open!"*), not under the door.
9. **The name once, on the frieze:** LOCAL YARN STORE in town-sign lettering. L.Y.S and
   *localyarnstore* came off the glass, which leaves the door quiet: emblem, note, knob.

The corner stack, 2026-10-03:

10. **No menus but the in-world ones.** The game page has the Guestbook and the bulletin board,
    and one folded stack of round buttons; everything else stays on the playground.
11. **The stack folds into the door's emblem,** top-left, out of the way of the Guestbook on the
    right. Camera, lock, furniture, info, in that order: most used first, the credits last.
12. **Trim faces, brass rims, slate icons.** A latched mode is lit like the shop, not orange.
13. **About this game is a native dialog** with the credit and every open-source library, its
    version and licence read from the installed package, never from memory.
14. **Emblem: engraved flat brass plate, not a shaded ball.** The radial `#brassBall` made the
    yarn read as a lit sphere; a flat `#plate` with engraved wraps (dark cut, lit lower edge)
    reads as a brass sign. The menu copy is engraved heavier for 46px and centred on the ball.
15. **Camera views: a view-cube ICON, two plain buttons.** The frame button's cube turns with
    the camera to show orientation; top-down and side views are separate full-size buttons and
    the arrow keys. A clickable view cube was rejected: targets too small, too many dead views.

The night, 2026-10-03:

16. **Between days is outside, at night,** not a clipboard on the counter: the shop's exterior
    with the door shut and the note reading *"Closed — back tomorrow"*. It waits for the player,
    so it is also the pause between days.
17. **One exterior, shared.** The entry and door moved out of `index.html` into `ui/exterior.js`
    and `exterior.css`, used by the front door and the night screen; the front door looks and
    behaves as before.
18. **The door opens tomorrow.** No button: click or Enter on the door, which swings as it does on
    the front door.
19. **Tomorrow's order on a clipboard on a nail beside the door,** read-only, in black house
    lettering, an empty box for each slot that will be the player's. Beside the door rather than on
    it, so the door stays quiet and the sheet is big enough to read.
20. **The order shown is the order delivered:** built once at closing, handed to the next day.

The speed button, 2026-10-03:

21. **Speed and pause are one button,** ▶ → ▶▶ → ▶▶▶ → ⏸, after the camera, lock and furniture
    and before info. It replaced the planned separate pause button: one more round button, not
    two. ▶ is the default and a stroll. The break card on the counter will mirror ⏸.

Customers' handwriting, 2026-10-03:

22. **A handwriting per personality** for anything a customer writes: Patrick Hand (Orderliness),
    Gochi Hand (Enthusiasm), Playwrite US Trad (Openness), Shadows Into Light Two (Withdrawal),
    Caveat for everyone else. The hand is a tell, like their chat: learn a regular's writing and
    you know whose selfie it is before reading the name.
23. **The polaroid margin is the customer's, not the shop's:** name in house lettering, then their
    short line in their hand. The design's title leaves the polaroid; it was cap 10 and barely
    read anyway.
24. **Fonts are self-hosted with their OFL licences and credited in About,** five families, latin
    subset, no runtime dependency on Google.

The night order, 2026-10-03:

25. **A packing slip, not a clipboard.** Supersedes 19. Tomorrow's order is a packing slip taped to
    the parcels on the step (TUTORIAL.md §7.2): supplier's name, FOR: LOCAL YARN STORE, ARRIVES:
    DAY N, quantity × item lines, no checkboxes. A clipboard feels like you are supposed to do
    something with it; a packing slip says what is coming.
