var QRClient = function() {
  var worker = new Worker('/scripts/jsqrcode/qrworker.js');
  var barcodeDetector;

  var currentCallback;

  this.decode = function(context, callback) {
    // Temporary hack because
    if('BarcodeDetector' in window) {
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
      try {
        var canvas = context.canvas;
        var imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        worker.postMessage(imageData);
      }
      catch(err) {
        console.error(err);
      }
      
      currentCallback = callback;
    }
  };

  worker.onmessage = function(e) {
    if(currentCallback) {
      currentCallback(e.data);
    }
  };
 };
