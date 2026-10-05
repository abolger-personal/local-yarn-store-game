// What a Guestbook entry says: the expanded rows and the selfie's thank-you line.
//
// Pure: no three.js, no DOM, node-testable (guestbook.test.mjs). visit.js records the facts as the
// visit happens; this only words them. Every line here is built from something the sim recorded,
// never from what a customer wanted (DESIGN-DECISIONS.md: observed behaviour, never hidden state).
//
// Specs: ai_planning_sessions/TUTORIAL.md §7.1 (ball band), §7.3 (rows, witnessed vs gist),
//        ai_planning_sessions/characters/PROJECTS-AND-AUTHORSHIP.md §4b (the thank-you line).

import { labelOf, TOOL_FOR_CRAFT, YARN_COLOR_COUNT } from '../inventory/catalog.js';

// ---------------------------------------------------------------- the ball band (§7.1)

// The palette places hue i at about (i + ½) × 360/count degrees of OKLCH (YARN_COLORS in stock.js).
// ponytail: hue bands only, so a muted or very pale yarn still gets its hue's word; add "grey" /
// "pale" when the band needs lightness and chroma too.
const HUE_WORDS = /** @type {[number, string][]} */ ([[15, 'pink'], [45, 'red'], [75, 'orange'], [110, 'yellow'],
  [165, 'green'], [205, 'teal'], [270, 'blue'], [320, 'purple'], [360, 'pink']]);

/** The colour family a shopper would read off a ball. */
export function colourWord(colorIndex) {
  const hue = (((colorIndex % YARN_COLOR_COUNT) + 0.5) * 360) / YARN_COLOR_COUNT;
  return HUE_WORDS.find(([upTo]) => hue < upTo)?.[1] ?? 'pink';
}

/** One item as its ball band reads: only what a shopper could read off the real object. */
export function bandOf(item) {
  if (item.name === 'yarn') {
    return `${item.weight} ${item.material} ${item.shape ?? 'ball'}${item.colorIndex == null ? '' : `, ${colourWord(item.colorIndex)}`}`;
  }
  if (item.name === 'pattern') {
    return `${item.title ? `${item.title}: ` : ''}${item.patternType} pattern, ${item.craft} ${item.toolSize}mm, ` +
           `${item.yarnUnits ?? '?'} × ${item.weight} ${(item.materials ?? []).join('/')}`;
  }
  return labelOf(item).replace('-', ' ');
}

/** Capitals for the house lettering, which has no lowercase: "super-bulky" reads SUPER BULKY. */
const caps = (s) => String(s).replaceAll('-', ' ').toUpperCase();
const mm = (n) => `${Number(n).toFixed(1)}MM`;

/**
 * The paper ball band on screen, one printed line each: the same facts as bandOf, laid out as a
 * band prints them. A pattern's tool line names its craft too (CROCHET HOOK, KNITTING NEEDLES).
 */
export function bandLines(item) {
  if (item.name === 'yarn') {
    return [`${caps(item.weight)} WEIGHT`, caps(item.material),
      ...(item.colorIndex == null ? [] : [caps(colourWord(item.colorIndex))]), caps(item.shape ?? 'ball')];
  }
  if (item.name === 'pattern') {
    return [...(item.title ? [caps(item.title)] : []),
      `MAKES ${caps([item.silhouette, item.patternType].filter(Boolean).join(' '))}`,
      `${mm(item.toolSize)} ${caps(TOOL_FOR_CRAFT[item.craft] ?? item.craft)}`,
      `${item.yarnUnits ?? '?'} × ${caps(item.weight)} ${caps((item.materials ?? []).join('/'))}`,
      ...(item.minColors ? [`SUGGESTS ${item.minColors} ${item.minColors === 1 ? 'COLOUR' : 'COLOURS'}`] : [])];
  }
  return [caps(item.name), ...(item.size == null ? [] : [mm(item.size)])];
}

/**
 * A customer's tag (§7.1): their name and what they have bought this visit, never what they
 * still want. PROJECTS-AND-AUTHORSHIP.md §1: once the player has seen them knit (a witnessed 🪑,
 * or `knitting`, the pattern on their needles right now as the player looks), their pattern's band
 * too, which is what the project needs.
 */
export function tagLines(npc, knitting = null) {
  const pattern = npc.did?.find((d) => d.what === 'sat' && d.witnessed)?.pattern ?? knitting;
  const bought = (npc.bought ?? []).map((it) => (it.name === 'pattern' ? caps(it.title ?? `${it.patternType} pattern`) : caps(bandOf(it))));
  return [caps(npc.name), ...(bought.length ? bought : ['NOTHING BOUGHT YET']),
    ...(pattern ? ['MAKING:', ...bandLines(pattern)] : [])];
}

