// Placeholder silhouettes for the things that have no illustration yet.
//
// Extracted from the single 3,200-line module that used to live inline in store.html.

import { PATTERN_NAMES } from '../../../inventory/catalog.js';

/**
 * Stand-in silhouettes for the things that have no illustration yet: yarn in its three shapes, the
 * pattern covers, knitting needles and the pattern notions. Drawn white on transparent, because the atlas carries
 * shape in alpha and colour per instance — see extendAtlas.
 *
 * TODO(YARN.md, PATTERNS.md): these are silhouettes, not the art. YARN.md wants ball bands,
 * gradients, sparkle and fuzziness; PATTERNS.md wants a box "given labels to make it look like a
 * BOOK" with per-type cover icons. Both need real illustration work, and the atlas build script
 * (illustrations/notion_processing.py) is where it should land rather than here.
 */
export const PLACEHOLDER_ART = {
  'yarn-ball': (ctx, s) => {
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.34, 0, Math.PI * 2);
    ctx.fill();
    // A couple of strand grooves, so a ball reads as wound rather than as a dot.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = s * 0.045;
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s / 2, s / 2, s * 0.30, s * 0.12, k * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  },
  'yarn-cone': (ctx, s) => {
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.14);
    ctx.lineTo(s * 0.74, s * 0.82);
    ctx.lineTo(s * 0.26, s * 0.82);
    ctx.closePath();
    ctx.fill();
  },
  'yarn-skein': (ctx, s) => {
    // A twisted hank: a fat lozenge pinched in the middle.
    ctx.beginPath();
    ctx.ellipse(s * 0.36, s / 2, s * 0.20, s * 0.30, 0.5, 0, Math.PI * 2);
    ctx.ellipse(s * 0.64, s / 2, s * 0.20, s * 0.30, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = s * 0.06;
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.22);
    ctx.lineTo(s * 0.5, s * 0.78);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  },
  'knitting-needles': (ctx, s) => {
    ctx.lineWidth = s * 0.07;
    for (const k of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 0.5 + k * s * 0.16, s * 0.84);
      ctx.lineTo(s * 0.5 + k * s * 0.30, s * 0.16);
      ctx.stroke();
    }
  },
  'cable-needle': (ctx, s) => {   // a short needle with a U bent into its middle
    ctx.lineWidth = s * 0.07;
    ctx.beginPath();
    ctx.moveTo(s * 0.16, s * 0.40);
    ctx.arc(s * 0.5, s * 0.40, s * 0.14, Math.PI, 0, true);
    ctx.lineTo(s * 0.84, s * 0.40);
    ctx.stroke();
  },
  buttons: (ctx, s) => {          // a card of four buttons: ring-cut so each reads, two holes each
    ctx.fillRect(s * 0.16, s * 0.16, s * 0.68, s * 0.68);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = s * 0.03;
    for (const x of [0.35, 0.65]) {
      for (const y of [0.35, 0.65]) {
        ctx.beginPath();
        ctx.arc(s * x, s * y, s * 0.11, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillRect(s * (x - 0.045), s * (y - 0.015), s * 0.03, s * 0.03);
        ctx.fillRect(s * (x + 0.015), s * (y - 0.015), s * 0.03, s * 0.03);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  },
};

// A pattern cover: the book, plus the icon PATTERNS.md names for its type.
const PATTERN_COVER = {
  sweater: (ctx, s) => {   // a jumper: body plus two sleeves
    ctx.fillRect(s * 0.38, s * 0.36, s * 0.24, s * 0.30);
    ctx.fillRect(s * 0.24, s * 0.36, s * 0.14, s * 0.10);
    ctx.fillRect(s * 0.62, s * 0.36, s * 0.14, s * 0.10);
  },
  hat: (ctx, s) => {       // a beanie with a pom
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.56, s * 0.16, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(s * 0.32, s * 0.56, s * 0.36, s * 0.06);
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.34, s * 0.06, 0, Math.PI * 2);
    ctx.fill();
  },
  scarf: (ctx, s) => {     // a droopy donut: every scarf, cowl or not (PATTERNS.md)
    ctx.beginPath();
    ctx.ellipse(s * 0.5, s * 0.52, s * 0.19, s * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.ellipse(s * 0.5, s * 0.52, s * 0.09, s * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  },
  bag: (ctx, s) => {       // a body with a strap loop over it
    ctx.fillRect(s * 0.32, s * 0.46, s * 0.36, s * 0.24);
    ctx.lineWidth = s * 0.05;
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.46, s * 0.12, Math.PI, 0);
    ctx.stroke();
  },
  socks: (ctx, s) => {     // one sock: a leg, and a foot pointing off to the side
    ctx.fillRect(s * 0.40, s * 0.30, s * 0.14, s * 0.30);
    ctx.fillRect(s * 0.40, s * 0.56, s * 0.26, s * 0.12);
  },
  shawl: (ctx, s) => {     // a triangle
    ctx.beginPath();
    ctx.moveTo(s * 0.30, s * 0.38);
    ctx.lineTo(s * 0.70, s * 0.38);
    ctx.lineTo(s * 0.50, s * 0.68);
    ctx.closePath();
    ctx.fill();
  },
};

/** Everything this module does ONCE, at boot. Called from main.js, in order. */
export function installPlaceholderArt() {
  for (const type of PATTERN_NAMES) {
    PLACEHOLDER_ART[`pattern-${type}`] = (ctx, s) => {
      // The book itself: a cover with a spine down one edge, per PATTERNS.md.
      ctx.fillRect(s * 0.16, s * 0.14, s * 0.68, s * 0.72);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillRect(s * 0.26, s * 0.14, s * 0.03, s * 0.72);          // the spine crease
      ctx.fillRect(s * 0.22, s * 0.20, s * 0.56, s * 0.60);          // knock out the cover panel
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillRect(s * 0.16, s * 0.14, s * 0.68, s * 0.06);
      PATTERN_COVER[type](ctx, s);
    };
  }}
