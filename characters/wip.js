import {
  CRAFTS, TOOL_FOR_CRAFT, PATTERN_TYPES, makeStockPattern, makeStockYarn, makeStockNotion,
  YARN_MATERIALS, YARN_WEIGHT_NAMES, yarnUnits, labelOf,
} from '../inventory/catalog.js';

export const WIP_STATE = Object.freeze({
  UNSTARTED: 'UNSTARTED',
  IN_PROGRESS: 'IN PROGRESS',
  FINISHED: 'FINISHED OBJECT',
});

export const WEAR_SLOTS = Object.freeze(['head', 'neck', 'shoulders', 'torso', 'bag', 'feet']);

export const WEAR_SLOT_FOR = Object.freeze({
  hat: 'head', scarf: 'neck', shawl: 'shoulders', sweater: 'torso', bag: 'bag', socks: 'feet',
});

const pickFrom = (list, rng) => list[Math.floor(rng() * list.length)];

function someOf(list, rng, min = 2, max = 6) {
  const want = min + Math.floor(rng() * (max - min + 1));
  const pool = [...list];
  const out = [];
  while (out.length < want && pool.length) out.push(...pool.splice(Math.floor(rng() * pool.length), 1));
  return out;
}

export function makeCraftPrefs(rng = Math.random) {
  const both = rng() < 1 / 3;
  return {
    skill: 1 + Math.floor(rng() * 5),
    crafts: both ? [...CRAFTS] : [pickFrom(CRAFTS, rng)],
    materials: someOf(YARN_MATERIALS, rng),
    weights: someOf(YARN_WEIGHT_NAMES, rng),
  };
}

export function makeWip(id, traits, prefs, rng = Math.random) {
  const wip = {
    id,
    state: WIP_STATE.UNSTARTED,
    pattern: null,
    yarn: [],
    tool: null,
    notions: [],
    progress: 0,
  };

  if (rng() < (traits.Intellect + traits.Orderliness) / 10) {
    wip.pattern = makeStockPattern(rng);
    return wip;
  }

  if (rng() < 0.6) wip.tool = makeStockNotion(rng, TOOL_FOR_CRAFT[pickFrom(prefs.crafts, rng)]);
  if (rng() < 0.5) wip.yarn.push(makeStockYarn(rng));
  return wip;
}

export const heldUnits = (wip) => wip.yarn.reduce((n, y) => n + yarnUnits(y), 0);

export const unitsShort = (wip) =>
  (wip.pattern ? Math.max(0, wip.pattern.yarnUnits - heldUnits(wip)) : 0);

export const runningOut = (wip) =>
  unitsShort(wip) > 0 && wip.progress >= (100 * heldUnits(wip)) / wip.pattern.yarnUnits;

export const yarnSuitsPattern = (yarn, pattern) =>
  pattern.materials.includes(yarn.material) && yarn.weight === pattern.weight;

export const toolSuitsPattern = (tool, pattern) =>
  tool.name === TOOL_FOR_CRAFT[pattern.craft] && tool.size === pattern.toolSize;

export const toolFits = (tool, wip) =>
  tool != null && wip.pattern != null && toolSuitsPattern(tool, wip.pattern);

export const canStart = (wip) =>
  wip.pattern != null && heldUnits(wip) >= 1 && toolFits(wip.tool, wip);

function wantsFor(wip) {
  if (wip.state === WIP_STATE.FINISHED) return [];
  const out = [];
  if (!wip.pattern) {
    out.push({ kind: 'pattern', wip: wip.id, forYarn: wip.yarn[0] ?? null });
    return out;
  }
  if (unitsShort(wip) > 0) {
    out.push({ kind: 'yarn', wip: wip.id, units: unitsShort(wip),
               materials: wip.pattern.materials, weight: wip.pattern.weight });
  }
  if (!toolFits(wip.tool, wip)) {
    out.push({ kind: 'tool', wip: wip.id,
               tool: TOOL_FOR_CRAFT[wip.pattern.craft], size: wip.pattern.toolSize });
  }
  for (const name of wip.pattern.notions ?? []) {
    if (!wip.notions?.some((n) => n.name === name)) out.push({ kind: 'notion', wip: wip.id, tool: name, size: null });
  }
  return out;
}

export const wantsOf = (npc) => npc.wips.flatMap(wantsFor);

export const readyWips = (npc) =>
  npc.wips.filter((w) => w.pattern && w.state !== WIP_STATE.FINISHED && !wantsFor(w).length).map((w) => w.id);

