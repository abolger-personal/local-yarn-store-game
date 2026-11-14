import { HAND_ICON } from './fighter.js';

// REUSE-SPEC.md §Fighter chooser: the chooser's pictures, drawn in the colour picked, the stitch as a pattern
export const NONE = '<circle cx="24" cy="24" r="15" fill="none" stroke="currentColor" stroke-width="4"/><path d="M13 35 35 13" stroke="currentColor" stroke-width="4"/>';
export const ICON = {
  ...HAND_ICON,
  beanie: '<path d="M9 33C9 17 17 11 24 11s15 6 15 22Z"/><rect x="7" y="31" width="34" height="7" rx="3"/><circle cx="24" cy="9" r="4"/>',
  pixie: '<path d="M10 36C12 22 18 12 34 5c-4 9 2 19 4 31Z"/><rect x="8" y="34" width="32" height="6" rx="3"/>',
  beret: '<ellipse cx="24" cy="26" rx="18" ry="8"/><rect x="13" y="29" width="22" height="6" rx="3"/><rect x="22" y="14" width="4" height="6" rx="2"/>',
  bucket: '<path d="M14 30 16 14c4-3 12-3 16 0l2 16Z"/><path d="M5 34c5-6 33-6 38 0-5 3-33 3-38 0Z"/>',
  earflap: '<path d="M9 30C9 16 17 10 24 10s15 6 15 20Z"/><path d="M9 28h6l-1 12c-2 2-5 0-5-2Z"/><path d="M39 28h-6l1 12c2 2 5 0 5-2Z"/>',
  cape: '<path d="M16 8h16l10 34c-12 4-24 4-36 0Z"/>',
  capelet: '<path d="M12 10h24c6 8 8 14 8 18-12 4-28 4-40 0 0-4 2-10 8-18Z"/>',
  backpack: '<rect x="11" y="12" width="26" height="30" rx="7"/><path d="M18 12c0-7 12-7 12 0" fill="none" stroke="currentColor" stroke-width="3"/><rect x="15" y="28" width="18" height="10" rx="3" opacity=".55"/>',
  'drawstring bag': '<path d="M12 16c-4 14-2 26 12 26s16-12 12-26Z"/><path d="M14 16c4-6 16-6 20 0" fill="none" stroke="currentColor" stroke-width="3"/>',
  'crossbody pouch': '<path d="M8 6 30 26" stroke="currentColor" stroke-width="3"/><rect x="18" y="22" width="24" height="18" rx="5"/>',
};
const INK = 'stroke="rgba(0,0,0,.3)" stroke-width="1.6" fill="none"';
const PATTERN = {
  rib: `<path d="M3 0v6" ${INK}/>`,
  garter: `<path d="M0 3h6" ${INK}/>`,
  cable: `<path d="M0 0c3 2 3 4 6 6M6 0C3 2 3 4 0 6" ${INK}/>`,
  'single crochet': '<circle cx="3" cy="3" r="1.2" fill="rgba(0,0,0,.3)"/>',
  waffle: `<rect x="1" y="1" width="4" height="4" ${INK}/>`,
  lace: '<circle cx="3" cy="3" r="1.5" fill="rgba(255,255,255,.75)"/>',
};
const patternId = (stitch) => `t-${stitch.replace(' ', '-')}`;
document.body.insertAdjacentHTML('beforeend', `<svg width="0" height="0" aria-hidden="true"><defs>${Object.entries(PATTERN).map(([stitch, ink]) =>
  `<pattern id="${patternId(stitch)}" width="6" height="6" patternUnits="userSpaceOnUse">${ink}</pattern>`).join('')}</defs></svg>`);
export const textured = (body, stitch) => (PATTERN[stitch] ? `${body}<g fill="url(#${patternId(stitch)})">${body}</g>` : body);

export const svg = (body, colour) => `<svg viewBox="0 0 48 48" fill="currentColor" style="color:${colour}" aria-hidden="true">${body}</svg>`;

// REUSE-SPEC.md §Fighter chooser, Face paint: a face with the paint on it, in the paint's colour
const FACE = '<circle cx="24" cy="24" r="19" fill="#f3ead8" stroke="#9a8f84" stroke-width="2"/>';
const EYES = '<circle cx="17" cy="21" r="3" fill="#222"/><circle cx="31" cy="21" r="3" fill="#222"/>';
export const FACE_ICON = {
  none: FACE + EYES,
  rings: `${FACE}<circle cx="17" cy="21" r="6.5" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="31" cy="21" r="6.5" fill="none" stroke="currentColor" stroke-width="3"/>${EYES}`,
  slashes: `${FACE}<rect x="10" y="28" width="11" height="4" rx="2"/><rect x="27" y="28" width="11" height="4" rx="2"/>${EYES}`,
  heart: `${FACE}<path d="M33 35c-4-3-7-5-7-8 0-2 2-3 3.5-3 1.5 0 2.5 1 3.5 2 1-1 2-2 3.5-2 1.5 0 3.5 1 3.5 3 0 3-3 5-7 8Z"/>${EYES}`,
};

export const TRICK_ICON = { plain: '', sparkle: '✨', bubble: '🫧', flame: '🔥', bebop: '🎷', starPunch: '🌟', fireball: '☄️', loveTap: '💗', shootingStar: '🌠', bubblegumPop: '🍬', powerPuff: '⚡', magicStar: '🪄', heartBlast: '💞', smiteOfLight: '☀️', speedLines: '💨', lightningStorm: '⛈️', atomicBall: '⚛️', goldenDonut: '🏅', lightning: '🌩️', zap: '💥' };
