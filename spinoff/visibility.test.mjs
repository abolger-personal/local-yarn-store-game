// REUSE-SPEC.md §Stage visibility rules: every stage, hand-made or generated, read the way a low-res tablet shows it.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { studioLights } from '../characters/selfie-studio.js';
import { oklchOf } from '../inventory/yarn-look.js';
import { BAD_DONUT, BAD_GUY_FUR, FUR, HERO_DOUGH } from './fighter.js';
import { generateStage } from './generate.js';
import { STAGES, TUTORIAL } from './levels.js';
import { SHELF_WOOD, THEMES } from './scenery.js';
import { BAD_ICING } from './sim.js';
import { ROOM_SH } from './stage.js';

/** @typedef {import('./scenery.js').Paint} Paint @typedef {import('./levels.js').Level} Level */

/** Minimum OKLab lightness difference and distance per pair; see the spec for why these numbers. */
const RULES = Object.freeze({
  hazard: { dL: 0.1, dE: 0.12 },
  edge: { dL: 0, dE: 0.08 },
  thing: { dL: 0, dE: 0.12 },
  fighter: { dL: 0, dE: 0.08 },
  team: { dL: 0.3, dE: 0 },
});

const UP = new THREE.Vector3(0, 1, 0), FRONT = new THREE.Vector3(0, 0, 1), EXPOSURE = 0.75;
const VIEW = new THREE.Vector3(0, Math.sin(THREE.MathUtils.degToRad(35)), Math.cos(THREE.MathUtils.degToRad(35)));

// ponytail: flat surfaces facing up or at the camera (play.js's 35° pitch), diffuse light from the real studio lights
// plus the room map's irradiance (ROOM_SH), a flat Schlick sheen of the room for specular, then neutral tone mapping at
// 0.75 and 8-bit sRGB; area shares (waffle ridges, icing on a brick) are estimates. Ignores highlights and mirror
// reflections (glossy syrup and butter get bright streaks), shading across curved and side faces, shadows, the
// fighters' felt shading, ?tone=/?exposure=/?env= other than the defaults, and tablet GPU and panel differences.
// Upgrade path: render each stage in a headless browser and read pixels the way colors.html does.
const lights = (() => {
  const camera = new THREE.PerspectiveCamera(), scene = new THREE.Scene();
  camera.position.copy(VIEW);
  camera.lookAt(0, 0, 0);
  scene.add(camera, ...studioLights(camera));
  scene.updateMatrixWorld(true);
  /** @type {THREE.Light[]} */
  const all = [];
  scene.traverse((o) => { if (o instanceof THREE.Light) all.push(o); });
  return all;
})();

/** three's shGetIrradianceAt for the grey room probe. @param {THREE.Vector3} n */
function roomIrradiance({ x, y, z }) {
  const s = ROOM_SH;
  return s[0] * 0.886227 + 1.023328 * (s[1] * y + s[2] * z + s[3] * x) + 0.858086 * (s[4] * x * y + s[5] * y * z + s[7] * x * z)
    + s[6] * (0.743125 * z * z - 0.247708) + s[8] * 0.429043 * (x * x - y * y);
}

/** @param {THREE.Vector3} n */
function irradiance(n) {
  const room = roomIrradiance(n), e = new THREE.Color(room, room, room), at = new THREE.Vector3(), to = new THREE.Vector3();
  for (const l of lights) {
    if (l instanceof THREE.DirectionalLight) {
      const dir = l.getWorldPosition(at).sub(l.target.getWorldPosition(to)).normalize();
      e.add(l.color.clone().multiplyScalar(l.intensity * Math.max(0, dir.dot(n))));
    } else if (l instanceof THREE.HemisphereLight) {
      const w = 0.5 * n.dot(l.getWorldPosition(at).normalize()) + 0.5;
      e.add(l.groundColor.clone().lerp(l.color, w).multiplyScalar(l.intensity));
    }
  }
  return { e, room, fresnel: 0.04 + 0.96 * (1 - n.dot(VIEW)) ** 5 };
}
const LIT = { up: irradiance(UP), front: irradiance(FRONT) };