export const labelWant = (want) => {
  if (!want) return 'nothing in particular';
  if (want.kind === 'pattern') {
    return want.forYarn ? `a pattern for ${labelOf(want.forYarn)}` : 'a pattern';
  }
  if (want.kind === 'yarn') {
    return `${want.units} unit${want.units === 1 ? '' : 's'} of ${
      labelOf({ name: 'yarn', weight: want.weight, material: want.materials.join(' or ') })}`;
  }
  return labelOf({ name: want.tool, size: want.size });
};

export function satisfies(item, want) {
  if (want.kind === 'pattern') {
    if (item.name !== 'pattern') return false;
    return want.forYarn ? yarnSuitsPattern(want.forYarn, item) : true;
  }
  if (want.kind === 'yarn') {
    return item.name === 'yarn' && want.materials.includes(item.material) && item.weight === want.weight;
  }
  return item.name === want.tool && item.size === want.size;
}

export function MatchObservedInventory(npc, items) {
  const wants = wantsOf(npc);
  const out = [];
  items.forEach((item, index) => {
    const want = wants.find((w) => satisfies(item, w));
    if (want) out.push({ index, item, want });
  });
  return out;
}

export const wantFor = (npc, item) => wantsOf(npc).find((w) => satisfies(item, w)) ?? null;

export function stow(npc, item, want) {
  const wip = want ? npc.wips.find((w) => w.id === want.wip) : null;
  if (!wip) return null;
  if (want.kind === 'pattern') wip.pattern = item;
  else if (want.kind === 'yarn') wip.yarn.push(item);
  else if (want.kind === 'notion') (wip.notions ??= []).push(item);
  else wip.tool = item;
  if (wip.state === WIP_STATE.UNSTARTED && canStart(wip)) {
    wip.state = WIP_STATE.IN_PROGRESS;
  }
  return wip;
}

export const progressLimit = (wip) => Math.min(wip.holdAt ?? 100,
  unitsShort(wip) > 0 ? (100 * heldUnits(wip)) / wip.pattern.yarnUnits : 100);

const workStep = (npc, wip) =>
  (100 / wip.pattern.yarnUnits) * (npc.prefs.skill / 3) * (npc.traits.Industriousness / 3);

export const roundsToFinish = (npc, wip) => (progressLimit(wip) < 100 ? Infinity
  : Math.max(0, Math.ceil((100 - wip.progress) / workStep(npc, wip) - 1e-9)));

export function workRound(npc, wip, round = null) {
  if (wip.state !== WIP_STATE.IN_PROGRESS) return false;
  const limit = progressLimit(wip);
  if (wip.progress >= limit) return false;
  wip.progress = Math.min(limit, wip.progress + workStep(npc, wip));
  if (wip.progress < 100 - 1e-9) return false;

  wip.progress = 100;
  wip.state = WIP_STATE.FINISHED;
  wip.finishedRound = round;
  npc.prefs.skill = Math.min(5, npc.prefs.skill + 1);
  return true;
}

export const finishedOf = (npc) => npc.wips.filter((w) => w.state === WIP_STATE.FINISHED);

export const everythingMade = (npc) =>
  [...finishedOf(npc), ...Object.values(npc.worn).filter(Boolean)]
    .sort((a, b) => (b.finishedRound ?? -Infinity) - (a.finishedRound ?? -Infinity));

export const photoSubject = (npc) => everythingMade(npc).find((w) => !w.photographed) ?? null;

export const slotFor = (wip) => WEAR_SLOT_FOR[wip.pattern?.patternType] ?? null;

export function wearOrOffer(npc) {
  const offer = [];
  for (const wip of finishedOf(npc)) {
    const slot = slotFor(wip);
    if (slot && !npc.worn[slot]) {
      npc.worn[slot] = wip;
      npc.wips = npc.wips.filter((w) => w !== wip);
    } else {
      offer.push(wip);
    }
  }
  return offer;
}

export function lend(npc, wip) {
  npc.wips = npc.wips.filter((w) => w !== wip);
  return wip;
}

export function returnToNpc(world, npc, wip) {
  const slot = slotFor(wip);
  if (!slot) return false;
  const index = world.lent.findIndex((d) => d.wip === wip);
  if (index === -1) return false;
  world.lent.splice(index, 1);
  const displaced = npc.worn[slot];
  npc.worn[slot] = wip;
  if (displaced) world.backPile.push({ npc: npc.name, wip: displaced });
  return true;
}

export const describeWip = (wip) =>
  `${wip.pattern ? labelOf(wip.pattern) : 'no pattern'} · ` +
  `${heldUnits(wip)}${wip.pattern ? `/${wip.pattern.yarnUnits}` : ''} units · ` +
  `${wip.tool ? labelOf(wip.tool) : 'no tool'}${
    wip.state === WIP_STATE.IN_PROGRESS ? ` · ${Math.round(wip.progress)}%` : ''}`;

export { PATTERN_TYPES, YARN_MATERIALS };
