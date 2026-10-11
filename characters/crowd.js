import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { roomEnvironment } from '../inventory/room-environment.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import {
  BASE_PARAMS, TONE_MAPPING, POSES, BUILD, MOTION_DEFAULTS,
  createCharacter, setViewMode, disposeCharacter, stepMotion, resetMotion, motionOf, mergeCharacter,
  setGeometryDetail, GEO_DETAIL, getSpecies, speciesIds, pick,
} from './npc.js';
import { randomTraits } from './visit.js';
import { GARMENTS, dress, heldAs, pileAs, randomItem, undress, worstOutfit } from './garments.js';
import { H, W, snap } from './selfie-studio.js';
import { SHOTS, shotFor } from './selfie.js';
import { PATTERN_DESIGNS } from '../inventory/catalog.js';

console.info('LYS build', BUILD);

// importing a species file is all it takes to put it in the crowd
import './owl.js';
import './llama.js';
import './lion.js';

const SPECIES_MIX = ['mixed', ...speciesIds()];

const S = {
  count:        14,
  species:      'mixed',
  quality:      'medium',
  spacing:      0.95,
  jitter:       0.30,
  view:         'felted',
  poseInterval: 3.0,
  cyclePoses:   true,
  idle:         true,
  dressed:      false,
  detail:       'high',
  renderScale:  1.0,
  partShadows:  true,
  mergeMeshes:  true,
  blobShadows:  false,
  blobOpacity:  0.55,
  blobStretch:  1.45,
  blobOffset:   0.22,
  shadows:      true,
  yarnWall:     false,
  yarnCount:    1000,
  exposure:     BASE_PARAMS.exposure,
  toneMapping:  BASE_PARAMS.toneMapping,
  seedFacing:   true,
  selfieOf:     'hat',
};

// One player-facing setting, not three technical switches. Each tier bundles every lever
// that measured as mattering: tessellation (GPU), shadow strategy (CPU draws + tile resolve),
// and resolution (fill rate). The individual controls below stay as developer overrides.
const QUALITY = {
  low:    { detail: 'low',  renderScale: 0.75, blobShadows: true,  partShadows: false },
  medium: { detail: 'med',  renderScale: 1.00, blobShadows: true,  partShadows: false },
  high:   { detail: 'high', renderScale: 1.00, blobShadows: false, partShadows: true  },
};

const QUALITY_KEY = 'lys.crowd.quality';
S.quality = localStorage.getItem(QUALITY_KEY) ?? S.quality;
if (!QUALITY[S.quality]) S.quality = 'medium';

// ---------------------------------------------------------------- renderer
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
function applyRenderScale() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * S.renderScale);
}
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = TONE_MAPPING[S.toneMapping];
renderer.toneMappingExposure = S.exposure;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#e8e2d9');

const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 0.5;
controls.maxDistance = 80;

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(roomEnvironment(), 0.04).texture;

const key = new THREE.DirectionalLight('#ffe6c4', 2.6);
key.position.set(4, 6, 3);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 0.5;
key.shadow.camera.far = 30;
key.shadow.camera.left = -5;
key.shadow.camera.right = 5;
key.shadow.camera.top = 5;
key.shadow.camera.bottom = -5;
key.shadow.bias = -0.0012;
key.shadow.radius = 1;   // three 0.160 ignored this under PCFSoft; 1 keeps that edge now PCF is soft
scene.add(key);
scene.add(new THREE.HemisphereLight('#cfe0ff', '#8b7a68', 0.55));
const rim = new THREE.DirectionalLight('#bcd4ff', 1.1);
rim.position.set(-4, 2.5, -5);
scene.add(rim);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(14, 96),
  new THREE.ShadowMaterial({ opacity: 0.20 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---------------------------------------------------------------- blob shadows
// The shadow map is a second full pass over every caster - ~29 extra draws per character.
// This replaces all of them with ONE instanced draw, which is the standard mobile trade.
let blobTex = null;
function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0.0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.30)');
  g.addColorStop(1.0, 'rgba(0,0,0,0.00)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

let crowd = [];   // declared here: the blob shadows below read it

let blobs = null;
function clearBlobs() {
  if (!blobs) return;
  scene.remove(blobs);
  blobs.geometry.dispose();
  blobs.material.dispose();
  blobs = null;
}

function buildBlobs() {
  clearBlobs();
  if (!S.blobShadows || !crowd.length) return;

  blobTex ??= blobTexture();
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: blobTex, transparent: true, depthWrite: false, opacity: S.blobOpacity,
  });

  blobs = new THREE.InstancedMesh(geo, mat, crowd.length);
  blobs.frustumCulled = false;
  placeBlobs();
  blobs.instanceMatrix.needsUpdate = true;
  scene.add(blobs);
}

