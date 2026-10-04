// The front door. The entry and the door are the shop's exterior (characters/store/ui/exterior.js),
// shared with the game's between-days screen; this puts them on the page, dressed, and lets the
// leaf swing on its hinge before the page changes. The door is an ordinary link to the shop.

import { dressExterior, exteriorMarkup, swingOpen } from './characters/store/ui/exterior.js';

const entry = document.querySelector('.doorway');
entry.innerHTML = exteriorMarkup({
  href: 'characters/game.html',
  label: 'Open the door to the Local Yarn Store',
  // The first tip, at the beginning of the game, is the welcome.
  tip: ['Come in,', "we're open!"],
});
dressExterior(entry);

const door = document.getElementById('door');
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

door.addEventListener('click', (e) => {
  if (still || door.classList.contains('open')) return;   // the plain link does the job
  e.preventDefault();
  swingOpen(door, () => { location.href = door.getAttribute('href'); });
});
