// ?exposure= and ?tone= work here as in the game; open it on the MacBook and a tablet and compare the numbers.
import * as THREE from 'three';
import { makeStage } from './stage.js';
import { RIOT } from './fx.js';
import { GINGER, mat } from './treats.js';

const COLOURS = ['#fff3f8', '#f7bcd6', '#fff1c9', '#efbb6c', GINGER.heroes, '#2fd17a', ...RIOT.slice(0, 6)];
const stage = makeStage(document.getElementById('stage'));
const { renderer, scene, camera } = stage;
const balls = COLOURS.map((c, i) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.4, 48, 32), mat(c, 0.45));
  m.position.set((i % 6) - 2.5, i < 6 ? 0.5 : -0.5, 0);
  return m;
});
scene.add(...balls);
stage.frame(balls, { margin: 1.05 });
camera.updateMatrixWorld();
renderer.render(scene, camera);

const gl = renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
const px = new Uint8Array(w * h * 4);
gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
const hex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** The median and brightest pixels, and the share with a channel at 255, inside the sphere's screen circle. */
function measure(ball) {
  const c = ball.position.clone().project(camera), edge = ball.position.clone().add(new THREE.Vector3(0.4, 0, 0)).project(camera);
  const cx = ((c.x + 1) / 2) * w, cy = ((c.y + 1) / 2) * h, r = ((edge.x - c.x) / 2) * w * 0.95;
  const all = [];
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
    const i = (y * w + x) * 4;
    all.push([px[i], px[i + 1], px[i + 2]]);
  }
  all.sort((a, b) => a[0] + a[1] + a[2] - b[0] - b[1] - b[2]);
  return { median: hex(...all[all.length >> 1]), best: hex(...all.at(-1)), clipped: all.filter((p) => Math.max(...p) === 255).length / all.length };
}

const table = document.getElementById('swatches');
const results = COLOURS.map((colour, i) => {
  const { median, best, clipped } = measure(balls[i]);
  table.insertAdjacentHTML('beforeend', `<tr><td>${colour}</td><td><div class="chip" style="background:${colour}"></div></td>
    <td><div class="chip" style="background:${median}"></div></td><td>${median}</td><td>${best}</td><td>${Math.round(clipped * 100)}%</td></tr>`);
  return { colour, median, best, clipped: Math.round(clipped * 100) };
});

const high = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
const info = {
  gpu: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
  precision: renderer.capabilities.precision,
  fragmentHighpBits: high?.precision,
  halfFloatTargets: Boolean(gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float')),
  toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure, outputColorSpace: renderer.outputColorSpace,
  drawingBufferColorSpace: gl.drawingBufferColorSpace, contextAttributes: gl.getContextAttributes(),
  p3Screen: matchMedia('(color-gamut: p3)').matches, hdrScreen: matchMedia('(dynamic-range: high)').matches,
  devicePixelRatio, colorDepth: screen.colorDepth, results,
};
document.getElementById('info').textContent = JSON.stringify(info, null, 1);
document.body.dataset.done = '1';
