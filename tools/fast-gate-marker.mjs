// Emit the fleet fast-gate coverage marker for the unit tier.
//
// fleet-check reads a `fast-gate: ran: <suite>...` line as positive evidence of WHICH suites
// executed, and reports coverage KNOWN for the changed files those suites match. Without it a
// passing node:test run is invisible to the extractor and every landing reads
// "coverage UNKNOWN: N changed file(s) NOT demonstrated to be exercised".
//
// The list is derived from the directory the gate runs, not hand-maintained, so it cannot go
// stale when a test file is added. `npm run test:fast` prints it only after the tests pass.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const unitDir = new URL('../test/unit/', import.meta.url);
const suites = readdirSync(fileURLToPath(unitDir))
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => `test/unit/${name}`);

if (suites.length === 0) {
  // Never claim coverage for a run that executed nothing (speed.md R14).
  console.log('fast-gate: unknown: no test files found in test/unit/');
} else {
  console.log(`fast-gate: ran: ${suites.join(' ')}`);
}
