import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameKey, resolveAlias } from '../names.js';

test('nameKey folds Turkish letters, case, spaces and punctuation', () => {
  for (const n of ['Çağrı', 'cagri', ' ÇAĞRI ', 'Cagrı', 'ÇAGRİ']) assert.equal(nameKey(n), 'cagri', n);
  assert.equal(nameKey('Işıl'), 'isil');
  assert.equal(nameKey('ISIL'), 'isil');
  assert.equal(nameKey('Hayrullah Abi'), 'hayrullahabi');
  assert.equal(nameKey('Ali K.'), 'alik');
  assert.equal(nameKey('José'), 'jose');
  assert.equal(nameKey('Gülşen Öztürk'), 'gulsenozturk');
});

test('nameKey keeps a name made only of symbols instead of collapsing it to empty', () => {
  assert.equal(nameKey(' 😀 '), '😀');
  assert.notEqual(nameKey('😀'), nameKey('🙂'));
});

test('resolveAlias follows chains and survives cycles', () => {
  assert.equal(resolveAlias('a', { a: 'b', b: 'c' }), 'c');
  assert.equal(resolveAlias('a', { a: 'b', b: 'a' }), 'b');
  assert.equal(resolveAlias('x', { a: 'b' }), 'x');
  assert.equal(resolveAlias('x'), 'x');
});

test('resolveAlias ignores inherited object properties, so names like "Constructor" stay themselves', () => {
  assert.equal(resolveAlias('constructor', {}), 'constructor');
  assert.equal(resolveAlias('tostring', { a: 'b' }), 'tostring');
  assert.equal(resolveAlias('__proto__', JSON.parse('{"__proto__":"ali"}')), 'ali');
});
