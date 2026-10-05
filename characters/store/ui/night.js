// Between days (game.html's #night): the shop's exterior at night, the door shut, and tomorrow's
// order as parcels on the step with a packing slip taped to the top one (TUTORIAL.md §7.2). A line
// that is the player's is a blank with a native dropdown over it: what is chosen is lettered onto
// the line and arrives; left on "supplier's choice", the supplier's slot arrives as planned.
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
import { choicesFor, describeSlot } from '../../../inventory/supply.js';
import { dressExterior, exteriorMarkup, swingOpen } from './exterior.js';
import { CELL, INK, layout, svgLettering } from './lettering.js';

const night = /** @type {HTMLDialogElement} */ (document.getElementById('night'));
const lines = document.getElementById('orderLines');
const slip = document.getElementById('parcels');
let order = null;     // tomorrow's, from closing until the door opens, with the player's lines in
let planned = null;   // the same before the player wrote anything: "supplier's choice" puts it back

const ROW = 60, TOP = 268, LEFT = 74, WIDE = 244, MID = LEFT + WIDE / 2;   // the slip, in the parcels' 420x660
const SUPPLIER = 'WOOL & CO. SUPPLY';
const DETAIL = 11;   // cap of a line's limits
const rule = (y, from = LEFT) => `<path d="M${from} ${y} H${LEFT + WIDE}" stroke="${INK}" stroke-width="1.5" />`;

const blankFrom = (count) => LEFT + layout(`${count} ×`).width * 18 / CELL + 8;   // where the write-in starts

/**
 * One slot as a slip line, quantity × item over its limits. A line of the player's they have not
 * written on is a blank after its quantity, still showing its limits; written on, it reads as any
 * other line, underlined to say it is theirs and can be changed.
 */
function rowMarkup(slot, i) {
  const { count, item, detail, yours } = describeSlot(slot);
  const y = TOP + i * ROW;
  const qty = `${count} ×`;
  const what = yours && slot.source !== 'player'
    ? svgLettering(qty, LEFT, y, { cap: 18, align: 'left' }) + rule(y, blankFrom(count))
    : svgLettering(`${qty} ${item}`.toUpperCase(), LEFT, y, { cap: 18, align: 'left', maxWidth: WIDE })
      + (yours ? rule(y + 3, blankFrom(count)) : '');
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

const words = (template) => { const d = describeSlot({ template, playerChoosable: false }); return `${d.item}, ${d.detail}`; };

/**
 * A native dropdown laid over a player's blank: the browser's own control, so it opens from a
 * click, a tap or the keyboard. Invisible but for its focus ring; the slip's lettering is the look.
 */
function pickerMarkup(slot, i) {
  if (!slot.playerChoosable) return '';
  const x = blankFrom(slot.template.count), y = TOP + i * ROW;
  const options = choicesFor(slot).map((t, k) => `<option value="${k}">${words(t)}</option>`).join('');
  return `<foreignObject x="${x}" y="${y - 22}" width="${LEFT + WIDE - x}" height="28">`
    + `<select class="slip-pick" data-line="${i}" aria-label="Line ${i + 1}: ${slot.template.count} of what?">`
    + `<option value="">supplier's choice</option>${options}</select></foreignObject>`;
}

/** The slip: who sends it, to whom, when it comes, and a line per slot. */
function slipMarkup(day) {
  const head = svgLettering(SUPPLIER, MID, 160, { cap: 20, maxWidth: WIDE }) + rule(174)
    + svgLettering('FOR: LOCAL YARN STORE', LEFT, 202, { cap: 12, align: 'left', maxWidth: WIDE })
    + svgLettering(`ARRIVES: DAY ${day + 1}, MORNING`, LEFT, 224, { cap: 12, align: 'left', maxWidth: WIDE })
    + rule(238);
  return `${head}<g data-rows>${order.map(rowMarkup).join('')}</g>${planned.map(pickerMarkup).join('')}`;
}

/** What the slip says, for a screen reader: the same lines, the player's ones as written or blank. */
function describeSlip(day) {
  slip.setAttribute('aria-label', [`Packing slip from ${SUPPLIER}, for Local Yarn Store, arrives day ${day + 1}, morning:`,
    ...order.map((s) => {
      const d = describeSlot(s);
      return `${d.count} × ${d.yours && s.source !== 'player' ? 'blank, yours to choose' : d.item}, ${d.detail}.`;
    })].join(' '));
}

/** A line written on (or put back to the supplier's choice): it is what arrives. */
function onPick(event) {
  const pick = /** @type {HTMLSelectElement} */ (event.target);
  const i = Number(pick.dataset.line);
  order[i] = pick.value === '' ? planned[i]
    : { ...planned[i], template: choicesFor(planned[i])[Number(pick.value)], source: 'player' };
  lines.querySelector('[data-rows]').innerHTML = order.map(rowMarkup).join('');
  describeSlip(shop.day);
}

function openTomorrow() {
  restart({ order });
  order = planned = null;
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
  lines.addEventListener('change', onPick);
}

/** The shop has emptied: plan tomorrow, show it on the packing slip, and wait at the door. */
export function closeForTheNight() {
  planned = planTomorrow();
  order = [...planned];
  lines.innerHTML = slipMarkup(shop.day);
  describeSlip(shop.day);
  const door = document.getElementById('door');
  door.setAttribute('aria-label', `Open the shop for day ${shop.day + 1}`);
  door.classList.remove('open');
  night.classList.remove('leaving');
  night.showModal();   // focuses the door, its first focusable thing: Enter opens it
}
