import * as THREE from 'three';
import { YARN_COLOR_COUNT } from './catalog.js';
import { mulberry32 } from '../characters/store/core/util.js';

export const SHADING = Object.freeze(['matcap', 'toon', 'sheen', 'flat', 'silhouette']);

export function oklch(l, c, h, target = new THREE.Color()) {
  const a = c * Math.cos((h * Math.PI) / 180), b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return target.setRGB(
    Math.max(0, 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    Math.max(0, -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    Math.max(0, -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_),
    THREE.LinearSRGBColorSpace,
  );
}

function inGamut(l, c, h) {
  const a = c * Math.cos((h * Math.PI) / 180), b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const rgb = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_,
  ];
  return rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);
}

// YARN-ASSET-SPIKE.md §14: out of gamut, reduce chroma and keep hue and lightness.
export function oklchClamped(l, c, h, target = new THREE.Color()) {
  if (inGamut(l, c, h)) return oklch(l, c, h, target);
  let lo = 0, hi = c;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(l, mid, h)) lo = mid; else hi = mid;
  }
  return oklch(l, lo, h, target);
}

export const YARN_ANCHORS = Object.freeze([12, 38, 74, 128, 172, 208, 262, 318]);

// DESIGN-DECISIONS.md §5, Anti-camouflage
export const CHARACTER_RANGE = Object.freeze({ lMin: 0.44, lMax: 0.64, cMax: 0.055 });

// YARN-ASSET-SPIKE.md §14: palette families and their shares.
export const YARN_FAMILIES = Object.freeze([
  { name: 'bold',   share: 0.45, lMin: 0.52, lMax: 0.72, cMin: 0.13, cMax: 0.20 },
  { name: 'muted',  share: 0.40, lMin: 0.52, lMax: 0.78, cMin: 0.00, cMax: 0.07 },
  { name: 'pastel', share: 0.15, lMin: 0.80, lMax: 0.93, cMin: 0.04, cMax: 0.11 },
]);

function familyOf(r) {
  for (const f of YARN_FAMILIES) if ((r -= f.share) < 0) return f;
  return YARN_FAMILIES[YARN_FAMILIES.length - 1];
}
const TIGHT = Object.freeze({ lMin: 0.69, lMax: 0.79, cMin: 0.085, cMax: 0.14 });

const lerp = (a, b, t) => a + (b - a) * t;

export function yarnColor(rng = Math.random, target = new THREE.Color(),
                          { spread = 1, hue = null } = {}) {
  const t = Math.min(1, Math.max(0, spread));
  const full = familyOf(rng());
  const lMin = lerp(TIGHT.lMin, full.lMin, t), lMax = lerp(TIGHT.lMax, full.lMax, t);
  const cMin = lerp(TIGHT.cMin, full.cMin, t), cMax = lerp(TIGHT.cMax, full.cMax, t);

  // YARN-ASSET-SPIKE.md §17: the arc must clear the largest anchor gap.
  const arc = lerp(18, 58, t);
  const h = hue ?? YARN_ANCHORS[(rng() * YARN_ANCHORS.length) | 0] + (rng() - 0.5) * arc;
  let l = lerp(lMin, lMax, rng());
  const c = lerp(cMin, cMax, rng());

  if (c < CHARACTER_RANGE.cMax && l > CHARACTER_RANGE.lMin && l < CHARACTER_RANGE.lMax) {
    const mid = (CHARACTER_RANGE.lMin + CHARACTER_RANGE.lMax) / 2;
    l = l < mid ? CHARACTER_RANGE.lMin : CHARACTER_RANGE.lMax;
  }
  return oklchClamped(l, c, h, target);
}

function toOklch({ r, g, b }) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return { l: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, c: Math.hypot(a, bb),
           h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 };
}

export const oklchOf = (hex) => toOklch(new THREE.Color(hex));

