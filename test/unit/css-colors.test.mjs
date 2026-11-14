import test from 'node:test';
import assert from 'node:assert/strict';
import { contrast, cssTokens, hexToRgb, resolveColor } from './helpers/css-colors.mjs';

test('contrast uses either shipped hex or RGB values, including short hex', () => {
  assert.equal(contrast('#fff', '#0d47a1'), 8.63);
  assert.equal(contrast(hexToRgb('#ffffff'), hexToRgb('#0d47a1')), 8.63);
  assert.ok(contrast('#fff', '#7a7a7a') < 8.63);
});

test('token extraction ignores comments and refuses an undeclared colour token', () => {
  const tokens = cssTokens('/* --wsk-white: #000; */ :root { --wsk-white: #fff; }');
  assert.deepEqual(tokens, { '--wsk-white': '#fff' });
  assert.equal(resolveColor('var(--wsk-white)', tokens), '#fff');
  assert.throws(() => resolveColor('var(--wsk-missing)', tokens), /must be declared/);
});
