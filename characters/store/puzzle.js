import * as THREE from 'three';

import { BUILD, NAMES, POSES, applyPose, createCharacter, disposeCharacter, getSpecies, pick,
         setGeometryDetail, setViewMode, speciesIds } from '../npc.js';
import '../owl.js';
import '../llama.js';
import '../lion.js';
import { STATE, TRAITS, consideredHere, interact, labelOf, makeNpc, makeWorld, noticeable,
         signGuestbook } from '../visit.js';
import { describeWip, labelWant, wantFor, wantsOf, stow, WIP_STATE } from '../wip.js';
import { HOOK_SIZES_MM, NOTION_NAMES, PATTERN_NAMES, SIZED_NOTIONS, TOOL_NOTIONS, YARN_COLOR_COUNT,
         YARN_MATERIALS, YARN_SHAPES, YARN_WEIGHT_NAMES, CRAFTS, makeNotion, makePattern,
         makeYarn } from '../../inventory/catalog.js';
import { EMPTY, topAt } from '../../inventory/grid.js';
import { loadAtlas } from '../../inventory/notions.js';

import { S } from './core/config.js';
import { aim, clocks, displays, items, shop, takeViewDirty, touchView } from './core/state.js';
import { esc } from './core/util.js';
import { installStage, renderer, scene, camera, controls } from './scene/stage.js';
import { buildRoomShell, cullWalls } from './scene/room.js';
import { installSeating, buildChairs } from './scene/seating.js';
import { buildDisplays, byId, installDisplays } from './scene/displays.js';
import { buildItemMeshes } from './goods/items.js';
import { buildYarnMeshes } from './goods/yarn.js';
import { installPlaceholderArt } from './goods/art.js';
import { addItem } from './goods/stock.js';
import { refreshAll } from './goods/paint.js';
import { installFeedback, paintActivePlane, tickGlow, updateHeldReadout } from './interact/glow.js';
import { installInput } from './interact/input.js';
import { abortDrag } from './interact/pick.js';
import { clearSelection } from './interact/move.js';
import { castGroup, bodyParams, installWorld, room, sizeInstanceBuffers } from './sim/world.js';
import { frameRoom } from './ui/framing.js';

// Relative to this module, not the page, so a site served below its root (GitHub Pages) still finds it.
const ATLAS_URL = new URL('../../ai_planning_sessions/inventory/illustrations/build', import.meta.url).href;

const panels = {
  who: document.getElementById('who'),
  palette: document.getElementById('palette'),
  npcPanel: document.getElementById('npcPanel'),
  hints: document.getElementById('hints'),
  readout: document.getElementById('readout'),
  log: document.getElementById('log'),
  rail: document.getElementById('rail'),
};

S.displayCount = 2;
S.chairCount = 0;
S.npcCount = 1;

const bench = {
  npc: null,
  built: null,
  world: null,
  at: 'table-a',
  playerView: false,
  reveal: { traits: false, prefs: false, wips: false, wants: false, book: true },
};

const stockOf = (disp) => items.map((it, i) => ({ it, i }))
  .filter(({ it }) => !it.gone && it.display === disp.id);

function coveredBy(disp, item, index) {
  const over = new Set();
  for (let dr = 0; dr < (item.h ?? 1); dr++)
    for (let dc = 0; dc < (item.w ?? 1); dc++) {
      const top = topAt(disp.g, item.shelf, item.c + dc, item.r + dr);
      if (top !== index && top !== EMPTY) over.add(labelOf(items[top]));
    }
  return [...over];
}


const standingAt = () => byId(bench.at) ?? displays[0];

function placeNpc() {
  const { npc } = bench, disp = standingAt();
  if (!npc || !disp) return;
  Object.assign(npc, { x: disp.standAt.x, z: disp.standAt.z });
  npc.from = { x: npc.x, z: npc.z };
  npc.atDisplay = disp.id;
  bench.built.root.position.set(npc.x, 0, npc.z);
  bench.built.root.rotation.y = Math.atan2(disp.x - npc.x, disp.z - npc.z);
}

/** @param {{traits?: any, prefs?: any}} [keep] */
function spawnNpc({ traits, prefs } = {}) {
  if (bench.built) { castGroup.remove(bench.built.root); disposeCharacter(bench.built); }
  const kit = getSpecies(pick(speciesIds()));
  const P = bodyParams(kit, null, S);
  bench.built = createCharacter(P, kit);
  const npc = /** @type {any} */ (makeNpc({ id: 'bench', name: pick(NAMES), species: kit.label, traits, prefs }));
  npc.speciesId = kit.id;
  npc.state = /** @type {any} */ (STATE.BROWSE);
  npc.body = P;
  bench.npc = npc;
  if (bench.world) bench.world.npcs = [npc];
  castGroup.add(bench.built.root);
  applyPose(bench.built, POSES.browse);
  setViewMode(castGroup, S.view);
  placeNpc();
  panels.who.textContent = `${npc.name} the ${npc.species}`;
  renderNpc();
}


