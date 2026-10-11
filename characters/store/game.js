// The game (game.html): the shared shop boot (boot.js) and nothing about it — no lil-gui, no
// timer, no NPC panel, no keys hint. The only menus are the in-world ones, the Guestbook and the
// bulletin board, which boot.js installs on every page; this adds the corner stack of buttons and
// the About panel and the speed button. The day clock runs on its default (S.autoDay) and the
// rounds on the speed button (▶ to start), so the shop plays itself: rounds advance, and once the
// shop empties the day ends at the door — the between-days screen (ui/night.js) shows tomorrow's
// order and waits until the player opens the shop.

import { bootShop } from './boot.js';
import { installControls } from './ui/controls.js';
import { S, gameSpeed } from './core/config.js';
import { GOLD_DEFS, svgLettering } from './ui/lettering.js';
import { viewShop, viewSide, viewTop } from './ui/framing.js';
import { camera, controls } from './scene/stage.js';
import { closeForTheNight, installNight } from './ui/night.js';

S.floorGrid = false;   // no lattice across the floor in the game; the drop ghost is enough
S.tutorial = true;     // day 1 is the tutorial's: a pot holder pattern, a hook and one ball

const emblem = document.getElementById('emblem');
const infoBtn = document.getElementById('infoBtn');
const about = /** @type {HTMLDialogElement} */ (document.getElementById('about'));

/**
 * The emblem folds the stack in and out. The state lives in aria-expanded and nowhere else: the
 * CSS keys the animation off it, so what a screen reader is told and what is drawn cannot differ.
 * The About panel is a native modal <dialog>: Escape and the form's close button shut it with no
 * script, and focus goes back to the info button however it was closed.
 */
function installCorner() {
  // Gold, because the "i" is the button's one big mark: cap 20 in a 24 box, centred. The page's
  // one GOLD_DEFS goes here, with its only SVG lettering.
  document.getElementById('infoGlyph').innerHTML = GOLD_DEFS + svgLettering('i', 12, 22, { cap: 20, gold: true });
  emblem.addEventListener('click', () => {
    emblem.setAttribute('aria-expanded', String(emblem.getAttribute('aria-expanded') !== 'true'));
  });
  infoBtn.addEventListener('click', () => about.showModal());
  about.addEventListener('close', () => infoBtn.focus());
}

const frameBtn = document.getElementById('frameBtn');
const cube = /** @type {HTMLElement} */ (document.querySelector('#frameBtn .cube'));

/**
 * The frame button reframes (controls.js wires that, shared with the playground) and, here, also
 * opens and closes the two views beside it. Same aria-expanded pattern as the emblem.
 */
function installViews() {
  frameBtn.addEventListener('click', () => {
    frameBtn.setAttribute('aria-expanded', String(frameBtn.getAttribute('aria-expanded') !== 'true'));
  });
  document.getElementById('viewTopBtn').addEventListener('click', () => viewTop());
  document.getElementById('viewSideBtn').addEventListener('click', () => viewSide(1));
}

let cubeAt = '';
/** Turn the view cube to match the camera: azimuth about the up axis, then elevation. */
function turnCube() {
  const dx = camera.position.x - controls.target.x, dz = camera.position.z - controls.target.z;
  const az = Math.atan2(dx, dz), el = Math.atan2(camera.position.y - controls.target.y, Math.hypot(dx, dz));
  const t = `rotateX(${(-el).toFixed(3)}rad) rotateY(${(-az).toFixed(3)}rad)`;
  if (t !== cubeAt) cube.style.transform = cubeAt = t;   // only touch the style when it moved
}

const speedBtn = document.getElementById('speedBtn');
const SPEEDS = [1, 2, 3, 0];   // the button's order: ▶, ▶▶, ▶▶▶, ⏸
const SPEED_NAMES = { 1: 'strolling', 2: 'double speed', 3: 'triple speed', 0: 'paused' };
let speed = 1, resumeAt = 1;   // resumeAt: where P goes back to

/**
 * The speed button: rounds and walking scale together (gameSpeed, config.js), and ⏸ stops the
 * rounds and halts the walks; idles, knitting and chat carry on. The state lives in data-speed for the CSS, and in S for the clocks; set once here, it
 * outlasts the night screen and restart(), which never touch either.
 */
function setSpeed(k) {
  speed = k;
  if (k) resumeAt = k;
  Object.assign(S, gameSpeed(k));
  const next = SPEED_NAMES[SPEEDS[(SPEEDS.indexOf(k) + 1) % SPEEDS.length]];
  speedBtn.dataset.speed = String(k);
  speedBtn.setAttribute('aria-label', `${SPEED_NAMES[k][0].toUpperCase()}${SPEED_NAMES[k].slice(1)}. Press for ${next}`);
  speedBtn.title = `${SPEED_NAMES[k]}: press for ${next} (Space; P ${k ? 'pauses' : 'resumes'})`;
  // The break card on the counter mirrors pause (TUTORIAL.md §3): show it here when k is 0.
}
const cycleSpeed = () => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]);
const togglePause = () => setSpeed(speed ? 0 : resumeAt);

function installSpeed() {
  speedBtn.addEventListener('click', cycleSpeed);
  setSpeed(1);
}

// Space and P are the game's own: on the playground Space advances a round (gui.js), so they are
// handed in here rather than added to the shared player keys.
bootShop({
  steps: [['controls', () => installControls({ ' ': cycleSpeed, p: togglePause })], ['corner', installCorner],
    ['views', installViews], ['speed', installSpeed], ['night', installNight]],
  // Open on the whole shop, not close in: day 1's Former Owner signs the Guestbook at the front
  // left and walks out of the door, and the player must not miss them.
  frame: viewShop,
  onFrame: turnCube,
  onDayEnd: closeForTheNight,
  onFail: (html) => {
    const el = document.getElementById('bootFail');
    el.innerHTML = html;
    el.hidden = false;
  },
});