/**
 * The key light's direction along the ground. All shadows share it: per-character facing would be
 * more literal but reads as decals; one direction is what sells "lit by the same lamp".
 */
function keyGround() {
  const dx = -key.position.x, dz = -key.position.z;
  const len = Math.hypot(dx, dz) || 1;
  return [dx / len, dz / len];
}

/** One blob under each character, pushed away from the key light. */
function placeBlobs() {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const [lx, lz] = keyGround();
  q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-lz, lx));

  crowd.forEach((o, i) => {
    const P = o.built.params;
    const rz = P.torsoD * 2.8;
    const rx = P.torsoW * 2.8 * S.blobStretch;
    const off = rx * S.blobOffset;
    p.set(o.built.root.position.x + lx * off, 0.004, o.built.root.position.z + lz * off);
    s.set(rx, 1, rz);
    blobs.setMatrixAt(i, m.compose(p, q, s));
  });
}

// ---------------------------------------------------------------- crowd
const crowdGroup = new THREE.Group();
scene.add(crowdGroup);

function clearCrowd() {
  for (const o of crowd) {
    crowdGroup.remove(o.built.root);
    undress(o.built);   // an unmerged dressed character's garments are geometry of its own
    disposeCharacter(o.built);
  }
  crowd = [];
}

const nextSpecies = () => (S.species === 'mixed' ? pick(speciesIds()) : S.species);

function spawn(speciesId) {
  const kit = getSpecies(speciesId);
  const P = kit.randomise(structuredClone(kit.defaults));
  P.partShadows = S.partShadows;
  // Dressed, the merge waits until the clothes are on: the fit is measured off the unmerged body,
  // and the clothes then merge into the character's meshes like any other part.
  P.mergeMeshes = S.mergeMeshes && !S.dressed;
  const built = createCharacter(P, kit);
  const outfit = S.dressed ? worstOutfit() : {};
  if (S.dressed) {
    dress(built, outfit);
    if (S.mergeMeshes) mergeCharacter(built);
  }
  return { kit, P, built, outfit };
}

/** Grid cell i of cols x rows, jittered, and facing anywhere if the crowd is not lined up. */
function setDown(root, i, cols, rows) {
  const cx = (i % cols) - (cols - 1) / 2;
  const cz = Math.floor(i / cols) - (rows - 1) / 2;
  root.position.set(
    cx * S.spacing + (Math.random() - 0.5) * S.jitter,
    0,
    cz * S.spacing + (Math.random() - 0.5) * S.jitter
  );
  root.rotation.y = S.seedFacing ? Math.random() * Math.PI * 2 : 0;
}

/** Crowd member i: spawned, set down in its grid cell with some jitter, and given a temperament. */
function addMember(i, cols, rows) {
  const { kit, P, built, outfit } = spawn(nextSpecies());
  setDown(built.root, i, cols, rows);
  crowdGroup.add(built.root);

  const start = pickPose();
  crowd.push({
    built, kit, P, outfit,   // the last three: what the selfie sheet rebuilds them from
    name: P.name,
    species: kit.label,
    color: P.bodyColor,
    // the pose the engine springs toward: a frozen POSES entry, which is how it tells a new
    // target from the same one
    target: start,
    // Each its own temperament, as in the shop and species-checker: how fast it springs, how
    // much it fidgets, blinks and looks about.
    opts: { ...MOTION_DEFAULTS, ...motionOf(randomTraits(), kit.motionRanges) },
    // desynchronised on purpose: a crowd changing pose in unison looks like a chorus line
    wait: Math.random() * S.poseInterval,
  });
  resetMotion(built.motion, start);
}

