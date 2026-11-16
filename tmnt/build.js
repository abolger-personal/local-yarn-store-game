// REUSE-SPEC.md §Build my playground: the builder's page. The playground from above, scrolling along; under it the
// pieces that have somewhere to go, each drawn from the side. Drag one on and it snaps to the nearest place it fits;
// tapped, it goes to the nearest place to the middle of what's showing. The rules are builder.js's.
import { BUILD, PAINTS, loadPaint, loadPlayground, middleOf, savePaint, savePlayground, snap, spotsFor, without } from './builder.js';
import { BAND, strip } from './generate.js';
import { FT, PIECES } from './pieces.js';

const el = (id) => document.getElementById(id);
const plan = el('plan'), wrap = el('plan-wrap'), tray = el('tray'), ghost = el('ghost');
const IDS = Object.keys(PIECES), MARGIN = 0.5, DEPTH = BAND.z1 - BAND.z0 + 2 * MARGIN, LONG = BUILD.x1 + BUILD.end + 2;
// the colour in hand: what the next piece is, and what a tapped piece turns
// picked: the piece on the playground that's tapped, to recolour or bin
let placed = loadPlayground(), drag = null, paint = loadPaint(), picked = -1;
// playtest 2026-11-15: ↩️ takes back the last change, whatever it was (a piece, a colour, the bin, ♻️ start again), up to
// UNDOS of them; kept for the visit, so a trip to play and back doesn't lose them
const UNDOS = 30, PAST = 'tmnt.playground.past.v1';
function loadPast() {
  try { return JSON.parse(sessionStorage.getItem(PAST)) ?? []; } catch { return []; }
}
let past = loadPast();
function keepPast() {
  try { sessionStorage.setItem(PAST, JSON.stringify(past)); } catch { /* no storage: undo lasts till the page goes */ }
}
function change(next) {
  past = [...past, placed].slice(-UNDOS);
  placed = next;
  keepPast();
}
function undo() {
  if (!past.length) return;
  placed = past[past.length - 1];
  past = past.slice(0, -1);
  keepPast();
}
const INK = 'fill="none" stroke="#141414" stroke-linecap="round" stroke-linejoin="round"';
const H = 14, up = (v) => H - v;
const line = (x0, y0, x1, y1, w) => `<path d="M${x0} ${up(y0)}L${x1} ${up(y1)}" stroke-width="${w}"/>`;
const ticks = (x0, x1, n, f) => Array.from({ length: n }, (_, i) => f(x0 + ((i + 0.5) * (x1 - x0)) / n)).join('');
const posts = (d, y = d.y) => line(d.x0 + 0.3, 0, d.x0 + 0.3, y, 0.3) + line(d.x1 - 0.3, 0, d.x1 - 0.3, y, 0.3);
// playtest 2026-11-15: each picture has to say what it is. Monkey bars are a ladder on its side
const RUNG = 1.3;
const rungIcon = (d) => line(d.x0, d.y, d.x1, d.y, 0.4) + line(d.x0, d.y - RUNG, d.x1, d.y - RUNG, 0.4) + ticks(d.x0, d.x1, 6, (x) => line(x, d.y - RUNG, x, d.y, 0.3)) + posts(d);
const deckIcon = (d) => (d.rungs ? rungIcon(d) : line(d.x0, d.y, d.x1, d.y, 0.8) + posts(d));
// the bridge sags, in planks, hung by ropes from a rail
const SAG = 1.6, RAIL = 2.5;
const sag = (b, y, more) => `<path d="M${b.x0} ${up(y)}Q${(b.x0 + b.x1) / 2} ${up(y - 2 * SAG)} ${b.x1} ${up(y)}" ${more}/>`;
const sagAt = (b, x) => b.y - 4 * SAG * ((x - b.x0) / (b.x1 - b.x0)) * ((b.x1 - x) / (b.x1 - b.x0));
const bridgeIcon = (b) => sag(b, b.y, 'stroke-width="0.9" stroke-linecap="butt" stroke-dasharray="1 0.4"') + sag(b, b.y + RAIL, 'stroke-width="0.3"')
  + ticks(b.x0, b.x1, 5, (x) => line(x, sagAt(b, x), x, sagAt(b, x) + RAIL, 0.2)) + posts(b, b.y + RAIL);
const rungsUp = (at) => [0.25, 0.5, 0.75].map((t) => { const q = at(t); return line(q.x - 0.6, q.y, q.x + 0.6, q.y, 0.3); }).join('');
// the dome curves up and over, the bear cave's mouth beside it
const domeIcon = (k) => [`<path d="M${k.x0} ${up(k.y0)}Q${k.x0} ${up(k.y1)} ${k.x1} ${up(k.y1)}" stroke-width="0.5"/>`,
  rungsUp((t) => ({ x: k.x0 + t * t * (k.x1 - k.x0), y: k.y0 + (1 - (1 - t) ** 2) * (k.y1 - k.y0) })),
  `<path d="M${k.x1 + 1.2} ${up(0)}V${up(2)}a1.5 1.5 0 0 1 3 0V${up(0)}" stroke-width="0.4"/>`].join('');
