// The shop's shared mutable state.
//
// WHY THIS EXISTS: the previous split gave each module private ownership of a slice of the state
// and had the others import it. That is what made the graph circular — `pick` owned `aim`, `move`
// owned `mover`, `world` owned `cast`, and all three needed all three. Twenty-four import cycles,
// one of which was fatal: `yarn.js` read `FILL` from `items.js` while `items.js` was still
// evaluating `yarn.js`, which is a TDZ ReferenceError and a blank page.
//
// State that several layers touch lives HERE, in a module that imports nothing. Behaviour still
// lives with the thing it belongs to; only the data moved. Everything below is mutated in place
// (never reassigned) so importers always see the live object.

/** Every item on every display. An item's index here IS its instance index in every mesh. */
export const items = [];

/** The displays and chairs currently in the room, rebuilt by restart(). */
export const displays = [];
export const seats = [];

/** The movable pots and lamps. Built once and kept across days — see props.js. */
export const props = [];

/** The render-side record per NPC: body, pose blend, walk route. Parallel to world.npcs. */
export const cast = [];

/**
 * Where the player is aiming.
 *
 * `active` must PERSIST when the pointer wanders off a display, so a carried item keeps its drop
 * target. `hovered` goes null the moment the pointer leaves, which is what lets a floor grid hide.
 */
export const aim = { active: null, hovered: null };

/** The item in hand, and the gesture carrying it. */
export const drag = {
  index: -1, target: null, displayId: null,
  // Gesture bookkeeping, so one rule serves mouse and touch — see onPointerDown.
  downX: 0, downY: 0, moved: false, pickedThisPress: false,
};

/** Move mode's selection: which display or chair is being dragged, and whether it fits. */
export const mover = { m: null, sel: null, ox: 0, oz: 0, from: null, ok: true };

/** The shop's three clocks. */
export const clocks = {
  elapsed: 0,   // seconds since load, for anything that animates on its own clock
  auto: 0,      // seconds into the current round
  day: 0,       // seconds the shop has sat empty since closing
};

/**
 * The simulation, the calendar, and whether the panels need redrawing.
 *
 * `hudDirty` is how the sim tells the HUD something happened WITHOUT importing it. world.js used
 * to call drawDebug() directly, which made the model depend on the view and closed another cycle.
 * The frame loop consumes the flag.
 *
 * `pastBooks` is every finished day's Guestbook, oldest first, as { day, entries }. A world only
 * lives one day, and its guestbook used to go with it. `press` is a press on the book on the
 * counter ({ on: 'book' }) or on the bulletin board ({ on: 'board', uv }), handed to the view the
 * same way the dirty flags are: the pointer layer does not import the view.
 *
 * `dayT` is how far through today the shop is, 0 at opening to 1 at closing (see dayProgress in
 * visit.js). The light and the HUD clock both read it, so they cannot disagree about the hour.
 */
export const shop = { world: null, day: 0, dayT: 0, hudDirty: true, viewDirty: true, pastBooks: [],
  press: null };

/**
 * Mark the view stale rather than repainting from inside the mechanics.
 *
 * Two flags, not one, because they cost very different amounts: `view` is the grid lattice and
 * the held-item line, which change on every hover; `hud` is the whole NPC panel rebuilt as HTML,
 * which changes once a round. Sweeping the pointer must not rebuild the panel.
 */
export const touchView = () => { shop.viewDirty = true; };
export const touchHud = () => { shop.hudDirty = true; shop.viewDirty = true; };

/** Consumed by the frame loop, so a change repaints once rather than once per frame. */
const take = (k) => () => {
  if (!shop[k]) return false;
  shop[k] = false;
  return true;
};
export const takeViewDirty = take('viewDirty');
export const takeHudDirty = take('hudDirty');
