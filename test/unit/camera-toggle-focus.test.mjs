// Unit tier: pins the keyboard focus ring of the camera flip toggle (bead qrcode-a96).
//
// The toggle is a real keyboard control: app/index.html renders a checkbox
// (.Camera-toggle-input) plus a <label for> that draws the visible affordance, and the checkbox is
// positioned rather than display:none, so it stays in the tab order. The label carried
// `outline: none` and there was no :focus-visible rule for the pair, so tabbing to the toggle
// produced no visible focus at all - WCAG 2.4.7. This is the third control on the camera screen;
// .Camera .about and .wsk-button got the same treatment earlier (beads qrcode-e4c, qrcode-9nf).
//
// The first fix drew the ring as an outline, and it painted nothing: the label fills its parent
// .wsk-button--fab, which is a 56px round box with `overflow: hidden`, so an outline outside the
// label's box is clipped away entirely - computed style said 2px solid white while the screenshot
// showed no ring (review finding qrcode-e45). Hence: the ring is an INSET shadow, and these tests
// pin both the paint properties and that invariant.
//
// Pure file reads plus arithmetic: no DOM, no browser, no network - it belongs in the fast tier.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cameraCss = readFileSync(join(root, 'app', 'styles', 'camera.css'), 'utf8');
const allCss = readFileSync(join(root, 'app', 'styles', 'all.css'), 'utf8');

// The surface the ring sits on: the toggle's own background
// (.Camera .CameraRealtime .Camera-toggle { background-color: #0288d1 }).
const TOGGLE = { r: 0x02, g: 0x88, b: 0xd1 };
const MIN_RATIO = 3; // WCAG 1.4.11 non-text contrast / 2.4.11 focus appearance
const MIN_WIDTH_PX = 2;

const TOGGLE_FOCUS_SELECTOR = '.Camera .CameraRealtime .Camera-toggle-input:focus-visible + label';

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
function ruleBlock(css, selector, file = 'app/styles/camera.css') {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(
    start,
    -1,
    `expected a "${selector}" rule in ${file} - if the focus indicator moved, update this test rather than deleting it`
  );
  const blockStart = css.indexOf('{', start);
  const blockEnd = css.indexOf('}', blockStart);
  return css.slice(blockStart + 1, blockEnd);
}

function hexToRgb(value) {
  // #fff and #ffffff are both valid here: the repo's existing ring (.Camera .about:focus-visible)
  // uses the short form, and this rule deliberately matches it.
  const match = String(value).match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  assert.ok(match, `expected a hex colour for the focus ring, got ${JSON.stringify(value)}`);
  const hex = match[1].length === 3 ? [...match[1]].map((c) => c + c).join('') : match[1];
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

test('the camera flip toggle gets a visible inset focus ring on the label the user sees', () => {
  const block = ruleBlock(cameraCss, TOGGLE_FOCUS_SELECTOR);
  // The ring colour may be the literal or the shared --wsk-white token (bead qrcode-79p);
  // resolve the token so the contrast check still sees the shipped value.
  const tokens = Object.fromEntries(
    [...allCss.matchAll(/(--wsk-[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)].map((m) => [m[1], m[2]])
  );
  const shadow = block.match(/box-shadow:\s*inset\s+0\s+0\s+0\s+([0-9.]+)px\s+(#[0-9a-f]{3,6}|var\(--wsk-[a-z0-9-]+\));/i);
  assert.ok(
    shadow,
    'the ring must be an inset box-shadow on the label: an outline is clipped by .wsk-button--fab overflow:hidden (qrcode-e45)'
  );
  const ringColor = shadow[2].startsWith('var(')
    ? (assert.ok(tokens[shadow[2].slice(4, -1)], 'ring token must be declared in the :root block'), tokens[shadow[2].slice(4, -1)])
    : shadow[2];

  const width = Number(shadow[1]);
  assert.ok(
    width >= MIN_WIDTH_PX,
    `focus ring width is ${width}px - it needs to be at least ${MIN_WIDTH_PX}px to be a visible indicator`
  );

  const ratio = contrast(hexToRgb(ringColor), TOGGLE);
  assert.ok(
    ratio >= MIN_RATIO,
    `focus ring ${ringColor} on the toggle surface is ${ratio}:1 - below the ${MIN_RATIO}:1 non-text minimum (bead qrcode-a96)`
  );
});

test('the ring is painted inside the box, because the fab ancestor clips everything outside it', () => {
  // The invariant the first fix broke: the label fills a round fab with overflow:hidden, so a ring
  // drawn outside the label's box is invisible. Both halves are pinned - the clipping ancestor
  // still exists, and the rule still paints inside.
  const fab = ruleBlock(allCss, '.wsk-button--fab', 'app/styles/all.css');
  assert.match(fab, /overflow:\s*hidden/, 'if the fab stops clipping, revisit this rule and this test together');
  assert.match(fab, /border-radius:\s*50%/);

  const block = ruleBlock(cameraCss, TOGGLE_FOCUS_SELECTOR);
  assert.doesNotMatch(block, /outline\s*:/, 'an outline here is clipped away by the fab; use the inset shadow');
  assert.match(block, /box-shadow:\s*inset/i, 'the ring must be inset into the label box');
});

test('the ring is declared on the visible label, not on the positioned input', () => {
  // The input is `position: absolute` with no size; a ring on it would be drawn on an empty box,
  // which is how this control managed to look unfocused while technically matching :focus.
  const labelSide = TOGGLE_FOCUS_SELECTOR.split(':focus-visible')[1].trim();
  assert.equal(labelSide, '+ label', 'the ring must land on the sibling label');

  const inputRule = ruleBlock(cameraCss, '.Camera .CameraRealtime .Camera-toggle-input');
  assert.match(inputRule, /position:\s*absolute/, 'the input is positioned, not hidden - it stays in the tab order');
});

test('the toggle ring uses :focus-visible so a tap does not paint it', () => {
  // :focus would ring on every mouse/touch activation of the toggle; the other two controls on this
  // screen (and .wsk-button) use :focus-visible, and the fixes should not disagree.
  assert.doesNotMatch(
    cameraCss,
    /\.Camera .CameraRealtime \.Camera-toggle-input:focus \+ label/,
    'use :focus-visible, not :focus, for the toggle focus ring'
  );
});
