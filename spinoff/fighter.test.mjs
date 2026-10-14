import assert from 'node:assert/strict';
import * as THREE from 'three';
import { POSES, applyPose, setGeometryDetail } from '../characters/npc.js';
import { LOOK } from '../characters/garments.js';
import { oklchOf } from '../inventory/yarn-look.js';
import {
  BAGS, CAPES, CLOTH, FUR, HATS, SPECIES, TEXTURES, buildFighter, disposeFighter, gloveAnchors, isBadGuyCloth, isBadGuyFur,
  newFighter, randomFighter, readFighter, setFur,
} from './fighter.js';
import { wingShape } from '../characters/owl.js';
import { floorGrid } from './roster.js';

const SHOP_VIEW_PX = LOOK.viewPx;
LOOK.viewPx = 0;

const at = (o) => o.getWorldPosition(new THREE.Vector3());

for (const species of SPECIES) {
  const built = buildFighter(newFighter(species));
  const anchors = gloveAnchors(built);
  assert.equal(built.gloves.length, 2, `${species}: a glove on each hand`);
  for (const pose of ['rest', 'reach', 'delighted']) {
    applyPose(built, { ...POSES.rest, ...POSES[pose] });
    built.root.updateMatrixWorld(true);
    built.gloves.forEach((glove, i) => {
      const want = anchors[i].parent.localToWorld(new THREE.Vector3(...anchors[i].at));
      assert.ok(at(glove).distanceTo(want) < 1e-6, `${species} ${pose}: glove ${i} has come off its anchor`);
    });
  }
  const r = new THREE.Box3().setFromObject(built.gloves[0]).getSize(new THREE.Vector3()).x / 2;
  assert.ok(r > 0.042 * 1.4, `${species}: a glove (r ${r.toFixed(3)}) must read bigger than the bare hand it covers`);
  disposeFighter(built);
}

for (const f of [newFighter('owl'), ...Array.from({ length: 60 }, () => randomFighter(Math.random, 'owl'))]) {
  const built = buildFighter(f);
  const { pos, scale } = wingShape(built.params);
  applyPose(built, POSES.rest);
  built.root.updateMatrixWorld(true);
  built.gloves.forEach((glove, i) => {
    const arm = glove.parent;
    const hand = arm.worldToLocal(at(built.holds.find((h) => h.parent.parent.parent === arm).parent));
    const tip = glove.position, r = glove.scale.x;
    assert.ok(tip.y < hand.y, `owl glove ${i} sits at y ${tip.y.toFixed(3)}: above the hand (${hand.y.toFixed(3)}), not on the wing tip`);
    const across = Math.sqrt(1 - ((tip.y - pos[1]) / scale[1]) ** 2);
    assert.ok(r >= scale[0] * across && r * 1.1 >= scale[2] * across, `owl glove ${i} (r ${r.toFixed(3)}) is narrower than the wing it should swallow`);
    assert.ok(-(tip.y - r) > -(pos[1] - scale[1]), `owl glove ${i} must cover the wing's last tip, not leave it poking out below`);
  });
  disposeFighter(built);
}

for (const species of SPECIES) for (const cape of CAPES) {
  const f = newFighter(species);
  f.look = { ...f.look, hat: null, bag: BAGS[0], cape };
  const built = buildFighter(f);
  const shawl = built.garments.filter((m) => m.userData.worn.includes('shawl'));
  assert.ok(shawl.length, `${species}: a ${cape} is drawn`);
  for (const mesh of shawl) {
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) assert.ok(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i)), `${species}: ${cape} has a NaN vertex`);
  }
  disposeFighter(built);
}

{
  const f = newFighter('lion');
  const back = new THREE.Vector3(), front = new THREE.Vector3();
  f.look = { ...f.look, hat: null, cape: 'cape' };
  const built = buildFighter(f);
  const mesh = built.garments.find((m) => m.userData.worn.includes('shawl'));
  const p = mesh.geometry.attributes.position;
  let lowBack = Infinity, lowFront = Infinity;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (p.getZ(i) < 0 && y < lowBack) { lowBack = y; back.fromBufferAttribute(p, i); }
    if (p.getZ(i) > 0 && y < lowFront) { lowFront = y; front.fromBufferAttribute(p, i); }
  }
  assert.ok(lowFront - lowBack > built.params.torsoH * 0.5, `a cape hangs much lower behind than in front (back ${lowBack.toFixed(3)}, front ${lowFront.toFixed(3)})`);
  disposeFighter(built);
}

