import {
  BAGS, CAPES, CLOTH, FUR, HANDS, HATS, SPECIES, TEXTURES, TRICKS, animateFighter, buildFighter, disposeFighter, loadFighter, newFighter,
  randomFighter, saveFighter, setFur, showOffTrick, stepFighter,
} from './fighter.js';
import { POSES } from '../characters/npc.js';
import { levelsBeaten } from './progress.js';
import { STRIKE } from './punches.js';
import { makeStage } from './stage.js';

const ANIMAL = { lion: '🦁', llama: '🦙', owl: '🦉' };
const NONE = '<circle cx="24" cy="24" r="15" fill="none" stroke="currentColor" stroke-width="4"/><path d="M13 35 35 13" stroke="currentColor" stroke-width="4"/>';
const ICON = {
  beanie: '<path d="M9 33C9 17 17 11 24 11s15 6 15 22Z"/><rect x="7" y="31" width="34" height="7" rx="3"/><circle cx="24" cy="9" r="4"/>',
  pixie: '<path d="M10 36C12 22 18 12 34 5c-4 9 2 19 4 31Z"/><rect x="8" y="34" width="32" height="6" rx="3"/>',
  beret: '<ellipse cx="24" cy="26" rx="18" ry="8"/><rect x="13" y="29" width="22" height="6" rx="3"/><rect x="22" y="14" width="4" height="6" rx="2"/>',
  bucket: '<path d="M14 30 16 14c4-3 12-3 16 0l2 16Z"/><path d="M5 34c5-6 33-6 38 0-5 3-33 3-38 0Z"/>',
  earflap: '<path d="M9 30C9 16 17 10 24 10s15 6 15 20Z"/><path d="M9 28h6l-1 12c-2 2-5 0-5-2Z"/><path d="M39 28h-6l1 12c2 2 5 0 5-2Z"/>',
  cape: '<path d="M16 8h16l10 34c-12 4-24 4-36 0Z"/>',
  capelet: '<path d="M12 10h24c6 8 8 14 8 18-12 4-28 4-40 0 0-4 2-10 8-18Z"/>',
  backpack: '<rect x="11" y="12" width="26" height="30" rx="7"/><path d="M18 12c0-7 12-7 12 0" fill="none" stroke="currentColor" stroke-width="3"/><rect x="15" y="28" width="18" height="10" rx="3" opacity=".55"/>',
  'drawstring bag': '<path d="M12 16c-4 14-2 26 12 26s16-12 12-26Z"/><path d="M14 16c4-6 16-6 20 0" fill="none" stroke="currentColor" stroke-width="3"/>',
  gloves: '<path d="M14 24c0-10 5-15 13-15s12 6 12 14c0 6-3 10-7 12H20c-4-2-6-6-6-11Z"/><ellipse cx="13" cy="25" rx="5" ry="7"/><rect x="17" y="36" width="18" height="8" rx="3"/>',
  sword: '<g transform="rotate(35 24 24)"><path d="M20 30V9a4 4 0 0 1 8 0v21Z"/><rect x="11" y="29" width="26" height="6" rx="3"/><rect x="21" y="35" width="6" height="7" rx="2"/><circle cx="24" cy="44" r="3.5"/><path d="M20 14l8 4M20 21l8 4" stroke="#fff" stroke-width="2.5" opacity=".7"/></g>',
  'crossbody pouch': '<path d="M8 6 30 26" stroke="currentColor" stroke-width="3"/><rect x="18" y="22" width="24" height="18" rx="5"/>',
};
const INK = 'stroke="rgba(0,0,0,.3)" stroke-width="1.6" fill="none"';
const PATTERN = {
  rib: `<path d="M3 0v6" ${INK}/>`,
  garter: `<path d="M0 3h6" ${INK}/>`,
  cable: `<path d="M0 0c3 2 3 4 6 6M6 0C3 2 3 4 0 6" ${INK}/>`,
  'single crochet': '<circle cx="3" cy="3" r="1.2" fill="rgba(0,0,0,.3)"/>',
  waffle: `<rect x="1" y="1" width="4" height="4" ${INK}/>`,
  lace: '<circle cx="3" cy="3" r="1.5" fill="rgba(255,255,255,.75)"/>',
};
const patternId = (stitch) => `t-${stitch.replace(' ', '-')}`;
document.body.insertAdjacentHTML('beforeend', `<svg width="0" height="0" aria-hidden="true"><defs>${Object.entries(PATTERN).map(([stitch, ink]) =>
  `<pattern id="${patternId(stitch)}" width="6" height="6" patternUnits="userSpaceOnUse">${ink}</pattern>`).join('')}</defs></svg>`);
const textured = (body, stitch) => (PATTERN[stitch] ? `${body}<g fill="url(#${patternId(stitch)})">${body}</g>` : body);

const svg = (body, colour) => `<svg viewBox="0 0 48 48" fill="currentColor" style="color:${colour}" aria-hidden="true">${body}</svg>`;

// REUSE-SPEC.md §Fighter chooser: the sword shows once this tablet's player has beaten level 1
const hands = levelsBeaten() >= 1 ? HANDS : HANDS.filter((h) => h !== 'sword');
/** @param {import('./fighter.js').Fighter} f */
const allowed = (f) => {
  if (!hands.includes(f.look.hands)) f.look.hands = hands[0];
  if (!TRICKS[f.look.hands].includes(f.look.trick)) f.look.trick = TRICKS[f.look.hands][0];
  return f;
};
const TRICK_ICON = { plain: '', sparkle: '✨', bubble: '🫧', flame: '🔥' };