const build = {
  kind: 'yarn', weight: 'worsted', material: 'wool', shape: 'ball', colorIndex: 7,
  patternType: 'hat', craft: 'knitting', toolSize: 4.0, notion: 'crochet-hook',
};

const options = (list, sel, label = String) => list
  .map((v) => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(label(v))}</option>`)
  .join('');

const field = (key, label, list, labelOfValue) =>
  `<label class="row" data-for="${key}"><span>${label}</span>` +
  `<select data-build="${key}">${options(list, build[key], labelOfValue)}</select></label>`;

const PALETTE_BUTTONS = `<div class="btns">
         <button data-act="put">put it out</button>
         <button class="ghost" data-act="give">hand it to them</button>
         <button class="ghost" data-act="clear">clear the shop</button>
       </div>`;

const colourField = () => [
  '<label class="row" data-for="colorIndex"><span>colour</span>',
  `<input type="number" min="0" max="${YARN_COLOR_COUNT - 1}" data-build="colorIndex" `,
  `value="${build.colorIndex}" /></label>`,
].join('');

function renderPalette() {
  panels.palette.innerHTML = [
    field('kind', 'kind', ['yarn', 'pattern', 'notion']),
    field('weight', 'weight', YARN_WEIGHT_NAMES),
    field('material', 'material', YARN_MATERIALS),
    field('shape', 'shape', YARN_SHAPES),
    colourField(),
    field('patternType', 'pattern', PATTERN_NAMES),
    field('craft', 'craft', CRAFTS),
    field('notion', 'notion', NOTION_NAMES),
    field('toolSize', 'size mm', HOOK_SIZES_MM, (v) => v.toFixed(1)),
    PALETTE_BUTTONS,
  ].join('');
  syncPalette();
}

function syncPalette() {
  const shownBy = {
    yarn: ['kind', 'weight', 'material', 'shape', 'colorIndex'],
    pattern: ['kind', 'patternType', 'craft', 'weight', 'material', 'toolSize'],
    notion: ['kind', 'notion', 'toolSize'],
  }[build.kind];
  const rows = /** @type {NodeListOf<HTMLElement>} */
    (panels.palette.querySelectorAll('[data-for]'));
  for (const row of rows) {
    row.hidden = !shownBy.includes(row.dataset.for)
      || (row.dataset.for === 'toolSize' && build.kind === 'notion'
          && !SIZED_NOTIONS.has(build.notion));
  }
  const put = panels.palette.querySelector('[data-act="put"]');
  if (put) put.textContent = `put it on the ${bench.at}`;
}

function specOf() {
  if (build.kind === 'yarn') {
    return Object.assign(makeYarn(Math.random, build.weight),
                         { material: build.material, shape: build.shape,
                           colorIndex: Number(build.colorIndex) });
  }
  if (build.kind === 'pattern') {
    return Object.assign(makePattern(Math.random, build.patternType),
                         { craft: build.craft, weight: build.weight,
                           materials: [build.material], toolSize: Number(build.toolSize) });
  }
  const n = makeNotion(Math.random, build.notion);
  if (n.size != null) n.size = Number(build.toolSize);
  return n;
}

function putOut() {
  const disp = standingAt();
  const index = addItem(disp, disp.plane, specOf());
  if (index < 0) {
    say(`no room on ${disp.id} for that`);
    return;
  }
  sizeInstanceBuffers();
  refreshAll();
  say(`stocked ${labelOf(items[index])} on ${disp.id}`);
}

function giveToNpc() {
  const spec = specOf();
  const kind = { yarn: 'yarn', pattern: 'pattern' }[spec.name]
    ?? (TOOL_NOTIONS.includes(spec.name) ? 'tool' : 'notion');
  const slot = bench.npc.wips.find((w) => w.state !== WIP_STATE.FINISHED
    && (kind !== 'pattern' || !w.pattern));
  if (!slot) {
    say('no open WIP slot wants that');
    return;
  }
  stow(bench.npc, spec, { kind, wip: slot.id });
  say(`handed ${labelOf(spec)} to ${bench.npc.name} for ${slot.id}`);
  renderNpc();
}

function clearShop() {
  clearSelection();
  abortDrag();
  buildDisplays(S.displayCount);
  items.length = 0;
  sizeInstanceBuffers();
  refreshAll();
  placeNpc();
  say('cleared the shop');
}


const numField = (key, value, max) =>
  `<label class="row"><span>${esc(key)}</span>` +
  `<input type="number" min="1" max="${max}" data-trait="${esc(key)}" value="${value}" /></label>`;

const NPC_BUTTONS = `<div class="btns">
         <button data-act="look">ask what they make of it</button>
         <button class="ghost" data-act="sign">sign the guestbook</button>
         <button class="ghost" data-act="reroll">new customer</button>
         <button class="ghost" data-act="rewip">new projects, same person</button>
       </div>`;

function renderNpc() {
  const { npc } = bench;
  if (!npc) return;
  panels.npcPanel.innerHTML = [
    `<label class="row"><span>standing at</span><select data-at>${options(displays.map((d) => d.id), bench.at)}</select></label>`,
    '<h4>personality</h4>',
    `<div class="traits">${TRAITS.map((t) => numField(t, npc.traits[t], 5)).join('')}</div>`,
    '<h4>craft</h4>',
    `<div class="traits">${numField('skill', npc.prefs.skill, 5)}</div>`,
    `<div class="k">${esc(npc.prefs.crafts.join(', '))} · likes ${esc(npc.prefs.materials.join('/'))} in ${esc(npc.prefs.weights.join('/'))}</div>`,
    NPC_BUTTONS,
  ].join('');
  renderHints();
  touchView();
}


/** @type {[string, string, (npc: any) => string][]} */
const HINTS = [
  ['traits', 'personality', (n) => TRAITS.map((t) => `${t.slice(0, 4)} ${n.traits[t]}`).join(' · ')],
  ['prefs', 'taste', (n) => `skill ${n.prefs.skill} · ${n.prefs.crafts.join('/')} · ` +
    `${n.prefs.materials.join(', ')} · ${n.prefs.weights.join(', ')}`],
  ['wips', 'projects', (n) => n.wips.map((w) => `${w.id}: ${describeWip(w)}`).join('<br />')],
  ['wants', 'shopping list', (n) => (wantsOf(n).map(labelWant).join('<br />') || 'nothing')],
  ['book', 'guestbook', (n) => (bench.world.guestbook
    .filter((e) => e.npc === n.name)
    .map((e) => `r${e.round} ${e.kind === 'photo' ? `photographed in ${e.object}` : e.mood}` +
                `${e.tags.length ? ` [${e.tags.join(' ')}]` : ''}`)
    .join('<br />') || 'nothing written yet')],
];

function renderHints() {
  const { npc } = bench;
  const toolbar = `<div class="btns" style="margin:0 0 6px">
       <button class="ghost" data-act="view">${bench.playerView ? '👁 player view' : '🔧 designer view'}</button>
     </div>`;
  panels.hints.innerHTML = toolbar + HINTS.map(([key, label, value]) => {
      const shown = bench.reveal[key];
      const body = shown || !bench.playerView
        ? value(npc)
        : '<span class="redacted">the player has to work this out</span>';
      return `<div class="hint${shown ? '' : ' secret'}">
          <div class="head">
            <input type="checkbox" data-reveal="${key}"${shown ? ' checked' : ''} />
            ${esc(label)}${shown ? '' : ' <span class="k">— withheld</span>'}
          </div>
          <div class="body">${body}</div>
        </div>`;
    }).join('');
}

function whyNot(disp, it, i, seen, want) {
  if (it.held) return 'in your hand — out of the shop until you set it down';
  if (seen) return want ? 'matches a want' : 'nothing they need';
  const under = coveredBy(disp, it, i);
  if (under.length) return `under ${esc(under.join(', '))}`;
  if (disp.kind === 'shelf' && it.r === disp.wallRow) return 'in the wall-facing row';
  return 'out of reach';
}

function readoutLine(npc, disp, { it, i }) {
  const seen = noticeable(disp, items, i);
  const want = wantFor(npc, it);
  const why = whyNot(disp, it, i, seen, want);
  return `<div class="item"><span class="dot ${seen ? 'seen' : 'hidden'}">${seen ? '●' : '○'}</span>`
    + `<span class="${want ? 'wanted' : ''}">${esc(labelOf(it))}</span><span class="why">— ${why}</span></div>`;
}

function readoutVerdict(npc, considered) {
  const choice = considered.length
    ? `they would pick up <b>${esc(labelOf(items[considered[0]]))}</b>`
    : 'nothing here is both wanted and reachable';
  const turning = npc.considering
    ? `<div class="item k">turning over ${esc(labelOf(items[npc.considering.index]))} — ask again and they buy it</div>`
    : '';
  return `<h4>verdict</h4><div class="item"><span>${choice}</span></div>${turning}`;
}

function renderReadout() {
  const { npc } = bench, disp = standingAt();
  if (!npc || !disp) return;
  const stock = stockOf(disp);
  const lines = stock.map((entry) => readoutLine(npc, disp, entry)).join('') || '<div class="k">nothing on this display</div>';
  const verdict = readoutVerdict(npc, consideredHere(npc, disp, items));
  panels.readout.innerHTML = `<div class="k">${esc(disp.id)} · ${disp.kind} · ${stock.length} out</div>${lines}${verdict}`;
}


const log = [];

function say(line) {
  log.unshift(line);
  if (log.length > 12) log.pop();
  panels.log.innerHTML = log.map((l) => `<div>${esc(l)}</div>`).join('');
  touchView();
}

function look() {
  const disp = standingAt();
  bench.world.round += 1;
  const result = interact(bench.npc, disp, bench.world);
  refreshAll();
  say(`${bench.npc.name}: ${bench.npc.note} (${result})`);
  renderNpc();
}

function sign() {
  const entry = signGuestbook(bench.world, bench.npc);
  say(`signed the guestbook — ${entry.kind === 'photo' ? entry.object : entry.mood}`);
  renderNpc();
}


function installBench() {
  panels.palette.addEventListener('change', (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    if (!t.dataset.build) return;
    build[t.dataset.build] = t.value;
    syncPalette();
  });
  installButtons();
  panels.rail.addEventListener('change', onRailChange);
  addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') frameRoom(standingAt());
    if (e.key === 'g' || e.key === 'G') { S.showGrid = !S.showGrid; touchView(); }
  });
}

function installButtons() {
  document.addEventListener('click', (e) => {
    const btn = /** @type {HTMLElement} */
      (/** @type {HTMLElement} */ (e.target).closest?.('[data-act]'));
    const act = btn?.dataset.act;
    ({
      put: putOut, give: giveToNpc, clear: clearShop, look, sign,
      reroll: () => spawnNpc(),
      rewip: () => spawnNpc({ traits: bench.npc.traits, prefs: bench.npc.prefs }),
      view: () => { bench.playerView = !bench.playerView; renderHints(); },
    })[act]?.();
  });
}

function onRailChange(e) {
  const t = /** @type {HTMLInputElement} */ (e.target);
  if (t.dataset.trait === 'skill') bench.npc.prefs.skill = Number(t.value);
  else if (t.dataset.trait) bench.npc.traits[t.dataset.trait] = Number(t.value);
  else if (t.dataset.reveal) bench.reveal[t.dataset.reveal] = t.checked;
  else if (t.hasAttribute('data-at')) {
    bench.at = t.value;
    placeNpc();
    syncPalette();
    frameRoom(standingAt());
  }
  else return;
  if (t.dataset.reveal) renderHints(); else renderNpc();
  touchView();
}

function buildBench() {
  /** @type {[string, () => void][]} */
  const steps = [
    ['stage', installStage], ['room', buildRoomShell], ['seating', installSeating],
    ['displays', installDisplays], ['placeholder art', installPlaceholderArt],
    ['feedback', installFeedback], ['input', installInput],
    ['world', installWorld], ['bench', installBench],
  ];
  for (const [name, step] of steps) {
    try { step(); } catch (err) { console.error(`install ${name} failed:`, err); }
  }
}

const clock = new THREE.Timer();

function startLoop() {
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.update().getDelta(), 0.1);
    clocks.elapsed += dt;
    tickGlow(clocks.elapsed);
    if (takeViewDirty()) { paintActivePlane(); updateHeldReadout(); renderReadout(); }
    controls.update();
    cullWalls();
    renderer.render(scene, camera);
  });
}

function openTheBench(loaded) {
  buildItemMeshes(loaded);
  buildYarnMeshes();
  setGeometryDetail(S.detail);
  buildChairs(0);
  buildDisplays(S.displayCount);
  items.length = 0;
  bench.world = makeWorld({ displays, items, room, seats: [] });
  shop.world = bench.world;
  aim.active = bench.at;
  spawnNpc();
  sizeInstanceBuffers();
  refreshAll();
  renderPalette();
  frameRoom(standingAt());
  startLoop();
  touchView();
}

function bootFailed(stage, err, hint) {
  console.error(`puzzle bench failed during ${stage}:`, err);
  panels.palette.innerHTML =
    `<b>${esc(stage)} failed</b><br />${esc(err.message)}<br /><span class="k">${hint}</span>`;
}

console.info('LYS puzzle bench, build', BUILD);
buildBench();
loadAtlas(ATLAS_URL)
  .catch((err) => {
    bootFailed('the atlas', err, 'run illustrations/notion_processing.py, and serve over http');
    throw err;
  })
  .then((loaded) => {
    try { openTheBench(loaded); }
    catch (err) { bootFailed('opening the bench', err, 'the atlas loaded fine — see the console'); }
  })
  .catch(() => {});
