// What is behind them in a selfie: a city skyline and the ground they stand on, rolled fresh for
// every picture.
//
// Painted in 2D under the render rather than put in the 3D scene: the studio tone-maps for felted
// wool (ACES at 0.4 exposure), which would mute a sky to mud. Here a colour is the colour it says.
// It is still the camera's picture: the studio hands over where the horizon is and a projection,
// so the skyline sits on the true horizon and the ground recedes the way the lens sees it. A lens
// pointed down at a llama's boots shows mostly ground, with the city high up or gone.
//
// The ground is quiet on purpose: low contrast, muted, fading with distance and tinted by the sky,
// so it says "they are standing somewhere" and never pulls the eye off what they made.

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const between = (rng, a, b) => a + rng() * (b - a);

// `tint` lays the sky's light over the ground: dusk warms it, night darkens it.
const SKIES = [
  { name: 'day', top: '#6fb3e8', bottom: '#d9eef7', orb: '#fff6c9', far: '#a9c4d6', near: '#56687a', lit: 0.05, tint: null },
  { name: 'dusk', top: '#3b3a6b', bottom: '#f4a46a', orb: '#ffd27a', far: '#8a6d86', near: '#2f2b40', lit: 0.4,
    tint: ['#b0607a', 0.28] },
  { name: 'night', top: '#0d1430', bottom: '#2c3a6b', orb: '#f2f0e6', far: '#2a3352', near: '#10142a', lit: 0.65,
    tint: ['#141a3c', 0.6] },
];

// How far out from their feet the ground's detail is drawn, fading to nothing, in world units.
const REACH = 8;

