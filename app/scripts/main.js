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

  var CameraManager = function(element) {
    // The camera gets a video stream, and adds it to a canvas.
    // The canvas is analysed but also displayed to the user.
    // The video is never show

    var cameraRoot = document.getElementById(element);
    var cameraVideo = cameraRoot.querySelector('.Camera-video');
    var cameraCanvas = cameraRoot.querySelector('.Camera-display');
    var cameraToggle = cameraRoot.querySelector('.Camera-toggle');
    var cameraToggleInput = cameraToggle.querySelector('.Camera-toggle-input');
    var canvas = cameraCanvas.getContext('2d');

    var cameras = [];

    var captureFrame = function() {

      // Work out which part of the video to capture and apply to canvas.

      cameraCanvas.width = window.innerWidth;
      cameraCanvas.height = window.innerHeight; 

      var sx = 0;
      var sy = 0;
      var sHeight;
      var sWidth;

      // Make the video coordinate space the same as the window. 
      // size in the longest dimension.
      // Then center and clip. and map back to correct space.
      var scaleX = (window.innerWidth / cameraVideo.videoWidth);
      var scaleY = (window.innerHeight / cameraVideo.videoHeight);
      var scaleFactor = Math.max(scaleX, scaleY);

      // Trim the left
      sx = ((cameraVideo.videoWidth * scaleFactor) / 2) - (window.innerWidth / 2);
      sy = ((cameraVideo.videoHeight * scaleFactor) / 2) - (window.innerHeight / 2);
     
      // Trim the right.
      sWidth = (cameraVideo.videoWidth * scaleFactor) - sx * 2;
      sHeight = (cameraVideo.videoHeight * scaleFactor) - sy * 2;

      var dx = 0;
      var dy = 0;
      var dHeight = window.innerHeight;
      var dWidth = window.innerWidth;

      canvas.drawImage(cameraVideo, sx / scaleFactor, sy/ scaleFactor, sWidth/ scaleFactor, sHeight/ scaleFactor, dx, dy, dWidth, dHeight);

      requestAnimationFrame(captureFrame);
    };

    var getCamera = function(videoSource) {

      if(videoSource === undefined) {
        videoSource = cameras[0];
      }

      var gUM = navigator.getUserMedia || navigator.webkitGetUserMedia || null;
      gUM.call(navigator, { video: { optional: [{sourceId: videoSource}] } }, function(localStream) {
        
        cameraVideo.onloadeddata = function() {
          requestAnimationFrame(captureFrame);
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
      if(cameraToggle.checked === true) {
        getCamera(cameras[1]);
      } 
      else {
        getCamera(cameras[0]);
      }
    });

    // Init
    getSources(function() { getCamera(); });
  };

  var cameraManager;

  window.addEventListener('load', function() {
    cameraManager = new CameraManager('camera');
  });
})();
