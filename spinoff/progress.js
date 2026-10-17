// The game's progress, outside any one level (REUSE-SPEC.md §After the lobby): the one game save per browser, what a
// match's result unlocks, and what a room may pick. Pure functions and localStorage only; the pages and the network call in.
import { LEVELS, STAGES, levelOf } from './levels.js';
// ponytail: only the rules the spec has; the next one (a stage unlocking, stamps) goes beside outcomeOf

/** @typedef {import('./generate.js').StageName} StageName @typedef {import('./match.js').Team} Team */
/**
 * `beaten`: the highest level won or tied (the sword's unlock, REUSE-SPEC.md §Fighter chooser); `reached`: per stage,
 * the highest level its player may pick (every stage they have starts at 1).
 * @typedef {{ beaten: number, reached: Partial<Record<StageName, number>> }} Progress
 * @typedef {{ beaten: number, reached: number, next: number }} Outcome
 *   what one hero's end card means: the level beaten (0 for none), the level now reached (0 for none), and the level ▶️ plays
 */

// Apart from the fighter, so re-rolling or re-dressing never touches it. The sword's save from before levels were
// numbered (`{ "beaten": 1 }`) is this one already, with nothing reached yet.
export const PROGRESS_KEY = 'lys.progress.v1';
const MAX_LEVEL = 99;

const whole = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_LEVEL;

/** Untrusted JSON, from storage or another tablet, as Progress: anything unknown or out of range is dropped. @returns {Progress} */
export function readProgress(raw) {
  const reached = Object.fromEntries(Object.keys(STAGES).filter((k) => whole(raw?.reached?.[k])).map((k) => [k, raw.reached[k]]));
  return { beaten: whole(raw?.beaten) ? raw.beaten : 0, reached };
}

/** @returns {Progress} */
export function loadProgress() {
  try { return readProgress(JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? 'null')); } catch { return readProgress(null); }
}

/** @param {Progress} p */
function saveProgress(p) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch {}
}

/** The highest level this tablet's player has beaten. */
export const levelsBeaten = () => loadProgress().beaten;

/** Saves level `n` as beaten, at once, unless a higher one already is. */
export function beatLevel(n) {
  const p = loadProgress();
  if (whole(n) && n > p.beaten) saveProgress({ ...p, beaten: n });
}

/** @param {Progress} p @param {string} name */
export const reachedOn = (p, name) => p.reached[name] ?? 1;

/**
 * A hero's result on level `n` of stage `name` (0: a layout picked by address). A win reaches the next level and ▶️
 * plays it, if there is one; a loss or a tie replays. A tie still counts as beating the level, as the sword was built
 * (REUSE-SPEC.md §Fighter chooser), though it reaches nothing new.
 * @param {string} name @param {number} n @param {Team|null} winner @returns {Outcome}
 */
export function outcomeOf(name, n, winner) {
  const won = winner === 'heroes' && n > 0;
  return { beaten: winner === 'badGuys' ? 0 : n, reached: won ? n + 1 : 0, next: won && levelOf(name, n + 1) ? n + 1 : n };
}

/** Progress after an outcome on stage `name`: nothing is ever taken back. @param {Progress} p @param {string} name @param {Outcome} o @returns {Progress} */
export function withOutcome(p, name, o) {
  const reached = o.reached > reachedOn(p, name) ? { ...p.reached, [name]: o.reached } : p.reached;
  return { beaten: Math.max(p.beaten, o.beaten), reached };
}

/** Records a hero's outcome on stage `name`, saved at once. @param {string} name @param {Outcome} o */
export const recordOutcome = (name, o) => saveProgress(withOutcome(loadProgress(), name, o));

// ponytail: how a new stage unlocks isn't decided yet (REUSE-SPEC.md §After the lobby), so every stage with numbered
// levels is open to everyone: today only breakfast, the tutorial stage
/** The stages a room may pick. */
export const roomStages = () => Object.keys(LEVELS);

/** A stage's levels the room may pick: up to the lowest any player in it has reached, and only levels there are. @param {Progress[]} everyone */
export const roomLevels = (name, everyone) => (LEVELS[name] ?? []).filter((l) => everyone.every((p) => l.number <= reachedOn(p, name)));
