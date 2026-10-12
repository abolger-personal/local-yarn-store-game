import { TONE_MAPPING, getSpecies } from '../../npc.js';
import { heldAs, pileAs, wornAs } from '../../garments.js';
import { snap } from '../../selfie-studio.js';
import { YARN_COLORS } from '../goods/stock.js';
import { S } from '../core/config.js';
import { shop } from '../core/state.js';

const colourOf = (yarn) => YARN_COLORS[yarn.colorIndex % YARN_COLORS.length];

const subjectOf = (wip) => (wip ? wornAs(wip, colourOf) ?? heldAs(wip, colourOf) : null);

function outfitFor(npc, wip) {
  const made = [...Object.values(npc.worn).filter(Boolean).map((w) => wornAs(w, colourOf)), subjectOf(wip),
    pileAs(npc.carries ?? [], colourOf)];
  return Object.fromEntries(made.filter(Boolean).map(({ type, item }) => [type, item]));
}

const photos = new WeakMap();
function photoOf(entry, npc) {
  if (!photos.has(entry)) {
    const subject = subjectOf(entry.wip);
    photos.set(entry, snap(
      { body: npc.body, kit: getSpecies(npc.speciesId), outfit: outfitFor(npc, entry.wip), type: subject?.type, silhouette: subject?.item.silhouette },
      { toneMapping: TONE_MAPPING[S.toneMapping], exposure: S.exposure },
    ).url);
  }
  return photos.get(entry);
}

export function photoFor(entry) {
  const who = entry.who ?? shop.world?.npcs.find((n) => n.id === entry.npcId);
  return who ? photoOf(entry, who) : null;
}
