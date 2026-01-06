// Import all jsqrcode modules in the correct order
// These files build up the qrcode object as a global
import './a_gf256.js';
import './a_qrcode.js';
import './alignpat.js';
import './bitmat.js';
import './bmparser.js';
import './datablock.js';
import './databr.js';
import './datamask.js';
import './decoder.js';
import './detector.js';
import './errorlevel.js';
import './findpat.js';
import './formatinf.js';
import './gf256poly.js';
import './grid.js';
import './rsdecoder.js';
import './version.js';

// The qrcode object is created in a_qrcode.js as a global
// We need to access it from the global scope
export const qrcode = globalThis.qrcode || window.qrcode;
