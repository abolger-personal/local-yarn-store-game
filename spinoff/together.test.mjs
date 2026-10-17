// Tablets starting a match together through the real together.js and net.js, all in this thread on one fake clock.
// Each tablet loads its own copies of the modules that keep a visit's state (`?tablet=N`), sees its own page
// globals, and a stand-in Trystero joins them in memory (no relays, no WebRTC).
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { mock } from 'node:test';
import { randomFighter } from './fighter.js';
import { levelFor, levelOf } from './levels.js';

const HERE = new URL('.', import.meta.url).href;
const PER_TABLET = new Set(['together.js', 'net.js', 'rooms.js', 'progress.js']);
const LATENCY_MS = 5;
// a route check takes each tablet its own while, so a fighter can arrive before the check on its sender is done
const checkMs = (n) => 5 + 10 * (n % 3);
// a page takes a while to load, the host's longest: a guest's first `ready` can come before the host's page listens
const pageMs = (hosting) => (hosting ? 50 : 10);
/** @type {any[]} */
const tablets = [];
/** @type {any} */ (globalThis).tablets = tablets;

registerHooks({
  resolve(spec, ctx, next) {
    const n = /[?&]tablet=(\d+)$/.exec(ctx.parentURL ?? '')?.[1];
    if (n && spec === 'trystero') {
      const src = `export const { selfId, joinRoom, getRelaySockets } = globalThis.tablets[${n}].trystero;`;
      return { url: `data:text/javascript,${encodeURIComponent(src)}`, shortCircuit: true };
    }
    const r = next(spec, ctx), file = r.url.slice(HERE.length);
    return n && r.url.startsWith(HERE) && PER_TABLET.has(file) ? { ...r, url: `${r.url}?tablet=${n}` } : r;
  },
  load(url, ctx, next) {
    const r = next(url, ctx), n = /[?&]tablet=(\d+)$/.exec(url)?.[1];
    if (!n || !url.startsWith('file:')) return r;
    const src = typeof r.source === 'string' ? r.source : new TextDecoder().decode(r.source);
    return { ...r, source: `const { document, location, localStorage } = globalThis.tablets[${n}];${src}` };
  },
});

const STATS = new Map([['t', { type: 'transport', selectedCandidatePairId: 'p' }],
  ['p', { type: 'candidate-pair', remoteCandidateId: 'r' }], ['r', { type: 'remote-candidate', candidateType: 'host', address: 'tablet.local' }]]);

/** Tablet `t`'s Trystero: a message reaches every other tablet's room of that name LATENCY_MS later, as a copy. */
function trysteroOf(t) {
  const post = (m) => {
    const sent = structuredClone({ ...m, from: t.selfId });
    setTimeout(() => {
      for (const other of tablets) {
        if (t.gone || other.gone || other === t || (m.to && m.to !== other.selfId)) continue;
        other.rooms.get(m.room)?.hear(sent);
      }
    }, LATENCY_MS);
  };
  function joinRoom(config, roomId) {
    const peers = {}, actions = new Map();
    const room = {
      getPeers: () => peers,
      makeAction(type) {
        const a = { onMessage: null, send: async (data, { target }) => { for (const to of [target].flat()) post({ t: 'msg', room: roomId, to, type, data }); } };
        actions.set(type, a);
        return a;
      },
      leave() { post({ t: 'leave', room: roomId }); t.rooms.delete(roomId); },
    };
    const meet = (id) => { if (peers[id]) return; peers[id] = { getStats: () => new Promise((r) => { setTimeout(() => r(STATS), checkMs(t.n)); }), close() {} }; setTimeout(() => room.onPeerJoin?.(id), 0); };
    t.rooms.set(roomId, { hear(m) {
      if (m.t === 'join') { meet(m.from); post({ t: 'here', room: roomId, to: m.from }); }
      if (m.t === 'here') meet(m.from);
      if (m.t === 'msg') actions.get(m.type)?.onMessage?.(m.data, { peerId: m.from });
      if (m.t === 'leave' && peers[m.from]) { delete peers[m.from]; room.onPeerLeave?.(m.from); }
    } });
    t.joined.push(roomId);
    setTimeout(() => post({ t: 'join', room: roomId }), 0);
    return room;
  }
  return { selfId: t.selfId, joinRoom, getRelaySockets: () => ({}) };
}

