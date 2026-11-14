import assert from 'node:assert/strict';
import { stripCssComments } from './bundled-stylesheets.mjs';

/** Read the shipped palette, ignoring examples in comments. */
export function cssTokens(css) {
  return Object.fromEntries(
    [...stripCssComments(css).matchAll(/(--wsk-[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)]
      .map((match) => [match[1], match[2]])
  );
}

export function resolveColor(value, tokens = {}) {
  const token = value.match(/^var\((--wsk-[a-z0-9-]+)\)$/);
  if (token) {
    assert.ok(tokens[token[1]], `${token[1]} must be declared in the palette`);
    return tokens[token[1]];
  }
  return value;
}

export function hexToRgb(value) {
  const match = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  assert.ok(match, `expected a hex colour, got ${JSON.stringify(value)}`);
  const hex = match[1].length === 3 ? [...match[1]].map((c) => c + c).join('') : match[1];
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

/** WCAG 2.x sRGB contrast, rounded to two decimal places for the assertion message. */
export function contrast(a, b) {
  const luminance = (color) => {
    const { r, g, b } = typeof color === 'string' ? hexToRgb(color) : color;
    const channel = (value) => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}
