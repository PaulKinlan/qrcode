/*!
 *
 *  Web Starter Kit
 *  Copyright 2014 Google Inc. All rights reserved.
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

  // Your custom JavaScript goes here

  var QRCodeCamera = function(element) {
    // Controls the Camera and the QRCode Module

    var cameraManager = new CameraManager('camera');
    var qrCodeManager = new QRCodeManager('qrcode');
    var processingFrame = false;

    cameraManager.onframe = function() {
      // There is a frame in the camera, what should we do with it?
      if(processingFrame == false) {
        processingFrame = true;
        var imageData = cameraManager.getImageData();
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
    var cavnas = document.getElementById("qr-canvas");
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
    var cameraToggleInput = cameraToggle.querySelector('.Camera-toggle-input');

    var canvas = cameraCanvas.getContext('2d');

    var cameras = [];

    this.getImageData = function() {
      return { 
        width: cameraCanvas.width,
        height: cameraCanvas.height,
        imageData: canvas.getImageData(0, 0, cameraCanvas.width, cameraCanvas.height)
      }
    };

    var captureFrame = function() {

      // Work out which part of the video to capture and apply to canvas.
      var dWidth = cameraCanvas.width = window.innerWidth;
      var dHeight = cameraCanvas.height = window.innerHeight; 
      var dx = 0;
      var dy = 0;

      var sx = 0;
      var sy = 0;
      var sHeight;
      var sWidth;

      // Make the video coordinate space the same as the window. 
      // size in the longest dimension.
      // Then center and clip. and map back to correct space.
      var scaleX = (dWidth / cameraVideo.videoWidth);
      var scaleY = (dHeight / cameraVideo.videoHeight);
      var scaleFactor = Math.max(scaleX, scaleY);

      // Trim the left
      sx = ((cameraVideo.videoWidth * scaleFactor) / 2) - (dWidth/ 2);
      sy = ((cameraVideo.videoHeight * scaleFactor) / 2) - (dHeight / 2);
     
      // Trim the right.
      sWidth = (cameraVideo.videoWidth * scaleFactor) - sx * 2;
      sHeight = (cameraVideo.videoHeight * scaleFactor) - sy * 2;

      canvas.drawImage(cameraVideo, sx /scaleFactor, sy/scaleFactor, sWidth/scaleFactor, sHeight/scaleFactor, dx, dy, dWidth, dHeight);

      // A frame has been captured.
      if(self.onframe) self.onframe();

      requestAnimationFrame(captureFrame.bind(self));
    };

    var getCamera = function(videoSource) {

      if(videoSource === undefined) {
        videoSource = cameras[0];
      }

      var gUM = navigator.getUserMedia || navigator.webkitGetUserMedia || null;
      gUM.call(navigator, { video: { optional: [{sourceId: videoSource}] } }, function(localStream) {
        
        cameraVideo.onloadeddata = function() {
          requestAnimationFrame(captureFrame.bind(self));
        };

        cameraVideo.src = window.URL.createObjectURL(localStream);
      }, function(error) {});
    };

    var getSources = function(cb) {
      cb = cb || function() {};

      MediaStreamTrack.getSources(function(sources) {
        for(var i = 0; i < sources.length; i++) {
          var source = sources[i];
          if(source.kind === 'video') {
            cameras.push(source.id);
          }
        }

        if(cameras.length == 1) {
          cameraToggle.style.display="none";
        }

        cb();
      });
    };

    cameraToggleInput.addEventListener('change', function() {
      // this is the input element, not the control
      if(this.checked === true) {
        getCamera(cameras[1]);
      } 
      else {
        getCamera(cameras[0]);
      }
    });

    // Init
    getSources(function() { getCamera(); });
  };

  window.addEventListener('load', function() {
    var camera = new QRCodeCamera();
  });
})();