/** Tablet `n`, with its game save; `page(search, to)` is a new page, `to(next)` where it goes when it leaves. */
function newTablet(n, reached) {
  const save = JSON.stringify({ beaten: reached - 1, reached: { breakfast: reached } });
  const el = () => ({ hidden: true, innerHTML: '', classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {} });
  let els = new Map(), search = '', to = () => {};
  const t = {
    n, selfId: `tablet${n}`, joined: [], rooms: new Map(), heard: [], waiting: [], gone: false, tell: () => {},
    localStorage: { getItem: (k) => (k === 'lys.progress.v1' ? save : null), setItem() {} },
    document: {
      getElementById: (id) => { if (!els.has(id)) els.set(id, el()); return els.get(id); },
      querySelectorAll: () => [], body: { appendChild: (x) => x }, createElement: el,
    },
    location: { href: '', reload: () => to(search), set search(next) { to(`?${next}`); }, get search() { return search; } },
    page(s, leave) { els = new Map(); search = s; to = leave; },
    say(m) { t.heard.push(m); t.check(); },
    check() {
      for (const w of [...t.waiting]) {
        const m = t.heard.filter((h) => w.key in h)[w.n - 1];
        if (m) { t.waiting.splice(t.waiting.indexOf(w), 1); w.resolve(m); }
      }
    },
    /** Resolves with the `n`th message this tablet says that has `key`. */
    said: (key, k = 1) => new Promise((resolve) => { t.waiting.push({ key, n: k, resolve }); t.check(); }),
  };
  t.trystero = trysteroOf(t);
  return t;
}

// as lobby.js's room: the host's waits to meet `hosting` others and sends `go`; everyone else waits for `go`
async function lobby(t, net, code, mine, hosting, quit) {
  const met = new Set();
  let meet = () => {};
  const room = net.openRoom(code, mine, { onFighter: (id, _, progress) => {
    met.add(id);
    t.say({ heard: progress });
    meet();
  }, onLeave: (id) => met.delete(id) });
  room.on('playing', () => t.say({ playing: true }));
  if (quit) return new Promise(() => { room.on('go', () => setTimeout(() => room.leave(), 1500)); });
  if (!hosting) return new Promise((go) => { room.on('go', () => go(`?room=${code.join('')}`)); });
  await new Promise((r) => { meet = () => { if (met.size >= hosting) r(); }; meet(); });
  room.send('go', true);
  return `?room=${code.join('')}&host`;
}

// One tablet's whole visit, as the tap page is: its pages come and go, its rooms stay.
async function visit(t, { together, net }, { code, hosting, slow, quit, number }) {
  const mine = randomFighter();
  t.page('', () => {});
  let page = await lobby(t, net, code, mine, hosting, quit);
  t.say({ left: page });
  await new Promise((r) => { setTimeout(r, slow); });
  for (;;) {
    let leave;
    const left = new Promise((r) => { leave = r; });
    t.page(page, leave);
    await new Promise((r) => { setTimeout(r, pageMs(hosting)); });
    const match = await together.joinMatch(page, mine, page.includes('level=') ? levelFor(page) : levelOf('breakfast', number));
    t.say({ me: match.me, roster: match.start.roster.map((s) => s.id), joined: [...t.joined], level: [match.start.theme, match.start.number] });
    // 'again': the host's ▶️; 'bye': 👋 back to the lobby, which leaves the room, and the code typed again
    // 'won': ▶️ on the end card after a win, which plays the next level
    t.tell = (m) => ({ bye: () => leave(null), reload: () => leave(page), again: () => match.again(),
      won: () => match.again(`${page.slice(1)}&stage=breakfast&level=2`) })[m]();
    page = await left;
    if (page === null) {
      net.leaveRooms();
      page = await lobby(t, net, code, mine, 0);
    }
    t.say({ next: page });
  }
}

/** A tablet, its visit started. */
async function open(code, hosting = 0, slow = 0, quit = false, { number = 1, reached = 1 } = {}) {
  const t = newTablet(tablets.length, reached);
  tablets.push(t);
  const modules = { together: await import(`./together.js?tablet=${t.n}`), net: await import(`./net.js?tablet=${t.n}`) };
  visit(t, modules, { code, hosting, slow, quit, number });
  return t;
}

const close = (ts) => { for (const t of ts) t.gone = true; };

/** `p`, running the fake clock a millisecond at a time and settling everything due in between. */
async function within(ms, p, what) {
  let done = false, value;
  p.then((v) => { done = true; value = v; });
  for (let at = 0; ; at++) {
    await new Promise(setImmediate);
    if (done) return value;
    if (at >= ms) throw new Error(`${what} not within ${ms} ms`);
    mock.timers.tick(1);
  }
}

