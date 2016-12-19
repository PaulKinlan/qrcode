var QRClient = function() {
  var worker = new Worker('/scripts/jsqrcode/qrworker.js');
  var barcodeDetector;
  if(BarcodeDetector)
    barcodeDetector = new BarcodeDetector();
    
  var currentCallback;

  this.decode = function(context, callback) {
    // Temporary hack because 
    if(barcodeDetector) {
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
      .catch(err => console.log(err));
    }
    else {
      // A frame has been captured.
      var imageData = context.getImageData(0, 0, dWidth, dHeight);
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