import * as THREE from 'three';

// BODIES.md §Painterly: Franz Marc's Blue Horse I for fur, Koson's crow and Bada Shanren's chicks for feathers.
// One shader variant per style, shared uniforms, one brush texture for the whole cast.

/** The knobs, shared by every painted material (species checker "style" folder). */
export const PAINT = {
  bands: { value: 3 },
  soft: { value: 0.34 },
  size: { value: 3 },
  accentSize: { value: 0.3 },
  brush: { value: 0.46 },
  streak: { value: 0.08 },
  light: { value: 0.8 },
  pool: { value: 0.45 },
  // the fur's and scales' pool, off in the games (species checker trial, tmnt/REUSE-SPEC.md §Ink outlines)
  edgePool: { value: 0 },
  ink: { value: 0 },
  fray: { value: 0.78 },
  feather: { value: 0.76 },
  scales: { value: 0.5 },
  scaleSize: { value: 1 },
};

/** The fur ramp: shadows deeper, more saturated and turned along the hue; lights brighter, as saturated as the fur. */
export const FUR_RAMP = Object.freeze({ saturate: 1.6, shade: 0.62, turn: -0.22, bright: 1.2, wash: 0 });
/** The ink wash: one value family, darker as it pools, a little paler where lit. */
export const INK_RAMP = Object.freeze({ saturate: 1.1, shade: 0.55, turn: 0, bright: 1, wash: 0.22 });

const LUMA = [0.2126, 0.7152, 0.0722];
const lumaOf = (c) => c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2];

/** `c` turned `a` radians round the grey axis (Rodrigues), as the shader's paintTurn. */
function turnHue(c, a) {
  const k = 1 / Math.sqrt(3), cos = Math.cos(a), sin = Math.sin(a);
  const dot = (c[0] + c[1] + c[2]) * k;
  const cross = [k * (c[2] - c[1]), k * (c[0] - c[2]), k * (c[1] - c[0])];
  return c.map((v, i) => v * cos + cross[i] * sin + k * dot * (1 - cos));
}

/** The shadow and light colours a ramp makes of linear RGB `base`; the shader computes the same. */
export function paintRamp(base, ramp) {
  const turned = turnHue(base, ramp.turn), grey = lumaOf(turned);
  const shadow = turned.map((v) => Math.max(0, grey + (v - grey) * ramp.saturate) * ramp.shade);
  return { shadow, light: base.map((v) => Math.min(1, v * ramp.bright) * (1 - ramp.wash) + ramp.wash) };
}

/** How far in (N·V) from the outline the ink frays; `fray` sets how broken it is there, not how wide. */
export const FRAY_BAND = 0.5;

/** Does the ink fray an accent piece's fragment at N·V `facing` with brush value `noise` (0..1)? As the shader. */
export const inkFrays = (facing, noise, fray) => noise < fray * (1 - Math.min(1, Math.abs(facing) / FRAY_BAND)) ** 2 * 1.5;

const glslRamp = (r) => `
vec3 paintTurn(vec3 c, float a) {
  const float k = 0.57735027;
  vec3 axis = vec3(k);
  return c * cos(a) + cross(axis, c) * sin(a) + axis * dot(axis, c) * (1.0 - cos(a));
}
vec3 paintShadow(vec3 base) {
  vec3 turned = paintTurn(base, ${r.turn.toFixed(4)});
  float grey = dot(turned, vec3(${LUMA.join(', ')}));
  return max(vec3(grey) + (turned - grey) * ${r.saturate.toFixed(4)}, 0.0) * ${r.shade.toFixed(4)};
}
vec3 paintLight(vec3 base) { return mix(min(base * ${r.bright.toFixed(4)}, 1.0), vec3(1.0), ${r.wash.toFixed(4)}); }
vec3 paintRamp(vec3 base, float t) {
  return t < 0.5 ? mix(paintShadow(base), base, t * 2.0) : mix(base, paintLight(base), t * 2.0 - 1.0);
}`;