// YARN-ASSET-SPIKE.md §17: the palette, with each colour's OKLCH after the gamut clamp.
export const YARN_PALETTE = (() => {
  const rng = mulberry32(0x105);
  return Array.from({ length: YARN_COLOR_COUNT }, (_, i) => {
    const color = yarnColor(rng, undefined, { hue: ((i + rng()) * 360) / YARN_COLOR_COUNT });
    return Object.freeze({ hex: `#${color.getHexString()}`, ...toOklch(color) });
  });
})();

export function makeMatcap({
  // YARN-ASSET-SPIKE.md §8 and §16: near-white and achromatic.
  base = '#f0ebe3',
  light = '#ffffff',
  shadow = '#4a3550',
  rim = 0.55,
  rimWidth = 3.2,
  wrap = 0.55,
  size = 128,
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  const img = ctx.createImageData(size, size);
  const [cb, cl, cs] = [base, light, shadow].map((h) => new THREE.Color(h));
  paintMatcap(img, size, { cb, cl, cs, rim, rimWidth, wrap });
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function paintMatcap(img, size, { cb, cl, cs, rim, rimWidth, wrap }) {
  const L = new THREE.Vector3(-0.42, 0.52, 0.74).normalize();
  const c = new THREE.Color();

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x / (size - 1)) * 2 - 1;
      const ny = 1 - (y / (size - 1)) * 2;
      const r2 = nx * nx + ny * ny;
      const i = (y * size + x) * 4;
      if (r2 > 1) { img.data[i + 3] = 0; continue; }
      const nz = Math.sqrt(1 - r2);

      const d = Math.max(0, (nx * L.x + ny * L.y + nz * L.z + wrap) / (1 + wrap));
      c.copy(cs).lerp(cb, Math.min(1, d * 1.35)).lerp(cl, Math.max(0, d - 0.62) * 1.6);
      c.lerp(cl, rim * Math.pow(1 - nz, rimWidth));

      img.data[i] = c.r * 255; img.data[i + 1] = c.g * 255; img.data[i + 2] = c.b * 255;
      img.data[i + 3] = 255;
    }
  }
}

// YARN-ASSET-SPIKE.md §11: matte paper for the ball band.
export const PAPER = Object.freeze({
  base: '#ece7de', light: '#fffaf0', shadow: '#5b5060', rim: 0, rimWidth: 3.2, wrap: 0.22,
});

export const makePaperMatcap = (over = {}) => makeMatcap({ ...PAPER, ...over });

