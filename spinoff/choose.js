import * as THREE from 'three';
import {
  BAGS, CAPES, CLOTH, FUR, HATS, SPECIES, TEXTURES, TRICKS, animateFighter, buildFighter, disposeFighter, handsFor, loadFighter, newFighter,
  addTricks, paint, randomFighter, rollEffect, saveFighter, setFur, stepFighter, stepTricks,
} from './fighter.js';
import { FACE_PAINTS, POSES, facePaintColorOf, getSpecies } from '../characters/npc.js';
import { debugMenu, debugging, inRoom, openRoom } from './net.js';
import { levelsBeaten } from './progress.js';
import { STRIKE } from './punches.js';
import { FACE_ICON, ICON, NONE, TRICK_ICON, svg, textured } from './icons.js';
import { aimGameCamera, makeStage } from './stage.js';

// REUSE-SPEC.md §Fighter chooser: the sword shows once this tablet's player has beaten level 1, the scythe level 2, the Greathammer level 4
const beaten = levelsBeaten();
/** @param {import('./fighter.js').Fighter} f */
const allowed = (f) => {
  const hands = handsFor(beaten, f.badGuy);
  if (!hands.includes(f.look.hands)) f.look.hands = hands[0];
  if (!TRICKS[f.look.hands].includes(f.look.trick)) f.look.trick = TRICKS[f.look.hands][0];
  return f;
};

let fighter = allowed(loadFighter() ?? newFighter('lion'));
let built = null, cheer = 0, spin = 0, swing = 1, landed = Infinity, shows = -1;
/** Dev mode (🧪, only with ?debug=1): gloves or the sword tapped again try a random effect, `rolled` its seed, until other
 * hands are picked or dev mode is left. */
let dev = false, rolled = null;
/** ?debug_menu=1: the effects menu (effects-menu.js), and the effect it put on the fighter. */
let menu = null, menuEffect = null;
const SHOW_MOVES = ['jab', 'cross', 'uppercut'];
const panel = document.getElementById('panel');

// REUSE-SPEC.md §Lobby, A room session outlasts every screen: dressing up in a room stays in it, and a match
// starting meanwhile doesn't wait for this tablet; the lobby's `hello` brings it back
const session = inRoom();
if (session) {
  const room = openRoom(session.code, fighter, { onFighter: () => {}, onLeave: () => {} });
  room.on('go', (_, from) => room.send('dressing', true, [from]));
}

const button = (action, value, label, inner, on) =>
  `<button data-action="${action}" data-value="${value}" aria-label="${label}" aria-pressed="${on}">${inner}</button>`;

const swatchRow = (action, list, current) => list.map(({ hex, name }) =>
  button(action, hex, name, `<span class="dot" style="background:${hex}"></span>`, hex === current)).join('');

/** @param {string} kind @param {readonly string[]} list @param {boolean} none */
function pickRow(kind, list, none) {
  const { look } = /** @type {{ look: Record<string, string> }} */ (/** @type {unknown} */ (paint(fighter)));
  const { [kind]: current, [`${kind}Color`]: colour, [`${kind}Stitch`]: stitch } = look;
  return [...(none ? [null] : []), ...list].map((v) =>
    button(kind, v ?? '', v === current && stitch ? `${v}, ${stitch}, tap again to change` : v ?? 'none',
      svg(v ? textured(ICON[v], stitch) : NONE, v ? colour : '#9a8f84'), v === current)).join('');
}

const pictures = (html) => `<div class="choices pictures">${html}</div>`;
const colours = (html) => `<div class="choices">${html}</div>`;

const row = (icon, label, ...lines) => `<div class="row" role="group" aria-label="${label}">`
  + `<span class="label" aria-hidden="true">${icon}</span><div class="lines">${lines.join('')}</div></div>`;

// REUSE-SPEC.md §Bad guys, Play a bad guy: a bad guy picks everything but a colour
const swatches = (html) => (fighter.badGuy ? '' : colours(html));

