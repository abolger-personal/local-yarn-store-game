// The Guestbook selfie: the NPC, dressed in what they made, as a 2D picture.
//
// CHARACTER-VISIT.md: "a picture generated of them holding object ... pictured in/with it even if
// they are not currently wearing it". The studio (a fresh, un-merged copy of their body, dressed,
// posed by selfie.js and rendered over a backdrop) is selfie-studio.js, shared with crowd.html.
// This is the shop's half: what they have on and in hand, and one picture per entry.

import { TONE_MAPPING, getSpecies } from '../../npc.js';
import { heldAs, pileAs, wornAs } from '../../garments.js';
import { snap } from '../../selfie-studio.js';
import { YARN_COLORS } from '../goods/stock.js';
import { S } from '../core/config.js';
import { shop } from '../core/state.js';

const colourOf = (yarn) => YARN_COLORS[yarn.colorIndex % YARN_COLORS.length];

/** What the photographed object is drawn as: worn, or in the free paw (decor). */
const subjectOf = (wip) => (wip ? wornAs(wip, colourOf) ?? heldAs(wip, colourOf) : null);

/** Everything they have on, with the photographed object last so it wins its slot, and any armful they carry. */
function outfitFor(npc, wip) {
  const made = [...Object.values(npc.worn).filter(Boolean).map((w) => wornAs(w, colourOf)), subjectOf(wip),
    pileAs(npc.carries ?? [], colourOf)];
  return Object.fromEntries(made.filter(Boolean).map(({ type, item }) => [type, item]));
}

/** One photo as a data URL. Cached per guestbook entry: a selfie is taken once. */
const photos = new WeakMap();
function photoOf(entry, npc) {
  if (!photos.has(entry)) {
    photos.set(entry, snap(
      { body: npc.body, kit: getSpecies(npc.speciesId), outfit: outfitFor(npc, entry.wip), type: subjectOf(entry.wip)?.type },
      { toneMapping: TONE_MAPPING[S.toneMapping], exposure: S.exposure },
    ).url);
  }
  return photos.get(entry);
}

/**
 * A guestbook photo entry's picture, or null. A past day's entry carries who signed it (see
 * fileGuestbook in world.js); today's visitors are still in the shop.
 */
export function photoFor(entry) {
  const who = entry.who ?? shop.world?.npcs.find((n) => n.id === entry.npcId);
  return who ? photoOf(entry, who) : null;
}
