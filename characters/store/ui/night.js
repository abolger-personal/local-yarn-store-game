// Between days (game.html's #night): the shop's exterior at night, the door shut, and tomorrow's
// order on a clipboard hung beside it. It will grow into the ORDER SCREEN, where the player sets
// tomorrow's order; today the clipboard is read-only.
//
// It WAITS. Opening the door is the only way on, and nothing happens while it is shut: the player's
// pace changes how many chances they catch, never whether they can progress
// (ai_planning_sessions/PLAYING-AT-YOUR-PACE.md). The playground has no night; its clock opens
// tomorrow by itself (boot.js, tickClocks).
//
// What the clipboard shows IS what arrives: the order is built once, here at closing, and the
// same object is handed to restart({ order }), so deliver() never builds its own.

import { shop } from '../core/state.js';
import { planTomorrow, restart } from '../sim/world.js';
import { describeSlot } from '../../../inventory/supply.js';
import { dressExterior, exteriorMarkup, swingOpen } from './exterior.js';
import { INK, svgLettering } from './lettering.js';

const night = /** @type {HTMLDialogElement} */ (document.getElementById('night'));
const lines = document.getElementById('orderLines');
const board = document.getElementById('clipboard');
let order = null;   // tomorrow's, from closing until the door opens

const ROW = 70, TOP = 170, LEFT = 66, WIDE = 258;   // the clipboard's 360x540 drawing

/** One slot as a clipboard row: an empty box for a slot that will be the player's, a dot otherwise. */
function rowMarkup(slot, i) {
  const { line, detail, yours } = describeSlot(slot);
  const y = TOP + i * ROW;
  const mark = yours
    ? `<rect x="38" y="${y - 19}" width="18" height="18" fill="none" stroke="${INK}" stroke-width="2.5" />`
    : `<circle cx="47" cy="${y - 10}" r="4" fill="${INK}" />`;
  return mark
    + svgLettering(line.toUpperCase(), LEFT, y, { cap: 18, align: 'left', maxWidth: WIDE })
    + svgLettering(detail.toUpperCase(), LEFT, y + 24, { cap: 11, align: 'left', maxWidth: WIDE });
}

/** The sheet: whose order it is, a row per slot, and a line about the day that just ended. */
function sheetMarkup(day, signed) {
  const book = signed ? `${signed} SIGNED THE GUESTBOOK` : 'NO ONE SIGNED THE GUESTBOOK';
  return svgLettering(`ORDER FOR DAY ${day + 1}`, 180, 128, { cap: 20, maxWidth: 270 })
    + order.map(rowMarkup).join('')
    + svgLettering(`DAY ${day}: ${book}`, 180, 494, { cap: 11, maxWidth: 270 });
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

/** The shop has emptied: plan tomorrow, show it on the clipboard, and wait at the door. */
export function closeForTheNight() {
  order = planTomorrow();
  const signed = shop.world?.guestbook.length ?? 0;
  lines.innerHTML = sheetMarkup(shop.day, signed);
  board.setAttribute('aria-label', [`Order for day ${shop.day + 1}:`,
    ...order.map((s) => { const d = describeSlot(s); return `${d.line}, ${d.detail}${d.yours ? ' (yours to choose)' : ''}`; }),
    `Day ${shop.day}: ${signed} signed the Guestbook.`].join(' '));
  const door = document.getElementById('door');
  door.setAttribute('aria-label', `Open the shop for day ${shop.day + 1}`);
  door.classList.remove('open');
  night.classList.remove('leaving');
  night.showModal();   // focuses the door, its first focusable thing: Enter opens it
}
