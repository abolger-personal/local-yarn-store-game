// Works in progress: what an NPC is making, what they still need for it, and how it finishes.
//
// Pure: no three.js, no DOM. This is the model behind
// ai_planning_sessions/characters/WIP-AND-FINISHED-OBJ-FORMATION.md, kept out of visit.js because
// it is a mechanic in its own right — visit.js decides what an NPC DOES this round, this file
// decides what they are carrying it out FOR. Node-testable (see wip.test.mjs).

import {
  CRAFTS, TOOL_FOR_CRAFT, PATTERN_TYPES, makeStockPattern, makeStockYarn, makeStockNotion,
  YARN_MATERIALS, YARN_WEIGHT_NAMES, yarnUnits, labelOf,
} from '../inventory/catalog.js';

/** "A WIP is either: UNSTARTED, IN PROGRESS, FINISHED OBJECT, (or FROGGED, a post MVP mechanic)" */
export const WIP_STATE = Object.freeze({
  UNSTARTED: 'UNSTARTED',
  IN_PROGRESS: 'IN PROGRESS',
  FINISHED: 'FINISHED OBJECT',
  // FROGGED is post-MVP and deliberately absent: an unreachable state is worse than a missing one.
});

/** WEARABLE-FINISHED-OBJ.md: "4 slots: head, torso, hands, neck". */
export const WEAR_SLOTS = Object.freeze(['head', 'torso', 'hands', 'neck']);

/**
 * Which body slot a finished pattern occupies. The spec lists mittens against `hands` but
 * PATTERNS.md's MVP type list has no mitten pattern, so nothing can currently fill that slot —
 * it is here because the slot exists, not because it is reachable.
 */
export const WEAR_SLOT_FOR = Object.freeze({
  hat: 'head', sweater: 'torso', shawl: 'torso', cowl: 'neck', mittens: 'hands',
});

const pickFrom = (list, rng) => list[Math.floor(rng() * list.length)];

/** n distinct members of `list`, 2 to 6 of them per CHARACTER-ATTRIBUTES.md. */
function someOf(list, rng, min = 2, max = 6) {
  const want = min + Math.floor(rng() * (max - min + 1));
  const pool = [...list];
  const out = [];
  while (out.length < want && pool.length) out.push(...pool.splice(Math.floor(rng() * pool.length), 1));
  return out;
}

/**
 * CHARACTER-ATTRIBUTES.md: "personal craft preferences completely unrelated to personality".
 * Deliberately rolled independently of the Big Five, because the doc says so — these are taste,
 * not temperament, and mixing them would make every enthusiastic NPC like the same yarn.
 */
export function makeCraftPrefs(rng = Math.random) {
  const both = rng() < 1 / 3;
  return {
    skill: 1 + Math.floor(rng() * 5),                  // "from 1 to 5"
    crafts: both ? [...CRAFTS] : [pickFrom(CRAFTS, rng)],
    materials: someOf(YARN_MATERIALS, rng),
    weights: someOf(YARN_WEIGHT_NAMES, rng),
  };
}

/**
 * One UNSTARTED slot at generation time.
 *
 * The two hard rules from the spec, in order:
 *   - "If a WIP is initialized with a pattern, then other slots are zeroed out (NPC must shop)".
 *     This is the engine of the whole game: a pattern with nothing to make it from is a shopping
 *     list, and the shopping list is what sends them to the displays.
 *   - "If a WIP is NOT initialized with a pattern: then TOOL NOTIONS must match one of the NPCs
 *     skill types". You do not carry hooks you cannot use.
 *
 * The pattern chance itself is probabilistic: "(Intellect + Orderliness)/10 determine how likely
 * the WIP is to be initialized with a pattern in the first place".
 */
export function makeWip(id, traits, prefs, rng = Math.random) {
  const wip = {
    id,
    state: WIP_STATE.UNSTARTED,
    pattern: null,
    yarn: [],          // items of yarn, NOT units — one bulky ball is worth several units
    tool: null,
    progress: 0,       // percent toward completion
  };

  if (rng() < (traits.Intellect + traits.Orderliness) / 10) {
    // From the shop's RANGE, not from everything that exists — see SHOP_RANGE. A customer who
    // walks in wanting silk lace this shop has never carried is a customer who cannot be served,
    // and a shop full of those is a game with no moves in it.
    wip.pattern = makeStockPattern(rng);
    return wip;        // pattern-first: everything else is deliberately left empty to be shopped for
  }

  // No pattern, so they may already own some of the makings.
  // "If a WIP is NOT initialized with a pattern: then TOOL NOTIONS must match one of the NPCs
  // skill types" — you do not carry hooks you cannot use.
  if (rng() < 0.6) wip.tool = makeStockNotion(rng, TOOL_FOR_CRAFT[pickFrom(prefs.crafts, rng)]);
  // ..."and 0 to 1 items of YARN".
  if (rng() < 0.5) wip.yarn.push(makeStockYarn(rng));
  return wip;
}

