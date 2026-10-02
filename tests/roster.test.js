import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toggleSeat, seatOf, addToRoster, removeFromRoster, ensureInRoster, ROSTER_CAP } from '../roster.js';

test('toggleSeat selects in tap order up to four, then ignores', () => {
  let sel = [];
  sel = toggleSeat(sel, 'Alper'); sel = toggleSeat(sel, 'Yasin'); sel = toggleSeat(sel, 'Hayrullah Abi'); sel = toggleSeat(sel, 'Samet');
  assert.deepEqual(sel, ['Alper', 'Yasin', 'Hayrullah Abi', 'Samet']);
  assert.deepEqual(toggleSeat(sel, 'Ozan'), sel, 'fifth tap is ignored');
});

test('toggleSeat deselects and later seats move up', () => {
  const sel = ['Alper', 'Yasin', 'Samet'];
  assert.deepEqual(toggleSeat(sel, 'yasin'), ['Alper', 'Samet'], 'match is tr-TR case-insensitive');
  assert.equal(seatOf(['Alper', 'Samet'], 'Samet'), 2);
  assert.equal(seatOf(['Alper', 'Samet'], 'Yasin'), 0);
});

test('addToRoster trims, rejects blanks, duplicates (İ/i) and the cap', () => {
  const r1 = addToRoster([], '  Başbuğ ');
  assert.deepEqual(r1, { roster: ['Başbuğ'], added: true, name: 'Başbuğ' });
  assert.equal(addToRoster(r1.roster, '   ').added, false);
  assert.match(addToRoster(r1.roster, '   ').error, /boş/);
  const dup = addToRoster(['İsmail'], 'ismail');
  assert.equal(dup.added, false);
  assert.match(dup.error, /zaten/);
  const full = Array.from({ length: ROSTER_CAP }, (_, i) => `O${i}`);
  assert.equal(addToRoster(full, 'Yeni').added, false);
});

test('removeFromRoster drops by key only', () => {
  assert.deepEqual(removeFromRoster(['Alper', 'Yasin', 'Ozan'], 'YASİN'), ['Alper', 'Ozan']);
});

test('ensureInRoster appends missing names in order and keeps existing', () => {
  assert.deepEqual(ensureInRoster(['Ozan'], ['Alper', 'ozan', 'Yasin']), ['Ozan', 'Alper', 'Yasin']);
});