function buildCrowd() {
  clearCrowd();

  // loose grid with jitter: reads as a gathering rather than a parade
  const cols = Math.ceil(Math.sqrt(S.count));
  const rows = Math.ceil(S.count / cols);

  for (let i = 0; i < S.count; i++) addMember(i, cols, rows);

  setViewMode(crowdGroup, S.view);
  updateRoster();
  buildBlobs();
  frameCrowd();
}

function pickPose() {
  const names = Object.keys(POSES);
  return POSES[names[Math.floor(Math.random() * names.length)]];
}

// ---------------------------------------------------------------- motion
// The shop's own engine, per character per frame: a spring toward the target pose and the idle
// layer on top (breathing, blinks, glances, fidgets). The crowd is where its cost and its look are
// judged at scale, so it runs the same path the game does, not a stand-in.
function tickMotion(dt) {
  for (const o of crowd) {
    o.opts.idleAmount = S.idle ? 1 : 0;   // assigned, not spread: read 60 times a second each
    stepMotion(o.built, o.target, dt, o.opts);
    if (!S.cyclePoses) continue;
    o.wait -= dt;
    if (o.wait <= 0) {
      o.target = pickPose();
      o.wait = S.poseInterval * (0.6 + Math.random() * 0.9);
    }
  }
}

// ---------------------------------------------------------------- framing
function crowdBox() {
  return new THREE.Box3().setFromObject(crowdGroup);
}

function frameCrowd() {
  const box = crowdBox();
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const extent = Math.max(size.x, size.y, size.z) * 1.25;
  const d = extent / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5));
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(0.45, 0.42, 1).normalize().multiplyScalar(d));
  controls.update();
}

// distance at which ONE character is 150px tall - the real readability check
function distanceTest() {
  const box = crowdBox();
  const center = box.getCenter(new THREE.Vector3());
  const one = crowd[0] ? new THREE.Box3().setFromObject(crowd[0].built.root) : box;
  const figureHeight = Math.max(one.max.y - one.min.y, 0.01);
  const visible = figureHeight * innerHeight / 150;
  const d = visible / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5));
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(0.3, 0.25, 1).normalize().multiplyScalar(d));
  controls.update();
}

// ---------------------------------------------------------------- yarn wall
// Stands in for the shelf wall from the design docs: ONE InstancedMesh, per-instance colour.
// The point is to see what characters cost once the merchandise is also on screen.
let yarnMesh = null;

function buildYarnWall() {
  if (yarnMesh) { scene.remove(yarnMesh); yarnMesh.geometry.dispose(); yarnMesh.material.dispose(); yarnMesh = null; }
  if (!S.yarnWall) return;

  const n = S.yarnCount;
  const geo = new THREE.SphereGeometry(1, 12, 8);
  const mat = new THREE.MeshPhysicalMaterial({
    roughness: 0.85, metalness: 0, sheen: 1, sheenRoughness: 0.8,
    sheenColor: new THREE.Color('#ffffff'),
  });
  yarnMesh = new THREE.InstancedMesh(geo, mat, n);
  yarnMesh.castShadow = false;   // per perf rule 6: items never cast into the shadow map
  yarnMesh.receiveShadow = true;

  shelveYarn(n);
  yarnMesh.instanceMatrix.needsUpdate = true;
  yarnMesh.instanceColor.needsUpdate = true;
  scene.add(yarnMesh);
}

/** n balls round a curved wall of five shelves, each its own size and colour. */
function shelveYarn(n) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();

  const shelves = 5, perShelf = Math.ceil(n / shelves), radius = 5.2;
  for (let i = 0; i < n; i++) {
    const shelf = Math.floor(i / perShelf);
    const k = i % perShelf;
    const a = (k / perShelf) * Math.PI * 1.55 - Math.PI * 0.28;
    pos.set(Math.cos(a) * radius, 0.35 + shelf * 0.34, Math.sin(a) * radius);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
    scl.setScalar(0.075).multiplyScalar(0.85 + Math.random() * 0.3);
    m.compose(pos, q, scl);
    yarnMesh.setMatrixAt(i, m);
    col.setHSL(Math.random(), 0.35 + Math.random() * 0.35, 0.55 + Math.random() * 0.22);
    yarnMesh.setColorAt(i, col);
  }
}

