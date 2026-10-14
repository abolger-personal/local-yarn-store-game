import * as THREE from 'three';
import { EMPTY } from '../../../inventory/grid.js';
import { ACTION, STATE } from '../../visit.js';
import { bandCard, tagCard } from '../../guestbook.js';
import { S } from '../core/config.js';
import { cast, drag, items, shop } from '../core/state.js';
import { renderer } from '../scene/stage.js';
import { pickCandidate, raycaster, seenAt, setRayFromEvent } from '../interact/pointer.js';
import { CELL, INK, layout, svgLettering } from './lettering.js';

const band = document.getElementById('band');

// VISUAL-DESIGN-2D.md §The label
const W = 300, PAD = 22, HEAD = 26, LEAD = 0.75, RULE_GAP = 12;

function wrap(text, cap) {
  const max = (W - PAD * 2) * CELL / cap;
  const rows = [];
  for (const word of text.split(' ')) {
    const joined = rows.length ? `${rows.at(-1)} ${word}` : word;
    if (rows.length && layout(joined).width <= max) rows[rows.length - 1] = joined;
    else rows.push(word);
  }
  return rows;
}

const escape = (s) => s.replace(/[&<"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '"': '&quot;' })[c]);

function drawBand({ head, body }) {
  let y = PAD, art = '';
  for (const row of wrap(head, HEAD)) {
    y += HEAD;
    art += svgLettering(row, PAD, y, { cap: HEAD, align: 'left', maxWidth: W - PAD * 2 });
    y += HEAD * LEAD;
  }
  art += `<path d="M${PAD} ${y} H${W - PAD}" stroke="${INK}" stroke-width="2" />`;
  const h = Math.round(y + RULE_GAP);
  band.innerHTML = `<h2><svg viewBox="0 0 ${W} ${h}" role="img" aria-label="${escape(head)}">${art}</svg></h2>${body}`;
  band.hidden = false;
}

let shown = null;

function knittingNow(npc) {
  if (npc.action?.type !== ACTION.WORK_ON_WIP || npc.seat === null) return null;
  return npc.wips.find((w) => w.id === npc.action.params.wip)?.pattern ?? null;
}

const isCustomer = (thing) => Array.isArray(thing.bought);
const cardOf = (thing) => (isCustomer(thing) ? tagCard(thing, knittingNow(thing)) : bandCard(thing));

function show(thing) {
  if (!thing || thing === shown) return;
  shown = thing;
  drawBand(cardOf(thing));
}

export function redrawLabel() {
  if (shown && isCustomer(shown)) drawBand(cardOf(shown));
}

const box = new THREE.Box3(), hit = new THREE.Vector3();

function customerAt(event) {
  setRayFromEvent(event);
  let best = null, bestD = Infinity;
  for (const rec of cast) {
    if (rec.npc.state === STATE.GONE || !rec.built.root.visible) continue;
    if (!raycaster.ray.intersectBox(box.setFromObject(rec.built.root), hit)) continue;
    const d = hit.distanceToSquared(raycaster.ray.origin);
    if (d < bestD) { bestD = d; best = rec.npc; }
  }
  if (best) shop.watched.add(best.id);
  return best;
}

const onCanvas = (event) => event.target === renderer.domElement && !S.moveMode;

function onMove(event) {
  if (!onCanvas(event)) return;
  if (drag.index !== EMPTY) { show(items[drag.index]); return; }
  if (event.pointerType !== 'mouse') return;
  const found = seenAt(event) ?? pickCandidate(event);
  if (found) show(items[found.index]);
  else customerAt(event);
}

const TAP_SLOP = 8;   // TUTORIAL.md §7.1
let bare = null;

function onDown(event) {
  bare = null;
  if (!onCanvas(event) || event.button !== 0) return;
  if (drag.index !== EMPTY) { show(items[drag.index]); return; }
  const npc = customerAt(event);
  if (npc) show(npc);
  else if (!pickCandidate(event)) bare = { x: event.clientX, y: event.clientY };
}

function onUp(event) {
  if (bare && Math.hypot(event.clientX - bare.x, event.clientY - bare.y) < TAP_SLOP && drag.index === EMPTY) {
    shown = null;
    band.hidden = true;
  }
  bare = null;
}

export function installLabel() {
  addEventListener('pointerdown', onDown, true);
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
}
