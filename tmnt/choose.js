import { POSES, facePaintColorOf, getSpecies } from '../characters/npc.js';
import { SPECIES, TEXTURES, TRICKS, animateFighter, disposeFighter, setFur, stepFighter, stepTricks } from '../spinoff/fighter.js';
import { FACE_ICON, ICON, NONE, TRICK_ICON, svg, textured } from '../spinoff/icons.js';
import { makeStage } from '../spinoff/stage.js';
import { CLOTH, COLOURS, FACES, HERO_HANDS, PRESETS, buildHero, faceOf, handsOf, SCARF_FORMS, SWEATER_WORKS, WEAR, loadHero, newHero, randomHero, saveHero } from './hero.js';

const LINE = 'fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"';
const PICTURE = {
  ...ICON,
  trailing: `<path d="M10 14c8 6 20 6 28 0" ${LINE}/><path d="M30 17c4 6 10 10 14 22M33 17c0 8 2 14 2 24" ${LINE}/>`,
  long: `<path d="M10 14c8 6 20 6 28 0" ${LINE}/><path d="M17 18v24M24 19v20" ${LINE}/>`,
  cowl: '<path d="M8 14c4 10 28 10 32 0v10c-4 12-28 12-32 0Z"/>',
  pullover: '<path d="M16 8h16l10 8-4 7-4-3v22H14V20l-4 3-4-7Z"/>',
  turtleneck: '<path d="M18 4h12v6l12 6-4 7-4-3v22H14V20l-4 3-4-7 12-6Z"/>',
  vest: '<path d="M14 8h6l4 6 4-6h6l2 10v24H12V18Z"/>',
  crew: '<path d="M18 20h12v12l8 4v6H18Z"/>',
  'knee-high': '<path d="M18 8h12v24l8 4v6H18Z"/>',
  'over-knee': '<path d="M18 2h12v30l8 4v6H18Z"/><path d="M18 8h12" stroke="#fff8" stroke-width="3"/>',
};
const FACE_PICTURE = {
  ...FACE_ICON,
  glasses: `${FACE_ICON.none}<g fill="none" stroke="#141414" stroke-width="3"><circle cx="17" cy="21" r="6.5"/><circle cx="31" cy="21" r="6.5"/><path d="M23.5 20h1"/></g>`,
};
const ROW_ICON = { scarf: '🧣', sweater: '🧥', socks: '🧦', bag: '🎒' };
// REUSE-SPEC.md §Hero chooser: tapped again, the scarf is worn another way, the sweater in the next colourwork, socks
// or a bag in the next stitch
const AGAIN = { scarf: ['scarfForm', SCARF_FORMS], sweater: ['sweaterWork', SWEATER_WORKS] };

let hero = loadHero() ?? newHero();
let built = null, cheer = 0, spin = 0, swing = 1, shows = -1;
const SHOW_MOVES = ['jab', 'cross', 'uppercut'];
const panel = document.getElementById('panel');

const button = (action, value, label, inner, on) =>
  `<button data-action="${action}" data-value="${value}" aria-label="${label}" aria-pressed="${on}">${inner}</button>`;
const swatchRow = (action, current, list = CLOTH) => list.map(({ hex, name }) =>
  button(action, hex, name, `<span class="dot" style="background:${hex}"></span>`, hex === current)).join('');
const pictures = (html) => `<div class="choices pictures">${html}</div>`;
const colours = (html) => `<div class="choices">${html}</div>`;
const row = (icon, label, ...lines) => `<div class="row" role="group" aria-label="${label}">`
  + `<span class="label" aria-hidden="true">${icon}</span><div class="lines">${lines.join('')}</div></div>`;

function wearRow(kind) {
  const { look } = hero, { [kind]: current, [`${kind}Color`]: colour, [`${kind}Stitch`]: stitch } = look;
  const again = look[(AGAIN[kind] ?? [`${kind}Stitch`])[0]];
  const tiles = [null, ...WEAR[kind]].map((v) => button(kind, v ?? '', v === current ? `${v}, ${again}, tap again to change` : v ?? 'none',
    svg(v ? textured(PICTURE[v], kind === 'scarf' ? '' : stitch) : NONE, v ? colour : '#9a8f84'), v === current)).join('');
  return row(ROW_ICON[kind], kind, pictures(tiles), colours(swatchRow(`${kind}Color`, colour)));
}