const garment = (icon, kind, list, none) => row(icon, kind,
  pictures(pickRow(kind, list, none)),
  swatches(swatchRow(`${kind}Color`, CLOTH, fighter.look[`${kind}Color`])));

function render() {
  const { species, params, badGuy = false } = fighter, { look } = paint(fighter);
  document.getElementById('bad').setAttribute('aria-pressed', String(badGuy));
  panel.innerHTML = [
    row('🐾', 'animal', pictures(SPECIES.map((s) => button('species', s, s, `<span class="emoji">${getSpecies(s).emoji}</span>`, s === species)).join(''))),
    ...(badGuy ? [] : [row('🎨', 'fur', colours(swatchRow('fur', FUR, params.bodyColor)))]),
    garment('🎩', 'hat', HATS, true),
    garment('🦸', 'cape', CAPES, true),
    garment('🎒', 'bag', BAGS, false),
    row('🎭', 'face paint', pictures(FACE_PAINTS.map((v) =>
      button('facePaint', v, `${v} face paint`, svg(FACE_ICON[v], facePaintColorOf(paint(fighter).params)), v === params.facePaint)).join(''))),
    row('✊', 'hands', pictures(handsFor(beaten, badGuy).map((v) => {
      const on = v === look.hands, icon = on && rolled !== null ? '🎲' : on && TRICKS[v].length > 1 && TRICK_ICON[look.trick];
      const badge = icon ? `<text x="38" y="14" font-size="18" text-anchor="middle">${icon}</text>` : '';
      return button('hands', v, on && TRICKS[v].length > 1 ? `${v}, ${look.trick}, tap again to change` : v, svg(ICON[v] + badge, look.gloves), on);
    }).join('')),
      swatches(swatchRow('gloves', CLOTH, fighter.look.gloves)),
      rolled === null ? '' : `<p class="rolled">🎲 ${rolled}</p><pre class="rolled-fx">${rollEffect(rolled).recipe}</pre>`),
  ].join('');
}

// REUSE-SPEC.md §Fighter chooser: tapping the hat you already wear knits it in the next stitch
function pickOrRestitch(kind, v) {
  const { look } = fighter, key = `${kind}Stitch`;
  if (v && v === look[kind]) look[key] = TEXTURES[(TEXTURES.indexOf(look[key]) + 1) % TEXTURES.length];
  else look[kind] = v || null;
}

/** @param {import('./fighter.js').Fighter} f */
const keepRole = (f) => (fighter.badGuy ? { ...f, badGuy: true } : f);

const ACTIONS = {
  species: (v) => { fighter = keepRole(newFighter(v)); return true; },
  fur: (v) => { setFur(fighter, v); },
  hat: (v) => pickOrRestitch('hat', v),
  cape: (v) => pickOrRestitch('cape', v),
  bag: (v) => { fighter.look.bag = v; },
  facePaint: (v) => { fighter.params.facePaint = v; },
  hands: (v) => {
    const { look } = fighter, tricks = TRICKS[v];
    // ponytail: the effects randomizer's try-out (fighter.js ROLL), in dev mode on gloves or the sword only
    rolled = dev && v === look.hands && (v === 'gloves' || v === 'sword') ? Math.floor(Math.random() * 1e6) : null;
    if (rolled === null && v === look.hands) look.trick = tricks[(tricks.indexOf(look.trick) + 1) % tricks.length];
    else look.hands = v;
    allowed(fighter);
    swing = 0;
    shows++;
  },
};

function choose(action, value) {
  const set = ACTIONS[action] ?? ((v) => { fighter.look[action] = v; });
  commit(set(value) === true);
}

function commit(reframe, cheers = reframe) {
  saveFighter(fighter);
  rebuild(reframe);
  if (cheers) cheer = 1.4;
  render();
}

