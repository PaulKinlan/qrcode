// Unit tier: pins the focus indicator of every .wsk-button to a measurable contrast (bead qrcode-9nf).
//
// The buttons in both dialogs shipped with `outline: none` and only a rgba(0,0,0,0.12) background
// tint for focus, which composites to #e0e0e0 on the white card = 1.32:1 - below the 3:1 that
// WCAG 1.4.11 asks of a state indicator. The fix is one class-level :focus-visible ring, so this
// test reads that rule out of the shipped stylesheet, computes the ratio the same way a browser
// audit would, and fails if the ring is removed, made too thin to see, or recoloured below 3:1.
//
// Pure file read plus arithmetic: no DOM, no browser, no network - so it belongs in the fast tier.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const allCss = readFileSync(join(root, 'app', 'styles', 'all.css'), 'utf8');

// The surface the dialog buttons are painted on (.wsk-card { background: white }).
const CARD = { r: 255, g: 255, b: 255 };
const MIN_RATIO = 3; // WCAG 1.4.11 non-text contrast / 2.4.11 focus appearance
const MIN_WIDTH_PX = 2; // WCAG 2.4.13 wants a ring big enough to see; the class now uses 2px

function luminance({ r, g, b }) {
  const channel = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** The declaration block for exactly this selector, or null. Throws if the selector is absent. */
function ruleBlock(css, selector) {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(
    start,
    -1,
    `expected a "${selector}" rule in app/styles/all.css - if the focus indicator moved, update this test rather than deleting it`
  );
  const blockStart = css.indexOf('{', start);
  const blockEnd = css.indexOf('}', blockStart);
  return css.slice(blockStart + 1, blockEnd);
}

/** Parse `outline: <width> solid <colour>` / `outline-color` + `outline-width` into parts. */
function parseOutline(block) {
  const shorthand = block.match(/outline:\s*([0-9.]+)px\s+(?:solid\s+)?([^;]+);/);
  const width = shorthand ? Number(shorthand[1]) : Number((block.match(/outline-width:\s*([0-9.]+)px/) || [])[1] ?? NaN);
  const colour = shorthand
    ? shorthand[2].trim()
    : (block.match(/outline-color:\s*([^;]+);/) || [])[1]?.trim();
  return { width, colour };
}

function hexToRgb(value) {
  const match = String(value).match(/^#([0-9a-f]{6})$/i);
  assert.ok(match, `expected a 6-digit hex colour for the focus ring, got ${JSON.stringify(value)}`);
  return {
    r: parseInt(match[1].slice(0, 2), 16),
    g: parseInt(match[1].slice(2, 4), 16),
    b: parseInt(match[1].slice(4, 6), 16),
  };
}

test('every .wsk-button gets a focus ring of at least 3:1 against the card surface', () => {
  const { width, colour } = parseOutline(ruleBlock(allCss, '.wsk-button:focus-visible'));
  assert.equal(typeof colour, 'string', 'the .wsk-button:focus-visible rule must set an outline colour');

  const ratio = contrast(hexToRgb(colour), CARD);
  assert.ok(
    ratio >= MIN_RATIO,
    `focus ring ${colour} on the white card is ${ratio}:1 - below the ${MIN_RATIO}:1 non-text minimum (bead qrcode-9nf)`
  );
  assert.ok(
    Number.isFinite(width) && width >= MIN_WIDTH_PX,
    `focus ring width is ${width}px - it needs to be at least ${MIN_WIDTH_PX}px to be a visible indicator`
  );
});

test('the focus ring is not left to a per-control rule that a new button would miss', () => {
  // The defect was a class-wide gap (the tint alone), so the indicator must be declared on the
  // class. A per-control override is allowed to exist, but the class rule has to be the one that
  // guarantees a ring for any button added later.
  assert.match(allCss, /\.wsk-button:focus-visible\s*\{/);
});
