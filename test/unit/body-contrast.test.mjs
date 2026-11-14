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
import { bundledStylesheets, parseImports, stripCssComments } from './helpers/bundled-stylesheets.mjs';
import { contrast, cssTokens, hexToRgb } from './helpers/css-colors.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const allCss = readFileSync(join(root, 'app', 'styles', 'all.css'), 'utf8');

// Colour tokens (bead qrcode-79p): the drift-set palette declared once in the :root block of
// app/styles/all.css. Parsed from the stylesheet (not hard-coded here) so this test reads the
// shipped source of truth - and pinned to exact values below so the contrast guarantees
// survive the token refactor.
const tokens = cssTokens(allCss);

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
    const match = block.match(new RegExp(`${property}:\\s*(#[0-9a-fA-F]{6}|white|black|var\\(--wsk-[a-z0-9-]+\\))`));
    if (match) {
      let value = match[1];
      if (value.startsWith('var(')) {
        // Resolve the token through the :root block; a token that is declared but missing from
        // the map means the parser above drifted from the declarations - fail loudly.
        const name = value.slice(4, -1);
        value = tokens[name];
        assert.ok(value, `${name} is used in a rule but not declared in the :root block`);
      }
      const hex = NAMED_COLORS[value] ?? value;
      return hexToRgb(hex);
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

test('the colour tokens resolve to the exact values the contrast guarantees were verified against', () => {
  // The contrast pairs below were computed from these literals (bead qrcode-6pr, qrcode-e4c
  // camera button, qrcode-79p noscript panel). A token rename or value change must show up
  // here, not silently shift a verified ratio.
  assert.equal(tokens['--wsk-grey-900'], '#212121');
  assert.equal(tokens['--wsk-grey-800'], '#424242');
  assert.equal(tokens['--wsk-grey-400'], '#bdbdbd');
  assert.equal(tokens['--wsk-indigo-900'], '#0d47a1');
  assert.equal(tokens['--wsk-white'], '#fff');
});

test('the drift-set palette is declared once and not re-typed in any bundled rule body', () => {
  // qrcode-79p: the same greys/indigo were re-typed by hand across the stylesheets app.css
  // bundles. The file list is derived by bundledStylesheets() (the bundle's source of truth is
  // app.css, bead qrcode-bib), so a newly imported stylesheet is guarded automatically - and a
  // nested @import below app.css fails loudly instead of escaping the scan (bead qrcode-4bw).
  // Rule bodies must reference the tokens; comments may still cite hex values (they document
  // measured contrast ratios), and the :root declarations are the single source - that is the fix.
  const bundled = bundledStylesheets((file) => readFileSync(join(root, 'app', 'styles', file), 'utf8'));
  assert.ok(bundled.includes('all.css'), 'all.css must stay bundled (it declares the tokens)');
  for (const file of bundled) {
    const css = readFileSync(join(root, 'app', 'styles', file), 'utf8');
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const withoutTokenDeclarations = withoutComments.replace(/:root\s*\{[^}]*\}/, '');
    for (const hex of ['#212121', '#424242', '#bdbdbd', '#0d47a1', '#fff', '#ffffff']) {
      assert.ok(!withoutTokenDeclarations.includes(hex), `app/styles/${file} re-types ${hex} in a rule body; use the --wsk token`);
    }
  }
});

test('the bundle derivation covers the entry file itself', () => {
  // app.css is part of the bundle; a hex re-typed in its own rule body must be scanned too
  // (same escape class as qrcode-4bw, one file earlier in the chain).
  const files = bundledStylesheets((file) =>
    file === 'app.css' ? "@import 'all.css';\n.x { color: #424242; }" : ':root { --wsk-grey-800: #424242; }'
  );
  assert.deepEqual(files, ['app.css', 'all.css']);
});

test('the bundle derivation rejects a nested @import below the entry file (bead qrcode-4bw)', () => {
  // The reviewer's mutant: all.css imports deep.css, whose rule body re-types a palette hex.
  // The derivation must fail loudly instead of returning a file list that skips deep.css.
  const tree = {
    'app.css': "@import 'all.css';",
    'all.css': "@import 'deep.css';\n:root { --wsk-grey-800: #424242; }",
    'deep.css': '.y { color: #424242; }',
  };
  assert.throws(() => bundledStylesheets((file) => tree[file]), /all\.css contains an @import/);
});