// The choices are painted before the 3D stage and fighter are built, so there's something to see straight away
render();
// ?show=<row> (its label, as `hands`) opens on that row: a prize from the end card is in view, not below the fold
const show = new URLSearchParams(location.search).get('show');
[...panel.querySelectorAll('.row')].find((r) => r.getAttribute('aria-label') === show)?.scrollIntoView({ block: 'center' });
await new Promise((r) => { requestAnimationFrame(() => setTimeout(r)); });
const stage = makeStage(document.getElementById('stage'));

function rebuild(reframe) {
  if (built) { stage.scene.remove(built.root); disposeFighter(built); }
  built = buildFighter(paint(fighter));
  if (menuEffect) addTricks(built, menuEffect);
  else if (rolled !== null) addTricks(built, rollEffect(rolled));
  stage.scene.add(built.root);
  if (reframe) stage.frame([built.root], { margin: 1.5 });
  menu?.refresh();
}

panel.addEventListener('click', (e) => {
  const b = /** @type {HTMLElement} */ (e.target).closest('button');
  if (b) choose(b.dataset.action, b.dataset.value);
});

document.getElementById('dice').addEventListener('click', () => {
  fighter = allowed(keepRole(randomFighter()));
  commit(true);
});

// REUSE-SPEC.md §Bad guys, Play a bad guy: 🥷 again is a hero, in the colours saved underneath
document.getElementById('bad').addEventListener('click', () => {
  const { badGuy: _, ...hero } = fighter;
  fighter = allowed(fighter.badGuy ? hero : { ...fighter, badGuy: true });
  commit(false, true);
});

// dev mode: the effects randomizer, for whoever opened the game with ?debug=1; a kid never sees 🧪
const devButton = document.getElementById('dev');
devButton.hidden = !debugging();
devButton.addEventListener('click', () => {
  dev = !dev;
  rolled = null;
  devButton.setAttribute('aria-pressed', String(dev));
  rebuild(false);
  render();
});

document.getElementById('done').addEventListener('click', () => {
  saveFighter(fighter);
  location.href = 'lobby.html';
});

// the effects menu shows the fighter as a match does: side-on, at the size it is on a whole screen in a round
const MENU_AIM = new THREE.Vector3(0, 0.8, -0.1);
function inGameView() {
  const canvas = stage.renderer.domElement;
  built.root.rotation.y = Math.PI / 2;
  aimGameCamera(stage.camera, MENU_AIM, { w: canvas.clientWidth / innerWidth, h: canvas.clientHeight / innerHeight });
}

rebuild(true);
if (debugMenu()) {
  menu = (await import('./effects-menu.js')).effectsMenu({
    apply: (effect) => { menuEffect = effect; addTricks(built, effect); },
    retune: (motion) => {
      Object.assign(menuEffect, motion);
      for (const g of built.tricks ?? []) Object.assign(g.userData.spin.userData.fx, motion);
    },
    hands: () => fighter.look.hands,
  });
}
stage.run((dt) => {
  // the effects menu: punch again once the last effect is gone
  if (menu?.looping && swing >= 1 && landed > menu.life() + 0.3) { swing = 0; shows++; }
  cheer = Math.max(0, cheer - dt);
  spin += dt;
  if (menu) inGameView();
  else built.root.rotation.y = 0.55 * Math.sin(spin * 0.5);
  const was = swing;
  swing = Math.min(1, swing + dt / 0.7);
  landed = was < STRIKE && swing >= STRIKE ? 0 : landed + dt;
  if (swing < 1) stepFighter(built, dt, POSES.rest, 0, { name: SHOW_MOVES[shows % SHOW_MOVES.length], arm: -1, step: swing });
  else {
    animateFighter(built, dt, cheer > 0 ? 'delighted' : 'rest');
    // the trick plays on, on the clock the swing started, as in a fight
    stepTricks(built, null, dt);
  }
});