// ---------------------------------------------------------------- perf overlay
const perfEl = document.getElementById('perf');
let fps = 60, lastPerf = 0;

/** A reading's colour on the overlay: fine, getting there, or over budget. */
function cls(v, warn, bad) {
  if (v >= bad) return 'bad';
  return v >= warn ? 'warn' : 'ok';
}

function updatePerf(dt) {
  fps += (1 / Math.max(dt, 1e-4) - fps) * 0.06;
  if (performance.now() - lastPerf < 250) return;
  lastPerf = performance.now();

  const r = renderer.info.render;
  const mem = renderer.info.memory;
  const tri = r.triangles;

  perfEl.innerHTML =
    `<b>${fps.toFixed(0)} fps</b><br>` +
    `draw calls <span class="${cls(r.calls, 120, 400)}">${r.calls}</span><br>` +
    `triangles  <span class="${cls(tri, 4e5, 1.2e6)}">${(tri / 1000).toFixed(0)}k</span><br>` +
    `geometries ${mem.geometries}<br>` +
    `textures   ${mem.textures}<br>` +
    `programs   ${renderer.info.programs?.length ?? 0}<br>` +
    `<span style="opacity:.65">${S.count} × ${S.species} @ ${S.detail}` +
    `${S.yarnWall ? ` + ${S.yarnCount} yarn` : ''}</span><br />` +
    `<span style="opacity:.65">${(r.calls / Math.max(S.count, 1)).toFixed(0)} calls/character</span>`;
}

// ---------------------------------------------------------------- selfies
//
// The Guestbook's selfie (selfie-studio.js, the same code the shop uses) of every member, of one
// subject (`S.selfieOf`: a garment put on them, the pot holder or an armful in hand, or just what
// they have on), captioned with the shot and its grades (selfie.js gradeSelfie). The tune folder
// authors selfie.js SHOTS for one subject and species, live; "copy shot table" is what to paste back.

const randomHex = () => `#${new THREE.Color().setHSL(Math.random(), 0.5, 0.55).getHexString()}`;
const finished = (pattern) => ({ pattern, yarn: [{ c: randomHex() }] });
const designsOf = (types) => PATTERN_DESIGNS.filter((d) => types.includes(d.patternType));
const SUBJECTS = {
  'as dressed': () => null,
  ...Object.fromEntries(Object.keys(GARMENTS).map((type) => [type, () => ({ type, item: { ...randomItem(type), on: true } })])),
  potholder: () => heldAs(finished(pick(designsOf(['potholder']))), (y) => y.c),
  pile: () => pileAs(Array.from({ length: 3 + Math.floor(Math.random() * 5) },
    () => finished(pick(designsOf(Object.keys(GARMENTS))))), (y) => y.c),
};

// Where the tune sliders start for a subject with no shot yet: guesses, graded poorly as they are
// (the phone hand in most, and the eyes lost in the wide ones). Starting points, not answers.
const STARTERS = {
  hat: { headYaw: -0.2, headPitch: 0.2, fov: 40, up: 0.7, k: 1.1, drop: 0.15, off: 0.2 },
  scarf: { headYaw: 0.3, headPitch: -0.45, fov: 40, up: 0.25, k: 1.3, drop: 0.55, off: 0.25 },
  shawl: { headYaw: 2.6, headPitch: -0.1, fov: 40, up: 0.3, k: 2.2, drop: 0.35, off: 0, behind: true },
  sweater: { headYaw: -0.25, headPitch: -0.2, fov: 40, up: 0.3, k: 1.9, drop: 1.0, off: 0.3 },
  bag: { headYaw: -0.25, headPitch: -0.1, fov: 40, up: 0.25, k: 2.0, drop: 1.0, off: 0.45 },
  socks: { headYaw: -0.3, headPitch: 0.1, fov: 45, up: -0.35, k: 2.8, drop: 2.2, off: 0.3 },
  potholder: { headYaw: -0.35, headPitch: -0.3, fov: 55, up: 0.38, k: 1.3, drop: 0.5, off: 0.35 },
  pile: { headYaw: -0.3, headPitch: -0.2, fov: 45, up: 0.4, k: 1.6, drop: 0.7, off: 0.35 },
};
const SHOT_KEYS = ['headYaw', 'headPitch', 'fov', 'up', 'k', 'drop', 'off', 'behind'];
const tune = { use: false, species: 'all', behind: false, ...STARTERS.hat };

