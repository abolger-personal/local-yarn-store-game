import * as THREE from 'three';
import { setGeometryDetail } from '../characters/npc.js';
import { makeGridLines } from '../inventory/notions.js';
import { animateFighter, buildFighter, disposeFighter, loadFighter } from './fighter.js';
import { openRoom, selfId, showDebug } from './net.js';
import { CODE_LENGTH, ROOM_TREATS, floorGrid, isCode, randomCode, standingSpots } from './roster.js';
import { makeStage } from './stage.js';

// REUSE-SPEC.md §Performance: up to 14 small fighters on screen; 'high' is for the chooser's close-up
setGeometryDetail('med');

const mine = loadFighter();
if (!mine) location.replace('choose.html');
const debug = new URLSearchParams(location.search).get('debug') === '1' ? '&debug=1' : '';

const stage = makeStage(document.getElementById('stage'));
const grid = floorGrid();
const floor = makeGridLines(grid, 0, '#c9ae8c');
floor.position.y = 0.002;
stage.scene.add(floor);

/** @type {Map<string, {built: any, cheer: number}>} */
const cast = new Map();
let room = null, typed = [], roomCode = [];

function place() {
  const spots = standingSpots([...cast.keys()], grid);
  for (const [id, f] of cast) {
    const s = spots.get(id);
    f.built.root.visible = Boolean(s);
    if (s) f.built.root.position.set(s.x, f.built.root.position.y, s.z);
  }
}

function arrive(id, fighter) {
  leave(id);
  const built = buildFighter(fighter);
  stage.scene.add(built.root);
  cast.set(id, { built, cheer: 1.6 });
  place();
}

function leave(id) {
  const f = cast.get(id);
  if (!f) return;
  stage.scene.remove(f.built.root);
  disposeFighter(f.built);
  cast.delete(id);
  place();
}

const show = (id, on) => document.getElementById(id).classList.toggle('hidden', !on);
const treat = (i) => `<span>${ROOM_TREATS[i]}</span>`;

function showCode(code) {
  document.getElementById('code').innerHTML = `${code.map(treat).join('')}${'<span></span>'.repeat(CODE_LENGTH - code.length)}`;
}

// REUSE-SPEC.md §Multiplayer: only the tablet that opened the room starts the match, and everyone in it goes along
function enter(next, hosting = false) {
  room?.leave();
  for (const id of cast.keys()) if (id !== selfId) leave(id);
  roomCode = next;
  room = openRoom(next, mine, { onFighter: arrive, onLeave: leave });
  room.on('go', () => { location.href = `play.html?room=${next.join('')}${debug}`; });
  showCode(next);
  show('start', false);
  show('keypad', false);
  show('inroom', true);
  show('go', hosting);
}

function go() {
  room.send('go', true);
  setTimeout(() => { location.href = `play.html?room=${roomCode.join('')}&host=${cast.size - 1}${debug}`; }, 300);
}

function exit() {
  room?.leave();
  room = null;
  for (const id of cast.keys()) if (id !== selfId) leave(id);
  typed = [];
  showCode([]);
  show('inroom', false);
  show('keypad', false);
  show('start', true);
}

function type(i) {
  typed = [...typed, i].slice(0, CODE_LENGTH);
  showCode(typed);
  if (isCode(typed)) enter(typed);
}

function buildKeypad() {
  const pad = document.getElementById('keypad');
  const keys = ROOM_TREATS.map((t, i) => `<button data-i="${i}" aria-label="treat ${i + 1}"><span class="emoji">${t}</span></button>`);
  pad.innerHTML = `${keys.join('')}<button data-i="back" aria-label="rub out"><span class="emoji">⬅️</span></button>`;
  pad.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('button');
    if (!b) return;
    if (b.dataset.i === 'back') { typed = typed.slice(0, -1); showCode(typed); } else type(Number(b.dataset.i));
  });
}

const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);
on('host', () => enter(randomCode(), true));
on('join', () => { typed = []; showCode([]); show('start', false); show('keypad', true); });
on('edit', () => { location.href = 'choose.html'; });
on('play', () => { location.href = 'play.html'; });
on('exit', exit);
on('go', go);
buildKeypad();
if (debug) showDebug();

if (mine) {
  arrive(selfId, mine);
  stage.frame([floor], { margin: 1.05, view: new THREE.Vector3(0, 0.55, 1).normalize() });
  stage.run((dt) => {
    for (const f of cast.values()) {
      f.cheer = Math.max(0, f.cheer - dt);
      animateFighter(f.built, dt, f.cheer > 0 ? 'delighted' : 'rest');
    }
  });
}
