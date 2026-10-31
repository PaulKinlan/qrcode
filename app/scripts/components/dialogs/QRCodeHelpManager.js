/**
 * QRCodeHelpManager - Manages the About/Help dialog
 *
 * The dialog is keyboard-operable (bead qrcode-e4c): opening moves focus into it, Escape
 * closes it, and closing returns focus to the control that opened it (WCAG 2.1.1, 2.1.2,
 * 2.4.3). The trigger is captured in showDialog, not closedialog, so it survives the whole
 * interaction regardless of where the user focused in between.
 */
export class QRCodeHelpManager {
  constructor(element) {
    this.root = document.getElementById(element);
    this.qrhelpClose = this.root.querySelector('.QRCodeAboutDialog-close');
    this.returnFocusTo = null;

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.qrhelpClose.addEventListener('click', () => {
      this.closeDialog();
    });

    this.root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.closeDialog();
      }
    });
  }

  /**
   * Show the help dialog and move focus to its Close control.
   */
  showDialog() {
    // Capture the trigger only on the actual open, so a repeated showDialog while already
    // open cannot re-point focus return at the dialog's own Close button.
    if (this.root.style.display !== 'block') {
      this.returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    this.root.style.display = 'block';
    this.qrhelpClose.focus();
  }

  /**
   * Close the help dialog and hand focus back to the trigger.
   */
  closeDialog() {
    this.root.style.display = 'none';
    this.returnFocusTo?.focus();
    this.returnFocusTo = null;
  }
}