const PARS = `
uniform sampler2D paintBrushMap;
uniform sampler2D paintFeatherMap;
uniform sampler2D paintPlaneMap;
uniform sampler2D paintScaleMap;
uniform float paintSize, paintBands, paintSoft, paintBrush, paintStreak, paintLevel, paintPool, paintEdgePool, paintFray, paintFeather, paintAccent, paintAccentSize, paintScales, paintScaleSize;
varying vec2 vPaintUv;
// BODIES.md §Painterly, accent pieces: by material, or merged, by uv lifted 2 whole tiles
#define paintAccented max(paintAccent, step(1.5, vPaintUv.y))`;

// light falling on the fragment, as a share of what a lit base colour would get
/**
 * BODIES.md §Painterly, brightness: the light a fragment gets (`e`, a share of what its colour would show under
 * a light of 1), rounded up to the top of its band, so a painted character is never darker than the felt one;
 * bands are 2 x `level` / `bands` apart. As the shader, without the soft edge.
 */
export function paintBright(e, bands, level) {
  const step = (2 * level) / bands;
  return (Math.floor(e / step) + 1) * step;
}

// the ramp picks the colour only; its brightness is the base's, times the light (`paintE`, banded for fur)
const level = (stroke, banded) => `
  vec3 paintLit = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
  float paintBase = max(dot(diffuseColor.rgb, vec3(${LUMA.join(', ')})), 1e-3);
  float paintE = dot(paintLit, vec3(${LUMA.join(', ')})) / paintBase;
  float paintStroke = ${stroke} - 0.5;
  float paintStep = 2.0 * paintLevel / paintBands;
  ${banded ? `float paintB = max(paintE / paintStep + paintStroke * paintBrush * paintBands - 0.5 + paintSoft, -0.5);
  paintE = (floor(paintB) + smoothstep(0.5 - paintSoft, 0.5 + paintSoft, fract(paintB)) + 1.0) * paintStep;
  float paintT = clamp(paintE / (2.0 * paintLevel), 0.0, 1.0);` : `float paintT = clamp(paintE / (2.0 * paintLevel) + paintStroke * paintBrush, 0.0, 1.0);`}
  vec3 paintC = paintRamp(diffuseColor.rgb, paintT);
  paintC *= paintBase / max(dot(paintC, vec3(${LUMA.join(', ')})), 1e-3) * paintE;`;

// fur: a few broad planes a part (Marc), not hair; ink: the fine brush
const PLANES = level('texture2D(paintPlaneMap, vPaintUv / mix(paintSize, paintAccentSize, paintAccented)).r', true);
// ink's pool for fur and scales: darker towards the silhouette
const EDGE = '(1.0 - paintEdgePool * smoothstep(0.35, 0.0, abs(dot(normalize(normal), normalize(vViewPosition)))))';
const FUR = `{${PLANES}
  outgoingLight = paintC * ${EDGE} * (1.0 + paintStroke * paintStreak);
}`;

// BODIES.md §Dragon, scales: the fur's planes, and overlapping scales painted over all but the accent pieces
const SCALE = `{${PLANES}
  float paintScaled = (texture2D(paintScaleMap, vPaintUv * vec2(6.0, 3.0) / paintScaleSize).r - 0.5) * paintScales * (1.0 - paintAccented);
  outgoingLight = paintC * ${EDGE} * (1.0 + paintStroke * paintStreak + paintScaled);
}`;

const INK = `{${level('texture2D(paintBrushMap, vPaintUv * vec2(3.0, 2.0)).r', false)}
  float paintFacing = dot(normalize(normal), normalize(vViewPosition));
  float paintNoise = texture2D(paintBrushMap, vPaintUv * vec2(9.0, 6.0)).g;
  if (paintAccented > 0.5 && paintNoise < paintFray * pow(1.0 - min(1.0, abs(paintFacing) / ${FRAY_BAND.toFixed(4)}), 2.0) * 1.5) discard;
  float paintRows = (texture2D(paintFeatherMap, vPaintUv * vec2(6.0, 4.0)).r - 0.5) * paintFeather * paintAccented;
  float paintPooled = 1.0 - paintPool * smoothstep(0.35, 0.0, abs(paintFacing));
  outgoingLight = paintC * paintPooled * (1.0 + paintStroke * paintStreak + paintRows);
}`;

