import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../app/styles/all.css', import.meta.url), 'utf8');

test('paragraphs avoid one-word last lines without balancing long text', () => {
  const paragraphRule = css.match(/(?:^|\n)p\s*\{([^}]*)\}/)?.[1];
  assert.ok(paragraphRule, 'paragraph typography rule must exist');
  assert.match(paragraphRule, /\btext-wrap:\s*pretty\s*;/);
});
