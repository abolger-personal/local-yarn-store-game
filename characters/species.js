// ai_planning_sessions/characters/ADDING-A-SPECIES.md: every species, registered in this order; a new one is one more import
import { speciesIds } from './npc.js';
import './owl.js';
import './llama.js';
import './lion.js';
import './dragon.js';

export const SPECIES_IDS = Object.freeze(speciesIds());
export { getSpecies, speciesIds, speciesList } from './npc.js';
