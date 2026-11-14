// Header field values may preserve a host's capitalization rather than the config's spelling.
export function hasFrameAncestorsNone(csp) {
  return csp?.split(';').some((part) =>
    part.trim().replace(/^[^\s]+/, (name) => name.toLowerCase()) === "frame-ancestors 'none'") ?? false;
}

export function hasXFrameOptionsDeny(value) {
  return value?.trim().toUpperCase() === 'DENY';
}
