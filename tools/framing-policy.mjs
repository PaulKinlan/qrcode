// Header field values may preserve a host's capitalization rather than the config's spelling.
export function hasCspDirective(csp, required) {
  return csp?.split(';').some((part) =>
    part.trim().replace(/^[^\s]+/, (name) => name.toLowerCase()) === required) ?? false;
}

export function hasFrameAncestorsNone(csp) {
  return hasCspDirective(csp, "frame-ancestors 'none'");
}

export function hasXFrameOptionsDeny(value) {
  return value?.trim().toUpperCase() === 'DENY';
}
