import {BaseView} from './base.mjs';

export class FallbackView extends BaseView {
  constructor(element, onframeready) {
    super(element, onframeready);

    var uploadForm = this.root.querySelector('.CameraFallback-form');
    var inputElement = this.root.querySelector('.CameraFallback-input');
    var image = new Image();

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
  }
}
