import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCode, formatCode, generateCode } from '../groupcode.js';

test('normalizeCode tolerates case, separators, O/0, I/L/1 and pasted invitations', () => {
  assert.equal(normalizeCode('abcd-2345'), 'ABCD2345');
  assert.equal(normalizeCode(' ab cd 23 45 '), 'ABCD2345');
  assert.equal(normalizeCode('ABCD-23O5'), 'ABCD2305');
  assert.equal(normalizeCode('abcd-23i5'), 'ABCD2315');
  assert.equal(normalizeCode('abcd-23l5'), 'ABCD2315');
  assert.equal(normalizeCode('Kod: K7QM-2XPA. Katıl!'), 'K7QM2XPA');
});

test('normalizeCode rejects wrong lengths, letters outside the alphabet and empty input', () => {
  assert.equal(normalizeCode('ABCD234'), null);
  assert.equal(normalizeCode('ABCD23456'), null);
  assert.equal(normalizeCode('ABCU2345'), null);
  assert.equal(normalizeCode(''), null);
  assert.equal(normalizeCode(undefined), null);
});

test('formatCode groups the code in two halves', () => {
  assert.equal(formatCode('ABCD2345'), 'ABCD-2345');
});

test('generateCode maps each random byte onto the 32-letter alphabet', () => {
  assert.equal(generateCode(b => b.map((_, i) => i)), '01234567');
  assert.equal(generateCode(b => b.fill(255)), 'ZZZZZZZZ');
  assert.equal(generateCode(b => b.fill(18)), 'JJJJJJJJ');
  const code = generateCode();
  assert.equal(normalizeCode(code), code);
});

test('a pasted invitation finds the real code even when the group name looks like a code', async () => {
  const { inviteText } = await import('../groupcode.js');
  for (const name of ['Aile-King', 'Sezon 2025-2026', 'King-Kafe', 'Ofis-Ekip', 'Pazar-Kingi', 'Cuma Kingcileri']) {
    const text = inviteText({ code: 'K7QM2XPA', name });
    assert.match(text, /K7QM-2XPA/);
    assert.match(text, new RegExp(name));
    assert.equal(normalizeCode(text), 'K7QM2XPA', name);
    assert.equal(normalizeCode(text.replace(/\n/g, '')), 'K7QM2XPA', `${name} pasted into a one-line field`);
  }
});

test('codeCandidates lists every code-shaped part of a pasted text in order', async () => {
  const { codeCandidates } = await import('../groupcode.js');
  assert.deepEqual(codeCandidates('Aile-King grubu, kod: K7QM-2XPA'), ['A11EK1NG', 'K7QM2XPA']);
  assert.deepEqual(codeCandidates('k7qm2xpa'), ['K7QM2XPA']);
  assert.deepEqual(codeCandidates('merhaba'), []);
});
