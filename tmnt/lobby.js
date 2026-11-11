import * as THREE from 'three';
import { setGeometryDetail } from '../characters/npc.js';
import { makeGridLines } from '../inventory/notions.js';
import { animateFighter } from '../spinoff/fighter.js';
import { floorGrid } from '../spinoff/roster.js';
import { makeStage } from '../spinoff/stage.js';
import { buildHero, loadHero } from './hero.js';

// REUSE-SPEC.md §Level 1, Building it: the donut fighters' lobby (spinoff/lobby.js) with only its playing-alone way
// through: 👍 picks a stage, then a level, ▶️ plays it. Rooms come later.
setGeometryDetail('med');

const mine = loadHero();
if (!mine) location.replace('choose.html');

// the playground's stage is a slide (the donut fighters' breakfast is a pancake)
const STAGE_PICTURE = { playground: '🛝' };
// ponytail: one level for now, a new generated one each play; levels and unlocks come with the progress code
const LEVELS = { playground: [1] };
const DIAL = 9;
let picked = { stage: '', level: 0 };

const show = (ids, on) => { for (const id of [ids].flat()) document.getElementById(id).classList.toggle('hidden', !on); };

function pick() {
  show(['start', 'dial', 'pick-go'], false);
  show(['picker', 'stage-list'], true);
  document.getElementById('stage-list').innerHTML = Object.keys(STAGE_PICTURE)
    .map((s) => `<button data-stage="${s}" aria-label="${s}"><span class="emoji">${STAGE_PICTURE[s]}</span></button>`).join('');
}

function pickStage(name) {
  const open = new Set(LEVELS[name]);
  picked = { stage: name, level: 0 };
  show('stage-list', false);
  show('dial', true);
  document.getElementById('dial').innerHTML = Array.from({ length: DIAL }, (_, i) => i + 1)
    .map((n) => (open.has(n) ? `<button data-level="${n}" aria-label="level ${n}">${n}</button>` : '<span></span>')).join('');
}

function pickLevel(n, b) {
  picked.level = n;
  for (const o of document.querySelectorAll('#dial button')) o.setAttribute('aria-pressed', String(o === b));
  show('pick-go', true);
}

const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);
const tapped = (e) => /** @type {HTMLElement} */ (e.target).closest('button');
on('edit', () => { location.href = 'choose.html'; });
on('play', pick);
on('pick-bye', () => { show('picker', false); show('start', true); });
on('pick-go', () => {
  const seed = Math.floor(Math.random() * 1e6);
  location.href = `level.html?stage=${picked.stage}&level=${picked.level}&seed=${seed}`;
});
on('stage-list', (e) => { const b = tapped(e); if (b) pickStage(b.dataset.stage); });
on('dial', (e) => { const b = tapped(e); if (b) pickLevel(Number(b.dataset.level), b); });

if (mine) {
  const stage = makeStage(document.getElementById('stage')), floor = makeGridLines(floorGrid(), 0, '#c9ae8c'), hero = buildHero(mine);
  floor.position.y = 0.002;
  stage.scene.add(floor, hero.root);
  stage.frame([floor], { margin: 1.05, view: new THREE.Vector3(0, 0.55, 1).normalize() });
  let cheer = 1.6;
  stage.run((dt) => {
    cheer = Math.max(0, cheer - dt);
    animateFighter(hero, dt, cheer > 0 ? 'delighted' : 'rest');
  });
}
