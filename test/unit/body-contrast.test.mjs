// Unit tier: pins the shipped default text/background pair to WCAG 2.x AA (bead qrcode-6pr).
// The html,body pair in app/styles/all.css is the default every inheriting element gets; it
// shipped as #9e9e9e on #424242 = 3.75:1, below the 4.5:1 AA minimum for normal-size copy.
// This test parses the stylesheet (no build, no browser - `npm run test:fast` tier), computes
// the WCAG 2.x relative-luminance ratio from the shipped values and fails below 4.5:1, so a
// future colour edit cannot silently reintroduce the failure. The browser-side evidence for
// every painted surface came from the CDP contrast pass recorded on the bead.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const allCss = readFileSync(join(root, 'app', 'styles', 'all.css'), 'utf8');

/**
 * WCAG 2.x relative luminance of an sRGB channel triple.
 * @param {{ r: number, g: number, b: number }} rgb
 * @returns {number}
 */
function luminance({ r, g, b }) {
  const channel = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * WCAG 2.x contrast ratio between two colours, rounded to 2 decimals.
 * @param {{ r: number, g: number, b: number }} a
 * @param {{ r: number, g: number, b: number }} b
 * @returns {number}
 */
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/**
 * Pull the first `color:` / `background(-color):` value from the rule block that starts with
 * `selector` in the stylesheet text. Resolves 6-digit hex and the CSS named colours this sheet
 * uses. Throws when the selector or a value is missing, so a refactor that renames the rule
 * fails loudly instead of passing vacuously.
 * @param {string} css
 * @param {string} selector
 * @param {string} property
 * @returns {{ r: number, g: number, b: number }}
 */
const NAMED_COLORS = { white: '#ffffff', black: '#000000' };
function shippedColor(css, selector, property) {
  // A selector can appear in several rules (e.g. an early `html, body { margin }` reset before
  // the typography rule). Scan every occurrence and take the first block that actually sets
  // the property.
  let from = 0;
  for (;;) {
    const start = css.indexOf(selector, from);
    assert.notEqual(start, -1, `expected a rule for ${selector} in app/styles/all.css`);
    from = start + selector.length;
    const blockStart = css.indexOf('{', start);
    const blockEnd = css.indexOf('}', blockStart);
    const block = css.slice(blockStart, blockEnd);
    const match = block.match(new RegExp(`${property}:\\s*(#[0-9a-fA-F]{6}|white|black)`));
    if (match) {
      const hex = NAMED_COLORS[match[1]] ?? match[1];
      return {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16),
      };
    }
  }
}

test('the default body text/background pair meets WCAG AA (4.5:1)', () => {
  const text = shippedColor(allCss, 'html, body', 'color');
  const background = shippedColor(allCss, 'html, body', 'background-color');
  const ratio = contrast(text, background);
  assert.ok(
    ratio >= 4.5,
    `html,body pair is ${ratio}:1 - below the 4.5:1 AA minimum for normal-size copy (bead qrcode-6pr)`
  );
});

test('the historical failure values stay out of the stylesheet', () => {
  // Guard against a revert to the shipped 3.75:1 pair specifically.
  assert.ok(!/#9e9e9e\s*;\s*[^}]*background-color:\s*#424242/.test(allCss.replace(/\n/g, '')),
    'the #9e9e9e-on-#424242 body pair (3.75:1) must not return');
});

test('dialog card text keeps an explicit AA colour over the white card surface', () => {
  // .wsk-card is white; p carries an explicit dark colour. Pin both so inheritance or a
  // palette change cannot turn the About/Success dialog copy light-on-light.
  const card = shippedColor(allCss, '.wsk-card {', 'background');
  const paragraph = shippedColor(allCss, 'h1, h2, h3, h4, h5, h6, p', 'color');
  const ratio = contrast(paragraph, card);
  assert.ok(
    ratio >= 4.5,
    `dialog paragraph text on the card is ${ratio}:1 - below AA (bead qrcode-6pr)`
  );
});