/** three's NeutralToneMapping. @param {number[]} rgb */
function neutral(rgb) {
  const c = rgb.map((v) => v * EXPOSURE), x = Math.min(...c), offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  const d = c.map((v) => v - offset), peak = Math.max(...d), start = 0.76, k = 1 - start;
  if (peak < start) return d;
  const top = 1 - (k * k) / (peak + k - start), g = 1 - 1 / (0.15 * (peak - top) + 1);
  return d.map((v) => v * (top / peak) * (1 - g) + top * g);
}

/** The colour that lands on screen, as display sRGB 0..1. @param {string} hex @param {'up'|'front'} facing */
function onScreen(hex, facing) {
  const { e, room, fresnel } = LIT[facing], a = new THREE.Color(hex);
  const lit = [a.r * e.r, a.g * e.g, a.b * e.b].map((v) => (v * (1 - fresnel) + fresnel * room) / Math.PI);
  const out = new THREE.Color().setRGB(...neutral(lit).map((v) => Math.min(1, Math.max(0, v))), THREE.LinearSRGBColorSpace);
  return out.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
}

/** @typedef {{ hex: string, lab: number[] }} Seen */

/**
 * Each paint as it lands on screen, in linear light; a see-through one is blended over what's under it in display
 * sRGB, as the canvas does. @param {readonly Paint[]} paints @param {'up'|'front'|'flat'} facing flat: unlit, as scene.background is
 */
function lit(paints, facing) {
  const srgb = (c) => (facing === 'flat' ? new THREE.Color(c).getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace) : onScreen(c, facing));
  return paints.map(({ color, opacity = 1, over }) => {
    const top = srgb(color), under = over ? srgb(over) : top;
    return new THREE.Color().setRGB(...['r', 'g', 'b'].map((k) => opacity * top[k] + (1 - opacity) * under[k]), THREE.SRGBColorSpace);
  });
}

/** @param {THREE.Color} c @returns {Seen} */
function seen(c) {
  const hex = `#${c.getHexString()}`, { l, c: chroma, h } = oklchOf(hex), rad = (h * Math.PI) / 180;
  return { hex, lab: [l, chroma * Math.cos(rad) || 0, chroma * Math.sin(rad) || 0] };
}

/** Every colour in a surface: a hazard or a fighter has to stand out from each one, whatever the texture does. */
const each = (paints, facing) => lit(paints, facing).map(seen);
/** A surface or object read as a whole, its shares averaged in linear light: for an edge, a wall or a many-coloured object. */
const whole = (paints, facing) => [seen(lit(paints, facing).reduce((sum, c, i) => sum.add(c.multiplyScalar(paints[i].share ?? 1)), new THREE.Color(0, 0, 0)))];

/**
 * Every pair that plays differently on this level, judged against RULES at its closest two colours. Returns one line per failure.
 * @param {Level} level @param {typeof RULES} rules
 */
