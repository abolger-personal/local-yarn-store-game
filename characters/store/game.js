import { bootShop } from './boot.js';
import { installControls } from './ui/controls.js';
import { S, gameSpeed } from './core/config.js';
import { GOLD_DEFS, svgLettering } from './ui/lettering.js';
import { viewShop, viewSide, viewTop } from './ui/framing.js';
import { camera, controls } from './scene/stage.js';
import { closeForTheNight, installNight } from './ui/night.js';
import { openBook } from './ui/book.js';

S.floorGrid = false;
S.tutorial = true;

const emblem = document.getElementById('emblem');
const infoBtn = document.getElementById('infoBtn');
const about = /** @type {HTMLDialogElement} */ (document.getElementById('about'));

function installCorner() {
  document.getElementById('infoGlyph').innerHTML = GOLD_DEFS + svgLettering('i', 12, 22, { cap: 20, gold: true });
  emblem.addEventListener('click', () => {
    emblem.setAttribute('aria-expanded', String(emblem.getAttribute('aria-expanded') !== 'true'));
  });
  infoBtn.addEventListener('click', () => about.showModal());
  about.addEventListener('close', () => infoBtn.focus());
}

const frameBtn = document.getElementById('frameBtn');
const cube = /** @type {HTMLElement} */ (document.querySelector('#frameBtn .cube'));

function installViews() {
  frameBtn.addEventListener('click', () => {
    frameBtn.setAttribute('aria-expanded', String(frameBtn.getAttribute('aria-expanded') !== 'true'));
  });
  document.getElementById('viewTopBtn').addEventListener('click', () => viewTop());
  document.getElementById('viewSideBtn').addEventListener('click', () => viewSide(1));
}

let cubeAt = '';
function turnCube() {
  const dx = camera.position.x - controls.target.x, dz = camera.position.z - controls.target.z;
  const az = Math.atan2(dx, dz), el = Math.atan2(camera.position.y - controls.target.y, Math.hypot(dx, dz));
  const t = `rotateX(${(-el).toFixed(3)}rad) rotateY(${(-az).toFixed(3)}rad)`;
  if (t !== cubeAt) cube.style.transform = cubeAt = t;
}

const speedBtn = document.getElementById('speedBtn');
const SPEEDS = [1, 2, 3, 0];
const SPEED_NAMES = { 1: 'strolling', 2: 'double speed', 3: 'triple speed', 0: 'paused' };
let speed = 1, resumeAt = 1;

function setSpeed(k) {
  speed = k;
  if (k) resumeAt = k;
  Object.assign(S, gameSpeed(k));
  const next = SPEED_NAMES[SPEEDS[(SPEEDS.indexOf(k) + 1) % SPEEDS.length]];
  speedBtn.dataset.speed = String(k);
  speedBtn.setAttribute('aria-label', `${SPEED_NAMES[k][0].toUpperCase()}${SPEED_NAMES[k].slice(1)}. Press for ${next}`);
  speedBtn.title = `${SPEED_NAMES[k]}: press for ${next} (Space; P ${k ? 'pauses' : 'resumes'})`;
}
const cycleSpeed = () => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]);
const togglePause = () => setSpeed(speed ? 0 : resumeAt);

function installSpeed() {
  speedBtn.addEventListener('click', cycleSpeed);
  setSpeed(1);
}

bootShop({
  steps: [['controls', () => installControls({ ' ': cycleSpeed, p: togglePause })], ['corner', installCorner],
    ['views', installViews], ['speed', installSpeed], ['night', installNight]],
  frame: () => { viewShop(); openBook(); },
  onFrame: turnCube,
  onDayEnd: closeForTheNight,
  onFail: (html) => {
    const el = document.getElementById('bootFail');
    el.innerHTML = html;
    el.hidden = false;
  },
});
