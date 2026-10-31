// Unit tier: pins the About control's painted pair (bead qrcode-vsb). The help icon is the
// ONLY route to the About dialog and sits over the camera canvas / live frames, so its pair
// must not rely on the backdrop: the glyph svg declares an explicit white fill (no fill
// renders UA-default black, 2.09:1 on #424242) and the .Camera .about button paints its own
// opaque #0d47a1 circular surface. Non-text/UI pair (WCAG 1.4.11): needs 3:1 - white on
// #0d47a1 is 6.13:1. Parses the shipped files, computes the WCAG 2.x ratio, fails below 3:1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * WCAG 2.x contrast ratio between two hex colours, rounded to 2 decimals.
 * @param {string} hexA
 * @param {string} hexB
 * @returns {number}
 */
function contrast(hexA, hexB) {
  const lum = (hex) => {
    const chan = (i) => {
      const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * chan(0) + 0.7152 * chan(1) + 0.0722 * chan(2);
  };
  const [hi, lo] = [lum(hexA), lum(hexB)].sort((a, b) => b - a);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

test('the help glyph declares an explicit white fill (no fill renders UA-default black)', () => {
  const svg = readFileSync(join(root, 'app', 'images', 'help_outline-24px.svg'), 'utf8');
  const glyph = svg.match(/<path (?!fill="none")[^>]*d="M11 18h2[^"]*"/);
  assert.ok(glyph, 'expected the help glyph path in help_outline-24px.svg');
  assert.match(
    glyph[0],
    /fill="#(?:fff|ffffff)"/i,
    'the help glyph must declare an explicit white fill (bead qrcode-vsb)'
  );
});

test('the About button surface is an opaque #0d47a1 circle and the pair clears 3:1', () => {
  const cameraCss = readFileSync(join(root, 'app', 'styles', 'camera.css'), 'utf8');
  const start = cameraCss.indexOf('.Camera .about {');
  assert.notEqual(start, -1, 'expected a .Camera .about rule in camera.css');
  const block = cameraCss.slice(cameraCss.indexOf('{', start), cameraCss.indexOf('}', start));
  assert.match(block, /background-color:\s*#0d47a1/, 'the .about surface must stay #0d47a1');
  assert.match(block, /border-radius:\s*50%/, 'the surface must be circular (mini-FAB pattern)');

  const ratio = contrast('#ffffff', '#0d47a1');
  assert.ok(
    ratio >= 3,
    `white glyph on the .about surface is ${ratio}:1 - below the 3:1 non-text minimum (bead qrcode-vsb)`
  );
});