const sheet = /** @type {HTMLElement} */ (document.getElementById('selfies'));
const sheetGrid = sheet.querySelector('.grid');
let sheetRun = 0;

const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
/** The caption's grade line, each failing number marked. */
function gradeLine(g) {
  const bad = (fail, text) => (fail ? `✗ ${text}` : text);
  return [g.handOut === null ? 'no phone' : bad(!g.handOut, g.handOut ? 'hand cut' : 'hand WHOLE'), bad(g.made != null && g.made <= 0.15, `made ${pct(g.made)}`),
    bad(g.eyes <= 0.3, `eyes ${pct(g.eyes)}`), `face ${g.face.toFixed(2)}`].join(' · ');
}

/** One member's selfie of the subject, captioned with who, what, which shot, and its grades. */
function selfieOf(member) {
  const subject = SUBJECTS[S.selfieOf]();
  const outfit = { ...member.outfit, ...(subject && { [subject.type]: subject.item }) };
  const { url, shot, grades } = snap({ body: member.P, kit: member.kit, outfit, type: subject?.type ?? null },
    { toneMapping: TONE_MAPPING[S.toneMapping], exposure: S.exposure }, { grade: true });
  const fig = document.createElement('figure');
  const img = new Image(W, H);
  img.src = url;
  const cap = document.createElement('figcaption');
  cap.innerText = `${member.name} · ${member.species}\n${S.selfieOf} · ${shotSource(member, shot)}\n${gradeLine(grades)}`;
  if (grades.handOut === false || grades.eyes <= 0.3 || (grades.made != null && grades.made <= 0.15)) cap.classList.add('fails');
  fig.append(img, cap);
  return fig;
}

/** The tune sliders onto the subject's shot for the tuned species, or the starter where there is none. */
function loadTune() {
  const shot = SHOTS[S.selfieOf]?.[tune.species];
  Object.assign(tune, { behind: false }, STARTERS[S.selfieOf] ?? STARTERS.hat, shot, { use: Boolean(shot) });
}

/** The sliders into SHOTS (or out of it, unticked), and the sheet again if it is open. */
function applyTune() {
  if (!STARTERS[S.selfieOf]) return;   // 'as dressed' has no one subject to shoot
  const shots = (SHOTS[S.selfieOf] ??= {});
  if (tune.use) shots[tune.species] = Object.fromEntries(SHOT_KEYS.map((k) => [k, tune[k]]));
  else delete shots[tune.species];
  // a species' own shot wins over `all` (selfie.js shotFor): say so, or `all` looks like it does nothing
  const own = Object.keys(shots).filter((k) => k !== 'all');
  if (tune.species === 'all' && own.length) toast(`${own.join(', ')} keep their own ${S.selfieOf} shot`);
  if (!sheet.hidden) selfieSheet();
}

/** A slider moved: that is choosing to use the shot, so tick it rather than silently do nothing. */
function slideTune() {
  tune.use = true;
  applyTune();
}

/** Which shot a member's selfie of the subject took: their species' own, the all-species one, or searched. */
function shotSource(member, searched) {
  const { id } = member.kit, shot = shotFor(S.selfieOf, id);
  if (!shot) return `searched: ${searched}`;
  return SHOTS[S.selfieOf][id] === shot ? `own ${id} shot` : 'all-species shot';
}

/** The tuned species takes no authored shot of this subject, not even `all`'s: searched (selfie.js shotFor). */
function searchInstead() {
  if (tune.species === 'all' || !STARTERS[S.selfieOf]) return;
  (SHOTS[S.selfieOf] ??= {})[tune.species] = null;
  tune.use = false;
  toast(`${tune.species}: ${S.selfieOf} searched`);
  if (!sheet.hidden) selfieSheet();
}

