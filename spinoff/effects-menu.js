// ?debug_menu=1 on the dress-up page: sliders down the left for an effect, on the fighter, which punches on a loop
// (choose.js). Rolls recipes from ROLL (fighter.js) with whatever the menu fixes; a recipe it copies pastes into EFFECTS
// through fromRecipe. Loaded only in this mode.
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { EFFECT, ROLL, fromRecipe, recipeText, rollRecipe, upgradeRecipe } from './fighter.js';

// each motion slider runs past ROLL's range on purpose: the menu is for finding what the dice never reach
const RANGES = {
  life: [0.3, 3], turn: [0, 20], drift: [0, 4], ease: [0, 1], spreadAlong: [0.3, 8], spreadAcross: [0.3, 8], twist: [-3, 3], stream: [0, 1],
  arc: [-2, 2], amplitude: [0, 1], frequency: [0, 6], grow: [-1, 6], hue: [-1, 1], rise: [0, 1], flicker: [0, 1],
};

const IN_MIDDLE = 'every bit starts in the middle';
/** Why a motion slider does nothing with this effect on these hands, or '' when it does something. The sword, the scythe
 * and the hammer are all blades (fighter.js): an effect stays on the tip, so what shapes a glove's flight (spreading along
 * it, twisting round it, bending it) does nothing there; spreadAcross spreads round the tip, and stream leaves the bits
 * along the swing, and then drift sends them on. */
const IDLE = {
  drift: (s) => s.blade && !s.stream && `${s.blade} until stream lets its bits go`,
  spreadAlong: (s) => s.blade || (s.middle && IN_MIDDLE),
  spreadAcross: (s) => s.middle && IN_MIDDLE,
  twist: (s) => s.blade || (s.middle && IN_MIDDLE),
  stream: (s) => s.one && 'there is only one bit',
  arc: (s) => s.blade,
  amplitude: (s) => s.blade,
  frequency: (s) => s.blade || (!s.amplitude && 'amplitude is 0'),
  rise: (s) => !s.blade && 'only a sword\'s, scythe\'s or hammer\'s effect rises off it',
};

/** What the look sliders fix in a roll. */
const fixed = ({ look, motion }) => ({ ...motion, finish: look.finish, family: look.family, shape: look.shape, accent: look.accent, layout: look.layout,
  count: look.count, bit: [Math.min(look.smallest, look.biggest), Math.max(look.smallest, look.biggest)], reach: look.reach });
/** The recipe on the fighter: the one pasted, or the seed's with the sliders' settings. */
const recipeOf = (m) => m.state.pasted ?? rollRecipe(m.look.seed, fixed(m));

function show(m) {
  m.state.recipe = recipeText(recipeOf(m));
  m.gui.controllersRecursive().forEach((c) => c.updateDisplay());
  greyOut(m);
}

/** Greys out the motion sliders that do nothing now, saying why when hovered. */
function greyOut(m) {
  const { bits } = recipeOf(m);
  const hands = m.hands(), blade = hands !== 'gloves' && `on the ${hands} the effect stays on the tip`;
  const s = { blade, one: bits.length < 2, middle: bits.every((b) => b.at.every((v) => v === 0)), amplitude: m.motion.amplitude, stream: m.motion.stream };
  for (const [k, c] of Object.entries(m.sliders)) {
    const why = IDLE[k]?.(s) || '';
    c.disable(Boolean(why));
    c.domElement.title = why;
  }
}

/** A look slider moved: the seed's bits again, with the new setting. */
function rebuild(m) {
  m.state.pasted = null;
  m.apply(fromRecipe(recipeOf(m)));
  show(m);
}

/** A recipe's main shape and accent; for a pasted one without them, its first bit's shape, and twinkles if it has any. */
function shapesOf(r) {
  const shape = r.shape ?? r.shapes?.[0] ?? r.bits[0].shape;
  return { shape, accent: r.accent ?? (shape !== 'twinkle' && r.bits.some((b) => b.shape === 'twinkle') ? 'twinkle' : 'none') };
}

