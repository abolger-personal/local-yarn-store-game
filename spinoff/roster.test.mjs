import assert from 'node:assert/strict';
import { newFighter } from './fighter.js';
import { homeOnly } from './net.js';
import {
  CLOCK_SLACK_S, MATCH, MAX_FIGHTERS, ROOM_TREATS, canHit, clockSlack, floorGrid, isCode, isHomeAddress, isHomeRoute, netProblem, randomCode,
  remoteOf, roomName, routeNote, standingSpots,
} from './roster.js';

{
  const ids = ['peer-c', 'peer-a', 'self', 'peer-b'];
  const a = standingSpots(ids), b = standingSpots([...ids].reverse());
  assert.deepEqual([...a].sort(), [...b].sort(), 'every tablet must place everyone the same, whatever order they joined');
  const xs = [...a.values()].map((s) => s.x);
  assert.ok(Math.abs(xs.reduce((s, x) => s + x, 0) / xs.length) < floorGrid().cell, 'a small group stands near the middle, not off to one side');
}

{
  const ids = Array.from({ length: MAX_FIGHTERS }, (_, i) => `p${i}`);
  const spots = [...standingSpots(ids).values()];
  assert.equal(spots.length, MAX_FIGHTERS, 'the floor holds a full match: 6 kids and 8 bad guys');
  const keys = new Set(spots.map((s) => `${s.x.toFixed(3)},${s.z.toFixed(3)}`));
  assert.equal(keys.size, spots.length, 'no two fighters share a cell');
  const front = Math.max(...spots.map((s) => s.z));
  assert.ok(spots.slice(0, 7).every((s) => s.z === front), 'the front row fills first');
}

{
  assert.equal(standingSpots(['x', 'x', 'y']).size, 2, 'a repeated id is one fighter');
}

{
  for (let k = 0; k < 50; k++) assert.ok(isCode(randomCode()), 'a random code is a valid code');
  assert.ok(!isCode([0, 1, 2]) && !isCode([0, 1, 2, ROOM_TREATS.length]) && !isCode('0123'), 'junk is not a code');
  assert.equal(roomName([0, 5, 2, 1]), 'donut-0521');
}

{
  const kid = (id) => ({ id, team: 'kids' }), bad = { id: 'b', team: 'bad guys' };
  assert.ok(!canHit(kid('a'), kid('c')), 'kids cannot hit each other by default');
  assert.ok(canHit(kid('a'), bad) && canHit(bad, kid('a')), 'kids and bad guys can hit each other');
  assert.ok(canHit(kid('a'), kid('c'), { ...MATCH, friendlyFire: true }), 'a kid-vs-kid mode is one setting away');
  assert.ok(!canHit(kid('a'), kid('a'), { friendlyFire: true }), 'nobody hits themselves');
}

{
  for (const a of ['192.168.0.102', '10.0.0.7', '172.20.1.4', '169.254.3.3', 'fd12:3456::1', 'fe80::1c2b', 'a1b2c3d4-0000.local']) {
    assert.ok(isHomeAddress(a), `${a} is on the home network`);
  }
  for (const a of ['8.8.8.8', '172.32.0.1', '100.64.0.1', '2001:db8::1', '2600:1700::5', '', undefined]) {
    assert.ok(!isHomeAddress(a), `${a} is not on the home network`);
  }
  const stats = (remote) => new Map([
    ['t', { type: 'transport', selectedCandidatePairId: 'p' }],
    ['p', { type: 'candidate-pair', state: 'succeeded', nominated: true, remoteCandidateId: 'r' }],
    ['r', { type: 'remote-candidate', ...remote }],
  ]);
  assert.ok(isHomeRoute(remoteOf(stats({ address: '192.168.0.40', candidateType: 'prflx' }))), 'a tablet on the same Wi-Fi is accepted');
  assert.ok(isHomeRoute(remoteOf(stats({ candidateType: 'host' }))), 'a direct route with a hidden address is the home network');
  assert.ok(!isHomeRoute(remoteOf(stats({ address: '2600:1700::5', candidateType: 'prflx' }))), 'a public IPv6 tablet is hung up on');
  assert.ok(!isHomeRoute(remoteOf(stats({ address: '81.2.69.160', candidateType: 'srflx' }))), 'a tablet across the internet is hung up on');
  assert.ok(!isHomeRoute(remoteOf(new Map())), 'no route yet is not a home route');
}

{
  const fine = { subtle: true, relays: 3, peers: 2, homes: 1 };
  assert.equal(netProblem(fine), 'ok');
  assert.match(netProblem({ ...fine, subtle: false, relays: 0 }), /https/, 'plain http over the LAN is named first');
  assert.match(netProblem({ ...fine, relays: 0 }), /relay/);
  assert.match(netProblem({ ...fine, heard: 0, peers: 0, homes: 0 }), /no other tablet heard/);
  assert.match(netProblem({ ...fine, heard: 2, peers: 0, homes: 0 }), /none connected/, 'heard on the relays but never connected is told apart');
  assert.match(netProblem({ ...fine, homes: 0 }), /hung up/);
  assert.equal(routeNote({ candidateType: 'host', address: 'ab12.local' }), 'host ab12.local home');
  assert.equal(routeNote({ candidateType: 'prflx', address: '' }), 'prflx hidden home', 'a tablet that found this one by its .local name is home');
  assert.equal(routeNote({ candidateType: 'relay', address: '' }), 'relay hidden hung up', 'a hidden relayed route is hung up on');
  assert.equal(routeNote({ candidateType: 'srflx' }), 'srflx hidden hung up', 'a hidden route through the internet is hung up on');
  assert.equal(routeNote(undefined), 'no route hidden hung up');
}

{
  const req = JSON.stringify(['REQ', 'sub1', { kinds: [21234], since: 1760500000, '#x': ['abc'] }]);
  assert.equal(JSON.parse(clockSlack(req))[2].since, 1760500000 - CLOCK_SLACK_S, 'a relay subscription asks from earlier, for tablets whose clocks run behind');
  assert.deepEqual(JSON.parse(clockSlack(req))[2]['#x'], ['abc'], 'and asks for the same room');
  const count = JSON.stringify(['COUNT', 'sub1', { kinds: [1], since: 1760500000 }]);
  assert.equal(clockSlack(count), count, 'only a subscription changes');
}

// Nothing goes to or comes from a tablet before its home check; a fighter that arrives first waits for it.
{
  const sent = [], got = [], mine = newFighter('owl'), theirs = newFighter('lion');
  const action = { onMessage: null, send: (data, opts) => { sent.push([data, opts.target]); } };
  const peers = homeOnly(action, mine, (id, f) => got.push([id, f.species]));
  action.onMessage(theirs, { peerId: 'A' });
  assert.deepEqual(got, [], 'a fighter from a tablet not yet checked is held');
  peers.welcome('A');
  assert.deepEqual(got, [['A', 'lion']], 'and arrives once the tablet passes');
  assert.deepEqual(sent, [[mine, 'A']], 'a tablet that passes gets my fighter, and only it');
  action.onMessage(theirs, { peerId: 'B' });
  peers.forget('B');
  peers.welcome('B');
  assert.deepEqual(got.map(([id]) => id), ['A'], 'a fighter from a tablet hung up on is dropped');
  action.onMessage(theirs, { peerId: 'A' });
  assert.equal(got.length, 2, 'a checked tablet\'s fighter arrives straight away');
}

console.log('roster ok');