function copyShots() {
  const text = `export const SHOTS = ${JSON.stringify(SHOTS, null, 2)};`;
  console.info(text);
  navigator.clipboard?.writeText(text).then(() => toast('shot table copied'), () => toast('shot table in the console'));
}

/** Every member's selfie, one a frame so the sheet fills in rather than freezing the page. */
function selfieSheet() {
  const run = ++sheetRun, members = [...crowd];
  sheetGrid.replaceChildren();
  sheet.hidden = false;
  const next = (i) => {
    if (run !== sheetRun || sheet.hidden || i >= members.length) return;
    sheetGrid.append(selfieOf(members[i]));
    requestAnimationFrame(() => next(i + 1));
  };
  next(0);
}
sheet.querySelector('.close').addEventListener('click', () => { sheet.hidden = true; });

// ---------------------------------------------------------------- ui
function updateRoster() {
  document.getElementById('roster').innerHTML =
    crowd.map((o) =>
      `<div><i style="background:${o.color}"></i>${o.name}` +
      `<span style="opacity:.5"> · ${o.species}</span></div>`).join('');
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.style.opacity = '0'), 1600);
}

const gui = new GUI({ title: 'crowd' });
gui.add(S, 'count', 4, 40, 1).onFinishChange(buildCrowd);
gui.add(S, 'species', SPECIES_MIX).onChange(buildCrowd);
gui.add(S, 'quality', Object.keys(QUALITY)).name('graphics quality').onChange(applyQuality);
gui.add({ f: buildCrowd }, 'f').name('reroll crowd  (R)');

const gPerf = gui.addFolder('performance');
gPerf.add(S, 'detail', Object.keys(GEO_DETAIL)).name('geometry detail').onChange((v) => {
  clearCrowd();
  setGeometryDetail(v);
  buildCrowd();
});
gPerf.add(S, 'yarnWall').name('yarn wall').onChange(buildYarnWall);
gPerf.add(S, 'yarnCount', 100, 3000, 100).name('yarn count').onFinishChange(buildYarnWall);
// DevTools throttling slows the CPU only. Oversampling is the GPU-side proxy: a tablet is
// fill-rate and bandwidth limited long before it runs out of draw calls.
gPerf.add(S, 'renderScale', 0.5, 3, 0.25).name('render scale (GPU load)').onFinishChange(applyRenderScale);
gPerf.add(S, 'partShadows').name('characters cast shadow').onChange(() => { clearCrowd(); buildCrowd(); });
gPerf.add(S, 'mergeMeshes').name('merge static meshes').onChange(() => { clearCrowd(); buildCrowd(); });
gPerf.add(S, 'blobShadows').name('blob shadows (1 draw)').onChange(buildBlobs);
gPerf.add(S, 'blobOpacity', 0, 1, 0.01).name('blob opacity').onChange((v) => {
  if (blobs) blobs.material.opacity = v;
});
gPerf.add(S, 'blobStretch', 1, 3, 0.05).name('blob stretch').onChange(buildBlobs);
gPerf.add(S, 'blobOffset', 0, 1.2, 0.02).name('blob offset').onChange(buildBlobs);
gPerf.add(S, 'shadows').name('shadow map').onChange((v) => {
  renderer.shadowMap.enabled = v;
  crowdGroup.traverse((o) => { if (o.isMesh) o.material.needsUpdate = true; });
});

gui.add(S, 'view', ['felted', 'grey', 'silhouette']).onChange((v) => setViewMode(crowdGroup, v));
gui.add(S, 'cyclePoses').name('cycle poses');
gui.add(S, 'poseInterval', 0.5, 8, 0.1).name('pose interval (s)');
gui.add(S, 'idle').name('idle layer (blinks, breathing)');
// The worst case for the budget: every NPC wearing every slot, each item a random pattern.
gui.add(S, 'dressed').name('dressed up (every slot)').onChange(buildCrowd);
gui.add(S, 'spacing', 0.5, 2.5, 0.05).onFinishChange(buildCrowd);
gui.add(S, 'jitter', 0, 1.2, 0.02).onFinishChange(buildCrowd);
gui.add(S, 'seedFacing').name('random facing').onFinishChange(buildCrowd);
gui.add({ f: frameCrowd }, 'f').name('frame crowd  (F)');
gui.add({ f: distanceTest }, 'f').name('150px distance test  (D)');
gui.add({ f: () => renderer.domElement.classList.toggle('squint') }, 'f').name('squint / blur  (B)');
gui.add(S, 'exposure', 0.1, 2, 0.01).onChange((v) => (renderer.toneMappingExposure = v));
gui.add(S, 'toneMapping', ['AgX', 'ACES', 'None']).onChange((v) => (renderer.toneMapping = TONE_MAPPING[v]));