/** Each tablet's `n[i]`th match, the host's first: all in one match. */
async function played(ts, n, what) {
  const [host, ...guests] = await within(15000, Promise.all(ts.map((t, i) => t.said('roster', n[i]))), what);
  assert.equal(host.roster.length, ts.length + 1, `the host's match has itself, every guest and the dummy (${host.roster})`);
  for (const g of guests) {
    assert.ok(host.roster.includes(g.me), 'every guest is in the host\'s roster');
    assert.deepEqual(g.roster, host.roster, 'every guest plays the host\'s roster');
    assert.deepEqual(g.level, host.level, 'on the host\'s stage and level');
  }
  return [host, ...guests];
}

mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });

const three = [await open([1, 2, 3, 4], 2, 0, false, { number: 2 }), await open([1, 2, 3, 4], 0, 0, false, { reached: 2 }),
  await open([1, 2, 3, 4], 0, 0, false, { reached: 3 })];
const [host3] = await played(three, [1, 1, 1], 'three tablets starting a match');
assert.deepEqual(host3.level, ['breakfast', 2], 'the start carries the stage\'s name and the level\'s number');
assert.ok(host3.roster.includes('cpu1') && !host3.roster.includes('dummy'), 'level 2 brings its raider, not the dummy');
const heard = await within(1000, Promise.all([1, 2].map((n) => three[0].said('heard', n))), 'the host hearing each fighter');
assert.deepEqual(heard.map((h) => h.heard.reached.breakfast).sort(), [2, 3], 'each tablet\'s progress comes to the host with its fighter');
close(three);
console.log('together ok (a host and two guests start one match through net.js, on the host\'s level)');

const [host, guest] = [await open([2, 3, 4, 1], 1), await open([2, 3, 4, 1])];
await played([host, guest], [1, 1], 'two tablets starting a match');
const late = await open([2, 3, 4, 1]);
await within(15000, late.said('playing'), 'the host telling a late friend in the lobby a match is on');
host.tell('won');
const next = await within(15000, Promise.all([host, guest].map((t) => t.said('next'))), 'everyone going to the next round');
assert.deepEqual(next.map((m) => m.next), ['?room=2341&host&stage=breakfast&level=2', '?room=2341'],
  'after a win the host goes on to the next level, and the guests reload to hear which');
const second = await played([host, guest, late], [2, 2, 1], 'the next round with the late friend');
assert.deepEqual(second[0].level, ['breakfast', 2], 'which everyone plays');
for (const m of second) assert.deepEqual(m.joined, m.joined.filter((r, i) => m.joined.indexOf(r) === i), 'no tablet joins a room twice');
assert.equal(second[0].joined.length, 1, 'the host plays every round, and hears the late friend, in the room it opened once');
close([host, guest, late]);
console.log('together ok (a late friend plays the next round, nobody reconnects)');

// the host's page is waiting (⏳) for a slow guest when a tablet comes in through the lobby: it's sent along
const first = await open([3, 4, 1, 2], 1), slow = await open([3, 4, 1, 2], 0, 3000);
await within(15000, first.said('left'), 'the host starting the match');
const retyped = await open([3, 4, 1, 2]);
await played([first, slow, retyped], [1, 1, 1], 'a tablet that typed the code while the host waited joining the match');
close([first, slow, retyped]);
console.log('together ok (a tablet that comes in through the lobby while the host waits plays this round)');

// a guest goes back to the lobby mid-match and types the code again: it's back in the match it left
const [keeper, leaver] = [await open([1, 3, 2, 4], 1), await open([1, 3, 2, 4])];
const [was] = await played([keeper, leaver], [1, 1], 'two tablets starting a match');
leaver.tell('bye');
const back = await within(15000, leaver.said('roster', 2), 'a guest that left coming back into its match');
assert.deepEqual(back.roster, was.roster, 'it rejoins the match it left, not a new one');
console.log('together ok (a guest that leaves and types the code again is back in its match)');

// the host's page reloads mid-match (the browser reloaded the frame): everyone starts the round again
keeper.tell('reload');
await played([keeper, leaver], [2, 3], 'everyone starting again after the host\'s page reloaded');
close([keeper, leaver]);
console.log('together ok (a host whose page reloads mid-match takes everyone into a new round)');

// the only other tablet leaves the room (👋) instead of coming along: the host stops waiting for it
const alone = await open([4, 1, 2, 3], 1), gone = await open([4, 1, 2, 3], 0, 0, true);
await played([alone], [1], 'a match starting without the tablet that left');
close([alone, gone]);
console.log('together ok (the host doesn\'t wait for a tablet that left)');
mock.timers.reset();
