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
    'databr.js');


self.onmessage = function(e) {
  var data = e.data;

  try {
    var width = data.width;
    var height = data.height;
    var result = qrcode.decode(width, height, data);
    postMessage(result);
  } 
  catch(e) {
    postMessage(undefined);
  }

};