/** What a yarn or pattern IS, in a customer's words: "the blue", "the hat pattern". */
function thingOf(item) {
  if (item.name === 'yarn' && item.colorIndex != null) return `the ${colourWord(item.colorIndex)}`;
  if (item.name === 'pattern') return `the ${item.patternType} pattern`;
  return `the ${bandOf(item)}`;
}

// ---------------------------------------------------------------- where it stood (§4b)

const near = (a, b, r) => Math.hypot(a.x - b.x, a.z - b.z) < r;

/**
 * PROJECTS-AND-AUTHORSHIP.md §4b's place word, from where the display stood at the buy.
 * `room` is world.room (door, guestbook = the counter, bounds, windows); `seats` world.seats.
 * ponytail: hand-set radii; they are the knob if a word lands on the wrong display.
 */
export function placeWord(d, room, seats = []) {
  const b = room.bounds;
  const words = /** @type {[string, () => boolean][]} */ ([
    ['on the floor', () => d.form === 'floor' || d.solid === false],
    ['by the door', () => room.door && near(d, room.door, 2)],
    ['near the counter', () => room.guestbook && near(d, room.guestbook, 1.8)],
    ['by the chairs', () => seats.some((s) => near(d, s, 1.4))],
    ['by the window', () => (room.windows ?? []).some((w) => near(d, w, 1.3))],
    ['on the table', () => d.form === 'table'],
    ['in the back corner', () => b && d.z < b.minZ + 1 && (d.x < b.minX + 1 || d.x > b.maxX - 1)],
  ]);
  return words.find(([, holds]) => holds())?.[0] ?? 'on the shelf';
}

// ---------------------------------------------------------------- the rows (§7.3)

const CRAFT_VERB = { knitting: 'knitted', crochet: 'crocheted' };

const BOUGHT_ICON = { yarn: '🧶', pattern: '📖' };

/** One remembered doing as a row: in detail if witnessed, otherwise its gist. */
const DID = {
  putBack: (d) => ({ icon: '🙁', text: d.witnessed ? `turned over a ${bandOf(d.item)}, put it back`
    : 'turned something over and put it back' }),
  sat: (d) => ({ icon: '🪑', text: d.witnessed
    ? `sat and ${CRAFT_VERB[d.pattern.craft] ?? 'worked'} on ${thingOf(d.pattern)}: ${bandOf(d.pattern)}`
    : 'sat and worked on a project' }),
  chat: (d) => ({ icon: '🧑‍🤝‍🧑', text: `chatted with ${d.with}` }),
};

const TAG_ROW = {
  ranOut: { icon: '⏳', text: 'ran out of time before finding anything' },
  huff: { icon: '💨', text: 'gave up and left in a huff' },
};

/**
 * An entry's expanded rows, as [{ icon, text }]. Purchases always (the till keeps receipts);
 * behaviour in detail only if the player saw it, otherwise its gist.
 *
 * TODO(spec): TUTORIAL.md §7.3's 🎁 rows (gifts, swaps, treats between customers) wait on stash
 * swaps and the treat tin; the per-customer "who they give to" list waits on those rows.
 * TODO(spec): a witnessed chat should be translated into words (§7.4); that waits on chat topics
 * and picture bubbles, so every chat is its gist for now.
 * TODO(spec): REGULARS-AND-SHOP-CHARACTER.md's taste-change lines wait on tastes changing at all.
 */
export function entryRows(g) {
  return [
    ...(g.note ? [{ icon: '✎', text: `“${g.note.full}”` }] : []),
    ...(g.bought ?? []).map((it) => ({ icon: BOUGHT_ICON[it.name] ?? '🪡', text: `bought a ${bandOf(it)}` })),
    ...(g.did ?? []).filter((d) => DID[d.what]).map((d) => DID[d.what](d)),
    ...(g.lent ?? []).map((object) => ({ icon: '✨', text: `lent the shop their ${object}` })),
    ...(g.tags ?? []).filter((t) => TAG_ROW[t]).map((t) => TAG_ROW[t]),
  ];
}


// ---------------------------------------------------------------- the thank-you line (§4b)

/** The voices in §4b's table, in its order, which breaks ties. Volatility and Industriousness have no row. */
const VOICES = ['Enthusiasm', 'Politeness', 'Openness', 'Orderliness', 'Intellect', 'Assertiveness', 'Compassion', 'Withdrawal'];

