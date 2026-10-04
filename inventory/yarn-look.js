// The four shading approaches the yarn spike compares, plus the ink outline.
//
// See ../ai_planning_sessions/inventory/YARN-ASSET-SPIKE.md §2. Measured from `THREE.ShaderLib`
// (r160), the four differ on the only axis a fill-rate-bound tablet cares about:
//
//   matcap    evaluates NO lights   keeps instancing + instanceColor
//   toon      evaluates lights      keeps instancing + instanceColor
//   flat      evaluates NO lights   keeps instancing + instanceColor
//   sheen     evaluates lights, and carries the most expensive fragment shader in three.js
//
// The matcaps here are GENERATED, not loaded. That is deliberate for a research spike: a matcap is
// just a picture of a shaded sphere, so generating it puts the terminator softness, the rim and the
// warmth on GUI sliders instead of burying them in a PNG nobody can tune. It also costs no network
// fetch, which the atlas pipeline already needs and this does not.
import * as THREE from 'three';

export const SHADING = Object.freeze(['matcap', 'toon', 'sheen', 'flat', 'silhouette']);

/**
 * A colour from OKLCH, as a linear-working-space THREE.Color.
 *
 * P1-SPIKE-PLAN.md is emphatic and correct about this: "OKLCH is perceptually uniform, so it keeps
 * lightness consistent in a way HSL does not — and lightness consistency is exactly what holds a
 * pastel palette together. Uniform-random hue destroys the pastel read instantly."
 *
 * That matters more here than anywhere else in the project: the sameyness check is a wall of a
 * thousand colours, and HSL at fixed S/L swings real lightness by a factor of two between yellow
 * and blue, which is precisely the wobble that makes a pastel palette look like a toy box.
 *
 * @param l lightness 0..1, @param c chroma ~0..0.37, @param h hue in degrees
 */
