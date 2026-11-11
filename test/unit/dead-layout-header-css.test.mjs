// Unit tier: the vendored WSK `.wsk-layout__header` subtree was dead CSS that kept tripping the
// factory audit (bead qrcode-3yx, rule legacy-overflow-hidden-clipping). Nothing in the shipped
// markup or scripts renders a header - app/index.html uses only `.wsk-layout` /
// `.wsk-layout__content` - so the rules clipped with `overflow: hidden` (which also makes the
// element a scroll container) were deleted rather than converted to `overflow: clip`.
//
// This pin keeps the two sides in step: the bundle must not style a layout class the markup does
// not render, and the layout classes the markup DOES render must keep their rules. Adding a real
// header later is fine - it just has to bring the styles and update this pin together, instead of
// resurrecting 170 lines of vendored rules that no shipped page uses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundledStylesheets } from './helpers/bundled-stylesheets.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const stylesDir = join(root, 'app', 'styles');

const readCss = (file) => readFileSync(join(stylesDir, file), 'utf8');
// The whole app.css bundle, read the same way the drift guard reads it: an @import added to the
// entry file is scanned, not silently skipped.
const bundleText = bundledStylesheets(readCss).map(readCss).join('\n');

const filesUnder = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)]
);

const markupText = [
  join(root, 'app', 'index.html'),
  join(root, 'app', 'about.html'),
  ...filesUnder(join(root, 'app', 'scripts')).filter((file) => file.endsWith('.js')),
].map((file) => readFileSync(file, 'utf8')).join('\n');

/** Classes a page or script would have to render for the deleted rules to matter. */
const DELETED_LAYOUT_CLASSES = ['wsk-layout__header', 'wsk-layout__header-row', 'wsk-layout-icon'];

/**
 * Does any markup or script render this class token? Token boundaries matter: without them
 * `wsk-layout__header` would also match `wsk-layout__header-row`.
 * @param {string} cls
 * @returns {boolean}
 */
const isRendered = (cls) => new RegExp(`[\\s"']${cls}(?=[\\s"'])`).test(markupText);

test('the bundle styles no layout class that shipped markup does not render', () => {
  const rendered = DELETED_LAYOUT_CLASSES.filter(isRendered);
  assert.deepEqual(rendered, [], 'shipped markup renders a class the deleted vendored rules styled - add real rules back and update this pin');
  for (const cls of DELETED_LAYOUT_CLASSES) {
    assert.ok(!bundleText.includes(cls), `dead vendored rule for ${cls} is back in the app.css bundle (bead qrcode-3yx)`);
  }
});

test('the layout classes the shipped markup does render keep their rules', () => {
  assert.match(markupText, /class="[^"]*\bwsk-layout\b/, 'the app shell class must still be rendered by the page');
  assert.match(markupText, /class="[^"]*\bwsk-layout__content\b/, 'the scrollable content class must still be rendered by the page');
  assert.match(bundleText, /\.wsk-layout \{/, 'the app shell must stay styled');
  assert.match(bundleText, /\.wsk-layout__content \{/, 'the content area must stay styled');
});
