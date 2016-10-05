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

    cameraManager.onframe = function(imageData) {
      // There is a frame in the camera, what should we do with it?
      if(processingFrame == false) {
        processingFrame = true;
        var detectedQRCode = qrCodeManager.detectQRCode(imageData, function(url) {
          if(url !== undefined) {
            qrCodeManager.showDialog(url);
          }
          processingFrame = false;
        });
      }
    };
  };

  var QRCodeManager = function(element) {
    var root = document.getElementById(element);
    var canvas = document.getElementById("qr-canvas");
    var qrcodeData = root.querySelector(".QRCodeSuccessDialog-data");
    var qrcodeNavigate = root.querySelector(".QRCodeSuccessDialog-navigate");
    var qrcodeIgnore = root.querySelector(".QRCodeSuccessDialog-ignore");

    var client = new QRClient();

    var self = this;

    this.currentUrl = undefined;


    this.detectQRCode = function(imageData, callback) {
      callback = callback || function() {};

      client.decode(imageData, function(result) {
        if(result !== undefined) {
          self.currentUrl = result;
        }
        callback(result);
      });
    };

    this.showDialog = function(url) {
      root.style.display = 'block';
      qrcodeData.innerText = url;
    };

    this.closeDialog = function() {
      root.style.display = 'none';
      self.qrcodeNavigate = "";
      qrcodeData.innerText = "";
    };

    qrcodeIgnore.addEventListener("click", function() {
      self.closeDialog();
    }.bind(this));

    qrcodeNavigate.addEventListener("click", function() {
      // I really want this to be a link.
      window.location = this.currentUrl;
      this.closeDialog();
    }.bind(this));

  };

  var WebCamManager = function(cameraRoot) {
    var cameraToggleInput = cameraRoot.querySelector('.Camera-toggle-input');
    var cameraToggle = cameraRoot.querySelector('.Camera-toggle');
    var cameraVideo = cameraRoot.querySelector('.Camera-video');

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
        height: image.naturalHeight
      };
    };
  };

  var CameraSource = function(videoElement) {
    var stream;
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
        height: videoElement.videoHeight
      };
    };

    this.getCameras = function(cb) {
      cb = cb || function() {};

      if('getSources' in MediaStreamTrack) {
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

      if(videoSource === undefined && cameras.length == 0) {
        // Because we have no source information, have to assume it user facing.
        params = { video: true, audio: false }; 
      }
      else {
        params = { video: { optional: [{sourceId: videoSource.id}] }, audio: false };
      }
  
      gUM.call(navigator, params, function(cameraStream) {
        stream = cameraStream;
        
        videoElement.onloadeddata = function(e) {

          var onframe = function() { 
            self.onframeready(videoElement);
            requestAnimationFrame(onframe);
          };

          requestAnimationFrame(onframe);
        
          // The video is ready, and the camera captured
          if(videoSource === undefined) {
            // There is no meta data about the camera, assume user facing.
            videoSource = { 
              'facing': 'user'
            };
          }
        };

        videoElement.srcObject = stream;
        videoElement.load();
        videoElement.play();
      }, function(error) {});
    };
  };


  var CameraManager = function(element) {
    // The camera gets a video stream, and adds it to a canvas.
    // The canvas is analysed but also displayed to the user.
    // The video is never show
    var self = this;
    var gUM = (navigator.getUserMedia ||
                       navigator.webkitGetUserMedia ||
                       navigator.mozGetUserMedia ||
                       navigator.msGetUserMedia || null);

    if(location.hash == "#nogum") gUM = null;

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

    cameraRoot.classList.remove('hidden');

    var cameraCanvas = root.querySelector('.Camera-display');
    var cameraOverlay = root.querySelector('.Camera-overlay');
    var canvas = cameraCanvas.getContext('2d');

    // Variables
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
      canvas.drawImage(frameData, sx/scaleFactor, sy/scaleFactor, sWidth/scaleFactor, sHeight/scaleFactor, dx, dy, dWidth, dHeight);

      drawOverlay(dWidth, dHeight, scaleFactor);

      // A frame has been captured.
      var imageData = canvas.getImageData(overlayCoords.x, overlayCoords.y, overlayCoords.width, overlayCoords.height);
      
      if(self.onframe) self.onframe(imageData);

      coordinatesHaveChanged = false;
    };

    var drawOverlay = function(width, height) {
      var minLength = Math.min(width, height);
      var boxHeightSize = (height + 64 - minLength) / 2;
      var boxWidthSize = (width + 64 - minLength) / 2;

      if(coordinatesHaveChanged) {
        cameraOverlay.style.borderTopWidth = boxHeightSize + "px";
        cameraOverlay.style.borderLeftWidth = boxWidthSize + "px";
        cameraOverlay.style.borderRightWidth = boxWidthSize + "px";
        cameraOverlay.style.borderBottomWidth = boxHeightSize + "px";

        overlayCoords.x = boxWidthSize;
        overlayCoords.y = boxHeightSize
        overlayCoords.width = cameraCanvas.width - (boxWidthSize * 2);
        overlayCoords.height = cameraCanvas.height - (boxHeightSize * 2);

        coordinatesHaveChanged = false;
      }
    };

    var setupVariables = function(e) {

      if(cameraCanvas.width == window.innerWidth)
        return;
      
      var sourceDimensions = sourceManager.getDimensions();
      var sourceHeight = sourceDimensions.height;
      var sourceWidth = sourceDimensions.width;

      dWidth = cameraCanvas.width = window.innerWidth;
      dHeight = cameraCanvas.height = window.innerHeight; 
      dx = 0;
      dy = 0;

      sx = 0;
      sy = 0;

      // Make the video coordinate space the same as the window. 
      // size in the longest dimension.
      // Then center and clip. and map back to correct space.
      scaleX = (dWidth / sourceDimensions.width);
      scaleY = (dHeight / sourceHeight);
      scaleFactor = Math.max(scaleX, scaleY);

      // Trim the left
      sx = ((sourceWidth * scaleFactor) / 2) - (dWidth/ 2);
      sy = ((sourceHeight * scaleFactor) / 2) - (dHeight / 2);
     
      // Trim the right.
      sWidth = (sourceWidth * scaleFactor) - sx * 2;
      sHeight = (sourceHeight * scaleFactor) - sy * 2;

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
