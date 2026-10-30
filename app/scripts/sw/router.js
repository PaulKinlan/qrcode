// A tiny fetch router for the service worker.
//
// Route patterns are strings, with `:name` capturing one path segment, matched against either the
// whole URL (`url.toString()`) or one URL property named by `options.urlMatchProperty` (app/sw.js
// matches on "origin"). An options.matches(url, event) predicate can add a condition on top.
//
// Two properties of the pattern handling are deliberate, and were both bugs before bead qrcode-cl1:
//
//  - The regex is built from ESCAPED literal text, so a '.' in a route (e.g. '/sw-manifest.json')
//    matches a full stop and nothing else. Patterns used to be interpolated raw into `new RegExp`,
//    which made every metacharacter in them live.
//  - The regex is anchored at BOTH ends. It used to be appended with '$' only, so every route was
//    a suffix match: '/scan-image' also matched '/anything/scan-image'.
const REGEXP_METACHARACTERS = /[.*+?^${}()|[\]\\]/g;

const escapeLiteral = (text) => text.replace(REGEXP_METACHARACTERS, '\\$&');

// One :name segment. The excluded characters are unchanged from the original router, so the params
// a route receives do not change with this fix: no '/', '.' or '\' inside a captured value.
const PARAM_SOURCE = String.raw`([^/.\\]+)`;

const FetchRouter = function() {
  const _routes = {
    get: [],
    post: []
  };

  this.parseRoute = function(path) {
    this.parseGroups = function(loc) {
      // A fresh regex per call: a module-level /g regex would carry lastIndex between routes.
      const nameRegexp = /:([^/.\\]+)/g;
      const groups = {};
      let source = '^';
      let cursor = 0;
      let index = 0;
      let matches = null;

      while((matches = nameRegexp.exec(loc))) {
        source += escapeLiteral(loc.slice(cursor, matches.index)) + PARAM_SOURCE;
        groups[matches[1]] = index ++;
        cursor = matches.index + matches[0].length;
      }

      // The whole pattern (literal tail included) must be consumed by the match.
      source += escapeLiteral(loc.slice(cursor)) + "$";

      return { "groups" : groups, "regexp": new RegExp(source)};
    };

    return this.parseGroups(path);
  };

  // Returns { route, params } - or undefined. Params belong to THIS match: they used to be written
  // onto the shared route object (route.params), so two overlapping fetch events on the same
  // parameterised route raced, and the second match overwrote the first before its callback read it.
  var matchRoute = function(url, type, event) {
    const filteredType = String(type).toLowerCase();

    if(filteredType in _routes === false) {
      return ; // Reject
    }

    for(let i = 0; i < _routes[filteredType].length; i ++) {
      const route = _routes[filteredType][i];
      const urlMatchProperty = route.options.urlMatchProperty;
      const urlPart = (urlMatchProperty in url) ? url[urlMatchProperty] : url.toString();
      const routeMatch = route.regex.regexp.exec(urlPart);

      if(!!routeMatch == false || (route.options.matches && !route.options.matches(url, event))) continue;

      var params = {};
      for(var g in route.regex.groups) {
        params[g] = routeMatch[route.regex.groups[g] + 1];
      }

      return { route: route, params: params };
    }

    return;
  };

  this.registerRoute = function(method, route, handler, options) {
    const filteredMethod = String(method).toLowerCase();

    // Refuse an unknown method instead of pushing into a table that matchRoute will never read.
    if(filteredMethod in _routes === false) {
      throw new Error(`FetchRouter: unsupported method "${method}"`);
    }

    let regex;

    if(route instanceof RegExp) {
      regex = {regexp: route};
    }
    else if (typeof(route) === "string") {
      regex = this.parseRoute(route);
    }

     _routes[filteredMethod].push({regex: regex, callback: handler, options: options || {} });
  };

  this.get = function(route, handler, options) {
    this.registerRoute("get", route, handler, options);
  };

  this.post = function(route, handler, options) {
    // Was "get": a POST route landed in the GET table and could never match a POST request.
    this.registerRoute("post", route, handler, options);
  };

  this.findRoute = function(url, type, event) {
    return matchRoute(url, type, event);
  };
};

self.addEventListener('fetch', function(event) {
  const url = new URL(event.request.url);

  const match = router.findRoute(url, event.request.method, event);

  if(match) {
    // Pass this match's params directly: reading them back off the shared route object leaked the
    // most recent match into an earlier, still-running callback.
    match.route.callback(event, { params: match.params });
  }
});

export const router = new FetchRouter();
