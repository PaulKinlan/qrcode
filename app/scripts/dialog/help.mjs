export class QRCodeHelpDialog {

  constructor(root) {
    const elements = this.elements = {};
    const rootElement = document.getElementById(root);
    elements['close'] = rootElement.querySelector(".QRCodeAboutDialog-close");

    elements['close'].addEventListener("click", function () {
      this.closeDialog();
    }.bind(this));
  }

  showDialog() {
    root.style.display = 'block';
  }

  closeDialog() {
    root.style.display = 'none';
  }
}