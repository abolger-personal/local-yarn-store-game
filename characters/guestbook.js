// TUTORIAL.md §7.1, §7.3; PROJECTS-AND-AUTHORSHIP.md §4b

import { labelOf, TOOL_FOR_CRAFT, YARN_COLOR_COUNT, yarnUnits } from '../inventory/catalog.js';

// ponytail: hue bands only, so a muted or very pale yarn still gets its hue's word; add "grey" /
// "pale" when the band needs lightness and chroma too.
const HUE_WORDS = /** @type {[number, string][]} */ ([[15, 'pink'], [45, 'red'], [75, 'orange'], [110, 'yellow'],
  [165, 'green'], [205, 'teal'], [270, 'blue'], [320, 'purple'], [360, 'pink']]);

export function colourWord(colorIndex) {
  const hue = (((colorIndex % YARN_COLOR_COUNT) + 0.5) * 360) / YARN_COLOR_COUNT;
  return HUE_WORDS.find(([upTo]) => hue < upTo)?.[1] ?? 'pink';
}

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

const caps = (s) => String(s).replaceAll('-', ' ').toUpperCase();
const mm = (n) => `${Number(n).toFixed(1)}MM`;
const units = (n) => `${n} ${n === 1 ? 'UNIT' : 'UNITS'}`;

export function bandLines(item) {
  if (item.name === 'yarn') {
    return [`${caps(item.weight)} WEIGHT`, caps(item.material),
      ...(item.colorIndex == null ? [] : [caps(colourWord(item.colorIndex))]), caps(item.shape ?? 'ball'), units(yarnUnits(item))];
  }
  if (item.name === 'pattern') {
    return [...(item.title ? [caps(item.title)] : []), ...patternNeeds(item).map(([k, v]) => (k === 'TOOL' ? v : `${k} ${v}`))];
  }
  return [caps(item.name), ...(item.size == null ? [] : [mm(item.size)])];
}

export function patternNeeds(item) {
  return [
    ['MAKES', caps([item.silhouette, item.patternType].filter(Boolean).join(' '))],
    ['TOOL', `${mm(item.toolSize)} ${caps(TOOL_FOR_CRAFT[item.craft] ?? item.craft)}`],
    ['TAKES', `${units(item.yarnUnits ?? '?')} ${caps(item.weight)} ${caps((item.materials ?? []).join('/'))}`],
    ...(item.minColors ? [['SUGGESTS', `${item.minColors} ${item.minColors === 1 ? 'COLOUR' : 'COLOURS'}`]] : []),
  ];
}

const escape = (s) => String(s).replace(/[&<"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '"': '&quot;' })[c]);
const list = (cls, xs) => (xs.length ? `<ul class="${cls}">${xs.map((x) => `<li>${escape(x)}</li>`).join('')}</ul>` : '');
const needsHtml = (item) => `<dl class="needs">${patternNeeds(item).map(([k, v]) => `<dt>${k}</dt><dd>${escape(v)}</dd>`).join('')}</dl>`;
const patternTitle = (item) => caps(item.title ?? `${item.patternType} pattern`);

export function bandCard(item) {
  if (item.name === 'pattern') return { head: patternTitle(item), body: needsHtml(item) };
  const [head, ...facts] = bandLines(item);
  return { head, body: list('facts', facts) };
}

export function tagCard(npc, knitting = null) {
  const pattern = npc.did?.find((d) => d.what === 'sat' && d.witnessed)?.pattern ?? knitting;
  const bought = (npc.bought ?? []).map((it) => (it.name === 'pattern' ? patternTitle(it) : caps(bandOf(it))));
  const making = pattern
    ? `<section class="making"><h3>Making</h3><p class="title">${escape(patternTitle(pattern))}</p>${needsHtml(pattern)}</section>`
    : '';
  return { head: caps(npc.name), body: (list('items', bought) || '<p class="status">Nothing bought yet</p>') + making };
}

function thingOf(item) {
  if (item.name === 'yarn' && item.colorIndex != null) return `the ${colourWord(item.colorIndex)}`;
  if (item.name === 'pattern') return `the ${item.patternType} pattern`;
  return `the ${bandOf(item)}`;
}

const near = (a, b, r) => Math.hypot(a.x - b.x, a.z - b.z) < r;

// ponytail: hand-set radii; they are the knob if a word lands on the wrong display.
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

const CRAFT_VERB = { knitting: 'knitted', crochet: 'crocheted' };

const BOUGHT_ICON = { yarn: '🧶', pattern: '📖' };

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

export function entryRows(g) {
  return [
    ...(g.note ? [{ icon: '✎', text: `“${g.note.full}”` }] : []),
    ...(g.bought ?? []).map((it) => ({ icon: BOUGHT_ICON[it.name] ?? '🪡', text: `bought a ${bandOf(it)}` })),
    ...(g.did ?? []).filter((d) => DID[d.what]).map((d) => DID[d.what](d)),
    ...(g.lent ?? []).map((object) => ({ icon: '🏁', text: `lent the shop their ${object}` })),
    ...(g.tags ?? []).filter((t) => TAG_ROW[t]).map((t) => TAG_ROW[t]),
  ];
}

const VOICES = ['Enthusiasm', 'Politeness', 'Openness', 'Orderliness', 'Intellect', 'Assertiveness', 'Compassion', 'Withdrawal'];

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

function lastFacts(items, workedHere) {
  const who = items.find((it) => it.alsoIn)?.alsoIn;
  return [
    who && { word: who, sentence: `${who} was in that day. I had to`, short: fit(`${who} was in!`, who) },
    workedHere && { word: 'chair', sentence: 'Finished it in your chair', short: 'finished in your chair' },
    !items.some((it) => it.place) && { word: 'home', sentence: 'Yarn from home, finished at last', short: 'yarn from home' },
  ].filter(Boolean);
}

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