const PAINT_STYLES = Object.freeze({
  fur: { ramp: FUR_RAMP, body: FUR },
  ink: { ramp: INK_RAMP, body: INK },
  scale: { ramp: FUR_RAMP, body: SCALE },
});

const TILE = 128;

/** `n` ellipses at random, each `blot()` ({ len, w, tilt, fill }), wrapped round the tile's edges. */
function blots(g, n, blot) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * TILE, y = Math.random() * TILE, { len, w, tilt, fill } = blot();
    g.fillStyle = fill;
    for (const [dx, dy] of [[0, 0], [-TILE, 0], [TILE, 0], [0, -TILE], [0, TILE]]) {
      g.beginPath();
      g.ellipse(x + dx, y + dy, len, w, tilt, 0, Math.PI * 2);
      g.fill();
    }
  }
}

const drawBrush = (g) => blots(g, 90, () => {
  const v = Math.floor(60 + Math.random() * 136);
  return { len: 14 + Math.random() * 30, w: 2 + Math.random() * 5, tilt: (Math.random() - 0.5) * 0.5,
    fill: `rgba(${v},${Math.floor(Math.random() * 255)},${v},0.35)` };
});

/** Marc's planes: a dozen broad swaths a tile, each one flat value, edges kept. */
const drawPlanes = (g) => blots(g, 12, () => {
  const v = Math.floor(40 + Math.random() * 176);
  return { len: 36 + Math.random() * 40, w: 12 + Math.random() * 14, tilt: (Math.random() - 0.5) * 1.2, fill: `rgba(${v},${v},${v},0.8)` };
});

