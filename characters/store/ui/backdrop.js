// What is behind them in a selfie: a city skyline, rolled fresh for every picture.
//
// Painted in 2D under the render rather than put in the 3D scene: the studio tone-maps for felted
// wool (ACES at 0.4 exposure), which would mute a sky to mud. Here a colour is the colour it says.

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const between = (rng, a, b) => a + rng() * (b - a);

const SKIES = [
  { name: 'day', top: '#6fb3e8', bottom: '#d9eef7', orb: '#fff6c9', far: '#a9c4d6', near: '#56687a', lit: 0.05 },
  { name: 'dusk', top: '#3b3a6b', bottom: '#f4a46a', orb: '#ffd27a', far: '#8a6d86', near: '#2f2b40', lit: 0.4 },
  { name: 'night', top: '#0d1430', bottom: '#2c3a6b', orb: '#f2f0e6', far: '#2a3352', near: '#10142a', lit: 0.65 },
];

/** A skyline: sky, a sun or moon, three rows of towers getting nearer and darker, lit windows. */
function city(ctx, rng, { w, h, tilt }) {
  const sky = pick(rng, SKIES);
  // Tilted to the camera's roll, so the horizon leans the way the phone does. Drawn oversize about
  // the centre so the corners the tilt uncovers are still sky.
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(tilt);
  ctx.translate(-w, -h);
  const g = ctx.createLinearGradient(0, 0, 0, h * 2);
  g.addColorStop(0, sky.top);
  g.addColorStop(0.75, sky.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w * 2, h * 2);
  ctx.fillStyle = sky.orb;
  ctx.beginPath();
  ctx.arc(between(rng, w * 0.6, w * 1.4), between(rng, h * 0.5, h * 0.9), between(rng, 14, 30), 0, Math.PI * 2);
  ctx.fill();
  for (let row = 0; row < 3; row++) skyline(ctx, rng, sky, row, { w: w * 2, h: h * 2 });
  ctx.restore();
}

/** One row of towers. Row 0 is the furthest: shortest, palest, unlit. */
function skyline(ctx, rng, sky, row, { w, h }) {
  const base = h * (0.62 + row * 0.07);
  ctx.globalAlpha = 1;
  for (let x = between(rng, -30, 0); x < w;) {
    const bw = between(rng, 16, 44), bh = between(rng, 40, 120) * (1 + row * 0.35);
    ctx.fillStyle = row === 2 ? sky.near : sky.far;
    ctx.globalAlpha = row === 1 ? 0.75 : 1;
    ctx.fillRect(x, base - bh, bw, h - base + bh);
    if (row === 2) windows(ctx, rng, sky, { x, y: base - bh, bw, bh });
    x += bw + between(rng, 0, 6);
  }
  ctx.globalAlpha = 1;
}

function windows(ctx, rng, sky, { x, y, bw, bh }) {
  ctx.fillStyle = '#ffd98a';
  for (let wy = y + 6; wy < y + bh - 6; wy += 9) {
    for (let wx = x + 4; wx < x + bw - 6; wx += 8) if (rng() < sky.lit) ctx.fillRect(wx, wy, 4, 5);
  }
  ctx.fillStyle = sky.near;
}

/**
 * Paint a skyline over the whole of `ctx`'s canvas. `tilt` is the camera's roll as the picture
 * shows it, in radians: the horizon leans by it.
 */
export function paintBackdrop(ctx, tilt, rng = Math.random) {
  const { width: w, height: h } = ctx.canvas;
  city(ctx, rng, { w, h, tilt });
}
