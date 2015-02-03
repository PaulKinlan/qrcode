var QRClient = function() {
 	var worker = new Worker('/scripts/jsqrcode/qrworker.js');
 	var currentCallback;
 	
 	this.decode = function(imageData, callback) {
 		worker.postMessage(imageData);
    	currentCallback = callback;
 	};

 	worker.onmessage = function(e) {
 		if(currentCallback) {
 			currentCallback(e.data);
 		}
 	};
 };