export function oklch(l, c, h, target = new THREE.Color()) {
  const a = c * Math.cos((h * Math.PI) / 180), b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  // Straight to the linear working space — three does the sRGB encode at output, so doing it here
  // too would double-encode and wash the whole palette out.
  return target.setRGB(
    Math.max(0, 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    Math.max(0, -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    Math.max(0, -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_),
    THREE.LinearSRGBColorSpace,
  );
}

/** Is this OKLCH triple representable in sRGB at all, or would a channel have to be clipped? */
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

/**
 * OKLCH, gamut-mapped: if the colour is outside sRGB, reduce CHROMA until it fits, keeping hue and
 * lightness exactly.
 *
 * Necessary once the palette opens up. `oklch()` clamps each channel at zero, and clamping a
 * channel *rotates the hue* — measured, 83 of 2000 samples at full spread were landing more than
 * 12 degrees off their anchor, quietly breaking the one constraint that was supposed to be
 * inviolable. Desaturating is the standard answer because hue and lightness are what the eye reads
 * as "which colour is this"; a slightly duller version of the right colour is right, a clipped
 * version of it is a different colour.
 */
export function oklchClamped(l, c, h, target = new THREE.Color()) {
  if (inGamut(l, c, h)) return oklch(l, c, h, target);
  let lo = 0, hi = c;
  for (let i = 0; i < 12; i++) {          // 12 halvings resolves chroma to ~0.00005
    const mid = (lo + hi) / 2;
    if (inGamut(l, mid, h)) lo = mid; else hi = mid;
  }
  return oklch(l, lo, h, target);
}

/**
 * The shop's range, as OKLCH anchors: a curated set of hues at a shared lightness and chroma.
 * Per-instance variation is an anchor plus a small jitter, never a free hue — that constraint is
 * the palette.
 */
export const YARN_ANCHORS = Object.freeze([12, 38, 74, 128, 172, 208, 262, 318]);

/**
 * The band of lightness and chroma RESERVED for characters.
 *
 * `../DESIGN-DECISIONS.md` §5, Anti-camouflage: "the theme palette reserves a `characterRange` of
 * lightness and chroma disjoint from the yarn anchors, so characters never dissolve into a wall of
 * 1000 colourful objects."
 *
 * Felted animals live at mid lightness and LOW chroma — muted browns, greys, creams. So that is
 * the box yarn must stay out of, and staying out of it is what makes opening up the rest safe.
 */
export const CHARACTER_RANGE = Object.freeze({ lMin: 0.44, lMax: 0.64, cMax: 0.055 });

/**
 * The shop's yarn at full spread, as three FAMILIES rather than one box: bold, muted and neutral,
 * pastel. One box (lightness 0.52-0.93 and chroma 0-0.20, rolled independently) made any light
 * colour with a little chroma a pastel: measured, 20% bold against 57% pastel or light candy, and
 * the wall read as Easter. A real shop is mostly saturated mid tones and heathers, pastels a
 * minority. `share`s sum to 1; scratchpad/yarnmix.mjs measured the mix, and garments.test.mjs holds
 * the bold and pastel shares.
 */
export const YARN_FAMILIES = Object.freeze([
  { name: 'bold',   share: 0.45, lMin: 0.52, lMax: 0.72, cMin: 0.13, cMax: 0.20 },
  { name: 'muted',  share: 0.40, lMin: 0.52, lMax: 0.78, cMin: 0.00, cMax: 0.07 },
  { name: 'pastel', share: 0.15, lMin: 0.80, lMax: 0.93, cMin: 0.04, cMax: 0.11 },
]);

/** Pick a family by share. */
function familyOf(r) {
  for (const f of YARN_FAMILIES) if ((r -= f.share) < 0) return f;
  return YARN_FAMILIES[YARN_FAMILIES.length - 1];
}
/** The original pastel point — where `spread: 0` lands, so the old look is still reachable. */
const TIGHT = Object.freeze({ lMin: 0.69, lMax: 0.79, cMin: 0.085, cMax: 0.14 });

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * One instance's colour.
 *
 * All three axes widen with `spread`, and the hue one is a correction.
 *
 * An earlier version held hue at a tight +/-9 degrees around the anchors at every spread, on the
 * strength of a measurement showing that freeing hue moved delivered-LUMINANCE spread by only 1%.
 * That measurement was answering the wrong question. Luminance spread cannot see hue coverage at
 * all — and the thing a yarn wall is actually judged on is whether you can pull a **rainbow** out
 * of it, which is precisely a coverage question. Eight islands of 18 degrees leave real holes in
 * the circle: there is simply no yarn between 218 and 252 degrees, so no arrangement of any number
 * of items can make a continuous spectrum.
 *
 * So the hue arc widens too: +/-9 degrees at spread 0 (the curated palette, unchanged) out to
 * +/-23 at spread 1, where 8 anchors x 46 degrees tiles the full circle with a little overlap.
 * The anchors still bias the distribution — colours cluster near them, which is what keeps a
 * mid-spread palette feeling chosen — but nothing is unreachable any more.
 *
 * `hue` overrides the roll outright, for a caller building a FIXED-SIZE indexed palette rather
 * than colouring one instance. Rolling is right per item and wrong per index: sampling 48 hues
 * from the anchors left gaps of up to 103 degrees across seeds — more than a quarter of the circle
 * with no yarn anywhere in it. Walking the anchors in order barely helped (52), because the heavy
 * tail comes from the jitter WITHIN each arc, not from which arc gets picked. A caller that owns a
 * whole index can simply place the hues instead, and bound the gap by construction.
 *
 * @param spread 0 = the original tight pastel; 1 = the full range a real shop carries.
 * @param hue    degrees, placed rather than rolled; null rolls one from the anchors, as an item does.
 */
export function yarnColor(rng = Math.random, target = new THREE.Color(),
                          { spread = 1, hue = null } = {}) {
  const t = Math.min(1, Math.max(0, spread));
  const full = familyOf(rng());
  const lMin = lerp(TIGHT.lMin, full.lMin, t), lMax = lerp(TIGHT.lMax, full.lMax, t);
  const cMin = lerp(TIGHT.cMin, full.cMin, t), cMax = lerp(TIGHT.cMax, full.cMax, t);

  // 18 degrees of arc per anchor closes to a curated palette; the wide end has to TILE the circle.
  //
  // 46 was picked as "8 anchors x 45 degrees, with a little overlap" — which would be right if the
  // anchors were evenly spaced. They are not: the gaps run 54, 26, 36, 54, 44, 36, 54, 56, so a
  // 46-degree arc left four genuine holes, the widest 10 degrees of blue-purple that no yarn could
  // ever be. The arc has to clear the LARGEST anchor gap, not the average one.
  const arc = lerp(18, 58, t);
  const h = hue ?? YARN_ANCHORS[(rng() * YARN_ANCHORS.length) | 0] + (rng() - 0.5) * arc;
  let l = lerp(lMin, lMax, rng());
  const c = lerp(cMin, cMax, rng());

  // Keep out of the characters' band. Only LOW-chroma colours can collide, so a saturated yarn is
  // free to sit at any lightness — which is what lets the range stay wide. A colliding one is
  // nudged to the nearer edge rather than resampled, so the distribution stays even instead of
  // piling up wherever a retry happens to land.
  if (c < CHARACTER_RANGE.cMax && l > CHARACTER_RANGE.lMin && l < CHARACTER_RANGE.lMax) {
    const mid = (CHARACTER_RANGE.lMin + CHARACTER_RANGE.lMax) / 2;
    l = l < mid ? CHARACTER_RANGE.lMin : CHARACTER_RANGE.lMax;
  }
  return oklchClamped(l, c, h, target);
}

/**
 * Paint a matcap: a lit sphere seen head-on, sampled later by view-space normal.
 *
 * The wool read comes from `wrap`, not from the base colour. Ordinary Lambert (`n·L` clamped at
 * zero) puts a hard terminator halfway round the ball, which is what makes untextured spheres look
 * like plastic. Wrapping the falloff past the terminator is the cheap standard approximation of
 * light scattering INTO a soft fibrous surface, and it is most of the difference between "ball"
 * and "ball of wool".
 *
 * `rim` is the second half: a bright edge is what sheen actually looks like on fibre, so a rim here
 * buys the expensive sheen shader's headline effect for one texture fetch. That is the trade this
 * whole module exists to test.
 */
export function makeMatcap({
  // Near-white, and achromatic. Both halves of that matter, and the first was got wrong twice.
  //
  // ACHROMATIC because a matcap is multiplied by `instanceColor`: any hue baked in tints every
  // object sampling it. A wool-brown midtone made the ball band come out wool-coloured, and — less
  // visibly but worse — multiplied the whole OKLCH palette by brown.
  //
  // NEAR-WHITE for the same reason, one step further. `MeshMatcapMaterial` does
  // `diffuseColor.rgb *= matcapColor.rgb`, so the LIT midtone is a gain on the albedo and belongs
  // at ~1.0. A mid-grey matcap is built for use WITHOUT per-instance colour; used with one it is a
  // silent 2.2x darkening (#b4b0ad is 0.46 in linear), and the tone mapper then darkens again. A
  // pastel authored at 73% lightness was arriving on screen at 39%.
  //
  // Contrast therefore comes from the SHADOW side descending, not from the midtone sitting low.
  // The hue that remains is in the light and the shadow — a warm key and a cool violet shadow is
  // most of what makes a render read as cosy, and it is a property of the room, not of the wool.
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

/** Every texel of a matcap: the lit sphere, and transparent outside it. */
function paintMatcap(img, size, { cb, cl, cs, rim, rimWidth, wrap }) {
  // Key from the upper left, which is where every hand-painted matcap puts it.
  const L = new THREE.Vector3(-0.42, 0.52, 0.74).normalize();
  const c = new THREE.Color();

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x / (size - 1)) * 2 - 1;
      const ny = 1 - (y / (size - 1)) * 2;
      const r2 = nx * nx + ny * ny;
      const i = (y * size + x) * 4;
      if (r2 > 1) { img.data[i + 3] = 0; continue; }        // outside the sphere
      const nz = Math.sqrt(1 - r2);

      // Wrapped diffuse: remapped so the terminator softens instead of clamping to black.
      const d = Math.max(0, (nx * L.x + ny * L.y + nz * L.z + wrap) / (1 + wrap));
      c.copy(cs).lerp(cb, Math.min(1, d * 1.35)).lerp(cl, Math.max(0, d - 0.62) * 1.6);
      // Rim: brightest where the surface turns away from the viewer, i.e. small nz.
      c.lerp(cl, rim * Math.pow(1 - nz, rimWidth));

      img.data[i] = c.r * 255; img.data[i + 1] = c.g * 255; img.data[i + 2] = c.b * 255;
      img.data[i + 3] = 255;
    }
  }
}

/**
 * The ball band is PAPER, and paper is matte — but not flat.
 *
 * **This costs one more 128px texture and nothing else.** No extra draw call (the band already has
 * its own instanced mesh), no extra material slot (it already has its own material), no shader
 * work, no branch in the hot path. That is the whole argument for matcaps over a lit material
 * here: "a different surface" is a different *picture of a sphere*, so a second material response
 * is about 64KB and zero runtime cost. Under `MeshPhysicalMaterial` the same request would mean a
 * second lit shader variant compiled and switched between.
 *
 * What changes, and why:
 *   - **no rim.** The rim IS the fake sheen — it is what makes the yarn read as fibre catching the
 *     light — so removing it is precisely the "not shiny" the band wants.
 *   - **a duller highlight**, so the lit side stops reading as a specular hit.
 *   - **less wrap.** Wrap models light scattering INTO a soft fibrous surface. Paper is thin and
 *     smooth and does not do that, so a tighter terminator is both cheaper-looking and truer.
 *   - **kept**: the warm key and cool shadow, and a real terminator. This is what keeps it from
 *     going completely flat — the band still turns, it just does not shine.
 */
export const PAPER = Object.freeze({
  base: '#ece7de', light: '#fffaf0', shadow: '#5b5060', rim: 0, rimWidth: 3.2, wrap: 0.22,
});

/** The matte matcap for ball bands and other paper. */
export const makePaperMatcap = (over = {}) => makeMatcap({ ...PAPER, ...over });

/**
 * A toon ramp: `steps` bands, dark to light.
 *
 * NearestFilter is the whole point — linear filtering smooths the bands back into the gradient the
 * ramp exists to replace.
 */
export function makeToonRamp(steps = 3) {
  const data = new Uint8Array(steps * 4);
  for (let i = 0; i < steps; i++) {
    // Biased so the lit band occupies most of the object and the shadow reads as an accent. An
    // even split makes a round object look half in shadow, which is dramatic rather than cosy.
    const v = Math.round(255 * (0.34 + 0.66 * Math.pow(i / Math.max(1, steps - 1), 0.72)));
    data.set([v, v, v, 255], i * 4);
  }
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * One material for a shading mode. Every one of these supports `instanceColor`, so the palette
 * system is unaffected by the choice — which is what makes this an aesthetic decision rather than
 * an architectural one.
 */
/** @param {string} mode @param {{matcap?: any, ramp?: any, color?: string}} [look] */
export function yarnMaterial(mode, { matcap, ramp, color = '#ffffff' } = {}) {
  switch (mode) {
    case 'matcap':
      return new THREE.MeshMatcapMaterial({ matcap, color });

    case 'toon':
      return new THREE.MeshToonMaterial({ color, gradientMap: ramp });

    // The current art direction, and the project's biggest untested risk (DESIGN-DECISIONS.md §4:
    // "one of the most expensive fragment shaders in three.js"). Included so the spike can see
    // what it is giving up, and what it costs, rather than arguing about it.
    case 'sheen':
      return new THREE.MeshPhysicalMaterial({
        color, roughness: 0.92, metalness: 0,
        sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color('#ffd9b0'),
      });

    // Unlit + baked vertex AO. The cheapest thing that still has form, and the same trick the
    // characters already use (three shared materials, colour in a vertex attribute).
    case 'flat':
      return new THREE.MeshBasicMaterial({ color, vertexColors: true });

    case 'silhouette':
      return new THREE.MeshBasicMaterial({ color: '#141014' });

    default:
      throw new Error(`unknown shading mode: ${mode}`);
  }
}

/**
 * Bake a cheap ambient-occlusion-ish term into vertex colours: down-facing and inward-facing
 * vertices darken. Not real AO — no rays — but on convex-ish wound-fibre shapes the normal's Y is
 * most of what real AO would tell you, for none of the cost and no second UV set.
 *
 * ponytail: normal-based fake AO, O(verts). Real baked AO needs a raycast pass per family at build
 * time; upgrade there if the shapes ever stop being convex.
 */
export function bakeVertexAO(geometry, { floor = 0.45, power = 1.1 } = {}) {
  const { normal } = geometry.attributes;
  const colors = new Float32Array(normal.count * 3);
  for (let i = 0; i < normal.count; i++) {
    const up = normal.getY(i) * 0.5 + 0.5;             // 0 facing down, 1 facing up
    const v = floor + (1 - floor) * Math.pow(up, power);
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = v;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// Our OWN varying, not three's vUv: vUv only exists when the material has a map, and a matcap
// typically does not — so relying on it works under toon and silently no-ops under matcap.
//
// `aHatchScale` is an optional per-instance multiplier. It is a plain instanced float, the same
// mechanism as instanceColor: 4 bytes per instance, no branch, no extra draw call. That is the
// whole cost of "different yarns have different strand counts". Defaults to 1 when the attribute
// is absent, so a mesh that does not supply one behaves exactly as before.
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
// After the diffuse colour is established and before lighting uses it.
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
 * Wound-strand hatching, in one line of shader and no texture.
 *
 * *Measured* (`scratchpad/tm/uvcheck.mjs`): every wound family already carries UVs whose **`u` axis
 * runs in the winding direction** — TubeGeometry runs `u` along the tube, and Sphere, Lathe and
 * Torus all run `u` around their axis. In every case that is the way yarn is actually wound. So
 * strands are **iso-`v` lines on all six at once**, and hatching is a modulation of `v`:
 *
 *   - no UV unwrap, no texture, no atlas, no per-family code — just a frequency
 *   - one `onBeforeCompile`, the same technique notions.js already uses for its card gradient
 *   - works identically under matcap and toon, because it modulates the DIFFUSE term rather than
 *     the lighting
 *
 * It deliberately does not come from the matcap. A matcap is view-space and knows nothing about
 * the surface, so it is the obvious wrong place to try to put this.
 *
 * `bulk` scales the frequency with the item's grid size, or a 3x3 ball gets three times the strand
 * density of a 1x1 at the same world scale — which reads as a different, finer yarn rather than as
 * a bigger ball of the same one.
 *
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
  // Materials differing only by a compiled-in patch can otherwise share a cached program.
  material.customProgramCacheKey = () => `yarn-hatch-${material.type}-${Boolean(material.defines?.USE_HATCH_SCALE)}`;
  return material;
}

/**
 * Give an instanced mesh a per-instance strand multiplier.
 *
 * Yarn weight is the natural driver: a lace-weight ball genuinely has far more, far finer strands
 * on it than a super-bulky one, so this is one of the few variety axes that is *physically* real
 * rather than decorative. It costs one float per instance.
 */
export function addHatchScale(mesh, capacity) {
  const attr = new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(1), 1);
  mesh.geometry.setAttribute('aHatchScale', attr);
  mesh.material.defines = { ...mesh.material.defines, USE_HATCH_SCALE: '' };
  mesh.material.needsUpdate = true;
  mesh.userData.hatchScale = attr;
  return attr;
}

/**
 * The ink outline, as an inverted hull:/**
 * The ink outline, as an inverted hull: a back-faced copy pushed out along its own normals.
 *
 * Shares the source mesh's `instanceMatrix` rather than keeping a synced copy — the same structure
 * `makeEdge` in notions.js already uses for the flat cards, and for the same reason: two buffers
 * that must agree will eventually disagree.
 *
 * Pushing along the NORMAL rather than scaling the whole mesh is what keeps the outline an even
 * width. A uniform scale grows a long skein's ends far more than its middle.
 */
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
  hull.instanceMatrix = source.instanceMatrix;   // shared, so it can never drift out of sync
  hull.frustumCulled = false;
  hull.count = source.count;
  hull.renderOrder = -1;
  return hull;
}
