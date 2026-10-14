import { PATTERN_NAMES } from '../../../inventory/catalog.js';

export const PLACEHOLDER_ART = {
  'yarn-ball': (ctx, s) => {
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.34, 0, Math.PI * 2);
    ctx.fill();
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
  'cable-needle': (ctx, s) => {
    ctx.lineWidth = s * 0.07;
    ctx.beginPath();
    ctx.moveTo(s * 0.16, s * 0.40);
    ctx.arc(s * 0.5, s * 0.40, s * 0.14, Math.PI, 0, true);
    ctx.lineTo(s * 0.84, s * 0.40);
    ctx.stroke();
  },
  buttons: (ctx, s) => {
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

const PATTERN_COVER = {
  sweater: (ctx, s) => {
    ctx.fillRect(s * 0.38, s * 0.36, s * 0.24, s * 0.30);
    ctx.fillRect(s * 0.24, s * 0.36, s * 0.14, s * 0.10);
    ctx.fillRect(s * 0.62, s * 0.36, s * 0.14, s * 0.10);
  },
  hat: (ctx, s) => {
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.56, s * 0.16, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(s * 0.32, s * 0.56, s * 0.36, s * 0.06);
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.34, s * 0.06, 0, Math.PI * 2);
    ctx.fill();
  },
  scarf: (ctx, s) => {
    ctx.beginPath();
    ctx.ellipse(s * 0.5, s * 0.52, s * 0.19, s * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.ellipse(s * 0.5, s * 0.52, s * 0.09, s * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  },
  bag: (ctx, s) => {
    ctx.fillRect(s * 0.32, s * 0.46, s * 0.36, s * 0.24);
    ctx.lineWidth = s * 0.05;
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.46, s * 0.12, Math.PI, 0);
    ctx.stroke();
  },
  socks: (ctx, s) => {
    ctx.fillRect(s * 0.40, s * 0.30, s * 0.14, s * 0.30);
    ctx.fillRect(s * 0.40, s * 0.56, s * 0.26, s * 0.12);
  },
  shawl: (ctx, s) => {
    ctx.beginPath();
    ctx.moveTo(s * 0.30, s * 0.38);
    ctx.lineTo(s * 0.70, s * 0.38);
    ctx.lineTo(s * 0.50, s * 0.68);
    ctx.closePath();
    ctx.fill();
  },
  potholder: (ctx, s) => {
    ctx.fillRect(s * 0.38, s * 0.44, s * 0.24, s * 0.24);
    ctx.lineWidth = s * 0.04;
    ctx.beginPath();
    ctx.arc(s * 0.38, s * 0.40, s * 0.05, 0, Math.PI * 2);
    ctx.stroke();
  },
};

export function installPlaceholderArt() {
  for (const type of PATTERN_NAMES) {
    PLACEHOLDER_ART[`pattern-${type}`] = (ctx, s) => {
      ctx.fillRect(s * 0.16, s * 0.14, s * 0.68, s * 0.72);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillRect(s * 0.26, s * 0.14, s * 0.03, s * 0.72);
      ctx.fillRect(s * 0.22, s * 0.20, s * 0.56, s * 0.60);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillRect(s * 0.16, s * 0.14, s * 0.68, s * 0.06);
      PATTERN_COVER[type](ctx, s);
    };
  }}
