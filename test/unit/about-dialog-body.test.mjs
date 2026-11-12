import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../app/styles/QRCodeAboutDialog.css', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../../app/index.html', import.meta.url), 'utf8');

// The About dialog body is the one .wsk-card--lower whose copy must never be clipped
// (bead qrcode-0tp): it is static prose, not a bounded preview, and at narrow widths the
// paragraphs wrap taller than the inherited fixed 108px.
const bodyRule = css.match(/\.QRCodeAboutDialog-data\s*\{([^}]*)\}/)?.[1];

test('the About card overrides the UA bottom inset so its footer remains visible', () => {
  const dialogRule = css.match(/\.QRCodeAboutDialog\s*\{([^}]*)\}/)?.[1];
  assert.ok(dialogRule, '.QRCodeAboutDialog rule must exist');
  assert.match(dialogRule, /\bbottom:\s*auto\s*;/, 'top:50% + the UA bottom:0 shrinks the card to half the viewport');
});

test('the About body grows with its copy instead of inheriting the fixed 108px', () => {
  assert.ok(bodyRule, '.QRCodeAboutDialog-data rule must exist');
  assert.match(bodyRule, /\bheight:\s*auto\s*;/, 'fixed height clips wrapped copy');
});

test('the body scrolls only as a visible fallback, not as a silent clip', () => {
  assert.ok(bodyRule, '.QRCodeAboutDialog-data rule must exist');
  assert.match(bodyRule, /\bmax-height:\s*calc\(100vh\s*-\s*220px\)\s*;/, 'vh fallback reserves heading, footer, margins and UA max-height allowance');
  assert.match(bodyRule, /\bmax-height:\s*calc\(100dvh\s*-\s*220px\)\s*;/, 'dvh cap must win over the vh fallback');
  assert.match(bodyRule, /\boverflow-y:\s*auto\s*;/, 'scrollbar appears only when the cap binds');
  assert.doesNotMatch(bodyRule, /\boverflow:\s*hidden/, 'overflow hidden is the silent clip this fix removes');
});

test('the scrollable About body is keyboard accessible and named', () => {
  const div = indexHtml.match(/<div class="wsk-card--lower QRCodeAboutDialog-data"([^>]*)>/)?.[1];
  assert.ok(div, 'the About data div must exist in index.html');
  assert.match(div, /\stabindex="0"/, 'WCAG scrollable-region-focusable: the scroll region must be focusable');
  assert.match(div, /\srole="region"/, 'the focusable scroll region needs a role');
  assert.match(div, /\saria-labelledby="about-heading"/, 'the region must be named by the dialog heading');
});

test('modal scroll containment keeps gestures in the dialog from scrolling the page', () => {
  assert.match(css, /\.QRCodeAboutDialog:modal\s*\{[^}]*\boverscroll-behavior:\s*contain\s*;/);
  const backdrop = css.match(/\.QRCodeAboutDialog::backdrop\s*\{([^}]*)\}/)?.[1];
  assert.ok(backdrop, '.QRCodeAboutDialog::backdrop rule must exist');
  assert.match(backdrop, /\boverscroll-behavior:\s*contain\s*;/);
  assert.match(backdrop, /\boverflow:\s*hidden\s*;/, 'the backdrop ignores overscroll-behavior unless it is a scroll container');
});
