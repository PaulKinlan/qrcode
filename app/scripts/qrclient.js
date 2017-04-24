var QRClient = function() {
  var worker = new Worker('/scripts/jsqrcode/qrworker.js');
  var barcodeDetector;


  var currentCallback;

  this.decode = function(context, callback) {
    // Temporary hack because
    if(window['BarcodeDetector']) {
      barcodeDetector = new BarcodeDetector();
      barcodeDetector.detect(context.canvas)
      .then(barcodes => {
        // return the first barcode.
        if(barcodes.length > 0) {
          callback(barcodes[0].rawValue);
        }
        else {
          callback();
        }
      })
      .catch(err => {
        callback();
        console.error(err)
      });
    }
    else {
      // A frame has been captured.
      var canvas = context.canvas;
      var imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      worker.postMessage(imageData);
        currentCallback = callback;
    }
  };

  worker.onmessage = function(e) {
    if(currentCallback) {
      currentCallback(e.data);
    }
  };
 };
