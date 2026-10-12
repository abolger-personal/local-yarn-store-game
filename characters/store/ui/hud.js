import { cast, items, shop, clocks } from '../core/state.js';
import { esc } from '../core/util.js';
import { S } from '../core/config.js';
import { labelOf, maxWips, STATE, TRAITS, labelWant } from '../../visit.js';
import { WIP_STATE, describeWip, WEAR_SLOTS } from '../../wip.js';
import { renderer } from '../scene/stage.js';
import { guestbookLine } from './book.js';

import { doAdvanceRound, doTidy, restart } from '../sim/world.js';

const npcStateEl = document.getElementById('npcState');

const row = (k, v) => `<div class="row"><span class="k">${k}</span><span>${esc(v)}</span></div>`;
const got = (k, v) => `<div class="row"><span class="k">${k}</span><span class="got">${esc(v)}</span></div>`;

function npcHeader(n, rec) {
  return `<span class="state ${n.state}">${n.state}</span>
    <div class="who"><i class="swatch" style="background:${rec?.color ?? '#999'}"></i>${esc(n.name)}
      <span class="k">· ${esc(n.species)}</span></div>
    ${row('wants', labelWant(n.target))}
    ${row('craft', `skill ${n.prefs.skill} · ${n.prefs.crafts.join('/')}`)}
    ${n.visits > 1 ? row('regular', `visit #${n.visits}`) : ''}
    ${n.considering ? got('considering', labelOf(items[n.considering.index])) : ''}
    ${n.carrying ? got('carrying', `${labelOf(n.carrying)} ✓`) : ''}`;
}

function npcState(n) {
  return `${row('round', `${n.roundsInStore} / ${n.maxRounds} MAX_ROUNDS`)}
    ${row('action', n.action ? n.action.type : '—')}
    ${row('last action', n.lastAction ? n.lastAction.type : '—')}
    ${row('prescribed', n.prescribed ? n.prescribed.type : 'None')}
    ${row('at display', n.atDisplay ?? '—')}
    ${row('seat', n.seat ?? '—')}
    ${row('restructured', n.restructured.length ? n.restructured.join(', ') : '—')}`;
}

function npcCraft(n) {
  const wips = n.wips.map((w) =>
    `<div class="wip ${w.state === WIP_STATE.FINISHED ? 'done' : ''}">`
    + `<span class="k">${esc(w.state.toLowerCase())}</span> ${esc(describeWip(w))}</div>`).join('');
  return `${row('WIPs', `${n.wips.length} of max ${maxWips(n.traits)}`)}
    <div class="wips">${wips}</div>
    ${row('worn', WEAR_SLOTS.filter((s) => n.worn[s]).join(', ') || '—')}
    ${n.closeout.length
      ? row('closeout', n.closeout.map((s) => (s === n.closeout[n.closeoutStep] ? `▸${s}` : s)).join(' · '))
      : ''}`;
}

function npcCard(n, rec) {
  const traits = TRAITS.map((t) =>
    `<div><span class="k">${t.slice(0, 9)}</span><b>${n.traits[t]}</b></div>`).join('');
  return `<div class="npc">
    ${npcHeader(n, rec)}
    ${npcState(n)}
    ${npcCraft(n)}
    ${row('position', `${n.x.toFixed(2)}, ${n.z.toFixed(2)}`)}
    <div class="traits">${traits}</div>
    ${n.note ? `<div class="note">${esc(n.note)}</div>` : ''}
  </div>`;
}

const guestbookBlock = () => `<div class="book"><button class="open-book k" title="open the guestbook">guestbook</button>${
  shop.world.guestbook.length
    ? shop.world.guestbook.map((g, i) => guestbookLine(g, i)).slice(-6).reverse().join('')
    : '<div>no entries yet</div>'}</div>`;

const logBlock = () =>
  `<div class="log">${shop.world.log.slice(-6).reverse().map((l) => `<div>${esc(l)}</div>`).join('')}</div>`;

export function drawDebug() {
  if (!shop.world) return;
  npcStateEl.innerHTML = shop.world.npcs.map((n, i) => npcCard(n, cast[i])).join('')
    + guestbookBlock() + logBlock();
}

const roundLabel = document.getElementById('roundLabel');

const clockLabel = document.getElementById('clockLabel');

export const autoBar = document.getElementById('autoBar');

const autoBox = /** @type {HTMLInputElement} */ (document.getElementById('auto'));

const autoDayBox =
  /** @type {HTMLInputElement} */ (document.getElementById('autoDay'));

const advanceBtn = /** @type {HTMLButtonElement} */ (document.getElementById('advance'));

export function drawTimer() {
  if (!shop.world) return;
  roundLabel.textContent = `shop.day ${shop.day} · round ${shop.world.round}`;
  // STORE-SCENE.md §The shop clock
  const minutes = Math.round(shop.dayT * 7 * 4) * 15;
  const hh = String(10 + Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  const live = shop.world.npcs.filter((n) => n.state !== STATE.GONE).length;
  const inDoor = shop.world.npcs.find((n) => n.id === shop.world.door.busy);
  clockLabel.textContent = `${hh}:${mm} · ${live}/${shop.world.npcs.length} visiting${inDoor ? ` · door: ${inDoor.name}` : ' · door clear'}`;
  advanceBtn.disabled = live === 0 && !S.autoDay;
  advanceBtn.textContent = advanceLabel(live);
}

function advanceLabel(live) {
  if (live > 0) return 'Advance round →';
  return S.autoDay ? 'closing up…' : 'everyone has gone home — start next shop.day';
}

const perfEl = document.getElementById('perfBody');

let fps = 60, lastPerf = 0;

function cls(v, warn, bad) {
  if (v >= bad) return 'bad';
  return v >= warn ? 'warn' : 'ok';
}

export function updatePerf(dt) {
  fps += (1 / Math.max(dt, 1e-4) - fps) * 0.06;
  if (performance.now() - lastPerf < 250) return;
  lastPerf = performance.now();

  const r = renderer.info.render;
  const mem = renderer.info.memory;
  const tri = r.triangles;

  perfEl.innerHTML =
    `<b>${fps.toFixed(0)} fps</b><br>` +
    `draw calls <span class="${cls(r.calls, 120, 400)}">${r.calls}</span><br>` +
    `triangles  <span class="${cls(tri, 4e5, 1.2e6)}">${(tri / 1000).toFixed(0)}k</span><br>` +
    `geometries ${mem.geometries}<br>` +
    `textures   ${mem.textures}<br>` +
    `programs   ${renderer.info.programs?.length ?? 0}<br>` +
    `<span style="opacity:.65">${cast.length} NPCs @ ${S.detail} · ${items.length} notions</span><br />` +
    `<span style="opacity:.65">${(r.calls / Math.max(cast.length, 1)).toFixed(0)} calls/character</span>`;
}

export function installHud() {
  advanceBtn.addEventListener('click', () => {
    if (shop.world && shop.world.npcs.every((n) => n.state === STATE.GONE)) restart();
    else doAdvanceRound();
  });
  document.getElementById('tidy').addEventListener('click', doTidy);
  const syncAuto = () => { S.autoRounds = autoBox.checked; S.autoDay = autoDayBox.checked; };
  syncAuto();
  autoBox.addEventListener('change', () => { syncAuto(); clocks.auto = 0; });
  autoDayBox.addEventListener('change', () => { syncAuto(); clocks.day = 0; drawTimer(); });
}
