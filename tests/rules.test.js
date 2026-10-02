import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HAND_TYPES, TYPE_BY_ID, DEFAULT_RULES, PLAYER_COUNT, handsTotal,
  createGame, makeHand, handScores, validateCounts, formatPoints,
} from '../rules.js';

const players = ['Ali', 'Ayşe', 'Mehmet', 'Zeynep'];

test('HAND_TYPES has 6 ceza + koz with correct totals', () => {
  assert.equal(HAND_TYPES.length, 7);
  assert.deepEqual(HAND_TYPES.map(t => t.id), ['el', 'kupa', 'erkek', 'kiz', 'rifki', 'soniki', 'koz']);
  assert.deepEqual(HAND_TYPES.map(t => t.total), [13, 13, 8, 4, 1, 2, 13]);
  assert.equal(HAND_TYPES.filter(t => t.ceza).length, 6);
  assert.equal(TYPE_BY_ID.rifki.name, 'Rıfkı');
});

test('default rules sum to zero over a full game', () => {
  const p = DEFAULT_RULES.pointsPer;
  const ceza = 13 * p.el + 13 * p.kupa + 8 * p.erkek + 4 * p.kiz + 1 * p.rifki + 2 * p.soniki; // -2600
  assert.equal(ceza * DEFAULT_RULES.maxPerCezaType + PLAYER_COUNT * DEFAULT_RULES.kozPerPlayer * 13 * p.koz, 0);
  assert.equal(handsTotal(DEFAULT_RULES), 20);
});

test('createGame snapshots rules (deep copy)', () => {
  const rules = { ...DEFAULT_RULES, pointsPer: { ...DEFAULT_RULES.pointsPer } };
  const g = createGame({ players, firstDealer: 2, rules, now: new Date('2026-10-02T20:00:00Z') });
  rules.pointsPer.koz = 999;
  rules.enforceQuotas = false;
  assert.equal(g.rules.pointsPer.koz, 50);
  assert.equal(g.rules.enforceQuotas, true);
  assert.equal(g.firstDealer, 2);
  assert.equal(g.createdAt, '2026-10-02T20:00:00.000Z');
  assert.equal(g.finishedAt, null);
  assert.deepEqual(g.hands, []);
  assert.ok(typeof g.id === 'string' && g.id.length > 6);
});

test('handScores multiplies counts by points per unit', () => {
  const g = createGame({ players });
  assert.deepEqual(handScores(makeHand('el', 0, [5, 3, 5, 0]), g.rules), [-250, -150, -250, 0]);
  assert.deepEqual(handScores(makeHand('koz', 1, [7, 2, 4, 0], 's'), g.rules), [350, 100, 200, 0]);
  assert.deepEqual(handScores(makeHand('rifki', 1, [0, 0, 1, 0]), g.rules), [0, 0, -320, 0]);
  assert.deepEqual(handScores(makeHand('soniki', 1, [1, 1, 0, 0]), g.rules), [-180, -180, 0, 0]);
});

test('validateCounts enforces totals, ranges and integers', () => {
  assert.deepEqual(validateCounts('el', [13, 0, 0, 0]), { ok: true });
  assert.equal(validateCounts('el', [12, 0, 0, 0]).ok, false);
  assert.match(validateCounts('el', [12, 0, 0, 0]).error, /1 el eksik/);
  assert.match(validateCounts('kiz', [3, 2, 0, 0]).error, /1 kız fazla/);
  assert.equal(validateCounts('kiz', [5, -1, 0, 0]).ok, false);
  assert.equal(validateCounts('kupa', [6.5, 6.5, 0, 0]).ok, false);
  assert.equal(validateCounts('rifki', [1, 0, 0, 0]).ok, true);
  assert.equal(validateCounts('rifki', [0, 0, 0, 0]).ok, false);
  assert.equal(validateCounts('yok', [0, 0, 0, 0]).ok, false);
  assert.equal(validateCounts('el', [13, 0, 0]).ok, false);
});

test('formatPoints shows sign only for negatives and dash for zero', () => {
  assert.equal(formatPoints(-320), '-320');
  assert.equal(formatPoints(650), '650');
  assert.equal(formatPoints(0), '0');
});
