/**
 * QRCodeHelpManager - Manages the About/Help dialog
 */
export class QRCodeHelpManager {
  constructor(element) {
    this.root = document.getElementById(element);
    this.qrhelpClose = this.root.querySelector('.QRCodeAboutDialog-close');

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.qrhelpClose.addEventListener('click', () => {
      this.closeDialog();
    });
  }

  /**
   * Show the help dialog
   */
  showDialog() {
    this.root.style.display = 'block';
  }

  /**
   * Close the help dialog
   */
  closeDialog() {
    this.root.style.display = 'none';
  }
}
