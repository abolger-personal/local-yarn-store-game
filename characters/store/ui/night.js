// Between days (game.html's #night): the shop's exterior at night, the door shut, and tomorrow's
// order as parcels on the step with a packing slip taped to the top one (TUTORIAL.md §7.2). It will
// grow into the ORDER SCREEN, where the player fills the slip's blank lines; today it is read-only.
//
// It WAITS. Opening the door is the only way on, and nothing happens while it is shut: the player's
// pace changes how many chances they catch, never whether they can progress
// (ai_planning_sessions/PLAYING-AT-YOUR-PACE.md). The playground has no night; its clock opens
// tomorrow by itself (boot.js, tickClocks).
//
// What the slip shows IS what arrives: the order is built once, here at closing, and the
// same object is handed to restart({ order }), so deliver() never builds its own.

import { shop } from '../core/state.js';
import { planTomorrow, restart } from '../sim/world.js';
import { describeSlot } from '../../../inventory/supply.js';
import { dressExterior, exteriorMarkup, swingOpen } from './exterior.js';
import { CELL, INK, layout, svgLettering } from './lettering.js';

const night = /** @type {HTMLDialogElement} */ (document.getElementById('night'));
const lines = document.getElementById('orderLines');
const slip = document.getElementById('parcels');
let order = null;   // tomorrow's, from closing until the door opens

const ROW = 60, TOP = 268, LEFT = 74, WIDE = 244, MID = LEFT + WIDE / 2;   // the slip, in the parcels' 420x660
const SUPPLIER = 'WOOL & CO. SUPPLY';
const DETAIL = 11;   // cap of a line's limits
const rule = (y, from = LEFT) => `<path d="M${from} ${y} H${LEFT + WIDE}" stroke="${INK}" stroke-width="1.5" />`;

/**
 * One slot as a slip line, quantity × item over its limits. A slot that will be the player's is a
 * blank write-in line after its quantity: choosing is not built yet, so the supplier fills it.
 */
function rowMarkup(slot, i) {
  const { count, item, detail, yours } = describeSlot(slot);
  const y = TOP + i * ROW;
  const qty = `${count} ×`;
  const what = yours
    ? svgLettering(qty, LEFT, y, { cap: 18, align: 'left' })
      + rule(y, LEFT + layout(qty).width * 18 / CELL + 8)
    : svgLettering(`${qty} ${item}`.toUpperCase(), LEFT, y, { cap: 18, align: 'left', maxWidth: WIDE });
  return what + wrap(detail.toUpperCase()).map((t, j) =>
    svgLettering(t, LEFT, y + 20 + j * 14, { cap: DETAIL, align: 'left', maxWidth: WIDE })).join('');
}

/** A line's limits on at most two lines, broken at a comma, so a kit's long one stays legible. */
function wrap(text) {
  const fits = (t) => layout(t).width * DETAIL / CELL <= WIDE;
  if (fits(text)) return [text];
  const parts = text.split(', ');
  let cut = parts.length - 1;
  while (cut > 1 && !fits(parts.slice(0, cut).join(', '))) cut--;
  return [`${parts.slice(0, cut).join(', ')},`, parts.slice(cut).join(', ')];
}

/** The slip: who sends it, to whom, when it comes, and a line per slot. */
function slipMarkup(day) {
  return svgLettering(SUPPLIER, MID, 160, { cap: 20, maxWidth: WIDE }) + rule(174)
    + svgLettering('FOR: LOCAL YARN STORE', LEFT, 202, { cap: 12, align: 'left', maxWidth: WIDE })
    + svgLettering(`ARRIVES: DAY ${day + 1}, MORNING`, LEFT, 224, { cap: 12, align: 'left', maxWidth: WIDE })
    + rule(238) + order.map(rowMarkup).join('');
}

function openTomorrow() {
  restart({ order });
  order = null;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { night.close(); return; }
  night.classList.add('leaving');   // fades out over the shop; the door's swing has already ended
  night.addEventListener('transitionend', function gone(e) {
    if (e.target !== night) return;
    night.removeEventListener('transitionend', gone);
    night.close();
  });
}

/** Draw the exterior into #night, once, and make the door open tomorrow. */
export function installNight() {
  const entry = night.querySelector('.doorway');
  entry.innerHTML = exteriorMarkup({ href: '#', label: 'Open the shop', tip: ['Closed —', 'back tomorrow'] });
  dressExterior(entry);
  const door = document.getElementById('door');
  door.addEventListener('click', (e) => {
    e.preventDefault();
    if (order && !door.classList.contains('open')) swingOpen(door, openTomorrow);
  });
  // A modal dialog shuts on Escape. Not this one: the door is the way out, and it opens the shop.
  night.addEventListener('cancel', (e) => e.preventDefault());
  // A browser may still force it shut (a second Escape with no click between). Then put it back,
  // or the shop would sit empty with no door to open.
  night.addEventListener('close', () => { if (order) night.showModal(); });
}

/** The shop has emptied: plan tomorrow, show it on the packing slip, and wait at the door. */
export function closeForTheNight() {
  order = planTomorrow();
  lines.innerHTML = slipMarkup(shop.day);
  slip.setAttribute('aria-label', [`Packing slip from ${SUPPLIER}, for Local Yarn Store, arrives day ${shop.day + 1}, morning:`,
    ...order.map((s) => { const d = describeSlot(s); return `${d.count} × ${d.yours ? 'blank, yours to choose' : d.item}, ${d.detail}.`; })].join(' '));
  const door = document.getElementById('door');
  door.setAttribute('aria-label', `Open the shop for day ${shop.day + 1}`);
  door.classList.remove('open');
  night.classList.remove('leaving');
  night.showModal();   // focuses the door, its first focusable thing: Enter opens it
}
