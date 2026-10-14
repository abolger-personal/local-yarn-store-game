import assert from 'node:assert/strict';
import * as THREE from 'three';
import { POSES, applyPose } from '../characters/npc.js';
import { LOOK } from '../characters/garments.js';
import {
  BAGS, CAPES, CLOTH, FUR, HATS, SPECIES, buildFighter, disposeFighter, isBadGuyCloth, isBadGuyFur, newFighter,
  randomFighter, readFighter, setFur,
} from './fighter.js';

LOOK.viewPx = 0;

const at = (o) => o.getWorldPosition(new THREE.Vector3());

for (const species of SPECIES) {
  const built = buildFighter(newFighter(species));
  assert.equal(built.gloves.length, 2, `${species}: a glove on each hand`);
  for (const pose of ['rest', 'reach', 'delighted']) {
    applyPose(built, { ...POSES.rest, ...POSES[pose] });
    built.root.updateMatrixWorld(true);
    built.gloves.forEach((glove, i) => {
      const hand = built.holds[i].parent;
      assert.ok(at(glove).distanceTo(at(hand)) < 1e-6, `${species} ${pose}: glove ${i} has come off its hand`);
    });
  }
  const r = new THREE.Box3().setFromObject(built.gloves[0]).getSize(new THREE.Vector3()).x / 2;
  assert.ok(r > 0.042 * 1.4, `${species}: a glove (r ${r.toFixed(3)}) must read bigger than the bare hand it covers`);
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
  for (const [species, list] of Object.entries(FUR)) for (const { hex, name } of list) assert.ok(!isBadGuyFur(hex), `${species} ${name} fur reads as bad-guy grey`);
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
    look: { hat: 'crown', hatColor: '#000000', cape: null, bag: 'suitcase', gloves: 12 } });
  const fresh = newFighter('llama');
  assert.equal(junk.params.headRadius, fresh.params.headRadius, 'a non-number size is ignored');
  assert.equal(junk.params.legHeight, fresh.params.legHeight, 'NaN is ignored');
  assert.equal(junk.params.view, fresh.params.view, 'free text from another tablet is ignored');
  assert.ok(/^#[0-9a-f]{6}$/i.test(junk.params.bodyColor), 'a colour must be a colour');
  assert.ok(HATS.includes(junk.look.hat), 'an unknown hat falls back to a real one');
  assert.equal(junk.look.cape, null, 'no cape is a real choice');
  assert.ok(BAGS.includes(junk.look.bag) && CLOTH.some((s) => s.hex === junk.look.gloves), 'unknown bag and glove colour fall back');
  assert.ok(CLOTH.some((s) => s.hex === junk.look.hatColor), 'black is not a kid\'s hat colour, even from another tablet');
}

{
  const f = setFur(newFighter('llama'), FUR.llama[3].hex);
  assert.equal(f.params.bodyColor, FUR.llama[3].hex);
  assert.notEqual(f.params.fleeceColor, newFighter('llama').params.fleeceColor, 'the fleece follows a new fur colour');
}

console.log('fighter ok');