/** Sky, a sun or moon, and three rows of towers standing on the horizon, nearer and darker. */
function city(ctx, rng, sky, { w, h }) {
  const g = ctx.createLinearGradient(0, -h * 1.5, 0, 0);
  g.addColorStop(0, sky.top);
  g.addColorStop(1, sky.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(-w * 2, -h * 4, w * 4, h * 4);
  ctx.fillStyle = sky.orb;
  ctx.beginPath();
  ctx.arc(between(rng, -w * 0.4, w * 0.4), between(rng, -h * 0.45, -h * 0.15), between(rng, 14, 30), 0, Math.PI * 2);
  ctx.fill();
  for (let row = 0; row < 3; row++) skyline(ctx, rng, sky, row, { w });
}

/** One row of towers, their feet on the horizon (y = 0 here). Row 0 is the furthest: shortest, palest, unlit. */
function skyline(ctx, rng, sky, row, { w }) {
  for (let x = -w * 1.5 + between(rng, -30, 0); x < w * 1.5;) {
    const bw = between(rng, 16, 44), bh = between(rng, 40, 120) * (1 + row * 0.35);
    ctx.fillStyle = row === 2 ? sky.near : sky.far;
    ctx.globalAlpha = row === 1 ? 0.75 : 1;
    ctx.fillRect(x, -bh, bw, bh);
    if (row === 2) windows(ctx, rng, sky, { x, y: -bh, bw, bh });
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

// ---------------------------------------------------------------- the ground
//
// Each is a flat fill under the horizon and detail drawn on the real ground plane through the
// camera (`project`), centred on their feet and fading with distance from them.

const fade = (feet, x, z) => Math.max(0, 1 - Math.hypot(x - feet.x, z - feet.z) / REACH);

/** A line on the ground from (x0, z0) to (x1, z1), in fading pieces; a stretch behind the lens is skipped. */
function groundLine(ctx, { project, feet }, [x0, z0], [x1, z1]) {
  const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.15));
  let last = project(x0, feet.y, z0);
  for (let i = 1; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n, p = project(x, feet.y, z);
    if (p && last) {
      ctx.globalAlpha = 0.55 * fade(feet, x, z);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    last = p;
  }
}

/** A quad on the ground, corners [x, z], filled at `alpha` times its fade; skipped if a corner is behind the lens. */
function groundQuad(ctx, { project, feet }, corners, alpha) {
  const pts = corners.map(([x, z]) => project(x, feet.y, z));
  if (pts.some((p) => !p)) return;
  const [cx, cz] = corners.reduce(([sx, sz], [x, z]) => [sx + x / 4, sz + z / 4], [0, 0]);
  ctx.globalAlpha = alpha * fade(feet, cx, cz);
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.fill();
}

/** Grid lines `step` apart in both directions round their feet: paving joints. */
function paving(ctx, view) {
  const { feet } = view, step = 0.35, n = Math.round(REACH / step);
  const x0 = Math.round(feet.x / step) * step, z0 = Math.round(feet.z / step) * step;
  for (let i = -n; i <= n; i++) {
    groundLine(ctx, view, [x0 + i * step, feet.z - REACH], [x0 + i * step, feet.z + REACH]);
    groundLine(ctx, view, [feet.x - REACH, z0 + i * step], [feet.x + REACH, z0 + i * step]);
  }
}

/** Floorboards: long planks along z, each board a shade of its own, the end joints staggered. */
function planks(ctx, view, rng) {
  const { feet } = view, W = 0.16, L = 1.2, n = Math.round(REACH / W);
  const x0 = Math.round(feet.x / W) * W;
  for (let i = -n; i <= n; i++) {
    const x = x0 + i * W, stagger = between(rng, 0, L);
    groundLine(ctx, view, [x, feet.z - REACH], [x, feet.z + REACH]);
    for (let z = feet.z - REACH - stagger; z < feet.z + REACH; z += L) {
      ctx.fillStyle = rng() < 0.5 ? '#000' : '#fff';
      groundQuad(ctx, view, [[x, z], [x + W, z], [x + W, z + L], [x, z + L]], between(rng, 0.02, 0.07));
      groundLine(ctx, view, [x, z], [x + W, z]);
    }
  }
}

/** A mown lawn: wide stripes along z, alternately a touch lighter and darker. */
function lawn(ctx, view) {
  const { feet } = view, W = 0.6, n = Math.round(REACH / W);
  const x0 = Math.round(feet.x / W) * W;
  for (let i = -n; i <= n; i++) {
    ctx.fillStyle = i % 2 ? '#fff' : '#000';
    const x = x0 + i * W;
    groundQuad(ctx, view, [[x, feet.z - REACH], [x + W, feet.z - REACH], [x + W, feet.z + REACH], [x, feet.z + REACH]], 0.06);
  }
}

/** The grounds: a fill, the colour its detail is drawn in, and the detail. */
const GROUNDS = {
  pavement: { fill: '#cfc8bb', line: '#a59e91', detail: paving },
  wood: { fill: '#b89574', line: '#8e6e52', detail: planks },
  grass: { fill: '#8fa271', line: '#8fa271', detail: lawn },
};

/** The ground under the horizon: its fill, its detail on the ground plane, then the sky's light over it, hazed to the horizon. */
function ground(ctx, rng, { sky, kind, view, w, h }) {
  const g = GROUNDS[kind];
  inHorizonFrame(ctx, view, () => { ctx.fillStyle = g.fill; ctx.fillRect(-w * 2, 0, w * 4, h * 4); });
  ctx.strokeStyle = g.line;
  ctx.lineWidth = 1;
  g.detail(ctx, view, rng);
  ctx.globalAlpha = 1;
  inHorizonFrame(ctx, view, () => {
    if (sky.tint) { ctx.fillStyle = sky.tint[0]; ctx.globalAlpha = sky.tint[1]; ctx.fillRect(-w * 2, 0, w * 4, h * 4); }
    const haze = ctx.createLinearGradient(0, 0, 0, h * 0.35);
    haze.addColorStop(0, sky.bottom);
    haze.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = haze;
    ctx.fillRect(-w * 2, 0, w * 4, h * 0.35);
  });
}

/** Draw in a frame whose origin is the horizon straight ahead and whose x runs along it. */
function inHorizonFrame(ctx, view, draw) {
  ctx.save();
  ctx.translate(view.horizon.x, view.horizon.y);
  ctx.rotate(view.tilt);
  draw();
  ctx.restore();
}

/** Their contact shadow: soft rings on the ground under them, darkest in the middle. */
function shadow(ctx, { project, feet }) {
  ctx.fillStyle = '#000';
  for (const [k, alpha] of [[1.4, 0.06], [1, 0.1], [0.65, 0.14]]) {
    const pts = Array.from({ length: 24 }, (_, i) => project(
      feet.x + Math.sin((i / 24) * Math.PI * 2) * feet.r * k, feet.y, feet.z + Math.cos((i / 24) * Math.PI * 2) * feet.r * k));
    if (pts.some((p) => !p)) continue;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/**
 * Paint the backdrop over the whole of `ctx`'s canvas, as the camera sees it. `view`:
 * - `tilt`: the camera's roll as the picture shows it, in radians; the horizon leans by it.
 * - `horizon`: where the horizon crosses the picture straight ahead, in pixels.
 * - `project(x, y, z)`: a world point to pixels, or null if it is behind the lens.
 * - `feet`: the ground under them, { x, y, z } (y is the floor's height) and `r`, their footprint.
 *
 * With the skyline in the picture they stand on a street's paving. Without it -- a lens held high
 * and looking down -- they may be anywhere: paving, floorboards or a lawn.
 */
export function paintBackdrop(ctx, view, rng = Math.random) {
  const { width: w, height: h } = ctx.canvas;
  const sky = pick(rng, SKIES);
  const kind = view.horizon.y > 0 ? 'pavement' : pick(rng, Object.keys(GROUNDS));
  inHorizonFrame(ctx, view, () => city(ctx, rng, sky, { w, h }));
  ground(ctx, rng, { sky, kind, view, w, h });
  shadow(ctx, view);
}
