import * as THREE from 'three';

// BODIES.md §Painterly: Franz Marc's Blue Horse I for fur, Koson's crow and Bada Shanren's chicks for feathers.
// One shader variant per style, shared uniforms, one brush texture for the whole cast.

/** The knobs, shared by every painted material (species checker "style" folder). */
export const PAINT = {
  bands: { value: 3 },
  soft: { value: 0.06 },
  size: { value: 1 },
  brush: { value: 0.35 },
  streak: { value: 0.08 },
  light: { value: 0.8 },
  pool: { value: 0.45 },
  fray: { value: 0.22 },
  feather: { value: 0.10 },
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

/** Does the ink fray a plume's fragment at N·V `facing` with brush value `noise` (0..1)? As the shader. */
export const inkFrays = (facing, noise, fray) => noise < fray * (1 - Math.min(1, Math.abs(facing) / fray / 2)) ** 2 * 1.5;

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
uniform float paintSize, paintBands, paintSoft, paintBrush, paintStreak, paintLevel, paintPool, paintFray, paintFeather, paintPlume;
varying vec2 vPaintUv;`;

// light falling on the fragment, as a share of what a lit base colour would get
const level = (stroke) => `
  vec3 paintLit = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
  float paintBase = max(dot(diffuseColor.rgb, vec3(${LUMA.join(', ')})), 1e-3);
  float paintT = dot(paintLit, vec3(${LUMA.join(', ')})) / paintBase / (2.0 * paintLevel);
  float paintStroke = ${stroke} - 0.5;
  paintT = clamp(paintT + paintStroke * paintBrush, 0.0, 1.0);`;

// fur: a few broad planes a part (Marc), not hair; ink: the fine brush
const FUR = `{${level('texture2D(paintPlaneMap, vPaintUv / paintSize).r')}
  float paintB = paintT * paintBands;
  paintT = (floor(paintB) + smoothstep(0.5 - paintSoft, 0.5 + paintSoft, fract(paintB))) / paintBands;
  outgoingLight = paintRamp(diffuseColor.rgb, paintT) * (1.0 + paintStroke * paintStreak) * paintLevel;
}`;

const INK = `{${level('texture2D(paintBrushMap, vPaintUv * vec2(3.0, 2.0)).r')}
  float paintFacing = dot(normalize(normal), normalize(vViewPosition));
  float paintPlumed = max(paintPlume, step(1.5, vPaintUv.y));
  float paintNoise = texture2D(paintBrushMap, vPaintUv * vec2(9.0, 6.0)).g;
  if (paintPlumed > 0.5 && paintNoise < paintFray * pow(1.0 - min(1.0, abs(paintFacing) / paintFray / 2.0), 2.0) * 1.5) discard;
  float paintRows = (texture2D(paintFeatherMap, vPaintUv * vec2(6.0, 4.0)).r - 0.5) * paintFeather * paintPlumed;
  float paintPooled = 1.0 - paintPool * smoothstep(0.35, 0.0, abs(paintFacing));
  outgoingLight = paintRamp(diffuseColor.rgb, paintT) * paintPooled * (1.0 + paintStroke * paintStreak + paintRows) * paintLevel;
}`;

export const PAINT_STYLES = Object.freeze({
  fur: { ramp: FUR_RAMP, body: FUR },
  ink: { ramp: INK_RAMP, body: INK },
});

const TILE = 128;

function drawBrush(g) {
  g.fillStyle = 'rgb(128,128,128)';
  g.fillRect(0, 0, TILE, TILE);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * TILE, y = Math.random() * TILE, v = Math.floor(60 + Math.random() * 136);
    const len = 14 + Math.random() * 30, w = 2 + Math.random() * 5, tilt = (Math.random() - 0.5) * 0.5;
    g.fillStyle = `rgba(${v},${Math.floor(Math.random() * 255)},${v},0.35)`;
    for (const [dx, dy] of [[0, 0], [-TILE, 0], [TILE, 0], [0, -TILE], [0, TILE]]) {
      g.beginPath();
      g.ellipse(x + dx, y + dy, len, w, tilt, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** Marc's planes: a dozen broad swaths a tile, each one flat value, edges kept. */
function drawPlanes(g) {
  g.fillStyle = 'rgb(128,128,128)';
  g.fillRect(0, 0, TILE, TILE);
  for (let i = 0; i < 12; i++) {
    const x = Math.random() * TILE, y = Math.random() * TILE, v = Math.floor(40 + Math.random() * 176);
    const len = 36 + Math.random() * 40, w = 12 + Math.random() * 14, tilt = (Math.random() - 0.5) * 1.2;
    g.fillStyle = `rgba(${v},${v},${v},0.8)`;
    for (const [dx, dy] of [[0, 0], [-TILE, 0], [TILE, 0], [0, -TILE], [0, TILE]]) {
      g.beginPath();
      g.ellipse(x + dx, y + dy, len, w, tilt, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function drawFeathers(g) {
  g.fillStyle = 'rgb(118,118,118)';
  g.fillRect(0, 0, TILE, TILE);
  g.strokeStyle = 'rgb(170,170,170)';
  g.lineWidth = 3;
  const step = TILE / 8;
  for (let row = 0; row <= 8; row++) for (let col = -1; col <= 8; col++) {
    g.beginPath();
    g.arc((col + (row % 2) * 0.5 + 0.5) * step, row * step, step * 0.62, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  }
}

/** A tiling grey texture drawn on a canvas once; a flat grey pixel where there is no canvas (node tests). */
function canvasTexture(draw) {
  if (typeof document === 'undefined') {
    const flat = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
    flat.needsUpdate = true;
    return flat;
  }
  const canvas = Object.assign(document.createElement('canvas'), { width: TILE, height: TILE });
  draw(canvas.getContext('2d'));
  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  return map;
}

let maps = null;
const paintMaps = () => (maps ??= {
  brush: { value: canvasTexture(drawBrush) }, feather: { value: canvasTexture(drawFeathers) }, plane: { value: canvasTexture(drawPlanes) },
});

function uniformsFor(material) {
  const { brush, feather, plane } = paintMaps();
  return {
    paintBrushMap: brush, paintFeatherMap: feather, paintPlaneMap: plane, paintSize: PAINT.size, paintBands: PAINT.bands, paintSoft: PAINT.soft,
    paintBrush: PAINT.brush, paintStreak: PAINT.streak, paintLevel: PAINT.light, paintPool: PAINT.pool,
    paintFray: PAINT.fray, paintFeather: PAINT.feather, paintPlume: { value: material.userData.plume ? 1 : 0 },
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
 * so a merged cast shares one material and one program per style. `plume` marks the plumage the ink frays.
 * @param {THREE.MeshPhysicalMaterial} material @param {string} style @param {boolean} [plume]
 */
export function paintMaterial(material, style, plume = material.userData.plume) {
  Object.assign(material, { roughness: 1, sheen: 0, specularIntensity: 0, clearcoat: 0 });
  Object.assign(material.userData, { family: `paint-${style}`, paint: style, plume: Boolean(plume) });
  material.onBeforeCompile = (shader) => inject(shader, style, material);
  material.customProgramCacheKey = () => `paint-${style}`;
  return material;
}
