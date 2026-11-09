// Runtime packages are bundled into the app. Pin their manifests exactly, not the dev tools.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'));

function assertRuntimePins(dependencies) {
  for (const [name, version] of Object.entries(dependencies)) {
    assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
      `${name} must use an exact runtime version, not a range`);
    assert.equal(lock.packages[''].dependencies[name], version,
      `${name} must agree with the lockfile root`);
    assert.equal(lock.packages[`node_modules/${name}`]?.version, version,
      `${name} must resolve to its declared version`);
  }
}

test('every shipped runtime dependency stays exactly pinned in both manifest and lock', () => {
  assert.ok(Object.keys(manifest.dependencies).length > 0, 'runtime dependency check must not be vacuous');
  assertRuntimePins(manifest.dependencies);
});

test('the guard rejects a reintroduced caret range', () => {
  assert.throws(() => assertRuntimePins({ ...manifest.dependencies, comlink: '^4.4.2' }),
    /comlink must use an exact runtime version/);
});
