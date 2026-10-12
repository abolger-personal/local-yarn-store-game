// The label: a paper ball band on the right edge of the screen (TUTORIAL.md §7.1).
//
// Passive: it listens to the pointer beside input.js rather than inside it, and only ever reads
// the shop. Hovering an item (mouse) or picking one up (any pointer) puts its band up; it stays
// after the item is set down, until something else is hovered or picked up, or bare floor is
// clicked, so it can be read while arranging. Only clicking a customer swaps it for their tag
// (guestbook.js tagCard); pointing at one without a click counts as watching them (shop.watched, read by world.js markInView).

import * as THREE from 'three';
import { EMPTY } from '../../../inventory/grid.js';
import { ACTION, STATE } from '../../visit.js';
import { bandCard, tagCard } from '../../guestbook.js';
import { S } from '../core/config.js';
import { cast, drag, items, shop } from '../core/state.js';
import { renderer } from '../scene/stage.js';
import { pickCandidate, raycaster, setRayFromEvent } from '../interact/pointer.js';
import { CELL, INK, layout, svgLettering } from './lettering.js';

const band = document.getElementById('band');

// The heading's drawing, in its own units: 300 wide (the band's 150px), the heading at cap 26.
const W = 300, PAD = 22, HEAD = 26, LEAD = 0.75, RULE_GAP = 12;

/** Greedy word wrap to the band's width; one word too long for a line is shrunk by svgLettering. */
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

/**
 * The band: its heading in the house lettering, ruled off like a printed band, then the card's
 * body as HTML (guestbook.js bandCard / tagCard), styled by #band in game.html.
 */
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

let shown = null;   // the item or customer on the band now

/** The pattern a customer is knitting right now, if they are sitting at it as the player looks. */
function knittingNow(npc) {
  if (npc.action?.type !== ACTION.WORK_ON_WIP || npc.seat === null) return null;
  return npc.wips.find((w) => w.id === npc.action.params.wip)?.pattern ?? null;
}

// A customer has a visit's `bought` list; an item never does.
const isCustomer = (thing) => Array.isArray(thing.bought);
const cardOf = (thing) => (isCustomer(thing) ? tagCard(thing, knittingNow(thing)) : bandCard(thing));

function show(thing) {
  if (!thing || thing === shown) return;
  shown = thing;
  drawBand(cardOf(thing));
}

/** Redraw what is up when the sim moves on: a customer's tag grows as they buy. */
export function redrawLabel() {
  if (shown && isCustomer(shown)) drawBand(cardOf(shown));
}

const box = new THREE.Box3(), hit = new THREE.Vector3();

/**
 * The customer under the pointer, nearest first, or null. Their bounding box, not their mesh: a
 * skinned body is costly to raycast exactly, and a box is what a click on a person means anyway.
 */
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

/** Hover: a mouse over stock shows its band. Touch has no hover; its band comes with the pick-up. */
function onMove(event) {
  if (!onCanvas(event)) return;
  if (drag.index !== EMPTY) { show(items[drag.index]); return; }
  if (event.pointerType !== 'mouse') return;
  const found = pickCandidate(event);
  if (found) show(items[found.index]);
  else customerAt(event);   // pointing at a customer is watching them; the click shows the tag
}

const TAP_SLOP = 8;   // px: a press that moves further is an orbit drag, not a click
let bare = null;     // where a press on nothing landed, until it lifts

/** Press: input.js has already run (it captures first), so a pick-up is in hand by now. */
function onDown(event) {
  bare = null;
  if (!onCanvas(event) || event.button !== 0) return;
  if (drag.index !== EMPTY) { show(items[drag.index]); return; }
  const npc = customerAt(event);
  if (npc) show(npc);
  else if (!pickCandidate(event)) bare = { x: event.clientX, y: event.clientY };
}

/** A click (not a drag) on bare floor puts the label away. */
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