const ladderIcon = (k) => line(k.x0, k.y0, k.x1, k.y1, 0.5) + rungsUp((t) => ({ x: k.x0 + (k.x1 - k.x0) * t, y: k.y0 + (k.y1 - k.y0) * t }));
const climbIcon = (k) => (k.kind === 'dome' ? domeIcon(k) : ladderIcon(k));
const rideIcon = (q) => (q.kind === 'pole' ? line(q.x0, 0, q.x0, q.top ?? q.y0, 0.45) : line(q.x0, q.y0, q.x1, q.y1, 1.1));
// a bar across two posts, not a ball on a stick
const barIcon = (s) => line(s.x - 0.5, 0, s.x - 0.5, s.y, 0.25) + line(s.x + 0.5, 0, s.x + 0.5, s.y, 0.25) + line(s.x - 0.65, s.y, s.x + 0.65, s.y, 0.4);
const frameIcon = (s) => [line(s.x - 2, 0, s.x, s.y, 0.4), line(s.x + 2, 0, s.x, s.y, 0.4), line(s.x, s.y, s.x, s.y - s.arm, 0.2), line(s.x - 0.8, s.y - s.arm, s.x + 0.8, s.y - s.arm, 0.5)].join('');
const swingIcon = (s) => (s.kind === 'bar' ? barIcon(s) : frameIcon(s));
const partsOf = (p) => [...(p.decks ?? []), ...(p.bridge ? [{ y: p.bridge.y + RAIL }] : []), ...(p.climbs ?? []), ...(p.rides ?? []), ...(p.stairs ?? []), ...(p.swings ?? [])];
/** How tall piece `p` stands, in feet: its picture is cut to that, so a low piece isn't drawn tiny. */
const tall = (p) => Math.max(4, ...partsOf(p).flatMap((q) => [q.y, q.y0, q.y1, q.top].filter(Number.isFinite)));
/** Piece `p` from the side, as its numbers in pieces.js draw it. */
function picture(p, box = '') {
  const parts = [...(p.decks ?? []).map(deckIcon), ...(p.bridge ? [bridgeIcon(p.bridge)] : []), ...(p.climbs ?? []).map(climbIcon),
    ...(p.rides ?? []).filter((q) => q.kind !== 'monkey').map(rideIcon), ...(p.stairs ?? []).map((q) => line(q.x0, q.y0, q.x1, q.y1, 0.6)), ...(p.swings ?? []).map(swingIcon)];
  const top = tall(p);
  return `<svg ${box} viewBox="-1 ${H - top - 1} ${p.w + 2} ${top + 2}" preserveAspectRatio="xMidYMid meet"><g ${INK}>${parts.join('')}</g></svg>`;
}

const boxOf = (id, at) => strip(at, 0, PIECES[id].w * FT);
const rect = (b, cls, fill = '') => `<rect class="${cls}" x="${b.x0}" y="${b.z0}" width="${b.x1 - b.x0}" height="${b.z1 - b.z0}" rx="0.12" ${fill && `fill="${fill}"`}/>`;
function pieceOnPlan({ id, at, colour }, i) {
  const b = boxOf(id, at);
  return `<g class="piece${i === picked ? ' picked' : ''}" data-i="${i}">${rect(b, '', colour ?? PAINTS[0])}${picture(PIECES[id], `x="${b.x0}" y="${b.z0}" width="${b.x1 - b.x0}" height="${b.z1 - b.z0}"`)}</g>`;
}

function drawPlan(hint = null) {
  const end = Math.max(BUILD.least, ...placed.map((q) => boxOf(q.id, q.at).x1 + BUILD.end));
  plan.setAttribute('viewBox', `0 ${BAND.z0 - MARGIN} ${LONG} ${DEPTH}`);
  plan.style.width = `${(wrap.clientHeight * LONG) / DEPTH}px`;
  plan.innerHTML = [`<rect x="0" y="${BAND.z0}" width="${end}" height="${BAND.z1 - BAND.z0}" fill="#7f97d6"/>`,
    `<text x="1" y="0.3" font-size="1" text-anchor="middle">🐢</text><text x="${end - 1}" y="0.4" font-size="1.4" text-anchor="middle">🍕</text>`,
    ...placed.map(pieceOnPlan), hint ? rect(boxOf(hint.id, hint.at), 'hint') : ''].join('');
}

function drawTray() {
  tray.innerHTML = IDS.filter((id) => spotsFor(placed, id).length)
    .map((id) => `<button data-piece="${id}" aria-label="${id}" style="background:${paint}">${picture(PIECES[id])}</button>`).join('');
  /** @type {HTMLButtonElement} */ (el('undo')).disabled = !past.length;
  /** @type {HTMLButtonElement} */ (el('clear')).disabled = !placed.length;
  /** @type {HTMLButtonElement} */ (el('bin')).disabled = picked < 0;
  drawArrows();
}

