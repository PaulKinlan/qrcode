importScripts('grid.js',
    'version.js',
    'detector.js',
    'formatinf.js',
    'errorlevel.js',
    'bitmat.js',
    'datablock.js',
    'bmparser.js',
    'datamask.js',
    'rsdecoder.js',
    'gf256poly.js',
    'gf256.js',
    'decoder.js',
    'qrcode.js',
    'findpat.js',
    'alignpat.js',
    'databr.js'
    );

import * as Comlink from './comlink.js';

Comlink.expose({qrcode}, self);