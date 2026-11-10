// Derives the stylesheet list of the app.css bundle for the drift guard in
// test/unit/body-contrast.test.mjs. The reader is injected so tests can pin the
// traversal against an in-memory tree instead of mutating app/styles.
//
// Shape policy (bead qrcode-4bw, qrcode-bib): app.css is the bundle's ONLY import
// root. Every @import it declares is parsed (quoted and url() forms, case-insensitive;
// a line the parser cannot read fails loudly instead of silently escaping the list -
// bead qrcode-37j) and every imported file must be import-free. A nested @import
// (all.css -> deep.css) would put a stylesheet in the bundle that no scan reaches,
// so it is rejected here rather than recursed into by hand - hand-rolling the
// bundler's traversal would be its own drift risk. The entry file itself is part of
// the returned list: its rule body is scanned like any other bundled stylesheet.
import assert from 'node:assert/strict';

/**
 * Parse the stylesheet's @import lines. Both CSS forms (quoted and url()), case-insensitive;
 * an @import line that matches neither form throws with the offending line.
 * @param {string} css
 * @param {string} file - stylesheet the lines came from (for the failure message)
 * @returns {string[]}
 */
export function parseImports(css, file) {
  return css
    .split('\n')
    .filter((line) => /@import/i.test(line))
    .map((line) => {
      const trimmed = line.trim();
      // Each form must match the WHOLE statement: a loose match would silently capture a prefix
      // of an unparseable import (e.g. `@import whatever all.css` -> "whatever") instead of
      // failing loudly (bead qrcode-37j). The tail after the target is the optional
      // layer()/supports()/media-query clause - valid CSS that names the SAME file, so it is
      // absorbed rather than rejected (bead qrcode-g7j); it cannot contain a top-level `;`
      // because that ends the statement. A missing statement-final `;` (EOF form) stays
      // accepted, as the parent tree accepted it.
      const quoted = trimmed.match(/^@import\s+(['"])([^'"]+)\1(?:\s+[^;]*)?;?\s*$/i);
      const urlForm = trimmed.match(/^@import\s+url\(\s*(['"]?)([^'" )]+)\1\s*\)(?:\s+[^;]*)?;?\s*$/i);
      const m = quoted ?? urlForm;
      assert.ok(m, `${file} has an @import this guard cannot parse - extend the guard: ${trimmed}`);
      return m[2];
    });
}

/**
 * Every stylesheet that ends up in the app.css bundle, entry first, in import order.
 * @param {(file: string) => string} readCss - resolves a stylesheet name to its text
 * @param {string} [entry] - the bundle root (only file allowed to @import)
 * @returns {string[]}
 */
export function bundledStylesheets(readCss, entry = 'app.css') {
  const seen = new Set([entry]);
  const files = [entry];
  for (const file of parseImports(readCss(entry), entry)) {
    if (seen.has(file)) continue; // duplicate import: already in the list
    seen.add(file);
    const css = readCss(file);
    // Comments may legitimately mention @import in prose (they document the bundle); strip
    // them like the hex scan does, so only a REAL nested import is rejected (bead qrcode-g7j).
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(
      !/@import/i.test(withoutComments),
      `${file} contains an @import - ${entry} is the bundle's only import root; declare it in ${entry} instead (bead qrcode-4bw), or extend this helper to recurse`
    );
    files.push(file);
  }
  return files;
}