/** Each voice wraps a fact's sentence (full) and its short phrase. */
const VOICE = {
  Enthusiasm:    { full: (s) => `${s}!! Love it!!`, short: (k) => `${k}!!` },
  Politeness:    { full: (s) => `${s}. Thank you!`, short: (k) => `${k}, thank you` },
  Openness:      { full: (s) => `${s}. It looked lovely there.`, short: (k) => `${k}, lovely` },
  Orderliness:   { full: (s) => `${s}. Noted for next time.`, short: (k) => `${k}.` },
  Intellect:     { full: (s) => `${s}. Worked a treat.`, short: (k) => `${k}. Worked.` },
  Assertiveness: { full: (s) => `${s}. Knew instantly.`, short: (k) => `${k}. Knew it.` },
  Compassion:    { full: (s) => `${s}. Made to be shared.`, short: (k) => `${k} ♥` },
  Withdrawal:    { full: (s) => `Hope it's alright… ${s}.`, short: (k) => `${k}…` },
};

export const voiceOf = (traits) => VOICES.reduce((best, t) => ((traits?.[t] ?? 0) > (traits?.[best] ?? 0) ? t : best));

const SHORT_MAX = 24;
const fit = (...options) => options.find((o) => o.length <= SHORT_MAX) ?? options.at(-1).slice(0, SHORT_MAX);

/**
 * The facts one finished object can honestly be remembered by, best first. Each is
 * { word, sentence, short }: `word` is the recorded fact the line must name (the test holds that).
 * Read off the provenance visit.js stamps on an item at the buy: `place`, `beside`, `alsoIn`.
 */
export function factsOf(made, { workedHere = false } = {}) {
  const items = [...(made.yarn ?? []), made.pattern].filter(Boolean);
  const facts = [];
  const at = items.find((it) => it.place);
  if (at?.place === 'on the floor') {
    facts.push({ word: 'floor', sentence: `Found ${thingOf(at)} on the floor, poor thing`, short: 'found it on the floor' });
  } else if (at) {
    facts.push({ word: at.place, sentence: `Couldn't walk past ${thingOf(at)} ${at.place}`,
                 short: fit(`${thingOf(at)} ${at.place}`, at.place) });
  }
  const by = items.find((it) => it.beside);
  if (by) {
    facts.push({ word: by.beside, sentence: `${thingOf(by)[0].toUpperCase()}${thingOf(by).slice(1)} was right by the ${by.beside} pattern`,
                 short: fit(`by the ${by.beside} pattern`, `by the ${by.beside}`) });
  }
  return [...facts, ...lastFacts(items, workedHere)];
}

/** The person, then the facts that need no provenance at all: the chair, and yarn from home. */
function lastFacts(items, workedHere) {
  const who = items.find((it) => it.alsoIn)?.alsoIn;
  return [
    who && { word: who, sentence: `${who} was in that day. I had to`, short: fit(`${who} was in!`, who) },
    workedHere && { word: 'chair', sentence: 'Finished it in your chair', short: 'finished in your chair' },
    !items.some((it) => it.place) && { word: 'home', sentence: 'Yarn from home, finished at last', short: 'yarn from home' },
  ].filter(Boolean);
}

/**
 * The selfie's handwritten line, { short, full, voice, facts }, from recorded facts only. Quiet
 * customers (Withdrawal leads, or Enthusiasm ≤ 2) name one fact; chatty ones (Enthusiasm or
 * Openness 4+) name two when there are two.
 *
 * TODO(spec): the sight (a recipe that fired), a gap (a substitution) and how it started
 * (HOW-THEY-SHOP.md §6) wait on recipes, near-miss substitution and shopping starts.
 * TODO(spec): "no repeats within the last several cards" waits on the board choosing templates.
 */
export function thankYou(made, traits, opts) {
  const facts = factsOf(made, opts);
  const voice = voiceOf(traits);
  const quiet = voice === 'Withdrawal' || (traits?.Enthusiasm ?? 3) <= 2;
  const chatty = !quiet && Math.max(traits?.Enthusiasm ?? 0, traits?.Openness ?? 0) >= 4;
  const said = facts.slice(0, chatty ? 2 : 1);
  const v = VOICE[voice];
  return {
    voice,
    facts: said.map((f) => f.word),
    short: fit(v.short(said[0].short), said[0].short),
    full: said.map((f, i) => (i === said.length - 1 ? v.full(f.sentence) : `${f.sentence}.`)).join(' '),
  };
}
