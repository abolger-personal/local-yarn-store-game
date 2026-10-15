import { LEVELS } from './levels.js';
import { checkLevel } from './check-level.mjs';

for (const [n, { stage, breakIn }] of Object.entries(LEVELS)) checkLevel(stage, `level ${n}`, breakIn);

console.log(`levels ok (${Object.keys(LEVELS).length} levels)`);
