# QR Snapper

QR Snapper is a simple, small, progressive web app that accesses the user's camera and looks for QR Codes.

The QR Code library is a port of [JSQRCode](https://github.com/LazarSoft/jsqrcode) and has been ported to work inside a Web Worker for performance.

## Features

QR Snapper offers a seamless QR code scanning experience directly in your browser. Key features include:

* **Real-time QR Code Scanning:** Instantly decode QR codes using your device's camera.
* **Cross-Platform Compatibility:** Tested and optimized for major browsers (Chrome, Firefox, Safari) and mobile devices.
* **x-callback-url support:** Allows other applications to receive the decoded QR code data.

## Build Instructions

To set up QR Snapper locally, follow these steps:

1.  **Prerequisites:**
    * Node.js (v18 or later)
    * npm (v9 or later)
2.  **Installation:**
    * Clone the repository: `git clone https://github.com/PaulKinlan/qrcode.git`
    * Navigate to the project directory: `cd qrcode`
    * Install dependencies: `npm install`
3.  **Development:**
    * Run the development server: `npm run dev`
    * Open your browser to `http://localhost:8080`
4.  **Production Build:**
    * Build for production: `npm run build`
    * Preview the production build: `npm run preview`
5.  **Potential Issues:**
    * Ensure your Node.js and npm versions meet the prerequisites.
    * Camera access may require browser permissions.
    * Use HTTPS in production for camera and service worker support.

## Getting Started (Quick Start)

To quickly test QR Snapper, follow these steps:

1.  **Clone or Fork the Repository:**

    * \*Note: This step requires an internet connection.\*
    * Clone the repository directly, or fork it and then clone your fork:
        ```bash
        git clone [https://github.com/PaulKinlan/qrcode.git](https://github.com/PaulKinlan/qrcode.git)
        ```
        or
        ```bash
        git clone [https://github.com/YOUR_USERNAME/qrcode.git](https://github.com/YOUR_USERNAME/qrcode.git)
        ```

2.  **Navigate to the Project Directory:**

    * Open a terminal and navigate to the `qrcode/` directory:
        ```bash
        cd qrcode
        ```

3.  **Install Dependencies:**

    * \*Note: This step requires an internet connection.\*
    * Run `npm install` to install the necessary dependencies (defined in `package.json`).

4.  **Open in Browser:**

    * Open `index.html` (or your main HTML file) in your web browser.

**Note:** For full functionality (including camera access and advanced build processes), you may need to grant camera permissions and ensure your browser supports the necessary APIs. Refer to the full build instructions for details about build processes.

## Code Architecture

To better understand the codebase, here's a breakdown of the key components:

### Modern Modular Structure

The application is now organized into focused, maintainable modules:

* **`scripts/main.js`:**
    * Main entry point (32 lines) - initializes the application
    * Much simpler than the previous 610-line monolithic file
    
* **`scripts/components/`:**
    * **`QRCodeCamera.js`** - Main application coordinator
    * **`camera/CameraManager.js`** - Manages canvas rendering and camera display
    * **`camera/CameraSource.js`** - Low-level camera API interface (modernized, no deprecated prefixes)
    * **`camera/WebCamManager.js`** - Real-time webcam handling with camera switching
    * **`camera/CameraFallbackManager.js`** - Image upload fallback when camera unavailable
    * **`dialogs/QRCodeManager.js`** - Result dialog with share/copy/navigate actions
    * **`dialogs/QRCodeCallbackController.js`** - x-callback-url integration
    * **`dialogs/QRCodeHelpManager.js`** - About/help dialog
    
* **`scripts/utils/`:**
    * **`url-utils.js`** - URL normalization and security validation
    
* **`scripts/qrclient.js`:**
    * Web Worker interface for QR code detection
    * Uses Comlink for seamless worker communication
    
* **`scripts/qrworker.js`:**
    * QR code detection worker implementation
    * Uses native BarcodeDetector API when available
    * Falls back to jsqrcode library polyfill
    
* **`scripts/jsqrcode/`:**
    * JSQRCode library for QR detection
    * Bundled from original source files

### Modern Web APIs

The application uses modern browser APIs:
* **getUserMedia** - No deprecated webkit/moz/ms prefixes
* **BarcodeDetector API** - Native QR detection when available
* **Web Share API** - Share detected URLs
* **Clipboard API** - Copy URLs to clipboard
* **Service Workers** - Offline support and caching

### Development Notes

* The project uses Vite as the build tool (replaced Gulp)
* Modern ES modules throughout
* No Babel transpilation needed for modern browsers
* Optimized production builds with Rollup under the hood

## Contributing

We welcome contributions to QR Snapper! Please follow these guidelines:

1.  **Reporting Issues:**
    * Use the GitHub issue tracker to report bugs or suggest feature requests.
2.  **Development Setup:**
    * Fork the repository and create a branch for your changes.
3.  **Coding Standards:**
    * Follow the existing code style and conventions.
4.  **Pull Requests:**
    * Submit pull requests with clear descriptions of your changes.
    * Ensure your code is tested and documented.

## License

This project is licensed under the Apache License 2.0