// ---------------------------------------------------------------- what a WIP still needs

/** Units of yarn this WIP has, summed over its items. A 3x3 ball is worth 9. */
export const heldUnits = (wip) => wip.yarn.reduce((n, y) => n + yarnUnits(y), 0);

/** Units still to buy, or 0. Without a pattern there is no number to be short of. */
export const unitsShort = (wip) =>
  (wip.pattern ? Math.max(0, wip.pattern.yarnUnits - heldUnits(wip)) : 0);

/**
 * Does this yarn suit this pattern? "the yarn shares all attributes the pattern specifies" — which
 * is its material and its weight.
 *
 * The SAME predicate answers the mirror question, matching a pattern to yarn the NPC already owns,
 * because "the same yarn attributes (weight, material)" is the identical comparison read the other
 * way round. One function, so the two directions cannot drift apart.
 *
 * TODO(spec): `minColors` is an attribute the pattern specifies too, but it is a property of the
 * whole yarn collection rather than of one ball, so it cannot be checked here. It wants a
 * completeness test over `wip.yarn` once colour matters.
 * TODO(spec): the doc flags this as a strict match — "we can make this a messy match later if we
 * want". Loosening it is a change to this one function.
 */
export const yarnSuitsPattern = (yarn, pattern) =>
  pattern.materials.includes(yarn.material) && yarn.weight === pattern.weight;

/** Does this tool suit this pattern? The craft names the kind, and the pattern names the size. */
export const toolSuitsPattern = (tool, pattern) =>
  tool.name === TOOL_FOR_CRAFT[pattern.craft] && tool.size === pattern.toolSize;

/** Is the tool already in this WIP the right one? Without a pattern there is nothing to judge by. */
export const toolFits = (tool, wip) =>
  tool != null && wip.pattern != null && toolSuitsPattern(tool, wip.pattern);

/**
 * "1 pattern exists, 1 or more YARN units exist, 1 or more Tool notions exist."
 *
 * Note this is the spec's threshold for STARTING, which is one unit, not the pattern's full
 * requirement — you cast on with the yarn you have and buy more later.
 */
export const canStart = (wip) =>
  wip.pattern != null && heldUnits(wip) >= 1 && toolFits(wip.tool, wip);

/**
 * The shopping list for one WIP slot. Everything hangs off whether it has a PATTERN, because the
 * pattern is what turns a vague wish into a specific requirement:
 *
 *   - No pattern: they want one, and nothing else. A tool cannot be chosen before the craft is
 *     known, and yarn cannot be chosen before the material is. If they are already holding yarn,
 *     the pattern has to suit THAT yarn.
 *   - Pattern, short of yarn: yarn matching the pattern's material and weight.
 *   - Pattern, wrong or no tool: the right tool at the right millimetres.
 *
 * Returns null for a slot that needs nothing.
 */
