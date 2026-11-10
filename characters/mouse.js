import { registerSpecies } from './npc.js';
import { LION } from './lion.js';

// BODIES.md §Mouse: the lion, big round ears for its mane, a bare tail
const EARS = Object.freeze({ earLength: 0.170, earWidth: 0.085, earFlatten: 0.35, earSpread: 0.60, earTilt: 0.45, earPoint: 0 });

registerSpecies({
  ...LION,
  id: 'mouse',
  label: 'Mouse',
  emoji: '🐭',
  firstFur: '#5eccf6',
  defaults: { ...LION.defaults, name: 'Nibbles', mane: false, tailTuft: false, ...EARS },
  randomRanges: {
    ...LION.randomRanges,
    earLength: [0.150, 0.190], earWidth: [0.075, 0.095], earFlatten: [0.28, 0.42],
    earSpread: [0.54, 0.66], earTilt: [0.30, 0.60], earPoint: [0, 0],
  },
  gui: { 'head & face': LION.gui['head & face'] },
  presets: undefined,
  presetKey: undefined,
});
