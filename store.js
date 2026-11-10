import { dressExterior, exteriorMarkup, swingOpen } from './characters/store/ui/exterior.js';

const entry = document.querySelector('.doorway');
entry.innerHTML = exteriorMarkup({
  href: 'characters/game.html',
  label: 'Open the door to the Local Yarn Store',
  tip: ['Come in,', "we're open!"],
});
dressExterior(entry);

const door = document.getElementById('door');

door.addEventListener('click', (e) => {
  if (door.classList.contains('open')) return;
  e.preventDefault();
  swingOpen(door, () => { location.href = door.getAttribute('href'); });
});
