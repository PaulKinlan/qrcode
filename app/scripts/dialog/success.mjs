export class QRCodeSuccessDialog {
  constructor(element) {
    const elements = this._elements = {};
    const root = elements['root'] = document.getElementById(element);
    elements['qrcodeData'] = root.querySelector(".QRCodeSuccessDialog-data");
    elements['qrcodeNavigate'] = root.querySelector(".QRCodeSuccessDialog-navigate");
    elements['qrcodeIgnore'] = root.querySelector(".QRCodeSuccessDialog-ignore");
    elements['qrcodeShare'] = root.querySelector(".QRCodeSuccessDialog-share");
    elements['qrcodeCopy'] = root.querySelector(".QRCodeSuccessDialog-copy");

    this.currentUrl = undefined;

    if (navigator.share) {
      // Sharing is supported so let's make the UI visible
      elements['qrcodeShare'].classList.remove('hidden');
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      elements['qrcodeCopy'].classList.remove('hidden');
    }

    elements['qrcodeIgnore'].addEventListener("click", function () {
      this.closeDialog();
    }.bind(this));

    elements['qrcodeShare'].addEventListener("click", function () {
      if (navigator.share) {
        navigator.share({
          title: this.currentUrl,
          text: this.currentUrl,
          url: this.currentUrl
        }).then(function () {
          this.closeDialog();
        }).catch(function () {
          this.closeDialog();
        })
      }

    }.bind(this));

    elements['qrcodeCopy'].addEventListener("click", function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(this.currentUrl)
          .then(this.closeDialog())
          .catch(this.closeDialog());
      }
      this.closeDialog();
    }.bind(this));

    elements['qrcodeNavigate'].addEventListener("click", function () {
      if (this.currentUrl.protocol === "javascript:") {
        console.log("XSS prevented!");
        return;
      }
      window.location = this.currentUrl;
      this.closeDialog();
    }.bind(this));
  }

  showDialog(normalizedUrl) {
    this._elements['root'].style.display = 'block';
    this._elements['qrcodeData'].innerText = normalizedUrl;
  }

  closeDialog() {
    this._elements['root'].style.display = 'none';
    this._elements['qrcodeData'].innerText = "";
  }
}