/** The look sliders for recipe `r`: what it was rolled from, or for a pasted one without that, what its bits show. */
function lookOf(r) {
  const rs = r.bits.map((b) => b.r), { shape, accent } = shapesOf(r);
  return { finish: r.finish ?? 'flat', shape, accent, count: r.bits.length, layout: r.layout ?? 'ball',
    smallest: r.bit?.[0] ?? Math.min(...rs), biggest: r.bit?.[1] ?? Math.max(...rs), reach: r.reach ?? Math.max(...r.bits.flatMap((b) => b.at.map(Math.abs))) };
}

/** Every slider from a new roll of the seed, or from `from` (a pasted recipe). */
function load(m, from) {
  const r = from ?? rollRecipe(m.look.seed);
  Object.assign(m.look, lookOf(r), { family: r.family ?? m.look.family });
  for (const k of Object.keys(m.motion)) m.motion[k] = r[k] ?? EFFECT[k];
  m.state.pasted = from ?? null;
  m.apply(fromRecipe(recipeOf(m)));
  show(m);
}

function lookFolder(m) {
  const f = m.gui.addFolder('look (rebuilds)'), again = () => rebuild(m);
  f.add(m.look, 'seed', 0, 999999, 1).onFinishChange(again);
  f.add(m.look, 'finish', ROLL.finishes).onChange(again);
  f.add(m.look, 'family', Object.keys(ROLL.families)).onChange(again);
  f.add(m.look, 'shape', ROLL.shapes).onChange(again);
  f.add(m.look, 'accent', ROLL.accents).name('accent (some bits, small)').onChange(again);
  f.add(m.look, 'layout', ROLL.layouts).name('starting layout').onChange(again);
  f.add(m.look, 'count', 1, 24, 1).name('bits').onChange(again);
  f.add(m.look, 'smallest', 0.005, 0.4, 0.005).name('smallest bit').onChange(again);
  f.add(m.look, 'biggest', 0.005, 0.4, 0.005).name('biggest bit').onChange(again);
  f.add(m.look, 'reach', 0, 0.8, 0.01).name('start width').onChange(again);
}

function motionFolder(m) {
  const f = m.gui.addFolder('motion (live)');
  for (const [k, [lo, hi]] of Object.entries(RANGES)) {
    m.sliders[k] = f.add(m.motion, k, lo, hi, 0.01).onChange((v) => {
      if (m.state.pasted) m.state.pasted[k] = v;
      m.retune({ [k]: v });
      m.state.recipe = recipeText(recipeOf(m));
      greyOut(m);
    });
  }
}

function recipeFolder(m) {
  const f = m.gui.addFolder('recipe');
  f.add(m.state, 'recipe').name('now');
  f.add({ copy: () => navigator.clipboard?.writeText(m.state.recipe).catch(() => {}) }, 'copy').name('📋 copy recipe');
  f.add({ paste: () => {
    const text = prompt('paste a recipe');
    try { if (text) load(m, upgradeRecipe(JSON.parse(text))); } catch { /* not a recipe */ }
  } }, 'paste').name('📥 paste a recipe');
}

/**
 * @param {{ apply: (effect: { parts: Function }) => void, retune: (motion: object) => void, hands: () => string }} hooks `apply` puts a
 *   new effect on the fighter; `retune` changes how the one on it moves, without rebuilding it; `hands`: what it's holding (HANDS)
 */
export function effectsMenu({ apply, retune, hands }) {
  const gui = new GUI({ title: '✨ effect' });
  Object.assign(gui.domElement.style, { left: '0', right: 'auto', top: '0', maxHeight: '100vh', overflowY: 'auto' });
  const m = { gui, apply, retune, hands, sliders: {}, state: { loop: true, recipe: '', pasted: null }, motion: Object.fromEntries(Object.keys(RANGES).map((k) => [k, EFFECT[k]])),
    look: { seed: Math.floor(Math.random() * 1e6), finish: '', family: '', shape: '', accent: '', layout: '', count: 0, smallest: ROLL.bit[0], biggest: ROLL.bit[1], reach: ROLL.reach[0] } };
  gui.add({ roll: () => { m.look.seed = Math.floor(Math.random() * 1e6); load(m); } }, 'roll').name('🎲 roll a new one');
  gui.add(m.state, 'loop').name('punch on a loop');
  lookFolder(m);
  motionFolder(m);
  recipeFolder(m);
  load(m);
  return { get looping() { return m.state.loop; }, life: () => m.motion.life, refresh: () => greyOut(m) };
}
