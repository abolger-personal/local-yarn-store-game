// The debug, timer and performance overlays.
//
// Extracted from the single 3,200-line module that used to live inline in store.html.

import { cast, items, shop, clocks } from '../core/state.js';
import { esc } from '../core/util.js';
import { S } from '../core/config.js';
import { labelOf, maxWips, STATE, TRAITS, labelWant } from '../../visit.js';
import { WIP_STATE, describeWip, WEAR_SLOTS } from '../../wip.js';
import { renderer } from '../scene/stage.js';
import { guestbookLine } from './book.js';

import { doAdvanceRound, doTidy, restart } from '../sim/world.js';

// ---------------------------------------------------------------- debug window
const npcStateEl = document.getElementById('npcState');

/** One labelled row in an NPC card. */
const row = (k, v) => `<div class="row"><span class="k">${k}</span><span>${esc(v)}</span></div>`;
/** A row whose value is a thing the NPC has hold of — highlighted, because it is the payoff. */
const got = (k, v) => `<div class="row"><span class="k">${k}</span><span class="got">${esc(v)}</span></div>`;

/** Who they are: swatch, name, species, and what they came in for. */
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

/** What the sim decided this round, and where it put them. */
function npcState(n) {
  return `${row('round', `${n.roundsInStore} / ${n.maxRounds} MAX_ROUNDS`)}
    ${row('action', n.action ? n.action.type : '—')}
    ${row('last action', n.lastAction ? n.lastAction.type : '—')}
    ${row('prescribed', n.prescribed ? n.prescribed.type : 'None')}
    ${row('at display', n.atDisplay ?? '—')}
    ${row('seat', n.seat ?? '—')}
    ${row('restructured', n.restructured.length ? n.restructured.join(', ') : '—')}`;
}

/** Their projects, what they are wearing, and how they are leaving. */
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

/**
 * The Guestbook is the emotional payoff of the loop (LYS.md 5c), and it is real data rather than
 * a log line — so it gets its own block. A photo means they had a finished object; a note means
 * they did not, and says whether they left happy.
 */
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

// ---------------------------------------------------------------- timer window
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
  // Stretched to the day, not 15 minutes a round: opening is 10:00 and the last customer out is
  // 17:00 however many rounds that took, so the clock always agrees with the light (shop.dayT).
  const minutes = Math.round(shop.dayT * 7 * 4) * 15;
  const hh = String(10 + Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  const live = shop.world.npcs.filter((n) => n.state !== STATE.GONE).length;
  const inDoor = shop.world.npcs.find((n) => n.id === shop.world.door.busy);
  clockLabel.textContent = `${hh}:${mm} · ${live}/${shop.world.npcs.length} visiting${inDoor ? ` · door: ${inDoor.name}` : ' · door clear'}`;
  advanceBtn.disabled = live === 0 && !S.autoDay;
  advanceBtn.textContent = advanceLabel(live);
}

/** The advance button's label: a round to play, or a shop that has emptied. */
function advanceLabel(live) {
  if (live > 0) return 'Advance round →';
  return S.autoDay ? 'closing up…' : 'everyone has gone home — start next shop.day';
}

// ---------------------------------------------------------------- perf overlay
// Copied from crowd.html unchanged, so numbers from the two views are directly comparable.
const perfEl = document.getElementById('perfBody');

let fps = 60, lastPerf = 0;

/** A reading's colour on the overlay: fine, getting there, or over budget. */
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

/** Everything this module does ONCE, at boot. Called from main.js, in order. */
export function installHud() {
  // Once the shop is empty the button becomes the way to open tomorrow, so a manual player is not
  // stuck staring at a disabled control with the GUI folder as their only way on.
  advanceBtn.addEventListener('click', () => {
    if (shop.world && shop.world.npcs.every((n) => n.state === STATE.GONE)) restart();
    else doAdvanceRound();
  });
  document.getElementById('tidy').addEventListener('click', doTidy);
  // The boxes drive S.autoRounds / S.autoDay, which is what the clocks read (boot.js) — so the
  // game page, which has no boxes, runs the same clocks off the defaults. Read once at install as
  // well, because a browser restores a checkbox's state across a reload.
  const syncAuto = () => { S.autoRounds = autoBox.checked; S.autoDay = autoDayBox.checked; };
  syncAuto();
  autoBox.addEventListener('change', () => { syncAuto(); clocks.auto = 0; });
  autoDayBox.addEventListener('change', () => { syncAuto(); clocks.day = 0; drawTimer(); });
}
