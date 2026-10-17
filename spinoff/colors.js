// ?exposure=, ?tone= and ?env= work here as in the game (c is the room's lights, or the old PMREM map with ?env=map); open it on the MacBook and a tablet and compare the numbers.
import * as THREE from 'three';
import { makeStage } from './stage.js';
import { RIOT } from './fx.js';
import { GINGER, mat } from './treats.js';

const COLOURS = ['#fff3f8', '#f7bcd6', '#fff1c9', '#efbb6c', GINGER.heroes, '#2fd17a', ...RIOT.slice(0, 6)];
const stage = makeStage(document.getElementById('stage'));
const { renderer, scene, camera } = stage;
renderer.setPixelRatio(1); // the same pixels on every device, so only the GPU can make the numbers differ
const balls = COLOURS.map((c, i) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.4, 48, 32), mat(c, 0.45));
  m.position.set((i % 6) - 2.5, i < 6 ? 0.5 : -0.5, 0);
  return m;
});
scene.add(...balls);
stage.frame(balls, { margin: 1.05 });
camera.updateMatrixWorld();

const lit = balls.map((b) => b.material), map = scene.environment, lights = [];
scene.traverse((o) => { if (o.isLight) lights.push(o); });
const flat = (toneMapped) => COLOURS.map((color) => new THREE.MeshBasicMaterial({ color, toneMapped }));
/** name, materials, studio lights on, room on */
const MODES = [['raw', flat(false), false, false], ['a basic', flat(true), false, false],
  ['b direct', lit, true, false], ['c env', lit, false, true], ['d both', lit, true, true]];

const gl = renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
const hex = (r, g, b) => [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

/** The median and brightest pixels, and the share with a channel at 255, inside each sphere's screen circle. */
function shoot([, materials, direct, env]) {
  balls.forEach((b, i) => { b.material = materials[i]; });
  for (const l of lights) l.visible = stage.room.includes(l) ? env : direct;
  scene.environment = env ? map : null;
  renderer.render(scene, camera);
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return balls.map((ball) => {
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
  });
}

const shots = MODES.map(shoot);
const both = shots.at(-1);
const table = document.getElementById('swatches');
table.insertAdjacentHTML('beforeend', `<tr><th>colour</th><th>HTML</th><th>d, as HTML</th>${MODES.map(([n]) => `<th>${n}</th>`).join('')}<th>d max</th><th>d clip</th></tr>`);
COLOURS.forEach((colour, i) => {
  table.insertAdjacentHTML('beforeend', `<tr><td>${colour.slice(1)}</td><td><div class="chip" style="background:${colour}"></div></td>
    <td><div class="chip" style="background:#${both[i].median}"></div></td>${shots.map((s) => `<td>${s[i].median}</td>`).join('')}
    <td>${both[i].best}</td><td>${Math.round(both[i].clipped * 100)}%</td></tr>`);
});

const EXT = ['EXT_color_buffer_half_float', 'EXT_color_buffer_float', 'OES_texture_float_linear', 'OES_texture_half_float_linear', 'EXT_sRGB'];
const format = (shader, type) => {
  const f = gl.getShaderPrecisionFormat(shader, type);
  return `${f.rangeMin}/${f.rangeMax}/${f.precision}`;
};
const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
const info = {
  gpu: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
  webgl: gl.getParameter(gl.VERSION), glsl: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
  extensions: Object.fromEntries(EXT.map((n) => [n, Boolean(gl.getExtension(n))])),
  'rangeMin/rangeMax/precision': {
    vertexHigh: format(gl.VERTEX_SHADER, gl.HIGH_FLOAT), fragmentHigh: format(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT),
    vertexMedium: format(gl.VERTEX_SHADER, gl.MEDIUM_FLOAT), fragmentMedium: format(gl.FRAGMENT_SHADER, gl.MEDIUM_FLOAT),
  },
  threePrecision: renderer.capabilities.precision, samples: gl.getParameter(gl.SAMPLES), buffer: `${w}x${h}`,
  toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure, room: map ? 'PMREM map' : `light probe + fill, ${stage.room[0].intensity}`,
  outputColorSpace: renderer.outputColorSpace, drawingBufferColorSpace: gl.drawingBufferColorSpace, contextAttributes: gl.getContextAttributes(),
  p3Screen: matchMedia('(color-gamut: p3)').matches, hdrScreen: matchMedia('(dynamic-range: high)').matches,
  devicePixelRatio, colorDepth: screen.colorDepth,
};
document.getElementById('info').textContent = JSON.stringify(info, null, 1);
document.body.dataset.done = '1';
