import * as Comlink from './comlink.js';
import {qrcode} from './qrcode.js';

// Use the polyfil
let detectUrl = async (width, height, imageData) => {
  try {
    return qrcode.decode(width, height, imageData);
  } catch (err) {
    // the library throws an exception when there are no qrcodes.
    return;
  }
};

Comlink.expose({detectUrl}, self);