function redraw() {
  if (picked >= placed.length) picked = -1;
  savePlayground(placed);
  drawPlan();
  drawTray();
}

/** The point of the playground under a finger, or null when it isn't over the plan. */
function pointAt(e) {
  const w = wrap.getBoundingClientRect();
  if (e.clientY < w.top || e.clientY > w.bottom) return null;
  const p = plan.getBoundingClientRect();
  return { x: ((e.clientX - p.left) / p.width) * LONG, z: BAND.z0 - MARGIN + ((e.clientY - p.top) / p.height) * DEPTH };
}
/** A tapped piece goes nearest the middle of what's showing. */
const middleShowing = () => ({ x: ((wrap.scrollLeft + wrap.clientWidth / 2) / plan.getBoundingClientRect().width) * LONG, z: 0 });

const EDGE = 48, CREEP = 14;
function dragTo(e) {
  if (!drag) return;
  const at = pointAt(e), w = wrap.getBoundingClientRect();
  Object.assign(ghost.style, { left: `${e.clientX}px`, top: `${e.clientY}px` });
  if (at) wrap.scrollLeft += CREEP * (Number(e.clientX > w.right - EDGE) - Number(e.clientX < w.left + EDGE));
  drag.spot = snap(drag.spots, drag.id, at ?? middleShowing());
  drawPlan(drag.spot && { id: drag.id, at: drag.spot });
}

function letGo() {
  if (!drag) return;
  if (drag.spot) change([...placed, { id: drag.id, at: drag.spot, colour: paint }]);
  picked = -1;
  const mid = drag.spot && middleOf(drag.id, drag.spot);
  drag = null;
  ghost.hidden = true;
  redraw();
  // keep the new piece in sight
  if (mid) wrap.scrollLeft = (mid.x / LONG) * plan.getBoundingClientRect().width - wrap.clientWidth / 2;
}

tray.addEventListener('pointerdown', (e) => {
  const b = /** @type {HTMLElement} */ (e.target).closest('button');
  if (!b) return;
  const id = b.dataset.piece;
  drag = { id, spots: spotsFor(placed, id), spot: null };
  ghost.innerHTML = picture(PIECES[id]);
  ghost.hidden = false;
  b.setPointerCapture(e.pointerId);
  dragTo(e);
});
tray.addEventListener('pointermove', dragTo);
tray.addEventListener('pointerup', letGo);
tray.addEventListener('pointercancel', () => { drag = null; ghost.hidden = true; drawPlan(); });

// a piece on the playground tapped is picked (tapped again, or the ground, let go): a colour tapped then is its
// colour, and the bin takes it away, with anything that stood on it. A colour tapped is the colour in hand, kept
el('paints').innerHTML = PAINTS.map((c) => `<button data-paint="${c}" aria-label="colour ${c}" style="background:${c}"></button>`).join('');
function pickPaint(c) {
  paint = c;
  savePaint(c);
  if (picked >= 0 && placed[picked].colour !== c) change(placed.map((q, i) => (i === picked ? { ...q, colour: c } : q)));
  for (const b of el('paints').children) b.setAttribute('aria-pressed', String(/** @type {HTMLElement} */ (b).dataset.paint === c));
  redraw();
}
el('paints').addEventListener('click', (e) => {
  const b = /** @type {HTMLElement} */ (e.target).closest('button');
  if (b) pickPaint(b.dataset.paint);
});
plan.addEventListener('click', (e) => {
  const g = /** @type {Element} */ (e.target).closest('.piece');
  const i = g ? Number(/** @type {HTMLElement} */ (g).dataset.i) : -1;
  picked = i === picked ? -1 : i;
  redraw();
});
pickPaint(paint);

// the arrows page the tray, most of what's showing at a time, and are off at its ends
const PAGE = 0.8;
function drawArrows() {
  /** @type {HTMLButtonElement} */ (el('back')).disabled = tray.scrollLeft < 1;
  /** @type {HTMLButtonElement} */ (el('on')).disabled = tray.scrollLeft + tray.clientWidth > tray.scrollWidth - 1;
}
el('back').addEventListener('click', () => tray.scrollBy({ left: -PAGE * tray.clientWidth }));
el('on').addEventListener('click', () => tray.scrollBy({ left: PAGE * tray.clientWidth }));
tray.addEventListener('scroll', drawArrows);
el('undo').addEventListener('click', () => { undo(); picked = -1; redraw(); });
el('bin').addEventListener('click', () => { change(without(placed, picked)); picked = -1; redraw(); });
el('clear').addEventListener('click', () => { change([]); picked = -1; redraw(); });
el('bye').addEventListener('click', () => { location.href = 'lobby.html'; });
el('go').addEventListener('click', () => { savePlayground(placed); location.href = 'level.html?stage=playground&built=1'; });
addEventListener('resize', () => { drawPlan(); drawArrows(); });
redraw();
