// The Guestbook, readable: every day's page, and the selfies on them.
//
// The NPC panel only shows the last few lines of today. Pressing the book on the counter opens it
// at today, and the player can page back through every day the shop has been open (LYS.md 5c: the
// Guestbook is the memory the player has earned, so it has to be there to look back on).

import { shop } from '../core/state.js';
import { esc } from '../core/util.js';
import { photoFor } from './photo.js';

// CHARACTER-VISIT.md's guestbook icon list. One mood icon — the photo if they made something,
// otherwise happy or disappointed — plus a tag per thing that happened on the visit, so a page of
// the book reads at a glance instead of as a paragraph.
const TAG_ICONS = {
  yarn: ['🧶', 'bought yarn'],
  pattern: ['📖', 'bought a pattern'],
  tool: ['🪡', 'bought a hook or needles'],
  lent: ['🎁', 'lent a finished object to the shop'],
  chatted: ['🧑‍🤝‍🧑', 'chatted with another customer'],
  sat: ['🪑', 'sat and worked on a WIP'],
  ranOut: ['⏳', 'ran out of rounds before finding anything'],
  huff: ['💨', 'gave up and left in a huff'],
};

/** Every day's page, oldest first. The last is today's, still being written. */
const pages = () => [...shop.pastBooks, { day: shop.day, entries: shop.world?.guestbook ?? [] }];

/** One entry as a line. `page` is its day's index in pages(); today's by default. */
export function guestbookLine(g, i, page = shop.pastBooks.length) {
  const mood = g.kind === 'photo'
    ? `<button class="snap" data-page="${page}" data-entry="${i}" title="see the photo">📷 photo</button> ${esc(g.npc)} in ${esc(g.object)}`
    : `${g.mood === 'happy' ? '🙂' : '🙁'} ${esc(g.npc)} — ${esc(g.mood)}`;
  const tags = (g.tags ?? [])
    .filter((k) => TAG_ICONS[k])
    .map((k) => `<span title="${esc(TAG_ICONS[k][1])}">${TAG_ICONS[k][0]}</span>`)
    .join('');
  return `<div>${mood}${tags ? ` <span class="tags">${tags}</span>` : ''}</div>`;
}

const bookEl = /** @type {HTMLElement} */ (document.getElementById('book'));
const photoEl = /** @type {HTMLElement} */ (document.getElementById('photo'));
const olderBtn = /** @type {HTMLButtonElement} */ (document.getElementById('bookOlder'));
const newerBtn = /** @type {HTMLButtonElement} */ (document.getElementById('bookNewer'));

let showing = 0;   // which page the book is open at, as an index into pages()

function drawBook() {
  const all = pages();
  showing = Math.min(showing, all.length - 1);   // a wiped roster wipes the history with it
  const { day, entries } = all[showing];
  const today = showing === all.length - 1;
  document.getElementById('bookDay').textContent = today ? `day ${day} · today` : `day ${day}`;
  olderBtn.disabled = showing === 0;
  newerBtn.disabled = today;
  document.getElementById('bookEntries').innerHTML = entries.length
    ? entries.map((g, i) => guestbookLine(g, i, showing)).join('')
    : `<div class="k">${today ? 'no one has signed yet' : 'no one signed'}</div>`;
}

/** Open the book at today's page. */
export function openBook() {
  showing = pages().length - 1;
  drawBook();
  bookEl.hidden = false;
}

/** Today's page fills in as the day goes, so an open book follows it. Also opens it on request. */
export function redrawBook() {
  if (shop.press?.on === 'book') {
    shop.press = null;
    openBook();
  } else if (!bookEl.hidden) drawBook();
}

/** Show one photo entry's picture, captioned with the day it was signed. */
export function showPhoto(g) {
  const url = photoFor(g);
  if (!url) return;
  const { day } = pages().find((p) => p.entries.includes(g));
  /** @type {HTMLImageElement} */ (photoEl.querySelector('img')).src = url;
  photoEl.querySelector('figcaption').textContent = `${g.npc} in ${g.object} · day ${day}`;
  photoEl.hidden = false;
}

/** Everything this module does ONCE, at boot. Called from main.js, in order. */
export function installBook() {
  // One listener for every 📷, in the book and in the NPC panel: both are rebuilt as HTML.
  document.addEventListener('click', (e) => {
    const el = /** @type {HTMLElement} */ (e.target);
    const snap = el.closest?.('.snap');
    const g = snap instanceof HTMLElement && pages()[Number(snap.dataset.page)]?.entries[Number(snap.dataset.entry)];
    if (g) showPhoto(g);
    if (el.closest?.('.open-book')) openBook();
  });
  olderBtn.addEventListener('click', () => { showing -= 1; drawBook(); });
  newerBtn.addEventListener('click', () => { showing += 1; drawBook(); });
  bookEl.querySelector('.close').addEventListener('click', () => { bookEl.hidden = true; });
  photoEl.querySelector('.close').addEventListener('click', () => { photoEl.hidden = true; });
}