function wantsFor(wip) {
  if (wip.state === WIP_STATE.FINISHED) return [];
  const out = [];
  if (!wip.pattern) {
    // "A WIP that has a YARN but no pattern, then any pattern with the same yarn attributes
    // (weight, material) will match" — and notion tools explicitly do NOT match, which is why no
    // tool want is generated on this branch at all.
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
  return out;
}

/** Everything this NPC's open WIP slots still need. */
export const wantsOf = (npc) => npc.wips.flatMap(wantsFor);

/**
 * One line for a WANT — what an NPC is still shopping FOR.
 *
 * Deliberately not `labelOf`. That names a thing that EXISTS, and reads fields off it that a want
 * simply does not have: a want has no `name`, and carries `materials` (a list of what would do)
 * rather than the one `material` an actual ball is dyed in. Passing a want to `labelOf` therefore
 * fell through to `thing.name` and rendered the word "undefined" — which is exactly the bug this
 * exists to stop recurring, since `npc.target` became a want when WIPs replaced hardcoded targets.
 */
export const labelWant = (want) => {
  if (!want) return 'nothing in particular';
  if (want.kind === 'pattern') {
    return want.forYarn ? `a pattern for ${labelOf(want.forYarn)}` : 'a pattern';
  }
  if (want.kind === 'yarn') {
    // labelOf still does the naming; it is handed a shape it understands. "or" because the want is
    // satisfied by ANY of the pattern's materials, and "and" would read as needing all of them.
    return `${want.units} unit${want.units === 1 ? '' : 's'} of ${
      labelOf({ name: 'yarn', weight: want.weight, material: want.materials.join(' or ') })}`;
  }
  return labelOf({ name: want.tool, size: want.size });
};

/**
 * Does this shelf item satisfy that want?
 *
 * Formation-level only, per DISPLAYS.md — "determined by Formation and is independent of NPC
 * personality or preference". An NPC takes the alpaca their pattern calls for even if they only
 * ever buy wool. Taste decides what they enjoy, not what completes a project.
 */
export function satisfies(item, want) {
  if (want.kind === 'pattern') {
    if (item.name !== 'pattern') return false;
    // Holding yarn already narrows it to patterns that yarn can actually make.
    return want.forYarn ? yarnSuitsPattern(want.forYarn, item) : true;
  }
  if (want.kind === 'yarn') {
    return item.name === 'yarn' && want.materials.includes(item.material) && item.weight === want.weight;
  }
  return item.name === want.tool && item.size === want.size;
}

/**
 * The spec names this function, so it keeps the spec's casing rather than the file's.
 *
 * "should take in what the NPC is looking at and return matches to wants" — so it answers for a
 * whole shelf at once, and each match carries the want it satisfies, because the caller has to know
 * which WIP slot a bought item is filed into.
 */
export function MatchObservedInventory(npc, items) {
  const wants = wantsOf(npc);
  const out = [];
  items.forEach((item, index) => {
    const want = wants.find((w) => satisfies(item, w));
    if (want) out.push({ index, item, want });
  });
  return out;
}

/** The first want this one item would satisfy, or null. */
export const wantFor = (npc, item) => wantsOf(npc).find((w) => satisfies(item, w)) ?? null;

// ---------------------------------------------------------------- acquiring and making

/** File a bought item into the WIP that wanted it, and start that WIP if it now has everything. */
export function stow(npc, item, want) {
  // A null want means the caller matched nothing — filing the item anyway would put a hook in the
  // yarn slot. Refuse rather than guess; the buy branch treats null as "do not buy".
  const wip = want ? npc.wips.find((w) => w.id === want.wip) : null;
  if (!wip) return null;
  if (want.kind === 'pattern') wip.pattern = item;
  else if (want.kind === 'yarn') wip.yarn.push(item);
  else wip.tool = item;
  if (wip.state === WIP_STATE.UNSTARTED && canStart(wip)) {
    wip.state = WIP_STATE.IN_PROGRESS;
  }
  return wip;
}

/**
 * One round of work. "1/(number of units of yarn called for by pattern) * characterWeight", with
 * "characterWeight = (NPC crafter skill level)/3 * Industriousness/3".
 *
 * NOTE(spec): the increment is written as a FRACTION (1/units) but the threshold as a percentage
 * ("progress is incremented over 100"). Read as a fraction of completion — so at characterWeight 1
 * a project takes exactly its yarn-unit count in rounds, which is clearly the intent: a 2-unit cowl
 * is a two-round job, a 20-unit sweater is a day's work. Stored as a percent for the debug panel.
 */
export function workRound(npc, wip, round = null) {
  if (wip.state !== WIP_STATE.IN_PROGRESS) return false;
  const weight = (npc.prefs.skill / 3) * (npc.traits.Industriousness / 3);
  wip.progress += (100 / wip.pattern.yarnUnits) * weight;
  if (wip.progress < 100) return false;

  wip.progress = 100;
  wip.state = WIP_STATE.FINISHED;
  // Stamped so the Guestbook can pick the MOST RECENT one. An NPC who finishes two things in a
  // visit is photographed with the second, and without this the order is whatever the slots
  // happen to be in.
  wip.finishedRound = round;
  // "Finishing a WIP results in a permanent +1 to the NPCs crafter skill level up to a max of 5."
  npc.prefs.skill = Math.min(5, npc.prefs.skill + 1);
  return true;
}

// ---------------------------------------------------------------- finished objects

/** Finished objects still sitting in a WIP slot — not yet worn or handed over. */
export const finishedOf = (npc) => npc.wips.filter((w) => w.state === WIP_STATE.FINISHED);

/**
 * Everything this NPC has finished, wherever it now lives: still in a slot awaiting the Drop Off,
 * or already on their body. Newest first.
 *
 * Both places have to be searched, and the order matters. CHARACTER-VISIT.md: "The item in the
 * PHOTO should be the most recently finished object, and the NPC should be pictured in/with it
 * even if they are not currently wearing it (e.g. it is being lent to the shop)." So the photo
 * cannot just show what they have on — the newest thing may be the one going to the shop, and
 * that is precisely the one worth a picture.
 *
 * An object with no stamp (one brought from home, or a hand-built test fixture) sorts oldest,
 * which is right: anything finished during the visit is more recent than anything that was not.
 */
export const everythingMade = (npc) =>
  [...finishedOf(npc), ...Object.values(npc.worn).filter(Boolean)]
    .sort((a, b) => (b.finishedRound ?? -Infinity) - (a.finishedRound ?? -Infinity));

/**
 * What the Guestbook photographs them in: the newest thing they have made that is not in the book
 * yet, or null. A thing is finished once, so it is photographed once: a regular who walks back in
 * wearing yesterday's hat has nothing new to show, and signs with a note instead.
 */
export const photoSubject = (npc) => everythingMade(npc).find((w) => !w.photographed) ?? null;

/** Which wear slot a finished WIP would take, or null for something not wearable. */
export const slotFor = (wip) => WEAR_SLOT_FOR[wip.pattern?.patternType] ?? null;

/**
 * WEARABLE-FINISHED-OBJ.md: "if NPC is not wearing an FO yet of a type in their clothing slot,
 * NPC should store FO in a worn slot and will not offer it to the shop to lend".
 *
 * So wearing is not a reward the player grants — it is the DEFAULT, and lending is what happens to
 * the overflow. That is the right way round: an NPC who knits a hat wants to wear the hat.
 *
 * Something WORN leaves the WIP slots here and now — "store FO in a worn slot" is a move, and a
 * slot is a limited resource (`maxWips`) that an object cannot sit in forever.
 *
 * Something to be LENT does not leave yet. It leaves at the Drop Off, which is where the spec puts
 * it ("the NPC will bring it to the finished objects drop area... the item should LEAVE the NPC's
 * WIPs slots at this point") — and that is two steps later, AFTER they sign the Guestbook. An NPC
 * signs the book still holding what they made, which is the right way round: the photo is of them
 * with the object, and only then do they hand it over.
 *
 * TODO: nothing refills a freed slot. An NPC who finishes a project mid-visit has capacity for a
 * new one and no way to start it, which is the natural home for a "cast on something new" action.
 *
 * Returns the objects to be offered, which are still in their slots until the Drop Off.
 */
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

/** Hand a finished object over to the shop: out of the WIP slot, into the Drop Off. */
export function lend(npc, wip) {
  npc.wips = npc.wips.filter((w) => w !== wip);
  return wip;
}

/**
 * "the player can choose to click on an FO and 'return borrowed FO to NPC', which will, off screen,
 * move that item into the worn slot for the NPC and place any previously offscreen item the NPC was
 * wearing in a pile in the shop behind the guestbook."
 *
 * The displaced object goes to `world.backPile` rather than back into circulation: the spec is
 * explicit that it lands in a pile, and that pile is a place in the shop, not an inventory.
 */
export function returnToNpc(world, npc, wip) {
  const slot = slotFor(wip);
  if (!slot) return false;
  const index = world.dropOff.findIndex((d) => d.wip === wip);
  if (index === -1) return false;
  world.dropOff.splice(index, 1);
  const displaced = npc.worn[slot];
  npc.worn[slot] = wip;
  if (displaced) world.backPile.push({ npc: npc.name, wip: displaced });
  return true;
}

/** One line for the debug panel. */
export const describeWip = (wip) =>
  `${wip.pattern ? labelOf(wip.pattern) : 'no pattern'} · ` +
  `${heldUnits(wip)}${wip.pattern ? `/${wip.pattern.yarnUnits}` : ''} units · ` +
  `${wip.tool ? labelOf(wip.tool) : 'no tool'}${
    wip.state === WIP_STATE.IN_PROGRESS ? ` · ${Math.round(wip.progress)}%` : ''}`;

export { PATTERN_TYPES, YARN_MATERIALS };
