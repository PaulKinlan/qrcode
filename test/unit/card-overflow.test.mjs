import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../app/styles/all.css', import.meta.url), 'utf8');

test('card clips its chrome without becoming a scroll container', () => {
  const card = css.match(/\.wsk-card\s*\{([^}]*)\}/)?.[1];
  assert.ok(card, 'card style exists');
  assert.match(card, /overflow:\s*hidden\s*;\s*overflow:\s*clip\s*;/,
    'hidden remains the legacy fallback; clip must override it');
  assert.match(card, /overflow-clip-margin:\s*0\s*;/,
    'clip at the original padding-box boundary');
});
