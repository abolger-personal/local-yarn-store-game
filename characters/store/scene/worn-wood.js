function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

function paintGrain(ctx, rnd, w, h) {
  ctx.strokeStyle = '#7a5a3c';
  for (let i = 0; i < 70; i++) {
    ctx.globalAlpha = 0.05 + rnd() * 0.12;
    ctx.lineWidth = 0.6 + rnd() * 1.8;
    const x0 = rnd() * w, wave = 2 + rnd() * 6, period = 60 + rnd() * 140;
    ctx.beginPath();
    for (let y = 0; y <= h; y += 8) ctx.lineTo(x0 + Math.sin(y / period + i) * wave, y);
    ctx.stroke();
  }
}

function paintKnots(ctx, rnd, w, h) {
  for (let k = 0; k < 2; k++) {
    const x = rnd() * w, y = rnd() * h, r = 5 + rnd() * 6;
    ctx.fillStyle = '#5e4128';
    ctx.globalAlpha = 0.55;
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.6, r, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7a5a3c';
    for (let ring = 1; ring < 4; ring++) {
      ctx.globalAlpha = 0.25 / ring;
      ctx.beginPath(); ctx.ellipse(x, y, r * (0.6 + ring * 0.7), r * (1 + ring * 1.4), 0, 0, Math.PI * 2); ctx.stroke();
    }
  }
}

function paintWear(ctx, rnd, w, h) {
  for (let i = 0; i < 6; i++) {
    const x = rnd() * w, y = rnd() * h, r = 30 + rnd() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,248,236,0.22)');
    g.addColorStop(1, 'rgba(255,248,236,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.fillStyle = '#4e3622';
  for (let i = 0; i < 40; i++) {
    ctx.globalAlpha = 0.15 + rnd() * 0.2;
    ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

function paintScratches(ctx, rnd, w, h) {
  for (let i = 0; i < 90; i++) {
    const pale = rnd() < 0.65, x = rnd() * w, y = rnd() * h;
    const a = Math.PI / 2 + (rnd() - 0.5) * 1.6, len = 6 + rnd() * 28;
    ctx.strokeStyle = pale ? '#fff7ea' : '#4e3622';
    ctx.globalAlpha = pale ? 0.35 + rnd() * 0.35 : 0.12 + rnd() * 0.15;
    ctx.lineWidth = 0.5 + rnd();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
  }
}

export function paintWornWood(ctx, w, h) {
  const rnd = seeded(29);
  ctx.fillStyle = '#ebe3d6';
  ctx.fillRect(0, 0, w, h);
  paintGrain(ctx, rnd, w, h);
  paintKnots(ctx, rnd, w, h);
  paintWear(ctx, rnd, w, h);
  paintScratches(ctx, rnd, w, h);
  ctx.globalAlpha = 1;
}