let fighter = allowed(loadFighter() ?? newFighter('lion'));
let built = null, cheer = 0, spin = 0, swing = 1, landed = Infinity, shows = -1;
const SHOW_MOVES = ['jab', 'cross', 'uppercut'];
const panel = document.getElementById('panel');

const button = (action, value, label, inner, on) =>
  `<button data-action="${action}" data-value="${value}" aria-label="${label}" aria-pressed="${on}">${inner}</button>`;

const swatchRow = (action, list, current) => list.map(({ hex, name }) =>
  button(action, hex, name, `<span class="dot" style="background:${hex}"></span>`, hex === current)).join('');

/** @param {string} kind @param {readonly string[]} list @param {boolean} none */
function pickRow(kind, list, none) {
  const { look } = /** @type {{ look: Record<string, string> }} */ (/** @type {unknown} */ (fighter));
  const { [kind]: current, [`${kind}Color`]: colour, [`${kind}Stitch`]: stitch } = look;
  return [...(none ? [null] : []), ...list].map((v) =>
    button(kind, v ?? '', v === current && stitch ? `${v}, ${stitch}, tap again to change` : v ?? 'none',
      svg(v ? textured(ICON[v], stitch) : NONE, v ? colour : '#9a8f84'), v === current)).join('');
}

const pictures = (html) => `<div class="choices pictures">${html}</div>`;
const colours = (html) => `<div class="choices">${html}</div>`;

const row = (icon, label, ...lines) => `<div class="row" role="group" aria-label="${label}">`
  + `<span class="label" aria-hidden="true">${icon}</span><div class="lines">${lines.join('')}</div></div>`;

const garment = (icon, kind, list, none) => row(icon, kind,
  pictures(pickRow(kind, list, none)),
  colours(swatchRow(`${kind}Color`, CLOTH, fighter.look[`${kind}Color`])));

function render() {
  const { species, look, params } = fighter;
  panel.innerHTML = [
    row('🐾', 'animal', pictures(SPECIES.map((s) => button('species', s, s, `<span class="emoji">${ANIMAL[s]}</span>`, s === species)).join(''))),
    row('🎨', 'fur', colours(swatchRow('fur', FUR, params.bodyColor))),
    garment('🎩', 'hat', HATS, true),
    garment('🦸', 'cape', CAPES, true),
    garment('🎒', 'bag', BAGS, false),
    row('✊', 'hands', pictures(hands.map((v) => {
      const on = v === look.hands, badge = on && TRICK_ICON[look.trick] ? `<text x="38" y="14" font-size="18" text-anchor="middle">${TRICK_ICON[look.trick]}</text>` : '';
      return button('hands', v, on ? `${v}, ${look.trick}, tap again to change` : v, svg(ICON[v] + badge, look.gloves), on);
    }).join('')),
      colours(swatchRow('gloves', CLOTH, look.gloves))),
  ].join('');
}

// REUSE-SPEC.md §Fighter chooser: tapping the hat you already wear knits it in the next stitch
function pickOrRestitch(kind, v) {
  const { look } = fighter, key = `${kind}Stitch`;
  if (v && v === look[kind]) look[key] = TEXTURES[(TEXTURES.indexOf(look[key]) + 1) % TEXTURES.length];
  else look[kind] = v || null;
}

const ACTIONS = {
  species: (v) => { fighter = newFighter(v); return true; },
  fur: (v) => { setFur(fighter, v); },
  hat: (v) => pickOrRestitch('hat', v),
  cape: (v) => pickOrRestitch('cape', v),
  bag: (v) => { fighter.look.bag = v; },
  hands: (v) => {
    const { look } = fighter, tricks = TRICKS[v];
    if (v === look.hands) look.trick = tricks[(tricks.indexOf(look.trick) + 1) % tricks.length];
    else look.hands = v;
    allowed(fighter);
    swing = 0;
    shows++;
  },
};

function choose(action, value) {
  const set = ACTIONS[action] ?? ((v) => { fighter.look[action] = v; });
  const reframe = set(value) === true;
  saveFighter(fighter);
  rebuild(reframe);
  if (reframe) cheer = 1.4;
  render();
}

// The choices are painted before the 3D stage and fighter are built, so there's something to see straight away
render();
await new Promise((r) => { requestAnimationFrame(() => setTimeout(r)); });
const stage = makeStage(document.getElementById('stage'));

function rebuild(reframe) {
  if (built) { stage.scene.remove(built.root); disposeFighter(built); }
  built = buildFighter(fighter);
  stage.scene.add(built.root);
  if (reframe) stage.frame([built.root], { margin: 1.5 });
}

panel.addEventListener('click', (e) => {
  const b = /** @type {HTMLElement} */ (e.target).closest('button');
  if (b) choose(b.dataset.action, b.dataset.value);
});

document.getElementById('dice').addEventListener('click', () => {
  fighter = allowed(randomFighter());
  saveFighter(fighter);
  rebuild(true);
  cheer = 1.4;
  render();
});

document.getElementById('done').addEventListener('click', () => {
  saveFighter(fighter);
  location.href = 'lobby.html';
});

rebuild(true);
stage.run((dt) => {
  cheer = Math.max(0, cheer - dt);
  spin += dt;
  built.root.rotation.y = 0.55 * Math.sin(spin * 0.5);
  const was = swing;
  swing = Math.min(1, swing + dt / 0.7);
  landed = was < STRIKE && swing >= STRIKE ? 0 : landed + dt;
  if (swing < 1) stepFighter(built, dt, POSES.rest, 0, { name: SHOW_MOVES[shows % SHOW_MOVES.length], arm: -1, step: swing });
  else animateFighter(built, dt, cheer > 0 ? 'delighted' : 'rest');
  if (swing >= STRIKE) showOffTrick(built, -1, landed);
});
