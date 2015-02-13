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
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
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


    cameraManager.onframe = function() {
      // There is a frame in the camera, what should we do with it?
 
      var imageData = cameraManager.getImageData();
      var detectedQRCode = qrCodeManager.detectQRCode(imageData, function(url) {
        if(url !== undefined) {
          qrCodeManager.showDialog(url);
        }
      });
    
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

  var CameraManager = function(element) {
    // The camera gets a video stream, and adds it to a canvas.
    // The canvas is analysed but also displayed to the user.
    // The video is never show

    var self = this;

    var cameraRoot = document.getElementById(element);
    var cameraVideo = cameraRoot.querySelector('.Camera-video');
    var cameraCanvas = cameraRoot.querySelector('.Camera-display');
    var cameraToggle = cameraRoot.querySelector('.Camera-toggle');
    var cameraOverlay = cameraRoot.querySelector('.Camera-overlay');
    var cameraToggleInput = cameraRoot.querySelector('.Camera-toggle-input');

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
    var coordinatesHaveChanged = false;
    var prevCoordinates = 0;
    // The camera stream.
    var localStream;

    var overlayCoords = { x:0, y: 0, width: cameraCanvas.width, height: cameraCanvas.height };

    this.getImageData = function() {
      // Only get the image data for what we will send to the detector.
      return canvas.getImageData(overlayCoords.x, overlayCoords.y, overlayCoords.width, overlayCoords.height);
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

      }
     
    };

    var setupVariables = function(e) {
      dWidth = cameraCanvas.width = window.innerWidth;
      dHeight = cameraCanvas.height = window.innerHeight; 
      dx = 0;
      dy = 0;

      sx = 0;
      sy = 0;

      // Make the video coordinate space the same as the window. 
      // size in the longest dimension.
      // Then center and clip. and map back to correct space.
      scaleX = (dWidth / cameraVideo.videoWidth);
      scaleY = (dHeight / cameraVideo.videoHeight);
      scaleFactor = Math.max(scaleX, scaleY);

      // Trim the left
      sx = ((cameraVideo.videoWidth * scaleFactor) / 2) - (dWidth/ 2);
      sy = ((cameraVideo.videoHeight * scaleFactor) / 2) - (dHeight / 2);
     
      // Trim the right.
      sWidth = (cameraVideo.videoWidth * scaleFactor) - sx * 2;
      sHeight = (cameraVideo.videoHeight * scaleFactor) - sy * 2;

      return (cameraVideo.videoWidth > 0);
    };

    var captureFrame = function() {

      // Work out which part of the video to capture and apply to canvas.
      canvas.drawImage(cameraVideo, sx /scaleFactor, sy/scaleFactor, sWidth/scaleFactor, sHeight/scaleFactor, dx, dy, dWidth, dHeight);

      drawOverlay(dWidth, dHeight, scaleFactor);

      // A frame has been captured.
      if(self.onframe) self.onframe();

      coordinatesHaveChanged = false;
    };

    var getCamera = function(videoSource, cb) {

      cb = cb || function() {};

      var gUM = (navigator.getUserMedia ||
                       navigator.webkitGetUserMedia ||
                       navigator.mozGetUserMedia ||
                       navigator.msGetUserMedia || null);

      var params;

      if(videoSource === undefined && cameras.length == 0) {
        // Because we have no source information, have to assume it user facing.
        params = { video: true }; 
      }
      else {
        params = { video: { optional: [{sourceId: videoSource.id}] } };
      }
  
      gUM.call(navigator, params, function(theStream) {
        localStream = theStream;
        
        cameraVideo.onloadeddata = function(e) {

          coordinatesHaveChanged = true;
          
          var isSetup = setupVariables(e);
          if(isSetup) {
            setInterval(captureFrame.bind(self), 4);
          }
          else {
            // This is just to get around the fact that the videoWidth is not
            // available in Firefox until sometime after the data has loaded.
            setTimeout(function() {
              setupVariables(e);

              setInterval(captureFrame.bind(self), 4);
            }, 100);
          }

          // The video is ready, and the camerea captured
          if(videoSource === undefined) {
            // There is no meta data about the camera, assume user facing.
            videoSource = { 
              'facing': 'user'
            };
          }

          cb(videoSource);
        };

        cameraVideo.src = window.URL.createObjectURL(localStream);
        cameraVideo.load();
        cameraVideo.play();
      }, function(error) {});
    };

    var getSources = function(cb) {
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

          if(cameras.length == 1) {
            cameraToggle.style.display="none";
          }

          cb();
        });
      }
      else {
        // We can't pick the correct camera because the API doesn't support it.
        cb();
      }
    };

    var toggleFacingState = function(camera) {
      var facing = camera.facing ? camera.facing : 'user';
      cameraRoot.classList.remove('Camera--facing-environment');
      cameraRoot.classList.remove('Camera--facing-user');
      cameraRoot.classList.add('Camera--facing-' + facing);
    };

    cameraToggleInput.addEventListener('change', function() {
      // this is the input element, not the control
      var cameraIdx = 0;

      if(this.checked === true) {
        cameraIdx = 1;
      }

      getCamera(cameras[cameraIdx], toggleFacingState);

    });

    window.addEventListener('resize', function() {
      coordinatesHaveChanged = true;
      setupVariables();
    }.bind(this));

    document.addEventListener('visibilitychange', function(e) {
      if(document.visibilityState === 'hidden') {
        // Disconnect the camera.
        if(localStream !== undefined) {
          localStream.stop();
          localStream = undefined;
        }
      }
      else {
        var cameraIdx = 0;

        if(this.checked === true) {
          cameraIdx = 1;
        }

        getCamera(cameras[cameraIdx], toggleFacingState);
      }
    });

    // Init
    getSources(function() { 
      // On first run, select the first camera.
      getCamera(cameras[0], toggleFacingState);
    });

  };

  window.addEventListener('load', function() {
    var camera = new QRCodeCamera();
  });
})();
