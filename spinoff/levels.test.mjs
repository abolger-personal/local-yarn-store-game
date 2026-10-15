import { LEVELS } from './levels.js';
import { checkLevel } from './check-level.mjs';

for (const [n, { stage }] of Object.entries(LEVELS)) checkLevel(stage, `level ${n}`);

console.log(`levels ok (${Object.keys(LEVELS).length} levels)`);