test('the bundle derivation parses the url() import form and fails on unparseable lines (bead qrcode-37j)', () => {
  const urlForm = bundledStylesheets((file) =>
    file === 'app.css' ? "@import url('all.css');" : ':root { --wsk-grey-800: #424242; }'
  );
  assert.deepEqual(urlForm, ['app.css', 'all.css']);
  assert.throws(
    () => parseImports("@import whatever all.css", 'app.css'),
    /app.css has an @import this guard cannot parse/
  );
});

test('imports with trailing media-query / layer() clauses are derived, not rejected (bead qrcode-g7j)', () => {
  // A media query or cascade layer names the SAME file; the parent tree guarded it, so the
  // whole-statement anchor must absorb the tail rather than throw on valid CSS.
  const tree = {
    'app.css': "@import 'all.css' screen;\n@import url('camera.css') layer(base) supports(display: grid);",
    'all.css': ':root { --wsk-grey-800: #424242; }',
    'camera.css': ':root { --wsk-indigo-900: #0d47a1; }',
  };
  assert.deepEqual(bundledStylesheets((file) => tree[file]), ['app.css', 'all.css', 'camera.css']);
});

test('comment stripping blanks the prose but keeps the comment line count (bead qrcode-4fs)', () => {
  const stripped = stripCssComments('a { color: red; } /* one\ntwo\nthree */ b { color: blue; }');
  assert.equal(stripped.split('\n').length, 3, "the comment's own newlines must survive, not be deleted with the prose");
  assert.ok(!stripped.includes('one'), 'the prose itself must be gone');
  assert.ok(stripped.includes('b { color: blue; }'), 'the declaration after the comment survives');
});

test('stripping a comment keeps the line breaks inside it (bead qrcode-4fs)', () => {
  // The strip exists so comment PROSE never parses as an import. Deleting the comment text with
  // its newlines merged the import that follows a multi-line comment onto the line the comment
  // started on, so valid CSS hard-redded with "an @import this guard cannot parse".
  const tree = {
    'app.css': [
      "@import 'camera.css'; /* note",
      "continues */ @import 'all.css';",
      "@import 'x.css';",
    ].join('\n'),
    'camera.css': ':root { --wsk-grey-800: #424242; }',
    'all.css': ':root { --wsk-indigo-900: #0d47a1; }',
    'x.css': '.x { color: #bdbdbd; }',
  };
  assert.deepEqual(
    bundledStylesheets((file) => tree[file]),
    ['app.css', 'camera.css', 'all.css', 'x.css'],
    'both imports around a multi-line comment must derive; the comment must not glue them together'
  );
});

test('an @import mentioned in a comment is prose, not a nested import (bead qrcode-g7j)', () => {
  const tree = {
    'app.css': "@import 'all.css';",
    // Documents the bundle; must not trip the nested-import rejection...
    'all.css': '/* prev bundle had: @import "camera.css"; */\n:root { --wsk-grey-800: #424242; }',
    // ...but a real nested import inside a comment still must not smuggle the file in.
    'camera.css': '.y { color: #424242; }',
  };
  assert.deepEqual(bundledStylesheets((file) => tree[file]), ['app.css', 'all.css']);
});

test('comments never become imports, anywhere in the entry file (bead qrcode-2mu)', () => {
  // A comment after the statement's ';' must not break the whole-statement match...
  // ...and a comment-only line mentioning @import in the ENTRY file must not be parsed as one.
  const tree = {
    'app.css': "@import 'all.css'; /* camera capture */\n/* bundle note: @import 'camera.css'; */",
    'all.css': ':root { --wsk-grey-800: #424242; }',
    'camera.css': '.y { color: #424242; }',
  };
  assert.deepEqual(bundledStylesheets((file) => tree[file]), ['app.css', 'all.css']);
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
