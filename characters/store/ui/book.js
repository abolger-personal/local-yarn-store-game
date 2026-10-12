import { shop } from '../core/state.js';
import { esc } from '../core/util.js';
import { photoFor } from './photo.js';
import { entryRows } from '../../guestbook.js';

const TAG_ICONS = {
  yarn: ['🧶', 'bought yarn'],
  pattern: ['📖', 'bought a pattern'],
  tool: ['🪡', 'bought a hook or needles'],
  lent: ['✨', 'lent a finished object to the shop'],
  chatted: ['🧑‍🤝‍🧑', 'chatted with another customer'],
  sat: ['🪑', 'sat and worked on a WIP'],
  ranOut: ['⏳', 'ran out of time before finding anything'],
  huff: ['💨', 'gave up and left in a huff'],
};

const pages = () => [...shop.pastBooks, { day: shop.day, entries: shop.world?.guestbook ?? [] }];

const open = new Set();

export function guestbookLine(g, i, page = shop.pastBooks.length) {
  const mood = g.kind === 'photo'
    ? `<button class="snap" data-page="${page}" data-entry="${i}" title="see the photo">📷 photo</button> ${esc(g.npc)} in ${esc(g.object)}`
    : `${g.mood === 'happy' ? '🙂' : '🙁'} ${esc(g.npc)} — ${esc(g.mood)}`;
  const tags = (g.tags ?? [])
    .filter((k) => TAG_ICONS[k])
    .map((k) => `<span title="${esc(TAG_ICONS[k][1])}">${TAG_ICONS[k][0]}</span>`)
    .join('');
  const line = `${mood}${tags ? ` <span class="tags">${tags}</span>` : ''}`;
  const rows = entryRows(g);
  if (!rows.length) return `<div>${line}</div>`;
  const key = `${page}/${i}`;
  return `<details class="entry" data-key="${key}"${open.has(key) ? ' open' : ''}><summary>${line}</summary>${
    rows.map((r) => `<div class="row">${r.icon} ${esc(r.text)}</div>`).join('')}</details>`;
}

const bookEl = /** @type {HTMLElement} */ (document.getElementById('book'));
const photoEl = /** @type {HTMLElement} */ (document.getElementById('photo'));
const olderBtn = /** @type {HTMLButtonElement} */ (document.getElementById('bookOlder'));
const newerBtn = /** @type {HTMLButtonElement} */ (document.getElementById('bookNewer'));

let showing = 0;

function lift() {
  const host = document.querySelector('dialog:modal') ?? document.body;
  if (bookEl.parentElement !== host) host.append(bookEl, photoEl);
}

function drawBook() {
  const all = pages();
  showing = Math.min(showing, all.length - 1);
  const { day, entries } = all[showing];
  const today = showing === all.length - 1;
  document.getElementById('bookDay').textContent = `Guestbook, day ${day}${today ? ' · today' : ''}`;
  olderBtn.disabled = showing === 0;
  newerBtn.disabled = today;
  document.getElementById('bookEntries').innerHTML = entries.length
    ? entries.map((g, i) => guestbookLine(g, i, showing)).join('')
    : `<div class="k">${today ? 'no one has signed yet' : 'no one signed'}</div>`;
}

export function openBook() {
  showing = pages().length - 1;
  drawBook();
  lift();
  bookEl.hidden = false;
}

export function closeBook() {
  bookEl.hidden = photoEl.hidden = true;
}

export function redrawBook() {
  if (shop.press?.on === 'book') {
    shop.press = null;
    openBook();
  } else if (!bookEl.hidden) drawBook();
}

export function showPhoto(g) {
  const url = photoFor(g);
  if (!url) return;
  const { day } = pages().find((p) => p.entries.includes(g));
  /** @type {HTMLImageElement} */ (photoEl.querySelector('img')).src = url;
  lift();
  photoEl.querySelector('figcaption').textContent = `${g.npc} in ${g.object} · day ${day}${g.note ? ` · “${g.note.full}”` : ''}`;
  photoEl.hidden = false;
}

export function installBook() {
  document.addEventListener('click', (e) => {
    const el = /** @type {HTMLElement} */ (e.target);
    const snap = el.closest?.('.snap');
    const g = snap instanceof HTMLElement && pages()[Number(snap.dataset.page)]?.entries[Number(snap.dataset.entry)];
    if (g) { e.preventDefault(); showPhoto(g); }
    if (el.closest?.('.open-book')) openBook();
  });
  document.addEventListener('toggle', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLDetailsElement) || !el.dataset.key) return;
    if (el.open) open.add(el.dataset.key); else open.delete(el.dataset.key);
  }, true);
  olderBtn.addEventListener('click', () => { showing -= 1; drawBook(); });
  newerBtn.addEventListener('click', () => { showing += 1; drawBook(); });
  photoEl.querySelector('.close').addEventListener('click', () => { photoEl.hidden = true; });
}