function visibilityFailures({ theme: name, stage }, rules = RULES) {
  const s = THEMES[name].surfaces, failures = new Set();
  /** @param {keyof RULES} rule @param {string} what @param {Seen[]} as @param {Seen[]} bs */
  const judge = (rule, what, as, bs) => {
    const [d, a, b] = as.flatMap((a) => bs.map((b) => [Math.hypot(...a.lab.map((v, i) => v - b.lab[i])), a, b]))
      .sort((p, q) => Number(p[0]) - Number(q[0]))[0];
    const dL = Math.abs(a.lab[0] - b.lab[0]), min = rules[rule];
    if (dL < min.dL || d < min.dE)
      failures.add(`${what}: ${a.hex} vs ${b.hex} on screen, ΔL ${dL.toFixed(3)} (min ${min.dL}), ΔE ${Number(d).toFixed(3)} (min ${min.dE}) [${rule}]`);
  };
  const kinds = [...new Set(stage.floors.map((f) => f.kind))];
  const under = (x, z, y = 0) => stage.floors.find((f) => f.y === y && x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1)?.kind ?? 'ground';
  const wall = each([{ color: s.wall }], 'front'), side = whole(s.side, 'front');

  judge('edge', 'ground vs its edge where it drops off', whole(s.ground, 'up'), side);
  judge('edge', `the ground's edge vs the background past it`, side, each([{ color: THEMES[name].background }], 'flat'));
  for (const kind of kinds) judge('edge', `${kind} vs the back wall`, whole(s[kind], 'up'), wall);
  const hazards = /** @type {const} */ ([['syrup', stage.puddles], ['butter', stage.butter ?? []], ['spring', stage.springs ?? []]]);
  for (const [hazard, patches] of hazards) for (const p of patches) {
    assert.ok(s[hazard], `${name} has ${hazard} on a stage but no ${hazard} surface to judge`);
    const kind = under(p.x, p.z, 'y' in p ? p.y : 0);
    judge('hazard', `${hazard} vs the ${kind} it lies on`, whole(s[hazard], 'up'), each(s[kind], 'up'));
  }
  const heroIcings = FUR.map((f) => f.hex);
  for (const team of /** @type {const} */ (['heroes', 'badGuys']))
    for (const icing of team === 'heroes' ? heroIcings : [BAD_ICING])
      judge('thing', `${team} brick (icing ${icing}) vs the ground`, whole(s.brick(team, icing), 'front'), whole(s.ground, 'up'));
  const wood = whole([{ color: SHELF_WOOD.back, share: 0.6 }, { color: SHELF_WOOD.plank, share: 0.4 }], 'front');
  for (const shelf of stage.shelves) {
    const kind = under(shelf.x, shelf.z, shelf.y);
    judge('thing', `${shelf.team} shelf vs the ${kind} it stands on`, wood, whole(s[kind], 'up'));
    judge('thing', `${shelf.team} shelf vs the back wall`, wood, wall);
  }
  const plank = each([{ color: SHELF_WOOD.plank }], 'front');
  for (const d of [...heroIcings.map((frosting) => ({ dough: HERO_DOUGH, frosting })), BAD_DONUT])
    judge('thing', `donut ${d.dough}/${d.frosting} vs the shelf`, whole([{ color: d.dough, share: 0.5 }, { color: d.frosting, share: 0.5 }], 'front'), plank);
  judge('team', `heroes' donut dough vs bad guys'`, each([{ color: HERO_DOUGH }], 'front'), each([{ color: BAD_DONUT.dough }], 'front'));
  for (const fur of [...heroIcings, BAD_GUY_FUR]) for (const kind of kinds)
    judge('fighter', `fur ${fur} vs the ${kind}`, each([{ color: fur }], 'front'), whole(s[kind], 'up'));
  return [...failures];
}

/** @type {[string, Level][]} */
const LEVELS = [['tutorial', TUTORIAL], ...Object.entries(STAGES).map(([n, l]) => /** @type {[string, Level]} */ ([`${n} stage`, l]))];
for (const theme of /** @type {Level['theme'][]} */ (Object.keys(THEMES))) for (let seed = 1; seed <= 20; seed++)
  LEVELS.push([`${theme} seed ${seed} difficulty ${1 + (seed % 5)}`, { theme, stage: generateStage(seed, 1 + (seed % 5), theme) }]);

const report = LEVELS.flatMap(([at, level]) => visibilityFailures(level).map((f) => `${at}: ${f}`));
assert.deepEqual(report, [], `stages break the visibility rules:\n${report.join('\n')}`);

const stricter = Object.fromEntries(Object.entries(RULES).map(([k, r]) => [k, { dL: r.dL + 1, dE: r.dE + 1 }]));
assert.ok(visibilityFailures(TUTORIAL, /** @type {typeof RULES} */ (stricter)).length > 0, 'the check can fail');
console.log(`visibility ok (${LEVELS.length} stages)`);
