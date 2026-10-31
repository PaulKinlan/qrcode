/**
 * QRCodeHelpManager - Manages the About/Help dialog
 *
 * #about is a native <dialog> opened with showModal() (bead qrcode-319). The platform owns
 * the interaction contract this class used to hand-roll: Escape closes wherever focus is
 * (cancel event), Tab stays contained in the dialog, focus returns to the trigger on close,
 * and the autofocus Close button receives initial focus. Keeping the guards here is the only
 * logic left: showModal()/close() both throw on a double call.
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
   * Show the help dialog as a modal.
   */
  showDialog() {
    if (!this.root.open) {
      this.root.showModal();
    }
  }

  /**
   * Close the help dialog (native focus return hands focus back to the trigger).
   */
  closeDialog() {
    if (this.root.open) {
      this.root.close();
    }
  }
}
