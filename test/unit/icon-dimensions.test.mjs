// Unit tier: pins explicit intrinsic dimensions on the decorative icons that sit inside the
// camera chrome (bead qrcode-wbb). Each of these <img>s had no box until its SVG was fetched
// and decoded, so the only size came from the SVG's own width/height attributes. Today the
// shift is contained by fixed-size CSS wrappers, but that containment is incidental: reusing
// the markup outside those wrappers, or resizing them, turns it into an unbounded reflow.
// Declaring width/height on the <img> reserves the box up front, independent of CSS.
// Parses the shipped files and fails if any of the three loses its declaration, or if the
// asset it points at is no longer 24x24 (the declared box must match the real intrinsic size).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(join(root, 'app', 'index.html'), 'utf8');

/**
 * Every <img> in index.html, keyed by src, with its attributes parsed.
 * @returns {Map<string, Map<string, string>>}
 */
function imagesBySrc(markup) {
  const images = new Map();
  for (const tag of markup.match(/<img\b[^>]*>/g) ?? []) {
    const attrs = new Map();
    for (const [, name, value] of tag.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) {
      attrs.set(name.toLowerCase(), value);
    }
    const src = attrs.get('src');
    if (src) images.set(src, attrs);
  }
  return images;
}

const icons = [
  { src: '/images/help_outline-24px.svg', what: 'About FAB icon' },
  { src: '/images/ic_camera_front_24px.svg', what: 'camera toggle (front)' },
  { src: '/images/ic_camera_rear_24px.svg', what: 'camera toggle (rear)' },
];

for (const { src, what } of icons) {
  test(`${what} declares width and height so its box is reserved before the SVG decodes`, () => {
    const attrs = imagesBySrc(html).get(src);
    assert.ok(attrs, `expected an <img src="${src}"> in app/index.html`);
    assert.equal(attrs.get('width'), '24', `${what} must declare width="24"`);
    assert.equal(attrs.get('height'), '24', `${what} must declare height="24"`);
  });
}

for (const { src, what } of icons) {
  test(`${what} declares the size its SVG actually has`, () => {
    const svg = readFileSync(join(root, 'app', ...src.split('/').slice(1)), 'utf8');
    const root_tag = svg.match(/<svg\b[^>]*>/)?.[0] ?? '';
    const width = root_tag.match(/\bwidth="([^"]*)"/)?.[1];
    const height = root_tag.match(/\bheight="([^"]*)"/)?.[1];
    assert.equal(width, '24', `${src} must stay 24px wide, or index.html must be updated`);
    assert.equal(height, '24', `${src} must stay 24px tall, or index.html must be updated`);
  });
}