function drawFeathers(g) {
  g.strokeStyle = 'rgb(20,20,20)';
  g.lineWidth = 3;
  const step = TILE / 8;
  for (let row = 0; row <= 8; row++) for (let col = -1; col <= 8; col++) {
    g.beginPath();
    g.arc((col + (row % 2) * 0.5 + 0.5) * step, row * step, step * 0.62, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  }
}

// overlapping round scales, rows drawn bottom up so each covers the tops of the row below: a light middle (the
// shine) to a dark lower edge
function drawScales(g) {
  const step = TILE / 4, r = step * 0.62;
  for (let row = 4; row >= -1; row--) for (let col = -1; col <= 4; col++) {
    const x = (col + (row % 2 ? 0.5 : 0)) * step, y = row * step * 0.75;
    for (const dy of [0, TILE]) {
      const shade = g.createRadialGradient(x, y + dy - r * 0.2, r * 0.1, x, y + dy, r);
      shade.addColorStop(0, 'rgb(215,215,215)');
      shade.addColorStop(0.75, 'rgb(130,130,130)');
      shade.addColorStop(1, 'rgb(40,40,40)');
      g.fillStyle = shade;
      g.beginPath();
      g.arc(x, y + dy, r, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** A tiling texture drawn on a canvas of `grey` once; a flat grey pixel where there is no canvas (node tests). */
function canvasTexture(draw, grey = 128) {
  if (typeof document === 'undefined') {
    const flat = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
    flat.needsUpdate = true;
    return flat;
  }
  const canvas = Object.assign(document.createElement('canvas'), { width: TILE, height: TILE });
  const g = canvas.getContext('2d');
  g.fillStyle = `rgb(${grey},${grey},${grey})`;
  g.fillRect(0, 0, TILE, TILE);
  draw(g);
  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  return map;
}

let maps = null;
const paintMaps = () => (maps ??= {
  brush: { value: canvasTexture(drawBrush) }, feather: { value: canvasTexture(drawFeathers, 150) }, plane: { value: canvasTexture(drawPlanes) },
  scale: { value: canvasTexture(drawScales) },
});

function uniformsFor(material) {
  const { brush, feather, plane, scale } = paintMaps();
  return {
    paintBrushMap: brush, paintFeatherMap: feather, paintPlaneMap: plane, paintScaleMap: scale,
    paintScales: PAINT.scales, paintScaleSize: PAINT.scaleSize, paintSize: PAINT.size, paintBands: PAINT.bands, paintSoft: PAINT.soft,
    paintBrush: PAINT.brush, paintStreak: PAINT.streak, paintLevel: PAINT.light, paintPool: PAINT.pool, paintEdgePool: PAINT.edgePool,
    paintFray: PAINT.fray, paintFeather: PAINT.feather, paintAccent: { value: material.userData.accent ? 1 : 0 }, paintAccentSize: PAINT.accentSize,
  };
}

function inject(shader, style, material) {
  Object.assign(shader.uniforms, uniformsFor(material));
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\nvarying vec2 vPaintUv;`)
    .replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvPaintUv = uv;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', () => `#include <common>\n${PARS}\n${glslRamp(PAINT_STYLES[style].ramp)}`)
    .replace('#include <opaque_fragment>', () => `${PAINT_STYLES[style].body}\n#include <opaque_fragment>`);
}

/**
 * Paints felt `material` in `style` (a PAINT_STYLES key), in place: matte, no specular, its own material family
 * so a merged cast shares one material and one program per style. `accent` marks the accent pieces:
 * the ink frays them, fur paints them at their own stroke size.
 * @param {THREE.MeshPhysicalMaterial} material @param {string} style @param {boolean} [accent]
 */
export function paintMaterial(material, style, accent = material.userData.accent) {
  Object.assign(material, { roughness: 1, sheen: 0, specularIntensity: 0, clearcoat: 0 });
  Object.assign(material.userData, { family: `paint-${style}`, paint: style, accent: Boolean(accent) });
  material.onBeforeCompile = (shader) => inject(shader, style, material);
  material.customProgramCacheKey = () => `paint-${style}`;
  return material;
}

// ponytail: the ink outline is a species checker trial (tmnt/REUSE-SPEC.md §Ink outlines), on no game's characters yet
let ink = null;
/** The outline's material: a mesh again in ink, seen from inside, pushed out along its normals by a share of its distance, so the line is as wide on screen near or far; hidden at width 0. */
export const inkMaterial = () => (ink ??= Object.assign(new THREE.MeshBasicMaterial({ color: '#141414', side: THREE.BackSide }), {
  visible: PAINT.ink.value > 0,
  onBeforeCompile: (shader) => {
    shader.uniforms.paintInk = PAINT.ink;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float paintInk;')
      .replace('#include <project_vertex>', `#include <project_vertex>
  #ifdef USE_SKINNING
  vec3 paintInkNormal = objectNormal;
  #else
  vec3 paintInkNormal = normal;
  #endif
  mvPosition.xyz += normalize(normalMatrix * paintInkNormal) * paintInk * -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;`);
  },
}));

/** Outlines every opaque mesh under `root` in ink (`PAINT.ink` wide), skinned ones on their own skeleton. */
export function inkOutline(root) {
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && !o.userData.ink && !o.material.transparent && !['eye', 'ink'].includes(o.material.userData.family)) meshes.push(o); });
  for (const m of meshes) {
    const line = new (m.isSkinnedMesh ? THREE.SkinnedMesh : THREE.Mesh)(m.geometry, inkMaterial());
    if (m.isSkinnedMesh) line.bind(m.skeleton, m.bindMatrix);
    Object.assign(line, { castShadow: false, raycast: () => {} }).userData.ink = true;
    m.add(line);
  }
}

// ponytail: face paint is an open patch, with no back to outline, so it gets an ink edge under it instead, built in,
// as wide as the outline is from this far away (about the chooser's camera); nearer or further it's wider or thinner
export const INK_SEEN_FROM = 2.5;
let edge = null;
/** The face paint's ink edge, shared by every character. */
export const inkEdgeMaterial = () => (edge ??= Object.assign(new THREE.MeshBasicMaterial({ color: '#141414' }), { userData: { family: 'ink', shared: true } }));

/** The ink trial on a game's page, from its address (?ink= outline width, ?pool= fur pool); off without them. True if outlined. */
export function inkFromQuery(query = globalThis.location?.search ?? '') {
  const q = new URLSearchParams(query), dial = (k, max) => Math.min(max, Math.max(0, Number(q.get(k)) || 0));
  PAINT.edgePool.value = dial('pool', 1);
  PAINT.ink.value = dial('ink', 0.02);
  inkMaterial().visible = PAINT.ink.value > 0;
  return PAINT.ink.value > 0;
}
