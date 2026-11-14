// Unit tier: pins the About control's painted pair (bead qrcode-vsb). The help icon is the
// ONLY route to the About dialog and sits over the camera canvas / live frames, so its pair
// must not rely on the backdrop: the glyph svg declares an explicit white fill (no fill
// renders UA-default black, 2.09:1 on #424242) and the .Camera .about button paints its own
// opaque #0d47a1 circular surface. Non-text/UI pair (WCAG 1.4.11): needs 3:1 - white on
// #0d47a1 is 8.63:1. Parses the shipped files, computes the WCAG 2.x ratio, fails below 3:1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrast, cssTokens, resolveColor } from './helpers/css-colors.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const glyphPath = () => {
  const svg = readFileSync(join(root, 'app', 'images', 'help_outline-24px.svg'), 'utf8');
  const glyph = svg.match(/<path (?!fill="none")[^>]*d="M11 18h2[^"]*"/);
  assert.ok(glyph, 'expected the help glyph path in help_outline-24px.svg');
  return glyph[0];
};

test('the help glyph declares an explicit white fill (no fill renders UA-default black)', () => {
  assert.match(
    glyphPath(),
    /fill="#(?:fff|ffffff)"/i,
    'the help glyph must declare an explicit white fill (bead qrcode-vsb)'
  );
});

test('the About button surface is an opaque #0d47a1 circle and the pair clears 3:1', () => {
  const cameraCss = readFileSync(join(root, 'app', 'styles', 'camera.css'), 'utf8');
  const start = cameraCss.indexOf('.Camera .about {');
  assert.notEqual(start, -1, 'expected a .Camera .about rule in camera.css');
  const block = cameraCss.slice(cameraCss.indexOf('{', start), cameraCss.indexOf('}', start));
  // The surface may be the literal or the shared token (bead qrcode-79p); either way the
  // shipped value must still be #0d47a1 - the 8.63:1 pair was verified against it.
  const surface = block.match(/background-color:\s*(#0d47a1|var\(--wsk-indigo-900\))/);
  assert.ok(surface, 'the .about surface must stay #0d47a1 (literal or --wsk-indigo-900 token)');
  const tokens = cssTokens(readFileSync(join(root, 'app', 'styles', 'all.css'), 'utf8'));
  const background = resolveColor(surface[1], tokens);
  assert.equal(background, '#0d47a1');
  assert.match(block, /border-radius:\s*50%/, 'the surface must be circular (mini-FAB pattern)');

  const fill = glyphPath().match(/fill="(#[0-9a-f]{3,6})"/i)?.[1];
  assert.ok(fill, 'the help glyph needs an explicit hex fill');
  const ratio = contrast(fill, background);
  assert.ok(
    ratio >= 3,
    `white glyph on the .about surface is ${ratio}:1 - below the 3:1 non-text minimum (bead qrcode-vsb)`
  );
});