const gSelfie = gui.addFolder('selfies');
gSelfie.add(S, 'selfieOf', Object.keys(SUBJECTS)).name('of').onChange(() => { loadTune(); if (!sheet.hidden) selfieSheet(); });
gSelfie.add({ f: selfieSheet }, 'f').name('selfie every character  (P)');
const gTune = gSelfie.addFolder('tune the shot');
gTune.add(tune, 'species', ['all', ...speciesIds()]).name('for species').listen().onChange(loadTune);
gTune.add(tune, 'use').name('use this shot').listen().onChange(applyTune);
gTune.add(tune, 'behind').name('from behind (no phone)').listen().onChange(slideTune);
gTune.add(tune, 'headYaw', -4.7, 4.7, 0.01).name('head turn').listen().onFinishChange(slideTune);
gTune.add(tune, 'headPitch', -1, 1, 0.01).name('head lift (− up)').listen().onFinishChange(slideTune);
gTune.add(tune, 'fov', 20, 90, 1).name('lens fov').listen().onFinishChange(slideTune);
gTune.add(tune, 'up', -1.5, 1.5, 0.01).name('lens height').listen().onFinishChange(slideTune);
gTune.add(tune, 'k', 0.6, 4, 0.01).name('distance (×face)').listen().onFinishChange(slideTune);
gTune.add(tune, 'drop', -1, 4, 0.01).name('aim down').listen().onFinishChange(slideTune);
gTune.add(tune, 'off', -1, 1.5, 0.01).name('aim aside').listen().onFinishChange(slideTune);
gTune.add({ f: searchInstead }, 'f').name('this species: search instead');
gTune.add({ f: copyShots }, 'f').name('copy shot table');

// Capture phase: lil-gui's own inputs handle keydown and can swallow it before it reaches
// window. Bailing on form fields keeps typing in a GUI box from firing shortcuts.
const typing = (t) => t instanceof HTMLElement
  && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');

const setView = (view) => {
  S.view = view;
  setViewMode(crowdGroup, S.view);
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
};

const KEYS = {
  1: () => setView('felted'),
  2: () => setView('grey'),
  3: () => setView('silhouette'),
  r: () => { buildCrowd(); toast(`${S.count} new characters`); },
  f: frameCrowd,
  d: distanceTest,
  b: () => renderer.domElement.classList.toggle('squint'),
  p: selfieSheet,
  escape: () => { sheet.hidden = true; },
};

addEventListener('keydown', (e) => {
  if (typing(e.target)) return;
  KEYS[e.key.toLowerCase()]?.();
  if (e.code === 'Space') {
    e.preventDefault();
    S.cyclePoses = !S.cyclePoses;
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
    toast(S.cyclePoses ? 'poses running' : 'poses paused');
  }
}, true);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/** One player-facing setting: every lever of the tier at once, and the crowd rebuilt under it. */
function applyQuality(name) {
  const q = QUALITY[name] ?? QUALITY.medium;
  S.quality = name;
  Object.assign(S, q);
  try { localStorage.setItem(QUALITY_KEY, name); } catch {}

  setGeometryDetail(q.detail);
  applyRenderScale();
  clearCrowd();
  buildCrowd();
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
}

// ---------------------------------------------------------------- go
applyQuality(S.quality);

const clock = new THREE.Timer();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.update().getDelta(), 0.1);
  tickMotion(dt);
  controls.update();
  renderer.render(scene, camera);
  updatePerf(dt);
});
