// THREAT_MODEL.md is the tracked source of every numbered security invariant this repo cites
// (bead qrcode-n501). Before it existed, `app/sw.js`, `app/_headers` and two unit tests cited
// "threat-model invariant N" from a generated artefact that lived outside the repository, so a
// clone could not resolve them and the numbers could drift without anything failing.
//
// This guard makes the citations load-bearing:
//   1. the document must be in the tree and not git-ignored;
//   2. its §6 invariant list must be numbered 1..n with no gaps;
//   3. every `THREAT_MODEL.md §6, invariant N` citation in the source must resolve to a listed N;
//   4. a citation that names an invariant without naming the section is rejected, so the numbers
//      stay anchored to a section that can move.
//
// The scan is a plain file walk, not `git ls-files`: no test may depend on another agent's working
// state or on git being present (docs/speed.md discipline), and the file set here is small.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const docPath = join(root, 'THREAT_MODEL.md');
const ownPath = fileURLToPath(import.meta.url);

const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');
const doc = readFileSync(docPath, 'utf8');

// The section invariant numbers live in. Citations must name it so a renumbering of the document
// cannot leave a bare number pointing at whatever happens to be sixth.
const INVARIANT_SECTION = 6;

const CANONICAL_CITATION = new RegExp(`THREAT_MODEL\\.md §(\\d+), invariant (\\d+)`, 'g');
const LOOSE_CITATION = /(?:THREAT_MODEL\.md|threat[-_ ]?model)[^\n]{0,40}?invariant\s+\d+/i;

/** The §6 invariant list, as [{ number, text }]. */
function parseInvariants(source) {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => /^##\s+6\.\s+\S/.test(line));
  assert.notEqual(start, -1, 'THREAT_MODEL.md must keep a "## 6. ..." invariants section');

  const invariants = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    const match = /^(\d+)\.\s+(\S.*)$/.exec(line);
    if (match) invariants.push({ number: Number(match[1]), text: match[2] });
  }
  return invariants;
}

const SCAN_ROOTS = ['app', 'test', 'tools'];
const BINARY = /\.(?:png|jpe?g|gif|ico|webp|avif|wasm|woff2?|ttf)$/i;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'tmp', 'coverage']);

/** Every text file the repository ships, as { path, text } - own file excluded (see above). */
function scan() {
  const files = [{ path: 'README.md', text: read('README.md') }];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
        walk(full);
        continue;
      }
      if (full === ownPath || BINARY.test(entry.name)) continue;
      files.push({ path: relative(root, full).split(sep).join('/'), text: readFileSync(full, 'utf8') });
    }
  };
  for (const dir of SCAN_ROOTS) walk(join(root, dir));
  return files;
}

const invariants = parseInvariants(doc);
const files = scan();

/** Every canonical citation in the tree, as { path, section, number }. */
function citations() {
  const found = [];
  for (const file of files) {
    for (const match of file.text.matchAll(CANONICAL_CITATION)) {
      found.push({ path: file.path, section: Number(match[1]), number: Number(match[2]) });
    }
  }
  return found;
}

test('the threat model is a tracked file, not a generated artefact outside the repo', () => {
  assert.ok(doc.trim().length > 0, 'THREAT_MODEL.md must not be empty');
  const ignored = read('.gitignore')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
  assert.deepEqual(ignored.filter((line) => line.endsWith('THREAT_MODEL.md') || line === '*'), [],
    'THREAT_MODEL.md must not be git-ignored: an untracked copy is the bug this file fixes');
});

test('the invariant list is numbered 1..n with no gaps', () => {
  assert.ok(invariants.length >= 13, `expected at least the 13 historical invariants, got ${invariants.length}`);
  assert.deepEqual(invariants.map((invariant) => invariant.number),
    Array.from({ length: invariants.length }, (_, index) => index + 1),
    'invariant numbers must be contiguous: a citation resolves by number, so a gap or duplicate renumbers silently');
});

test('the scan covers the tree, so a passing run is not vacuous', () => {
  assert.ok(files.length > 50, `expected to scan the source tree, only saw ${files.length} files`);
  assert.ok(files.some((file) => file.path === 'app/sw.js'), 'app/sw.js must be scanned');
  assert.ok(files.some((file) => file.path === 'app/_headers'), 'app/_headers must be scanned');
});

test('every cited invariant number exists in the tracked document', () => {
  const found = citations();
  assert.ok(found.length > 0, 'no THREAT_MODEL.md citations were found: the guard would pass vacuously');
  const numbers = new Set(invariants.map((invariant) => invariant.number));
  const dangling = found.filter((citation) => !numbers.has(citation.number));
  assert.deepEqual(dangling, [], `cited but missing from THREAT_MODEL.md §6: ${JSON.stringify(dangling)}`);
});

test('every citation names the section the invariants live in', () => {
  const wrong = citations().filter((citation) => citation.section !== INVARIANT_SECTION);
  assert.deepEqual(wrong, [],
    `citations must read "THREAT_MODEL.md §${INVARIANT_SECTION}, invariant N": ${JSON.stringify(wrong)}`);
});

test('no citation names an invariant without a section (the form that rots silently)', () => {
  const loose = files
    .filter((file) => LOOSE_CITATION.test(file.text.replace(CANONICAL_CITATION, '')))
    .map((file) => file.path);
  assert.deepEqual(loose, [],
    `cite as "THREAT_MODEL.md §${INVARIANT_SECTION}, invariant N" so the number stays anchored: ${loose}`);
});

test('the invariants the repo leans on are cited from the code that depends on them', () => {
  const found = citations();
  const cites = (path, number) => found.some((citation) => citation.path === path && citation.number === number);
  // Invariant 6 is the precache-entry rule (app/sw.js + its test); 12 is the
  // assert-it-on-the-response rule the header tests exist for.
  assert.ok(cites('app/sw.js', 6), 'app/sw.js must cite THREAT_MODEL.md §6, invariant 6');
  assert.ok(cites('test/unit/sw-precache.test.mjs', 6), 'sw-precache.test.mjs must cite invariant 6');
  assert.ok(cites('test/unit/referrer-policy.test.mjs', 12), 'referrer-policy.test.mjs must cite invariant 12');
});

test('the deployment header file and README point at this document', () => {
  // app/_headers records the dev-server worker-CSP residual and must name where the residual is
  // written down; a reader of the deployed header file has no other route to it.
  assert.match(read('app', '_headers'), /THREAT_MODEL\.md §7/,
    'app/_headers must reference the accepted risks in THREAT_MODEL.md §7');
  assert.match(read('README.md'), /THREAT_MODEL\.md/,
    'README.md must link the threat model so a contributor can find it');
});
