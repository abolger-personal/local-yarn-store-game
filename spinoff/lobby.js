import * as THREE from 'three';
import { setGeometryDetail } from '../characters/npc.js';
import { makeGridLines } from '../inventory/notions.js';
import { animateFighter, badGuySets, buildFighter, disposeFighter, loadFighter, paint } from './fighter.js';
import { debugging, inRoom, leaveRooms, openRoom, selfId, setRoom, showDebug } from './net.js';
import { CODE_LENGTH, ROOM_TREATS, codeHtml, floorGrid, isCode, randomCode, standingSpots } from './roster.js';
import { makeStage } from './stage.js';
import { heroesProgress, loadProgress, roomLevels, roomStages } from './progress.js';

// REUSE-SPEC.md §Performance: up to 14 small fighters on screen; 'high' is for the chooser's close-up
setGeometryDetail('med');

const mine = loadFighter();
if (!mine) location.replace('choose.html');

const stage = makeStage(document.getElementById('stage'));
const grid = floorGrid();
const floor = makeGridLines(grid, 0, '#c9ae8c');
floor.position.y = 0.002;
stage.scene.add(floor);

/** @type {Map<string, {fighter: import('./fighter.js').Fighter, built: any, set: number, cheer: number, progress: import('./progress.js').Progress}>} */
const cast = new Map();
let room = null, typed = [], roomCode = [], playingHost = null;

function place() {
  const spots = standingSpots([...cast.keys()], grid);
  for (const [id, f] of cast) {
    const s = spots.get(id);
    f.built.root.visible = Boolean(s);
    if (s) f.built.root.position.set(s.x, f.built.root.position.y, s.z);
  }
}

function arrive(id, fighter, progress) {
  leave(id);
  cast.set(id, { fighter, built: null, set: -1, cheer: 1.6, progress });
  dress();
}

/** Builds whoever is new, and a bad guy whose colour set moved as bad guys came and went (REUSE-SPEC.md §Bad guys, Play a bad guy). */
function dress() {
  const sets = badGuySets([...cast].map(([id, f]) => [id, f.fighter]));
  for (const [id, f] of cast) {
    const set = sets.get(id) ?? -1;
    if (f.built && f.set === set) continue;
    if (f.built) { stage.scene.remove(f.built.root); disposeFighter(f.built); }
    f.built = buildFighter(paint(f.fighter, set));
    f.set = set;
    stage.scene.add(f.built.root);
  }
  place();
  // REUSE-SPEC.md §Bad guys, No playing alone: a bad-guy host's 👍 waits for a hero
  /** @type {HTMLButtonElement} */ (document.getElementById('go')).disabled = !heroesProgress([...cast.values()]).length;
}

function leave(id) {
  if (id === playingHost) waitForRound(null);
  const f = cast.get(id);
  if (!f) return;
  stage.scene.remove(f.built.root);
  disposeFighter(f.built);
  cast.delete(id);
  dress();
}

const show = (id, on) => document.getElementById(id).classList.toggle('hidden', !on);

function showCode(code) {
  document.getElementById('code').innerHTML = `${codeHtml(code)}${'<span></span>'.repeat(CODE_LENGTH - code.length)}`;
}

// REUSE-SPEC.md §Multiplayer, Late joiners: the room is mid-match; its host sends `go` for the next round
function waitForRound(host) {
  playingHost = host;
  show('playing', Boolean(host));
}

// REUSE-SPEC.md §Multiplayer: only the tablet that opened the room starts the match, and everyone in it goes along
function enter(next, hosting = false) {
  room?.leave();
  for (const id of cast.keys()) if (id !== selfId) leave(id);
  roomCode = next;
  setRoom({ code: next, hosting });
  room = openRoom(next, mine, { onFighter: arrive, onLeave: leave });
  room.on('go', () => { location.href = `play.html?room=${next.join('')}`; });
  room.on('playing', (_, from) => waitForRound(from));
  waitForRound(null);
  showCode(next);
  show('start', false);
  show('keypad', false);
  show('inroom', true);
  show('picker', false);
  show('go', hosting);
  room.hello();
}

// REUSE-SPEC.md §After the lobby: 👍 (the host's in a room, or playing alone) picks a stage, then a level; ▶️ plays it.
// Guests stay in the lobby meanwhile, with nothing to press, until the host's ▶️ sends `go`.
const STAGE_PICTURE = { breakfast: '🥞', cake: '🎂' };
const DIAL = 9;
let picked = { stage: '', level: 0 };

const everyone = () => (room ? heroesProgress([...cast.values()]) : [loadProgress()]);

function pick() {
  show('start', false);
  show('inroom', false);
  show('picker', true);
  show('dial', false);
  show('pick-go', false);
  show('stage-list', true);
  document.getElementById('stage-list').innerHTML = roomStages()
    .map((s) => `<button data-stage="${s}" aria-label="${s}"><span class="emoji">${STAGE_PICTURE[s] ?? '❓'}</span></button>`).join('');
}

function pickStage(name) {
  const open = new Set(roomLevels(name, everyone()).map((l) => l.number));
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

function unpick() {
  show('picker', false);
  show(room ? 'inroom' : 'start', true);
}

function go() {
  const level = `stage=${picked.stage}&level=${picked.level}`;
  if (!room) { location.href = `play.html?${level}`; return; }
  room.send('go', true);
  location.href = `play.html?room=${roomCode.join('')}&host&${level}`;
}

function exit() {
  leaveRooms();
  room = null;
  waitForRound(null);
  for (const id of cast.keys()) if (id !== selfId) leave(id);
  typed = [];
  showCode([]);
  show('inroom', false);
  show('keypad', false);
  show('picker', false);
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
on('edit-room', () => { location.href = 'choose.html'; });
on('play', pick);
on('exit', exit);
on('go', pick);
on('pick-bye', unpick);
on('pick-go', go);
const tapped = (e) => /** @type {HTMLElement} */ (e.target).closest('button');
on('stage-list', (e) => { const b = tapped(e); if (b) pickStage(b.dataset.stage); });
on('dial', (e) => { const b = tapped(e); if (b) pickLevel(Number(b.dataset.level), b); });
buildKeypad();
if (debugging()) showDebug();

if (mine) {
  show('play', !mine.badGuy);
  arrive(selfId, mine, loadProgress());
  stage.frame([floor], { margin: 1.05, view: new THREE.Vector3(0, 0.55, 1).normalize() });
  const session = inRoom();
  if (session) enter(session.code, session.hosting);
  stage.run((dt) => {
    for (const f of cast.values()) {
      f.cheer = Math.max(0, f.cheer - dt);
      animateFighter(f.built, dt, f.cheer > 0 ? 'delighted' : 'rest');
    }
  });
}
