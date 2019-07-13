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

import { decode } from './qrclient.js';
import { QRCodeHelpDialog as HelpDialog } from './dialog/help.mjs';
import { QRCodeSuccessDialog as SuccessDialog } from './dialog/success.mjs';
import { FallbackView } from './view/fallback.mjs';
import { CameraView } from './view/camera.mjs';

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




(function() {
  'use strict';


  // This is the App.
  var QRCodeCamera = function(element) {
    // Controls the Camera and the QRCode Module
  
    var cameraManager = new CameraManager('camera');
    var successDialog = new SuccessDialog('qrcode');
    var helpDialog = new HelpDialog('about');
    var helpButton = document.querySelector('.about');

    helpButton.onclick = function() {
      helpDialog.showDialog();
    };

    var detectQRCode = async function(context) {
      let result = await decode(context);
      let normalizedUrl;
      if(result !== undefined) {
        normalizedUrl = normalizeUrl(result);
      }
      return normalizedUrl;
    };

    var processingFrame = false;

    cameraManager.onframe = async function(context) {
      // There is a frame in the camera, what should we do with it?
      if(processingFrame == false) {
        processingFrame = true;
        let url = await detectQRCode(context);
        processingFrame = false;
        if(url === undefined) return;
        if('ga' in window) ga('send', 'event', 'urlfound');
        if('vibrate' in navigator) navigator.vibrate([200]);
        
        successDialog.showDialog(url);
      }
    };
  };

  
  
 

  // This is really the Controller.
  var CameraManager = function(element) {
    // The camera gets a video stream, and adds it to a canvas.
    // The canvas is analysed but also displayed to the user.
    var self = this;
    var debug = false;
    var gUMPresent = ((navigator.mediaDevices ||
                      navigator.getUserMedia ||
                      navigator.webkitGetUserMedia ||
                      navigator.mozGetUserMedia ||
                      navigator.msGetUserMedia) !== null);

    if(location.hash == "#nogum") gUMPresent = false;
    if(location.hash == "#canvasdebug") debug = true;

    var root = document.getElementById(element);
    var sourceManager;

    let onframeready = function(frameData) {
      // Work out which part of the video to capture and apply to canvas.
      context.drawImage(frameData, sx, sy, sWidth, sHeight, 0, 0, dWidth, dHeight);
      if(self.onframe) self.onframe(context);
    };

    // Where are we getting the data from
    if(gUMPresent === false) {
      sourceManager = new FallbackView('.CameraFallback', onframeready);
    }
    else {
      sourceManager = new CameraView('.CameraRealtime', onframeready);
    }

    sourceManager.show();

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

    // Abstract the Overlay as a UI component

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
