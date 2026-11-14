import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ruleBlocks } from './helpers/bundled-stylesheets.mjs';

const css = readFileSync(new URL('../../app/styles/all.css', import.meta.url), 'utf8');

test('paragraphs avoid one-word last lines without balancing long text', () => {
  const paragraphRule = ruleBlocks(css, 'p')[0];
  assert.ok(paragraphRule, 'paragraph typography rule must exist');
  assert.match(paragraphRule, /\btext-wrap:\s*pretty\s*;/);
});

test('paragraph rule extraction ignores cosmetic indentation and comment prose', () => {
  const source = '/* p { text-wrap: nowrap; } */\nh1, p { color: red; }\n  p { text-wrap: pretty; }';
  assert.deepEqual(ruleBlocks(source, 'p'), [' text-wrap: pretty; ']);
  assert.deepEqual(ruleBlocks('span { color: red; }\np { text-wrap: pretty; }', 'p'), [' text-wrap: pretty; ']);
});
