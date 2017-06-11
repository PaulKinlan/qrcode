/*!
 *
 *  QR Code scanner.
 *  Copyright 2015 Google Inc. All rights reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *    https://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR COND5ITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License
 *
 */
(function() {
  'use strict';

  var QRCodeCamera = function(element) {
    // Controls the Camera and the QRCode Module

    var cameraManager = new CameraManager('camera');
    var qrCodeManager = new QRCodeManager('qrcode');
    var processingFrame = false;

    cameraManager.onframe = function(context) {
      // There is a frame in the camera, what should we do with it?
      if(processingFrame == false) {
        processingFrame = true;
        var detectedQRCode = qrCodeManager.detectQRCode(context, function(url) {
          if(url !== undefined) {
            if(ga) { ga('send', 'event', 'urlfound'); }
            qrCodeManager.showDialog(url);
          }
          processingFrame = false;
        });
      }
    };
  };

  var QRCodeCallbackController = function(element) {
    var callbackName = element.querySelector(".QRCodeSuccessDialogCallback-name");
    var callbackDomain = element.querySelector(".QRCodeSuccessDialogCallback-domain");
    var callbackUrl;
    var qrcodeUrl;
    var isValidCallbackUrl = false;

    this.setQrCode = function(normalizedUrl) {
      qrcodeUrl = normalizedUrl;
    };

    var init = function() {
      callbackUrl = getCallbackURL();
      isValidCallbackUrl = validateCallbackURL(callbackUrl);

      if(callbackUrl) {
        element.addEventListener('click', function() {
          // Maybe we should warn if the callback URL is invalid
          callbackUrl.searchParams.set('qrcode', qrcodeUrl);
          location = callbackUrl;
        });

        element.classList.remove('hidden');
        if(isValidCallbackUrl == false) {
          callbackDomain.classList.add('invalid');
        }
        callbackDomain.innerText = callbackUrl.origin;
      }
    };

    var validateCallbackURL = function(callbackUrl) {
      if(document.referrer === "") return false;

      var referrer = new URL(document.referrer);

      return (callbackUrl !== undefined
        && referrer.origin == callbackUrl.origin
        && referrer.scheme !== 'https');
    };

    var getCallbackURL = function() {
      var url = new URL(window.location);
      if('searchParams' in url && url.searchParams.has('x-callback-url')) {
        // If the API is not supported, we should shim it.  But right now
        // let's just get it working
        return new URL(url.searchParams.get('x-callback-url'));
      }
    };

    init();
  }

  var normalizeUrl = function(url) {
    // Remove leading/trailing white space from protocol, normalize casing, etc.
    var normalized;
    try {
      normalized = new URL(url);
    } catch (exception) {
      return;
    }
    return normalized;
  };

  var QRCodeManager = function(element) {
    var root = document.getElementById(element);
    var canvas = document.getElementById("qr-canvas");
    var qrcodeData = root.querySelector(".QRCodeSuccessDialog-data");
    var qrcodeNavigate = root.querySelector(".QRCodeSuccessDialog-navigate");
    var qrcodeIgnore = root.querySelector(".QRCodeSuccessDialog-ignore");
    var qrcodeShare = root.querySelector(".QRCodeSuccessDialog-share");
    var qrcodeCallback = root.querySelector(".QRCodeSuccessDialog-callback");

    var client = new QRClient();
    var callbackController = new QRCodeCallbackController(qrcodeCallback);

    var self = this;

    this.currentUrl = undefined;

    if(navigator.share) {
      // Sharing is supported so let's make the UI visible
      qrcodeShare.classList.remove('hidden');
    }

    this.detectQRCode = function(context, callback) {
      callback = callback || function() {};

      client.decode(context, function(result) {
        var normalizedUrl;
        if(result !== undefined) {
          normalizedUrl = normalizeUrl(result);
          self.currentUrl = normalizedUrl;
        }
        callback(normalizedUrl);
      });
    };

    this.showDialog = function(normalizedUrl) {
      root.style.display = 'block';
      qrcodeData.innerText = normalizedUrl;
      callbackController.setQrCode(normalizedUrl);
    };

    this.closeDialog = function() {
      root.style.display = 'none';
      self.qrcodeNavigate = "";
      qrcodeData.innerText = "";
    };

    qrcodeIgnore.addEventListener("click", function() {
      this.closeDialog();
    }.bind(this));

    qrcodeShare.addEventListener("click", function() {
      if(navigator.share) {
        navigator.share({
          title: this.currentUrl,
          text: this.currentUrl,
          url: this.currentUrl
        }).then(function() {
          self.closeDialog();
        }).catch(function() {
          self.closeDialog();
        })
      }

    }.bind(this));


    qrcodeNavigate.addEventListener("click", function() {
      // I really want this to be a link.

      // Prevent XSS.
      // Note: there's no need to check for `jAvAsCrIpT:` etc. as
      // `normalizeUrl` already took care of that.
      if (this.currentUrl.protocol === "javascript:") {
        console.log("XSS prevented!");
        return;
      }
      window.location = this.currentUrl;
      this.closeDialog();
    }.bind(this));

  };

  var WebCamManager = function(cameraRoot) {
    var cameraToggleInput = cameraRoot.querySelector('.Camera-toggle-input');
    var cameraToggle = cameraRoot.querySelector('.Camera-toggle');
    var cameraVideo = cameraRoot.querySelector('.Camera-video');
    var videoRect = cameraVideo.getBoundingClientRect();
    var videoElementScale = ( window.innerHeight / videoRect.height);

    cameraVideo.addEventListener('loadeddata', function() {
      var height = window.innerHeight;
      var width = window.innerWidth;

      var heightRatio = cameraVideo.videoHeight / height;
      var widthRatio = cameraVideo.videoWidth / width;

      var scaleFactor = 1;

      // if the video is physcially smaller than the screen
      if(height > cameraVideo.videoHeight && width > cameraVideo.videoWidth) {
        scaleFactor = 1 / Math.max(heightRatio, widthRatio);
      }
      else {
        scaleFactor = 1 / Math.min(heightRatio, widthRatio);
      }

      cameraVideo.style.transform = 'translate(-50%, -50%) scale(' + scaleFactor + ')';
    });

    var source = new CameraSource(cameraVideo);

    this.getDimensions = function() {
      return source.getDimensions();
    };

    source.getCameras(function(cameras) {
      if(cameras.length == 1) {
        cameraToggle.style.display="none";
      }

      // Set the source
      source.setCamera(0);
    });

    source.onframeready = function(imageData) {
      // The Source has some data, we need to push it the controller.
      this.onframeready(imageData);
    }.bind(this);

    var toggleFacingState = function(camera) {
      var facing = camera.facing ? camera.facing : 'user';
      cameraRoot.classList.remove('Camera--facing-environment');
      cameraRoot.classList.remove('Camera--facing-user');
      cameraRoot.classList.add('Camera--facing-' + facing);
    };

    cameraToggleInput.addEventListener('change', function(e) {
      // this is the input element, not the control
      var cameraIdx = 0;

      if(e.target.checked === true) {
        cameraIdx = 1;
      }
      source.stop();
      source.setCamera(cameraIdx);
    });

    // When using the web cam, we need to turn it off when we aren't using it
    document.addEventListener('visibilitychange', function(e) {
      if(document.visibilityState === 'hidden') {
        // Disconnect the camera.
        source.stop();
      }
      else {
        var cameraIdx = 0;

        if(this.checked === true) {
          cameraIdx = 1;
        }
        source.setCamera(cameraIdx);
      }
    });

  };

  var CameraFallbackManager = function(element) {
    var uploadForm = element.querySelector('.CameraFallback-form');
    var inputElement = element.querySelector('.CameraFallback-input');
    var image = new Image();

    this.onframeready = function() {};

    // We don't need to upload anything.
    uploadForm.addEventListener('submit', function(e) {
      e.preventDefault();
      return false;
    });

    inputElement.addEventListener('change', function(e) {
      var objectURL = URL.createObjectURL(e.target.files[0]);
      image.onload = function() {
        this.onframeready(image);
        URL.revokeObjectURL(objectURL);
      }.bind(this);

      image.src = objectURL;

    }.bind(this));

    this.getDimensions = function() {
      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
        shouldLayout: false
      };
    };
  };

  var CameraSource = function(videoElement) {
    var stream;
    var animationFrameId;
    var cameras = [];
    var self = this;
    var gUM = (navigator.getUserMedia ||
               navigator.webkitGetUserMedia ||
               navigator.mozGetUserMedia ||
               navigator.msGetUserMedia || null);

    this.stop = function() {
      if(stream) {
        stream.getTracks().forEach(function(t) { t.stop(); } );
      }
    };

    this.getDimensions = function() {      
      return {
        width: videoElement.videoWidth,
        height: videoElement.videoHeight,
        shouldLayout: true
      };
    };

    this.getCameras = function(cb) {
      cb = cb || function() {};

      if('enumerateDevices' in navigator.mediaDevices) {
         navigator.mediaDevices.enumerateDevices()
          .then(function(sources) {
            return sources.filter(function(source) {
              return source.kind == 'videoinput'
            });
          })
          .then(function(sources) {
            sources.forEach(function(source) {
              if(source.label.indexOf('facing back') >= 0) {
                // move front facing to the front.
                cameras.unshift(source);
              }
              else {
                cameras.push(source);
              }
            });

            cb(cameras);

            return cameras;
          })
          .catch(error => {
            console.error("Enumeration Error", error); 
          });
      }
      else if('getSources' in MediaStreamTrack) {
        MediaStreamTrack.getSources(function(sources) {

          for(var i = 0; i < sources.length; i++) {
            var source = sources[i];
            if(source.kind === 'video') {

              if(source.facing === 'environment') {
                // cameras facing the environment are pushed to the front of the page
                cameras.unshift(source);
              }
              else {
                cameras.push(source);
              }
            }
          }
          cb(cameras);
        });
      }
      else {
        // We can't pick the correct camera because the API doesn't support it.
        cb(cameras);
      }
    };

    this.setCamera = function(idx) {
      var params;
      var videoSource = cameras[idx];
      
      //Cancel any pending frame analysis
      cancelAnimationFrame(animationFrameId);

      if(videoSource === undefined && cameras.length == 0) {
        // Because we have no source information, have to assume it user facing.
        params = { video: true, audio: false };
      }
      else {
        params = { video: { deviceId: { exact: videoSource.deviceId || videoSource.id } }, audio: false };
      }

      gUM.call(navigator, params, function(cameraStream) {
        stream = cameraStream;

        videoElement.addEventListener('loadeddata', function(e) {
          var onframe = function() {
            if(videoElement.videoWidth > 0) self.onframeready(videoElement);
            animationFrameId = requestAnimationFrame(onframe);
          };

          animationFrameId = requestAnimationFrame(onframe);
        });

        videoElement.srcObject = stream;
        videoElement.load();
        videoElement.play()
          .catch(error => {
            console.error("Auto Play Error", error);
          });
      }, console.error);
    };
  };


  var CameraManager = function(element) {
    // The camera gets a video stream, and adds it to a canvas.
    // The canvas is analysed but also displayed to the user.
    // The video is never show
    var self = this;
    var debug = false;
    var gUM = (navigator.getUserMedia ||
                       navigator.webkitGetUserMedia ||
                       navigator.mozGetUserMedia ||
                       navigator.msGetUserMedia || null);

    if(location.hash == "#nogum") gUM = null;
    if(location.hash == "#canvasdebug") debug = true;

    var root = document.getElementById(element);
    var cameraRoot;
    var sourceManager;

    // Where are we getting the data from
    if(gUM === null) {
      cameraRoot = root.querySelector('.CameraFallback');
      sourceManager = new CameraFallbackManager(cameraRoot);
    }
    else {
      cameraRoot = root.querySelector('.CameraRealtime');
      sourceManager = new WebCamManager(cameraRoot);
    }

    if(debug) {
      root.classList.add('debug');
    }

    cameraRoot.classList.remove('hidden');

    var cameraCanvas = root.querySelector('.Camera-display');
    var cameraOverlay = root.querySelector('.Camera-overlay');
    var context = cameraCanvas.getContext('2d');

    // Variables
    var wHeight;
    var wWidth;
    var dWidth;
    var dHeight;
    var dx = 0;
    var dy = 0;

    var sx = 0;
    var sy = 0;
    var sHeight;
    var sWidth;
    var scaleX;
    var scaleY;
    var scaleFactor = 1;

    var cameras = [];
    var coordinatesHaveChanged = true;
    var prevCoordinates = 0;

    var overlayCoords = { x:0, y: 0, width: cameraCanvas.width, height: cameraCanvas.height };
    
    sourceManager.onframeready = function(frameData) {
      setupVariables();
      // Work out which part of the video to capture and apply to canvas.
      context.drawImage(frameData, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);

      drawOverlay(wWidth, wHeight);

      if(self.onframe) self.onframe(context);

      coordinatesHaveChanged = false;
    };

    var getOverlayDimensions = function(width, height) {
      var minLength = Math.min(width, height);
      var paddingHeight = (height + 64 - minLength) / 2;
      var paddingWidth = (width + 64 - minLength) / 2;

      return {
        minLength: minLength,
        width: minLength - 64,
        height: minLength - 64,
        paddingHeight: paddingHeight,
        paddingWidth: paddingWidth
      };
    }

    var drawOverlay = function(width, height) {

      var overalyDimensions = getOverlayDimensions(width, height);

      var boxHeightSize = height / 2;
      var boxWidthSize = width / 2;
      var boxPaddingHeightSize = overalyDimensions.paddingHeight;
      var boxPaddingWidthSize = overalyDimensions.paddingWidth;

      if(coordinatesHaveChanged) {
        cameraOverlay.style.borderTopWidth = boxPaddingHeightSize + "px";
        cameraOverlay.style.borderLeftWidth = boxPaddingWidthSize + "px";
        cameraOverlay.style.borderRightWidth = boxPaddingWidthSize + "px";
        cameraOverlay.style.borderBottomWidth = boxPaddingHeightSize + "px";

        overlayCoords.x = boxWidthSize;
        overlayCoords.y = boxHeightSize;
        overlayCoords.width = width;
        overlayCoords.height = height;
        coordinatesHaveChanged = false;
      }
    };

    var setupVariables = function(e) {
      var sourceDimensions = sourceManager.getDimensions();

      if(cameraCanvas.width == window.innerWidth && sourceDimensions.shouldLayout)
        return;

      wHeight = window.innerHeight;
      wWidth = window.innerWidth;

      // Video source size
      var sourceHeight = sourceDimensions.height;
      var sourceWidth = sourceDimensions.width;

      // Target size in device co-ordinats
      var overlaySize = getOverlayDimensions(wWidth, wHeight);

      // The mapping value from window to source scale
      scaleX = (sourceWidth / wWidth );
      scaleY = (sourceHeight / wHeight);

      // if the video is physcially smaller than the screen
      if(wHeight > sourceHeight && wWidth > sourceWidth) {
        scaleFactor = 1 / Math.max(scaleY, scaleX);
      }
      else {
        scaleFactor = 1 / Math.min(scaleY, scaleX);
      }

      // The canvas should be the same size as the video mapping 1:1
      dHeight = dWidth = overlaySize.width / scaleFactor ;

      // The width of the canvas should be the size of the overlay in video size.
      if(dWidth == 0) debugger;
      cameraCanvas.width =  dWidth;
      cameraCanvas.height = dWidth;

      dx = 0;
      dy = 0;

      sx = 0;
      sy = 0;

      // Trim the left
      sx = ((sourceWidth / 2) - (dWidth / 2));
      sy = ((sourceHeight / 2) - (dHeight / 2));

      // Trim the right.
      sWidth = dWidth;
      sHeight = dHeight;

      return (sourceWidth > 0);
    };

    window.addEventListener('resize', function(e) {
      coordinatesHaveChanged = true;
      setupVariables();
    }.bind(this));
  };

  window.addEventListener('load', function() {
    var camera = new QRCodeCamera();
  });
})();

window.addEventListener('unhandledrejection', function(event) {
  console.error('Unhandled rejection (promise: ', event.promise, ', reason: ', event.reason, ').');
});
