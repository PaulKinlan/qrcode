// Unit tier: every decorative icon in app/index.html must declare its own box (bead qrcode-wbb).
//
// The icons were sized only by the SVG's own width/height attributes, so an <img> had no box until
// the file was fetched and decoded. Today the shift is contained by fixed-size parents (the About
// FAB, the round flip button, the upload label), but that containment is incidental: reusing this
// markup outside those containers - or resizing them - turns a 0x0 image box into an unbounded
// reflow. Declaring width/height makes the space reserved before the request, which is what the
// layout needs and what an icon should say about itself.
//
// The rule is stated over the document rather than over three specific lines, so a new icon that
// forgets its dimensions fails here instead of appearing as layout noise later. Pure file read:
// no DOM, no browser, no network - fast tier.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const indexHtml = readFileSync(join(root, 'app', 'index.html'), 'utf8');
const cameraCss = readFileSync(join(root, 'app', 'styles', 'camera.css'), 'utf8');

/** Every <img ...> tag in the document, as its attribute text. */
const imgTags = [...indexHtml.matchAll(/<img\b([^>]*)>/gi)].map((match) => match[1]);

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? match[1] : null;
}

test('the document actually contains the icons this test is about', () => {
  // A rename or a template change must not quietly empty this suite.
  assert.ok(imgTags.length >= 4, `expected at least 4 <img> tags in app/index.html, found ${imgTags.length}`);
});

test('every static icon declares width and height so its box is reserved before the fetch', () => {
  // <img class="CameraFallback-image"> has no src at all: the decode path assigns the captured
  // frame to it, so there is nothing to reserve and it is deliberately exempt.
  const staticIcons = imgTags.filter((tag) => attr(tag, 'src') !== null);
  assert.ok(staticIcons.length >= 4, 'expected the static icons to still be in the document');

  for (const tag of staticIcons) {
    const src = attr(tag, 'src');
    const width = attr(tag, 'width');
    const height = attr(tag, 'height');
    assert.ok(width, `${src} must declare a width attribute (bead qrcode-wbb)`);
    assert.ok(height, `${src} must declare a height attribute (bead qrcode-wbb)`);
    assert.match(width, /^\d+$/, `${src} width must be an integer attribute, got ${JSON.stringify(width)}`);
    assert.match(height, /^\d+$/, `${src} height must be an integer attribute, got ${JSON.stringify(height)}`);
  }
});

test('the camera-flip checkbox has a name and its two icons are explicitly decorative', () => {
  const input = indexHtml.match(/<input\b[^>]*\bid=["']checkbox-1["'][^>]*>/i)?.[0];
  assert.ok(input, 'camera-flip checkbox must exist');
  assert.match(input, /\baria-label=["']Flip camera["']/i, 'camera-flip checkbox must expose a name');

  for (const iconClass of ['front', 'rear']) {
    const icon = imgTags.find((tag) => attr(tag, 'class') === iconClass);
    assert.ok(icon, `camera-flip ${iconClass} icon must exist`);
    assert.equal(attr(icon, 'alt'), '', `camera-flip ${iconClass} icon must have explicit alt=""`);
  }
});

test('the upload input is named, keyboard reachable, and its visible label shows focus', () => {
  const input = indexHtml.match(/<input\b[^>]*\bid=["']qrcode-input["'][^>]*>/i)?.[0];
  assert.ok(input, 'file-upload input must exist');
  assert.match(input, /\baria-label=["']Upload a QR code image["']/i);
  const inputRule = cameraCss.match(/\.Camera \.CameraFallback \.CameraFallback-input\s*\{([^}]*)\}/)?.[1];
  assert.ok(inputRule, 'file-upload input must have a CSS rule');
  assert.doesNotMatch(inputRule, /visibility:\s*hidden|display:\s*none/, 'upload input must remain keyboard reachable');
  assert.match(cameraCss, /\.Camera \.CameraFallback \.CameraFallback-input:focus-visible \+ label\s*\{[^}]*box-shadow:\s*inset\s+0\s+0\s+0\s+3px\s+#fff;/);
});

test('every image explicitly declares alt, including the decorative upload icon and dynamic preview', () => {
  for (const tag of imgTags) {
    assert.notEqual(attr(tag, 'alt'), null, `<img> must declare alt: ${tag.trim()}`);
  }
});

test('the declared size is the icons\' own 24x24 grid, and they stay decorative', () => {
  for (const tag of imgTags.filter((entry) => attr(entry, 'src') !== null)) {
    const src = attr(tag, 'src');
    assert.equal(attr(tag, 'width'), '24', `${src} is a 24x24 icon; declare width="24"`);
    assert.equal(attr(tag, 'height'), '24', `${src} is a 24x24 icon; declare height="24"`);
    // The About button carries the accessible name and the flip/upload icons are decorative, so an
    // empty alt is correct here; a non-empty alt would announce duplicate text.
    assert.equal(attr(tag, 'alt'), '', `${src} must stay decorative (alt="")`);
  }
});
