const FetchRouter = function() {
  const _routes = {
    get: [],
    post: []   
  };
  
  this.parseRoute = function(path) {
    this.parseGroups = function(loc) {
      var nameRegexp = new RegExp(":([^/.\\\\]+)", "g"); 
      var newRegexp = "" + loc;
      var groups = {};
      var matches = null;
      var i = 0;

      // Find the places to edit.
      while(matches = nameRegexp.exec(loc)) {
        groups[matches[1]] = i++;
        newRegexp = newRegexp.replace(matches[0], "([^/.\\\\]+)"); 
      }

      newRegexp += "$"; // Only do a full string match

      return { "groups" : groups, "regexp": new RegExp(newRegexp)};
    };
      
    return this.parseGroups(path); 
  };

  var matchRoute = function(url, type) {
    var route = null;
    const filteredType = type.toLowerCase();
    
    if(filteredType in _routes === false) { 
      return ; // Reject
    }

    for(let i = 0; route = _routes[filteredType][i]; i ++) {
      const urlMatchProperty = route.options.urlMatchProperty
      const urlPart = (urlMatchProperty in url) ? url[urlMatchProperty] : url.toString();
      const routeMatch = route.regex.regexp.exec(urlPart);

      if(!!routeMatch == false) continue;
      
      var params = {};
      for(var g in route.regex.groups) {
        var group = route.regex.groups[g];
        params[g] = routeMatch[group + 1];
      }
      
      route.params = params;
      
      return route;
    }

    return;
  };

  this.registerRoute = function(method, route, handler, options) {
    let regex;

    if(route instanceof RegExp) {
      regex = {regexp: route};
    }
    else if (typeof(route) === "string") {
      regex = this.parseRoute(route);
    }

     _routes[method].push({regex: regex, callback: handler, options: options || {} });
  };

  this.get = function(route, handler, options) {
    this.registerRoute("get", route, handler, options);
  };

  this.post = function(route, handler, options) {
    this.registerRoute("get", route, handler, options);
  };

  this.findRoute = function(url, type) {
    return matchRoute(url, type);
  };
};

const router = new FetchRouter();

self.addEventListener('fetch', function(event) {
  const request = event.request;
  const url = new URL(event.request.url);
  const method = event.request.method;

  const executor = router.findRoute(url, method);
  
  if(executor) {
    executor.callback(event, { params: executor.params });
  }
});

/*
  thoughts: 
    want to intercept scheme origin port path
    want to be able just to manage the requests for path
*/