export function makeToonRamp(steps = 3) {
  const data = new Uint8Array(steps * 4);
  for (let i = 0; i < steps; i++) {
    // YARN-ASSET-SPIKE.md §2B: biased toward the lit band.
    const v = Math.round(255 * (0.34 + 0.66 * Math.pow(i / Math.max(1, steps - 1), 0.72)));
    data.set([v, v, v, 255], i * 4);
  }
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** @param {string} mode @param {{matcap?: any, ramp?: any, color?: string}} [look] */
export function yarnMaterial(mode, { matcap, ramp, color = '#ffffff' } = {}) {
  switch (mode) {
    case 'matcap':
      return new THREE.MeshMatcapMaterial({ matcap, color });

    case 'toon':
      return new THREE.MeshToonMaterial({ color, gradientMap: ramp });

    case 'sheen':
      return new THREE.MeshPhysicalMaterial({
        color, roughness: 0.92, metalness: 0,
        sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color('#ffd9b0'),
      });

    case 'flat':
      return new THREE.MeshBasicMaterial({ color, vertexColors: true });

    case 'silhouette':
      return new THREE.MeshBasicMaterial({ color: '#141014' });

    default:
      throw new Error(`unknown shading mode: ${mode}`);
  }
}

/**
 * ponytail: normal-based fake AO, O(verts). Real baked AO needs a raycast pass per family at build
 * time; upgrade there if the shapes ever stop being convex.
 */
export function bakeVertexAO(geometry, { floor = 0.45, power = 1.1 } = {}) {
  const { normal } = geometry.attributes;
  const colors = new Float32Array(normal.count * 3);
  for (let i = 0; i < normal.count; i++) {
    const up = normal.getY(i) * 0.5 + 0.5;
    const v = floor + (1 - floor) * Math.pow(up, power);
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = v;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

const HATCH_VERTEX_COMMON = `#include <common>
        varying vec2 vYarnUv;
        varying float vHatchScale;
        #ifdef USE_HATCH_SCALE
          attribute float aHatchScale;
        #endif`;
const HATCH_BEGIN_VERTEX = `#include <begin_vertex>
        vYarnUv = uv;
        #ifdef USE_HATCH_SCALE
          vHatchScale = aHatchScale;
        #else
          vHatchScale = 1.0;
        #endif`;
const HATCH_FRAGMENT_COMMON = `#include <common>
        varying vec2 vYarnUv;
        varying float vHatchScale;
        uniform float uHatchFreq;
        uniform float uHatchDepth;`;
const HATCH_COLOR_FRAGMENT = `#include <color_fragment>
        {
          float f = uHatchFreq * vHatchScale;
          float phase = vYarnUv.y * f;
          // ANTI-MOIRE, and this is the part that matters. Procedural stripes alias hard once a
          // stripe gets near one pixel wide: the strands stop being strands and become a shimmer.
          // The textbook fix is not a global frequency cap — the limit is not global, since a ball
          // at the back of the shelf and one at the front are sampled at completely different
          // rates in the SAME frame. It is per-pixel: measure how much the phase changes across
          // this pixel with fwidth, and fade the pattern toward its own average as that
          // approaches the Nyquist half-cycle. Two ALU, and it is correct at every zoom, every
          // window size and every distance without anything having to be computed on the CPU.
          float w = fwidth(phase);
          float fade = 1.0 - smoothstep(0.35, 0.5, w);
          // abs(sin) gives evenly spaced soft bands; the pow sharpens them into strands with gaps,
          // rather than a smooth ripple that just reads as noise at distance.
          float hatch = pow(abs(sin(phase * 3.14159)), 0.45);
          diffuseColor.rgb *= 1.0 - uHatchDepth * fade * (1.0 - hatch);
        }`;

/**
 * ponytail: one strand direction per family, taken from the UVs. A real ball is wound in crossing
 * passes; if that matters, the upgrade is a second modulation at an angle, not a texture.
 */
export function applyHatching(material, { freq = 26, depth = 0.16 } = {}) {
  const uniforms = {
    uHatchFreq: { value: freq },
    uHatchDepth: { value: depth },
  };
  material.userData.hatch = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', () => HATCH_VERTEX_COMMON)
      .replace('#include <begin_vertex>', () => HATCH_BEGIN_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', () => HATCH_FRAGMENT_COMMON)
      .replace('#include <color_fragment>', () => HATCH_COLOR_FRAGMENT);
  };
  material.customProgramCacheKey = () => `yarn-hatch-${material.type}-${Boolean(material.defines?.USE_HATCH_SCALE)}`;
  return material;
}

export function addHatchScale(mesh, capacity) {
  const attr = new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(1), 1);
  mesh.geometry.setAttribute('aHatchScale', attr);
  mesh.material.defines = { ...mesh.material.defines, USE_HATCH_SCALE: '' };
  mesh.material.needsUpdate = true;
  mesh.userData.hatchScale = attr;
  return attr;
}

export function makeHull(source, { color = '#211a20', width = 0.02 } = {}) {
  const material = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  material.userData.uniforms = { uWidth: { value: width } };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWidth = material.userData.uniforms.uWidth;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWidth;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normal * uWidth;');
  };

  const hull = new THREE.InstancedMesh(source.geometry, material, source.instanceMatrix.count);
  hull.instanceMatrix = source.instanceMatrix;
  hull.frustumCulled = false;
  hull.count = source.count;
  hull.renderOrder = -1;
  return hull;
}
