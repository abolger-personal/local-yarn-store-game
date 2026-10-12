import { shop } from '../core/state.js';
import { planTomorrow, restart } from '../sim/world.js';
import { choicesFor, describeSlot } from '../../../inventory/supply.js';
import { dressExterior, exteriorMarkup, swingOpen } from './exterior.js';
import { CELL, INK, layout, svgLettering } from './lettering.js';
import { closeBook, openBook } from './book.js';

const night = /** @type {HTMLDialogElement} */ (document.getElementById('night'));
const lines = document.getElementById('orderLines');
const slip = document.getElementById('parcels');
let order = null;
let planned = null;

const ROW = 60, TOP = 268, LEFT = 74, WIDE = 244, MID = LEFT + WIDE / 2;
const SUPPLIER = 'WOOL & CO. SUPPLY';
const DETAIL = 11;
const rule = (y, from = LEFT) => `<path d="M${from} ${y} H${LEFT + WIDE}" stroke="${INK}" stroke-width="1.5" />`;

const blankFrom = (count) => LEFT + layout(`${count} ×`).width * 18 / CELL + 8;

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

function wrap(text) {
  const fits = (t) => layout(t).width * DETAIL / CELL <= WIDE;
  if (fits(text)) return [text];
  const parts = text.split(', ');
  let cut = parts.length - 1;
  while (cut > 1 && !fits(parts.slice(0, cut).join(', '))) cut--;
  return [`${parts.slice(0, cut).join(', ')},`, parts.slice(cut).join(', ')];
}

const words = (template) => { const d = describeSlot({ template, playerChoosable: false }); return `${d.item}, ${d.detail}`; };

function pickerMarkup(slot, i) {
  if (!slot.playerChoosable) return '';
  const x = blankFrom(slot.template.count), y = TOP + i * ROW;
  const options = choicesFor(slot).map((t, k) => `<option value="${k}">${words(t)}</option>`).join('');
  return `<foreignObject x="${x}" y="${y - 22}" width="${LEFT + WIDE - x}" height="28">`
    + `<select class="slip-pick" data-line="${i}" aria-label="Line ${i + 1}: ${slot.template.count} of what?">`
    + `<option value="">supplier's choice</option>${options}</select></foreignObject>`;
}

function slipMarkup(day) {
  const head = svgLettering(SUPPLIER, MID, 160, { cap: 20, maxWidth: WIDE }) + rule(174)
    + svgLettering('FOR: LOCAL YARN STORE', LEFT, 202, { cap: 12, align: 'left', maxWidth: WIDE })
    + svgLettering(`ARRIVES: DAY ${day + 1}, MORNING`, LEFT, 224, { cap: 12, align: 'left', maxWidth: WIDE })
    + rule(238);
  return `${head}<g data-rows>${order.map(rowMarkup).join('')}</g>${planned.map(pickerMarkup).join('')}`;
}

function describeSlip(day) {
  slip.setAttribute('aria-label', [`Packing slip from ${SUPPLIER}, for Local Yarn Store, arrives day ${day + 1}, morning:`,
    ...order.map((s) => {
      const d = describeSlot(s);
      return `${d.count} × ${d.yours && s.source !== 'player' ? 'blank, yours to choose' : d.item}, ${d.detail}.`;
    })].join(' '));
}

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
  night.classList.add('leaving');
  night.addEventListener('transitionend', function gone(e) {
    if (e.target !== night) return;
    night.removeEventListener('transitionend', gone);
    night.close();
  });
}

export function installNight() {
  const entry = night.querySelector('.doorway');
  entry.innerHTML = exteriorMarkup({ href: '#', label: 'Open the shop', tip: ['Closed —', 'back tomorrow'] });
  dressExterior(entry);
  const door = document.getElementById('door');
  door.addEventListener('click', (e) => {
    e.preventDefault();
    if (order && !door.classList.contains('open')) swingOpen(door, openTomorrow);
  });
  night.addEventListener('cancel', (e) => e.preventDefault());
  night.addEventListener('close', () => { if (order) night.showModal(); else closeBook(); });
  lines.addEventListener('change', onPick);
}

export function closeForTheNight() {
  planned = planTomorrow();
  order = [...planned];
  lines.innerHTML = slipMarkup(shop.day);
  describeSlip(shop.day);
  const door = document.getElementById('door');
  door.setAttribute('aria-label', `Open the shop for day ${shop.day + 1}`);
  door.classList.remove('open');
  night.classList.remove('leaving');
  night.showModal();
  openBook();
}
