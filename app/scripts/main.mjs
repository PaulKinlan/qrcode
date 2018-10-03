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

import { decode } from './qrclient.js'

(function() {
  'use strict';

  var QRCodeCamera = function(element) {
    // Controls the Camera and the QRCode Module

    var cameraManager = new CameraManager('camera');
    var qrCodeManager = new QRCodeManager('qrcode');
    var qrCodeHelpManager = new QRCodeHelpManager('about');
    var helpButton = document.querySelector('.about');

    helpButton.onclick = function() {
      qrCodeHelpManager.showDialog();
    };

    var processingFrame = false;

    cameraManager.onframe = async function(context) {
      // There is a frame in the camera, what should we do with it?
      if(processingFrame == false) {
        processingFrame = true;
        let url = await qrCodeManager.detectQRCode(context);
        if(url !== undefined) {
          if(ga) { ga('send', 'event', 'urlfound'); }
          qrCodeManager.showDialog(url);
        }
        processingFrame = false;
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
  };

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
    var qrcodeData = root.querySelector(".QRCodeSuccessDialog-data");
    var qrcodeNavigate = root.querySelector(".QRCodeSuccessDialog-navigate");
    var qrcodeIgnore = root.querySelector(".QRCodeSuccessDialog-ignore");
    var qrcodeShare = root.querySelector(".QRCodeSuccessDialog-share");
    var qrcodeCallback = root.querySelector(".QRCodeSuccessDialog-callback");
    var callbackController = new QRCodeCallbackController(qrcodeCallback);

    var self = this;

    this.currentUrl = undefined;

    if(navigator.share) {
      // Sharing is supported so let's make the UI visible
      qrcodeShare.classList.remove('hidden');
    }

    this.detectQRCode = async function(context) {
      let result = await decode(context);
      let normalizedUrl;
      if(result !== undefined) {
        normalizedUrl = normalizeUrl(result);
        self.currentUrl = normalizedUrl;
      }
      return normalizedUrl;
    };

    this.showDialog = function(normalizedUrl) {
      root.style.display = 'block';
      qrcodeData.innerText = normalizedUrl;
      callbackController.setQrCode(normalizedUrl);
    };

    this.closeDialog = function() {
      root.style.display = 'none';
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

  let QRCodeHelpManager = function(element) {
    let root = document.getElementById(element);
    let qrhelpClose = root.querySelector(".QRCodeAboutDialog-close");

    this.showDialog = function() {
      root.style.display = 'block';
    };

    this.closeDialog = function() {
      root.style.display = 'none';
    };

    qrhelpClose.addEventListener("click", function() {
      this.closeDialog();
    }.bind(this));
  };

  var WebCamManager = function(cameraRoot) {
    var width, height;
    var cameraToggleInput = cameraRoot.querySelector('.Camera-toggle-input');
    var cameraToggle = cameraRoot.querySelector('.Camera-toggle');
    var cameraVideo = cameraRoot.querySelector('.Camera-video');

    this.resize = function(w, h) {
      if (w && h) {
        height = h;
        width = w;
      }

      var videoDimensions = this.getDimensions();
      cameraVideo.style.transform = 'translate(-50%, -50%) scale(' + videoDimensions.scaleFactor + ')';
    }.bind(this);

    var source = new CameraSource(cameraVideo);

    this.getDimensions = function() {
      var dimensions = source.getDimensions();
      var heightRatio = dimensions.height / height;
      var widthRatio = dimensions.width / width;
      var scaleFactor = 1 / Math.min(heightRatio, widthRatio);
      dimensions.scaleFactor = Number.isFinite(scaleFactor)? scaleFactor : 1;
      return dimensions;
    };

    // this method can be overwritten from outside
    this.onDimensionsChanged = function(){};

    source.onDimensionsChanged = function() {
      this.onDimensionsChanged();
      this.resize();
    }.bind(this);

    source.getCameras(function(cameras) {
      if(cameras.length <= 1) {
        cameraToggle.style.display="none";
      }

      // Set the source
      source.setCamera(0);
    });

    source.onframeready = function(imageData) {
      // The Source has some data, we need to push it the controller.
      this.onframeready(imageData);
    }.bind(this);

    cameraToggleInput.addEventListener('change', function(e) {
      // this is the input element, not the control
      var cameraIdx = 0;

      if(e.target.checked === true) {
        cameraIdx = 1;
      }
      source.stop();
      source.setCamera(cameraIdx);
    });

    this.stop = function() {
      source.stop();
    };

    this.start = function() {
      var cameraIdx = 0;
      if(cameraToggleInput.checked === true) {
        cameraIdx = 1;
      }
      source.setCamera(cameraIdx);
    };

    // When using the web cam, we need to turn it off when we aren't using it
    document.addEventListener('visibilitychange', function() {
      if(document.visibilityState === 'hidden') {
        // Disconnect the camera.
        this.stop();
      }
      else {
        this.start();
      }
    }.bind(this));

  };

  var CameraFallbackManager = function(element) {
    var uploadForm = element.querySelector('.CameraFallback-form');
    var inputElement = element.querySelector('.CameraFallback-input');
    var image = new Image();

    // these methods can be overwritten from outside
    this.onframeready = function() {};
    this.onDimensionsChanged = function(){};

    // these methods are noop for the fallback
    this.resize = function() {};

    // We don't need to upload anything.
    uploadForm.addEventListener('submit', function(e) {
      e.preventDefault();
      return false;
    });

    inputElement.addEventListener('change', function(e) {
      var objectURL = URL.createObjectURL(e.target.files[0]);
      image.onload = function() {
        this.onDimensionsChanged();
        this.onframeready(image);
        URL.revokeObjectURL(objectURL);
      }.bind(this);

      image.src = objectURL;

    }.bind(this));

    this.getDimensions = function() {
      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
        scaleFactor: 1
      };
    };
  };

  var CameraSource = function(videoElement) {
    var stream;
    var animationFrameId;
    var cameras = null;
    var self = this;
    var gUM = (navigator.getUserMedia ||
               navigator.webkitGetUserMedia ||
               navigator.mozGetUserMedia ||
               navigator.msGetUserMedia || null);
    var currentCamera = -1;

    this.stop = function() {
      currentCamera = -1;
      if(stream) {
        stream.getTracks().forEach(function(t) { t.stop(); } );
      }
    };

    this.getDimensions = function() {      
      return {
        width: videoElement.videoWidth,
        height: videoElement.videoHeight
      };
    };

    // this method can be overwritten from outside
    this.onDimensionsChanged = function(){};

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
            cameras = [];
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
          })
          .catch(error => {
            console.error("Enumeration Error", error); 
          });
      }
      else if('getSources' in MediaStreamTrack) {
        MediaStreamTrack.getSources(function(sources) {
          cameras = [];
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
        cameras = [];
        cb(cameras);
      }
    };

    this.setCamera = function(idx) {
      if (currentCamera === idx || cameras === null) {
        return;
      }
      currentCamera = idx;
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
            if (currentCamera !== -1) {
              // if the camera is still running
              animationFrameId = requestAnimationFrame(onframe);
            }
          };

          self.onDimensionsChanged();

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

    // destination position
    var dWidth;
    var dHeight;
    // source position
    var sx = 0;
    var sy = 0;
    var sHeight;
    var sWidth;

    var cameras = [];
    var prevCoordinates = 0;
    
    sourceManager.onframeready = function(frameData) {
      // Work out which part of the video to capture and apply to canvas.
      context.drawImage(frameData, sx, sy, sWidth, sHeight, 0, 0, dWidth, dHeight);
      if(self.onframe) self.onframe(context);
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
    };

    var drawOverlay = function(overlayDimensions) {
      var boxPaddingHeightSize = overlayDimensions.paddingHeight;
      var boxPaddingWidthSize = overlayDimensions.paddingWidth;
      cameraOverlay.style.borderTopWidth = boxPaddingHeightSize + "px";
      cameraOverlay.style.borderLeftWidth = boxPaddingWidthSize + "px";
      cameraOverlay.style.borderRightWidth = boxPaddingWidthSize + "px";
      cameraOverlay.style.borderBottomWidth = boxPaddingHeightSize + "px";
    };

    this.resize = function(containerWidth, containerHeight) {
      if (!containerWidth || !containerHeight) {
        containerWidth = root.parentNode.offsetWidth;
        containerHeight = root.parentNode.offsetHeight;
      }
      sourceManager.resize(containerWidth, containerHeight);
      var sourceDimensions = sourceManager.getDimensions();

      // Video source size
      var sourceHeight = sourceDimensions.height;
      var sourceWidth = sourceDimensions.width;

      // Target size in device co-ordinats
      var overlaySize = getOverlayDimensions(containerWidth, containerHeight);

      // The canvas should be the same size as the video mapping 1:1
      dHeight = dWidth = overlaySize.width / sourceDimensions.scaleFactor ;

      // The width of the canvas should be the size of the overlay in video size.
      if(dWidth == 0) debugger;
      cameraCanvas.width =  dWidth;
      cameraCanvas.height = dWidth;

      // Trim the left / top
      sx = ((sourceWidth / 2) - (dWidth / 2));
      sy = ((sourceHeight / 2) - (dHeight / 2));

      // Trim the right / bottom
      sWidth = dWidth;
      sHeight = dHeight;

      drawOverlay(overlaySize);
    };

    window.addEventListener('resize', this.resize);
    sourceManager.onDimensionsChanged = this.resize;
    this.resize();
  };

  // Start the camera without wating for all resources to load.
  var camera = new QRCodeCamera();
})();

window.addEventListener('unhandledrejection', function(event) {
  console.error('Unhandled rejection (promise: ', event.promise, ', reason: ', event.reason, ').');
});