{
  for (const { hex, name } of CLOTH) assert.ok(!isBadGuyCloth(hex), `${name} is a bad-guy colour and can't be a kid's swatch`);
  for (const { hex, name } of FUR) assert.ok(!isBadGuyFur(hex) && !isBadGuyCloth(hex), `${name} fur reads as a bad guy`);
  for (const { hex, name } of FUR) assert.ok(oklchOf(hex).c > 0.1, `${name} is too quiet for the colour riot`);
  for (const species of SPECIES) assert.ok(FUR.some((s) => s.hex === newFighter(species).params.bodyColor), `a new ${species} starts on a riot swatch`);
  assert.ok(isBadGuyCloth('#111111') && isBadGuyCloth('#4b2466') && isBadGuyFur('#8c8c8c'), 'black, dark purple and grey are the bad guys\'');
  assert.ok(!isBadGuyCloth('#c9a8f0'), 'light lavender stays a kid colour');
  assert.ok(isBadGuyFur('#a0a6ba'), 'the rig\'s default blue-grey fur reads as a bad guy, so a kid never starts with it');
}

{
  const f = randomFighter(() => 0.5);
  assert.deepEqual(readFighter(JSON.parse(JSON.stringify(f))), f, 'a saved fighter reads back unchanged');
  assert.equal(readFighter(null), null);
  assert.equal(readFighter({ species: 'dragon' }), null, 'only the three animals');
  const junk = readFighter({ species: 'llama', params: { headRadius: 'big', bodyColor: 'red;}', legHeight: Number.NaN, view: '<script>' },
    look: { hat: 'crown', hatColor: '#000000', hatStitch: 'linen stitch', cape: null, bag: 'suitcase', gloves: 12 } });
  const fresh = newFighter('llama');
  assert.equal(junk.params.headRadius, fresh.params.headRadius, 'a non-number size is ignored');
  assert.equal(junk.params.legHeight, fresh.params.legHeight, 'NaN is ignored');
  assert.equal(junk.params.view, fresh.params.view, 'free text from another tablet is ignored');
  assert.ok(/^#[0-9a-f]{6}$/i.test(junk.params.bodyColor), 'a colour must be a colour');
  assert.ok(HATS.includes(junk.look.hat), 'an unknown hat falls back to a real one');
  assert.equal(junk.look.cape, null, 'no cape is a real choice');
  assert.ok(BAGS.includes(junk.look.bag) && CLOTH.some((s) => s.hex === junk.look.gloves), 'unknown bag and glove colour fall back');
  assert.ok(CLOTH.some((s) => s.hex === junk.look.hatColor), 'black is not a kid\'s hat colour, even from another tablet');
  assert.ok(TEXTURES.includes(junk.look.hatStitch), 'linen stitch is too heavy for a tablet, even from another tablet');
}

{
  const triangles = (stitch) => {
    const f = newFighter('lion');
    f.look = { ...f.look, hat: 'beanie', hatStitch: stitch, cape: 'cape', capeStitch: stitch };
    const built = buildFighter(f);
    const n = built.garments.filter((m) => /hat|shawl/.test(m.userData.worn)).reduce((sum, m) => sum + m.geometry.index.count / 3, 0);
    disposeFighter(built);
    return n;
  };
  const smooth = triangles('stockinette');
  for (const stitch of TEXTURES) {
    assert.ok(triangles(stitch) <= smooth * 5, `${stitch} hat and cape cost ${triangles(stitch)} triangles, over 5× smooth (${smooth})`);
  }
}

{
  const f = setFur(newFighter('llama'), FUR[3].hex);
  assert.equal(f.params.bodyColor, FUR[3].hex);
  assert.notEqual(f.params.fleeceColor, newFighter('llama').params.fleeceColor, 'the fleece follows a new fur colour');
}

{
  const { cell } = floorGrid();
  // ponytail: sampled, since species randomise() is Math.random only; 1.4 vs 1.26 widest of 600 is the margin
  for (let i = 0; i < 40; i++) {
    const f = randomFighter();
    f.look = { ...f.look, cape: 'capelet', bag: 'crossbody pouch' };
    const built = buildFighter(f);
    built.root.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(built.root).getSize(new THREE.Vector3());
    assert.ok(size.x < cell && size.z < cell, `a ${built.species.id} (${size.x.toFixed(2)} × ${size.z.toFixed(2)}) spills out of its ${cell} lobby square`);
    disposeFighter(built);
  }
}

{
  setGeometryDetail('med');
  LOOK.viewPx = SHOP_VIEW_PX;
  const relief = (species, stitch) => {
    const f = newFighter(species);
    f.look = { ...f.look, hat: 'beanie', hatStitch: stitch, cape: 'cape', capeStitch: stitch };
    const built = buildFighter(f);
    const n = built.garments.filter((m) => /hat|shawl/.test(m.userData.worn)).reduce((sum, m) => sum + m.geometry.index.count / 3, 0);
    disposeFighter(built);
    return n;
  };
  for (const species of SPECIES) {
    const smooth = relief(species, 'stockinette');
    for (const stitch of TEXTURES.slice(1)) assert.ok(relief(species, stitch) > smooth, `a ${species}'s ${stitch} is drawn smooth at match size`);
  }
  LOOK.viewPx = 0;
  setGeometryDetail('high');
}

console.log('fighter ok');
