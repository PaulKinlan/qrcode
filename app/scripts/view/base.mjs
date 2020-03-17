export class BaseView {
 
  constructor(root, onframeready) {
    this.root = document.querySelector(root);
    this.onframeready = onframeready;
    this.elements = {};
  }

  show() {
    this.root.classList.remove('hidden');
  }

  resize() { }

  onframeready(frameData) {
    this.onframeready(frameData)
  }

  onDimensionsChanged() {}
}