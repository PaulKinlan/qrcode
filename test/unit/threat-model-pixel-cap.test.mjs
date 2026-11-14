// THREAT_MODEL.md describes the upload pixel cap, and `CameraFallbackManager` enforces it. Two
// landings 17 minutes apart (56656d5 corrected the document, 07f846a added the cap) left the
// document claiming no pixel cap existed, and nothing failed: the citation guard in
// threat-model-invariants.test.mjs checks numbering and citation form, never a clause against the
// code (bead qrcode-h0qr).
//
// This guard ties the documented number to the shipped constant, so changing the cap without
// changing the document is red. It reads text, so it normalises whitespace and digit separators
// first: a cosmetic reflow of either file must not fail it (docs/speed.md), only a real divergence
// should. No git, no network, no other agent's working state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MAX_UPLOAD_PIXELS } from '../../app/scripts/components/camera/CameraFallbackManager.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const doc = readFileSync(join(root, 'THREAT_MODEL.md'), 'utf8');

/** Collapse wrapping so a reflowed paragraph reads the same. */
const flow = (text) => text.replace(/\s+/g, ' ').trim();
/** Drop thousands separators so 40,000,000 and 40000000 compare equal. */
const digits = (text) => flow(text).replace(/[,_]/g, '');

const MEGAPIXELS = MAX_UPLOAD_PIXELS / 1_000_000;
const MEGAPIXEL_CAP = new RegExp(`\\b${MEGAPIXELS}\\s*(?:-\\s*)?megapixels?\\b`, 'i');

/** The raw body of "## <number>. ...", up to the next "## ". */
function sectionBody(number) {
  const lines = doc.split('\n');
  const start = lines.findIndex((line) => /^##\s+(\d+)\.\s+\S/.exec(line)?.[1] === String(number));
  assert.notEqual(start, -1, `THREAT_MODEL.md must keep a "## ${number}. ..." section`);
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    body.push(line);
  }
  return body.join('\n');
}

/** The §6 invariant list, as [{ number, text }], with wrapped continuation lines joined. */
function invariants() {
  const entries = [];
  for (const line of sectionBody(6).split('\n')) {
    const start = /^(\d+)\.\s+(\S.*)$/.exec(line);
    if (start) {
      entries.push({ number: Number(start[1]), text: start[2] });
      continue;
    }
    if (entries.length > 0 && /^\s+\S/.test(line)) entries.at(-1).text += ` ${line.trim()}`;
  }
  return entries;
}

/** §7 bullets, whitespace-flattened. */
const riskBullets = sectionBody(7)
  .split(/\n(?=- )/)
  .map(flow)
  .filter((bullet) => bullet.startsWith('- '));

const invariant11 = invariants().find((entry) => entry.number === 11);
const invariant11Text = flow(invariant11?.text ?? '');

test('the enforced pixel cap is a single positive integer', () => {
  assert.ok(Number.isInteger(MAX_UPLOAD_PIXELS) && MAX_UPLOAD_PIXELS > 0,
    'MAX_UPLOAD_PIXELS must be a positive integer number of pixels');
  assert.ok(MEGAPIXELS >= 1, 'the cap is documented in megapixels, so it must be at least 1 MP');
});

test('invariant 11 documents the cap that ships, not a missing one', () => {
  assert.ok(invariant11, 'THREAT_MODEL.md §6, invariant 11 must stay in the list');
  assert.ok(digits(invariant11Text).includes(String(MAX_UPLOAD_PIXELS)),
    `invariant 11 must state the ${MAX_UPLOAD_PIXELS}-pixel cap enforced by CameraFallbackManager`);
  assert.match(invariant11Text, MEGAPIXEL_CAP,
    `invariant 11 must state the cap in megapixels (${MEGAPIXELS} MP)`);
  // The wording must describe the check running after the image has loaded: the browser has already
  // decoded and allocated the natural dimensions by then, which is why §7 keeps its residual risk.
  assert.match(invariant11Text, /load/i,
    'invariant 11 must name the load event the pixel cap runs on');
  assert.match(invariant11Text, /\bafter\b/i,
    'invariant 11 must say the pixel cap runs after the browser decoded the image');
  assert.doesNotMatch(invariant11Text, /no pixel[- ]dimension cap|there is no pixel/i,
    'invariant 11 must not claim no pixel-dimension cap exists');
});

test('the §7 accepted risk keeps the decode-allocation risk and names the post-load cap', () => {
  const decodeRisks = riskBullets.filter((bullet) => /decode/i.test(bullet));
  assert.ok(decodeRisks.length >= 1, 'THREAT_MODEL.md §7 must keep a bullet about image decode');

  const bullet = decodeRisks.find((entry) => /10 MiB/.test(entry));
  assert.ok(bullet, 'the §7 decode bullet must still name the 10 MiB file cap');
  assert.ok(digits(bullet).includes(String(MAX_UPLOAD_PIXELS)) || MEGAPIXEL_CAP.test(bullet),
    `the §7 decode bullet must state the ${MAX_UPLOAD_PIXELS}-pixel cap`);
  assert.match(bullet, /\bafter\b/i,
    'the §7 bullet must say the pixel cap runs after the decode allocation');
  assert.match(bullet, /load/i, 'the §7 bullet must name the load event the pixel cap runs on');
  // The cap bounds post-decode work only; the bullet must not present it as closing the risk.
  assert.doesNotMatch(bullet, /no pixel[- ]dimension cap|there is no pixel|closes? the (?:residual )?risk/i,
    'the §7 bullet must not claim the pixel cap closes the risk');
  assert.match(bullet, /does not (?:remove|close|eliminate)|risk (?:remains|is still)/i,
    'the §7 bullet must say the pixel cap leaves the decode-allocation risk open');
});
