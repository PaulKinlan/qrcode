import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasFrameAncestorsNone, hasXFrameOptionsDeny } from '../../tools/framing-policy.mjs';

test('preview framing policy accepts case-insensitive directive names and XFO tokens', () => {
  assert.equal(hasFrameAncestorsNone("default-src 'self'; Frame-Ancestors 'none'"), true);
  assert.equal(hasFrameAncestorsNone("FRAME-ANCESTORS 'none'"), true);
  assert.equal(hasXFrameOptionsDeny('deny'), true);
  assert.equal(hasXFrameOptionsDeny('  DeNy  '), true);
});

test('preview framing policy still rejects missing or different protections', () => {
  assert.equal(hasFrameAncestorsNone("frame-ancestors 'self'"), false);
  assert.equal(hasFrameAncestorsNone("x-frame-ancestors 'none'"), false);
  assert.equal(hasFrameAncestorsNone(null), false);
  assert.equal(hasXFrameOptionsDeny('SAMEORIGIN'), false);
  assert.equal(hasXFrameOptionsDeny(null), false);
});
