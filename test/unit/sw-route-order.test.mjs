// The worker's first-match router makes a GET route after its catch-all origin route unreachable.
// Import the real worker once in this file's isolated test process; capture its registration order.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.__APP_VERSION__ = 'route-order-test';
globalThis.self = {
  location: { origin: 'https://qr.example' },
  addEventListener() {},
};

const { router } = await import('../../app/scripts/sw/router.js');
const routes = [];
const register = router.registerRoute;
router.registerRoute = function (method, route, callback, options) {
  routes.push({ method, route, options });
  return register.call(this, method, route, callback, options);
};
await import('../../app/sw.js');

test('the worker registers its catch-all GET origin route after every narrower GET route', () => {
  const getRoutes = routes.filter(({ method }) => method === 'get');
  assert.ok(getRoutes.length >= 2, 'expected worker GET routes to be captured');
  const catchAll = getRoutes.filter(({ options }) =>
    options?.urlMatchProperty === 'origin' && !options.matches);
  assert.equal(catchAll.length, 1, 'expected exactly one unconditional origin catch-all');
  assert.equal(catchAll[0].route, self.location.origin);
  assert.equal(getRoutes.at(-1), catchAll[0],
    'any GET route registered after the origin catch-all is silently unreachable');
});
