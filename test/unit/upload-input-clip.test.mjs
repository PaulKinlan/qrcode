import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cameraCss = readFileSync(new URL('../../app/styles/camera.css', import.meta.url), 'utf8');

test('the visually hidden upload input clips without becoming a scroll container', () => {
  const inputRule = cameraCss.match(/\.Camera \.CameraFallback \.CameraFallback-input\s*\{([^}]*)\}/)?.[1];
  assert.ok(inputRule, 'upload input styling must exist');
  assert.match(inputRule, /\boverflow:\s*clip\s*;/, 'overflow: hidden creates a scroll container');
});
