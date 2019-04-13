import { BaseView } from './base.mjs';


var CameraSource = function (videoElement) {
  var stream;
  var animationFrameId;
  var cameras = null;
  var self = this;
  var useMediaDevices = ('mediaDevices' in navigator
    && 'enumerateDevices' in navigator.mediaDevices
    && 'getUserMedia' in navigator.mediaDevices);
  var gUM = (navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia ||
    navigator.msGetUserMedia || null);
  var currentCamera = -1;

  this.stop = function () {
    currentCamera = -1;
    if (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
    }
  };

  this.getDimensions = function () {
    return {
      width: videoElement.videoWidth,
      height: videoElement.videoHeight
    };
  };

  // this method can be overwritten from outside
  this.onDimensionsChanged = function () { };

  this.getCameras = function (cb) {
    cb = cb || function () { };

    if ('enumerateDevices' in navigator.mediaDevices) {
      navigator.mediaDevices.enumerateDevices()
        .then(function (sources) {
          return sources.filter(function (source) {
            return source.kind == 'videoinput'
          });
        })
        .then(function (sources) {
          cameras = [];
          sources.forEach(function (source) {
            if (source.label.indexOf('facing back') >= 0) {
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
    else if ('getSources' in MediaStreamTrack) {
      MediaStreamTrack.getSources(function (sources) {
        cameras = [];
        for (var i = 0; i < sources.length; i++) {
          var source = sources[i];
          if (source.kind === 'video') {

            if (source.facing === 'environment') {
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

  this.setCamera = function (idx) {
    if (currentCamera === idx || cameras === null) {
      return;
    }
    currentCamera = idx;
    var params;
    var videoSource = cameras[idx];

    //Cancel any pending frame analysis
    cancelAnimationFrame(animationFrameId);

    if (videoSource === undefined && cameras.length == 0) {
      // Because we have no source information, have to assume it user facing.
      params = { video: true, audio: false };
    }
    else {
      params = { video: { deviceId: { exact: videoSource.deviceId || videoSource.id } }, audio: false };
    }

    let selectStream = function (cameraStream) {
      stream = cameraStream;

      videoElement.addEventListener('loadeddata', function (e) {
        var onframe = function () {
          if (videoElement.videoWidth > 0) self.onframeready(videoElement);
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
    }

    if (useMediaDevices) {
      navigator.mediaDevices.getUserMedia(params)
        .then(selectStream)
        .catch(console.error);
    }
    else {
      gUM.call(navigator, params, selectStream, console.error);
    }
  };
};

export class CameraView extends BaseView {

  constructor(element, onframeready) {
    super(element, onframeready);

    this.width = undefined; 
    this.height = undefined;

    this.elements['cameraToggleInput'] = this.root.querySelector('.Camera-toggle-input');
    this.elements['cameraToggle'] = this.root.querySelector('.Camera-toggle');
    this.elements['cameraVideo'] = this.root.querySelector('.Camera-video');

    this.source = new CameraSource(this.elements['cameraVideo']);

    this.source.onDimensionsChanged = function () {
      this.onDimensionsChanged();
      this.resize();
    }.bind(this);

    this.source.getCameras(function (cameras) {
      if (cameras.length <= 1) {
        this.elements['cameraToggle'].style.display = "none";
      }

      // Set the source
      this.source.setCamera(0);
    }.bind(this));

    this.source.onframeready = function (imageData) {
      // The Source has some data, we need to push it the controller.
      this.onframeready(imageData);
    }.bind(this);

    this.elements['cameraToggleInput'].addEventListener('change', function (e) {
      // this is the input element, not the control
      var cameraIdx = 0;

      if (e.target.checked === true) {
        cameraIdx = 1;
      }
      this.source.stop();
      this.source.setCamera(cameraIdx);
    });

    this.stop = function () {
      this.source.stop();
    };

    this.start = function () {
      var cameraIdx = 0;
      if (this.elements['cameraToggleInput'].checked === true) {
        cameraIdx = 1;
      }
      this.source.setCamera(cameraIdx);
    };

    // When using the web cam, we need to turn it off when we aren't using it
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        // Disconnect the camera.
        this.stop();
      }
      else {
        this.start();
      }
    }.bind(this));

  }

  resize(w, h) {
    if (w && h) {
      this.height = h;
      this.width = w;
    }

    const videoDimensions = this.getDimensions();
    this.elements['cameraVideo'].style.transform = 'translate(-50%, -50%) scale(' + videoDimensions.scaleFactor + ')';
  }

  getDimensions() {
    var dimensions = this.source.getDimensions();
    var heightRatio = dimensions.height / this.height;
    var widthRatio = dimensions.width / this.width;
    var scaleFactor = 1 / Math.min(heightRatio, widthRatio);
    dimensions.scaleFactor = Number.isFinite(scaleFactor) ? scaleFactor : 1;
    return dimensions;
  }
}