function handsRow() {
  const { look } = hero;
  const tiles = HERO_HANDS.map((v) => {
    const on = v === look.hands, icon = on && TRICKS[v].length > 1 && TRICK_ICON[look.trick];
    const badge = icon ? `<text x="38" y="14" font-size="18" text-anchor="middle">${icon}</text>` : '';
    return button('hands', v, on && TRICKS[v].length > 1 ? `${v}, ${look.trick}, tap again to change` : v, svg(PICTURE[v] + badge, look.gloves), on);
  }).join('');
  return row('✊', 'hands', pictures(tiles), colours(swatchRow('gloves', look.gloves)));
}

function render() {
  const { species, params } = hero;
  panel.innerHTML = [
    row('🐾', 'animal', pictures(SPECIES.map((s) => button('species', s, s, `<span class="emoji">${getSpecies(s).emoji}</span>`, s === species)).join(''))),
    row('🎨', 'fur', colours(swatchRow('fur', params.bodyColor, COLOURS))),
    ...Object.keys(WEAR).map(wearRow),
    row('🎭', 'face', pictures(FACES.map((v) => button('facePaint', v, v === 'rings' ? 'mask' : v,
      svg(FACE_PICTURE[v], facePaintColorOf(faceOf(hero).params)), v === (hero.look.glasses ? 'glasses' : params.facePaint))).join(''))),
    handsRow(),
  ].join('');
}

const cycle = (list, v) => list[(list.indexOf(v) + 1) % list.length];

function wearOrRestyle(kind, v) {
  const { look } = hero, [key, list] = AGAIN[kind] ?? [`${kind}Stitch`, TEXTURES];
  if (!v || v !== look[kind]) look[kind] = v || null;
  else look[key] = cycle(list, look[key]);
}

const ACTIONS = {
  // the mouse picks up Master Splinter's cane; any other animal keeps what it held
  species: (v) => {
    const look = v === 'mouse' ? { ...hero.look, hands: handsOf(v), trick: TRICKS[handsOf(v)][0] } : hero.look;
    hero = setFur({ ...newHero(Math.random, v), look }, hero.params.bodyColor);
    return true;
  },
  fur: (v) => { setFur(hero, v); },
  // the glasses are one of the face choices: picking them takes the paint off, and the paint takes them off
  facePaint: (v) => {
    hero.look.glasses = v === 'glasses';
    hero.params.facePaint = hero.look.glasses ? 'none' : v;
  },
  hands: (v) => {
    const { look } = hero;
    if (v === look.hands) look.trick = cycle(TRICKS[v], look.trick);
    else Object.assign(look, { hands: v, trick: TRICKS[v][0] });
    swing = 0;
    shows++;
  },
  ...Object.fromEntries(Object.keys(WEAR).map((k) => [k, (v) => wearOrRestyle(k, v)])),
};

function commit(reframe) {
  saveHero(hero);
  rebuild(reframe);
  if (reframe) cheer = 1.4;
  render();
}

render();
await new Promise((r) => { requestAnimationFrame(() => setTimeout(r)); });
const stage = makeStage(document.getElementById('stage'));

function rebuild(reframe) {
  if (built) { stage.scene.remove(built.root); disposeFighter(built); }
  built = buildHero(hero);
  stage.scene.add(built.root);
  if (reframe) stage.frame([built.root], { margin: 1.5 });
}

panel.addEventListener('click', (e) => {
  const b = /** @type {HTMLElement} */ (e.target).closest('button');
  if (!b) return;
  const set = ACTIONS[b.dataset.action] ?? ((v) => { hero.look[b.dataset.action] = v; });
  commit(set(b.dataset.value) === true);
});

document.getElementById('dice').addEventListener('click', () => {
  hero = randomHero();
  commit(true);
});

// REUSE-SPEC.md §Hero chooser: 🍕 the presets in turn, from a random one, so two taps never give the same
let preset = Math.floor(Math.random() * PRESETS);
document.getElementById('preset').addEventListener('click', () => {
  preset = (preset + 1) % PRESETS;
  hero = newHero(() => (preset + 0.5) / PRESETS);
  commit(true);
});

document.getElementById('done').addEventListener('click', () => {
  saveHero(hero);
  cheer = 1.4;
});

rebuild(true);
stage.run((dt) => {
  cheer = Math.max(0, cheer - dt);
  spin += dt;
  built.root.rotation.y = 0.55 * Math.sin(spin * 0.5);
  swing = Math.min(1, swing + dt / 0.7);
  if (swing < 1) stepFighter(built, dt, POSES.rest, 0, { name: SHOW_MOVES[shows % SHOW_MOVES.length], arm: -1, step: swing });
  else {
    animateFighter(built, dt, cheer > 0 ? 'delighted' : 'rest');
    stepTricks(built, null, dt);
  }
});
